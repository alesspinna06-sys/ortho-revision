import { useState } from 'react';
import Icon from './Icon.jsx';
import { courseColor, relDate, StatusChip, SOURCE_ICON } from './common.jsx';
import { updateCourse, deleteCourse, setAcquired } from '../lib/db.js';
import { enqueue, prioritize, cancelJob } from '../lib/jobs.js';
import { api } from '../lib/bridge.js';
import { useToast } from './Toast.jsx';
import { GenBadge, GenHistoryModal } from './GenBadge.jsx';

/** Fond d'une pastille à partir de la couleur du dossier. */
export const folderBg = (color) => `linear-gradient(135deg, ${color}, ${color}b0)`;

/**
 * Carte d'un cours : ouvre le cours, permet de le ranger dans un dossier et de le supprimer.
 * Les actions ne propagent pas le clic à la carte.
 */
export default function CourseCard({ course, folders = [], cards = 0, questions = 0, job, go }) {
  const [confirm, setConfirm] = useState(false);
  const [hist, setHist] = useState(false);
  const folder = folders.find((f) => f.id === course.folderId);
  const stop = (e) => e.stopPropagation();
  const toast = useToast();
  // Régénère le cours entier avec Gemini (comme « Régénérer » dans le cours) ; flashcards et QCM gardés
  const regenerate = async () => {
    setConfirm(false);
    const k = await api.key.status().catch(() => ({ hasKey: true }));
    if (!k?.hasKey) { toast({ type: 'error', text: 'Ajoute ta clé Gemini dans Réglages.' }); return; }
    enqueue(course.id, ['summary']);
    toast({ type: 'success', text: `« ${course.title.slice(0, 50)} » : régénération lancée` });
  };

  return (
    <div className={`card interactive course-card ${course.acquired ? 'is-acquired' : ''}`} onClick={() => go('course', { id: course.id })}>
      <div className="row between">
        <div className="course-icon" style={{ background: folder ? folderBg(folder.color) : courseColor(course.subject || course.title) }}>
          <Icon name={SOURCE_ICON[course.sourceType] || 'file'} size={18} />
        </div>
        <div className="row" style={{ gap: 8 }}>
          <StatusChip course={course} job={job} />
          <button className={`acq-check ${course.acquired ? 'on' : ''}`} aria-pressed={!!course.acquired} onClick={(e) => { stop(e); setAcquired(course.id, !course.acquired); }}
            title={course.acquired ? 'Cours acquis (clique pour annuler)' : 'Cocher comme acquis'} aria-label={course.acquired ? 'Cours acquis, décocher' : 'Cocher ce cours comme acquis'}>
            <Icon name="check" size={13} stroke={2.6} />
          </button>
        </div>
      </div>
      <div>
        <h3>{course.title}</h3>
        <div className="faint small" style={{ marginTop: 4 }}>
          {course.subject || 'Sans matière'}
          {folder && <> · <span style={{ color: folder.color, fontWeight: 600 }}>{folder.name}</span></>}
        </div>
        {!job && <div style={{ marginTop: 6 }}><GenBadge course={course} compact onClick={() => setHist(true)} /></div>}
      </div>
      <div className="course-meta">
        <span><Icon name="layers" size={13} /> {cards}</span>
        <span><Icon name="quiz" size={13} /> {questions}</span>
        <span style={{ marginLeft: 'auto' }}>{relDate(course.createdAt)}</span>
      </div>
      <div className="course-actions" onClick={stop}>
        <select
          className="select sm-select" aria-label="Dossier du cours" value={course.folderId || ''}
          onChange={(e) => updateCourse(course.id, { folderId: e.target.value || null })}
        >
          <option value="">Sans dossier</option>
          {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <button className={`btn sm ghost card-synth ${course.synthesis ? '' : 'none'}`} onClick={() => go('syntheses', { id: course.id })}
          title={course.synthesis ? 'Lire la synthèse de ce cours (menu Synthèses)' : 'Pas encore de synthèse'} aria-label={`Synthèse de ${course.title}`}>
          <Icon name="clipboard" size={14} /> Synthèse
        </button>
        {confirm === 'regen' ? (
          <>
            <button className="btn sm accent" onClick={regenerate}>Régénérer</button>
            <button className="btn sm ghost" onClick={() => setConfirm(false)}>Non</button>
          </>
        ) : !confirm && (job ? (
          <>
            {job.queued && job.pos > 1 && (
              <button className="btn icon sm ghost" title="Passer en premier dans la file d'attente" aria-label="Passer en premier" onClick={() => prioritize(course.id)}>
                <Icon name="pin" size={14} />
              </button>
            )}
            <button className="btn icon sm ghost" title={job.queued ? "Retirer de la file d'attente" : 'Arrêter cette génération'} aria-label={job.queued ? "Retirer de la file d'attente" : 'Arrêter la génération'} onClick={() => cancelJob(course.id)}>
              <Icon name="x" size={14} />
            </button>
          </>
        ) : (
          <button className="btn icon sm ghost" title="Régénérer le cours avec Gemini (flashcards, QCM et progression conservés)" aria-label="Régénérer le cours" onClick={() => setConfirm('regen')}>
            <Icon name="refresh" size={14} />
          </button>
        ))}
        {confirm === true ? (
          <>
            <button className="btn sm danger" onClick={() => deleteCourse(course.id)}>Supprimer</button>
            <button className="btn sm ghost" onClick={() => setConfirm(false)}>Non</button>
          </>
        ) : !confirm && (
          <button className="btn icon sm ghost" title="Supprimer le cours" aria-label="Supprimer le cours" onClick={() => setConfirm(true)}>
            <Icon name="trash" size={14} />
          </button>
        )}
      </div>
      {hist && <div onClick={stop}><GenHistoryModal courses={[course]} go={go} onClose={() => setHist(false)} onRegenerate={() => { setHist(false); regenerate(); }} /></div>}
    </div>
  );
}
