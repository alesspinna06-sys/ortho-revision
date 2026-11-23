import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import { useTasks, cancelTask, dismissTask, useGeminiNote } from '../lib/tasks.js';
import { useJobs, cancelJob, cancelAll } from '../lib/jobs.js';
import { getCourse } from '../lib/db.js';
import { ProgressBar, elapsed } from './Podcast.jsx';

const ICONS = { podcast: 'mic', definition: 'search', course: 'sparkles' };

/**
 * Barre des tâches en bas de l'écran : tout ce que l'IA prépare en arrière-plan
 * (génération des cours, podcasts, définitions…), avec une barre d'avancement pour chacun.
 */
export default function TaskTray({ go }) {
  const tasks = useTasks();
  const jobs = useJobs();
  const note = useGeminiNote();
  const [open, setOpen] = useState(() => { try { return localStorage.getItem('tasks-open') !== '0'; } catch { return true; } });
  const [titles, setTitles] = useState({});
  const [, tick] = useState(0);

  // Titres des cours en cours de génération (la file ne garde que leur identifiant)
  useEffect(() => {
    const missing = [...jobs.keys()].filter((id) => !titles[id]);
    if (!missing.length) return;
    Promise.all(missing.map((id) => getCourse(id).then((c) => [id, c?.title || 'Cours']).catch(() => [id, 'Cours'])))
      .then((pairs) => setTitles((t) => ({ ...t, ...Object.fromEntries(pairs) })));
  }, [jobs]); // eslint-disable-line react-hooks/exhaustive-deps
  const running = tasks.filter((t) => t.status === 'running').length + jobs.size;
  useEffect(() => { if (!running) return undefined; const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t); }, [running]);
  useEffect(() => { try { localStorage.setItem('tasks-open', open ? '1' : '0'); } catch { /* */ } }, [open]);
  // Le bouton « Voir l'avancement » du menu ouvre le panneau
  useEffect(() => { const f = () => setOpen(true); window.addEventListener('tasks-open', f); return () => window.removeEventListener('tasks-open', f); }, []);

  const jobRows = [...jobs.entries()].map(([id, j]) => ({
    id: `job:${id}`, courseId: id, kind: 'course', title: `Cours « ${titles[id] || '…'} »`, label: j.label,
    progress: j.queued ? 0 : j.total ? Math.min(0.98, ((j.step || 0) + 0.5) / j.total) : null,
    status: 'running', queued: j.queued, startedAt: j.startedAt, job: true,
  }));
  const rows = [...jobRows.filter((r) => !r.queued), ...tasks, ...jobRows.filter((r) => r.queued)];
  if (!rows.length) return null;

  const done = tasks.filter((t) => t.status === 'done').length;
  const errors = tasks.filter((t) => t.status === 'error').length;
  const first = rows.find((r) => r.status === 'running' && !r.queued);
  const avg = (() => { const p = rows.filter((r) => r.status === 'running' && !r.queued && r.progress != null); return p.length ? p.reduce((n, r) => n + r.progress, 0) / p.length : null; })();

  return (
    <div className={`task-tray ${open ? 'open' : ''}`} role="region" aria-label="Tâches en arrière-plan">
      <button className="task-tray-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {running ? <span className="spinner" style={{ color: 'var(--accent)' }} /> : errors ? <Icon name="alert" size={15} /> : <Icon name="check" size={15} />}
        <span className="grow">
          <b>{running ? `${running} tâche${running > 1 ? 's' : ''} en cours` : errors ? `${errors} tâche${errors > 1 ? 's' : ''} en échec` : `Terminé${done > 1 ? ` (${done})` : ''}`}</b>
          {!open && first && <span className="faint small task-tray-sub">{first.title} · {first.label}</span>}
        </span>
        {!open && running > 0 && <span className="task-tray-mini"><ProgressBar value={avg} /></span>}
        <span className="task-caret" aria-hidden="true">{open ? '▾' : '▴'}</span>
      </button>
      {open && (
        <div className="task-list">
          {rows.map((t) => (
            <div key={t.id} className={`task-row ${t.status}`}>
              <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
                <span className="task-ico"><Icon name={t.status === 'error' ? 'alert' : t.status === 'done' ? 'check' : ICONS[t.kind] || 'sparkles'} size={14} /></span>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="task-title">{t.title}</div>
                  <div className="small faint task-label">{t.status === 'error' ? t.error : t.label}{t.status === 'running' && t.startedAt && !t.queued ? ` · ${elapsed(t.startedAt)}` : ''}</div>
                </div>
                {t.courseId && <button className="btn icon sm ghost" title="Ouvrir le cours" aria-label="Ouvrir le cours" onClick={() => go('course', { id: t.courseId })}><Icon name="right" size={14} /></button>}
                {t.status === 'running'
                  ? <button className="btn icon sm ghost" title={t.queued ? 'Retirer de la file' : 'Arrêter'} aria-label="Arrêter" onClick={() => (t.job ? cancelJob(t.courseId) : cancelTask(t.id))}><Icon name="x" size={14} /></button>
                  : <button className="btn icon sm ghost" title="Masquer" aria-label="Masquer" onClick={() => dismissTask(t.id)}><Icon name="x" size={14} /></button>}
              </div>
              {t.status === 'running' && !t.queued && <ProgressBar value={t.progress} />}
            </div>
          ))}
          {note && running > 0 && <div className="task-note small"><Icon name="alert" size={13} /> {note.text}</div>}
          {jobs.size > 1 && <button className="btn sm ghost" style={{ alignSelf: 'flex-end' }} onClick={() => cancelAll()}>Arrêter toutes les générations de cours</button>}
        </div>
      )}
    </div>
  );
}
