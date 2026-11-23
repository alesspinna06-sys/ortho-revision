// « Reprendre là où je me suis arrêtée » : dernière position de lecture de chaque cours (sur cet ordinateur).
const KEY = 'read-pos';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };

/** { courseId: { blockText, heading, headingText, part, parts, ratio, at } } */
export const getReadPositions = () => load();
export const getReadPos = (courseId) => load()[courseId] || null;
export function saveReadPos(courseId, pos) {
  const all = load();
  all[courseId] = { ...pos, at: Date.now() };
  // On garde les 200 cours lus le plus récemment
  const keep = Object.entries(all).sort((a, b) => b[1].at - a[1].at).slice(0, 200);
  try { localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(keep))); } catch { /* stockage indisponible */ }
}
export function clearReadPos(courseId) {
  const all = load();
  delete all[courseId];
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* */ }
}
/** Dernier cours lu (parmi ceux qui existent encore), pour l'accueil et la palette de commandes. */
export function lastRead(courses) {
  const all = load();
  const ids = new Set(courses.map((c) => c.id));
  const best = Object.entries(all).filter(([id, p]) => ids.has(id) && p.ratio > 0.02 && p.ratio < 0.97).sort((a, b) => b[1].at - a[1].at)[0];
  return best ? { course: courses.find((c) => c.id === best[0]), pos: best[1] } : null;
}
