// Taille du texte de lecture (cours, définitions, flashcards, questions), réglable de 80 % à 200 %.
// Appliquée par la variable CSS --read-scale sur la racine du document, et gardée sur cet ordinateur.
import { useEffect, useState } from 'react';

const KEY = 'read-scale';
export const MIN = 0.8;
export const MAX = 2;
const listeners = new Set();
const clamp = (x) => Math.round(Math.min(MAX, Math.max(MIN, x)) * 100) / 100;

let scale = 1;
try { scale = clamp(Number(localStorage.getItem(KEY)) || 1); } catch { /* stockage indisponible */ }
const apply = () => { if (typeof document !== 'undefined') document.documentElement.style.setProperty('--read-scale', String(scale)); };
apply();

export const getReadScale = () => scale;
export function setReadScale(x) {
  scale = clamp(x);
  apply();
  try { localStorage.setItem(KEY, String(scale)); } catch { /* stockage indisponible */ }
  listeners.forEach((f) => f(scale));
}
export const bumpReadScale = (dir) => setReadScale(dir === 0 ? 1 : Math.round((scale + dir * 0.1) * 10) / 10);

export function useReadScale() {
  const [s, setS] = useState(scale);
  useEffect(() => { listeners.add(setS); return () => listeners.delete(setS); }, []);
  return s;
}

// Zoom comme dans Word : pincer sur le pavé tactile, ou Ctrl + molette de la souris.
// Agit sur la taille du texte (pas sur la page entière) ; une petite bulle affiche le pourcentage.
let hintEl = null;
let hintTimer = 0;
function showHint() {
  if (typeof document === 'undefined' || !document.body) return;
  if (!hintEl) {
    hintEl = document.createElement('div');
    hintEl.className = 'zoom-hint';
    hintEl.setAttribute('aria-hidden', 'true');
    document.body.appendChild(hintEl);
  }
  hintEl.textContent = `Texte : ${Math.round(scale * 100)} %`;
  hintEl.classList.add('on');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => hintEl && hintEl.classList.remove('on'), 900);
}
let fine = scale; // valeur précise pendant un pincement (les petits pas s'additionnent)
if (typeof window !== 'undefined') {
  window.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return; // le pincement du pavé tactile arrive comme Ctrl + molette
    e.preventDefault();
    if (Math.abs(fine - scale) > 0.06) fine = scale; // taille changée ailleurs (A− / A+, raccourcis)
    const notch = e.deltaMode !== 0 || (Math.abs(e.deltaY) >= 50 && Number.isInteger(e.deltaY));
    if (notch) fine = Math.round((scale + (e.deltaY < 0 ? 0.1 : -0.1)) * 10) / 10; // cran de molette : 10 %
    else fine *= Math.exp(-e.deltaY * 0.01); // pincement : progressif
    fine = Math.min(MAX, Math.max(MIN, fine));
    setReadScale(fine);
    showHint();
  }, { passive: false });
}
