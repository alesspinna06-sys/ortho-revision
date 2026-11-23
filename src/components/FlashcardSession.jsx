import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from './Icon.jsx';
import { Ring } from './common.jsx';
import { putCard, refreshViews } from '../lib/db.js';
import { schedule, previewLabel, markActivity } from '../lib/srs.js';
import { emitStudy } from '../lib/studyEvents.js';

const GRADES = [
  { g: 0, label: 'À revoir', key: '1' },
  { g: 1, label: 'Difficile', key: '2' },
  { g: 2, label: 'Bien', key: '3' },
  { g: 3, label: 'Facile', key: '4' },
];

export default function FlashcardSession({ cards, title, onExit, courseNames = {} }) {
  const [queue, setQueue] = useState(() => cards.slice());
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [stats, setStats] = useState({ done: 0, again: 0, good: 0 });
  const initial = useMemo(() => cards.length, [cards]);
  const card = queue[pos];
  const finished = !card;

  const grade = useCallback((g) => {
    if (!card || !flipped) return;
    const updated = { ...card, srs: schedule(card.srs, g) };
    putCard(updated, { silent: true });
    markActivity();
    emitStudy('card', { grade: g, cardId: card.id, courseId: card.courseId });
    setStats((s) => ({ done: s.done + 1, again: s.again + (g === 0 ? 1 : 0), good: s.good + (g >= 2 ? 1 : 0) }));
    if (g === 0) setQueue((q) => [...q, updated]); // revient en fin de séance
    setFlipped(false);
    setPos((p) => p + 1);
  }, [card, flipped]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.code === 'Space' || e.key === 'Enter') { e.preventDefault(); setFlipped((f) => !f); }
      const g = GRADES.find((x) => x.key === e.key);
      if (g) grade(g.g);
      if (e.key === 'Escape') onExit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [grade, onExit]);

  useEffect(() => () => refreshViews(), []); // met à jour les compteurs en quittant

  if (finished) {
    const rate = stats.done ? stats.good / stats.done : 0;
    return (
      <div className="session view-enter" style={{ textAlign: 'center', paddingTop: 30 }}>
        <Ring value={rate} />
        <h2 style={{ fontSize: 28, marginTop: 22 }}>Séance terminée 🎉</h2>
        <p className="muted">{initial} carte{initial > 1 ? 's' : ''} révisée{initial > 1 ? 's' : ''} · {stats.again} à revoir · {stats.good} bien sues</p>
        <div className="row" style={{ justifyContent: 'center', marginTop: 24 }}>
          <button className="btn primary lg" onClick={onExit}>Terminer</button>
        </div>
      </div>
    );
  }

  return (
    <div className="session">
      <div className="row between">
        <button className="back-link" onClick={onExit}><Icon name="left" size={16} /> Quitter</button>
        <span className="faint small">{Math.min(pos + 1, queue.length)} / {queue.length}</span>
      </div>
      <div className="progress"><i style={{ transform: `scaleX(${pos / queue.length})` }} /></div>
      {title && <div className="faint small" style={{ marginTop: 12 }}>{title}</div>}

      <div className="flip-wrap card-in" key={card.id + pos}>
        <div className={`flip ${flipped ? 'flipped' : ''}`} onClick={() => setFlipped((f) => !f)}>
          <div className="face front">
            <div className="tag row"><span className="chip accent">{card.category}</span>{courseNames[card.courseId] && <span className="chip">{courseNames[card.courseId]}</span>}</div>
            <div className="content selectable">{card.front}</div>
            <div className="hint">Clique ou appuie sur <kbd>Espace</kbd> pour retourner</div>
          </div>
          <div className="face back">
            <div className="faint small" style={{ marginBottom: 12, fontWeight: 600 }}>{card.front}</div>
            <div className="content selectable">{card.back}</div>
          </div>
        </div>
      </div>

      {flipped ? (
        <div className="grades">
          {GRADES.map((x) => (
            <button key={x.g} className={`grade g${x.g}`} onClick={() => grade(x.g)}>
              {x.label}
              <small>{previewLabel(card.srs, x.g)} · <kbd>{x.key}</kbd></small>
            </button>
          ))}
        </div>
      ) : (
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="btn primary lg" onClick={() => setFlipped(true)}><Icon name="rotate" /> Afficher la réponse</button>
        </div>
      )}
    </div>
  );
}
