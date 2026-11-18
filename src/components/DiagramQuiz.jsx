import { useMemo, useState } from 'react';
import Icon from './Icon.jsx';
import { Ring } from './common.jsx';
import { DiagramFigure } from './Markdown.jsx';
import { shuffle } from '../lib/pick.js';
import { markActivity } from '../lib/srs.js';

const norm = (s = '') => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length];
}
/** Réponse acceptée : mêmes mots, sans tenir compte des accents, de la casse et d'une petite faute de frappe. */
export function labelMatches(answer, expected) {
  const a = norm(answer); const e = norm(expected);
  if (!a) return false;
  if (a === e) return true;
  return distance(a, e) <= Math.max(1, Math.floor(e.length / 7));
}

/**
 * Prépare un schéma à trous : chaque étiquette (<text>) est remplacée par un numéro.
 * Renvoie null si le schéma a moins de 2 étiquettes exploitables.
 */
export function maskDiagram(d) {
  try {
    const doc = new DOMParser().parseFromString(d.svg, 'image/svg+xml');
    if (doc.querySelector('parsererror')) return null;
    const labels = [];
    doc.querySelectorAll('text').forEach((t) => {
      const label = (t.textContent || '').replace(/\s+/g, ' ').trim();
      if (label.length < 2 || !/[a-zà-ÿ]/i.test(label) || label === d.title) return;
      labels.push(label);
      while (t.firstChild) t.removeChild(t.firstChild);
      t.textContent = `(${labels.length})`;
      t.setAttribute('font-weight', '700');
      t.setAttribute('fill', '#4f46e5');
    });
    if (labels.length < 2) return null;
    return { ...d, svg: new XMLSerializer().serializeToString(doc.documentElement), labels };
  } catch {
    return null;
  }
}

/** Séance « schémas à trous » sur les schémas d'un cours. */
export default function DiagramQuiz({ diagrams, title, onExit }) {
  const items = useMemo(() => diagrams.map(maskDiagram).filter(Boolean), [diagrams]);
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState({});
  const [checked, setChecked] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [bank, setBank] = useState(false);
  const [score, setScore] = useState({ right: 0, total: 0 });
  const item = items[i];
  const bankWords = useMemo(() => (item ? shuffle(item.labels) : []), [item]);

  if (!items.length) {
    return (
      <div className="session" style={{ textAlign: 'center', paddingTop: 40 }}>
        <p className="muted">Aucun schéma de ce cours n'a assez d'étiquettes pour un exercice à trous.</p>
        <button className="btn primary" onClick={onExit}>Retour</button>
      </div>
    );
  }
  if (!item) {
    const rate = score.total ? score.right / score.total : 0;
    return (
      <div className="session view-enter" style={{ textAlign: 'center', paddingTop: 30 }}>
        <Ring value={rate} />
        <h2 style={{ fontSize: 28, marginTop: 22 }}>Schémas terminés</h2>
        <p className="muted">{score.right} étiquette{score.right > 1 ? 's' : ''} retrouvée{score.right > 1 ? 's' : ''} sur {score.total}</p>
        <div className="row" style={{ justifyContent: 'center', marginTop: 24, gap: 10 }}>
          <button className="btn" onClick={() => { setI(0); setAnswers({}); setChecked(false); setRevealed(false); setScore({ right: 0, total: 0 }); }}>Recommencer</button>
          <button className="btn primary lg" onClick={onExit}>Terminer</button>
        </div>
      </div>
    );
  }

  const results = item.labels.map((l, k) => labelMatches(answers[k] || '', l));
  const check = () => {
    setChecked(true);
    markActivity();
    setScore((s) => ({ right: s.right + results.filter(Boolean).length, total: s.total + item.labels.length }));
  };
  const next = () => { setI(i + 1); setAnswers({}); setChecked(false); setRevealed(false); };

  return (
    <div className="session diagram-quiz">
      <div className="row between">
        <button className="back-link" onClick={onExit}><Icon name="left" size={16} /> Quitter</button>
        <span className="faint small">Schéma {i + 1} / {items.length}</span>
      </div>
      <div className="progress"><i style={{ transform: `scaleX(${i / items.length})` }} /></div>
      {title && <div className="faint small" style={{ marginTop: 12 }}>{title}</div>}

      <div className="dq-layout view-enter" key={i}>
        <DiagramFigure d={{ ...item, caption: '' }} />
        <div className="dq-answers">
          <div className="row between" style={{ marginBottom: 10 }}>
            <b>Retrouve les étiquettes</b>
            <button className="btn sm ghost" onClick={() => setBank((b) => !b)}>{bank ? 'Masquer l’aide' : 'Aide : mots mélangés'}</button>
          </div>
          {bank && <div className="dq-bank">{bankWords.map((w) => <span key={w} className="chip">{w}</span>)}</div>}
          <div className="stack" style={{ gap: 8 }}>
            {item.labels.map((l, k) => (
              <div key={k} className={`dq-row ${checked ? (results[k] ? 'ok' : 'ko') : ''}`}>
                <span className="dq-n">({k + 1})</span>
                <input className="input" value={answers[k] || ''} disabled={checked} aria-label={`Étiquette ${k + 1}`}
                  onChange={(e) => setAnswers((a) => ({ ...a, [k]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !checked) check(); }} />
                {checked && !results[k] && <span className="dq-expected">{l}</span>}
                {checked && results[k] && <Icon name="check" size={16} />}
              </div>
            ))}
          </div>
          <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            {!checked && !revealed && <button className="btn ghost" onClick={() => setRevealed(true)}>Voir le schéma complet</button>}
            {!checked
              ? <button className="btn primary" onClick={check}>Vérifier</button>
              : <button className="btn accent" onClick={next}>{i + 1 < items.length ? 'Schéma suivant' : 'Voir mon score'} <Icon name="right" size={15} /></button>}
          </div>
          {(revealed || checked) && (
            <div style={{ marginTop: 16 }}>
              <div className="faint small" style={{ marginBottom: 6 }}>Schéma complet</div>
              <DiagramFigure d={diagrams.find((d) => d.id === item.id) || item} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
