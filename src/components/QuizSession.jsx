import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import { Ring } from './common.jsx';
import Markdown from './Markdown.jsx';
import { putQuestion, addHistory, refreshViews, getCourse } from '../lib/db.js';
import { explainQuestion } from '../lib/ai-extra.js';
import { markActivity } from '../lib/srs.js';
import { emitStudy } from '../lib/studyEvents.js';

const LETTERS = 'ABCDEFGH';
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

export default function QuizSession({ questions, title, courseId = null, onExit }) {
  const [i, setI] = useState(0);
  const [selected, setSelected] = useState([]);
  const [checked, setChecked] = useState(false);
  const [results, setResults] = useState([]); // { q, ok, selected }
  const [explain, setExplain] = useState({ busy: false, text: '', error: '' });
  const q = questions[i];
  const done = i >= questions.length;

  const toggle = (idx) => {
    if (checked) return;
    setSelected((s) => (s.includes(idx) ? s.filter((x) => x !== idx) : [...s, idx]));
  };

  const validate = () => {
    if (!selected.length) return;
    const ok = sameSet(selected, q.correct);
    setChecked(true);
    setResults((r) => [...r, { q, ok, selected }]);
    putQuestion({ ...q, stats: { seen: (q.stats?.seen || 0) + 1, right: (q.stats?.right || 0) + (ok ? 1 : 0), last: Date.now() } }, { silent: true });
    markActivity();
    emitStudy('question', { ok, kind: q.kind, questionId: q.id, courseId: q.courseId });
  };

  // « Explique-moi autrement » : une autre explication, adaptée à l'erreur commise
  const explainAgain = async () => {
    setExplain({ busy: true, text: '', error: '' });
    try {
      const course = q.courseId ? await getCourse(q.courseId) : null;
      setExplain({ busy: false, text: await explainQuestion(q, selected, course), error: '' });
    } catch (err) {
      setExplain({ busy: false, text: '', error: err.message });
    }
  };

  const next = () => {
    setExplain({ busy: false, text: '', error: '' });
    setI((x) => x + 1);
    setSelected([]);
    setChecked(false);
  };

  useEffect(() => {
    if (done) {
      const score = results.filter((r) => r.ok).length;
      addHistory({ type: 'quiz', courseId, score, total: results.length, title });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  useEffect(() => () => refreshViews(), []);

  useEffect(() => {
    const onKey = (e) => {
      if (done) return;
      const idx = LETTERS.indexOf(e.key.toUpperCase());
      if (idx >= 0 && q && idx < q.options.length) toggle(idx);
      if (e.key === 'Enter') { e.preventDefault(); checked ? next() : validate(); }
      if (e.key === 'Escape') onExit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (done) {
    const score = results.filter((r) => r.ok).length;
    const wrong = results.filter((r) => !r.ok);
    return (
      <div className="session view-enter" style={{ paddingTop: 20 }}>
        <div style={{ textAlign: 'center' }}>
          <Ring value={results.length ? score / results.length : 0} />
          <h2 style={{ fontSize: 28, marginTop: 20 }}>{score} / {results.length} bonnes réponses</h2>
          <p className="muted">{score === results.length ? 'Parfait, rien à redire 👏' : score / results.length >= 0.7 ? 'Très bon niveau, continue comme ça !' : 'Relis les corrections ci-dessous puis refais un essai.'}</p>
        </div>
        {wrong.length > 0 && (
          <>
            <div className="section-title">À retravailler</div>
            <div className="stack">
              {wrong.map(({ q: wq }) => (
                <div key={wq.id} className="card pad-s">
                  <div style={{ fontWeight: 650, marginBottom: 6 }}>{wq.question}</div>
                  <div className="small" style={{ color: 'var(--success)', marginBottom: 6 }}>
                    ✓ {wq.correct.map((c) => `${LETTERS[c]}. ${wq.options[c]}`).join(' · ')}
                  </div>
                  <div className="small muted selectable" style={{ whiteSpace: 'pre-wrap' }}>{wq.explanation}</div>
                </div>
              ))}
            </div>
          </>
        )}
        <div className="row" style={{ justifyContent: 'center', marginTop: 28 }}>
          <button className="btn primary lg" onClick={onExit}>Terminer</button>
        </div>
      </div>
    );
  }

  const ok = checked && sameSet(selected, q.correct);
  return (
    <div className="session">
      <div className="row between">
        <button className="back-link" onClick={onExit}><Icon name="left" size={16} /> Quitter</button>
        <span className="faint small">Question {i + 1} / {questions.length}</span>
      </div>
      <div className="progress"><i style={{ transform: `scaleX(${i / questions.length})` }} /></div>

      <div key={q.id} className="view-enter" style={{ marginTop: 24 }}>
        <div className="row wrap" style={{ marginBottom: 10 }}>
          <span className={`chip ${q.kind === 'cas' ? 'accent' : ''}`}>{q.kind === 'cas' ? <><Icon name="stetho" size={12} /> Cas clinique</> : 'QCM'}</span>
          {q.cross && <span className="chip warning"><Icon name="link" size={12} /> Transversal</span>}
          <span className="chip">{'●'.repeat(q.difficulty)}{'○'.repeat(3 - q.difficulty)}</span>
          <span className="faint small">Une ou plusieurs réponses</span>
        </div>
        {q.context && <div className="q-context selectable">{q.context}</div>}
        <div className="q-title selectable">{q.question}</div>

        <div className="options">
          {q.options.map((opt, idx) => {
            const isSel = selected.includes(idx);
            const isRight = q.correct.includes(idx);
            let cls = '';
            if (checked) cls = isRight && isSel ? 'right' : isSel ? 'wrong' : isRight ? 'missed' : '';
            else if (isSel) cls = 'sel';
            return (
              <button key={idx} className={`option ${cls}`} onClick={() => toggle(idx)} disabled={checked}>
                <span className="letter">{checked && isRight ? <Icon name="check" size={14} /> : LETTERS[idx]}</span>
                <span className="selectable">{opt}</span>
              </button>
            );
          })}
        </div>

        {checked && (
          <div className="explain">
            <div className={`verdict ${ok ? 'ok' : 'ko'}`}>
              <Icon name={ok ? 'check' : 'x'} /> {ok ? 'Bonne réponse !' : `Réponse attendue : ${q.correct.map((c) => LETTERS[c]).join(', ')}`}
            </div>
            <div className="selectable">{q.explanation}</div>
            {explain.text ? (
              <div className="explain-more">
                <div className="chip accent" style={{ marginBottom: 8 }}><Icon name="sparkles" size={12} /> Autre explication</div>
                <Markdown text={explain.text} />
              </div>
            ) : (
              <div style={{ marginTop: 12 }}>
                <button className="btn sm ghost" disabled={explain.busy} onClick={explainAgain}>
                  {explain.busy ? <><span className="spinner" /> Gemini reformule…</> : <><Icon name="sparkles" size={14} /> Explique-moi autrement</>}
                </button>
                {explain.error && <span className="small" style={{ color: 'var(--danger)', marginLeft: 8 }}>{explain.error}</span>}
              </div>
            )}
          </div>
        )}

        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 20 }}>
          {!checked
            ? <button className="btn primary lg" disabled={!selected.length} onClick={validate}>Valider <kbd style={{ color: 'inherit', opacity: .6 }}>↵</kbd></button>
            : <button className="btn accent lg" onClick={next}>{i + 1 < questions.length ? 'Question suivante' : 'Voir mon score'} <Icon name="right" /></button>}
        </div>
      </div>
    </div>
  );
}
