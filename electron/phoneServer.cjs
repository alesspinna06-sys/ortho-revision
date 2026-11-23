// Mini serveur local (Wi-Fi) pour recevoir les photos prises au téléphone,
// et pour réviser les flashcards sur le téléphone.
// Le téléphone scanne le QR code -> ouvre une page web -> envoie les photos.
// Accès protégé par un jeton aléatoire inclus dans le QR code.
const http = require('http');
const os = require('os');
const crypto = require('crypto');
const mobilePage = require('./mobilePage.cjs');
const reviewPage = require('./reviewPage.cjs');

const MAX_BYTES = 30 * 1024 * 1024;
let server = null;
let token = null;
let info = null;
let review = null; // { title, cards, ids:Set, onGrade }

/** Ouvre une séance de révision (cartes envoyées par l'ordinateur). */
function setReview({ title, cards }, onGrade) {
  review = { title: String(title || 'Flashcards'), cards, ids: new Set(cards.map((c) => c.id)), onGrade };
}
function clearReview() { review = null; }

function lanAddress() {
  const candidates = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family !== 'IPv4' && a.family !== 4) continue;
      if (a.internal) continue;
      let score = 0;
      if (/^192\.168\./.test(a.address)) score += 3;
      else if (/^10\./.test(a.address)) score += 2;
      else if (/^172\.(1[6-9]|2\d|3[01])\./.test(a.address)) score += 1;
      if (/^(en|wl|wi-?fi|eth)/i.test(name)) score += 1;
      if (/vmnet|vbox|docker|utun|virtual|vEthernet/i.test(name)) score -= 5;
      candidates.push({ address: a.address, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] ? candidates[0].address : null;
}

function start(onFile) {
  if (server && info) return Promise.resolve(info);
  const ip = lanAddress();
  if (!ip) return Promise.reject(new Error("Aucun réseau Wi-Fi détecté. Connecte l'ordinateur au même Wi-Fi que le téléphone."));
  token = crypto.randomBytes(12).toString('hex');

  server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.searchParams.get('t') !== token) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Accès refusé : rescanne le QR code affiché dans l’application.');
    }
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(mobilePage(token));
    }
    if (req.method === 'GET' && url.pathname === '/review') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(reviewPage(token));
    }
    if (req.method === 'GET' && url.pathname === '/api/review') {
      if (!review) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify({ title: review.title, cards: review.cards }));
    }
    if (req.method === 'POST' && url.pathname === '/api/grade') {
      let body = '';
      req.on('data', (c) => { body += c; if (body.length > 10000) req.destroy(); });
      req.on('end', () => {
        if (!review) { res.writeHead(410); return res.end(); }
        let item = null;
        try { item = JSON.parse(body); } catch {}
        const grade = item && Number(item.grade);
        if (!item || !review.ids.has(item.id) || ![0, 1, 2, 3].includes(grade)) { res.writeHead(400); return res.end(); }
        review.onGrade({ id: item.id, grade });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/upload') {
      const chunks = [];
      let size = 0;
      req.on('data', (c) => {
        size += c.length;
        if (size > MAX_BYTES) { res.writeHead(413); res.end('Fichier trop lourd'); req.destroy(); return; }
        chunks.push(c);
      });
      req.on('end', () => {
        if (res.writableEnded) return;
        const type = String(req.headers['content-type'] || 'image/jpeg').split(';')[0];
        if (!/^image\//.test(type) && type !== 'application/pdf') {
          res.writeHead(415); return res.end('Type non supporté');
        }
        let name = 'photo.jpg';
        try { name = decodeURIComponent(String(req.headers['x-filename'] || name)); } catch {}
        onFile({ name, type, data: new Uint8Array(Buffer.concat(chunks)) });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      });
      return;
    }
    res.writeHead(404); res.end();
  });

  return new Promise((resolve, reject) => {
    server.once('error', (err) => { server = null; reject(err); });
    server.listen(0, '0.0.0.0', () => {
      const { port } = server.address();
      info = { url: `http://${ip}:${port}/?t=${token}`, reviewUrl: `http://${ip}:${port}/review?t=${token}`, ip, port };
      resolve(info);
    });
  });
}

function stop() {
  if (server) { try { server.close(); } catch {} }
  server = null; info = null; token = null; review = null;
}

module.exports = { start, stop, setReview, clearReview };
