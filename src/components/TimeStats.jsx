import { useMemo, useState } from 'react';
import Icon from './Icon.jsx';
import { relDate } from './common.jsx';
import { useDb, getTimes, getCourses, clearTimes } from '../lib/db.js';
import { flushUsage, fmtDuration, dayKey } from '../lib/usage.js';

const VIEW_LABELS = {
  home: 'Accueil', library: 'Mes cours', course: 'Pages de cours', folder: 'Dossiers', syntheses: 'Synthèses', import: 'Importer',
  review: 'Flashcards (révision)', quiz: 'QCM', stats: 'Statistiques', settings: 'Réglages',
  patient: 'Patient simulé', tests: 'Tests de bilan', phonetique: 'Phonétique', ecrits: 'Écrits', oral: 'Oral', notions: 'Notions',
};
const TAB_LABELS = { fiche: 'Cours', deepen: 'Approfondir', chat: 'Questions', cards: 'Flashcards', quiz: 'QCM', text: 'Texte source' };
const DAYS = 14;

const sumMap = (list, key) => list.reduce((m, d) => { Object.entries(d[key] || {}).forEach(([k, v]) => { m[k] = (m[k] || 0) + v; }); return m; }, {});
const sorted = (m) => Object.entries(m).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);

/** Temps passé : par jour, par cours, par partie de l'application, et cours acquis. */
export default function TimeStats({ go }) {
  const data = useDb(async () => {
    await flushUsage();
    const [times, courses] = await Promise.all([getTimes(), getCourses()]);
    return { times, courses };
  }, []);
  const [confirm, setConfirm] = useState(false);

  const s = useMemo(() => {
    if (!data) return null;
    const { times, courses } = data;
    const byDay = Object.fromEntries(times.map((t) => [t.day, t.total]));
    const days = [];
    for (let i = DAYS - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const k = dayKey(d);
      days.push({ key: k, date: d, sec: byDay[k] || 0 });
    }
    const total = times.reduce((n, t) => n + t.total, 0);
    const week = days.slice(-7).reduce((n, d) => n + d.sec, 0);
    const activeDays = times.filter((t) => t.total >= 60).length;
    const perCourse = sumMap(times, 'byCourse');
    const known = Object.fromEntries(courses.map((c) => [c.id, c]));
    const ranking = sorted(perCourse).filter(([id]) => known[id]).map(([id, sec]) => ({ course: known[id], sec }));
    const courseTotal = ranking.reduce((n, r) => n + r.sec, 0);
    const mean = ranking.length ? courseTotal / ranking.length : 0;
    // dernier jour de visite de chaque cours
    const last = {};
    times.forEach((t) => Object.keys(t.byCourse || {}).forEach((id) => { if (!last[id] || t.day > last[id]) last[id] = t.day; }));
    const toResume = courses.filter((c) => !c.acquired)
      .map((c) => ({ course: c, last: last[c.id] || null, sec: perCourse[c.id] || 0 }))
      .sort((a, b) => (a.last || '').localeCompare(b.last || ''))
      .slice(0, 5);
    const acquired = courses.filter((c) => c.acquired);
    const acqTime = acquired.map((c) => perCourse[c.id] || 0).filter(Boolean);
    return {
      days, total, week, activeDays, ranking: ranking.slice(0, 10), mean, max: ranking[0]?.sec || 1,
      views: sorted(sumMap(times, 'byView')), tabs: sorted(sumMap(times, 'byTab')),
      acquired: acquired.length, courses: courses.length, toResume,
      acqMean: acqTime.length ? acqTime.reduce((a, b) => a + b, 0) / acqTime.length : 0,
      today: byDay[dayKey()] || 0, since: times[0]?.day,
    };
  }, [data]);

  if (!data || !s) return null;
  const hasTime = s.total >= 30;

  return (
    <>
      <div className="section-title">Temps et progression</div>
      <div className="grid stat-tiles">
        <Tile label="Aujourd'hui" value={fmtDuration(s.today)} hint="temps actif dans l'application" />
        <Tile label="7 derniers jours" value={fmtDuration(s.week)} hint={s.activeDays ? `${s.activeDays} jour${s.activeDays > 1 ? 's' : ''} d'activité au total` : 'le suivi commence aujourd’hui'} />
        <Tile label="Temps total" value={fmtDuration(s.total)} hint={s.activeDays > 0 ? `soit ${fmtDuration(s.total / s.activeDays)} par jour actif` : 'depuis le début du suivi'} />
        <Tile label="Cours acquis" value={`${s.acquired}/${s.courses}`} hint={s.acqMean ? `${fmtDuration(s.acqMean)} en moyenne pour en venir à bout` : 'coche un cours une fois maîtrisé'} />
      </div>
      {s.acquired > 0 && (
        <div className="progress" style={{ margin: '4px 0 14px', maxWidth: 420 }} title={`${s.acquired} cours acquis sur ${s.courses}`}>
          <i style={{ transform: `scaleX(${s.acquired / s.courses})` }} />
        </div>
      )}

      {!hasTime ? (
        <div className="card small muted">Le temps passé est compté tant que la fenêtre est ouverte et que tu l'utilises (une pause de plus de 3 minutes n'est pas comptée). Les courbes apparaîtront après quelques minutes d'utilisation.</div>
      ) : (
        <>
          <DayChart days={s.days} />

          <div className="grid grid-2" style={{ marginTop: 14, alignItems: 'start' }}>
            <div>
              <div className="section-title" style={{ marginTop: 0 }}>Temps par cours</div>
              <div className="card" style={{ padding: 8 }}>
                {s.ranking.length === 0 && <div className="small faint" style={{ padding: 10 }}>Ouvre un cours pour commencer le suivi.</div>}
                {s.ranking.map((r) => {
                  const ratio = s.mean ? r.sec / s.mean : 1;
                  return (
                    <div key={r.course.id} className="list-row" onClick={() => go('course', { id: r.course.id })}>
                      <div className="grow" style={{ minWidth: 0 }}>
                        <div className="row" style={{ gap: 8 }}>
                          <span className="clamp-1" style={{ fontSize: 14, fontWeight: 600 }}>{r.course.title}</span>
                          {r.course.acquired && <span className="chip success">Acquis</span>}
                          {ratio >= 2 && s.ranking.length > 2 && <span className="chip warning" title="Beaucoup plus de temps que la moyenne des cours">×{ratio.toFixed(1).replace('.', ',')} la moyenne</span>}
                        </div>
                        <div className="progress" style={{ marginTop: 7 }}><i style={{ transform: `scaleX(${r.sec / s.max})` }} /></div>
                      </div>
                      <span className="small stat-col"><b>{fmtDuration(r.sec)}</b></span>
                    </div>
                  );
                })}
              </div>
              {s.ranking.length > 2 && <div className="faint small" style={{ marginTop: 6 }}>Moyenne : {fmtDuration(s.mean)} par cours.</div>}
            </div>

            <div>
              <div className="section-title" style={{ marginTop: 0 }}>Où tu passes ton temps</div>
              <div className="card" style={{ padding: 8 }}>
                {s.views.slice(0, 8).map(([k, sec]) => (
                  <Bar key={k} label={VIEW_LABELS[k] || k} sec={sec} max={s.views[0][1]} />
                ))}
              </div>
              {s.tabs.length > 0 && (
                <>
                  <div className="section-title">Dans les pages de cours</div>
                  <div className="card" style={{ padding: 8 }}>
                    {s.tabs.map(([k, sec]) => <Bar key={k} label={TAB_LABELS[k] || k} sec={sec} max={s.tabs[0][1]} />)}
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {s.toResume.length > 0 && (
        <>
          <div className="section-title">À reprendre <span className="faint small">cours pas encore acquis, les moins récents d'abord</span></div>
          <div className="card" style={{ padding: 8 }}>
            {s.toResume.map((r) => (
              <div key={r.course.id} className="list-row" onClick={() => go('course', { id: r.course.id })}>
                <div className="grow clamp-1" style={{ fontSize: 14 }}>{r.course.title}</div>
                <span className="faint small">{r.last ? `vu ${relDate(new Date(`${r.last}T12:00:00`).getTime())}` : 'pas encore ouvert depuis le suivi'}</span>
                {r.sec > 0 && <span className="chip">{fmtDuration(r.sec)}</span>}
              </div>
            ))}
          </div>
        </>
      )}

      {s.total > 0 && (
        <div className="row" style={{ marginTop: 10, gap: 10 }}>
          <span className="faint small">Suivi depuis le {new Date(`${s.since}T12:00:00`).toLocaleDateString('fr-FR')} · enregistré sur cet ordinateur, rien n'est envoyé.</span>
          {confirm ? (
            <>
              <button className="btn sm danger" onClick={() => { clearTimes(); setConfirm(false); }}>Effacer le suivi</button>
              <button className="btn sm ghost" onClick={() => setConfirm(false)}>Non</button>
            </>
          ) : <button className="btn sm ghost" onClick={() => setConfirm(true)}><Icon name="trash" size={13} /> Remettre à zéro</button>}
        </div>
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

function Bar({ label, sec, max }) {
  return (
    <div className="list-row" style={{ cursor: 'default' }}>
      <div className="grow">
        <div style={{ fontSize: 14 }}>{label}</div>
        <div className="progress" style={{ marginTop: 6 }}><i style={{ transform: `scaleX(${sec / max})` }} /></div>
      </div>
      <span className="small stat-col"><b>{fmtDuration(sec)}</b></span>
    </div>
  );
}

/** Minutes passées par jour, sur les 14 derniers jours. */
function DayChart({ days }) {
  const [hover, setHover] = useState(null);
  const W = 720; const H = 170; const pad = { l: 54, r: 12, t: 14, b: 28 };
  const iw = W - pad.l - pad.r; const ih = H - pad.t - pad.b;
  const maxMin = Math.max(30, Math.ceil(Math.max(...days.map((d) => d.sec)) / 60 / 30) * 30);
  const step = iw / days.length;
  const bw = Math.max(8, Math.min(30, step - 8));
  const y = (m) => pad.t + ih * (1 - m / maxMin);
  const label = (d) => `${d.date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} — ${d.sec ? fmtDuration(d.sec) : 'rien'}`;
  return (
    <div className="card chart-card">
      <svg viewBox={`0 0 ${W} ${H}`} className="score-chart" role="img" aria-label="Temps passé dans l'application chaque jour, sur les 14 derniers jours">
        {[0, maxMin / 2, maxMin].map((m) => (
          <g key={m}>
            <line x1={pad.l} x2={W - pad.r} y1={y(m)} y2={y(m)} className="grid-line" />
            <text x={pad.l - 8} y={y(m) + 4} textAnchor="end" className="axis-label">{m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60}` : ''}` : `${m} min`}</text>
          </g>
        ))}
        {days.map((d, i) => {
          const x = pad.l + i * step + (step - bw) / 2;
          const top = y(d.sec / 60);
          const height = Math.max(d.sec ? 3 : 0, pad.t + ih - top);
          return (
            <g key={d.key} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={pad.l + i * step} y={pad.t} width={step} height={ih} fill="transparent" />
              {d.sec > 0 && <path className={`bar ${hover === i ? 'on' : ''}`} d={`M${x},${pad.t + ih} V${pad.t + ih - height + 4} Q${x},${pad.t + ih - height} ${x + 4},${pad.t + ih - height} H${x + bw - 4} Q${x + bw},${pad.t + ih - height} ${x + bw},${pad.t + ih - height + 4} V${pad.t + ih} Z`} />}
              {(i % 2 === (days.length - 1) % 2) && <text x={x + bw / 2} y={H - 8} textAnchor="middle" className="axis-label">{d.date.getDate()}</text>}
              <title>{label(d)}</title>
            </g>
          );
        })}
      </svg>
      <div className="chart-tip" aria-live="polite">{hover != null ? label(days[hover]) : 'Survole une barre pour voir le détail du jour.'}</div>
    </div>
  );
}
