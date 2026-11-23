// « Générer avec Claude » : solution de secours quand Gemini ne répond pas.
// Même principe que « Vérifier avec Claude » : le logiciel copie une demande toute prête, tu la colles
// dans Claude (ton compte claude.ai, fenêtre du logiciel), tu copies sa réponse et le logiciel l'installe.
// Les réponses longues peuvent arriver en plusieurs morceaux (« continue ») : ils sont mis bout à bout.
import { DOMAIN } from './domain.js';
import { TAG_RULES, insertSchema } from './ai-extra.js';
import { flashcardsPrompt, questionsPrompt, toCards, normalizeQuestions, CARD_CATEGORIES } from './ai.js';
import { getSettings } from './settings.jsx';
import { GEN_VERSION, withEvent } from './genHistory.js';
import { getCourse, updateCourse, getMedia, getCards, getQuestions, addCards, addQuestions } from './db.js';

export const CG_TASKS = [
  { id: 'course', label: 'Cours complet', hint: 'Retranscription intégrale mise en forme, termes clés' },
  { id: 'synthesis', label: 'Synthèse', hint: 'Version condensée qui suit le plan du cours' },
  { id: 'cards', label: 'Flashcards', hint: 'Cartes recto / verso' },
  { id: 'questions', label: DOMAIN.questionsLabel || 'QCM', hint: 'Questions corrigées' },
];

const END = '<<<FIN>>>';
const MORE = '<<<SUITE>>>';
const hello = 'Bonjour Claude ! '; // reconnu par isOurPrompt : le logiciel ignore sa propre demande dans le presse-papiers

const LONG_REPLY = `IMPORTANT, réponse longue : écris directement la réponse (pas d'artefact, pas de document à part, pas de bloc de code autour du texte). Si tu dois t'arrêter avant la fin, arrête-toi à la fin d'un paragraphe et écris ${MORE} sur la dernière ligne ; je te dirai « continue » et tu reprendras exactement là où tu t'es arrêté, sans rien répéter. Quand tout est écrit, termine par la ligne ${END}.`;

const plainSummary = (md = '') => String(md).replace(/\[\[schema:\d+\]\]/g, '').replace(/\n## À retenir[\s\S]*$/, '').trim();

/** Demande pour le cours complet (équivalent des étapes A et B de Gemini, en une seule réponse). */
function coursePrompt(course) {
  const complete = getSettings().completeCourse !== false;
  return `${hello}J'utilise un logiciel de révision pour ${DOMAIN.audience}. D'habitude, Gemini met mes cours au propre, mais il est indisponible : peux-tu le faire à sa place, en suivant exactement ces consignes (le logiciel lit ta réponse automatiquement) ?

COURS : « ${course.title} »${course.subject ? ` (${course.subject})` : ''}
=== TEXTE D'ORIGINE ===
${(course.text || '').slice(0, 180000)}
=== FIN DU TEXTE D'ORIGINE ===

RETRANSCRIS INTÉGRALEMENT ce cours en Markdown. C'est une retranscription complète, PAS un résumé :
- Garde TOUT le contenu : chaque notion, définition, explication, exemple, liste, chiffre, nom d'auteur ou de test, cas, et les notes de l'orateur. Ne supprime rien, ne fusionne pas des idées distinctes.
- Rédige en phrases complètes ce qui est télégraphique (diapositives).
- Orthographe, grammaire, accords et ponctuation irréprochables : corrige les fautes et les mots mal lus quand le bon mot est évident, sans le signaler.
${complete ? `- COMPLÈTE le cours là où il est inachevé, en restant fidèle : phrase laissée en suspens → termine-la ; rubrique vide (« Conclusion : », « Exemple : ») → rédige-la à partir du cours ; questions ou exercices → garde l'énoncé puis donne une réponse complète et juste.
- MARQUE tout ce que tu ajoutes (et seulement cela) : dans une phrase, entoure l'ajout de {+ et +} ; pour un paragraphe ou une réponse entière, commence CHAQUE ligne par ">+ ". Un ajout doit être exact et sûr : pas de chiffre, d'auteur, de date ou d'étude dont tu n'es pas certain.
- TABLEAU RÉCAPITULATIF : quand une partie compare au moins 3 éléments selon plusieurs critères et que le cours n'en donne pas, ajoute à la fin de la partie un tableau Markdown précédé de la ligne « >+ Tableau récapitulatif ajouté : » (informations du cours uniquement).` : "- N'invente rien : si une information manque, n'en ajoute pas."}
- Organise avec des titres "## …" (grandes parties) et "### …" (sous-parties) dans l'ordre du cours. Ne répète pas le titre du cours. Pas de « Diapositive 3 » ni de « Page 2 » : de vrais titres.
- Mets en **gras** les idées importantes et surligne avec ==terme== les termes clés (${DOMAIN.termKinds} ; exemples de forme : ${DOMAIN.termExamples}).
${TAG_RULES}
- Tableaux de données : en tableau Markdown (ligne d'en-tête puis |---|---|), précédés de leur titre. Graphique du cours : garde son titre et décris en une phrase ce qu'il montre.
- Repères « [Image N] » : garde chacun sur une ligne seule, exactement à sa place (l'image y sera affichée). Liens « [texte](https://…) » : garde-les tels quels.
- Support mentionné mais absent : écris « >+ Support non fourni dans le cours : … (à retrouver auprès de l'enseignant) ».
- Formules en LaTeX entre $ … $. Pas de HTML.

FORMAT DE TA RÉPONSE (exactement, avec ces lignes repères) :
<<<COURS>>>
(le cours complet en Markdown)
<<<TERMES>>>
(TOUS les termes importants, 10 à 60 selon la longueur, un par ligne : terme :: définition fidèle au cours en 1 à 2 phrases)
<<<A_RETENIR>>>
(5 à 10 points essentiels, un par ligne commençant par « - »)
${END}

${LONG_REPLY}`;
}

function synthesisPrompt(course) {
  const src = plainSummary(course.summary || course.text || '');
  const terms = (course.keyTerms || []).map((k) => k.term).filter(Boolean).slice(0, 60).join(' ; ');
  return `${hello}J'utilise un logiciel de révision pour ${DOMAIN.audience}. Gemini est indisponible : peux-tu rédiger la synthèse de mon cours à sa place, en suivant exactement ces consignes (le logiciel lit ta réponse automatiquement) ?

COURS : « ${course.title} »${course.subject ? ` (${course.subject})` : ''}
=== COURS ===
${src.slice(0, 180000)}
=== FIN DU COURS ===

Rédige la SYNTHÈSE DÉTAILLÉE de ce cours : un juste milieu entre une fiche résumé (trop sèche) et le cours complet (trop long), environ un tiers de sa longueur.
- Commence par une partie "## L'essentiel" : 5 à 8 phrases qui donnent l'idée générale et le fil conducteur.
- Puis suis le plan du cours : reprends ses titres "## …" et "### …" dans le même ordre.
- Pour chaque notion importante, garde : sa définition ; l'explication (mécanisme, raisonnement) ; le contexte ; au moins un exemple concret. Garde en priorité les exemples, chiffres, dates, auteurs et références du cours.
- Une comparaison entre plusieurs notions ou auteurs peut être résumée dans un tableau Markdown.
- Si une notion essentielle n'a aucun exemple, tu peux en ajouter un, simple et incontestable, signalé par « (exemple ajouté) ». N'invente jamais de chiffre, de nom, d'étude ni de référence.
- Enlève les répétitions, digressions, formules d'oral et détails vraiment secondaires.
- Phrases complètes, paragraphes courts, listes quand c'est plus clair. **Gras** pour les idées importantes, ==terme== pour les termes clés${terms ? ` (notamment : ${terms})` : ''}.
${TAG_RULES}
- Termine par "## Liens et confusions" (3 à 6 points : notions qui se répondent ou à ne pas confondre, différence expliquée) puis "## Pièges fréquents" (3 à 5 erreurs fréquentes, chacune avec la bonne réponse). Pas de HTML, pas de lien.

FORMAT DE TA RÉPONSE :
<<<SYNTHESE>>>
(la synthèse en Markdown)
${END}

${LONG_REPLY}`;
}

function cardsPrompt(course, count, existing) {
  const base = flashcardsPrompt({ ...course, text: course.text || plainSummary(course.summary) }, count, existing);
  return `${hello}J'utilise un logiciel de révision. Gemini est indisponible : peux-tu faire ce travail à sa place ? Le logiciel lit ta réponse automatiquement.

${base}

FORMAT DE TA RÉPONSE : UN SEUL bloc \`\`\`json … \`\`\` (rien d'autre), de cette forme :
{"cards": [{"front": "recto", "back": "verso", "category": "${CARD_CATEGORIES[0]}"}]}
"category" doit être l'une de : ${CARD_CATEGORIES.join(', ')}.`;
}

function quizPrompt(course, count, existing) {
  const base = questionsPrompt({ ...course, text: course.text || plainSummary(course.summary) }, count, existing);
  return `${hello}J'utilise un logiciel de révision. Gemini est indisponible : peux-tu faire ce travail à sa place ? Le logiciel lit ta réponse automatiquement.

${base}

FORMAT DE TA RÉPONSE : UN SEUL bloc \`\`\`json … \`\`\` (rien d'autre), de cette forme :
{"questions": [{"kind": "qcm" ou "cas", "context": "texte du document ou de la situation (vide pour un QCM simple)", "question": "…", "options": ["…", "…", "…", "…"], "correct": [0], "explanation": "correction détaillée", "difficulty": 1, 2 ou 3}]}
"correct" = numéros des bonnes réponses, en comptant à partir de 0.`;
}

/** Prépare la demande d'une tâche (lit les cartes / questions existantes pour éviter les doublons). */
export async function buildPrompt(task, courseId, { cards = 15, questions = 10 } = {}) {
  const course = await getCourse(courseId);
  if (!course) throw new Error('Cours introuvable.');
  if (task === 'course') {
    if (!course.text?.trim()) throw new Error('Ce cours ne contient pas de texte à mettre au propre.');
    return coursePrompt(course);
  }
  if (!course.summary && !course.text) throw new Error("Le cours doit d'abord être rédigé.");
  if (task === 'synthesis') return synthesisPrompt(course);
  if (task === 'cards') return cardsPrompt(course, cards, await getCards(courseId));
  if (task === 'questions') return quizPrompt(course, questions, await getQuestions(courseId));
  throw new Error('Tâche inconnue.');
}

// ---------------------------------------------------------------------------
// Lecture des réponses
// ---------------------------------------------------------------------------
/** Retire un éventuel bloc de code qui entoure toute la réponse, et les retours chariot. */
const unwrap = (t) => {
  let s = String(t || '').replace(/\r\n?/g, '\n').trim();
  const m = s.match(/^```[a-z]*\n([\s\S]*?)\n```$/i);
  if (m) s = m[1].trim();
  return s;
};

/**
 * Réponse longue en plusieurs morceaux : renvoie { done, text } où text est la réponse reconstituée.
 * `parts` = morceaux déjà reçus. Un morceau doit contenir au moins un repère attendu ou suivre un morceau précédent.
 */
export function mergeParts(parts, startTag) {
  const clean = parts.map(unwrap).map((p, i) => (i === 0 ? p : p.replace(/^(?:voici la suite[^\n]*\n|suite[^\n]*:\s*\n)/i, '')));
  const text = clean.map((p) => p.replace(/\n?<<<SUITE>>>\s*$/, '')).join('\n');
  const done = text.includes(END);
  if (!text.includes(startTag)) throw new Error(`Ce qui a été copié ne ressemble pas à la réponse attendue (le repère ${startTag} manque). Copie toute la réponse de Claude.`);
  return { done, text: text.slice(text.indexOf(startTag), done ? text.indexOf(END) : undefined) };
}

/** Le morceau copié a-t-il l'air d'être une suite (pas de repère de début) ? */
export const looksLikeContinuation = (t, startTag) => !!String(t || '').trim() && !String(t).includes(startTag);

export const START = { course: '<<<COURS>>>', synthesis: '<<<SYNTHESE>>>' };

function section(text, tag, next) {
  const i = text.indexOf(tag);
  if (i < 0) return '';
  const rest = text.slice(i + tag.length);
  const j = next.map((n) => rest.indexOf(n)).filter((x) => x >= 0).sort((a, b) => a - b)[0];
  return (j == null ? rest : rest.slice(0, j)).trim();
}

/** Réponse « cours » → { summary, keyTerms, retenir }. */
export function parseCourse(text) {
  const md = section(text, '<<<COURS>>>', ['<<<TERMES>>>', '<<<A_RETENIR>>>', END]);
  if (md.length < 200) throw new Error('Le cours copié est vide ou trop court. Copie toute la réponse de Claude.');
  const termsRaw = section(text, '<<<TERMES>>>', ['<<<A_RETENIR>>>', END]);
  const keyTerms = termsRaw.split('\n').map((l) => l.replace(/^\s*[-*•]\s*/, '').trim()).filter(Boolean)
    .map((l) => { const k = l.indexOf('::'); return k > 0 ? { term: l.slice(0, k).replace(/[*=]/g, '').trim(), definition: l.slice(k + 2).trim() } : null; })
    .filter((k) => k && k.term && k.definition);
  const retenir = section(text, '<<<A_RETENIR>>>', [END]).split('\n').map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean);
  return { summary: md.replace(/^#\s+.*\n+/, ''), keyTerms, retenir };
}

export function parseSynthesis(text) {
  const md = section(text, '<<<SYNTHESE>>>', [END]);
  if (md.length < 150) throw new Error('La synthèse copiée est vide ou trop courte. Copie toute la réponse de Claude.');
  return md.replace(/^#\s+.*\n+/, '');
}

/** JSON copié depuis Claude (bloc ```json``` ou objet nu), tolérant aux virgules en trop. */
export function parseJsonReply(text, key) {
  const t = String(text || '');
  const block = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  let raw = block ? block[1] : (t.match(/\{[\s\S]*\}/) || [])[0];
  if (!raw) throw new Error('Aucune donnée trouvée dans ce qui a été copié. Copie toute la réponse de Claude (ou son bloc JSON).');
  raw = raw.trim().replace(/,\s*([}\]])/g, '$1');
  let data;
  try { data = JSON.parse(raw); } catch { throw new Error('La réponse copiée est incomplète. Copie le bloc JSON entier de Claude, puis réessaie.'); }
  const list = Array.isArray(data) ? data : data[key];
  if (!Array.isArray(list) || !list.length) throw new Error('La réponse ne contient aucun élément.');
  return list;
}

// ---------------------------------------------------------------------------
// Installation dans le logiciel
// ---------------------------------------------------------------------------
/** Installe le résultat d'une tâche ; renvoie un court message. */
export async function install(task, courseId, text) {
  let course = await getCourse(courseId);
  if (!course) throw new Error('Cours introuvable.');
  if (task === 'course') {
    const r = parseCourse(text);
    let body = r.summary;
    // Images du cours d'origine : affichées à la place de leur repère [Image N]
    const media = await getMedia(courseId).catch(() => []);
    const figures = [];
    media.forEach((m, k) => {
      const name = /^Image \d+$/.test(m.name || '') ? m.name : `Image ${k + 1}`;
      const re = new RegExp(`^[ \\t]*\\[${name}\\][ \\t]*$`, 'mi');
      if (!/^image\//.test(m.mimeType || '') || !re.test(body)) return;
      const id = 500 + k;
      figures.push({ id, title: name, caption: '', section: '', image: `data:${m.mimeType};base64,${m.data}`, source: 'cours', credit: 'Document du cours d’origine' });
      body = body.replace(re, `[[schema:${id}]]`);
    });
    body = body.replace(/^[ \t]*\[Image \d+\][ \t]*\n?/gim, '');
    // Schémas déjà présents (faits par Gemini) : gardés et replacés dans leur partie
    const keep = (course.diagrams || []).filter((d) => !(figures.length && d.source === 'cours') && !figures.some((f) => f.id === d.id));
    body = keep.reduce((md, d) => (md.includes(`[[schema:${d.id}]]`) ? md : insertSchema(md, d.section || '', d.id, `${d.title || ''} ${d.caption || ''}`)), body);
    const summary = `${body.trim()}${r.retenir.length ? `\n\n## À retenir\n${r.retenir.map((x, i) => `${i + 1}. ${x}`).join('\n')}` : ''}`;
    await updateCourse(courseId, {
      summary, fullCourse: true, status: 'ready', error: '', generatedAt: Date.now(),
      verifiedAt: null, verifyLater: true, summaryBackup: null, // déjà rédigé par Claude : pas de bandeau « Faire relire par Claude »
      genVersion: GEN_VERSION,
      genHistory: withEvent(course, { kind: 'cours', by: 'claude', detail: 'Rédigé par Claude (Gemini indisponible)' }),
      keyTerms: r.keyTerms.length ? r.keyTerms : (course.keyTerms || []),
      diagrams: [...keep, ...figures],
    });
    return `Cours installé (${r.keyTerms.length} termes clés)`;
  }
  if (task === 'synthesis') {
    const synthesis = parseSynthesis(text);
    course = await getCourse(courseId);
    await updateCourse(courseId, { synthesis, synthesisAt: Date.now(), synthesisV: 2, genHistory: withEvent(course, { kind: 'synthese', by: 'claude' }) });
    return 'Synthèse installée';
  }
  if (task === 'cards') {
    const cards = toCards(parseJsonReply(text, 'cards'), courseId);
    if (!cards.length) throw new Error('Aucune flashcard valable dans la réponse.');
    await addCards(cards);
    if (course.status !== 'ready' && course.summary) await updateCourse(courseId, { status: 'ready', error: '' });
    return `${cards.length} flashcard${cards.length > 1 ? 's' : ''} ajoutée${cards.length > 1 ? 's' : ''}`;
  }
  if (task === 'questions') {
    const qs = normalizeQuestions(parseJsonReply(text, 'questions'), courseId);
    if (!qs.length) throw new Error('Aucune question valable dans la réponse.');
    await addQuestions(qs);
    return `${qs.length} question${qs.length > 1 ? 's' : ''} ajoutée${qs.length > 1 ? 's' : ''}`;
  }
  throw new Error('Tâche inconnue.');
}
