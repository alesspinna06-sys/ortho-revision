import { useMemo, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Empty, relDate } from '../components/common.jsx';
import { useDb, getCards, getQuestions, getCourses, getFolders, getHistory } from '../lib/db.js';
import { mastery, streak } from '../lib/srs.js';
import { weakCards } from '../lib/pick.js';
import TimeStats from '../components/TimeStats.jsx';

const pct = (x) => `${Math.round(x * 100)} %`;

/** Statistiques de progression et points faibles. */
export default function StatsView({ go }) {
  const data = useDb(async () => {
    const [cards, questions, courses, folders, history] = await Promise.all([getCards(), getQuestions(), getCourses(), getFolders(), getHistory()]);
    return { cards, questions, courses, folders, history: history.filter((h) => h.type === 'quiz' && h.total > 0) };
  }, []);

  const s = useMemo(() => {
    if (!data) return null;
    const { cards, questions, courses, folders, history } = data;
    const names = Object.fromEntries(courses.map((c) => [c.id, c.title]));
    const folderOf = Object.fromEntries(courses.map((c) => [c.id, c.folderId || '']));
    const seen = questions.filter((q) => q.stats?.seen);
    const right = seen.reduce((n, q) => n + q.stats.right, 0);
    const asked = seen.reduce((n, q) => n + q.stats.seen, 0);
    const groups = [...folders.map((f) => ({ id: f.id, name: f.name, color: f.color })), { id: '', name: 'Sans dossier', color: '#64748b' }]
      .map((g) => {
        const cs = cards.filter((c) => (folderOf[c.courseId] || '') === g.id);
        const qs = seen.filter((q) => (folderOf[q.courseId] || '') === g.id);
        const qa = qs.reduce((n, q) => n + q.stats.seen, 0);
        return {
          ...g,
          courses: courses.filter((c) => (c.folderId || '') === g.id).length,
          cards: cs.length,
          mastered: cs.filter((c) => mastery(c) === 'mastered').length,
          quizRate: qa ? qs.reduce((n, q) => n + q.stats.right, 0) / qa : null,
        };
      })
      .filter((g) => g.courses > 0);
    const weakQ = seen.filter((q) => q.stats.right / q.stats.seen < 0.7)
      .sort((a, b) => a.stats.right / a.stats.seen - b.stats.right / b.stats.seen || b.stats.seen - a.stats.seen)
      .slice(0, 8);
    const weakC = weakCards(cards, 8);
    return {
      names, groups, weakQ, weakC,
      mastered: cards.filter((c) => mastery(c) === 'mastered').length,
      learning: cards.filter((c) => mastery(c) === 'learning').length,
      quizRate: asked ? right / asked : null,
      sessions: history.slice(0, 20).reverse(),
      weakTotal: weakCards(cards, 9999).length,
      weakQTotal: seen.filter((q) => q.stats.right / q.stats.seen < 0.7).length,
    };
  }, [data]);

  if (!data || !s) return null;
  const empty = !data.cards.length && !data.questions.length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Statistiques</h1>
          <div className="page-sub">Ta progression, et ce qu'il reste à consolider.</div>
        </div>
      </div>

      <TimeStats go={go} />

      {empty ? (
        <div className="card"><Empty icon="target" title="Pas encore de statistiques" text="Révise quelques flashcards ou fais un QCM : ta progression apparaîtra ici." /></div>
      ) : (
        <>
          <div className="grid stat-tiles">
            <Tile label="Série en cours" value={`${streak()} j`} hint="jours de révision d'affilée" />
            <Tile label="Cartes maîtrisées" value={`${s.mastered}`} hint={`sur ${data.cards.length} · ${s.learning} en cours d'apprentissage`} />
            <Tile label="Réussite aux QCM" value={s.quizRate == null ? '—' : pct(s.quizRate)} hint="toutes questions confondues" />
            <Tile label="Séances de QCM" value={`${data.history.length}`} hint={data.history[0] ? `dernière ${relDate(data.history[0].date)}` : 'aucune pour l’instant'} />
          </div>

          {(s.weakTotal > 0 || s.weakQTotal > 0) && (
            <div className="card weak-cta">
              <div className="grow">
                <b>Réviser mes points faibles</b>
                <div className="small muted">{s.weakTotal} flashcard{s.weakTotal > 1 ? 's' : ''} difficile{s.weakTotal > 1 ? 's' : ''} · {s.weakQTotal} question{s.weakQTotal > 1 ? 's' : ''} souvent ratée{s.weakQTotal > 1 ? 's' : ''}</div>
              </div>
              <button className="btn primary" disabled={!s.weakTotal} onClick={() => go('review', { weak: true })}><Icon name="layers" size={15} /> Flashcards difficiles</button>
              <button className="btn accent" disabled={!s.weakQTotal} onClick={() => go('quiz', { autostart: true, mode: 'weak' })}><Icon name="target" size={15} /> QCM sur mes erreurs</button>
            </div>
          )}

          {s.sessions.length > 0 && (
            <>
              <div className="section-title">Scores des derniers QCM <span className="faint small">{s.sessions.length} séance{s.sessions.length > 1 ? 's' : ''}</span></div>
              <ScoreChart sessions={s.sessions} names={s.names} />
            </>
          )}

          {s.groups.length > 0 && (
            <>
              <div className="section-title">Par dossier</div>
              <div className="card" style={{ padding: 8 }}>
                {s.groups.map((g) => (
                  <div key={g.id || 'none'} className="list-row" onClick={() => g.id && go('folder', { id: g.id })} style={{ cursor: g.id ? 'pointer' : 'default' }}>
                    <span className="dot-c" style={{ background: g.color, width: 12, height: 12 }} />
                    <div className="grow">
                      <div style={{ fontWeight: 600 }}>{g.name} <span className="faint small">· {g.courses} cours</span></div>
                      <div className="progress" style={{ marginTop: 8, maxWidth: 320 }} title={`${g.mastered} cartes maîtrisées sur ${g.cards}`}>
                        <i style={{ transform: `scaleX(${g.cards ? g.mastered / g.cards : 0})` }} />
                      </div>
                    </div>
                    <span className="faint small stat-col">{g.cards ? `${g.mastered}/${g.cards} maîtrisées` : 'aucune carte'}</span>
                    <span className="small stat-col"><b>{g.quizRate == null ? '—' : pct(g.quizRate)}</b> <span className="faint">aux QCM</span></span>
                  </div>
                ))}
              </div>
            </>
          )}

          {(s.weakQ.length > 0 || s.weakC.length > 0) && (
            <div className="grid grid-2" style={{ marginTop: 6, alignItems: 'start' }}>
              {s.weakQ.length > 0 && (
                <div>
                  <div className="section-title">Questions les plus ratées</div>
                  <div className="card" style={{ padding: 8 }}>
                    {s.weakQ.map((q) => (
                      <div key={q.id} className="list-row" onClick={() => go('course', { id: q.courseId, tab: 'quiz' })}>
                        <div className="grow" style={{ minWidth: 0 }}>
                          <div className="clamp-2" style={{ fontSize: 14 }}>{q.question}</div>
                          <div className="faint small">{s.names[q.courseId] || ''}</div>
                        </div>
                        <span className="chip danger">{q.stats.right}/{q.stats.seen}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {s.weakC.length > 0 && (
                <div>
                  <div className="section-title">Flashcards difficiles</div>
                  <div className="card" style={{ padding: 8 }}>
                    {s.weakC.map((c) => (
                      <div key={c.id} className="list-row" onClick={() => go('course', { id: c.courseId, tab: 'cards' })}>
                        <div className="grow" style={{ minWidth: 0 }}>
                          <div className="clamp-2" style={{ fontSize: 14 }}>{c.front}</div>
                          <div className="faint small">{s.names[c.courseId] || ''}</div>
                        </div>
                        <span className="chip warning">{c.srs.lapses} oubli{c.srs.lapses > 1 ? 's' : ''}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}

function Tile({ label, value, hint }) {
  return (
    <div className="card stat-tile">
      <div className="faint small">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="faint small">{hint}</div>
    </div>
  );
}

/** Barres : score (%) de chaque séance de QCM, de la plus ancienne à la plus récente. Une seule série. */
function ScoreChart({ sessions, names }) {
  const [hover, setHover] = useState(null);
  const W = 720; const H = 190; const pad = { l: 54, r: 12, t: 14, b: 26 };
  const iw = W - pad.l - pad.r; const ih = H - pad.t - pad.b;
  const step = iw / sessions.length;
  const bw = Math.max(6, Math.min(34, step - 6));
  const y = (v) => pad.t + ih * (1 - v);
  const label = (h) => `${h.courseId ? names[h.courseId] || h.title : h.title || 'Toutes matières'} — ${h.score}/${h.total} (${Math.round((h.score / h.total) * 100)} %) — ${new Date(h.date).toLocaleDateString('fr-FR')}`;
  return (
    <div className="card chart-card">
      <svg viewBox={`0 0 ${W} ${H}`} className="score-chart" role="img" aria-label="Score des dernières séances de QCM, en pourcentage de bonnes réponses">
        {[0, 0.5, 1].map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className="grid-line" />
            <text x={pad.l - 8} y={y(v) + 4} textAnchor="end" className="axis-label">{v * 100} %</text>
          </g>
        ))}
        {sessions.map((h, i) => {
          const v = h.score / h.total;
          const x = pad.l + i * step + (step - bw) / 2;
          const top = y(v);
          const height = Math.max(2, pad.t + ih - top);
          return (
            <g key={h.id} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={pad.l + i * step} y={pad.t} width={step} height={ih} fill="transparent" />
              <path className={`bar ${hover === i ? 'on' : ''}`}
                d={`M${x},${pad.t + ih} V${top + 4} Q${x},${top} ${x + 4},${top} H${x + bw - 4} Q${x + bw},${top} ${x + bw},${top + 4} V${pad.t + ih} Z`} />
              <title>{label(h)}</title>
            </g>
          );
        })}
        <text x={pad.l} y={H - 6} className="axis-label">plus ancienne</text>
        <text x={W - pad.r} y={H - 6} textAnchor="end" className="axis-label">plus récente</text>
      </svg>
      <div className="chart-tip" aria-live="polite">{hover != null ? label(sessions[hover]) : 'Survole une barre pour le détail de la séance.'}</div>
      <details className="chart-table">
        <summary className="faint small">Voir les données</summary>
        <table>
          <thead><tr><th>Date</th><th>Séance</th><th>Score</th></tr></thead>
          <tbody>{sessions.slice().reverse().map((h) => (
            <tr key={h.id}><td>{new Date(h.date).toLocaleDateString('fr-FR')}</td><td>{h.courseId ? names[h.courseId] || h.title : h.title || 'Toutes matières'}</td><td>{h.score}/{h.total}</td></tr>
          ))}</tbody>
        </table>
      </details>
    </div>
  );
}
