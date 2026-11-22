import { isDue } from './srs.js';

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Sélectionne des questions en privilégiant les jamais vues et les plus ratées. */
export function pickQuestions(all, n, mode = 'mix') {
  let pool = all;
  if (mode === 'qcm') pool = all.filter((q) => q.kind === 'qcm');
  if (mode === 'cas') pool = all.filter((q) => q.kind === 'cas');
  if (mode === 'weak') pool = all.filter((q) => q.stats?.seen && q.stats.right / q.stats.seen < 0.7);
  const scored = pool.map((q) => {
    const s = q.stats || {};
    const rate = s.seen ? s.right / s.seen : 0.35; // une question jamais vue est prioritaire
    return { q, k: rate + Math.random() * 0.35 };
  });
  scored.sort((a, b) => a.k - b.k);
  return shuffle(scored.slice(0, n).map((x) => x.q));
}

/** Cartes dues : d'abord les plus en retard, les nouvelles ensuite (limitées). */
export function dueCards(cards, { newLimit = 20 } = {}) {
  const now = Date.now();
  const due = cards.filter((c) => c.srs?.reps > 0 && isDue(c, now)).sort((a, b) => a.srs.due - b.srs.due);
  const fresh = cards.filter((c) => !c.srs || c.srs.reps === 0).slice(0, newLimit);
  return [...due, ...shuffle(fresh)];
}

/** Cartes difficiles : souvent ratées ou jugées difficiles (facilité basse). */
export function weakCards(cards, n = 30) {
  return cards
    .filter((c) => c.srs && c.srs.reps + c.srs.lapses > 0 && (c.srs.lapses >= 1 || c.srs.ease < 2.2))
    .sort((a, b) => b.srs.lapses - a.srs.lapses || a.srs.ease - b.srs.ease)
    .slice(0, n);
}
