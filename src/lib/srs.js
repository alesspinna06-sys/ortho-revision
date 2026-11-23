// Répétition espacée (algorithme SM-2 simplifié, proche d'Anki).
// note : 0 = À revoir, 1 = Difficile, 2 = Bien, 3 = Facile
const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;

export const newSrs = () => ({ ease: 2.5, interval: 0, reps: 0, lapses: 0, due: Date.now(), last: 0 });

export function schedule(srs = newSrs(), grade, now = Date.now()) {
  let { ease = 2.5, interval = 0, reps = 0, lapses = 0 } = srs;
  let due;
  if (grade === 0) {
    lapses += 1; reps = 0; interval = 0;
    ease = Math.max(1.3, ease - 0.2);
    due = now + 10 * MIN;
  } else {
    if (reps === 0) interval = grade === 1 ? 1 : grade === 2 ? 1 : 3;
    else if (reps === 1) interval = grade === 1 ? 2 : grade === 2 ? 3 : 5;
    else interval = Math.round(interval * (grade === 1 ? 1.2 : grade === 2 ? ease : ease * 1.3));
    interval = Math.max(1, Math.min(interval, 365));
    if (grade === 1) ease = Math.max(1.3, ease - 0.15);
    if (grade === 3) ease = ease + 0.15;
    reps += 1;
    due = now + interval * DAY;
  }
  return { ease: +ease.toFixed(2), interval, reps, lapses, due, last: now };
}

export function previewLabel(srs, grade) {
  const next = schedule(srs, grade);
  if (grade === 0) return '10 min';
  return next.interval === 1 ? '1 j' : next.interval < 30 ? `${next.interval} j` : `${Math.round(next.interval / 30)} mois`;
}

export const isDue = (card, now = Date.now()) => !card.srs || card.srs.due <= now;

/** Statut de maîtrise d'une carte, pour les statistiques. */
export function mastery(card) {
  const s = card.srs;
  if (!s || s.reps === 0) return 'new';
  if (s.interval >= 21) return 'mastered';
  return 'learning';
}

// --- Journal d'activité (série de jours) -----------------------------------
const ACT = 'ortho-activity';
const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function markActivity() {
  try {
    const set = new Set(JSON.parse(localStorage.getItem(ACT) || '[]'));
    set.add(dayKey());
    localStorage.setItem(ACT, JSON.stringify([...set].slice(-400)));
  } catch {}
}
export function streak() {
  let set;
  try { set = new Set(JSON.parse(localStorage.getItem(ACT) || '[]')); } catch { return 0; }
  let n = 0;
  const d = new Date();
  if (!set.has(dayKey(d))) d.setDate(d.getDate() - 1); // la série tient encore si on n'a pas révisé aujourd'hui
  while (set.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
