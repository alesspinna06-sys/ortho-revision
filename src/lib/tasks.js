// Tâches en arrière-plan (podcast, définition…) : elles continuent quand on ferme la fenêtre
// ou qu'on change de page, et leur avancement est affiché dans la barre des tâches (TaskTray).
// La génération des cours garde sa propre file (jobs.js), affichée dans la même barre.
import { useEffect, useState } from 'react';
import { api } from './bridge.js';

const tasks = new Map();
const listeners = new Set();
let notify = () => {};
let seq = 0;
let note = null; // dernier message de Gemini (nouvel essai, modèle de repli…)

export const setTaskNotifier = (fn) => { notify = fn; };
const emit = () => { const list = [...tasks.values()].map((t) => ({ ...t })); listeners.forEach((f) => f(list)); };

class TaskCancelled extends Error { constructor() { super('Tâche arrêtée'); this.taskCancelled = true; } }

/**
 * Lance une tâche. `key` évite les doublons (une tâche par clé à la fois).
 * run(ctx) : ctx.progress(fraction 0-1 ou null, libellé), ctx.check() lève une erreur si on a demandé l'arrêt.
 * Renvoie une promesse (résultat de run, ou null en cas d'échec / d'arrêt).
 */
export function runTask({ key, kind, title, courseId = null, run, onCancel, quiet = false }) {
  const id = key || `t${++seq}`;
  const prev = tasks.get(id);
  if (prev && prev.status === 'running') return prev.promise;
  const t = { id, kind, title, courseId, label: 'Démarrage…', progress: null, status: 'running', startedAt: Date.now(), cancelled: false, error: '' };
  const ctx = {
    progress(p, label) {
      if (t.status !== 'running') return;
      if (p != null) t.progress = Math.max(0, Math.min(1, p));
      if (label) t.label = label;
      emit();
    },
    check() { if (t.cancelled) throw new TaskCancelled(); },
    get cancelled() { return t.cancelled; },
  };
  t.onCancel = onCancel;
  t.promise = (async () => {
    try {
      const r = await run(ctx);
      if (t.cancelled) throw new TaskCancelled();
      t.status = 'done'; t.progress = 1; t.endedAt = Date.now();
      t.label = typeof r === 'string' ? r : 'Terminé';
      emit();
      if (!quiet) notify({ type: 'success', text: `${title} : ${t.label}` });
      setTimeout(() => { if (tasks.get(id) === t) { tasks.delete(id); emit(); } }, 9000);
      return r;
    } catch (e) {
      t.endedAt = Date.now();
      if (e?.taskCancelled || t.cancelled) {
        tasks.delete(id); emit();
        notify({ type: 'info', text: `${title} : arrêté.` });
        return null;
      }
      console.error(e);
      t.status = 'error'; t.error = e?.message || String(e); t.label = 'Échec';
      emit();
      notify({ type: 'error', text: `${title} : ${t.error}` });
      return null;
    }
  })();
  tasks.set(id, t);
  emit();
  return t.promise;
}

export function cancelTask(id) {
  const t = tasks.get(id);
  if (!t || t.status !== 'running') return;
  t.cancelled = true; t.label = 'Arrêt en cours…';
  try { t.onCancel?.(); } catch { /* rien */ }
  emit();
}
export function dismissTask(id) {
  const t = tasks.get(id);
  if (t && t.status !== 'running') { tasks.delete(id); emit(); }
}

export function useTasks() {
  const [list, setList] = useState(() => [...tasks.values()].map((t) => ({ ...t })));
  useEffect(() => { listeners.add(setList); return () => { listeners.delete(setList); }; }, []);
  return list;
}
/** Une tâche précise (ou undefined), mise à jour en direct. */
export function useTask(key) {
  const list = useTasks();
  return list.find((t) => t.id === key);
}

// Messages de Gemini en direct (surcharge, nouvel essai, repli) : affichés sous les tâches pendant 30 s
const noteListeners = new Set();
if (typeof window !== 'undefined') {
  try {
    api.gemini?.onStatus?.((s) => { note = { ...s, at: Date.now() }; noteListeners.forEach((f) => f(note)); });
  } catch { /* navigateur : pas d'état en direct */ }
}
export function useGeminiNote() {
  const [n, setN] = useState(note);
  const [, tick] = useState(0);
  useEffect(() => { noteListeners.add(setN); const t = setInterval(() => tick((x) => x + 1), 5000); return () => { noteListeners.delete(setN); clearInterval(t); }; }, []);
  return n && Date.now() - n.at < 30000 ? n : null;
}
