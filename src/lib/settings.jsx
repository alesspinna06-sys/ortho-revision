import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './bridge.js';
import { paletteOf } from './themes.js';
import { applyCustomPalette, clearCustomPalette, DEFAULT_CUSTOM } from './customPalette.js';
import { usePersonalize } from './personalize.js';

const KEY = 'ortho-settings';
const lowEnd = (navigator.hardwareConcurrency || 4) <= 4;

export const DEFAULT_SETTINGS = {
  name: 'Shanel',
  theme: 'system',          // 'system' | 'light' | 'dark'
  liteMode: lowEnd,         // désactive les flous coûteux (auto sur les petites machines)
  model: 'gemini-flash-latest',
  autoGenerate: true,
  cardsPerCourse: 20,
  questionsPerCourse: 12,
  crossQuestions: true,     // questions transversales entre cours
  motion: 'auto',            // animations : auto | full | light | off
  courseStyle: 'sobre',      // apparence des cours : sobre | cahier | moderne
  paper: 'seyes',            // cahier : carreaux | seyes
  colorLevel: 'normal',      // intensité des couleurs : discret | normal | vif
  claudeReview: true,       // bandeau « Faire relire ce cours par Claude » après la génération
  reviewSchemas: true,      // relecture visuelle des schémas par Gemini après la génération
  completeCourse: true,     // compléter le cours : phrases inachevées, parties manquantes, réponses aux questions
};

function load() {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return { ...DEFAULT_SETTINGS }; }
}

// Accès hors React (pour les tâches IA en arrière-plan)
let current = load();
export const getSettings = () => current;

const Ctx = createContext(null);

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(current);

  const update = (patch) => setSettings((s) => {
    const next = { ...s, ...patch };
    current = next;
    localStorage.setItem(KEY, JSON.stringify(next));
    return next;
  });

  // Application du thème + mode léger
  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    // Une palette (Lavande, Océan…) impose son mode clair ou sombre
    // « Personnalisée » : couleurs choisies par l'utilisatrice (variables posées directement sur <html>)
    const custom = settings.palette === 'custom' ? { ...DEFAULT_CUSTOM, ...(settings.customPalette || {}) } : null;
    const pal = custom ? { id: 'custom', mode: custom.mode === 'dark' ? 'dark' : 'light' } : paletteOf(settings.palette);
    const apply = () => {
      const dark = pal.mode ? pal.mode === 'dark' : settings.theme === 'dark' || (settings.theme === 'system' && mq.matches);
      root.dataset.theme = dark ? 'dark' : 'light';
      if (pal.mode) root.dataset.palette = pal.id; else delete root.dataset.palette;
      if (custom) applyCustomPalette(root, custom); else clearCustomPalette(root);
    };
    apply();
    api.setTheme(pal.mode || settings.theme);
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [settings.theme, settings.palette, JSON.stringify(settings.customPalette || null)]); // eslint-disable-line react-hooks/exhaustive-deps
  usePersonalize(settings);

  useEffect(() => {
    document.documentElement.classList.toggle('lite', !!settings.liteMode);
  }, [settings.liteMode]);

  // Niveau d'animation : « auto » = complètes, sauf en mode performance ou si l'accélération graphique est coupée
  useEffect(() => {
    let alive = true;
    const apply = (gpuOff) => {
      if (!alive) return;
      const m = settings.motion || 'auto';
      const level = m === 'auto' ? (settings.liteMode || gpuOff ? 'light' : 'full') : m;
      const root = document.documentElement;
      ['full', 'light', 'off'].forEach((l) => root.classList.toggle(`motion-${l}`, l === level));
      root.classList.toggle('no-gpu', !!gpuOff);
    };
    apply(false);
    (api.gpu?.info?.() || Promise.resolve({})).then((g) => apply(!!g?.off)).catch(() => {});
    return () => { alive = false; };
  }, [settings.motion, settings.liteMode]);

  return <Ctx.Provider value={{ settings, update }}>{children}</Ctx.Provider>;
}

export const useSettings = () => useContext(Ctx);
