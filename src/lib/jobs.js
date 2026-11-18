// File d'attente des générations IA : une seule à la fois (ménage le CPU,
// la connexion et le quota gratuit de Gemini).
import { useEffect, useState } from 'react';
import { getCourse, getCourses, updateCourse, getCards, addCards, getQuestions, addQuestions, getMedia } from './db.js';
import { generateFlashcards, generateQuestions, generateCrossQuestions } from './ai.js';
import { generateDiagrams, generateDeepening, generateFullCourse, generateSynthesis, insertSchema, colorizeCourse } from './ai-extra.js';
import { headings } from './markdown.js';
import { DOMAIN } from './domain.js';
import { getSettings } from './settings.jsx';
import { GEN_VERSION, withEvent, logGen } from './genHistory.js';

const queue = [];
const state = new Map(); // courseId -> { label, step, total }
const listeners = new Set();
let running = false;
let notify = () => {};
const cancelled = new Set(); // cours dont l'arrêt a été demandé
let current = null;          // cours en cours de génération
let recovered = false;
let fallbackWarned = false;
if (typeof window !== 'undefined') {
  window.addEventListener('gemini-fallback', (e) => {
    if (fallbackWarned) return;
    fallbackWarned = true;
    notify({ type: 'info', text: `Gemini est surchargé chez Google : le logiciel utilise ${e.detail?.model || 'un autre modèle'} en attendant (ta clé n'y est pour rien).` });
  });
}
class Cancelled extends Error { constructor() { super('Génération arrêtée'); this.cancelled = true; } }

export const setJobNotifier = (fn) => { notify = fn; };
const emit = () => listeners.forEach((f) => f(new Map(state)));

export function useJobs() {
  const [s, setS] = useState(new Map(state));
  useEffect(() => { listeners.add(setS); recoverInterrupted().catch(() => {}); return () => listeners.delete(setS); }, []);
  return s;
}

/**
 * tasks : sous-ensemble de ['summary', 'cards', 'questions', 'cross']
 */
export function enqueue(courseId, tasks0 = ['summary', 'cards', 'questions', 'cross'], opts = {}) {
  if (state.has(courseId) && !opts.force) return;
  // Chaque fiche (re)générée s'accompagne de sa synthèse
  const tasks = tasks0.includes('summary') && !tasks0.includes('synthesis') ? [...tasks0, 'synthesis'] : tasks0;
  queue.push({ courseId, tasks, opts });
  state.set(courseId, { label: 'En attente…', step: 0, total: tasks.length, queued: true });
  renumber();
  emit();
  run();
}

// Numéro de chaque cours en attente (n°1 = prochain)
function renumber() {
  queue.forEach((j, i) => {
    const st = state.get(j.courseId);
    if (st) state.set(j.courseId, { ...st, queued: true, pos: i + 1, label: queue.length > 1 ? `En attente · n°${i + 1}` : 'En attente…' });
  });
}

/** Passe un cours en attente devant tous les autres. */
export function prioritize(courseId) {
  const i = queue.findIndex((j) => j.courseId === courseId);
  if (i <= 0) return;
  const [job] = queue.splice(i, 1);
  queue.unshift(job);
  renumber();
  emit();
}

/** Retire un cours de la file ; s'il est en cours, l'arrête dès que possible (à la fin de l'étape commencée). */
export function cancelJob(courseId) {
  const i = queue.findIndex((j) => j.courseId === courseId);
  if (i >= 0) {
    queue.splice(i, 1);
    state.delete(courseId);
    renumber();
    emit();
    return;
  }
  if (current === courseId) {
    cancelled.add(courseId);
    state.set(courseId, { ...(state.get(courseId) || {}), label: 'Arrêt en cours…' });
    emit();
  }
}

/** Vide la file et arrête la génération en cours. */
export function cancelAll() {
  queue.splice(0).forEach((j) => state.delete(j.courseId));
  if (current) cancelJob(current);
  emit();
}

/** Au démarrage : un cours resté « en génération » (logiciel fermé en route) retrouve un état normal. */
export async function recoverInterrupted() {
  if (recovered) return;
  recovered = true;
  const list = await getCourses();
  for (const c of list) {
    if (c.status === 'generating' && !state.has(c.id)) {
      await updateCourse(c.id, c.summary ? { status: 'ready', error: '' } : { status: 'error', error: 'Génération interrompue (le logiciel a été fermé). Relance-la avec « Régénérer ».' });
    }
  }
}

// Tâches à la demande : elles ne changent pas le statut du cours (« Prêt », « Erreur »…)
const EXTRAS = ['diagrams', 'deepen', 'synthesis', 'colorize'];
const extrasOnly = (tasks) => tasks.every((t) => EXTRAS.includes(t));

// Plafond des images envoyées à l'IA (utile après une fusion de cours)
const MEDIA_MAX = 12;
const MEDIA_BUDGET = 9 * 1024 * 1024;
function capMedia(list) {
  const out = [];
  let size = 0;
  for (const m of list) {
    if (out.length >= MEDIA_MAX) break;
    if (size + (m.data?.length || 0) > MEDIA_BUDGET) continue;
    size += m.data?.length || 0;
    out.push(m);
  }
  return out;
}

async function run() {
  if (running) return;
  running = true;
  while (queue.length) {
    const job = queue.shift();
    current = job.courseId;
    state.set(job.courseId, { ...(state.get(job.courseId) || {}), label: 'Démarrage…', queued: false, pos: 0 });
    renumber();
    emit();
    try { await process(job); }
    catch (err) {
      if (err?.cancelled) {
        // Arrêt demandé : le cours retrouve son état d'avant (l'ancienne version n'est remplacée qu'à la fin)
        if (!extrasOnly(job.tasks)) {
          const c = await getCourse(job.courseId).catch(() => null);
          if (c) await updateCourse(job.courseId, { status: c.summary ? 'ready' : (job.prevStatus || 'error'), error: !c.summary && !job.prevStatus ? 'Génération arrêtée.' : '' }).catch(() => {});
        }
        notify({ type: 'info', text: 'Génération arrêtée.' });
      } else {
        console.error(err);
        if (!extrasOnly(job.tasks)) await updateCourse(job.courseId, { status: 'error', error: err.message });
        logGen(job.courseId, { kind: 'echec', by: 'gemini', detail: String(err.message || '').slice(0, 160) }).catch(() => {});
        notify({ type: 'error', text: err.message });
      }
    }
    cancelled.delete(job.courseId);
    current = null;
    state.delete(job.courseId);
    emit();
  }
  running = false;
}

async function process(job) {
  const { courseId, tasks, opts } = job;
  const s = getSettings();
  let course = await getCourse(courseId);
  if (!course) return;
  if (!course.text?.trim()) throw new Error('Ce cours ne contient pas de texte à analyser.');
  const onlyExtras = extrasOnly(tasks);
  if (!onlyExtras) {
    job.prevStatus = course.status === 'generating' ? undefined : course.status;
    await updateCourse(courseId, { status: 'generating', error: '' });
  }
  const total = tasks.length;
  let step = 0;
  const check = () => { if (cancelled.has(courseId)) throw new Cancelled(); };
  const progress = (label) => { check(); state.set(courseId, { label, step, total, queued: false }); emit(); };

  if (tasks.includes('summary')) {
    progress('Rédaction du cours complet…');
    // Retranscription détaillée (partie par partie) ; images envoyées pour recréer les schémas
    const media = capMedia(await getMedia(courseId));
    const r = await generateFullCourse(course, media, progress);
    check(); // arrêt demandé pendant la rédaction : on ne remplace pas l'ancien cours
    if (r.notice) notify({ type: 'error', text: `${r.notice} Le cours a été rédigé sans eux.` });
    course = await updateCourse(courseId, {
      summary: r.summary,
      fullCourse: true, // retranscription complète (et non plus fiche courte)
      verifiedAt: null, verifyLater: false, summaryBackup: null, // nouveau texte : nouvelle relecture par Claude possible
      genVersion: GEN_VERSION,
      genHistory: withEvent(course, { kind: 'cours', by: 'gemini', model: getSettings().model || '', detail: `${(r.diagrams || []).length} schéma(s)` }),
      keyTerms: r.keyTerms || [],
      // Les schémas recréés depuis le cours sont remplacés ; ceux générés à la demande sont gardés
      diagrams: [...(r.diagrams || []), ...(course.diagrams || []).filter((d) => d.generated)],
      subject: course.subject || r.subject || '',
      title: course.titleLocked ? course.title : (r.title || course.title),
    });
    step++;
  }
  if (tasks.includes('synthesis')) {
    progress('Rédaction de la synthèse…');
    let ok = false;
    try {
      if (!course.summary) throw new Error("Le cours complet doit d'abord être rédigé.");
      const synthesis = await generateSynthesis(course, progress);
      course = await updateCourse(courseId, { synthesis, synthesisAt: Date.now(), synthesisV: 2, genHistory: withEvent(course, { kind: 'synthese', by: 'gemini' }) });
      ok = true;
    } catch (err) {
      if (err?.cancelled) throw err;
      // La synthèse est un plus : son échec ne fait pas échouer le cours
      notify({ type: 'error', text: `Synthèse de « ${course.title} » : ${err.message}` });
    }
    step++;
    if (onlyExtras && ok) notify({ type: 'success', text: `Synthèse de « ${course.title} » prête` });
  }
  if (tasks.includes('cards')) {
    progress('Création des flashcards…');
    const existing = await getCards(courseId);
    const cards = await generateFlashcards(course, opts.cards || s.cardsPerCourse, existing);
    await addCards(cards);
    step++;
  }
  if (tasks.includes('questions')) {
    progress(`Création des ${DOMAIN.questionsLabel || 'QCM'}…`);
    const existing = await getQuestions(courseId);
    const qs = await generateQuestions(course, opts.questions || s.questionsPerCourse, existing);
    await addQuestions(qs);
    step++;
  }
  if (tasks.includes('cross') && s.crossQuestions) {
    const others = (await getCourses()).filter((c) => c.id !== courseId && c.status === 'ready');
    if (others.length) {
      progress('Liens avec tes autres cours…');
      try { await addQuestions(await generateCrossQuestions(course, others)); }
      catch (e) { console.warn('Questions transversales ignorées :', e); }
    }
    step++;
  }
  if (tasks.includes('diagrams')) {
    progress('Création des schémas…');
    const existing = (course.diagrams || []).filter((d) => d.generated);
    const terms = opts.diagramTerms || [];
    const requestLabel = terms.length ? `Termes : ${terms.join(', ')}${opts.diagramRequest ? ` — ${opts.diagramRequest}` : ''}` : (opts.diagramRequest || '');
    const made = await generateDiagrams(course, {
      request: opts.diagramRequest || '', existing, terms, count: opts.diagramCount || 2,
      sections: headings(course.summary || '').map((h) => h.text),
    });
    if (!made.length) throw new Error("L'IA n'a pas produit de schéma valide. Réessaie, éventuellement avec une consigne plus précise.");
    // Identifiants à partir de 1001 : jamais confondus avec les repères [[schema:N]] de la fiche
    let next = Math.max(1000, ...(course.diagrams || []).map((d) => Number(d.id) || 0)) + 1;
    const added = made.map((d) => ({ ...d, id: next++, generated: true, request: requestLabel, createdAt: Date.now() }));
    // Le schéma est inséré dans la partie du cours qui le concerne (et non à la fin de la fiche)
    const summary = added.reduce((md, d) => insertSchema(md, d.section, d.id, `${d.title} ${d.caption || ''}`), course.summary || '');
    course = await updateCourse(courseId, { diagrams: [...(course.diagrams || []), ...added], summary, genHistory: withEvent(course, { kind: 'schemas', by: 'gemini', detail: added.map((d) => d.title).join(', ') }) });
    step++;
    if (onlyExtras) notify({ type: 'success', text: `${added.length} schéma${added.length > 1 ? 's' : ''} ajouté${added.length > 1 ? 's' : ''} à « ${course.title} »` });
  }
  if (tasks.includes('colorize')) {
    progress('Mise en couleurs du cours…');
    const r = await colorizeCourse(course, progress);
    course = await updateCourse(courseId, { summary: r.summary, colorized: Date.now(), genHistory: withEvent(course, { kind: 'couleurs', by: 'gemini' }) });
    step++;
    if (onlyExtras) notify({ type: r.kept === r.parts ? 'error' : 'success', text: r.kept === r.parts ? `« ${course.title} » : la mise en couleurs n'a pas pu être faite sans changer le texte, le cours est resté tel quel.` : `« ${course.title} » est mis en couleurs${r.kept ? ` (${r.kept} partie${r.kept > 1 ? 's' : ''} laissée${r.kept > 1 ? 's' : ''} telle${r.kept > 1 ? 's' : ''} quelle${r.kept > 1 ? 's' : ''})` : ''}` });
  }
  if (tasks.includes('deepen')) {
    progress(opts.withNews === false ? 'Approfondissement du cours…' : 'Recherche d’informations et d’actualités…');
    const deepening = await generateDeepening(course, { focus: opts.focus || '', withNews: opts.withNews !== false });
    course = await updateCourse(courseId, { deepening });
    step++;
    if (onlyExtras) notify({ type: 'success', text: `Approfondissement de « ${course.title} » prêt` });
  }
  if (onlyExtras) return;
  await updateCourse(courseId, { status: 'ready', error: '', generatedAt: Date.now() });
  notify({ type: 'success', text: `« ${course.title} » est prêt à réviser ✨` });
}
