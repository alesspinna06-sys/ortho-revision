// Base locale IndexedDB : rapide, sans serveur, sans dépendance lourde.
// Version 2 : dossiers (folders) et médias (schémas extraits des documents).
import { openDB } from './idb-lite.js';
import { useEffect, useState } from 'react';

const dbp = openDB('ortho-revision', 3, {
  upgrade(db, oldVersion) {
    if (oldVersion < 1) {
      db.createObjectStore('courses', { keyPath: 'id' });
      db.createObjectStore('flashcards', { keyPath: 'id' }).createIndex('courseId', 'courseId');
      db.createObjectStore('questions', { keyPath: 'id' }).createIndex('courseId', 'courseId');
      db.createObjectStore('history', { keyPath: 'id' });
    }
    if (oldVersion < 2) {
      db.createObjectStore('folders', { keyPath: 'id' });
      db.createObjectStore('media', { keyPath: 'id' }).createIndex('courseId', 'courseId');
    }
    if (oldVersion < 3) {
      db.createObjectStore('trash', { keyPath: 'id' }); // corbeille : cours supprimés ou fusionnés (30 jours)
      db.createObjectStore('refs', { keyPath: 'id' });  // fiches de référence (tests de bilan, chiffres clés…)
      db.createObjectStore('sims', { keyPath: 'id' });  // sessions de patient simulé
    }
  },
});

// --- Petit système d'abonnement : les vues se rafraîchissent après chaque écriture
const listeners = new Set();
let emitTimer = null;
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() {
  clearTimeout(emitTimer);
  emitTimer = setTimeout(() => listeners.forEach((f) => f()), 16); // regroupe les écritures rapprochées
}

/** Force le rafraîchissement des vues (après une série d'écritures silencieuses). */
export const refreshViews = () => emit();

export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

/** Hook : charge des données et se met à jour automatiquement. */
export function useDb(loader, deps = []) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true;
    const run = () => loader().then((d) => alive && setData(d)).catch(console.error);
    run();
    const un = subscribe(run);
    return () => { alive = false; un(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return data;
}

// --- Dossiers -----------------------------------------------------------------------
export const FOLDER_COLORS = ['#5b5bf7', '#8b5cf6', '#ec4899', '#ef4444', '#f59e0b', '#22c55e', '#06b6d4', '#64748b'];

export async function getFolders() {
  const all = await (await dbp).getAll('folders');
  return all.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}
export async function getFolder(id) { return (await dbp).get('folders', id); }
export async function addFolder({ name, color }) {
  const now = Date.now();
  const folder = { id: uid(), name: name.trim() || 'Nouveau dossier', color: color || FOLDER_COLORS[0], createdAt: now, updatedAt: now };
  await (await dbp).put('folders', folder);
  emit();
  return folder;
}
export async function updateFolder(id, patch) {
  const db = await dbp;
  const f = await db.get('folders', id);
  if (!f) return null;
  const next = { ...f, ...patch, updatedAt: Date.now() };
  await db.put('folders', next);
  emit();
  return next;
}
/** Supprimer un dossier ne supprime pas ses cours : ils reviennent à la racine. */
export async function deleteFolder(id) {
  const db = await dbp;
  const linked = (await db.getAll('courses')).filter((c) => c.folderId === id);
  for (const c of linked) await db.put('courses', { ...c, folderId: null });
  await db.delete('folders', id);
  emit();
}

// --- Cours ------------------------------------------------------------------------
export async function getCourses() {
  const all = await (await dbp).getAll('courses');
  return all.sort((a, b) => b.createdAt - a.createdAt);
}
export async function getCourse(id) { return (await dbp).get('courses', id); }
export async function addCourse(data) {
  const now = Date.now();
  const course = {
    id: uid(), title: 'Nouveau cours', subject: '', text: '', summary: '', keyTerms: [], diagrams: [],
    folderId: null, sourceType: 'text', sourceName: '', status: 'idle', error: '', createdAt: now, updatedAt: now, ...data,
  };
  await (await dbp).put('courses', course);
  emit();
  return course;
}
export async function updateCourse(id, patch) {
  const db = await dbp;
  const c = await db.get('courses', id);
  if (!c) return null;
  const next = { ...c, ...patch, updatedAt: Date.now() };
  await db.put('courses', next);
  emit();
  return next;
}
/** Copie complète d'un cours (pour la corbeille). */
async function bundleOf(tx, id) {
  const bundle = { course: await tx.objectStore('courses').get(id) };
  for (const store of ['flashcards', 'questions', 'media']) bundle[store] = await tx.objectStore(store).index('courseId').getAll(id);
  return bundle;
}
async function removeCourseIn(tx, id) {
  tx.objectStore('courses').delete(id);
  for (const store of ['flashcards', 'questions', 'media']) {
    const keys = await tx.objectStore(store).index('courseId').getAllKeys(id);
    keys.forEach((k) => tx.objectStore(store).delete(k));
  }
}
/** Supprime un cours : il part dans la corbeille (récupérable 30 jours), avec ses cartes, QCM et schémas. */
export async function deleteCourse(id) {
  const db = await dbp;
  const tx = db.transaction(['courses', 'flashcards', 'questions', 'media', 'trash'], 'readwrite');
  const bundle = await bundleOf(tx, id);
  if (bundle.course) {
    tx.objectStore('trash').put({ id: uid(), kind: 'course', title: bundle.course.title, deletedAt: Date.now(), bundles: [bundle] });
    await removeCourseIn(tx, id);
  }
  await tx.done;
  emit();
}

// --- Corbeille ---------------------------------------------------------------------
export const TRASH_DAYS = 30;
export async function getTrash() {
  const all = await (await dbp).getAll('trash');
  return all.sort((a, b) => b.deletedAt - a.deletedAt);
}
/** Restaure un élément de la corbeille. Pour une fusion : le cours fusionné est remplacé par les cours d'origine. */
export async function restoreTrash(entryId) {
  const db = await dbp;
  const entry = await db.get('trash', entryId);
  if (!entry) return;
  const tx = db.transaction(['courses', 'flashcards', 'questions', 'media', 'trash'], 'readwrite');
  if (entry.kind === 'merge' && entry.targetId) await removeCourseIn(tx, entry.targetId);
  for (const b of entry.bundles || []) {
    if (!b.course) continue;
    tx.objectStore('courses').put(b.course);
    for (const store of ['flashcards', 'questions', 'media']) (b[store] || []).forEach((it) => tx.objectStore(store).put(it));
  }
  tx.objectStore('trash').delete(entryId);
  await tx.done;
  emit();
}
export async function deleteTrash(entryId) { await (await dbp).delete('trash', entryId); emit(); }
export async function emptyTrash() {
  const db = await dbp;
  const tx = db.transaction('trash', 'readwrite');
  await tx.store.clear();
  await tx.done;
  emit();
}
/** Vide automatiquement ce qui est dans la corbeille depuis plus de 30 jours. */
export async function purgeTrash() {
  const limit = Date.now() - TRASH_DAYS * 86400000;
  const old = (await getTrash()).filter((e) => e.deletedAt < limit);
  for (const e of old) await (await dbp).delete('trash', e.id);
  if (old.length) emit();
}

// --- Fiches de référence (tests de bilan, chiffres clés…) et sessions -------------
export async function getRefs(kind) {
  const all = await (await dbp).getAll('refs');
  return (kind ? all.filter((r) => r.kind === kind) : all).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr'));
}
export async function putRef(r) { await (await dbp).put('refs', { updatedAt: Date.now(), ...r }); emit(); return r; }
export async function putRefs(list) {
  const db = await dbp;
  const tx = db.transaction('refs', 'readwrite');
  list.forEach((r) => tx.store.put(r));
  await tx.done;
  emit();
}
export async function deleteRef(id) { await (await dbp).delete('refs', id); emit(); }
export async function getSims() {
  const all = await (await dbp).getAll('sims');
  return all.sort((a, b) => b.createdAt - a.createdAt);
}
export async function getSim(id) { return (await dbp).get('sims', id); }
export async function putSim(x) { await (await dbp).put('sims', { ...x, updatedAt: Date.now() }); emit(); return x; }
export async function deleteSim(id) { await (await dbp).delete('sims', id); emit(); }

/**
 * Fusionne plusieurs cours dans `targetId`. Rien n'est perdu : les textes sont mis bout à bout,
 * les flashcards (avec leur progression), les QCM, les images et l'historique passent au cours cible.
 * Les flashcards et questions en double (même recto, même énoncé) ne sont gardées qu'une fois. Les autres cours sont supprimés.
 */
export async function mergeCourses(targetId, otherIds) {
  const db = await dbp;
  const target = await db.get('courses', targetId);
  const others = (await Promise.all(otherIds.filter((id) => id !== targetId).map((id) => db.get('courses', id)))).filter(Boolean);
  if (!target || !others.length) return null;
  const all = [target, ...others];
  const key = (t = '') => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

  const seenTerms = new Set();
  const keyTerms = all.flatMap((c) => c.keyTerms || []).filter((k) => {
    const t = key(k.term);
    if (!t || seenTerms.has(t)) return false;
    seenTerms.add(t);
    return true;
  });
  let nextId = 1001;
  const generated = all.flatMap((c) => (c.diagrams || []).filter((d) => d.generated)).map((d) => ({ ...d, id: nextId++ }));

  const tx = db.transaction(['courses', 'flashcards', 'questions', 'media', 'history', 'trash'], 'readwrite');
  // Copie de sécurité : la fusion peut être annulée depuis la corbeille pendant 30 jours
  const bundles = [];
  for (const c of all) bundles.push(await bundleOf(tx, c.id));
  tx.objectStore('trash').put({
    id: uid(), kind: 'merge', targetId, deletedAt: Date.now(),
    title: `Fusion de ${all.length} cours : ${all.map((c) => c.title).join(' + ')}`, bundles,
  });
  // Doublons : même recto de flashcard, ou même énoncé de question
  const seen = {
    flashcards: new Set((await tx.objectStore('flashcards').index('courseId').getAll(targetId)).map((c) => key(c.front))),
    questions: new Set((await tx.objectStore('questions').index('courseId').getAll(targetId)).map((q) => key(q.question))),
  };
  const otherSet = new Set(others.map((o) => o.id));
  for (const o of others) {
    for (const store of ['flashcards', 'questions', 'media']) {
      const items = await tx.objectStore(store).index('courseId').getAll(o.id);
      for (const it of items) {
        if (seen[store]) {
          const k = key(store === 'flashcards' ? it.front : it.question);
          if (seen[store].has(k)) { tx.objectStore(store).delete(it.id); continue; }
          seen[store].add(k);
        }
        tx.objectStore(store).put({ ...it, courseId: targetId });
      }
    }
    tx.objectStore('courses').delete(o.id);
  }
  for (const h of await tx.objectStore('history').getAll()) {
    if (otherSet.has(h.courseId)) tx.objectStore('history').put({ ...h, courseId: targetId });
  }
  const merged = {
    ...target,
    text: all.map((c) => `# ${c.title}\n\n${(c.text || '').trim()}`).join('\n\n---\n\n'),
    keyTerms,
    diagrams: [...(target.diagrams || []).filter((d) => !d.generated), ...generated],
    sourceName: `Fusion de ${all.length} cours`,
    mergedFrom: [...(target.mergedFrom || []), ...others.map((o) => ({ id: o.id, title: o.title, sourceName: o.sourceName || '' }))],
    mediaCount: all.reduce((n, c) => n + (c.mediaCount || 0), 0),
    titleLocked: false,
    updatedAt: Date.now(),
  };
  tx.objectStore('courses').put(merged);
  await tx.done;
  emit();
  return merged;
}

// --- Médias : schémas et pages des documents d'origine (envoyés à l'IA pour la fiche) --
export async function getMedia(courseId) {
  return (await dbp).getAllFromIndex('media', 'courseId', courseId);
}
export async function addMedia(courseId, list) {
  if (!list?.length) return;
  const db = await dbp;
  const tx = db.transaction('media', 'readwrite');
  list.forEach((m) => tx.store.put({ id: uid(), courseId, ...m }));
  await tx.done;
}
/** Remplace les médias d'un cours (ajout des schémas à un cours déjà importé). */
export async function replaceMedia(courseId, list) {
  const db = await dbp;
  const tx = db.transaction('media', 'readwrite');
  const keys = await tx.store.index('courseId').getAllKeys(courseId);
  keys.forEach((k) => tx.store.delete(k));
  list.forEach((m) => tx.store.put({ id: uid(), courseId, ...m }));
  await tx.done;
  await updateCourse(courseId, { mediaCount: list.length });
}

// --- Flashcards -------------------------------------------------------------------
export async function getCards(courseId) {
  const db = await dbp;
  return courseId ? db.getAllFromIndex('flashcards', 'courseId', courseId) : db.getAll('flashcards');
}
export async function addCards(cards) {
  const db = await dbp;
  const tx = db.transaction('flashcards', 'readwrite');
  cards.forEach((c) => tx.store.put(c));
  await tx.done;
  emit();
}
export async function getCard(id) { return (await dbp).get('flashcards', id); }
export async function putCard(card, { silent = false } = {}) {
  await (await dbp).put('flashcards', card);
  if (!silent) emit();
}
export async function deleteCard(id) { await (await dbp).delete('flashcards', id); emit(); }

// --- Questions (QCM & cas cliniques) ----------------------------------------------
export async function getQuestions(courseId) {
  const db = await dbp;
  return courseId ? db.getAllFromIndex('questions', 'courseId', courseId) : db.getAll('questions');
}
export async function addQuestions(list) {
  const db = await dbp;
  const tx = db.transaction('questions', 'readwrite');
  list.forEach((q) => tx.store.put(q));
  await tx.done;
  emit();
}
export async function putQuestion(q, { silent = false } = {}) {
  await (await dbp).put('questions', q);
  if (!silent) emit();
}
export async function deleteQuestion(id) { await (await dbp).delete('questions', id); emit(); }

// --- Historique ---------------------------------------------------------------------
export async function addHistory(entry) {
  await (await dbp).put('history', { id: uid(), date: Date.now(), ...entry });
  emit();
}
export async function getHistory() {
  const all = await (await dbp).getAll('history');
  return all.sort((a, b) => b.date - a.date);
}

// --- Temps passé (un enregistrement par jour dans « history », type « time ») ---------------
const addTo = (o = {}, add = {}) => { Object.entries(add).forEach(([k, v]) => { o[k] = (o[k] || 0) + v; }); return o; };
export async function addTime(day, delta) {
  const db = await dbp;
  const id = `time-${day}`;
  const cur = (await db.get('history', id)) || { id, type: 'time', day, date: new Date(`${day}T12:00:00`).getTime(), total: 0, byCourse: {}, byView: {}, byTab: {} };
  await db.put('history', {
    ...cur,
    total: cur.total + (delta.total || 0),
    byCourse: addTo(cur.byCourse, delta.byCourse),
    byView: addTo(cur.byView, delta.byView),
    byTab: addTo(cur.byTab, delta.byTab),
  });
  // pas d'emit() : écrire toutes les 30 s ne doit pas redessiner les écrans
}
export async function getTimes() {
  const all = await (await dbp).getAll('history');
  return all.filter((h) => h.type === 'time').sort((a, b) => a.day.localeCompare(b.day));
}
export async function clearTimes() {
  const db = await dbp;
  for (const h of await db.getAll('history')) if (h.type === 'time') await db.delete('history', h.id);
  emit();
}
/** Coche / décoche un cours « acquis ». */
export async function setAcquired(id, acquired) {
  return updateCourse(id, { acquired: !!acquired, acquiredAt: acquired ? Date.now() : null });
}

// --- Sauvegarde / restauration ---------------------------------------------------
const STORES = ['folders', 'courses', 'media', 'flashcards', 'questions', 'history', 'refs', 'sims'];
export async function exportAll() {
  const db = await dbp;
  const out = { app: 'ortho-revision', version: 2, exportedAt: new Date().toISOString() };
  for (const s of STORES) out[s] = await db.getAll(s);
  return out;
}
export async function importAll(data, { replace = false } = {}) {
  if (data?.app !== 'ortho-revision') throw new Error("Ce fichier n'est pas une sauvegarde Ortho Révision.");
  const db = await dbp;
  const tx = db.transaction(STORES, 'readwrite');
  for (const s of STORES) {
    if (replace) await tx.objectStore(s).clear();
    for (const item of data[s] || []) tx.objectStore(s).put(item);
  }
  await tx.done;
  emit();
}
export async function clearAll() {
  await emptyTrash();
  const db = await dbp;
  const tx = db.transaction(STORES, 'readwrite');
  STORES.forEach((s) => tx.objectStore(s).clear());
  await tx.done;
  emit();
}
