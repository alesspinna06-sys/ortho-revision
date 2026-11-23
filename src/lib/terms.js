// Mots importants choisis par l'étudiante : surlignage ==mot== dans la fiche et retrait.
// Fonctions pures, communes aux deux logiciels.

/** Forme comparable d'un terme (sans accents, sans casse, espaces réduits). */
export const normTerm = (s = '') => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Surligne la première occurrence du mot dans le texte, hors titres et hors
 * mots déjà surlignés. Renvoie le texte inchangé si le mot n'est pas trouvé.
 */
export function highlightTerm(md = '', term = '') {
  const t = term.trim();
  if (!t) return md;
  const re = new RegExp(`(^|[^\\p{L}\\p{N}=])(${escRe(t)})(?![\\p{L}\\p{N}=])`, 'iu');
  let done = false;
  return md.split('\n').map((line) => {
    if (done || /^#{1,4}\s/.test(line)) return line;
    return line.replace(re, (_, pre, word) => { done = true; return `${pre}==${word}==`; });
  }).join('\n');
}

/** Retire le surlignage de toutes les occurrences de ce mot (le texte reste en place). */
export function unhighlightTerm(md = '', term = '') {
  const k = normTerm(term);
  return md.replace(/==(.+?)==/g, (m, w) => (normTerm(w) === k ? w : m));
}
