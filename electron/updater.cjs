// Mises à jour automatiques depuis les versions publiées sur GitHub (dépôt public, aucune clé).
// - Windows : electron-updater (téléchargement en arrière-plan, installation au redémarrage).
// - Mac (sans certificat Apple) : téléchargement du .zip de la nouvelle version, remplacement de
//   l'application après un clic, puis relance. Rien à faire dans le Terminal.
// Le dépôt est lu dans package.json (build.publish).
const { app, shell } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFile } = require('child_process');

let send = () => {};
let state = { state: 'idle', current: app.getVersion() };
let latest = null; // { version, notes, url, zip }
let winUpdater = null;

function repo() {
  try {
    const pkg = require(path.join(app.getAppPath(), 'package.json'));
    const p = [].concat((pkg.build && pkg.build.publish) || [])[0] || {};
    if (p.provider === 'github' && p.owner && p.repo && !/^OWNER$/i.test(p.owner)) return { owner: p.owner, repo: p.repo };
  } catch { /* package.json illisible */ }
  return null;
}

const set = (s) => { state = { ...state, ...s, current: app.getVersion() }; send(state); };
const NOT_CONFIGURED = "Les mises à jour automatiques ne sont pas encore activées : il faut d'abord publier le logiciel sur GitHub.";

/** Message court et compréhensible (jamais la réponse brute de GitHub). */
function friendly(e) {
  const m = String((e && e.message) || e || '');
  if (/\b404\b/.test(m)) return "Aucune version publiée sur GitHub pour l'instant.";
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|net::ERR_|getaddrinfo|network/i.test(m)) return 'Pas de connexion à internet : nouvel essai plus tard.';
  if (/\b(403|429)\b|rate limit/i.test(m)) return 'GitHub limite les vérifications pour le moment : nouvel essai plus tard.';
  return `Mise à jour impossible : ${m.split('\n')[0].slice(0, 160)}`;
}
const newer = (a, b) => {
  const x = String(a).replace(/^v/, '').split('.').map(Number);
  const y = String(b).replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); }
  return false;
};

async function latestRelease() {
  const r = repo();
  if (!r) throw new Error("Les mises à jour ne sont pas encore configurées (dépôt GitHub manquant dans package.json).");
  const res = await fetch(`https://api.github.com/repos/${r.owner}/${r.repo}/releases/latest`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': app.getName() } });
  if (res.status === 404) return null; // aucune version publiée
  if (!res.ok) throw new Error(`GitHub ne répond pas (${res.status}). Réessaie plus tard.`);
  const j = await res.json();
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  const zips = (j.assets || []).filter((a) => /\.zip$/i.test(a.name) && /mac/i.test(a.name));
  const zip = zips.find((a) => a.name.includes(arch)) || (arch === 'x64' ? zips.find((a) => !/arm64/i.test(a.name)) : null);
  return { version: String(j.tag_name || '').replace(/^v/, ''), notes: j.body || '', url: j.html_url, zip: zip ? { url: zip.browser_download_url, size: zip.size, name: zip.name } : null };
}

// ---------- Windows : electron-updater
function setupWindows() {
  try { winUpdater = require('electron-updater').autoUpdater; } catch { winUpdater = null; return; }
  winUpdater.autoDownload = true;
  winUpdater.autoInstallOnAppQuit = true;
  winUpdater.on('checking-for-update', () => set({ state: 'checking' }));
  winUpdater.on('update-not-available', () => set({ state: 'uptodate', checkedAt: Date.now() }));
  winUpdater.on('update-available', (i) => set({ state: 'downloading', version: i.version, percent: 0 }));
  winUpdater.on('download-progress', (p) => set({ state: 'downloading', percent: Math.round(p.percent || 0) }));
  winUpdater.on('update-downloaded', (i) => set({ state: 'ready', version: i.version, checkedAt: Date.now() }));
  winUpdater.on('error', (e) => set({ state: 'error', error: friendly(e) }));
}

// ---------- Mac : téléchargement du .zip puis remplacement de l'application
const bundlePath = () => path.resolve(app.getPath('exe'), '..', '..', '..'); // …/Ortho Revision.app

async function download(url, file, total) {
  const res = await fetch(url, { headers: { 'User-Agent': app.getName() } });
  if (!res.ok || !res.body) throw new Error(`Téléchargement impossible (${res.status}).`);
  const out = fs.createWriteStream(file);
  const reader = res.body.getReader();
  let got = 0;
  const size = Number(res.headers.get('content-length')) || total || 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    got += value.length;
    if (!out.write(Buffer.from(value))) await new Promise((r) => out.once('drain', r));
    if (size) set({ state: 'downloading', percent: Math.min(99, Math.round((got / size) * 100)) });
  }
  await new Promise((r, j) => { out.end(r); out.on('error', j); });
}

async function installMac() {
  if (!latest || !latest.zip) throw new Error('Aucun fichier pour Mac dans cette version.');
  const app0 = bundlePath();
  if (!/\.app$/.test(app0)) throw new Error("Le logiciel n'est pas lancé depuis une application installée.");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maj-'));
  const zip = path.join(tmp, latest.zip.name);
  set({ state: 'downloading', version: latest.version, percent: 0 });
  await download(latest.zip.url, zip, latest.zip.size);
  await new Promise((res, rej) => execFile('/usr/bin/ditto', ['-x', '-k', zip, path.join(tmp, 'app')], (e) => (e ? rej(e) : res())));
  const found = fs.readdirSync(path.join(tmp, 'app')).find((f) => f.endsWith('.app'));
  if (!found) throw new Error('Archive de mise à jour incomplète.');
  const fresh = path.join(tmp, 'app', found);
  try { fs.accessSync(path.dirname(app0), fs.constants.W_OK); } catch {
    shell.showItemInFolder(fresh);
    throw new Error(`Le dossier « ${path.dirname(app0)} » est protégé : la nouvelle version est dans la fenêtre du Finder qui vient de s'ouvrir, glisse-la à la place de l'ancienne.`);
  }
  const script = path.join(tmp, 'remplacer.sh');
  fs.writeFileSync(script, [
    '#!/bin/sh',
    'APP="$1"; NEW="$2"; PID="$3"',
    'while kill -0 "$PID" 2>/dev/null; do sleep 0.5; done',
    'rm -rf "$APP.ancien"',
    'if mv "$APP" "$APP.ancien" && mv "$NEW" "$APP"; then rm -rf "$APP.ancien"; else [ -d "$APP" ] || mv "$APP.ancien" "$APP"; fi',
    'xattr -dr com.apple.quarantine "$APP" 2>/dev/null',
    'open "$APP"',
  ].join('\n'), { mode: 0o755 });
  set({ state: 'installing', version: latest.version });
  spawn('/bin/sh', [script, app0, fresh, String(process.pid)], { detached: true, stdio: 'ignore' }).unref();
  setTimeout(() => app.quit(), 300);
}

// ---------- commun
async function check() {
  if (!app.isPackaged) { set({ state: 'dev' }); return state; }
  if (!repo()) { set({ state: 'notconfigured', error: '' }); return state; } // dépôt GitHub pas encore renseigné
  if (process.platform === 'win32' && winUpdater) {
    try { await winUpdater.checkForUpdates(); } catch (e) { set({ state: 'error', error: friendly(e) }); }
    return state;
  }
  set({ state: 'checking' });
  try {
    latest = await latestRelease();
    if (latest && newer(latest.version, app.getVersion())) set({ state: 'available', version: latest.version, notes: latest.notes.slice(0, 1500), url: latest.url, canInstall: process.platform === 'darwin' && !!latest.zip });
    else set({ state: 'uptodate', checkedAt: Date.now() });
  } catch (e) { set({ state: 'error', error: friendly(e) }); }
  return state;
}

async function install() {
  try {
    if (process.platform === 'win32' && winUpdater && state.state === 'ready') { setImmediate(() => winUpdater.quitAndInstall(false, true)); return { ok: true }; }
    if (process.platform === 'darwin' && latest && latest.zip) { await installMac(); return { ok: true }; }
    if (latest && latest.url) shell.openExternal(latest.url);
    return { ok: true };
  } catch (e) { set({ state: 'error', error: friendly(e) }); return { ok: false, error: friendly(e) }; }
}

function init(sender) {
  send = sender;
  if (process.platform === 'win32') setupWindows();
  // Première vérification quelques secondes après le démarrage, puis toutes les 6 heures
  setTimeout(() => check(), 8000).unref?.();
  setInterval(() => check(), 6 * 3600 * 1000).unref?.();
}

module.exports = { init, check, install, status: () => ({ ...state, repo: repo() }), NOT_CONFIGURED };
