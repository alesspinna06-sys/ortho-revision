// Assemblage d'un podcast : chaque réplique lue avec la voix de son personnage
// (par le moteur choisi : Azure ou ElevenLabs), puis les MP3 mis bout à bout.
const fs = require('fs');
const path = require('path');

/**
 * speakOne(text, voiceId) → { audio (base64) } ; voices = { A, B } ; onProgress(done, total).
 * Deux répliques à la fois (limite de l'offre gratuite d'Azure respectée grâce aux nouvelles tentatives).
 */
async function buildPodcast({ lines, voices: who }, speakOne, outFile, onProgress = () => {}) {
  const list = (lines || []).filter((l) => l && String(l.text || '').trim());
  if (!list.length) throw new Error('Le script du podcast est vide.');
  if (!who || !who.A || !who.B) throw new Error('Choisis les deux voix du podcast.');
  const parts = new Array(list.length);
  let done = 0;
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const i = next++;
      const l = list[i];
      const r = await speakOne(l.text, l.speaker === 'B' ? who.B : who.A);
      parts[i] = Buffer.from(r.audio, 'base64');
      done += 1;
      onProgress(done, list.length);
    }
  };
  await Promise.all([worker(), worker()]);
  const buf = Buffer.concat(parts);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, buf);
  return { bytes: buf.length };
}

module.exports = { buildPodcast };
