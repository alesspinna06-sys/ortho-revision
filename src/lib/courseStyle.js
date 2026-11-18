// Apparence des cours (Réglages › Apparence des cours) : Sobre, Cahier (petits carreaux ou Seyès), Moderne.
// Les classes sont posées sur la « feuille » du cours (.course-sheet), pas sur la page entière :
// les aperçus des Réglages peuvent ainsi montrer les trois apparences en même temps.
export const COURSE_STYLES = [
  { id: 'sobre', label: 'Sobre', desc: 'Clair et net, avec un code couleur discret. Idéal pour imprimer.' },
  { id: 'cahier', label: 'Cahier', desc: 'Comme une fiche de révision : papier, écriture et stylos de couleur au choix, surligneur.' },
  { id: 'moderne', label: 'Moderne', desc: 'Cartes colorées avec icônes, parties numérotées qui apparaissent et se replient, barre de lecture.' },
];
export const PAPERS = [{ id: 'carreaux', label: 'Petits carreaux' }, { id: 'seyes', label: 'Seyès' }, { id: 'uni', label: 'Uni' }];
// Écritures de l'apparence Cahier (polices intégrées au logiciel), de la plus « manuscrite » à la plus nette
export const CAHIER_FONTS = [
  { id: 'kalam', label: 'Manuscrite', family: "'Kalam', cursive" },
  { id: 'patrick', label: 'Feutre', family: "'Patrick Hand', cursive" },
  { id: 'shantell', label: 'Arrondie', family: "'Shantell Sans', sans-serif" },
  { id: 'comic', label: 'Écolière', family: "'Comic Neue', sans-serif" },
  { id: 'atkinson', label: 'Très lisible', family: "'Atkinson Hyperlegible', sans-serif" },
  { id: 'livre', label: 'Livre', family: "Georgia, 'Times New Roman', serif" },
];
// Couleurs des stylos : [stylo principal, stylo des titres]
export const CAHIER_INKS = [
  { id: 'bleu', label: 'Bleu et rouge', colors: ['#1d4ed8', '#dc2626'] },
  { id: 'violet', label: 'Violet et rose', colors: ['#6d28d9', '#db2777'] },
  { id: 'vert', label: 'Vert et orange', colors: ['#047857', '#ea580c'] },
  { id: 'noir', label: 'Noir et rouge', colors: ['#1f2937', '#dc2626'] },
  { id: 'turquoise', label: 'Turquoise et prune', colors: ['#0e7490', '#9333ea'] },
  { id: 'rose', label: 'Rose et violet', colors: ['#be185d', '#6d28d9'] },
  { id: 'marine', label: 'Marine et ambre', colors: ['#1e3a8a', '#d97706'] },
  { id: 'bordeaux', label: 'Bordeaux et vert', colors: ['#9f1239', '#0f766e'] },
];
export const LEVELS = [{ id: 'discret', label: 'Discrètes' }, { id: 'normal', label: 'Normales' }, { id: 'vif', label: 'Vives' }];

// Personnalisation commune à toutes les apparences
export const LEADINGS = [{ id: 'serre', label: 'Serré' }, { id: 'normal', label: 'Normal' }, { id: 'aere', label: 'Aéré' }];
export const WIDTHS = [{ id: 'etroit', label: 'Étroite' }, { id: 'normal', label: 'Normale' }, { id: 'large', label: 'Large' }];

export function sheetClass(settings = {}, style) {
  const s = style || settings.courseStyle || 'sobre';
  return `course-sheet cs-${s} paper-${settings.paper || 'carreaux'} cl-${settings.colorLevel || 'normal'} font-${settings.cahierFont || 'shantell'} ink-${settings.cahierInk || 'bleu'} lh-${settings.courseLeading || 'normal'} w-${settings.courseWidth || 'normal'}${settings.courseAccent ? ' has-accent' : ''}`;
}
