// Suivi du temps passé dans l'application : seulement quand la fenêtre est visible, au premier plan,
// et qu'il y a eu une action (souris, clavier, défilement) dans les 3 dernières minutes.
// Les secondes sont regroupées par jour et enregistrées dans la base (store « history », type « time »).
import { addTime } from './db.js';
import { emitStudy } from './studyEvents.js';

const STEP = 5;           // secondes comptées à chaque tic
const IDLE = 180 * 1000;  // au-delà, on considère que la personne est partie
const FLUSH = 30 * 1000;

let ctx = { view: 'home', courseId: null, tab: null };
let lastInput = Date.now();
let buf = null;

export const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Indique où se trouve l'utilisatrice (vue, cours, onglet du cours). */
export function setUsageContext(patch) { ctx = { ...ctx, ...patch }; }

const bump = (o, k, n) => { if (k) o[k] = (o[k] || 0) + n; };

function tick() {
  if (document.hidden || !document.hasFocus() || Date.now() - lastInput > IDLE) return;
  const day = dayKey();
  if (buf && buf.day !== day) flushUsage(); // minuit passé : on enregistre la journée écoulée
  if (!buf) buf = { day, total: 0, byCourse: {}, byView: {}, byTab: {} };
  buf.total += STEP;
  bump(buf.byView, ctx.view, STEP);
  if (ctx.courseId) { bump(buf.byCourse, ctx.courseId, STEP); bump(buf.byTab, ctx.tab, STEP); }
}

/** Enregistre ce qui est en attente. À appeler avant de lire les statistiques. */
export async function flushUsage() {
  if (!buf || !buf.total) return;
  const out = buf;
  buf = null;
  try { await addTime(out.day, out); } catch (e) { console.error(e); }
  emitStudy('time', { sec: out.total, byView: out.byView });
}

export function startUsage() {
  const mark = () => { lastInput = Date.now(); };
  const evs = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'scroll', 'touchstart'];
  evs.forEach((e) => window.addEventListener(e, mark, { passive: true, capture: true }));
  const t1 = setInterval(tick, STEP * 1000);
  const t2 = setInterval(flushUsage, FLUSH);
  const onHide = () => { if (document.hidden) flushUsage(); };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', flushUsage);
  return () => {
    evs.forEach((e) => window.removeEventListener(e, mark, { capture: true }));
    clearInterval(t1); clearInterval(t2);
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', flushUsage);
    flushUsage();
  };
}

/** 3725 -> « 1 h 02 », 540 -> « 9 min », 40 -> « 40 s ». */
export function fmtDuration(sec) {
  const s = Math.round(sec || 0);
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}
