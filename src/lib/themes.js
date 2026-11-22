// Palettes de couleurs (Réglages › Apparence) : chacune s'appuie sur le mode clair ou sombre
// et redéfinit le fond, les surfaces et la couleur d'accent (styles/themes.css).
export const PALETTES = [
  { id: 'default', label: 'Classique', mode: null, bg: '#f3f4f8', bg2: '#0b0c12', accent: '#4f46e5' },
  { id: 'lavande', label: 'Lavande', mode: 'light', bg: '#f5f2fc', accent: '#8b5cf6' },
  { id: 'sauge', label: 'Sauge', mode: 'light', bg: '#eff5f0', accent: '#0f9f6e' },
  { id: 'peche', label: 'Pêche', mode: 'light', bg: '#fcf3ec', accent: '#ea6a2f' },
  { id: 'rose', label: 'Rose', mode: 'light', bg: '#fdf2f5', accent: '#e11d48' },
  { id: 'ciel', label: 'Ciel', mode: 'light', bg: '#eef6fd', accent: '#0284c7' },
  { id: 'sable', label: 'Sable', mode: 'light', bg: '#f7f3ea', accent: '#b45309' },
  { id: 'ocean', label: 'Océan', mode: 'dark', bg: '#071520', accent: '#22b8e6' },
  { id: 'foret', label: 'Forêt', mode: 'dark', bg: '#0a140f', accent: '#34c77b' },
  { id: 'aurore', label: 'Aurore', mode: 'dark', bg: '#150c17', accent: '#f472b6' },
  { id: 'minuit', label: 'Minuit', mode: 'dark', bg: '#000000', accent: '#818cf8' },
  { id: 'graphite', label: 'Graphite', mode: 'dark', bg: '#121214', accent: '#64748b' },
  { id: 'amethyste', label: 'Améthyste', mode: 'dark', bg: '#130b1f', accent: '#a855f7' },
  { id: 'cafe', label: 'Café', mode: 'dark', bg: '#140e0a', accent: '#d97706' },
];
export const paletteOf = (id) => PALETTES.find((p) => p.id === id) || PALETTES[0];

// Polices de l'interface (Réglages › Apparence) : celles de l'application, sans rien à installer
export const UI_FONTS = [
  { id: 'system', label: 'Système', family: "-apple-system, 'Segoe UI', sans-serif" },
  { id: 'lisible', label: 'Très lisible', family: "'Atkinson Hyperlegible', 'Segoe UI', sans-serif" },
  { id: 'arrondie', label: 'Arrondie', family: "'Shantell Sans', 'Segoe UI', sans-serif" },
  { id: 'ecoliere', label: 'Écolière', family: "'Comic Neue', 'Segoe UI', sans-serif" },
  { id: 'classique', label: 'Classique', family: "Georgia, 'Times New Roman', serif" },
];
