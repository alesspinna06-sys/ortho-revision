// Pastille « À jour / À régénérer / Vérifié par Claude » et historique des générations.
import { createPortal } from 'react-dom';
import { useState } from 'react';
import Icon from './Icon.jsx';
import { genState, KINDS, BY, GEN_VERSION, GEN_NOTES } from '../lib/genHistory.js';

const fmt = (t) => new Date(t).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Pastilles d'état de génération (carte de cours, en-tête du cours). */
export function GenBadge({ course, onClick, compact = false }) {
  const s = genState(course);
  if (s.never) return null;
  const title = `${s.reason}${s.lastAt ? `\nDernière génération : ${fmt(s.lastAt)}` : ''}${s.verified ? `\nVérifié par Claude le ${fmt(course.verifiedAt)}` : ''}\nClic : historique`;
  const click = (e) => { e.stopPropagation(); onClick?.(); };
  return (
    <span className="gen-badges" title={title}>
      <button type="button" className={`gen-badge ${s.upToDate ? 'ok' : 'old'}`} onClick={click}>
        {s.upToDate ? '✓ À jour' : '↻ À régénérer'}
      </button>
      {s.verified && <button type="button" className="gen-badge claude" onClick={click}>{compact ? '✓ Claude' : '✓ Vérifié par Claude'}</button>}
    </span>
  );
}

/** Historique : d'un cours (`courses` = [cours]) ou de tous les cours. */
export function GenHistoryModal({ courses, onClose, go, onRegenerate }) {
  const [only, setOnly] = useState('all');
  const single = courses.length === 1;
  const events = courses.flatMap((c) => (c.genHistory || []).map((e) => ({ ...e, course: c })));
  // Cours générés avant l'historique : on affiche au moins leur dernière génération connue
  courses.forEach((c) => { if (!(c.genHistory || []).some((e) => e.kind === 'cours') && c.generatedAt) events.push({ at: c.generatedAt, kind: 'cours', by: 'gemini', course: c, old: true }); });
  const list = events.filter((e) => only === 'all' || e.by === only).sort((a, b) => b.at - a.at).slice(0, 300);
  const stale = courses.filter((c) => c.summary && !genState(c).upToDate);
  return createPortal(
    <div className="overlay" onClick={onClose}>
      <div className="modal gen-modal" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <div className="row between">
          <b style={{ fontSize: 17 }}>🕘 Historique des générations{single ? ` — ${courses[0].title}` : ''}</b>
          <button className="btn icon sm ghost" onClick={onClose} aria-label="Fermer"><Icon name="x" /></button>
        </div>
        <p className="small faint" style={{ margin: '6px 0 10px' }}>Version actuelle de la génération : {GEN_NOTES[GEN_VERSION]}.</p>
        {stale.length > 0 && (
          <div className="gen-stale">
            <b>↻ {stale.length} cours à régénérer</b>
            {!single && <div className="small">{stale.slice(0, 12).map((c) => c.title).join(' · ')}{stale.length > 12 ? '…' : ''}</div>}
            {onRegenerate && <button className="btn sm accent" style={{ marginTop: 6 }} onClick={() => onRegenerate(stale)}>Régénérer {single ? 'ce cours' : `les ${stale.length} cours`}</button>}
          </div>
        )}
        <div className="row wrap" style={{ gap: 6, margin: '8px 0' }}>
          {[['all', 'Tout'], ['gemini', 'Gemini'], ['claude', 'Claude'], ['toi', 'Toi']].map(([k, l]) => <button key={k} className={`chip ${only === k ? 'accent' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setOnly(k)}>{l}</button>)}
        </div>
        {list.length === 0 ? <p className="muted small">Rien pour l’instant.</p> : (
          <ul className="gen-list">
            {list.map((e, i) => (
              <li key={i}>
                <span className="gen-ico">{KINDS[e.kind]?.icon || '•'}</span>
                <div className="grow">
                  <div><b>{KINDS[e.kind]?.label || e.kind}</b> <span className={`gen-by by-${e.by}`}>{BY[e.by] || e.by}</span>{e.old && <span className="faint small"> (avant l’historique)</span>}</div>
                  {!single && <button className="link-btn small" onClick={() => { onClose(); go?.('course', { id: e.course.id }); }}>{e.course.title}</button>}
                  {e.detail && <div className="small faint">{e.detail}</div>}
                </div>
                <span className="small faint" style={{ whiteSpace: 'nowrap' }}>{fmt(e.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>,
    document.body,
  );
}
