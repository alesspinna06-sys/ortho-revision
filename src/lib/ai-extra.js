// Fonctions IA à la demande : schémas supplémentaires et approfondissement avec actualités.
// Code commun aux deux logiciels ; seuls les textes de domain.js changent.
import { api } from './bridge.js';
import { getSettings } from './settings.jsx';
import { SYSTEM, call, sanitizeSvg } from './ai.js';
import { DOMAIN } from './domain.js';
import { svgToPng } from './svgImage.js';

const context = (course) => `TITRE DU COURS : ${course.title}${course.subject ? `\nMATIÈRE : ${course.subject}` : ''}
${course.summary ? `\n--- FICHE DE SYNTHÈSE ---\n${course.summary.replace(/\[\[schema:\d+\]\]/g, '').slice(0, 20000)}\n` : ''}
--- CONTENU DU COURS ---
${(course.text || '').slice(0, 60000)}
--- FIN DU COURS ---`;

// ---------------------------------------------------------------------------
// 1. Schémas générés à la demande
// ---------------------------------------------------------------------------
const DIAGRAMS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    diagrams: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING', description: 'Titre court du schéma' },
          caption: { type: 'STRING', description: '1 à 2 phrases : ce que montre le schéma et comment le lire' },
          section: { type: 'STRING', description: 'Titre EXACT, copié dans la liste des sections du cours, de la partie où le schéma se place' },
          svg: { type: 'STRING', description: 'Code SVG autonome' },
        },
        required: ['title', 'caption', 'section', 'svg'],
      },
    },
  },
  required: ['diagrams'],
};

export async function generateDiagrams(course, { request = '', existing = [], terms = [], count = 2, sections = [] } = {}) {
  const ask = request.trim();
  const termList = terms.map((t) => String(t).trim()).filter(Boolean).slice(0, 4);
  const n = Math.min(3, Math.max(1, count));
  const mission = termList.length
    ? `Crée exactement ${termList.length} schéma${termList.length > 1 ? 's' : ''}, un pour chacun de ces termes, dans cet ordre : ${termList.map((t) => `« ${t} »`).join(', ')}. Chaque schéma montre le terme, ses éléments et ses liens avec les autres notions du cours.${ask ? ` Consigne supplémentaire de l'étudiant : « ${ask} ».` : ''}`
    : ask
      ? `Crée ${n} schéma${n > 1 ? 's' : ''} de révision. DEMANDE PRÉCISE DE L'ÉTUDIANT : « ${ask} ». Réponds exactement à cette demande, en restant fidèle au cours.`
      : `Crée ${n} schéma${n > 1 ? 's' : ''} de révision à partir de ce cours, bien construit et complet. Choisis les notions qui gagnent le plus à être visualisées. Idées : ${DOMAIN.diagramIdeas}.`;
  const prompt = `${context(course)}

${mission} Le public : ${DOMAIN.audience}.
${sections.length ? `SECTIONS DU COURS (titres exacts) : ${sections.join(' | ')}.
Pour chaque schéma, "section" doit reprendre EXACTEMENT un de ces titres : celui de la partie où le schéma se place le mieux.` : ''}
${existing.length ? `Ces schémas existent déjà, ne les refais pas : ${existing.map((d) => d.title).filter(Boolean).join(' ; ')}.` : ''}

Règles du SVG (très important pour la lisibilité) :
${SVG_RULES}
- N'invente aucun fait, chiffre ou relation absent du cours ; un schéma anatomique reste simplifié et le dit dans la légende.`;
  const { diagrams = [] } = await call({ parts: [{ text: prompt }], schema: DIAGRAMS_SCHEMA, temperature: 0.4 });
  return diagrams
    .map((d) => ({ title: String(d.title || '').trim(), caption: String(d.caption || '').trim(), section: String(d.section || '').trim(), svg: sanitizeSvg(d.svg) }))
    .filter((d) => d.svg);
}

// ---------------------------------------------------------------------------
// 2. Approfondissement + actualités (recherche Google de Gemini)
// ---------------------------------------------------------------------------
function deepenPrompt(course, { focus, withNews }) {
  const today = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  return `${context(course)}

Nous sommes le ${today}. Rédige un APPROFONDISSEMENT de ce cours pour ${DOMAIN.audience}, en Markdown, avec ces sections :
## Pour aller plus loin
3 à 6 notions du cours développées en détail (mécanismes, nuances, exemples concrets), sans recopier la fiche.
## Compléments utiles
Ce qu'il est utile de savoir en plus et qui n'est pas dans le cours. Seulement des connaissances établies : n'invente ni auteur, ni chiffre, ni référence.
## Pièges et confusions fréquentes
3 à 5 points, chacun avec la bonne réponse.
${withNews ? `## Actualités
3 à 6 actualités RÉCENTES (de préférence des 12 derniers mois) en lien direct avec ce cours, trouvées avec la recherche Google : ${DOMAIN.newsFocus}.
Pour chacune : **un titre**, le mois et l'année, 2 à 3 phrases, puis « Utile pour : … ». N'invente aucune actualité : si tu n'en trouves pas de fiable, écris-le.` : ''}
${focus ? `\nInsiste particulièrement sur : « ${focus} ».` : ''}

Règles de forme : surligne les termes clés avec ==terme==, **gras** pour l'essentiel, listes à puces courtes, pas de tableau, pas de HTML, pas de lien ni d'URL dans le texte (les sources sont affichées à part).`;
}

// Nettoie la sortie de la recherche : liens Markdown et renvois [1] que le rendu n'affiche pas
const clean = (md) => md
  .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '$1')
  .replace(/\s?\[(\d+(?:,\s*\d+)*)\]/g, '')
  .replace(/https?:\/\/\S+/g, '')
  .trim();

export async function generateDeepening(course, { focus = '', withNews = true } = {}) {
  const { model } = getSettings();
  const base = { model, system: SYSTEM, temperature: 0.5 };
  let res = await api.gemini.generate({ ...base, parts: [{ text: deepenPrompt(course, { focus, withNews }) }], search: withNews });
  let news = withNews;
  let notice = '';
  if (!res.ok && withNews && !/quota|clé|key/i.test(res.error || '')) {
    // Recherche Google indisponible pour ce modèle ou ce compte : approfondissement sans actualités
    res = await api.gemini.generate({ ...base, parts: [{ text: deepenPrompt(course, { focus, withNews: false }) }] });
    news = false;
    notice = "La recherche d'actualités n'est pas disponible avec ce modèle ou ce compte Gemini : l'approfondissement a été fait sans actualités.";
  }
  if (!res.ok) throw new Error(res.error);
  return { markdown: clean(res.text), sources: res.sources || [], news, notice, focus: focus.trim(), date: Date.now() };
}

// ---------------------------------------------------------------------------
// 3. Questions sur un cours (conversation), réponse -> flashcard
// ---------------------------------------------------------------------------
export async function askCourse(course, history, question) {
  const past = history.slice(-8).map((m) => `${m.role === 'user' ? 'ÉTUDIANT' : 'ASSISTANT'} : ${m.text}`).join('\n\n');
  const prompt = `${context(course)}

Tu réponds aux questions de ${DOMAIN.audience} sur ce cours.
- Appuie-toi d'abord sur le cours. Si la réponse n'y est pas, dis-le clairement, puis complète avec des connaissances établies en le signalant (« Hors du cours : … »).
- Sois clair et pédagogique : une réponse directe d'abord, puis l'explication, un exemple si utile.
- Markdown simple : listes, **gras**, ==terme clé== pour les notions importantes. Pas de tableau, pas de HTML.
${past ? `\nÉCHANGE PRÉCÉDENT :\n${past}\n` : ''}
NOUVELLE QUESTION : ${question}`;
  return (await call({ parts: [{ text: prompt }], temperature: 0.4 })).trim();
}

/** Question posée pendant la lecture (bulle « Poser une question ») : centrée sur le passage ou la partie lue. */
export async function askAbout(course, history, question, focus = {}) {
  const parts = [];
  if (focus.heading) parts.push(`partie « ${focus.heading} »`);
  if (focus.quote) parts.push(`passage sélectionné : « ${String(focus.quote).slice(0, 600)} »`);
  if (focus.paragraph && focus.paragraph !== focus.quote) parts.push(`dans le paragraphe : « ${String(focus.paragraph).slice(0, 900)} »`);
  const q = parts.length
    ? `${question}\n\n(Je suis en train de lire : ${parts.join(', ')}. Réponds à partir de ce passage, dans le sens du cours, sans t'éloigner du sujet.)`
    : question;
  return askCourse(course, history, q);
}

const CARD_SCHEMA = {
  type: 'OBJECT',
  properties: {
    front: { type: 'STRING', description: 'Recto : question courte et précise' },
    back: { type: 'STRING', description: 'Verso : réponse exacte en 1 à 4 phrases' },
    category: { type: 'STRING' },
  },
  required: ['front', 'back', 'category'],
};
export async function cardFromAnswer(question, answer, categories) {
  const prompt = `Transforme cet échange en UNE flashcard de révision.
QUESTION : ${question}
RÉPONSE : ${answer}
Le recto est une question courte, le verso la réponse essentielle (sans la mise en forme Markdown). Catégorie parmi : ${categories.join(', ')}.`;
  const c = await call({ parts: [{ text: prompt }], schema: CARD_SCHEMA, temperature: 0.3 });
  return { front: String(c.front || question).trim(), back: String(c.back || '').trim(), category: categories.includes(c.category) ? c.category : 'Autre' };
}

// ---------------------------------------------------------------------------
// 4. QCM : « Explique-moi autrement »
// ---------------------------------------------------------------------------
export async function explainQuestion(q, selected, course) {
  const L = 'ABCDEFGH';
  const prompt = `${course ? context(course) : ''}

Un étudiant (${DOMAIN.audience}) n'a pas compris la correction de cette question.
${q.context ? `CONTEXTE : ${q.context}\n` : ''}QUESTION : ${q.question}
PROPOSITIONS :
${q.options.map((o, i) => `${L[i]}. ${o}`).join('\n')}
BONNE(S) RÉPONSE(S) : ${q.correct.map((i) => L[i]).join(', ')}
SA RÉPONSE : ${selected.length ? selected.map((i) => L[i]).join(', ') : 'aucune'}
CORRECTION DÉJÀ DONNÉE : ${q.explanation}

Explique autrement, simplement : d'où vient probablement son erreur, le raisonnement pas à pas, une image ou un exemple concret, et une astuce pour ne plus se tromper. 120 à 220 mots, Markdown simple, ==terme clé== pour les notions.`;
  return (await call({ parts: [{ text: prompt }], temperature: 0.5 })).trim();
}

// ---------------------------------------------------------------------------
// 5. Cours complet : retranscription détaillée, partie par partie
//    Étape A (avec les images) : titre, matière, termes clés, schémas recréés, « À retenir ».
//    Étape B (texte seul, sans JSON) : chaque partie du cours est retranscrite intégralement,
//    pour qu'un long cours ne soit jamais tronqué ni résumé.
// ---------------------------------------------------------------------------
const OUTLINE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING', description: 'Titre court et explicite du cours' },
    subject: { type: 'STRING', description: DOMAIN.subjectHint },
    keyTerms: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { term: { type: 'STRING' }, definition: { type: 'STRING' } }, required: ['term', 'definition'] },
    },
    diagrams: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'INTEGER' },
          title: { type: 'STRING', description: 'Légende courte' },
          section: { type: 'STRING', description: 'Titre ou sujet de la partie du cours où placer ce schéma' },
          svg: { type: 'STRING', description: 'Code SVG autonome' },
        },
        required: ['id', 'title', 'section', 'svg'],
      },
    },
    aRetenir: { type: 'ARRAY', items: { type: 'STRING' }, description: '5 à 10 points essentiels' },
    figures: {
      type: 'ARRAY',
      description: "Images jointes à montrer telles quelles dans le cours",
      items: {
        type: 'OBJECT',
        properties: {
          image: { type: 'STRING', description: 'Repère exact de l\'image jointe, ex. "Image 3"' },
          title: { type: 'STRING', description: 'Légende courte' },
          caption: { type: 'STRING', description: "Ce que montre l'image, en une phrase" },
          section: { type: 'STRING', description: 'Titre de la partie du cours où la placer' },
        },
        required: ['image', 'title', 'section'],
      },
    },
  },
  required: ['title', 'subject', 'keyTerms', 'diagrams', 'aRetenir'],
};

export const SVG_RULES = `Un SVG autonome, de viewBox "0 0 900 600" avec xmlns="http://www.w3.org/2000/svg" et font-family="sans-serif". Fond transparent (pas de rectangle de fond), texte en français.
Qualité attendue : un schéma de manuel soigné, pas un croquis.
- Un titre en haut (font-size 22, font-weight 700), puis 4 à 9 éléments principaux, répartis avec des marges de 40 px.
- Hiérarchie visuelle : éléments principaux en boîtes <rect rx="14"> remplies, sous-éléments en boîtes plus petites ou en texte, ensembles entourés d'un cadre en pointillés (stroke-dasharray="6 4").
- Couleurs par catégorie (une couleur par type d'élément), avec une légende en bas si le schéma compte plus de deux catégories. Palette : fills #eef0ff #f3e8ff #e0f2fe #dcfce7 #fef3c7, strokes #4f6bff #8b5cf6 #0ea5e9 #22c55e #f59e0b.
- Flèches étiquetées : <path> ou <line> avec marker-end, marker défini dans <defs> avec un id unique. Les étapes peuvent être numérotées par des cercles (r="16") contenant 1, 2, 3…
- Textes : font-size entre 15 et 20 (titre 22), couleur #1b1d2a, étiquettes de 6 mots au plus, text-anchor="middle" au centre des boîtes. Aucun texte ne déborde de sa boîte, ne sort du cadre, ni ne chevauche un autre élément.
- Exemple de structure (à adapter, ne pas recopier) : <svg viewBox="0 0 900 600" xmlns="http://www.w3.org/2000/svg" font-family="sans-serif"><defs><marker id="fl" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#4f6bff"/></marker></defs><text x="450" y="50" text-anchor="middle" font-size="22" font-weight="700" fill="#1b1d2a">Titre</text><rect x="60" y="130" width="260" height="110" rx="14" fill="#eef0ff" stroke="#4f6bff" stroke-width="2"/><text x="190" y="195" text-anchor="middle" font-size="18" fill="#1b1d2a">Notion A</text><path d="M330 185 H500" stroke="#4f6bff" stroke-width="2" marker-end="url(#fl)"/><rect x="510" y="130" width="260" height="110" rx="14" fill="#dcfce7" stroke="#22c55e" stroke-width="2"/><text x="640" y="195" text-anchor="middle" font-size="18" fill="#1b1d2a">Notion B</text></svg>
Pas de script, pas d'image, pas de lien, pas de police externe.`;

// --- Étiquettes de couleur (rendu dans markdown.js, couleurs selon l'apparence choisie) ---
export const TAG_RULES = `- ÉTIQUETTES DE COULEUR (le logiciel les met en couleur ; reste mesuré : environ un encadré pour trois paragraphes, jamais tout le texte) :
  • définition d'une notion → la ou les lignes commencent par ">[def] " ;
  • exemple, cas concret, illustration → ">[ex] " ;
  • idée essentielle à retenir → ">[retenir] " ;
  • erreur fréquente, confusion à éviter, mise en garde → ">[piege] " ;
  • méthode, étapes, formule, calcul → ">[methode] " (une liste s'écrit ">[methode] - étape").
  • Dans les phrases : entoure de @@ et @@ les auteurs, chercheurs, tests, échelles, œuvres et institutions (ex. @@Bourdieu@@, @@échelle de Mattis@@), et de ^^ et ^^ les dates, chiffres et pourcentages importants (ex. ^^1945^^, ^^12 %^^).
  • Pas d'étiquette sur un titre ni dans un tableau (les nombres d'un tableau restent tels quels) ; un encadré ne contient ni titre ni tableau.`;

// --- Compléter le cours -------------------------------------------------------------
// Ajouts de l'IA : « {+ … +} » dans une phrase, lignes « >+ » pour un paragraphe entier.
function completeRules(i, chunks) {
  const next = i < chunks.length - 1 ? chunks[i + 1].slice(0, 400).replace(/\s+/g, ' ') : '';
  return `- COMPLÈTE le cours là où il est inachevé, en restant fidèle à ce qui est écrit :
  • phrase laissée en suspens (« Le temps pharyngé est… », « Il existe trois types : ») → termine-la ;
  • titre ou rubrique vide ou à peine commencée (« Conclusion : », « Exemple : », « Synthèse », liste commencée puis abandonnée) → rédige son contenu à partir du cours ;
  • questions, exercices, « Répondez à… », cas à résoudre, calculs → garde l'énoncé, puis donne juste après une réponse complète et juste (raisonnement, étapes, calculs, conclusion), appuyée sur le cours et sur les connaissances de référence pour ${DOMAIN.audience}.
- MARQUE tout ce que tu ajoutes (et seulement cela) : dans une phrase, entoure l'ajout de {+ et +} (ex. « Le temps pharyngé est {+ réflexe et dure moins d'une seconde +}. ») ; pour un paragraphe ou une réponse entière, commence CHAQUE ligne par ">+ " (ex. ">+ Réponse : …"). Pas de titre ni de tableau dans un ajout ; une liste s'écrit ">+ - élément".
- Un ajout doit être exact et sûr : pas de chiffre, de nom d'auteur, de date ou d'étude dont tu n'es pas certain ; dans le doute, écris moins. Ce qui dépend de l'enseignant (date, consigne de devoir, référence de page) reste tel quel.
- Ne complète pas ce qui est déjà complet, et ne change pas le sens du cours.
- TABLEAU RÉCAPITULATIF : quand une partie compare au moins 3 éléments (auteurs, théories, pathologies, tests, courants, mécanismes…) selon plusieurs critères et que le cours n'en donne pas, ajoute à la fin de cette partie un tableau Markdown récapitulatif (une ligne par élément, une colonne par critère, cases courtes), précédé de la ligne « >+ Tableau récapitulatif ajouté : ». Uniquement avec des informations du cours.${next ? `
- ATTENTION : cette partie est coupée pour le traitement. Si elle s'arrête au milieu d'une phrase ou d'une liste, c'est le découpage : ne complète pas la fin, la suite est dans la partie suivante, qui commence par : « ${next} … »` : ''}`;
}

const ADD_RE = /((?:^>\+[^\n]*(?:\n|$))+)|\{\+\s?([\s\S]+?)\s?\+\}/gm;
const hasAdditions = (md) => { ADD_RE.lastIndex = 0; return ADD_RE.test(md); };

const REVIEW_SCHEMA = {
  type: 'OBJECT',
  properties: {
    fixes: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'INTEGER' },
          text: { type: 'STRING', description: "Nouveau texte de l'ajout (vide pour le supprimer)" },
        },
        required: ['id', 'text'],
      },
    },
  },
  required: ['fixes'],
};

/** Relit seulement les ajouts de l'IA d'une partie et corrige ceux qui sont faux, douteux ou mal écrits. */
async function reviewAdditions(course, source, md) {
  const adds = [];
  ADD_RE.lastIndex = 0;
  let m;
  while ((m = ADD_RE.exec(md))) {
    const block = m[1] != null;
    const text = block ? m[1].split('\n').filter((l) => l.startsWith('>+')).map((l) => l.replace(/^>\+\s?/, '')).join('\n').trim() : m[2].trim();
    const before = md.slice(Math.max(0, m.index - 300), m.index).replace(/\{\+|\+\}|^>\+\s?/gm, '').replace(/\s+/g, ' ');
    adds.push({ id: adds.length + 1, start: m.index, end: m.index + m[0].length, block, trail: block && m[1].endsWith('\n') ? '\n' : '', text, before });
  }
  if (!adds.length) return md;
  const prompt = `Tu relis les AJOUTS faits par une IA dans un cours pour ${DOMAIN.audience} (cours « ${course.title} »${course.subject ? `, ${course.subject}` : ''}). Le texte d'origine fait foi.
--- TEXTE D'ORIGINE DE CETTE PARTIE ---
${source.slice(0, 24000)}
--- FIN ---

Ajouts à vérifier (avec le texte qui les précède) :
${adds.map((a) => `#${a.id} — avant : « …${a.before.slice(-220)} »\nAJOUT : ${a.text}`).join('\n\n')}

Pour chaque ajout, vérifie : est-il exact (connaissances de référence du domaine) ? cohérent avec le texte d'origine ? la réponse à une question est-elle juste et complète ? orthographe et grammaire sont-elles parfaites ?
Renvoie dans « fixes » UNIQUEMENT les ajouts à corriger, avec leur texte corrigé (même forme, sans les marques {+ +} ni >+). Mets un texte vide pour supprimer un ajout faux ou inutile. Si tout est juste, renvoie une liste vide.`;
  const r = await call({ parts: [{ text: prompt }], schema: REVIEW_SCHEMA, temperature: 0.1 });
  const fix = new Map((r.fixes || []).map((f) => [Number(f.id), String(f.text ?? '').trim()]));
  if (!fix.size) return md;
  let out = '';
  let pos = 0;
  for (const a of adds) {
    out += md.slice(pos, a.start);
    if (!fix.has(a.id)) out += md.slice(a.start, a.end);
    else {
      const t = fix.get(a.id);
      if (t) out += a.block ? `${t.split('\n').filter((l) => l.trim()).map((l) => `>+ ${l.trim()}`).join('\n')}${a.trail}` : `{+ ${t} +}`;
      else if (a.block) out += a.trail;
    }
    pos = a.end;
  }
  return out + md.slice(pos);
}

// --- Mettre en couleurs un cours déjà généré, sans en changer un mot ----------------------
const plainWords = (t) => t
  .replace(/^>\[(?:def|ex|retenir|piege|methode)\]\s?/gim, '')
  .replace(/@@|\^\^/g, '')
  .toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
/** Distance d'édition entre deux suites de mots (bornée : on s'arrête dès que c'est trop différent). */
function wordDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Ajoute les étiquettes de couleur à un cours existant, partie par partie. Chaque partie est vérifiée :
 * si l'IA a changé plus de 1 % des mots, la partie d'origine est gardée telle quelle.
 */
export async function colorizeCourse(course, onProgress = () => {}) {
  const src = course.summary || '';
  const chunks = splitCourse(src, 11000);
  const out = [];
  let kept = 0;
  for (let i = 0; i < chunks.length; i++) {
    onProgress(chunks.length > 1 ? `Mise en couleurs (partie ${i + 1} sur ${chunks.length})…` : 'Mise en couleurs du cours…');
    const prompt = `Voici une partie d'un cours en Markdown (« ${course.title} »).
--- TEXTE ---
${chunks[i]}
--- FIN ---

Renvoie EXACTEMENT le même texte, mot pour mot, dans le même ordre, avec la même ponctuation, en ajoutant SEULEMENT les étiquettes de couleur ci-dessous. Ne reformule rien, ne corrige rien, n'ajoute ni ne supprime aucun mot. Garde tels quels les titres, les repères [[schema:N]], les ==termes==, les {+ … +} et les lignes qui commencent par ">+".
${TAG_RULES}
Pour mettre un paragraphe en encadré, ajoute simplement le préfixe (ex. ">[def] ") au début de sa ligne.`;
    let text = '';
    try { text = (await call({ parts: [{ text: prompt }], temperature: 0 })).trim(); }
    catch (err) { if (/quota|clé|key/i.test(err.message)) throw err; }
    const a = plainWords(chunks[i]);
    const ok = text && wordDistance(a, plainWords(text), Math.max(3, Math.round(a.length * 0.01))) <= Math.max(3, Math.round(a.length * 0.01));
    if (ok) out.push(text); else { out.push(chunks[i]); kept++; }
  }
  return { summary: out.join('\n'), kept, parts: chunks.length };
}

/** Découpe le texte du cours en parties d'environ `size` caractères, de préférence sur un titre de page ou de diapositive. */
export function splitCourse(text, size = 11000) {
  const lines = text.replace(/\r/g, '').split('\n');
  const parts = [];
  let cur = [];
  let len = 0;
  for (const line of lines) {
    const heading = /^#{1,3}\s/.test(line);
    if (len > size * 0.6 && heading) { parts.push(cur.join('\n')); cur = []; len = 0; }
    if (len + line.length > size && cur.length) { parts.push(cur.join('\n')); cur = []; len = 0; }
    cur.push(line);
    len += line.length + 1;
  }
  if (cur.join('').trim()) parts.push(cur.join('\n'));
  return parts.filter((p) => p.trim());
}

const normH = (s = '') => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Place chaque schéma juste après le titre de la partie correspondante (sinon avant « À retenir »). */
function placeDiagrams(md, diagrams) {
  let out = md;
  const unplaced = [];
  diagrams.forEach((d) => {
    const target = normH(d.section || d.title);
    const lines = out.split('\n');
    const idx = target ? lines.findIndex((l) => /^#{2,4}\s/.test(l) && (normH(l).includes(target) || (normH(l).length > 4 && target.includes(normH(l).replace(/^#+\s*/, ''))))) : -1;
    if (idx >= 0) { lines.splice(idx + 1, 0, '', `[[schema:${d.id}]]`, ''); out = lines.join('\n'); }
    else unplaced.push(d);
  });
  return { md: out, unplaced };
}

const SUGGEST_SCHEMA = {
  type: 'OBJECT',
  properties: {
    suggestions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING', description: 'Titre court du schéma proposé' },
          section: { type: 'STRING', description: 'Titre EXACT d une partie du cours où le schéma se place' },
          why: { type: 'STRING', description: 'À quoi il sert pour réviser, en une phrase' },
        },
        required: ['title', 'section', 'why'],
      },
    },
  },
  required: ['suggestions'],
};

/** Propositions de schémas faites par l'IA à partir du cours (affichées pour un clic). */
export async function suggestDiagrams(course, { sections = [] } = {}) {
  const prompt = `${context(course)}

Propose 6 schémas de révision utiles pour ce cours, pour ${DOMAIN.audience}. Idées possibles : ${DOMAIN.diagramIdeas}.
SECTIONS DU COURS (titres exacts) : ${sections.join(' | ')}.
Pour chaque proposition : un titre court, la partie où le schéma se place (reprends EXACTEMENT un titre de la liste) et une phrase sur son utilité. N'invente rien.`;
  const { suggestions = [] } = await call({ parts: [{ text: prompt }], schema: SUGGEST_SCHEMA, temperature: 0.5 });
  return suggestions
    .map((s) => ({ title: String(s.title || '').trim(), section: String(s.section || '').trim(), why: String(s.why || '').trim() }))
    .filter((s) => s.title)
    .slice(0, 8);
}

const headingLevel = (l = '') => (l.match(/^(#{1,4})\s/) || [])[1]?.length || 0;

const STOP_WORDS = new Set('avec dans pour par sur sous entre leur leurs cette ces sont est etre plus moins tres comme ainsi selon chez vers'.split(' '));
const keyWords = (s = '') => normH(s).split(' ').filter((w) => w.length > 3 && !STOP_WORDS.has(w));

/** Indice du titre dont la partie (titre + texte) partage le plus de mots avec « hint » ; -1 si rien de probant. */
function bestHeading(lines, hint) {
  const want = new Set(keyWords(hint));
  if (!want.size) return -1;
  let best = -1;
  let bestScore = 0;
  lines.forEach((l, i) => {
    if (!headingLevel(l) || normH(l).includes('a retenir')) return;
    const body = [];
    for (let j = i + 1; j < lines.length && !headingLevel(lines[j]); j++) body.push(lines[j]);
    let score = 0;
    keyWords(l).forEach((w) => { if (want.has(w)) score += 3; }); // le titre compte plus que le texte
    new Set(keyWords(body.join(' '))).forEach((w) => { if (want.has(w)) score += 1; });
    if (score > bestScore) { bestScore = score; best = i; }
  });
  return bestScore >= 2 ? best : -1;
}

/**
 * Insère le repère [[schema:id]] à la fin de la partie « section » de la fiche
 * (sinon juste avant « À retenir », sinon à la fin). Le schéma fait ainsi partie du cours.
 */
export function insertSchema(md = '', section = '', id, hint = '') {
  const mark = `[[schema:${Number(id)}]]`;
  const lines = md.split('\n');
  const target = normH(section);
  let start = target
    ? lines.findIndex((l) => headingLevel(l) && (normH(l).includes(target) || (normH(l).length > 4 && target.includes(normH(l)))))
    : -1;
  // Titre introuvable : partie dont le titre et le texte ressemblent le plus au schéma
  if (start < 0) start = bestHeading(lines, `${section} ${hint}`);
  let pos = -1;
  if (start >= 0) {
    const level = headingLevel(lines[start]);
    let end = lines.findIndex((l, i) => i > start && headingLevel(l) && headingLevel(l) <= level);
    if (end < 0) end = lines.length;
    while (end > start + 1 && !lines[end - 1].trim()) end -= 1;
    pos = end;
  } else {
    pos = lines.findIndex((l) => headingLevel(l) && normH(l).includes('a retenir'));
  }
  if (pos < 0) return `${md.replace(/\s+$/, '')}\n\n${mark}\n`;
  lines.splice(pos, 0, '', mark, '');
  return lines.join('\n');
}

/** Retire le repère d'un schéma de la fiche (quand le schéma est supprimé). */
export function removeSchema(md = '', id) {
  return md.replace(new RegExp(`[ \\t]*(?:[-*•][ \\t]+)?\\[\\[schema:${Number(id)}\\]\\][ \\t]*\\n?`, 'g'), '');
}

export async function generateFullCourse(course, media = [], onProgress = () => {}) {
  const text = course.text || '';
  // Étape A : plan, termes, schémas (avec images), points essentiels
  const outlinePrompt = (withMedia) => `TITRE DU COURS : ${course.title}
--- CONTENU DU COURS ---
${text.slice(0, 120000)}
--- FIN DU COURS ---
${withMedia ? `\nDOCUMENTS VISUELS JOINTS : ${media.length} image(s) ou page(s) du cours d'origine, chacune précédée de son repère [Image N]. Recrée en SVG les schémas, graphiques ou tableaux de ces documents qui sont utiles à la révision, en reproduisant fidèlement étiquettes et flèches.
IMAGES À MONTRER TELLES QUELLES : dans "figures", choisis les images jointes qui doivent apparaître dans le cours parce qu'elles servent à comprendre ou à travailler : photo, publicité, affiche, document ou extrait à analyser, carte, œuvre, capture d'écran, graphique ou tableau lisible, schéma d'origine riche. Pas les logos, fonds, décorations, icônes ni les pages de texte photographiées. "image" = son repère exact (« Image 3 »), "section" = titre EXACT de la partie où elle se place. Dans le texte du cours, le repère [Image N] indique souvent l'endroit où elle se trouvait.` : ''}
Graphiques du cours : chaque graphique annoncé ou présent (« Graphique 7 : marché du kaki »…) doit être RECRÉÉ en SVG dans "diagrams", avec les données exactes des tableaux du cours (axes gradués et nommés, courbes ou barres, légende, point d'équilibre ou valeurs clés indiqués) ; "section" = la partie où il apparaît.
Schémas de révision : dans "diagrams", propose 4 à 8 schémas de synthèse qui aident à apprendre ce cours (cartes mentales, étapes, classifications, liens entre notions), y compris sans aucune image : dessine-les à partir du texte, sans rien inventer. Chaque élément : "id" 1, 2, 3…, "title", "section" = titre EXACT d'une partie du cours où il se place, "svg" selon ces règles : ${SVG_RULES}.

Prépare la retranscription de ce cours pour ${DOMAIN.audience} :
- "keyTerms" : TOUS les termes importants du cours (${DOMAIN.termKinds}), entre 10 et 60 selon la longueur du cours, chacun avec une définition fidèle au cours en 1 à 2 phrases.
- "aRetenir" : 5 à 10 points essentiels.`;
  // Chaque image est précédée de son repère, pour que Gemini puisse la désigner (« Image 3 »)
  const label = (m, k) => (/^Image \d+$/.test(m.name || '') ? m.name : `Image ${k + 1}`);
  const parts0 = (withMedia) => [...(withMedia ? media.flatMap((m, k) => [{ text: `[${label(m, k)}]` }, { inlineData: { mimeType: m.mimeType, data: m.data } }]) : []), { text: outlinePrompt(withMedia) }];
  onProgress('Lecture du cours et des schémas…');
  let outline;
  let notice = '';
  try {
    outline = await call({ parts: parts0(media.length > 0), schema: OUTLINE_SCHEMA, temperature: 0.2 });
  } catch (err) {
    if (!media.length || /quota|clé|key/i.test(err.message)) throw err;
    outline = await call({ parts: parts0(false), schema: OUTLINE_SCHEMA, temperature: 0.2 });
    notice = 'Les schémas n’ont pas pu être recréés pour ce cours.';
  }
  const keyTerms = (outline.keyTerms || []).filter((k) => k.term && k.definition);
  const termList = keyTerms.map((k) => k.term).join(' ; ');

  // Étape B : retranscription intégrale (corrigée et, si le réglage est actif, complétée), partie par partie
  const chunks = splitCourse(text);
  const complete = getSettings().completeCourse !== false;
  const written = [];
  for (let i = 0; i < chunks.length; i++) {
    onProgress(chunks.length > 1 ? `Rédaction du cours (partie ${i + 1} sur ${chunks.length})…` : 'Rédaction du cours complet…');
    const prev = written.length ? (written[written.length - 1].match(/^#{2,3} .*$/gm) || []).slice(-1)[0] || '' : '';
    const prompt = `Tu mets au propre un cours pour ${DOMAIN.audience}. Voici la PARTIE ${i + 1} sur ${chunks.length} du cours « ${course.title} ».
--- PARTIE ${i + 1} ---
${chunks[i]}
--- FIN DE LA PARTIE ---

RETRANSCRIS INTÉGRALEMENT cette partie en Markdown. C'est une retranscription complète, PAS un résumé :
- Garde TOUT le contenu : chaque notion, définition, explication, exemple, liste, chiffre, nom d'auteur ou de test, cas, et les notes de l'orateur. Ne supprime rien, ne fusionne pas des idées distinctes.
- Rédige en phrases complètes ce qui est télégraphique (diapositives).
- Orthographe, grammaire, accords, conjugaison et ponctuation irréprochables : corrige toutes les fautes et les mots mal lus (photo, dictée) quand le bon mot est évident, sans le signaler.
${complete ? completeRules(i, chunks) : "- N'invente rien : si une information manque, n'en ajoute pas."}
- Organise avec des titres "## …" (grandes parties) et "### …" (sous-parties) qui suivent l'ordre du cours, puis des paragraphes et des listes. Ne répète pas le titre du cours. Pas de « Diapositive 3 » ni de « Page 2 » dans les titres : donne de vrais titres.
- Mets en **gras** les idées importantes. Surligne avec ==terme== chaque occurrence importante de ces termes (même orthographe) : ${termList || '(aucun)'}. Exemples de forme : ${DOMAIN.termExamples}.
${TAG_RULES}
- TABLEAUX DE DONNÉES (chiffres, prix, quantités, résultats…) : recopie-les en tableau Markdown, une ligne par ligne du tableau d'origine, précédé de son titre (ex. « Tableau 7 : … »), avec une ligne d'en-tête puis "|---|---|" :
  | Prix (€) | 0,50 | 1 | 2 |
  |---|---|---|---|
  | Quantité demandée (t) | 3750 | 3500 | 3000 |
  Jamais de valeurs séparées par des « | » au milieu d'une phrase. Pas d'autre tableau que les tableaux de données.
- Graphique du cours (« Graphique 7 : … ») : garde son titre et décris en une phrase ce qu'il montre (ex. les deux courbes et leur point de rencontre).
- Repères d'images « [Image N] » : garde chacun sur une ligne seule, exactement à sa place (l'image y sera affichée).
- Liens « [texte](https://…) » (vidéos, sites, documents) : garde-les tels quels, avec leur adresse exacte.
- Un support mentionné mais absent (vidéo, publicité, document, image sans repère ni lien) : n'invente pas son contenu ; écris à la place une ligne « >+ Support non fourni dans le cours : … (à retrouver auprès de l'enseignant) ».
- Formules : écris-les en LaTeX entre $ … $ (ex. $\\frac{\\text{effectif de A}}{\\text{effectif de B}} \\times 100$), et seulement les vraies formules.
- Pas de HTML, pas d'introduction ni de conclusion générale, pas de partie « À retenir » : la suite du cours viendra après.${prev ? `\n- La partie précédente se terminait par la section « ${prev.replace(/^#+\s*/, '')} » : continue logiquement.` : ''}
La longueur doit être proportionnelle au contenu : un long cours donne un long texte.`;
    written.push((await call({ parts: [{ text: prompt }], temperature: 0.2 })).trim());
  }
  // Étape C : relecture des compléments (justesse, cohérence avec le cours, orthographe)
  if (complete) {
    for (let i = 0; i < written.length; i++) {
      if (!hasAdditions(written[i])) continue;
      onProgress(written.length > 1 ? `Vérification des compléments (partie ${i + 1} sur ${written.length})…` : 'Vérification des compléments…');
      try { written[i] = await reviewAdditions(course, chunks[i], written[i]); }
      catch (err) { if (/quota|clé|key/i.test(err.message)) throw err; /* sinon on garde la version non relue */ }
    }
  }

  const diagrams = (outline.diagrams || [])
    .map((d) => ({ id: d.id, title: String(d.title || '').trim(), section: d.section || '', svg: sanitizeSvg(d.svg) }))
    .filter((d) => d.svg);
  // Relecture visuelle de chaque schéma (réglage « Relire les schémas », actif par défaut)
  if (getSettings().reviewSchemas !== false) {
    for (let i = 0; i < diagrams.length; i++) {
      onProgress(`Relecture des schémas (${i + 1} sur ${diagrams.length})…`);
      try { const better = await reviewSchemaVisual({ ...course, summary: written.join('\n\n') }, diagrams[i]); if (better) diagrams[i].svg = better; }
      catch (err) { if (/quota|clé|key/i.test(err.message)) break; }
    }
  }
  // Images d'origine choisies par Gemini : montrées telles quelles, à l'endroit de leur repère [Image N]
  let body = written.join('\n\n');
  const figures = [];
  const seenImg = new Set();
  (outline.figures || []).forEach((f, i) => {
    const k = media.findIndex((m, j) => label(m, j).toLowerCase() === String(f.image || '').trim().replace(/^\[|\]$/g, '').toLowerCase());
    const m = media[k];
    if (!m || seenImg.has(k) || !/^image\//.test(m.mimeType || '')) return;
    seenImg.add(k);
    const id = 500 + i;
    figures.push({ id, title: String(f.title || '').trim(), caption: String(f.caption || '').trim(), section: f.section || '',
      image: `data:${m.mimeType};base64,${m.data}`, source: 'cours', credit: 'Document du cours d’origine' });
    const re = new RegExp(`^[ \\t]*\\[${label(m, k)}\\][ \\t]*$`, 'mi');
    if (re.test(body)) body = body.replace(re, `[[schema:${id}]]`);
    else body = insertSchema(body, f.section || '', id, f.title || '');
  });
  body = body.replace(/^[ \t]*\[Image \d+\][ \t]*\n?/gim, ''); // repères des images non retenues
  // Sous le titre de leur partie ; sinon dans la partie dont le texte leur correspond le mieux (plus jamais tous à la fin)
  const placed = placeDiagrams(body, diagrams);
  const md = placed.unplaced.reduce((acc, d) => insertSchema(acc, d.section, d.id, d.title), placed.md);
  diagrams.push(...figures);
  const retenir = (outline.aRetenir || []).filter(Boolean);
  const summary = `${md}${retenir.length ? `\n\n## À retenir\n${retenir.map((x, i) => `${i + 1}. ${x}`).join('\n')}` : ''}`;
  return { title: outline.title, subject: outline.subject, keyTerms, diagrams, summary, notice, parts: chunks.length };
}

// ---------------------------------------------------------------------------
// 3. Synthèse détaillée et définition d'un mot
// ---------------------------------------------------------------------------
const SYNTH_BOX_SCHEMA = {
  type: 'OBJECT',
  properties: {
    essentiel: { type: 'STRING', description: "5 à 8 phrases qui donnent l'idée générale et le fil du cours" },
    liens: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Notions qui se répondent ou à ne pas confondre' },
    pieges: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Pièges et erreurs fréquentes' },
  },
  required: ['essentiel', 'liens', 'pieges'],
};
const countWords = (t) => (String(t).match(/[\p{L}\p{N}]+/gu) || []).length;

/**
 * Synthèse « entre la fiche et le cours » : environ un tiers du cours, qui suit son plan et garde
 * les explications, le contexte et les exemples (plusieurs pages si besoin).
 * Corps rédigé partie par partie ; « L'essentiel » en tête, liens et pièges à la fin.
 */
export async function generateSynthesis(course, onProgress = () => {}) {
  const src = (course.summary || course.text || '')
    .replace(/\[\[schema:\d+\]\]/g, '')
    .replace(/\n## À retenir[\s\S]*$/, '')
    .trim();
  if (!src) throw new Error("Le cours complet doit d'abord être rédigé.");
  const head = `Cours « ${course.title} »${course.subject ? ` (${course.subject})` : ''}, pour ${DOMAIN.audience}.`;
  const terms = (course.keyTerms || []).map((k) => k.term).filter(Boolean).slice(0, 60).join(' ; ');
  const chunks = splitCourse(src, 24000);
  const body = [];
  for (let i = 0; i < chunks.length; i++) {
    onProgress(chunks.length > 1 ? `Rédaction de la synthèse (partie ${i + 1} sur ${chunks.length})…` : 'Rédaction de la synthèse…');
    const target = Math.max(180, Math.round(countWords(chunks[i]) * 0.38));
    const prompt = `${head}
Voici ${chunks.length > 1 ? `la PARTIE ${i + 1} sur ${chunks.length} du cours` : 'le cours'} :
--- COURS ---
${chunks[i]}
--- FIN ---

Rédige la SYNTHÈSE DÉTAILLÉE de ce texte : un juste milieu entre une fiche résumé (trop sèche) et le cours complet (trop long).
Longueur visée : environ ${target} mots (à peu près un tiers du texte). Ce n'est PAS une page unique : prends la place nécessaire, mais condense toujours le cours.
- Suis le plan du cours : reprends ses titres "## …" et "### …" dans le même ordre (tu peux regrouper des sous-parties très courtes).
- Pour chaque notion importante, garde : sa définition ; l'explication (le mécanisme, le raisonnement, le « pourquoi ») ; le contexte (dans quel cas, chez qui, à quelle époque, selon quel auteur) ; au moins un exemple concret.
- Les exemples, cas, chiffres, dates, auteurs, études, tests et références du cours sont précieux : garde-les en priorité.
- Quand une partie compare plusieurs notions, auteurs ou théories, résume la comparaison dans un tableau Markdown (| … |, une ligne d'en-tête puis |---|), avec les informations du cours.
- Si le cours ne donne aucun exemple pour une notion essentielle, tu peux en ajouter un, simple et incontestable, en le signalant par « (exemple ajouté) ». N'invente jamais de chiffre, de nom, d'étude ni de référence.
- Ce que tu enlèves : répétitions, digressions, formules d'oral, annonces de plan, détails vraiment secondaires.
- Rédige en phrases complètes, en paragraphes courts, avec des listes quand c'est plus clair. Mets en **gras** les idées importantes et surligne avec ==terme== les termes clés${terms ? ` (notamment : ${terms})` : ''}.
${TAG_RULES}
- Pas d'autre tableau que les tableaux de comparaison ou de données, pas de HTML, pas de lien, pas d'introduction ni de conclusion générale, pas de partie « L'essentiel », « À retenir » ou « Pièges » : elles seront ajoutées à part.`;
    body.push((await call({ parts: [{ text: prompt }], temperature: 0.3 })).trim());
  }
  onProgress('Synthèse : l’essentiel et les pièges…');
  const box = await call({
    parts: [{ text: `${head}
--- COURS ---
${src.slice(0, 120000)}
--- FIN ---

Pour la synthèse de ce cours, rédige : « essentiel » (5 à 8 phrases qui donnent l'idée générale et le fil conducteur du cours) ; « liens » (3 à 6 points : notions qui se répondent ou qu'il ne faut pas confondre, avec la différence expliquée) ; « pieges » (3 à 5 erreurs fréquentes, chacune avec la bonne réponse). Appuie-toi uniquement sur le cours. Tu peux surligner les termes clés avec ==terme==.` }],
    schema: SYNTH_BOX_SCHEMA,
    temperature: 0.3,
  });
  const list = (a) => (a || []).map((x) => String(x).trim()).filter(Boolean).map((x) => `- ${x}`).join('\n');
  return [
    `## L'essentiel\n${String(box.essentiel || '').trim()}`,
    body.join('\n\n'),
    box.liens?.length ? `## Liens et confusions\n${list(box.liens)}` : '',
    box.pieges?.length ? `## Pièges fréquents\n${list(box.pieges)}` : '',
  ].filter(Boolean).join('\n\n');
}

/** Passages du cours où le terme apparaît (pour lever les ambiguïtés de sens). */
function excerptsAround(course, term) {
  const text = `${course.text || ''}\n${(course.summary || '').replace(/\[\[schema:\d+\]\]/g, '')}`.replace(/[=*#]/g, '');
  const low = text.toLowerCase();
  const t = term.toLowerCase();
  const out = [];
  let from = 0;
  while (out.length < 3) {
    const i = low.indexOf(t, from);
    if (i < 0) break;
    out.push(text.slice(Math.max(0, i - 250), i + t.length + 350).replace(/\s+/g, ' ').trim());
    from = i + 700;
  }
  return out;
}

const cleanDef = (t) => String(t || '')
  .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '$1')
  .replace(/\s?\[(\d+(?:,\s*\d+)*)\]/g, '')
  .replace(/https?:\/\/\S+/g, '')
  .replace(/^\s*(d[ée]finition\s*:?\s*)/i, '')
  .replace(/[*_`#]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

/** Premières phrases d'un extrait (repli quand l'IA ne répond pas). */
const firstSentences = (t, n = 2) => (String(t).match(/[^.!?]+[.!?]+(\s|$)/g) || [String(t)]).slice(0, n).join('').trim();

/**
 * Définition d'un mot, cherchée sur internet : Wikipédia (extraits réels) + recherche Google de Gemini,
 * en tenant compte du sens employé dans le cours. Repli : Wikipédia seul, puis Gemini sans recherche.
 * Renvoie { definition, sources: [{title, uri}], origin: 'web' | 'wikipedia' | 'ia' }.
 */
export async function defineTerm(course, term, ctx = {}) {
  const { model } = getSettings();
  let wiki = [];
  try { const r = await api.define.lookup(term); if (r?.ok) wiki = r.results || []; } catch { /* hors ligne : on continue */ }
  const excerpts = excerptsAround(course, term);
  const para = String(ctx.paragraph || '').replace(/\s+/g, ' ').trim().slice(0, 1400);
  const heading = String(ctx.heading || '').trim();
  const intro = `Tu aides ${DOMAIN.audience} à comprendre un mot de SON cours.
Cours : « ${course.title} »${course.subject ? ` (${course.subject})` : ''}.${heading ? `\nPartie du cours : « ${heading} ».` : ''}
Mot à définir : « ${term} »
${para ? `\nPassage où le mot a été surligné (c'est CE sens qu'il faut définir) :\n« ${para} »\n` : ''}${excerpts.length ? `\nAutres passages du cours où il apparaît :\n${excerpts.map((e) => `- … ${e} …`).join('\n')}\n` : ''}${wiki.length ? `\nExtraits de Wikipédia (seulement pour confirmer ; ignore-les s'ils parlent d'un autre sens) :\n${wiki.map((w) => `- ${w.title} : ${w.extract}`).join('\n')}\n` : ''}`;
  const rules = `
Écris la définition de « ${term} » telle qu'il faut la comprendre dans CE cours :
- Commence directement par une définition précise : ce que c'est, et ce qui le distingue (critères, mécanisme, composantes). Jamais de formule vague (« notion qui désigne… », « concept important qui… », « terme utilisé pour… ») ni de généralités.
- Si le cours donne sa propre définition, reprends-la fidèlement et précise-la.
- Garde le sens du domaine de ce cours${course.subject ? ` (${course.subject})` : ''} et du passage surligné, jamais un autre sens du même mot.
- Termine par une phrase « Dans ce cours : … » qui relie le mot au passage (rôle, exemple, cause ou conséquence), si le cours le permet.
- 2 à 4 phrases en tout. Pas de titre, pas de markdown, pas de lien, pas de numéro de source.`;
  const keyIssue = (r) => r && !r.ok && /quota|clé|key|429/i.test(r.error || '');
  // 1) D'abord à partir du cours (sans internet) : la définition reste dans le sens du cours
  if (!ctx.web) {
    const res = await api.gemini.generate({ model, system: SYSTEM, temperature: 0.2, parts: [{ text: `${intro}${rules}\n- Si le cours et des connaissances sûres ne suffisent pas pour être précis, réponds seulement : BESOIN_RECHERCHE` }] });
    const text = res?.ok ? cleanDef(res.text) : '';
    if (text && !/BESOIN_RECHERCHE|^INTROUVABLE\b/i.test(text)) return { definition: text, sources: [], origin: 'cours' };
    if (keyIssue(res)) throw new Error(res.error);
  }
  // 2) Sinon (ou à la demande) : recherche sur internet, toujours dans le sens du cours
  const base = { model, system: SYSTEM, temperature: 0.2, parts: [{ text: `${intro}${rules}\n- Vérifie sur internet. N'invente rien : si tu ne trouves aucune source fiable, réponds seulement : INTROUVABLE` }] };
  let res = null;
  let usedSearch = true;
  for (const search of [true, false]) {
    usedSearch = search;
    res = await api.gemini.generate({ ...base, search });
    if (res.ok || keyIssue(res)) break; // inutile de réessayer si la clé ou le quota posent problème
  }
  const text = res?.ok ? cleanDef(res.text) : '';
  const fromWiki = wiki.map((w) => ({ title: `${w.source} : ${w.title}`, uri: w.url }));
  if (text && !/^INTROUVABLE\b/i.test(text)) {
    const web = (res.sources || []).filter((x) => x?.uri).slice(0, 3);
    return { definition: text, sources: [...(wiki.length ? fromWiki.slice(0, 1) : []), ...web].slice(0, 4), origin: usedSearch ? 'web' : 'ia' };
  }
  if (wiki.length) return { definition: firstSentences(wiki[0].extract), sources: fromWiki.slice(0, 1), origin: 'wikipedia' };
  if (res && !res.ok) throw new Error(res.error);
  throw new Error(`Aucune définition fiable trouvée pour « ${term} ». Écris-la toi-même, ou essaie une autre forme du mot (singulier, sans article).`);
}

// ---------------------------------------------------------------------------
// 4. Changer un schéma : redessin en SVG, ou dessin par IA (image)
// ---------------------------------------------------------------------------
// Modèle d'images de Gemini (« Nano Banana 2 »), puis l'ancien en secours
const IMAGE_MODELS = ['gemini-3.1-flash-image', 'gemini-2.5-flash-image'];

/** Redessine le schéma en SVG, à partir de son titre et de sa légende. */
export async function redrawSchemaSvg(course, d) {
  const made = await generateDiagrams(course, {
    request: `${d.title || ''}${d.caption ? ` — ${d.caption}` : ''} (version refaite, plus lisible et plus complète)`,
    existing: [], terms: [], count: 1, sections: d.section ? [d.section] : [],
  });
  if (!made[0]) throw new Error("L'IA n'a pas pu redessiner ce schéma. Réessaie.");
  return { svg: made[0].svg, title: made[0].title || d.title, caption: made[0].caption || d.caption };
}

/** Dessine une illustration (image) pour ce schéma, avec le modèle d'images de Gemini. */
export async function drawSchemaImage(course, d) {
  const prompt = `Dessine une illustration pédagogique claire et soignée, style manuel de révision, fond blanc, pour un étudiant : « ${d.title || ''} ». ${d.caption || ''} Contexte du cours : ${course.title}. Reste fidèle au cours. Si un texte apparaît dans l'image, il doit être court, en français et exact.`;
  let lastErr = null;
  for (const model of IMAGE_MODELS) {
    const res = await api.gemini.generate({ model, image: true, parts: [{ text: prompt }], temperature: 0.6 });
    if (res.ok) {
      const img = (res.images || [])[0];
      if (img) return { image: `data:${img.mimeType};base64,${img.data}` };
      lastErr = new Error("L'IA n'a pas renvoyé d'image. Réessaie avec un autre schéma.");
    } else {
      lastErr = new Error(res.error);
      // Clé ou quota : inutile d'essayer l'autre modèle
      if (/quota|clé|cle|key|429|facturation|billing/i.test(res.error || '')) break;
    }
  }
  throw new Error(`${lastErr ? lastErr.message : 'Échec du dessin.'} La génération d'images peut demander une clé Gemini avec facturation activée.`);
}

const KEYWORDS_SCHEMA = {
  type: 'OBJECT',
  properties: { keywords: { type: 'ARRAY', items: { type: 'STRING' } } },
  required: ['keywords'],
};

/** Idées de recherche d'images : Wikimédia Commons nomme surtout ses fichiers en anglais. */
export async function imageKeywords(course, d) {
  const prompt = `Schéma à illustrer : « ${d.title || ''} »${d.caption ? ` (${d.caption})` : ''}, dans le cours « ${course.title} », pour ${DOMAIN.audience}.
Propose 4 recherches courtes (2 à 4 mots chacune) pour trouver une image ou un schéma libre de droits sur Wikimédia Commons : 3 en anglais (les fichiers y sont surtout nommés en anglais) puis 1 en français. Du plus précis au plus général. Pas de phrase, pas de ponctuation.`;
  const { keywords = [] } = await call({ parts: [{ text: prompt }], schema: KEYWORDS_SCHEMA, temperature: 0.3 });
  const clean = keywords.map((k) => String(k).replace(/[^\p{L}\p{N}\s'-]/gu, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
  return [...new Set(clean)].slice(0, 5);
}

// ---------------------------------------------------------------------------
// Relecture visuelle d'un schéma : Gemini regarde le rendu (image) comme un lecteur,
// puis renvoie un SVG corrigé s'il voit des défauts (texte qui déborde, chevauchements…).
// ---------------------------------------------------------------------------
/** Extrait du cours autour de la partie d'un schéma (pour vérifier son contenu). */
export function sectionExcerpt(course, section = '', max = 3500) {
  const md = (course.summary || course.text || '').replace(/\[\[schema:\d+\]\]/g, '');
  if (section) {
    const i = md.toLowerCase().indexOf(section.toLowerCase());
    if (i >= 0) return md.slice(i, i + max);
  }
  return md.slice(0, max);
}

export async function reviewSchemaVisual(course, d) {
  if (!d?.svg) return null;
  let png;
  try { png = await svgToPng(d.svg); } catch { return null; }
  const prompt = `Tu relis un schéma de révision du cours « ${course.title} » pour ${DOMAIN.audience}.
Schéma : « ${d.title || ''} »${d.caption ? ` — ${d.caption}` : ''}.
L'IMAGE jointe est son rendu réel ; voici son code SVG :
${d.svg}

Extrait du cours correspondant :
${sectionExcerpt(course, d.section || d.title)}

1. Regarde l'image comme un lecteur exigeant : texte qui dépasse de son cadre ou de l'image, textes qui se chevauchent, flèches qui ne relient rien ou traversent du texte, éléments trop petits ou serrés, cadres vides, schéma déséquilibré ou pauvre, erreur par rapport au cours, faute d'orthographe.
2. S'il n'y a aucun défaut visible, réponds uniquement : OK
3. Sinon, réponds uniquement avec le SVG complet corrigé et amélioré (même contenu juste, mise en page plus lisible), sans commentaire. Règles : ${SVG_RULES}`;
  const text = await call({ parts: [{ inlineData: { mimeType: 'image/png', data: png } }, { text: prompt }], temperature: 0.2 });
  if (/^\s*OK\b/i.test(text)) return null;
  const m = String(text).match(/<svg[\s\S]*<\/svg>/i);
  const svg = m ? sanitizeSvg(m[0]) : '';
  return svg || null;
}

// ---------------------------------------------------------------------------
// Podcast : le cours raconté par deux voix (script rédigé par Gemini, voix ElevenLabs)
// ---------------------------------------------------------------------------
export const PODCAST_LENGTHS = [
  { id: 'court', label: 'Court', minutes: 5, words: 750 },
  { id: 'moyen', label: 'Moyen', minutes: 10, words: 1500 },
  { id: 'long', label: 'Long', minutes: 20, words: 3000 },
];

const PODCAST_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    lines: { type: 'array', items: { type: 'object', properties: { speaker: { type: 'string', enum: ['A', 'B'] }, text: { type: 'string' } }, required: ['speaker', 'text'] } },
  },
  required: ['title', 'lines'],
};

/** Script du podcast : { title, lines: [{ speaker: 'A' | 'B', text }] }. */
/** Consigne du dialogue de podcast (aussi utilisée pour Claude, sans API). */
export function podcastPrompt(course, { length = 'moyen' } = {}) {
  const L = PODCAST_LENGTHS.find((x) => x.id === length) || PODCAST_LENGTHS[1];
  const source = String(course.summary || course.synthesis || course.text || '') // le cours complet : Gemini le condense à la durée voulue
    .replace(/\[\[schema:\d+\]\]/g, '').replace(/^\s*\[Image \d+\]\s*$/gm, '').slice(0, 120000);
  if (source.trim().length < 200) throw new Error("Ce cours est trop court pour en faire un podcast. Génère d'abord le cours.");
  const prompt = `Écris le script d'un podcast audio en français pour ${DOMAIN.audience}, à partir de ce cours : « ${course.title} »${course.subject ? ` (${course.subject})` : ''}.
Deux voix :
- A : l'animatrice, curieuse, qui pose les questions qu'une étudiante se poserait, reformule, demande des exemples et fait les transitions.
- B : l'experte, qui explique clairement et précisément, avec les mots du cours.
Règles :
- Longueur visée : environ ${L.words} mots au total (≈ ${L.minutes} minutes à l'écoute).
- Suis le plan du cours, partie par partie ; couvre les notions importantes, les définitions exactes, les mécanismes, les exemples et les pièges.
- Fidélité absolue : aucun chiffre, aucune date, aucun auteur, aucune étude qui ne soit pas dans le cours. Si tu ajoutes un exemple pour illustrer, présente-le comme un exemple (« imaginons… »).
- Ton HUMAIN, pas robotique : deux personnes qui se connaissent et discutent vraiment, pas un cours lu à deux voix ni un jeu de questions-réponses mécanique.
  · Elles réagissent à ce que l'autre vient de dire (« Ah oui, c'est là que ça devient intéressant », « Attends, je ne suis pas sûre de te suivre… », « C'est ça, exactement ») au lieu d'enchaîner question puis réponse.
  · L'animatrice exprime parfois un doute, une surprise ou une erreur fréquente (« Moi j'aurais cru que… »), et l'experte la corrige avec bienveillance.
  · Images concrètes et analogies de la vie courante pour faire comprendre, présentées comme des comparaisons.
  · Rythme varié : alterne répliques très courtes (« Voilà. », « Exactement. ») et explications plus longues ; varie les débuts de phrase, n'utilise jamais deux fois la même formule de transition ou de relance.
  · Contractions et tournures orales naturelles (« on va voir », « c'est-à-dire », « en fait », « bon »), avec modération ; pas de « Absolument ! », « Excellente question ! » ni de compliments en boucle.
  · Une ou deux touches d'humour léger ou de chaleur sont bienvenues si elles servent la compréhension ; jamais de bavardage creux.
  · Pas de formules de présentatrice radio artificielles (« Bienvenue dans ce nouvel épisode passionnant ») : un accueil simple et chaleureux suffit.
- Écris pour l'oreille : pas de markdown, pas de listes, pas de symboles, pas d'abréviations (écris « par exemple », « pour cent ») ; les formules sont dites en mots.
- Une réplique = 1 à 4 phrases. Commence par une courte présentation du sujet ; termine par un récapitulatif « Ce qu'il faut retenir » en quelques points dits par B, puis une phrase de conclusion de A.
- title : titre court de l'épisode.

COURS :
${source}`;
  return prompt;
}

/** Réponse brute { title, lines } → dialogue propre (texte pour l'oreille, sans symboles de mise en forme). */
export function cleanPodcast(r, course) {
  const lines = (r?.lines || [])
    .map((l) => ({ speaker: l.speaker === 'B' ? 'B' : 'A', text: String(l.text || '').replace(/[*_#`>]/g, '').replace(/\s+/g, ' ').trim() }))
    .filter((l) => l.text);
  if (lines.length < 4) throw new Error("Le script du podcast est trop court. Réessaie.");
  return { title: String(r.title || course.title).trim(), lines };
}

export async function podcastScript(course, opts = {}) {
  const r = await call({ parts: [{ text: podcastPrompt(course, opts) }], schema: PODCAST_SCHEMA, temperature: 0.8 });
  return cleanPodcast(r, course);
}
