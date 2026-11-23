import { useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Empty, Segmented } from '../components/common.jsx';
import { useToast } from '../components/Toast.jsx';
import { api } from '../lib/bridge.js';
import { useDb, getCourses, getFolders } from '../lib/db.js';
import { useTasks } from '../lib/tasks.js';
import { regeneratePodcast, podcastKey, stopPodcast } from '../lib/bgTasks.js';
import { ProgressBar } from '../components/Podcast.jsx';

// Menu « Podcasts » : tous les podcasts enregistrés, rangés par dossier, avec un lecteur
// qui enchaîne les épisodes et reprend là où tu t'étais arrêtée.

const POS_KEY = 'podcast-pos';
const readPos = () => { try { return JSON.parse(localStorage.getItem(POS_KEY) || '{}'); } catch { return {}; } };
const savePos = (id, t, dur) => {
  try {
    const all = readPos();
    if (dur && t > dur - 5) delete all[id]; else all[id] = Math.floor(t);
    localStorage.setItem(POS_KEY, JSON.stringify(all));
  } catch { /* stockage indisponible */ }
};
const fmt = (s) => {
  s = Math.max(0, Math.round(s || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
};
const fmtLong = (s) => { const m = Math.round((s || 0) / 60); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`; };
const COLORS = ['#8b5cf6', '#ec4899', '#f59e0b', '#22c55e', '#06b6d4', '#ef4444', '#5b5bf7', '#64748b'];

export default function PodcastsView({ go }) {
  const toast = useToast();
  const data = useDb(async () => ({ courses: await getCourses(), folders: await getFolders() }), []);
  const [q, setQ] = useState('');
  const [folder, setFolder] = useState('all');
  const [current, setCurrent] = useState(null); // id du cours en lecture
  const [url, setUrl] = useState('');
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [rate, setRate] = useState(() => { try { return Number(localStorage.getItem('podcast-rate')) || 1; } catch { return 1; } });
  const [chain, setChain] = useState(() => { try { return localStorage.getItem('podcast-chain') !== '0'; } catch { return true; } });
  const [text, setText] = useState(null); // id dont le texte est déplié
  const [askRegen, setAskRegen] = useState(null); // id du podcast à régénérer (confirmation)
  const tasks = useTasks();
  const audio = useRef(null);
  const queueRef = useRef([]);

  // Charge le MP3 du podcast choisi
  useEffect(() => {
    if (!current) return undefined;
    let u = '';
    let alive = true;
    api.podcast.read(current).then((r) => {
      if (!alive) return;
      if (!r.ok) { toast({ type: 'error', text: r.error }); setCurrent(null); return; }
      u = URL.createObjectURL(new Blob([r.data], { type: 'audio/mpeg' }));
      setUrl(u);
    });
    return () => { alive = false; if (u) URL.revokeObjectURL(u); setUrl(''); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  useEffect(() => { if (audio.current) audio.current.playbackRate = rate; try { localStorage.setItem('podcast-rate', String(rate)); } catch { /* */ } }, [rate, url]);
  useEffect(() => { try { localStorage.setItem('podcast-chain', chain ? '1' : '0'); } catch { /* */ } }, [chain]);
  useEffect(() => () => { const a = audio.current; if (a && current) savePos(current, a.currentTime, a.duration); }, [current]);

  if (!data) return null;
  if (!api.podcast) {
    return <div className="card"><Empty icon="mic" title="Podcasts" text="Les podcasts sont disponibles dans le logiciel installé sur l'ordinateur." /></div>;
  }

  const { courses, folders } = data;
  const withPod = courses.filter((c) => c.podcast);
  const folderIds = new Set(folders.map((f) => f.id));
  const keyOf = (c) => (c.folderId && folderIds.has(c.folderId) ? c.folderId : `cat:${(c.subject || '').trim()}`);
  const cats = [...new Set(withPod.filter((c) => keyOf(c).startsWith('cat:')).map((c) => (c.subject || '').trim()))]
    .sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, 'fr')));
  const allGroups = [
    ...folders.map((f) => ({ id: f.id, name: f.name, color: f.color, real: true })),
    ...cats.map((n, i) => ({ id: `cat:${n}`, name: n || 'Sans dossier', color: n ? COLORS[i % COLORS.length] : '#94a3b8', real: false })),
  ].filter((g) => withPod.some((c) => keyOf(c) === g.id));
  const needle = q.trim().toLowerCase();
  const list = withPod
    .filter((c) => (!needle || `${c.title} ${c.podcast.title || ''} ${c.subject || ''}`.toLowerCase().includes(needle)) && (folder === 'all' || keyOf(c) === folder))
    .sort((a, b) => (b.podcast.at || 0) - (a.podcast.at || 0));
  const groups = allGroups.map((g) => ({ ...g, items: list.filter((c) => keyOf(c) === g.id) })).filter((g) => g.items.length);
  const ordered = groups.flatMap((g) => g.items);
  queueRef.current = ordered.map((c) => c.id);
  const total = withPod.reduce((n, c) => n + (c.podcast.seconds || 0), 0);
  const cur = withPod.find((c) => c.id === current);
  const positions = readPos();

  const play = (id) => {
    if (id === current && audio.current) { if (audio.current.paused) audio.current.play().catch(() => {}); else audio.current.pause(); return; }
    if (audio.current && current) savePos(current, audio.current.currentTime, audio.current.duration);
    setTime(0); setDur(0);
    setCurrent(id);
  };
  const step = (d) => {
    const ids = queueRef.current;
    const i = ids.indexOf(current);
    const next = ids[i + d];
    if (next) play(next);
  };
  const onLoaded = () => {
    const a = audio.current;
    if (!a) return;
    a.playbackRate = rate;
    setDur(a.duration || 0);
    const p = readPos()[current];
    if (p && p < (a.duration || 0) - 5) a.currentTime = p;
    a.play().catch(() => {});
  };
  const onEnded = () => {
    savePos(current, 0, 0);
    setPlaying(false);
    if (chain) step(1);
  };
  const seek = (v) => { if (audio.current) { audio.current.currentTime = v; setTime(v); } };
  const save = async (c) => {
    const r = await api.podcast.save(c.id, `${c.title} - podcast`);
    if (r.ok) toast({ type: 'success', text: 'MP3 enregistré' });
    else if (!r.canceled) toast({ type: 'error', text: r.error });
  };
  const busyTask = (id) => tasks.find((t) => t.id === podcastKey(id) && t.status === 'running');
  const names = (p) => (p.names ? `${p.names.A} et ${p.names.B}` : '');

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Podcasts</h1>
          <div className="page-sub">
            {withPod.length
              ? `${withPod.length} podcast${withPod.length > 1 ? 's' : ''} · ${fmtLong(total)} d'écoute · aussi sur ton téléphone (Réglages › Téléphone)`
              : 'Tes cours transformés en émissions à deux voix'}
          </div>
        </div>
      </div>

      {cur && (
        <div className="card pod-player" role="region" aria-label="Lecteur de podcast">
          <audio ref={audio} src={url || undefined} onLoadedMetadata={onLoaded} onPlay={() => setPlaying(true)} onPause={() => { setPlaying(false); savePos(current, audio.current?.currentTime || 0, audio.current?.duration || 0); }}
            onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)} onEnded={onEnded} />
          <div className="row" style={{ gap: 12, alignItems: 'center' }}>
            <button className="btn icon ghost" onClick={() => step(-1)} disabled={queueRef.current.indexOf(current) <= 0} aria-label="Podcast précédent" title="Précédent"><Icon name="left" size={16} /></button>
            <button className="pod-big-play" onClick={() => play(current)} aria-label={playing ? 'Pause' : 'Lecture'} disabled={!url}>
              {url ? <Icon name={playing ? 'pause' : 'play'} size={20} /> : <span className="spinner" />}
            </button>
            <button className="btn icon ghost" onClick={() => step(1)} disabled={queueRef.current.indexOf(current) >= queueRef.current.length - 1} aria-label="Podcast suivant" title="Suivant"><Icon name="right" size={16} /></button>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="pod-now"><b>{cur.podcast.title || cur.title}</b></div>
              <div className="faint small" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cur.title}{names(cur.podcast) ? ` · ${names(cur.podcast)}` : ''}</div>
              <div className="row" style={{ gap: 8, marginTop: 6 }}>
                <span className="small faint pod-time">{fmt(time)}</span>
                <input type="range" className="pod-seek grow" min={0} max={dur || 0} step={1} value={Math.min(time, dur || 0)} onChange={(e) => seek(Number(e.target.value))} aria-label="Position dans le podcast" disabled={!dur} />
                <span className="small faint pod-time">{fmt(dur)}</span>
              </div>
            </div>
          </div>
          <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
            <Segmented value={rate} onChange={setRate} options={[0.9, 1, 1.25, 1.5, 1.75].map((r) => ({ value: r, label: `× ${String(r).replace('.', ',')}` }))} />
            <label className="row small" style={{ gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={chain} onChange={(e) => setChain(e.target.checked)} /> Enchaîner avec le suivant
            </label>
            <button className="btn sm ghost" style={{ marginLeft: 'auto' }} onClick={() => go('course', { id: cur.id })}>Ouvrir le cours</button>
          </div>
        </div>
      )}

      {withPod.length === 0 ? (
        <div className="card">
          <Empty icon="mic" title="Pas encore de podcast" text="Ouvre un cours puis clique sur « Podcast » : Gemini écrit un dialogue fidèle au cours, lu par deux voix. Il apparaîtra ici.">
            <button className="btn primary" onClick={() => go('library')}><Icon name="book" size={14} /> Choisir un cours</button>
          </Empty>
        </div>
      ) : (
        <>
          <input className="input" style={{ marginBottom: 16 }} placeholder="Rechercher un podcast…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher un podcast" />
          {allGroups.length > 1 && (
            <div className="row wrap synth-filter" role="group" aria-label="Filtrer par dossier">
              <button className={`chip ${folder === 'all' ? 'accent' : ''}`} aria-pressed={folder === 'all'} onClick={() => setFolder('all')}>Tous les dossiers</button>
              {allGroups.map((g) => (
                <button key={g.id} className={`chip ${folder === g.id ? 'accent' : ''}`} aria-pressed={folder === g.id} onClick={() => setFolder(g.id)}>
                  <span className="dot-c" style={{ background: g.color }} /> {g.name} <span className="faint">{withPod.filter((c) => keyOf(c) === g.id).length}</span>
                </button>
              ))}
            </div>
          )}
          {!groups.length && <div className="muted small">Aucun podcast ne correspond à ta recherche.</div>}
          {groups.map((g) => (
            <section key={g.id} className="synth-group">
              {allGroups.length > 1 && (
                <div className="synth-group-head">
                  <span className="dot-c" style={{ background: g.color, width: 12, height: 12 }} />
                  <b>{g.name}</b>
                  <span className="faint small">{g.items.length} podcast{g.items.length > 1 ? 's' : ''} · {fmtLong(g.items.reduce((n, c) => n + (c.podcast.seconds || 0), 0))}</span>
                  {g.real && <button className="btn sm ghost" style={{ marginLeft: 'auto' }} onClick={() => go('folder', { id: g.id })}><Icon name="folder" size={14} /> Ouvrir le dossier</button>}
                </div>
              )}
              <div className="stack" style={{ gap: 10 }}>
                {g.items.map((c) => {
                  const P = c.podcast;
                  const on = c.id === current;
                  const pos = positions[c.id];
                  return (
                    <div key={c.id} className={`card pod-item ${on ? 'on' : ''}`}>
                      <div className="row" style={{ gap: 14, alignItems: 'center' }}>
                        <button className="pod-play" onClick={() => play(c.id)} aria-label={on && playing ? `Pause : ${P.title || c.title}` : `Écouter : ${P.title || c.title}`}>
                          <Icon name={on && playing ? 'pause' : 'play'} size={16} />
                        </button>
                        <div className="grow" style={{ minWidth: 0 }}>
                          <div className="pod-title">{P.title || c.title}</div>
                          <div className="faint small">
                            {c.title} · {fmtLong(P.seconds)}{P.at ? ` · ${new Date(P.at).toLocaleDateString('fr-FR')}` : ''}{names(P) ? ` · ${names(P)}` : ''}
                            {!on && pos ? <span className="chip" style={{ marginLeft: 8 }}>Reprendre à {fmt(pos)}</span> : null}
                          </div>
                        </div>
                        <div className="row wrap pod-actions" style={{ gap: 6 }}>
                          <button className="btn sm ghost" onClick={() => setText(text === c.id ? null : c.id)} aria-expanded={text === c.id}><Icon name="text" size={14} /> Texte</button>
                          <button className="btn sm ghost" onClick={() => save(c)} title="Enregistrer le MP3 sur l'ordinateur"><Icon name="download" size={14} /> MP3</button>
                          <button className="btn sm ghost" onClick={() => go('course', { id: c.id })}>Cours</button>
                          {!busyTask(c.id) && (askRegen === c.id ? (
                            <>
                              <button className="btn sm accent" onClick={() => { setAskRegen(null); if (current === c.id) { audio.current?.pause(); setCurrent(null); } regeneratePodcast(c); }}>Oui, régénérer</button>
                              <button className="btn sm ghost" onClick={() => setAskRegen(null)}>Non</button>
                            </>
                          ) : (
                            <button className="btn sm ghost" onClick={() => setAskRegen(c.id)} title="Nouveau dialogue et nouvel audio, mêmes voix et même longueur (en arrière-plan)"><Icon name="refresh" size={14} /> Régénérer</button>
                          ))}
                        </div>
                      </div>
                      {busyTask(c.id) && (
                        <div className="pod-busy">
                          <div className="row between small"><span>{busyTask(c.id).label}</span><button className="btn sm ghost" onClick={() => stopPodcast(c.id)}>Arrêter</button></div>
                          <ProgressBar value={busyTask(c.id).progress} />
                        </div>
                      )}
                      {text === c.id && (
                        <div className="podcast-text" style={{ marginTop: 12 }}>
                          {(P.lines || []).map((l, i) => (
                            <p key={i} className={`pl pl-${l.speaker}`}><b>{(P.names && P.names[l.speaker]) || (l.speaker === 'A' ? 'Animatrice' : 'Experte')} :</b> {l.text}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </>
      )}
    </>
  );
}
