// Travaux lancés en arrière-plan depuis l'interface : podcast d'un cours, définition d'un mot.
// Ils passent par runTask (tasks.js) : on peut fermer la fenêtre ou changer de page, la barre des tâches suit l'avancement.
import { runTask, cancelTask } from './tasks.js';
import { api } from './bridge.js';
import { getCourse, updateCourse, getCards, addCards, uid } from './db.js';
import { newSrs } from './srs.js';
import { normTerm, highlightTerm } from './terms.js';
import { podcastScript } from './ai-extra.js';

// ---------------------------------------------------------------------------
// Mot important : définition + surlignage + flashcard
// ---------------------------------------------------------------------------
/** Ajoute un mot au glossaire (lit le cours à jour, ce qui permet de l'appeler après la fermeture de la fenêtre). */
export async function saveTerm(courseId, term, definition, sources = []) {
  const course = await getCourse(courseId);
  if (!course) throw new Error('Cours introuvable.');
  const nk = normTerm(term);
  const before = course.summary || '';
  const after = highlightTerm(before, term);
  await updateCourse(courseId, {
    keyTerms: [...(course.keyTerms || []).filter((k) => normTerm(k.term) !== nk), { term, definition, manual: true, ...(sources.length ? { sources } : {}) }],
    summary: after,
  });
  const hasCard = (await getCards(courseId)).some((c) => normTerm(c.front) === nk);
  if (!hasCard) await addCards([{ id: uid(), courseId, front: term, back: definition, category: 'Définition', srs: newSrs(), createdAt: Date.now() }]);
  return `${after !== before ? 'surligné dans le cours, ' : ''}ajouté au glossaire${hasCard ? '' : ' et aux flashcards'}`;
}

/**
 * Termine en arrière-plan une recherche de définition déjà lancée (`pending` = promesse de defineTerm),
 * puis ajoute le mot au cours. La fenêtre « Mot important » peut être fermée.
 */
export function defineInBackground(course, term, pending) {
  return runTask({
    key: `def:${course.id}:${normTerm(term)}`,
    kind: 'definition',
    title: `Définition « ${term} »`,
    courseId: course.id,
    run: async (ctx) => {
      ctx.progress(null, 'Recherche de la définition…');
      const r = await pending;
      ctx.check();
      if (!r?.definition) throw new Error('Aucune définition trouvée.');
      ctx.progress(0.9, 'Ajout au cours…');
      return saveTerm(course.id, term, r.definition, r.sources || []);
    },
  });
}

// ---------------------------------------------------------------------------
// Podcast : écriture du dialogue (Gemini) puis lecture par les voix (Azure / ElevenLabs)
// ---------------------------------------------------------------------------
export const podcastKey = (courseId) => `podcast:${courseId}`;
const fmtTime = (s) => { const m = Math.floor((s || 0) / 60); const r = Math.round((s || 0) % 60); return `${m} min ${String(r).padStart(2, '0')}`; };

/**
 * opts : { length, engine ('azure'|'eleven'), voices {A, B}, names {A, B}, model, review (bool), draft? }
 * - sans `draft` : Gemini écrit le dialogue ; si `review`, on s'arrête là (brouillon à relire) ;
 * - avec `draft` (ou sans review) : les voix lisent le dialogue, puis le MP3 remplace l'ancien podcast.
 */
export function startPodcast(courseId, title, opts) {
  return runTask({
    key: podcastKey(courseId),
    kind: 'podcast',
    title: `Podcast « ${title} »`,
    courseId,
    onCancel: () => api.podcast?.cancel?.(courseId),
    run: async (ctx) => {
      let draft = opts.draft;
      if (!draft) {
        ctx.progress(null, 'Gemini écrit le dialogue… (1 à 3 minutes)');
        const course = await getCourse(courseId);
        const s = await podcastScript(course, { length: opts.length });
        ctx.check();
        draft = { ...s, length: opts.length, at: Date.now() };
        await updateCourse(courseId, { podcastDraft: draft });
        if (opts.review) return 'dialogue prêt : ouvre le podcast pour le relire';
      }
      const total = draft.lines.length;
      ctx.progress(0.12, `Les voix lisent le dialogue… 0 / ${total}`);
      const off = api.podcast.onProgress((p) => {
        if (p.courseId === courseId) ctx.progress(0.12 + 0.86 * (p.done / p.total), `Les voix lisent le dialogue… ${p.done} / ${p.total}`);
      });
      let r;
      try {
        r = await api.podcast.build({ courseId, engine: opts.engine, lines: draft.lines, voices: opts.voices, modelId: opts.engine === 'azure' ? undefined : opts.model });
      } finally { off(); }
      ctx.check();
      if (!r.ok) throw new Error(r.error);
      await updateCourse(courseId, {
        podcast: { title: draft.title, lines: draft.lines, engine: opts.engine, voices: opts.voices, names: opts.names, model: opts.model, length: draft.length || opts.length, at: Date.now(), seconds: r.seconds, bytes: r.bytes },
        podcastDraft: null,
      });
      return `prêt (${fmtTime(r.seconds)})`;
    },
  });
}

/** Régénère un podcast existant avec les mêmes réglages (nouveau dialogue + nouvel audio). */
export function regeneratePodcast(course) {
  const P = course.podcast;
  if (!P) return null;
  return startPodcast(course.id, course.title, {
    length: P.length || 'moyen', engine: P.engine || 'eleven', voices: P.voices, names: P.names || {}, model: P.model, review: false,
  });
}

export const stopPodcast = (courseId) => cancelTask(podcastKey(courseId));
