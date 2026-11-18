// Détection des cours proches, entièrement locale (aucun appel à l'IA, aucun quota).
// Chaque cours devient un vecteur de mots pondérés (titre, termes clés, fiche, texte),
// puis on compare les cours deux à deux (similarité cosinus) et on forme des groupes.

const norm = (s = '') => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Mots trop courants pour distinguer deux cours
const STOP = new Set(`
alors apres aussi autre autres avant avec avoir avait ayant cela celle celles celui cette ceux chaque chez comme comment
dans depuis donc dont elle elles encore entre etait etre fait faire font leur leurs lors mais meme memes moins notamment
nous parce pendant peut peuvent plus pour pourquoi quand quel quelle quelles quels sans selon sera seront sont sous souvent
suite surtout tous tout toute toutes tres vers vous ainsi enfin page pages diapositive diapositives notes cours chapitre
partie exemple exemples definition definitions introduction conclusion retenir important importante general generale
`.split(/\s+/).filter(Boolean));

function tokens(s) {
  return norm(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !STOP.has(w) && !/^\d+$/.test(w));
}

function vector(course) {
  const v = new Map();
  const add = (s, w) => tokens(s).forEach((t) => v.set(t, (v.get(t) || 0) + w));
  add(course.title || '', 4);
  add(course.subject || '', 2);
  (course.keyTerms || []).forEach((k) => add(k.term || '', 3));
  add((course.summary || '').slice(0, 15000), 1);
  add((course.text || '').slice(0, 30000), 0.5);
  let n = 0;
  for (const [k, x] of v) { const w = Math.log1p(x); v.set(k, w); n += w * w; }
  return { v, n: Math.sqrt(n) || 1 };
}

function cosine(a, b) {
  const [small, big] = a.v.size < b.v.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [k, w] of small.v) { const o = big.v.get(k); if (o) dot += w * o; }
  return dot / (a.n * b.n);
}

export const pairKey = (a, b) => [a, b].sort().join('|');

/** Seuils : au-dessus de MERGE, les cours parlent presque du même sujet. */
export const SENSITIVITY = { strict: 0.45, normal: 0.3, large: 0.2 };
export const MERGE = 0.55;

/**
 * Renvoie des groupes de cours proches : [{ courses, score, pairs }], du plus proche au moins proche.
 * ignored : Set de pairKey que l'utilisatrice a choisi d'ignorer.
 */
export function findSimilar(courses, { threshold = SENSITIVITY.normal, ignored = new Set() } = {}) {
  const list = courses.filter((c) => (c.text || c.summary || '').trim());
  const vecs = list.map(vector);
  const pairs = [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      if (ignored.has(pairKey(list[i].id, list[j].id))) continue;
      const score = cosine(vecs[i], vecs[j]);
      if (score >= threshold) pairs.push({ a: list[i].id, b: list[j].id, score });
    }
  }
  // Groupes = composantes connexes (union-find)
  const parent = new Map(list.map((c) => [c.id, c.id]));
  const find = (x) => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x))), parent.get(x)));
  pairs.forEach(({ a, b }) => parent.set(find(a), find(b)));
  const groups = new Map();
  pairs.forEach((p) => {
    const root = find(p.a);
    if (!groups.has(root)) groups.set(root, { ids: new Set(), pairs: [] });
    const g = groups.get(root);
    g.ids.add(p.a); g.ids.add(p.b); g.pairs.push(p);
  });
  const byId = new Map(list.map((c) => [c.id, c]));
  return [...groups.values()]
    .map((g) => ({
      courses: [...g.ids].map((id) => byId.get(id)).sort((x, y) => x.createdAt - y.createdAt),
      score: Math.max(...g.pairs.map((p) => p.score)),
      pairs: g.pairs,
    }))
    .sort((x, y) => y.score - x.score);
}

/** Nom proposé pour un dossier regroupant ces cours. */
export function suggestFolderName(courses) {
  const subjects = courses.map((c) => (c.subject || '').trim()).filter(Boolean);
  if (subjects.length) {
    const counts = subjects.reduce((m, s) => m.set(s, (m.get(s) || 0) + 1), new Map());
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }
  return (courses[0]?.title || 'Nouveau dossier').slice(0, 40);
}
