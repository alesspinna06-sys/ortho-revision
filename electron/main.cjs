// Processus principal Electron — fenêtre, sécurité, clé API, pont IPC.
const { app, BrowserWindow, ipcMain, shell, nativeTheme, safeStorage, dialog, Menu, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const gemini = require('./gemini.cjs');
const eleven = require('./eleven.cjs');
const azure = require('./azure.cjs');
const podcast = require('./podcast.cjs');
const libraryServer = require('./libraryServer.cjs');
const updater = require('./updater.cjs');
const crypto = require('crypto');
const phoneServer = require('./phoneServer.cjs');

const isMac = process.platform === 'darwin';
const isWin = process.platform === 'win32';
const DEV_URL = process.env.VITE_DEV_SERVER_URL;

// Le nom technique de l'app est sans accent (un accent dans le chemin du .app
// fait planter Electron au démarrage sur macOS). On garde le dossier de données
// "Ortho Révision" pour retrouver les cours déjà créés avec `npm start`.
app.setPath('userData', path.join(app.getPath('appData'), 'Ortho Révision'));

if (!app.requestSingleInstanceLock()) app.quit();

let win = null;

// --- Stockage de la clé API (chiffrée par le trousseau macOS / DPAPI Windows) --
const configPath = () => path.join(app.getPath('userData'), 'config.json');

function readConfig() {
  try { return JSON.parse(fs.readFileSync(configPath(), 'utf8')); } catch { return {}; }
}
function writeConfig(cfg) {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2));
}
function getApiKey() {
  // Priorité : variable d'environnement GEMINI_API_KEY (pratique en dev), puis clé enregistrée.
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY.trim();
  const cfg = readConfig();
  if (!cfg.apiKey) return '';
  try {
    if (cfg.encrypted && safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(Buffer.from(cfg.apiKey, 'base64'));
    }
    return Buffer.from(cfg.apiKey, 'base64').toString('utf8');
  } catch { return ''; }
}
function setApiKey(key) {
  const cfg = readConfig();
  if (!key) { delete cfg.apiKey; delete cfg.encrypted; writeConfig(cfg); return; }
  const canEncrypt = safeStorage.isEncryptionAvailable();
  cfg.apiKey = canEncrypt
    ? safeStorage.encryptString(key.trim()).toString('base64')
    : Buffer.from(key.trim(), 'utf8').toString('base64');
  cfg.encrypted = canEncrypt;
  writeConfig(cfg);
}

// Clé ElevenLabs (voix), chiffrée de la même façon que la clé Gemini
function getElevenKey() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY.trim();
  const cfg = readConfig();
  if (!cfg.elevenKey) return '';
  try {
    if (cfg.elevenEncrypted && safeStorage.isEncryptionAvailable()) return safeStorage.decryptString(Buffer.from(cfg.elevenKey, 'base64'));
    return Buffer.from(cfg.elevenKey, 'base64').toString('utf8');
  } catch { return ''; }
}
function setElevenKey(key) {
  const cfg = readConfig();
  if (!key) { delete cfg.elevenKey; delete cfg.elevenEncrypted; writeConfig(cfg); return; }
  const canEncrypt = safeStorage.isEncryptionAvailable();
  cfg.elevenKey = canEncrypt ? safeStorage.encryptString(key.trim()).toString('base64') : Buffer.from(key.trim(), 'utf8').toString('base64');
  cfg.elevenEncrypted = canEncrypt;
  writeConfig(cfg);
}
const ttsCacheDir = () => path.join(app.getPath('userData'), 'voix');

// Clé Azure Speech + région, chiffrées de la même façon
function getAzureCred() {
  const cfg = readConfig();
  const region = process.env.AZURE_SPEECH_REGION || cfg.azureRegion || 'westeurope';
  if (process.env.AZURE_SPEECH_KEY) return { key: process.env.AZURE_SPEECH_KEY.trim(), region };
  if (!cfg.azureKey) return { key: '', region };
  try {
    const key = cfg.azureEncrypted && safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(Buffer.from(cfg.azureKey, 'base64')) : Buffer.from(cfg.azureKey, 'base64').toString('utf8');
    return { key, region };
  } catch { return { key: '', region }; }
}
function setAzureKey(key, region) {
  const cfg = readConfig();
  if (region) cfg.azureRegion = String(region).trim().toLowerCase();
  if (key === '') { delete cfg.azureKey; delete cfg.azureEncrypted; }
  else if (key) {
    const canEncrypt = safeStorage.isEncryptionAvailable();
    cfg.azureKey = canEncrypt ? safeStorage.encryptString(key.trim()).toString('base64') : Buffer.from(key.trim(), 'utf8').toString('base64');
    cfg.azureEncrypted = canEncrypt;
  }
  writeConfig(cfg);
}
const monthKey = () => new Date().toISOString().slice(0, 7);
function azureUsage() {
  const u = readConfig().azureUsage || {};
  return { month: monthKey(), chars: u.month === monthKey() ? u.chars || 0 : 0, limit: 500000 };
}
function countAzure(n) {
  if (!n) return;
  const cfg = readConfig();
  const u = cfg.azureUsage && cfg.azureUsage.month === monthKey() ? cfg.azureUsage : { month: monthKey(), chars: 0 };
  u.chars += n;
  cfg.azureUsage = u;
  writeConfig(cfg);
}
async function azureSpeak(req) {
  const r = await azure.speak(getAzureCred(), req || {}, ttsCacheDir());
  countAzure(r.chars);
  return r;
}

// --- Fenêtre ------------------------------------------------------------------
function overlayColors() {
  const dark = nativeTheme.shouldUseDarkColors;
  return { color: dark ? '#0b0c12' : '#f3f4f8', symbolColor: dark ? '#a4a9bd' : '#4b5063', height: 44 };
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0b0c12' : '#f3f4f8',
    titleBarStyle: isMac ? 'hiddenInset' : isWin ? 'hidden' : 'default',
    trafficLightPosition: { x: 18, y: 18 },
    titleBarOverlay: isWin ? overlayColors() : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: true,
    },
  });

  win.once('ready-to-show', () => win.show());
  // Filet de sécurité : si le premier affichage n'arrive pas, la fenêtre s'ouvre quand même
  // (sinon le logiciel reste invisible en arrière-plan et bloque les lancements suivants).
  win.webContents.once('did-finish-load', () => { if (win && !win.isVisible()) win.show(); });
  // GPU actif et rien d'affiché au bout de 7 s : on redémarre sans GPU ; sinon on montre la fenêtre quand même
  setTimeout(() => {
    if (!win || win.isDestroyed() || win.isVisible()) return;
    if (!gpuOff) fallbackToCpu('fenêtre non affichée');
    else win.show();
  }, gpuOff ? 4000 : 7000);
  // Un plantage de l'affichage est signalé (et noté dans « journal.txt » du dossier de données) au lieu d'un écran figé
  const logLine = (msg) => { try { fs.appendFileSync(path.join(app.getPath('userData'), 'journal.txt'), `${new Date().toISOString()} ${msg}\n`); } catch { /* */ } };
  win.webContents.on('render-process-gone', (_e, d) => {
    logLine(`affichage arrêté : ${d.reason} (${d.exitCode})`);
    if (d.reason !== 'clean-exit' && win && !win.isDestroyed()) {
      dialog.showMessageBox(win, { type: 'error', message: "L'affichage du logiciel s'est arrêté.", detail: `Motif : ${d.reason}. Le logiciel va se recharger.`, buttons: ['Recharger'] })
        .then(() => { if (win && !win.isDestroyed()) win.reload(); });
    }
  });
  win.webContents.on('did-fail-load', (_e, code, desc) => logLine(`chargement impossible : ${code} ${desc}`));

  // Liens externes -> navigateur par défaut ; aucune nouvelle fenêtre Electron.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    const allowed = DEV_URL ? url.startsWith(DEV_URL) : url.startsWith('file://');
    if (!allowed) { e.preventDefault(); if (/^https?:\/\//.test(url)) shell.openExternal(url); }
  });

  if (DEV_URL) win.loadURL(DEV_URL);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  win.on('closed', () => { win = null; phoneServer.stop(); });
}

// --- IPC ----------------------------------------------------------------------
// --- Pont vers Claude (claude.ai, avec le compte de l'utilisatrice) ------------------------
// Fenêtre séparée, session à part (« persist:claude ») pour rester connectée d'une fois sur l'autre.
// Elle n'a aucun accès au logiciel : les demandes et les réponses passent par le presse-papiers.
let claudeWin = null;
ipcMain.handle('claude:open', () => {
  // Chaque demande part dans une nouvelle conversation (la connexion au compte est gardée)
  if (claudeWin && !claudeWin.isDestroyed()) { claudeWin.loadURL('https://claude.ai/new'); claudeWin.show(); claudeWin.focus(); return { ok: true }; }
  claudeWin = new BrowserWindow({
    width: 1100, height: 860, minWidth: 720, minHeight: 560, title: 'Claude',
    autoHideMenuBar: true, backgroundColor: '#faf9f5',
    webPreferences: { partition: 'persist:claude', contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  claudeWin.webContents.setWindowOpenHandler(({ url }) => {
    // Connexion (Google, lien e-mail) : dans la même session ; le reste dans le navigateur
    if (/^https:\/\/([a-z0-9-]+\.)*(claude\.ai|anthropic\.com|google\.com|googleusercontent\.com|apple\.com)\//i.test(url)) return { action: 'allow', overrideBrowserWindowOptions: { webPreferences: { partition: 'persist:claude' } } };
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  claudeWin.on('closed', () => { claudeWin = null; if (win && !win.isDestroyed()) win.focus(); });
  claudeWin.loadURL('https://claude.ai/new');
  return { ok: true };
});
ipcMain.handle('clipboard:read', () => clipboard.readText());
ipcMain.handle('clipboard:write', (_e, text) => { clipboard.writeText(String(text || '')); return true; });
ipcMain.handle('key:status', () => ({ hasKey: !!getApiKey(), fromEnv: !!process.env.GEMINI_API_KEY }));
ipcMain.handle('key:set', (_e, key) => { setApiKey(key || ''); return { hasKey: !!getApiKey() }; });

ipcMain.handle('gemini:generate', async (e, req) => {
  try {
    // État en direct (nouvel essai, modèle de repli…) affiché dans la barre des tâches
    const onStatus = (st) => { if (!e.sender.isDestroyed()) e.sender.send('gemini:status', { ...st, at: Date.now() }); };
    const r = await gemini.generate(getApiKey(), { ...req, onStatus });
    return { ok: true, text: r.text, sources: r.sources, images: r.images || [], model: r.model, fallbackFrom: r.fallbackFrom };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});
// Images libres de droits : recherche sur Wikimédia Commons (sans clé). Seules des adresses Wikimédia sont acceptées.
const COMMONS_UA = 'OrthoRevision/1.0 (application de révision ; contact : usage personnel)';
ipcMain.handle('commons:search', async (_e, q) => {
  try {
    const STOP = new Set(['de', 'des', 'du', 'la', 'le', 'les', 'un', 'une', 'et', 'en', 'au', 'aux', 'pour', 'par', 'sur', 'dans', 'avec', 'the', 'of', 'and', 'in', 'on', 'for', 'to', 'a']);
    const raw = String(q || '').replace(/[^\p{L}\p{N}\s'-]/gu, ' ').split(/\s+/).filter(Boolean);
    const key = raw.filter((w) => w.length > 2 && !STOP.has(w.toLowerCase().replace(/^[dl]'/, '')));
    const base = key.length ? key : raw;
    if (!base.length) return { ok: true, results: [], tried: [] };
    // Une longue phrase donne souvent zéro résultat (tous les mots doivent correspondre) : on élargit peu à peu
    const longest = [...base].sort((a, b) => b.length - a.length)[0];
    const tries = [...new Set([raw.join(' '), base.slice(0, 3).join(' '), base.slice(0, 2).join(' '), longest].filter(Boolean))];
    const tried = [];
    for (const term of tries) {
      tried.push(term);
      const params = new URLSearchParams({
        action: 'query', format: 'json', origin: '*',
        generator: 'search', gsrsearch: term, gsrnamespace: '6', gsrlimit: '20',
        prop: 'imageinfo', iiprop: 'url|mime|extmetadata', iiurlwidth: '640',
      });
      const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, { headers: { 'User-Agent': COMMONS_UA, Accept: 'application/json' } });
      if (!res.ok) throw new Error(`Wikimédia a répondu ${res.status}.`);
      const data = await res.json();
      if (data.error) throw new Error(`Wikimédia : ${data.error.info || data.error.code}`);
      const results = Object.values((data.query && data.query.pages) || {}).map((pg) => {
        const ii = pg.imageinfo && pg.imageinfo[0];
        const mime = (ii && ii.mime) || '';
        if (!ii || !(ii.thumburl || ii.url) || /^(video|audio)\//.test(mime) || /pdf|djvu/.test(mime)) return null;
        const meta = ii.extmetadata || {};
        return {
          title: String(pg.title || '').replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, '').replace(/_/g, ' '),
          thumb: ii.thumburl || ii.url,
          page: ii.descriptionurl,
          license: (meta.LicenseShortName && meta.LicenseShortName.value) || '',
          artist: ((meta.Artist && meta.Artist.value) || '').replace(/<[^>]+>/g, '').trim().slice(0, 120),
        };
      }).filter(Boolean);
      if (results.length) return { ok: true, results, usedTerm: term, tried };
    }
    return { ok: true, results: [], tried };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});
ipcMain.handle('commons:image', async (_e, url) => {
  try {
    if (!/^https:\/\/upload\.wikimedia\.org\//.test(String(url || ''))) throw new Error('Adresse d’image non autorisée.');
    const res = await fetch(url, { headers: { 'User-Agent': COMMONS_UA } });
    if (!res.ok) throw new Error(`Image indisponible (${res.status}).`);
    const type = (res.headers.get('content-type') || 'image/jpeg').split(';')[0];
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 4 * 1024 * 1024) throw new Error('Image trop lourde (plus de 4 Mo).');
    return { ok: true, dataUrl: `data:${type};base64,${buf.toString('base64')}` };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});
ipcMain.handle('define:lookup', (_e, term) => require('./lookup.cjs').lookup(term));
// Voix ElevenLabs
ipcMain.handle('eleven:status', () => ({ hasKey: !!getElevenKey(), fromEnv: !!process.env.ELEVENLABS_API_KEY }));
ipcMain.handle('eleven:setKey', (_e, key) => { setElevenKey(key || ''); return { hasKey: !!getElevenKey() }; });
ipcMain.handle('eleven:voices', async () => {
  try { return { ok: true, ...(await eleven.voices(getElevenKey())) }; } catch (err) { return { ok: false, error: err.message || String(err) }; }
});
ipcMain.handle('eleven:usage', async () => {
  try { return { ok: true, ...(await eleven.usage(getElevenKey())) }; } catch (err) { return { ok: false, error: err.message || String(err) }; }
});
// Podcast du cours (MP3 dans userData/podcasts/<id du cours>.mp3)
const podcastDir = () => path.join(app.getPath('userData'), 'podcasts');
function podcastFile(id) {
  if (!/^[\w-]{1,80}$/.test(String(id || ''))) throw new Error('Cours inconnu.');
  return path.join(podcastDir(), `${id}.mp3`);
}
ipcMain.handle('podcast:build', async (e, req) => {
  try {
    const q = req || {};
    const useAzure = q.engine === 'azure';
    podcastStop.delete(q.courseId);
    const speak0 = useAzure
      ? (text, voiceId) => azureSpeak({ text, voiceId })
      : (text, voiceId) => eleven.speak(getElevenKey(), { text, voiceId, modelId: q.modelId }, ttsCacheDir());
    // « Arrêter » : la réplique en cours se termine, les suivantes ne sont pas lues
    const speakOne = (text, voiceId) => { if (podcastStop.has(q.courseId)) throw new Error('Création du podcast arrêtée.'); return speak0(text, voiceId); };
    const r = await podcast.buildPodcast(q, speakOne, podcastFile(q.courseId), (done, total) => {
      if (!e.sender.isDestroyed()) e.sender.send('podcast:progress', { courseId: q.courseId, done, total });
    });
    // Durée approchée : Azure 96 kbit/s, ElevenLabs 128 kbit/s
    return { ok: true, ...r, seconds: Math.round(r.bytes / (useAzure ? 12000 : 16000)) };
  } catch (err) { return { ok: false, error: err.message || String(err) }; }
});
ipcMain.handle('podcast:read', (_e, id) => {
  try { return { ok: true, data: fs.readFileSync(podcastFile(id)) }; }
  catch { return { ok: false, error: 'Fichier du podcast introuvable : recrée-le.' }; }
});
ipcMain.handle('podcast:save', async (_e, { id, name } = {}) => {
  try {
    const src = podcastFile(id);
    const r = await dialog.showSaveDialog(win, {
      title: 'Enregistrer le podcast',
      defaultPath: path.join(app.getPath('music'), `${String(name || 'podcast').replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 80)}.mp3`),
      filters: [{ name: 'MP3', extensions: ['mp3'] }],
    });
    if (r.canceled || !r.filePath) return { ok: false, canceled: true };
    fs.copyFileSync(src, r.filePath);
    return { ok: true, path: r.filePath };
  } catch (err) { return { ok: false, error: err.message || String(err) }; }
});
ipcMain.handle('podcast:delete', (_e, id) => { try { fs.unlinkSync(podcastFile(id)); } catch { /* déjà supprimé */ } return { ok: true }; });

// Accès depuis le téléphone (cours + podcasts) : le serveur demande les données au logiciel
const libPending = new Map();
let libSeq = 0;
function askRenderer(type, payload) {
  return new Promise((resolve, reject) => {
    if (!win || win.isDestroyed()) return reject(new Error("Le logiciel n'est pas ouvert sur l'ordinateur."));
    const id = ++libSeq;
    const timer = setTimeout(() => { libPending.delete(id); reject(new Error('Le logiciel met trop de temps à répondre. Réessaie.')); }, 20000);
    libPending.set(id, { resolve, reject, timer });
    win.webContents.send('library:req', { id, type, payload });
  });
}
ipcMain.on('library:res', (_e, msg = {}) => {
  const p = libPending.get(msg.id);
  if (!p) return;
  clearTimeout(p.timer);
  libPending.delete(msg.id);
  if (msg.ok) p.resolve(msg.data); else p.reject(new Error(msg.error || 'Erreur'));
});
async function startLibrary() {
  const cfg = readConfig();
  if (!cfg.libraryToken) { cfg.libraryToken = crypto.randomBytes(18).toString('hex'); writeConfig(cfg); }
  const st = await libraryServer.start({ token: cfg.libraryToken, port: cfg.libraryPort || libraryServer.DEFAULT_PORT, podcastDir: podcastDir(), appName: app.getName(), ask: askRenderer });
  if (st.port !== cfg.libraryPort) { const c2 = readConfig(); c2.libraryPort = st.port; writeConfig(c2); }
  return st;
}
// Mises à jour automatiques (GitHub)
ipcMain.handle('update:status', () => updater.status());
ipcMain.handle('update:check', () => updater.check());
ipcMain.handle('update:install', () => updater.install());

ipcMain.handle('library:status', () => ({ on: !!readConfig().libraryOn, ...libraryServer.status() }));
ipcMain.handle('library:set', async (_e, on) => {
  const cfg = readConfig();
  cfg.libraryOn = !!on;
  writeConfig(cfg);
  try {
    if (on) await startLibrary(); else libraryServer.stop();
    return { ok: true, on: !!on, ...libraryServer.status() };
  } catch (err) { return { ok: false, on: !!on, error: err.message || String(err) }; }
});
ipcMain.handle('library:reset', async () => {
  const cfg = readConfig();
  cfg.libraryToken = crypto.randomBytes(18).toString('hex');
  writeConfig(cfg);
  try {
    if (cfg.libraryOn) await startLibrary();
    return { ok: true, on: !!cfg.libraryOn, ...libraryServer.status() };
  } catch (err) { return { ok: false, error: err.message || String(err) }; }
});

const podcastStop = new Set();
ipcMain.handle('podcast:cancel', (_e, courseId) => { podcastStop.add(courseId); return { ok: true }; });
ipcMain.handle('azure:status', () => { const c = getAzureCred(); return { hasKey: !!c.key, region: c.region, fromEnv: !!process.env.AZURE_SPEECH_KEY }; });
ipcMain.handle('azure:setKey', (_e, { key, region } = {}) => { setAzureKey(key, region); const c = getAzureCred(); return { hasKey: !!c.key, region: c.region }; });
ipcMain.handle('azure:voices', async () => {
  try { return { ok: true, ...(await azure.voices(getAzureCred())) }; } catch (err) { return { ok: false, error: err.message || String(err) }; }
});
ipcMain.handle('azure:speak', async (_e, req) => {
  try { return { ok: true, ...(await azureSpeak(req)) }; } catch (err) { return { ok: false, error: err.message || String(err) }; }
});
ipcMain.handle('azure:usage', () => ({ ok: true, ...azureUsage() }));
ipcMain.handle('eleven:speak', async (_e, req) => {
  try { return { ok: true, ...(await eleven.speak(getElevenKey(), req || {}, ttsCacheDir())) }; } catch (err) { return { ok: false, error: err.message || String(err) }; }
});
ipcMain.handle('gemini:models', async () => {
  try { return { ok: true, models: await gemini.listModels(getApiKey()) }; }
  catch (err) { return { ok: false, error: err.message || String(err) }; }
});

ipcMain.handle('phone:start', async () => {
  try {
    const info = await phoneServer.start((file) => {
      if (win) win.webContents.send('phone:file', file);
    });
    return { ok: true, ...info };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});
ipcMain.handle('phone:stop', () => { phoneServer.stop(); return { ok: true }; });

// --- Révision des flashcards sur le téléphone -------------------------------------
const clip = (v, n) => String(v == null ? '' : v).slice(0, n);
ipcMain.handle('phone:review', async (_e, payload) => {
  try {
    const cards = (Array.isArray(payload && payload.cards) ? payload.cards : []).slice(0, 500).map((c) => ({
      id: clip(c.id, 80), front: clip(c.front, 2000), back: clip(c.back, 4000), category: clip(c.category, 60), course: clip(c.course, 120),
    }));
    const info = await phoneServer.start((file) => { if (win) win.webContents.send('phone:file', file); });
    phoneServer.setReview({ title: clip(payload && payload.title, 120), cards }, (g) => { if (win) win.webContents.send('phone:grade', g); });
    return { ok: true, url: info.reviewUrl };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});
ipcMain.handle('phone:reviewStop', () => { phoneServer.clearReview(); phoneServer.stop(); return { ok: true }; });

// --- Sauvegardes automatiques (fichiers .json dans un dossier au choix) -----------
const appLabel = () => path.basename(app.getPath('userData'));
const backupBase = () => appLabel().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w-]+/g, '-');
const defaultBackupDir = () => path.join(app.getPath('documents'), `${appLabel()} - Sauvegardes`);
const backupDir = () => readConfig().backupDir || defaultBackupDir();
ipcMain.handle('backup:info', () => ({ dir: backupDir(), isDefault: !readConfig().backupDir }));
ipcMain.handle('backup:choose', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Dossier des sauvegardes automatiques', defaultPath: backupDir(), properties: ['openDirectory', 'createDirectory'],
  });
  if (r.canceled || !r.filePaths[0]) return { ok: false };
  const cfg = readConfig();
  cfg.backupDir = r.filePaths[0];
  writeConfig(cfg);
  return { ok: true, dir: cfg.backupDir };
});
ipcMain.handle('backup:write', (_e, json) => {
  try {
    const dir = backupDir();
    fs.mkdirSync(dir, { recursive: true });
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const file = path.join(dir, `${backupBase()}-sauvegarde-${stamp}.json`);
    fs.writeFileSync(`${file}.tmp`, String(json));
    fs.renameSync(`${file}.tmp`, file); // jamais de fichier à moitié écrit
    // On garde les 10 sauvegardes les plus récentes
    fs.readdirSync(dir).filter((f) => f.startsWith(`${backupBase()}-sauvegarde-`) && f.endsWith('.json'))
      .sort().reverse().slice(10)
      .forEach((f) => { try { fs.unlinkSync(path.join(dir, f)); } catch {} });
    return { ok: true, file };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});
ipcMain.handle('backup:open', () => {
  const dir = backupDir();
  fs.mkdirSync(dir, { recursive: true });
  return shell.openPath(dir);
});

// --- Export PDF de la fiche (la page passe en mode impression : fiche seule) -----
ipcMain.handle('print:pdf', async (_e, opts) => {
  try {
    const data = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4' });
    const safe = clip(opts && opts.title, 80).replace(/[\\/:*?"<>|]+/g, '-').trim() || 'Fiche';
    const r = await dialog.showSaveDialog(win, {
      title: 'Enregistrer la fiche en PDF',
      defaultPath: path.join(app.getPath('documents'), `${safe}.pdf`),
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (r.canceled || !r.filePath) return { ok: false, canceled: true };
    fs.writeFileSync(r.filePath, data);
    shell.showItemInFolder(r.filePath);
    return { ok: true, path: r.filePath };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

// --- Envoi d'un fichier lourd à Gemini (enregistrement audio) ---------------------
ipcMain.handle('gemini:upload', async (_e, req) => {
  try { return { ok: true, ...(await gemini.uploadFile(getApiKey(), req)) }; }
  catch (err) { return { ok: false, error: err.message || String(err) }; }
});

ipcMain.on('theme:set', (_e, mode) => {
  nativeTheme.themeSource = ['light', 'dark'].includes(mode) ? mode : 'system';
  if (isWin && win) { try { win.setTitleBarOverlay(overlayColors()); } catch {} }
});

ipcMain.handle('open:external', (_e, url) => {
  if (/^https?:\/\//.test(url)) shell.openExternal(url);
});

// --- Cycle de vie ---------------------------------------------------------------
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
// --- Accélération graphique ------------------------------------------------------------
// Activée par défaut (animations fluides). Le cache disque du GPU est coupé : c'est lui que Windows
// refusait (« Gpu Cache Creation failed ») et qui laissait la fenêtre invisible. Si la fenêtre ne
// s'affiche toujours pas, ou si le processus graphique plante, le logiciel coupe le GPU tout seul et
// redémarre (choix gardé dans gpu.json ; modifiable dans Réglages › Apparence).
const gpuFile = () => path.join(app.getPath('userData'), 'gpu.json');
const readGpu = () => { try { return JSON.parse(fs.readFileSync(gpuFile(), 'utf8')); } catch { return {}; } };
const writeGpu = (v) => { try { fs.mkdirSync(app.getPath('userData'), { recursive: true }); fs.writeFileSync(gpuFile(), JSON.stringify(v)); } catch { /* */ } };
const gpuOff = !!readGpu().off || process.argv.includes('--disable-gpu');
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
if (gpuOff) {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-gpu-compositing');
}
const fallbackToCpu = (reason) => {
  if (gpuOff) return;
  writeGpu({ off: true, auto: true, reason, at: new Date().toISOString() });
  app.relaunch();
  app.exit(0);
};
app.on('child-process-gone', (_e, d) => { if (d.type === 'GPU' && d.reason !== 'clean-exit' && !win?.isVisible()) fallbackToCpu(`GPU : ${d.reason}`); });
ipcMain.handle('gpu:info', () => ({ off: gpuOff, ...readGpu() }));
ipcMain.handle('gpu:set', (_e, on) => { writeGpu({ off: !on, auto: false }); app.relaunch(); app.exit(0); });

app.whenReady().then(() => {
  if (readConfig().libraryOn) startLibrary().catch((err) => console.warn('[téléphone]', err.message));
  updater.init((st) => { if (win && !win.isDestroyed()) win.webContents.send('update:status', st); });
  // Menu sans zoom de page : dans l'app, ⌘/Ctrl + et − règlent la taille du texte des cours
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { label: 'Affichage', submenu: [{ role: 'reload' }, { role: 'togglefullscreen' }] },
    { role: 'windowMenu' },
  ]));
  createWindow();
  nativeTheme.on('updated', () => { if (isWin && win) { try { win.setTitleBarOverlay(overlayColors()); } catch {} } });
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { phoneServer.stop(); if (!isMac) app.quit(); });
