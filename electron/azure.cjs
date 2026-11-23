// Voix Azure Speech (Microsoft) : Denise, Henri, Vivienne… Offre gratuite « Free F0 » = 500 000 caractères par mois.
// Appels REST depuis le processus principal (la clé ne passe jamais par l'interface).
// Chaque morceau lu est gardé sur le disque : le relire ne consomme rien.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const xml = (s) => String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));

function host(region) {
  const r = String(region || '').trim().toLowerCase();
  if (!/^[a-z0-9]{3,30}$/.test(r)) throw new Error('Région Azure invalide (exemple : westeurope).');
  return `https://${r}.tts.speech.microsoft.com`;
}

function frenchError(status, detail) {
  if (/quota|exceed/i.test(detail) && (status === 403 || status === 429)) return "Quota gratuit Azure du mois atteint (500 000 caractères). La voix de l'ordinateur prend le relais.";
  if (status === 401) return 'Clé Azure refusée. Vérifie la clé et la région dans Réglages › Voix.';
  if (status === 403) return "Azure refuse l'accès : vérifie que la ressource Speech est bien active et que la région est la bonne.";
  if (status === 404) return 'Région Azure introuvable. Vérifie la région dans Réglages › Voix (exemple : westeurope).';
  if (status === 429) return 'Azure reçoit trop de demandes à la fois (offre gratuite). Réessaie dans un instant.';
  if (status >= 500) return 'Azure est momentanément indisponible. Réessaie dans un instant.';
  return detail ? `Azure a refusé la demande : ${detail}` : `Erreur Azure (${status})`;
}

function check(cred) {
  if (!cred || !cred.key) throw new Error('Aucune clé Azure. Ajoute-la dans Réglages › Voix.');
  return host(cred.region);
}

/** Voix françaises (France, Belgique, Suisse, Canada) et multilingues. */
async function voices(cred) {
  const base = check(cred);
  const res = await fetch(`${base}/cognitiveservices/voices/list`, { headers: { 'Ocp-Apim-Subscription-Key': cred.key } });
  if (!res.ok) throw new Error(frenchError(res.status, (await res.text().catch(() => '')).slice(0, 200)));
  const list = await res.json();
  return {
    voices: (list || [])
      .filter((v) => /^fr-/i.test(v.Locale) || /Multilingual/i.test(v.ShortName))
      .map((v) => ({ id: v.ShortName, name: v.LocalName || v.DisplayName || v.ShortName, gender: v.Gender, locale: v.Locale, multilingual: /Multilingual/i.test(v.ShortName) })),
  };
}

/** Lit un morceau de texte : { audio (base64), mime, cached, chars }. */
async function speak(cred, { text, voiceId }, cacheDir) {
  const clean = String(text || '').trim();
  if (!clean) throw new Error('Rien à lire.');
  if (!voiceId) throw new Error('Choisis une voix Azure dans Réglages › Voix.');
  const hash = crypto.createHash('sha1').update(`azure|${voiceId}|${clean}`).digest('hex');
  const file = path.join(cacheDir, `${hash}.mp3`);
  if (fs.existsSync(file)) {
    const now = new Date();
    try { fs.utimesSync(file, now, now); } catch { /* pas grave */ }
    return { audio: fs.readFileSync(file).toString('base64'), mime: 'audio/mpeg', cached: true, chars: 0 };
  }
  const base = check(cred);
  const lang = (/^([a-z]{2}-[A-Z]{2})-/.exec(voiceId) || [])[1] || 'fr-FR';
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}"><voice name="${xml(voiceId)}"><lang xml:lang="fr-FR">${xml(clean)}</lang></voice></speak>`;
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${base}/cognitiveservices/v1`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': cred.key,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-96kbitrate-mono-mp3',
        'User-Agent': 'revision-voix',
      },
      body: ssml,
    });
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      try { fs.mkdirSync(cacheDir, { recursive: true }); fs.writeFileSync(file, buf); } catch { /* disque plein : on lit quand même */ }
      return { audio: buf.toString('base64'), mime: 'audio/mpeg', cached: false, chars: clean.length };
    }
    const detail = (await res.text().catch(() => '')).slice(0, 200);
    lastErr = new Error(frenchError(res.status, detail));
    // L'offre gratuite limite le nombre de demandes par minute : on patiente un peu
    if ((res.status === 429 && !/quota|exceed/i.test(detail)) || res.status >= 500) { if (attempt < 2) { await sleep(2500 * (attempt + 1)); continue; } }
    break;
  }
  throw lastErr;
}

module.exports = { voices, speak };
