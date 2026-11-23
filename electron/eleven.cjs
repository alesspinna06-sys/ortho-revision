// Voix ElevenLabs (lecture à voix haute). Appels REST depuis le processus principal :
// la clé ne passe jamais par l'interface. Chaque morceau lu est gardé sur le disque
// (même texte + même voix + même modèle = aucun crédit dépensé à la relecture).
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const BASE = 'https://api.elevenlabs.io';
const CACHE_MAX = 400 * 1024 * 1024; // 400 Mo de voix gardées au plus
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function detailOf(res) {
  try {
    const j = await res.json();
    const d = j && j.detail;
    if (typeof d === 'string') return d;
    if (d && (d.message || d.status)) return `${d.status || ''} ${d.message || ''}`.trim();
    return JSON.stringify(j).slice(0, 200);
  } catch { return ''; }
}

function frenchError(status, detail) {
  if (/quota|credit|character_limit|insufficient/i.test(detail)) return "Plus assez de crédits ElevenLabs ce mois-ci. La voix de l'ordinateur prend le relais.";
  if (status === 401 || status === 403) return 'Clé ElevenLabs refusée. Vérifie-la dans Réglages › Voix.';
  if (status === 404) return 'Voix ElevenLabs introuvable. Choisis une autre voix dans Réglages › Voix.';
  if (status === 429) return 'ElevenLabs reçoit trop de demandes à la fois. Réessaie dans un instant.';
  if (status >= 500) return 'ElevenLabs est momentanément indisponible. Réessaie dans un instant.';
  return detail ? `ElevenLabs a refusé la demande : ${detail}` : `Erreur ElevenLabs (${status})`;
}

async function get(apiKey, url) {
  if (!apiKey) throw new Error('Aucune clé ElevenLabs. Ajoute-la dans Réglages › Voix.');
  const res = await fetch(`${BASE}${url}`, { headers: { 'xi-api-key': apiKey } });
  if (!res.ok) throw new Error(frenchError(res.status, await detailOf(res)));
  return res.json();
}

/** Voix du compte (voix par défaut d'ElevenLabs + voix ajoutées depuis la bibliothèque). */
async function voices(apiKey) {
  const data = await get(apiKey, '/v2/voices?page_size=100');
  return {
    voices: (data.voices || []).map((v) => ({
      id: v.voice_id,
      name: v.name,
      category: v.category,
      labels: v.labels || {},
      description: v.description || '',
    })),
  };
}

/** Crédits du mois : { used, limit, resetAt } (en caractères). */
async function usage(apiKey) {
  const s = await get(apiKey, '/v1/user/subscription');
  return {
    used: s.character_count ?? null,
    limit: s.character_limit ?? null,
    resetAt: s.next_character_count_reset_unix ? s.next_character_count_reset_unix * 1000 : null,
    tier: s.tier || '',
  };
}

function pruneCache(dir) {
  try {
    const files = fs.readdirSync(dir).map((f) => {
      const p = path.join(dir, f);
      const st = fs.statSync(p);
      return { p, size: st.size, t: st.mtimeMs };
    }).sort((a, b) => a.t - b.t);
    let total = files.reduce((n, f) => n + f.size, 0);
    for (const f of files) {
      if (total <= CACHE_MAX) break;
      try { fs.unlinkSync(f.p); total -= f.size; } catch { /* fichier occupé */ }
    }
  } catch { /* dossier absent */ }
}

/** Lit un morceau de texte : { audio (base64), mime, cached }. */
async function speak(apiKey, { text, voiceId, modelId }, cacheDir) {
  const clean = String(text || '').trim();
  if (!clean) throw new Error('Rien à lire.');
  if (!voiceId) throw new Error('Choisis une voix dans Réglages › Voix.');
  const model = modelId || 'eleven_multilingual_v2';
  const hash = crypto.createHash('sha1').update(`${model}|${voiceId}|${clean}`).digest('hex');
  const file = path.join(cacheDir, `${hash}.mp3`);
  if (fs.existsSync(file)) {
    const now = new Date();
    try { fs.utimesSync(file, now, now); } catch { /* pas grave */ }
    return { audio: fs.readFileSync(file).toString('base64'), mime: 'audio/mpeg', cached: true };
  }
  if (!apiKey) throw new Error('Aucune clé ElevenLabs. Ajoute-la dans Réglages › Voix.');
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${BASE}/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text: clean, model_id: model }),
    });
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      try {
        fs.mkdirSync(cacheDir, { recursive: true });
        fs.writeFileSync(file, buf);
        if (Math.random() < 0.05) pruneCache(cacheDir);
      } catch { /* disque plein : on lit quand même */ }
      return { audio: buf.toString('base64'), mime: 'audio/mpeg', cached: false };
    }
    const detail = await detailOf(res);
    lastErr = new Error(frenchError(res.status, detail));
    if ((res.status === 429 || res.status >= 500) && attempt === 0) { await sleep(1500); continue; }
    break;
  }
  throw lastErr;
}

/**
 * Podcast : chaque réplique lue avec la voix de son personnage (mémoire par réplique),
 * puis assemblées dans un seul MP3. onProgress(done, total).
 */
async function buildPodcast(apiKey, { lines, voices: who, modelId }, cacheDir, outFile, onProgress = () => {}) {
  const list = (lines || []).filter((l) => l && String(l.text || '').trim());
  if (!list.length) throw new Error('Le script du podcast est vide.');
  if (!who || !who.A || !who.B) throw new Error('Choisis les deux voix du podcast dans Réglages › Voix.');
  const parts = new Array(list.length);
  let done = 0;
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const i = next++;
      const l = list[i];
      const r = await speak(apiKey, { text: l.text, voiceId: l.speaker === 'B' ? who.B : who.A, modelId }, cacheDir);
      parts[i] = Buffer.from(r.audio, 'base64');
      done += 1;
      onProgress(done, list.length);
    }
  };
  await Promise.all([worker(), worker()]); // deux répliques à la fois
  const buf = Buffer.concat(parts);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, buf);
  return { bytes: buf.length, seconds: Math.round(buf.length / 16000) }; // 128 kbit/s
}

module.exports = { voices, usage, speak, buildPodcast };
