import { useEffect } from 'react';

// Applique la police de l'interface et la couleur d'accent des cours (attributs et variables sur <html>).
export function usePersonalize(settings) {
  useEffect(() => {
    const root = document.documentElement;
    const f = settings.uiFont;
    if (f && f !== 'system') root.dataset.uiFont = f; else delete root.dataset.uiFont;
    const a = settings.courseAccent;
    if (a) root.style.setProperty('--course-accent', a); else root.style.removeProperty('--course-accent');
  }, [settings.uiFont, settings.courseAccent]);
}
