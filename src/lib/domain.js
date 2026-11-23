// Textes propres à la discipline, utilisés par les fonctions IA communes (ai-extra.js).
// Ce fichier est le seul à différer entre Ortho Révision et CAPES SES Révision.
export const DOMAIN = {
  audience: "une étudiante en orthophonie (Certificat de Capacité d'Orthophoniste)",
  diagramIdeas:
    "carte mentale des notions, étapes d'un processus (ex. temps de la déglutition, production de la parole), " +
    'classification des pathologies, arbre de diagnostic différentiel, démarche de bilan puis de prise en charge, ' +
    'schéma anatomique simplifié et légendé (larynx, aires du langage, appareil phonatoire)',
  newsFocus:
    'recherches et publications récentes, recommandations de bonnes pratiques (HAS, sociétés savantes, FNO), ' +
    "nouveaux outils d'évaluation ou de rééducation, évolutions de la profession d'orthophoniste en France",
};

// Fonctions propres à ce logiciel
DOMAIN.features = { diagramQuiz: true };

// Cours complet : indications pour la retranscription
DOMAIN.subjectHint = 'Matière / domaine (ex. Neurologie, Phonétique, Voix, Langage oral, Déglutition…)';
DOMAIN.termKinds = 'terme médical, anatomique, linguistique, test ou pathologie clé';
DOMAIN.termExamples = '==aphasie de Broca==, ==dysphasie==, ==déglutition atypique==, ==phonème==, ==nerf récurrent==';
// Libellé des questions générées (barre de progression)
DOMAIN.questionsLabel = 'QCM et cas cliniques';

// Extrait montré dans Réglages › Apparence des cours
DOMAIN.styleSample = "## La mémoire de travail\n>[def] La **mémoire de travail** maintient et manipule une information pendant quelques secondes.\nSelon @@Baddeley@@ (^^1974^^), elle comprend plusieurs composantes, dont la ==boucle phonologique==.\n>[ex] Retenir un numéro de téléphone le temps de le composer.\n>[piege] Ne pas la confondre avec la mémoire à court terme.";
