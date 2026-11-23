// Mots du français courant et leur transcription en API (prononciation standard).
// Les variantes fréquentes (/a/ pour /ɑ/, /ɛ̃/ pour /œ̃/, schwa muet, voyelles moyennes
// ouvertes ou fermées) sont acceptées automatiquement par l'exercice.
export const WORDS = [
  ['chat', 'ʃa'], ['maison', 'mɛzɔ̃'], ['enfant', 'ɑ̃fɑ̃'], ['parler', 'paʁle'], ['fenêtre', 'fənɛtʁ'],
  ['pain', 'pɛ̃'], ['brun', 'bʁœ̃'], ['lundi', 'lœ̃di'], ['oiseau', 'wazo'], ['huit', 'ɥit'],
  ['nuit', 'nɥi'], ['fille', 'fij'], ['soleil', 'sɔlɛj'], ['travail', 'tʁavaj'], ['montagne', 'mɔ̃taɲ'],
  ['parking', 'paʁkiŋ'], ['jeune', 'ʒœn'], ['jeûne', 'ʒøn'], ['peur', 'pœʁ'], ['deux', 'dø'],
  ['rue', 'ʁy'], ['roue', 'ʁu'], ['vin', 'vɛ̃'], ['vent', 'vɑ̃'], ['vont', 'vɔ̃'],
  ['chanson', 'ʃɑ̃sɔ̃'], ['garçon', 'gaʁsɔ̃'], ['école', 'ekɔl'], ['fleur', 'flœʁ'], ['table', 'tabl'],
  ['livre', 'livʁ'], ['chocolat', 'ʃɔkɔla'], ['papillon', 'papijɔ̃'], ['grenouille', 'gʁənuj'], ['écureuil', 'ekyʁœj'],
  ['ordinateur', 'ɔʁdinatœʁ'], ['orthophonie', 'ɔʁtɔfɔni'], ['langage', 'lɑ̃gaʒ'], ['parole', 'paʁɔl'], ['voix', 'vwa'],
  ['bouche', 'buʃ'], ['langue', 'lɑ̃g'], ['gorge', 'gɔʁʒ'], ['oreille', 'ɔʁɛj'], ['cheveux', 'ʃəvø'],
  ['genou', 'ʒənu'], ['chien', 'ʃjɛ̃'], ['lion', 'ljɔ̃'], ['juin', 'ʒɥɛ̃'], ['loin', 'lwɛ̃'],
  ["aujourd'hui", 'oʒuʁdɥi'], ['question', 'kɛstjɔ̃'], ['famille', 'famij'], ['feuille', 'fœj'], ['abeille', 'abɛj'],
  ['cuillère', 'kɥijɛʁ'], ['agneau', 'aɲo'], ['oignon', 'ɔɲɔ̃'], ['femme', 'fam'], ['monsieur', 'məsjø'],
  ['examen', 'ɛgzamɛ̃'], ['taxi', 'taksi'], ['whisky', 'wiski'], ['pharmacie', 'faʁmasi'], ['escargot', 'ɛskaʁgo'],
  ['château', 'ʃato'], ['gâteau', 'gato'], ['œuf', 'œf'], ['zèbre', 'zɛbʁ'], ['jardin', 'ʒaʁdɛ̃'],
  ['crayon', 'kʁɛjɔ̃'], ['lumière', 'lymjɛʁ'], ['pied', 'pje'], ['yaourt', 'jauʁt'], ['camping', 'kɑ̃piŋ'],
  ['sixième', 'sizjɛm'], ['bonbon', 'bɔ̃bɔ̃'], ['poisson', 'pwasɔ̃'], ['poison', 'pwazɔ̃'], ['dessert', 'desɛʁ'],
  ['désert', 'dezɛʁ'], ['bougie', 'buʒi'], ['ballon', 'balɔ̃'], ['téléphone', 'telefɔn'], ['éléphant', 'elefɑ̃'],
  ['hibou', 'ibu'], ['huile', 'ɥil'], ['ouest', 'wɛst'], ['soif', 'swaf'], ['regarder', 'ʁəgaʁde'],
  ['petit', 'pəti'], ['mouton', 'mutɔ̃'], ['vache', 'vaʃ'], ['cheval', 'ʃəval'], ['chaise', 'ʃɛz'],
  ['gentil', 'ʒɑ̃ti'], ['musique', 'myzik'], ['peigne', 'pɛɲ'], ['parfum', 'paʁfœ̃'], ['un', 'œ̃'],
].map(([word, ipa]) => ({ word, ipa }));

// Thèmes déduits de la transcription (aucun risque d'erreur d'étiquetage)
export function tagsOf(ipa) {
  const t = [];
  if (/̃/.test(ipa)) t.push('nasales');
  if (/[jwɥ]/.test(ipa)) t.push('semi-voyelles');
  if (/[ʃʒɲŋ]/.test(ipa)) t.push('consonnes');
  if (/[yøœə]/.test(ipa)) t.push('voyelles');
  return t;
}

export const THEMES = [
  ['', 'Tous les sons'], ['nasales', 'Voyelles nasales'], ['semi-voyelles', 'Semi-voyelles'],
  ['consonnes', 'ʃ ʒ ɲ ŋ'], ['voyelles', 'y ø œ ə'],
];

export const KEYBOARD = [
  ['Voyelles', ['i', 'e', 'ɛ', 'a', 'ɑ', 'ɔ', 'o', 'u', 'y', 'ø', 'œ', 'ə']],
  ['Nasales', ['ɛ̃', 'ɑ̃', 'ɔ̃', 'œ̃']],
  ['Semi-voyelles', ['j', 'w', 'ɥ']],
  ['Consonnes', ['ʃ', 'ʒ', 'ɲ', 'ŋ', 'ʁ']],
];

/** Forme stricte : sans barres, crochets, espaces ni accents de durée ; ɡ → g. */
export function strictIpa(s = '') {
  return s.normalize('NFD').replace(/[\s/[\]ˈˌː.‿]/g, '').replace(/ɡ/g, 'g');
}
/** Forme souple : variantes admises (r pour ʁ, /a/ pour /ɑ/, /ɛ̃/ pour /œ̃/, schwa muet, voyelles moyennes). */
export function looseIpa(s = '') {
  return strictIpa(s).replace(/[rRʀ]/g, 'ʁ').replace(/ɑ/g, 'a').replace(/œ̃/g, 'ɛ̃').replace(/ə/g, '')
    .replace(/ɛ/g, 'e').replace(/ɔ/g, 'o').replace(/œ/g, 'ø');
}
export function checkIpa(answer, expected) {
  if (strictIpa(answer) === strictIpa(expected)) return 'ok';
  if (strictIpa(answer) && looseIpa(answer) === looseIpa(expected)) return 'variant';
  return 'ko';
}
const plain = (s = '') => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, "'").trim();
/** Lecture : le mot écrit, ou un homophone de la liste. */
export function checkWord(answer, item) {
  const a = plain(answer);
  if (!a) return 'ko';
  if (a === plain(item.word)) return answer.trim().toLowerCase() === item.word.toLowerCase() ? 'ok' : 'variant';
  if (WORDS.some((w) => w.ipa === item.ipa && plain(w.word) === a)) return 'ok';
  return 'ko';
}
