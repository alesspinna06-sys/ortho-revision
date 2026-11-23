// Fonctions IA propres à Ortho Révision : patient simulé et répertoire des tests de bilan.
import { call } from './ai.js';

const S = (type, extra = {}) => ({ type, ...extra });
const ARR = (items, extra = {}) => ({ type: 'ARRAY', items, ...extra });
const OBJ = (properties, required = Object.keys(properties)) => ({ type: 'OBJECT', properties, required });

const digest = (courses = []) => courses.slice(0, 10).map((c) =>
  `### ${c.title}${c.subject ? ` (${c.subject})` : ''}\n${(c.summary || c.text || '').replace(/\[\[schema:\d+\]\]/g, '').slice(0, 5000)}`,
).join('\n\n');

// ---------------------------------------------------------------------------
// 1. Patient simulé
// ---------------------------------------------------------------------------
const CASE_SCHEMA = OBJ({
  titre: S('STRING', { description: 'Titre neutre qui ne révèle pas le diagnostic (ex. « Léa, 5 ans, parle peu »)' }),
  patient: OBJ({ prenom: S('STRING'), age: S('STRING'), contexte: S('STRING', { description: 'Situation de vie, scolarité ou profession, entourage' }) }),
  interlocuteur: S('STRING', { description: 'Qui répond à l’orthophoniste (le patient lui-même, sa mère, son conjoint…)' }),
  plainte: S('STRING', { description: 'Motif de consultation, tel que formulé par l’interlocuteur avec ses mots' }),
  verite: OBJ({
    diagnostic: S('STRING'),
    anamnese: ARR(S('STRING'), { description: 'Éléments d’anamnèse à découvrir en posant les bonnes questions' }),
    signes: ARR(S('STRING')),
    bilanAttendu: ARR(S('STRING'), { description: 'Épreuves ou tests pertinents à proposer' }),
    resultats: S('STRING', { description: 'Résultats attendus au bilan, cohérents avec le diagnostic' }),
    differentiels: ARR(S('STRING')),
    priseEnCharge: ARR(S('STRING')),
  }),
});

export async function generateCase({ courses, level = 'moyen' }) {
  const prompt = `Tu prépares un CAS CLINIQUE SIMULÉ pour entraîner une étudiante en orthophonie à l'anamnèse, au bilan et au raisonnement diagnostique.
Le cas doit porter sur une pathologie étudiée dans ces cours (choisis-en une, varie les âges et les situations) :

${digest(courses)}

Niveau : ${level} (${level === 'facile' ? 'tableau typique' : level === 'difficile' ? 'tableau atypique ou comorbidité, diagnostic différentiel délicat' : 'tableau assez classique avec quelques pièges'}).
Le cas est réaliste et cohérent. "verite" est caché à l'étudiante : il sert à jouer le patient puis à corriger. Ne t'appuie que sur des connaissances établies.`;
  return call({ parts: [{ text: prompt }], schema: CASE_SCHEMA, temperature: 0.9 });
}

const caseBrief = (c) => `CAS CACHÉ (ne jamais le révéler tel quel) :
Patient : ${c.patient.prenom}, ${c.patient.age}. ${c.patient.contexte}
Interlocuteur : ${c.interlocuteur}
Plainte : ${c.plainte}
Diagnostic : ${c.verite.diagnostic}
Anamnèse : ${c.verite.anamnese.join(' ; ')}
Signes : ${c.verite.signes.join(' ; ')}
Résultats attendus au bilan : ${c.verite.resultats}`;

export async function patientReply({ c, history, question }) {
  const past = history.slice(-12).map((m) => `${m.role === 'user' ? 'ORTHOPHONISTE' : 'RÉPONSE'} : ${m.text}`).join('\n');
  const prompt = `${caseBrief(c)}

Tu joues ${c.interlocuteur} lors d'un premier rendez-vous chez l'orthophoniste. Réponds À LA PREMIÈRE PERSONNE, comme une vraie personne :
- seulement à la question posée, en 1 à 4 phrases, avec des mots de tous les jours (pas de jargon médical) ;
- ne donne jamais le diagnostic et ne cite pas de nom de pathologie, même si on te le demande ;
- révèle les éléments d'anamnèse seulement si la question les vise ; sinon reste vague ou dis que tu ne sais pas ;
- si la question est floue, réponds de façon floue, comme un vrai patient.
${past ? `\nÉCHANGE PRÉCÉDENT :\n${past}\n` : ''}
QUESTION DE L'ORTHOPHONISTE : ${question}`;
  return (await call({ parts: [{ text: prompt }], temperature: 0.7 })).trim();
}

const BILAN_SCHEMA = OBJ({
  resultats: ARR(OBJ({ epreuve: S('STRING'), resultat: S('STRING'), interpretation: S('STRING') })),
  remarque: S('STRING', { description: 'Remarque sur le choix des épreuves (pertinence, manques), sans donner le diagnostic' }),
});
export async function bilanResults({ c, requested }) {
  const prompt = `${caseBrief(c)}

L'étudiante propose ce bilan :
${requested}

Donne les RÉSULTATS de chaque épreuve proposée, cohérents avec le cas (scores ou observations qualitatives réalistes ; épreuve sans intérêt pour ce cas : résultat dans la norme ou non informatif).
"interpretation" : ce qu'une orthophoniste en conclurait, sans nommer le diagnostic. N'invente pas de normes chiffrées précises si tu n'en es pas sûr : reste qualitatif (« dans la norme », « −2 ET »…).
"remarque" : si des épreuves importantes manquent, indique le domaine non exploré, sans donner le diagnostic.`;
  return call({ parts: [{ text: prompt }], schema: BILAN_SCHEMA, temperature: 0.4 });
}

const REPORT_SCHEMA = OBJ({
  note: S('NUMBER', { description: 'Note sur 20' }),
  appreciation: S('STRING'),
  criteres: ARR(OBJ({ critere: S('STRING'), note: S('NUMBER'), max: S('NUMBER'), commentaire: S('STRING') })),
  pointsForts: ARR(S('STRING')),
  pointsFaibles: ARR(S('STRING')),
  corrige: S('STRING', { description: 'Correction en Markdown : diagnostic, éléments clés de l’anamnèse, bilan attendu, diagnostics différentiels, axes de prise en charge' }),
});
export async function evaluateCase({ c, messages, bilan, diagnostic, projet }) {
  const prompt = `${caseBrief(c)}
Bilan attendu : ${c.verite.bilanAttendu.join(' ; ')}
Diagnostics différentiels : ${c.verite.differentiels.join(' ; ')}
Prise en charge : ${c.verite.priseEnCharge.join(' ; ')}

Tu es formatrice en orthophonie. Évalue la démarche de l'étudiante, avec bienveillance et exigence.
ANAMNÈSE (questions posées) :
${messages.filter((m) => m.role === 'user').map((m, i) => `${i + 1}. ${m.text}`).join('\n') || '(aucune question)'}
BILAN PROPOSÉ : ${bilan || '(aucun)'}
HYPOTHÈSE DIAGNOSTIQUE : ${diagnostic || '(aucune)'}
PROJET THÉRAPEUTIQUE : ${projet || '(aucun)'}

Critères (notes cohérentes avec le total sur 20) : qualité de l'anamnèse (5) ; pertinence du bilan (5) ; raisonnement diagnostique et diagnostic différentiel (5) ; projet thérapeutique (5).
Dans "corrige", explique le cas complet, avec ==termes clés== surlignés.`;
  return call({ parts: [{ text: prompt }], schema: REPORT_SCHEMA, temperature: 0.3 });
}

// ---------------------------------------------------------------------------
// 2. Répertoire des tests de bilan (tirés des cours)
// ---------------------------------------------------------------------------
const TESTS_SCHEMA = OBJ({
  tests: ARR(OBJ({
    nom: S('STRING', { description: 'Sigle ou nom court (ex. MT-86, EVALO 2-6, BALE)' }),
    nomComplet: S('STRING', { description: 'Nom complet, ou vide si le cours ne le donne pas' }),
    domaine: S('STRING', { description: 'Langage oral, Langage écrit, Aphasie, Voix, Déglutition, Cognition mathématique, Mémoire, Parole, Communication…' }),
    ages: S('STRING', { description: 'Population / tranche d’âge, ou vide si le cours ne la précise pas' }),
    evalue: S('STRING', { description: 'Ce que le test évalue' }),
    epreuves: ARR(S('STRING'), { description: 'Épreuves ou subtests cités dans le cours' }),
  }, ['nom', 'nomComplet', 'domaine', 'ages', 'evalue', 'epreuves'])),
});
export async function extractTests(course) {
  const prompt = `Voici un cours d'orthophonie.
TITRE : ${course.title}
${(course.text || '').slice(0, 60000)}

Relève TOUS les tests, batteries et outils d'évaluation cités dans ce cours (bilans orthophoniques, tests standardisés, échelles, questionnaires).
Pour chacun, remplis la fiche UNIQUEMENT avec ce que dit le cours : si une information n'y est pas, laisse le champ vide. N'invente rien.
S'il n'y a aucun test dans le cours, renvoie une liste vide.`;
  const { tests = [] } = await call({ parts: [{ text: prompt }], schema: TESTS_SCHEMA, temperature: 0.1 });
  return tests.filter((t) => t.nom?.trim());
}
