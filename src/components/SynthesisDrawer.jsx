import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon.jsx';
import Markdown from './Markdown.jsx';
import TextSize from './TextSize.jsx';
import { useDb, getCourse } from '../lib/db.js';
import { enqueue } from '../lib/jobs.js';
import { useSettings } from '../lib/settings.jsx';
import { sheetClass } from '../lib/courseStyle.js';

/**
 * Panneau latéral « Synthèse » d'un cours : s'ouvre à droite sans quitter la page,
 * pour relire la synthèse à côté du cours (ou depuis la liste des cours). Échap pour fermer.
 */
export default function SynthesisDrawer({ courseId, job, go, onClose, fromCourse = false, initialWide }) {
  const wide = false; // « En grand » ouvre désormais la page entière du menu Synthèses
  const course = useDb(() => getCourse(courseId), [courseId]);
  const { settings } = useSettings();
  const closeRef = useRef(null);

  useEffect(() => {
    const prev = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Sur un grand écran, le cours se décale pour rester lisible à côté du panneau
  useEffect(() => {
    const side = fromCourse && !wide;
    document.documentElement.classList.toggle('synth-side', side);
    return () => document.documentElement.classList.remove('synth-side');
  }, [wide, fromCourse]);

  const busy = !!job;
  const canMake = !!course?.summary;
  const make = () => enqueue(courseId, ['synthesis']);

  return createPortal(
    <>
      {(!fromCourse || wide) && <div className="synth-scrim" onClick={onClose} />}
      <aside className={`synth-drawer ${wide ? 'wide' : ''}`} role="dialog" aria-modal={!fromCourse || wide} aria-label={`Synthèse : ${course?.title || ''}`}>
        <header className="synth-head">
          <div className="grow" style={{ minWidth: 0 }}>
            <span className="chip accent"><Icon name="clipboard" size={12} /> Synthèse</span>
            <h2 className="synth-title">{course?.title || '…'}</h2>
            {course?.synthesisAt && <div className="faint small">Créée le {new Date(course.synthesisAt).toLocaleDateString('fr-FR')}</div>}
          </div>
          <button className="btn sm ghost" onClick={() => { onClose(); go('syntheses', { id: courseId }); }} title="Ouvrir la synthèse en pleine page">
            <Icon name="expand" size={15} /> En grand
          </button>
          <button ref={closeRef} className="btn icon sm ghost" onClick={onClose} aria-label="Fermer la synthèse" title="Fermer (Échap)"><Icon name="x" /></button>
        </header>

        <div className="synth-tools">
          <TextSize />
          <div className="grow" />
          {course?.synthesis && (
            <button className="btn sm ghost" disabled={busy || !canMake} onClick={make} title="Refaire la synthèse à partir du cours">
              <Icon name="refresh" size={14} /> Régénérer
            </button>
          )}
          {!fromCourse && (
            <button className="btn sm" onClick={() => { onClose(); go('course', { id: courseId }); }}>
              <Icon name="book" size={14} /> Ouvrir le cours
            </button>
          )}
        </div>

        <div className={`synth-body ${sheetClass(settings)}`}>
          {!course ? null : busy && (job.label || '').toLowerCase().includes('synth') ? (
            <div className="synth-empty"><span className="spinner" style={{ color: 'var(--accent)' }} /> Rédaction de la synthèse…</div>
          ) : course.synthesis ? (
            <Markdown text={course.synthesis} terms={course.keyTerms || []} />
          ) : (
            <div className="synth-empty">
              <Icon name="clipboard" size={26} />
              <b>Pas encore de synthèse pour ce cours</b>
              <span className="small muted">{busy ? 'Elle sera rédigée à la fin de la génération en cours.' : canMake ? 'Une version condensée du cours, avec ses explications et ses exemples.' : 'Le cours complet doit d’abord être généré.'}</span>
              <button className="btn accent" disabled={busy || !canMake} onClick={make}>
                {busy ? <span className="spinner" /> : <Icon name="sparkles" size={15} />} Créer la synthèse
              </button>
            </div>
          )}
        </div>
      </aside>
    </>,
    document.body,
  );
}
