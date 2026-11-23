// Toute la logique IA : prompts, schémas JSON structurés, génération.
import { api } from './bridge.js';
import { getSettings } from './settings.jsx';
import { uid } from './db.js';
import { newSrs } from './srs.js';
import { prepareImage, blobToBase64 } from './extract.js';

const MAX_CHARS = 120_000; // ~30 000 mots : largement assez pour un cours

export const SYSTEM = `Tu es un assistant pédagogique expert en orthophonie, qui aide une étudiante à réviser ses cours (formation au Certificat de Capacité d'Orthophoniste).
Règles :
- Tu t'appuies d'abord et avant tout sur le contenu du cours fourni. Tu peux compléter avec des connaissances classiques et consensuelles de la discipline seulement si c'est nécessaire à la compréhension, sans jamais inventer de références, de chiffres ou de tests.
- Tu écris en français, avec une terminologie précise : anatomie et physiologie (phonation, articulation, déglutition, audition), neurologie, linguistique et phonologie, pathologies du langage oral et écrit, de la parole, de la voix, de la déglutition, de la cognition mathématique, troubles neurodéveloppementaux et neurodégénératifs, bilans et prises en charge.
- Tu es clair, structuré et pédagogique.`;

export async function call({ parts, schema, temperature }) {
  const { model } = getSettings();
  const res = await api.gemini.generate({ model, system: SYSTEM, parts, schema, temperature });
  if (!res.ok) throw new Error(res.error);
  if (!schema) return res.text;
  try { return JSON.parse(res.text); }
  catch {
    const m = res.text.match(/[[{][\s\S]*[\]}]/);
    if (m) return JSON.parse(m[0]);
    throw new Error("La réponse de l'IA n'était pas au bon format. Réessaie.");
  }
}

const courseBlock = (course) =>
  `TITRE DU COURS : ${course.title}\n${course.subject ? `MATIÈRE : ${course.subject}\n` : ''}\n--- CONTENU DU COURS ---\n${(course.text || '').slice(0, MAX_CHARS)}\n--- FIN DU COURS ---`;

// ---------------------------------------------------------------------------
// 1. OCR : photos / PDF scannés -> texte structuré
// ---------------------------------------------------------------------------
const OCR_PROMPT = `Transcris fidèlement et intégralement le texte de ce(s) document(s) de cours (manuscrit ou imprimé), dans l'ordre des pages.
- Restitue la structure en Markdown : titres (#, ##), listes (-), numérotations.
- Corrige uniquement les coupures de mots évidentes, ne reformule pas.
- Décris brièvement les schémas entre crochets, ex. [Schéma : coupe sagittale du larynx avec cordes vocales légendées].
- Si un mot est illisible, écris [illisible].
- Ne rajoute aucun commentaire avant ou après la transcription.`;

/** images : tableau de Blob/File. Traité par lots de 6 pour rester léger. */
export async function ocrImages(images, onProgress) {
  const chunks = [];
  for (let i = 0; i < images.length; i += 6) chunks.push(images.slice(i, i + 6));
  const texts = [];
  for (let c = 0; c < chunks.length; c++) {
    onProgress?.(`Lecture des pages ${c * 6 + 1}–${Math.min((c + 1) * 6, images.length)} sur ${images.length}…`);
    const parts = [];
    for (const img of chunks[c]) parts.push({ inlineData: await prepareImage(img) });
    parts.push({ text: OCR_PROMPT });
    texts.push(await call({ parts, temperature: 0.1 }));
  }
  return texts.join('\n\n').trim();
}

export async function ocrPdf(file) {
  if (file.size > 18 * 1024 * 1024) throw new Error('PDF scanné trop lourd (> 18 Mo) : découpe-le en plusieurs fichiers.');
  const data = await blobToBase64(file);
  return call({ parts: [{ inlineData: { mimeType: 'application/pdf', data } }, { text: OCR_PROMPT }], temperature: 0.1 });
}

// ---------------------------------------------------------------------------
// 2. Fiche de synthèse
// ---------------------------------------------------------------------------
const SUMMARY_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING', description: 'Titre court et explicite du cours' },
    subject: { type: 'STRING', description: 'Matière / domaine (ex. Neurologie, Phonétique, Voix, Langage oral, Déglutition…)' },
    summary: { type: 'STRING', description: 'Fiche de synthèse complète au format Markdown' },
    keyTerms: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { term: { type: 'STRING' }, definition: { type: 'STRING' } },
        required: ['term', 'definition'],
      },
    },
    diagrams: {
      type: 'ARRAY',
      description: 'Schémas recréés à partir des images du cours (vide s’il n’y en a pas ou s’ils ne servent pas à la révision)',
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'INTEGER', description: 'Numéro réutilisé dans le texte : [[schema:id]]' },
          title: { type: 'STRING', description: 'Légende courte du schéma' },
          svg: { type: 'STRING', description: 'Code SVG autonome (<svg viewBox=…>…</svg>)' },
        },
        required: ['id', 'title', 'svg'],
      },
    },
  },
  required: ['title', 'subject', 'summary', 'keyTerms', 'diagrams'],
};

/**
 * Nettoie un SVG produit par l'IA avant de l'afficher : seulement des balises
 * graphiques, sans script, sans événement, sans lien externe. Renvoie null sinon.
 */
export function sanitizeSvg(svg = '') {
  let s = String(svg).trim().replace(/^```(?:svg|xml)?\s*/i, '').replace(/```$/, '').trim();
  const start = s.search(/<svg[\s>]/i);
  if (start < 0) return null;
  s = s.slice(start);
  const end = s.toLowerCase().lastIndexOf('</svg>');
  if (end < 0) return null;
  s = s.slice(0, end + 6);
  if (/<\s*(script|foreignobject|iframe|object|embed|image)/i.test(s)) return null;
  s = s.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|xlink:href)\s*=\s*("|')(?!#)[^"']*\2/gi, '');
  if (!/^<svg[\s\S]*<\/svg>$/i.test(s)) return null;
  if (!/viewBox=/i.test(s)) s = s.replace(/<svg/i, '<svg viewBox="0 0 600 400"');
  return s;
}

export async function generateSummary(course, media = []) {
  const withMedia = media.length > 0;
  const visual = withMedia ? `

DOCUMENTS VISUELS JOINTS : ${media.length} image(s) ou page(s) du cours d'origine (diapositives, schémas, pages de manuel).
- Lis-les attentivement : un schéma, un graphique ou un tableau peut contenir une notion absente du texte.
- Si un schéma apporte quelque chose à la révision (anatomie, circuit, classification, étapes d'un processus, modèle, courbe), RECRÉE-LE en SVG dans "diagrams" : un élément par schéma, avec un "id" (1, 2, 3…).
- Règles du SVG : <svg viewBox="0 0 600 400" xmlns="http://www.w3.org/2000/svg"> autonome, largeur 600 maximum, fond transparent (pas de rectangle de fond), texte en français, font-size 14 ou plus, font-family="sans-serif", traits et formes simples, couleurs sobres (#4f6bff, #8b5cf6, #64748b, #22c55e, #f59e0b), pas de script, pas d'image externe.
- Reproduis fidèlement les étiquettes et les flèches du schéma d'origine. N'invente rien qui n'y figure pas.
- Dans "summary", écris la ligne [[schema:id]] seule, à l'endroit où le schéma doit apparaître dans la fiche, et ne le décris pas en texte en plus.
- Si aucune image n'est utile, renvoie "diagrams" vide.` : `

Aucun document visuel n'est joint : "diagrams" doit être vide.`;
  const prompt = `${courseBlock(course)}${visual}

Rédige une FICHE DE RÉVISION structurée de ce cours.
Format du champ "summary" (Markdown) :
- Une phrase d'introduction qui situe le cours.
- Des sections "## …" et sous-sections "### …" qui suivent la logique du cours (définitions, étiologie, sémiologie / signes cliniques, classification, évaluation / bilan, diagnostic différentiel, prise en charge… selon le contenu).
- Des listes à puces concises, avec **gras** pour les notions importantes.
- SURLIGNE chaque terme médical, anatomique, linguistique ou pathologie clé avec la syntaxe ==terme== (ex. ==aphasie de Broca==, ==dysphasie==, ==déglutition atypique==, ==phonème==, ==nerf récurrent==).
- Termine par "## À retenir" avec 5 à 8 points essentiels.
- Pas de tableau, pas de HTML.
Le champ "keyTerms" contient une définition d'une à deux phrases POUR CHAQUE terme surligné dans "summary" (même orthographe), auxquels s'ajoutent 4 à 10 autres termes importants. Les termes surlignés doivent tous figurer dans "keyTerms" : le lecteur voit la définition en survolant le mot.`;
  const parts = [...media.map((m) => ({ inlineData: { mimeType: m.mimeType, data: m.data } })), { text: prompt }];
  const r = await call({ parts, schema: SUMMARY_SCHEMA, temperature: 0.3 });
  const diagrams = (r.diagrams || [])
    .map((d) => ({ id: d.id, title: String(d.title || '').trim(), svg: sanitizeSvg(d.svg) }))
    .filter((d) => d.svg);
  return { ...r, diagrams };
}

// ---------------------------------------------------------------------------
// 3. Flashcards
// ---------------------------------------------------------------------------
export const CARD_CATEGORIES = ['Définition', 'Pathologie', 'Sémiologie', 'Prise en charge', 'Évaluation', 'Anatomie', 'Autre'];

const CARDS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    cards: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          front: { type: 'STRING', description: 'Recto : notion, pathologie ou question courte' },
          back: { type: 'STRING', description: 'Verso : réponse précise' },
          category: { type: 'STRING', enum: CARD_CATEGORIES },
        },
        required: ['front', 'back', 'category'],
      },
    },
  },
  required: ['cards'],
};

/** Consigne des flashcards (aussi utilisée pour Claude, sans API). */
export function flashcardsPrompt(course, count, existing = []) {
  const avoid = existing.length
    ? `\n\nCes cartes existent déjà, NE LES RÉPÈTE PAS (couvre d'autres notions) :\n${existing.slice(0, 150).map((c) => `- ${c.front}`).join('\n')}`
    : '';
  const prompt = `${courseBlock(course)}

Génère ${count} flashcards de révision à partir de ce cours.
- Recto ("front") : une notion, une pathologie ou une question courte et précise (ex. « Aphasie de Broca : sémiologie ? », « Définition de la dysarthrie »).
- Verso ("back") : la réponse exacte, 1 à 4 phrases ou une courte liste, avec si pertinent l'évaluation et les axes de prise en charge.
- Varie les angles : définitions, signes cliniques, diagnostic différentiel, bilans et tests, axes de prise en charge, anatomie et physiologie.
- Une seule notion par carte.${avoid}`;
  return prompt;
}

/** Cartes brutes ({front, back, category}) → flashcards du logiciel. */
export function toCards(cards, courseId) {
  const now = Date.now();
  return (cards || [])
    .filter((c) => c.front && c.back)
    .map((c) => ({ id: uid(), courseId, front: String(c.front).trim(), back: String(c.back).trim(), category: CARD_CATEGORIES.includes(c.category) ? c.category : 'Autre', srs: newSrs(), createdAt: now }));
}

export async function generateFlashcards(course, count, existing = []) {
  const { cards = [] } = await call({ parts: [{ text: flashcardsPrompt(course, count, existing) }], schema: CARDS_SCHEMA, temperature: 0.5 });
  return toCards(cards, course.id);
}

// ---------------------------------------------------------------------------
// 4. QCM & cas cliniques
// ---------------------------------------------------------------------------
const QUESTIONS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    questions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          kind: { type: 'STRING', enum: ['qcm', 'cas'] },
          context: { type: 'STRING', description: 'Vignette clinique pour un cas (vide pour un QCM simple)' },
          question: { type: 'STRING' },
          options: { type: 'ARRAY', items: { type: 'STRING' } },
          correct: { type: 'ARRAY', items: { type: 'INTEGER' }, description: 'Index (à partir de 0) des bonnes réponses' },
          explanation: { type: 'STRING', description: 'Correction détaillée et justification théorique' },
          difficulty: { type: 'INTEGER', description: '1 facile, 2 moyen, 3 difficile' },
        },
        required: ['kind', 'question', 'options', 'correct', 'explanation', 'difficulty'],
      },
    },
  },
  required: ['questions'],
};

export function normalizeQuestions(list, courseId, extra = {}) {
  const now = Date.now();
  return (list || [])
    .filter((q) => q.question && Array.isArray(q.options) && q.options.length >= 2 && Array.isArray(q.correct) && q.correct.length)
    .map((q) => ({
      id: uid(),
      courseId,
      kind: q.kind === 'cas' ? 'cas' : 'qcm',
      context: (q.context || '').trim(),
      question: q.question.trim(),
      options: q.options.map((o) => String(o).replace(/^[A-E][).:-]\s*/, '').trim()),
      correct: [...new Set(q.correct.filter((i) => i >= 0 && i < q.options.length))],
      explanation: (q.explanation || '').trim(),
      difficulty: Math.min(3, Math.max(1, q.difficulty || 2)),
      stats: { seen: 0, right: 0 },
      createdAt: now,
      ...extra,
    }))
    .filter((q) => q.correct.length);
}

/** Consigne des QCM (aussi utilisée pour Claude, sans API). */
export function questionsPrompt(course, count, existing = []) {
  const avoid = existing.length
    ? `\n\nCes questions existent déjà, NE LES RÉPÈTE PAS :\n${existing.slice(0, 100).map((q) => `- ${q.question}`).join('\n')}`
    : '';
  const nCas = Math.max(1, Math.round(count / 4));
  const prompt = `${courseBlock(course)}

Génère ${count} questions d'entraînement sur ce cours, dont environ ${nCas} cas cliniques.
- "qcm" : question directe avec 4 ou 5 propositions ; une OU plusieurs bonnes réponses (style examens d'orthophonie).
- "cas" : une courte vignette clinique réaliste dans "context" (âge, plainte, observations, éléments de bilan), puis une question de raisonnement (hypothèse diagnostique, examen à proposer, axe de prise en charge…).
- Les distracteurs doivent être plausibles (notions voisines, confusions fréquentes).
- "explanation" : explique pourquoi chaque bonne réponse est juste ET pourquoi les distracteurs sont faux, en t'appuyant sur le cours.
- Mélange les niveaux de difficulté.${avoid}`;
  return prompt;
}

export async function generateQuestions(course, count, existing = []) {
  const { questions } = await call({ parts: [{ text: questionsPrompt(course, count, existing) }], schema: QUESTIONS_SCHEMA, temperature: 0.6 });
  return normalizeQuestions(questions, course.id);
}

/** Questions transversales : relient le nouveau cours aux cours déjà étudiés. */
export async function generateCrossQuestions(course, others) {
  if (!others.length) return [];
  const digest = others.slice(0, 8).map((o) =>
    `### ${o.title}${o.subject ? ` (${o.subject})` : ''}\nNotions : ${(o.keyTerms || []).map((k) => k.term).slice(0, 15).join(', ') || (o.summary || o.text || '').slice(0, 600)}`
  ).join('\n\n');
  const prompt = `NOUVEAU COURS :\n${courseBlock({ ...course, text: course.summary || course.text })}

COURS DÉJÀ ÉTUDIÉS :\n${digest}

Génère 3 à 4 questions TRANSVERSALES (de préférence des cas cliniques) qui obligent à mobiliser à la fois le nouveau cours et au moins un des cours déjà étudiés (diagnostic différentiel, lien anatomie/pathologie, choix de bilan…). Mêmes règles de format que pour un QCM d'examen.`;
  const { questions } = await call({ parts: [{ text: prompt }], schema: QUESTIONS_SCHEMA, temperature: 0.6 });
  return normalizeQuestions(questions, course.id, { cross: true, relatedTitles: others.slice(0, 8).map((o) => o.title) });
}

/** Petit test de la clé API */
export async function testConnection() {
  const text = await call({ parts: [{ text: 'Réponds uniquement par le mot : OK' }], temperature: 0 });
  return text.trim();
}
