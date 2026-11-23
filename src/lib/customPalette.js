// Palette « Personnalisée » : on choisit soi-même le fond, les cartes, le texte et les deux couleurs d'accent ;
// toutes les autres teintes de l'interface (bordures, verres, survols, halos…) en sont déduites.
import { PALETTES } from './themes.js';

export const DEFAULT_CUSTOM = { name: 'Ma palette', mode: 'light', bg: '#f4f1fb', surface: '#ffffff', text: '#1d1a2b', accent: '#7c3aed', accent2: '#ec4899', gradient: true, glow: 'doux' };

const hex = (h) => { const m = String(h || '').replace('#', '').match(/^([0-9a-f]{6}|[0-9a-f]{3})$/i); if (!m) return null; let s = m[1]; if (s.length === 3) s = s.split('').map((c) => c + c).join(''); return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)); };
const toHex = (rgb) => `#${rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
export const mix = (a, b, t) => { const x = hex(a), y = hex(b); if (!x || !y) return a; return toHex(x.map((v, i) => v + (y[i] - v) * t)); };
export const rgba = (h, a) => { const x = hex(h) || [0, 0, 0]; return `rgba(${x[0]}, ${x[1]}, ${x[2]}, ${a})`; };
const lum = (h) => { const x = hex(h) || [0, 0, 0]; const c = x.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
/** Rapport de contraste WCAG (1 à 21). 4,5 au moins pour bien lire un texte. */
export const contrast = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
export const isDark = (h) => lum(h) < 0.2;
export const validHex = (h) => !!hex(h);

/** Point de départ à partir d'une palette existante (Lavande, Océan…). */
export function fromPalette(id) {
  const p = PALETTES.find((x) => x.id === id) || PALETTES[0];
  const mode = p.mode || 'light';
  const bg = p.mode ? p.bg : p.bg;
  const dark = mode === 'dark';
  return {
    ...DEFAULT_CUSTOM, name: `${p.label} modifiée`, mode, bg,
    surface: dark ? mix(bg, '#ffffff', 0.06) : '#ffffff',
    text: dark ? '#ececf3' : '#1c1b22', accent: p.accent, accent2: mix(p.accent, dark ? '#ffffff' : '#ec4899', 0.45),
  };
}

const VARS = ['--bg', '--bg-elev', '--glass', '--glass-strong', '--modal-bg', '--glass-solid', '--glass-hover', '--chip', '--stroke', '--stroke-strong',
  '--accent', '--accent-2', '--accent-grad', '--blob-1', '--blob-2', '--blob-3', '--text', '--text-2', '--text-3', '--primary-bg', '--primary-text', '--input'];

/** Toutes les variables CSS de la palette. */
export function paletteVars(cp0) {
  const cp = { ...DEFAULT_CUSTOM, ...(cp0 || {}) };
  const dark = cp.mode === 'dark';
  const { bg, surface, text, accent, accent2 } = cp;
  const glow = cp.glow === 'aucun' ? 0 : cp.glow === 'vif' ? 1.6 : 1;
  return {
    '--bg': bg,
    '--bg-elev': surface,
    '--glass': dark ? rgba(text, 0.05) : rgba(surface, 0.62),
    '--glass-strong': rgba(surface, dark ? 0.7 : 0.74),
    '--modal-bg': rgba(surface, 0.95),
    '--glass-solid': surface,
    '--glass-hover': rgba(text, dark ? 0.08 : 0.05),
    '--chip': rgba(accent, dark ? 0.12 : 0.07),
    '--stroke': rgba(text, dark ? 0.1 : 0.08),
    '--stroke-strong': rgba(text, dark ? 0.18 : 0.15),
    '--accent': accent,
    '--accent-2': accent2,
    '--accent-grad': cp.gradient ? `linear-gradient(135deg, ${accent} 0%, ${mix(accent, accent2, 0.5)} 50%, ${accent2} 100%)` : accent,
    '--blob-1': rgba(accent, 0.22 * glow),
    '--blob-2': rgba(accent2, 0.16 * glow),
    '--blob-3': rgba(mix(accent, accent2, 0.5), 0.14 * glow),
    '--text': text,
    '--text-2': mix(text, bg, 0.32),
    '--text-3': mix(text, bg, 0.52),
    '--primary-bg': dark ? mix(text, accent, 0.08) : mix(text, accent, 0.12),
    '--primary-text': dark ? bg : '#ffffff',
    '--input': dark ? rgba(text, 0.05) : rgba(surface, 0.85),
  };
}

export function applyCustomPalette(root, cp) {
  const v = paletteVars(cp);
  Object.entries(v).forEach(([k, val]) => root.style.setProperty(k, val));
}
export function clearCustomPalette(root) {
  VARS.forEach((k) => root.style.removeProperty(k));
}
