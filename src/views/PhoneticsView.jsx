import { useMemo, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Segmented, Ring } from '../components/common.jsx';
import { WORDS, THEMES, KEYBOARD, tagsOf, checkIpa, checkWord } from '../data/phonetique.js';
import { shuffle } from '../lib/pick.js';
import { markActivity } from '../lib/srs.js';

const SESSION = 10;

/** Entraînement à la transcription phonétique (API) : mot → API, ou API → mot. Sans IA, sans internet. */
export default function PhoneticsView() {
  const [mode, setMode] = useState('transcrire');
  const [theme, setTheme] = useState('');
  const [run, setRun] = useState(0); // change => nouvelle séance
  const pool = useMemo(() => WORDS.filter((w) => !theme || tagsOf(w.ipa).includes(theme)), [theme]);
  const items = useMemo(() => shuffle(pool).slice(0, SESSION), [pool, run]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Phonétique</h1>
          <div className="page-sub">Transcription en alphabet phonétique international (API), avec correction immédiate.</div>
        </div>
      </div>
      <div className="row wrap" style={{ gap: 12, marginBottom: 18 }}>
        <Segmented value={mode} onChange={(m) => { setMode(m); setRun((r) => r + 1); }} options={[
          { value: 'transcrire', label: 'Mot → API' },
          { value: 'lire', label: 'API → mot' },
        ]} />
        <select className="select" style={{ width: 220 }} value={theme} onChange={(e) => { setTheme(e.target.value); setRun((r) => r + 1); }} aria-label="Sons travaillés">
          {THEMES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <Drill key={`${mode}-${theme}-${run}`} items={items} mode={mode} onRestart={() => setRun((r) => r + 1)} />
    </>
  );
}

function Drill({ items, mode, onRestart }) {
  const [i, setI] = useState(0);
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState(null); // 'ok' | 'variant' | 'ko'
  const [score, setScore] = useState(0);
  const input = useRef(null);
  const item = items[i];
  const transcrire = mode === 'transcrire';

  if (!item) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 34 }}>
        <Ring value={items.length ? score / items.length : 0} size={130} />
        <h2 style={{ fontSize: 24, margin: '18px 0 6px' }}>{score} / {items.length}</h2>
        <p className="muted">{score === items.length ? 'Sans faute 👏' : 'Refais une série pour ancrer les sons difficiles.'}</p>
        <button className="btn primary lg" onClick={onRestart}>Nouvelle série</button>
      </div>
    );
  }

  const insert = (sym) => {
    const el = input.current;
    if (!el || result) return;
    const a = el.selectionStart ?? answer.length; const b = el.selectionEnd ?? answer.length;
    const next = answer.slice(0, a) + sym + answer.slice(b);
    setAnswer(next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + sym.length, a + sym.length); });
  };
  const check = () => {
    if (!answer.trim()) return;
    const r = transcrire ? checkIpa(answer, item.ipa) : checkWord(answer, item);
    setResult(r);
    if (r !== 'ko') setScore((s) => s + 1);
    markActivity();
  };
  const next = () => { setI(i + 1); setAnswer(''); setResult(null); requestAnimationFrame(() => input.current?.focus()); };

  return (
    <div className="card phon-card">
      <div className="row between">
        <span className="faint small">{i + 1} / {items.length}</span>
        <span className="faint small">{score} juste{score > 1 ? 's' : ''}</span>
      </div>
      <div className="progress" style={{ margin: '10px 0 22px' }}><i style={{ transform: `scaleX(${i / items.length})` }} /></div>
      <div className="phon-prompt">{transcrire ? item.word : `/${item.ipa}/`}</div>
      <div className="faint small" style={{ textAlign: 'center', marginBottom: 16 }}>{transcrire ? 'Écris la transcription phonétique' : 'Écris le mot correspondant'}</div>

      <div className="row" style={{ gap: 8 }}>
        <input ref={input} autoFocus className={`input grow phon-input ${transcrire ? 'ipa' : ''}`} value={answer} disabled={!!result}
          placeholder={transcrire ? 'ex. ʃa' : 'ex. chat'} aria-label="Ta réponse"
          onChange={(e) => setAnswer(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { if (result) next(); else check(); } }} />
        {!result ? <button className="btn primary" disabled={!answer.trim()} onClick={check}>Vérifier</button>
          : <button className="btn accent" onClick={next}>Suivant <Icon name="right" size={15} /></button>}
      </div>

      {transcrire && !result && (
        <div className="ipa-keyboard" aria-label="Clavier API">
          {KEYBOARD.map(([label, syms]) => (
            <div key={label} className="ipa-group">
              <span className="faint small">{label}</span>
              <div className="row wrap" style={{ gap: 4 }}>
                {syms.map((s) => <button key={s} type="button" className="ipa-key" onMouseDown={(e) => e.preventDefault()} onClick={() => insert(s)}>{s}</button>)}
              </div>
            </div>
          ))}
        </div>
      )}

      {result && (
        <div className={`phon-result ${result}`}>
          <b>{result === 'ok' ? 'Juste !' : result === 'variant' ? 'Accepté (variante)' : 'Pas tout à fait'}</b>
          <div>{item.word} → <span className="ipa">/{item.ipa}/</span></div>
          {result === 'variant' && <div className="small muted">{transcrire ? 'Ta réponse est une variante admise (ex. /a/ pour /ɑ/, schwa non prononcé, voyelle moyenne, r pour ʁ). La forme de référence est ci-dessus.' : 'Pense aux accents.'}</div>}
          {result === 'ko' && !transcrire && <div className="small muted">D'autres orthographes peuvent se prononcer pareil (homophones).</div>}
        </div>
      )}
    </div>
  );
}
