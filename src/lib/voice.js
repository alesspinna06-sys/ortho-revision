// Voix ElevenLabs : modèles proposés, choix d'une voix française, lecture d'un morceau audio.

export const ELEVEN_MODELS = [
  { id: 'eleven_flash_v2_5', label: 'Économique', d: 'Rapide, deux fois moins de crédits.' },
  { id: 'eleven_multilingual_v2', label: 'Naturelle', d: 'La plus régulière sur les longs cours (conseillé).' },
  { id: 'eleven_v4', label: 'Meilleure', d: 'La plus expressive et la plus fidèle.' },
];
export const DEFAULT_ELEVEN_MODEL = 'eleven_multilingual_v2';

export const VOICE_SAMPLE = "Bonjour ! Voici comment je vais te lire tes cours. Prends ton temps : tu peux mettre en pause, ralentir, ou reprendre où tu veux.";

/** Voix françaises d'abord, puis les autres (toutes savent parler français avec les modèles multilingues). */
export function sortVoices(voices = []) {
  const isFr = (v) => /fr|french|fran/i.test(`${v.labels?.language || ''} ${v.labels?.accent || ''} ${v.description || ''} ${v.name}`);
  return [...voices].sort((a, b) => (isFr(b) - isFr(a)) || a.name.localeCompare(b.name));
}

export function voiceLabel(v) {
  const l = v.labels || {};
  const bits = [l.gender === 'female' ? 'femme' : l.gender === 'male' ? 'homme' : '', l.accent || l.language || '', l.age || '', l.use_case || l.descriptive || ''].filter(Boolean);
  return bits.length ? `${v.name} — ${bits.join(', ')}` : v.name;
}

/** Audio en base64 → adresse lisible par <audio> (à libérer avec URL.revokeObjectURL). */
export function audioUrl(b64, mime = 'audio/mpeg') {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}

// ---------- Azure Speech (Microsoft)
export const DEFAULT_AZURE_VOICE = 'fr-FR-DeniseNeural';
export const DEFAULT_AZURE_VOICE_B = 'fr-FR-HenriNeural';
export const AZURE_REGIONS = [
  { id: 'westeurope', label: 'West Europe (Pays-Bas)' },
  { id: 'francecentral', label: 'France Central (Paris)' },
  { id: 'northeurope', label: 'North Europe (Irlande)' },
  { id: 'switzerlandnorth', label: 'Switzerland North (Zurich)' },
  { id: 'uksouth', label: 'UK South (Londres)' },
  { id: 'germanywestcentral', label: 'Germany West Central' },
  { id: 'eastus', label: 'East US' },
  { id: 'canadacentral', label: 'Canada Central' },
];
const LOCALE_ORDER = ['fr-FR', 'fr-BE', 'fr-CH', 'fr-CA'];
const COUNTRY = { 'fr-FR': 'France', 'fr-BE': 'Belgique', 'fr-CH': 'Suisse', 'fr-CA': 'Canada' };

/** Voix de France d'abord (Denise, Henri…), puis Belgique, Suisse, Canada, puis multilingues. */
export function sortAzureVoices(voices = []) {
  const rank = (v) => { const i = LOCALE_ORDER.indexOf(v.locale); return v.multilingual && i < 0 ? 10 : i < 0 ? 5 : i; };
  return [...voices].sort((a, b) => rank(a) - rank(b) || (b.id === DEFAULT_AZURE_VOICE) - (a.id === DEFAULT_AZURE_VOICE) || a.name.localeCompare(b.name));
}

export function azureVoiceLabel(v) {
  const g = v.gender === 'Female' ? 'femme' : v.gender === 'Male' ? 'homme' : '';
  const where = COUNTRY[v.locale] || (v.multilingual ? `multilingue, ${v.locale}` : v.locale);
  return `${v.name} — ${[g, where].filter(Boolean).join(', ')}`;
}
