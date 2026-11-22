// Accès aux cours et aux podcasts depuis le téléphone (même Wi-Fi, ou partout avec Tailscale).
// Adresse fixe + jeton gardé dans la configuration : le lien enregistré sur le téléphone reste valable.
// Le serveur ne garde aucune copie des cours : chaque demande est posée au logiciel (ask), donc toujours à jour.
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const libraryPage = require('./libraryPage.cjs');

const DEFAULT_PORT = 47821;
let server = null;
let cfg = null; // { token, port, podcastDir, appName, ask }

const isTailscale = (ip) => { const [a, b] = ip.split('.').map(Number); return a === 100 && b >= 64 && b <= 127; };

/** Adresses utiles : réseau local (Wi-Fi) et Tailscale. */
function addresses() {
  const lan = [];
  let tailscale = null;
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) {
      if ((a.family !== 'IPv4' && a.family !== 4) || a.internal) continue;
      if (isTailscale(a.address)) { tailscale = tailscale || a.address; continue; }
      let score = 0;
      if (/^192\.168\./.test(a.address)) score += 3;
      else if (/^10\./.test(a.address)) score += 2;
      else if (/^172\.(1[6-9]|2\d|3[01])\./.test(a.address)) score += 1;
      if (/^(en|wl|wi-?fi|eth)/i.test(name)) score += 1;
      if (/vmnet|vbox|docker|utun|virtual|vEthernet|tailscale/i.test(name)) score -= 5;
      lan.push({ address: a.address, score });
    }
  }
  lan.sort((x, y) => y.score - x.score);
  return { lan: lan[0] ? lan[0].address : null, tailscale, host: os.hostname().toLowerCase() };
}

function sameToken(a) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(cfg.token || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

const safeId = (id) => /^[\w-]{1,80}$/.test(String(id || ''));

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(data));
}

/** Envoie un MP3 en gérant les requêtes partielles (avance rapide dans le lecteur du téléphone). */
function sendAudio(req, res, file, downloadName) {
  let st;
  try { st = fs.statSync(file); } catch { res.writeHead(404); return res.end(); }
  const headers = { 'Content-Type': 'audio/mpeg', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  if (downloadName) headers['Content-Disposition'] = `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`;
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  if (m) {
    let start = m[1] === '' ? st.size - Number(m[2]) : Number(m[1]);
    let end = m[1] !== '' && m[2] !== '' ? Number(m[2]) : st.size - 1;
    if (Number.isNaN(start) || start < 0) start = 0;
    if (end >= st.size) end = st.size - 1;
    if (start > end) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return res.end(); }
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...headers, 'Content-Length': st.size });
  fs.createReadStream(file).pipe(res);
}

function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
  if (!sameToken(url.searchParams.get('t'))) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end("Accès refusé : ouvre le lien affiché dans Réglages › Téléphone (il a peut-être été changé).");
  }
  if (req.method !== 'GET') { res.writeHead(405); return res.end(); }
  const t = encodeURIComponent(cfg.token);
  if (url.pathname === '/') {
    const nonce = crypto.randomBytes(12).toString('base64');
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src 'self' data:; media-src 'self'; connect-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'none'`,
    });
    return res.end(libraryPage({ token: cfg.token, appName: cfg.appName, nonce }));
  }
  if (url.pathname === '/manifest.json') {
    res.writeHead(200, { 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ name: cfg.appName, short_name: cfg.appName.split(' ')[0], start_url: `/?t=${t}`, display: 'standalone', background_color: '#f6f6fb', theme_color: '#5b5bd6', lang: 'fr' }));
  }
  if (url.pathname === '/api/library') {
    return cfg.ask('list', {}).then((data) => json(res, 200, data), (e) => json(res, 503, { error: e.message }));
  }
  if (url.pathname === '/api/course') {
    const id = url.searchParams.get('id');
    if (!safeId(id)) return json(res, 400, { error: 'Cours inconnu.' });
    return cfg.ask('course', { id }).then((data) => (data ? json(res, 200, data) : json(res, 404, { error: 'Cours introuvable.' })), (e) => json(res, 503, { error: e.message }));
  }
  if (url.pathname === '/podcast') {
    const id = url.searchParams.get('id');
    if (!safeId(id)) { res.writeHead(400); return res.end(); }
    const name = url.searchParams.get('dl') ? `${String(url.searchParams.get('name') || 'podcast').replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 80)}.mp3` : null;
    return sendAudio(req, res, path.join(cfg.podcastDir, `${id}.mp3`), name);
  }
  res.writeHead(404); res.end();
}

function listen(port) {
  return new Promise((resolve, reject) => {
    const s = http.createServer(handler);
    s.once('error', reject);
    s.listen(port, '0.0.0.0', () => resolve(s));
  });
}

/** Démarre (ou redémarre) l'accès. Renvoie { port, token, ...adresses }. */
async function start(options) {
  stop();
  cfg = { ...options, token: options.token || crypto.randomBytes(18).toString('hex') };
  try { server = await listen(cfg.port || DEFAULT_PORT); }
  catch (err) {
    if (err.code !== 'EADDRINUSE') throw err;
    server = await listen(0); // port déjà pris : un autre au hasard (le lien change, il est réaffiché dans Réglages)
  }
  cfg.port = server.address().port;
  return status();
}

function stop() {
  if (server) { try { server.close(); } catch { /* déjà fermé */ } }
  server = null;
}

function status() {
  if (!server || !cfg) return { running: false };
  const a = addresses();
  const link = (host) => (host ? `http://${host}:${cfg.port}/?t=${cfg.token}` : null);
  return { running: true, port: cfg.port, token: cfg.token, lan: link(a.lan), tailscale: link(a.tailscale), tailscaleHost: a.tailscale ? link(a.host) : null };
}

module.exports = { start, stop, status, addresses, DEFAULT_PORT };
