// Petit bus d'événements de révision (carte notée, question répondue, temps actif…).
// Les composants communs le préviennent ; un module peut s'y abonner (ex. le jeu de CAPES SES).
const listeners = new Set();
export function onStudy(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function emitStudy(kind, data = {}) {
  listeners.forEach((fn) => { try { fn(kind, data); } catch (e) { console.error(e); } });
}
