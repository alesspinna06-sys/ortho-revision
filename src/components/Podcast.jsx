import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { Segmented } from './common.jsx';
import { useToast } from './Toast.jsx';
import { useSettings } from '../lib/settings.jsx';
import { api } from '../lib/bridge.js';
import { updateCourse } from '../lib/db.js';
import { PODCAST_LENGTHS } from '../lib/ai-extra.js';
import { DEFAULT_ELEVEN_MODEL, sortVoices, voiceLabel, DEFAULT_AZURE_VOICE, DEFAULT_AZURE_VOICE_B, sortAzureVoices, azureVoiceLabel } from '../lib/voice.js';
import { useTask, dismissTask } from '../lib/tasks.js';
import { startPodcast, regeneratePodcast, stopPodcast, podcastKey } from '../lib/bgTasks.js';
import { ClaudeGenerateDialog } from './ClaudeBridge.jsx';

const fmtTime = (s) => { const m = Math.floor((s || 0) / 60); const r = Math.round((s || 0) % 60); return `${m} min ${String(r).padStart(2, '0')}`; };
const chars = (lines) => lines.reduce((n, l) => n + l.text.length, 0);
export const elapsed = (t0) => { const s = Math.max(0, Math.round((Date.now() - t0) / 1000)); return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')}`; };

/** Bouton « Podcast » de la barre du cours (avec l'avancement quand le podcast se prépare). */
export function PodcastButton({ course, hasKey }) {
  const [open, setOpen] = useState(false);
  const task = useTask(podcastKey(course.id));
  if (!api.podcast) return null;
  const running = task?.status === 'running';
  return (
    <>
      <button className={`btn sm ${course.podcast || running ? 'accent' : 'ghost'}`} onClick={() => setOpen(true)}
        title={running ? task.label : course.podcast ? 'Écouter le podcast du cours' : 'Transformer le cours en podcast à deux voix'}>
        {running ? <span className="spinner" /> : <Icon name="mic" size={14} />} Podcast{running && task.progress != null ? ` · ${Math.round(task.progress * 100)} %` : ''}
      </button>
      {open && <PodcastDialog course={course} hasKey={hasKey} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Barre d'avancement (fraction 0-1, ou animation continue si inconnue). */
export function ProgressBar({ value }) {
  return (
    <div className={`task-bar ${value == null ? 'indet' : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value == null ? undefined : Math.round(value * 100)}>
      <span style={value == null ? undefined : { width: `${Math.max(2, Math.round(value * 100))}%` }} />
    </div>
  );
}

function PodcastDialog({ course, hasKey, onClose }) {
  const toast = useToast();
  const { settings, update } = useSettings();
  const task = useTask(podcastKey(course.id));
  const running = task?.status === 'running';
  const [mode, setMode] = useState(course.podcast ? 'listen' : 'create');
  const [eleven, setEleven] = useState(null); // { hasKey, voices }
  const [azure, setAzure] = useState(null); // { hasKey, voices }
  const [length, setLength] = useState(settings.podcastLength || 'moyen');
  const [url, setUrl] = useState('');
  const [rate, setRate] = useState(1);
  const [showText, setShowText] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [withClaude, setWithClaude] = useState(false); // dialogue écrit par Claude (sans API)
  const [, tick] = useState(0);
  const audioRef = useRef(null);
  const draft = course.podcastDraft;

  useEffect(() => { if (!running) return undefined; const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t); }, [running]);

  // Voix des deux moteurs (Azure et ElevenLabs), selon les clés enregistrées
  useEffect(() => {
    let alive = true;
    const load = async (svc, sort, set) => {
      if (!svc) { if (alive) set({ hasKey: false, voices: [] }); return; }
      const s = await svc.status();
      if (!s.hasKey) { if (alive) set({ hasKey: false, voices: [] }); return; }
      const v = await svc.voices();
      if (alive) set({ hasKey: true, voices: v.ok ? sort(v.voices) : [], error: v.ok ? '' : v.error });
    };
    load(api.azure, sortAzureVoices, setAzure);
    load(api.eleven, sortVoices, setEleven);
    return () => { alive = false; };
  }, []);

  // Podcast terminé pendant que la fenêtre est ouverte → on passe à l'écoute
  useEffect(() => { if (course.podcast && !course.podcastDraft && task?.status === 'done') setMode('listen'); }, [course.podcast?.at, task?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // MP3 enregistré → lecteur
  useEffect(() => {
    if (mode !== 'listen' || !course.podcast) return undefined;
    let u = '';
    let alive = true;
    api.podcast.read(course.id).then((r) => {
      if (!alive) return;
      if (!r.ok) { toast({ type: 'error', text: r.error }); return; }
      u = URL.createObjectURL(new Blob([r.data], { type: 'audio/mpeg' }));
      setUrl(u);
    });
    return () => { alive = false; if (u) URL.revokeObjectURL(u); setUrl(''); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, course.podcast?.at]);
  useEffect(() => { if (audioRef.current) audioRef.current.playbackRate = rate; }, [rate, url]);

  const loaded = !!(azure && eleven);
  const engines = [azure?.hasKey && 'azure', eleven?.hasKey && 'eleven'].filter(Boolean);
  const engine = engines.includes(settings.podcastEngine) ? settings.podcastEngine : engines[0] || '';
  const isAz = engine === 'azure';
  const eng = isAz ? azure : eleven;
  const voices = eng?.voices || [];
  const has = (id) => voices.some((v) => v.id === id);
  const pickA = isAz ? [settings.azurePodcastVoiceA, settings.azureVoice, DEFAULT_AZURE_VOICE] : [settings.podcastVoiceA, settings.elevenVoice];
  const voiceA = pickA.find((id) => id && has(id)) || voices[0]?.id || '';
  const pickB = isAz ? [settings.azurePodcastVoiceB, DEFAULT_AZURE_VOICE_B] : [settings.podcastVoiceB];
  const voiceB = pickB.find((id) => id && has(id) && id !== voiceA) || voices.find((v) => v.id !== voiceA)?.id || '';
  const setVoice = (who, v) => update(isAz ? { [`azurePodcastVoice${who}`]: v } : { [`podcastVoice${who}`]: v });
  const voiceText = isAz ? azureVoiceLabel : voiceLabel;
  const model = isAz ? 'azure' : settings.elevenModel || DEFAULT_ELEVEN_MODEL;
  const review = settings.podcastReview ?? !isAz; // ElevenLabs : relire avant de dépenser des crédits
  const nameOf = (id) => voices.find((v) => v.id === id)?.name || [...(azure?.voices || []), ...(eleven?.voices || [])].find((v) => v.id === id)?.name || 'Voix';
  const P = course.podcast;
  const savedName = (who) => P?.names?.[who] || nameOf(P?.voices?.[who]);

  const opts = (extra = {}) => ({ length, engine, voices: { A: voiceA, B: voiceB }, names: { A: nameOf(voiceA), B: nameOf(voiceB) }, model, review, ...extra });
  const begin = (extra) => {
    if (!hasKey && !extra?.draft) { toast({ type: 'error', text: 'Ajoute ta clé Gemini dans Réglages.' }); return; }
    if (!voiceA || !voiceB || voiceA === voiceB) { toast({ type: 'error', text: 'Choisis deux voix différentes.' }); return; }
    update({ podcastLength: length });
    if (task && task.status !== 'running') dismissTask(task.id);
    startPodcast(course.id, course.title, opts(extra));
  };
  const regen = () => {
    setConfirmRegen(false);
    if (task && task.status !== 'running') dismissTask(task.id);
    regeneratePodcast(course);
  };

  const save = async () => {
    const r = await api.podcast.save(course.id, `${course.title} - podcast`);
    if (r.ok) toast({ type: 'success', text: 'MP3 enregistré' });
    else if (!r.canceled) toast({ type: 'error', text: r.error });
  };
  const remove = async () => {
    await api.podcast.remove(course.id);
    await updateCourse(course.id, { podcast: null });
    toast({ type: 'success', text: 'Podcast supprimé' });
    onClose();
  };
  const dropDraft = async () => { await updateCourse(course.id, { podcastDraft: null }); };

  const VoiceSelect = ({ value, onChange, label }) => (
    <select className="select" style={{ width: 280, maxWidth: '60%', flex: 'none' }} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} disabled={!voices.length || running}>
      {voices.map((v) => <option key={v.id} value={v.id}>{voiceText(v)}</option>)}
    </select>
  );

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal podcast-modal" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <div className="row between" style={{ marginBottom: 6 }}>
          <h2 style={{ margin: 0 }}><Icon name="mic" /> Podcast du cours</h2>
          <button className="btn icon sm ghost" onClick={onClose} aria-label="Fermer"><Icon name="x" size={14} /></button>
        </div>

        {/* Création en cours (continue en arrière-plan si la fenêtre est fermée) */}
        {running && (
          <div className="pod-task">
            <div className="row between"><b className="small">{task.label}</b><span className="small faint">{elapsed(task.startedAt)}</span></div>
            <ProgressBar value={task.progress} />
            <div className="row between wrap" style={{ gap: 8, marginTop: 10 }}>
              <span className="small faint">Tu peux fermer cette fenêtre et continuer à réviser : la création continue, son avancement reste visible en bas de l'écran.</span>
              <span className="row" style={{ gap: 6 }}>
                <button className="btn sm ghost" onClick={() => stopPodcast(course.id)}>Arrêter</button>
                <button className="btn sm" onClick={onClose}>Continuer en arrière-plan</button>
              </span>
            </div>
          </div>
        )}
        {task?.status === 'error' && (
          <div className="cb-err small" style={{ marginBottom: 10, flexWrap: 'wrap' }}>
            <Icon name="alert" size={14} /> <span className="grow">La dernière création a échoué : {task.error}</span>
            {!course.podcastDraft && <button className="btn sm" onClick={() => { dismissTask(task.id); setMode('create'); setWithClaude(true); }}>Écrire le dialogue avec Claude</button>}
            <button className="btn sm ghost" onClick={() => dismissTask(task.id)}>OK</button>
          </div>
        )}
        {withClaude && <ClaudeGenerateDialog course={course} initial={['podcast']} initialCounts={{ podcast: length }} onClose={() => { setWithClaude(false); setMode('create'); }} />}

        {!running && mode === 'listen' && P && (
          <>
            <div className="muted small" style={{ marginBottom: 10 }}>« {P.title} » · {fmtTime(P.seconds)} · {savedName('A')} et {savedName('B')}</div>
            {url ? <audio ref={audioRef} className="podcast-audio" controls src={url} /> : <div className="row"><span className="spinner" /> Chargement…</div>}
            <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
              <Segmented value={rate} onChange={setRate} options={[1, 1.25, 1.5].map((r) => ({ value: r, label: `× ${String(r).replace('.', ',')}` }))} />
              <button className="btn sm" onClick={save}><Icon name="download" size={14} /> Enregistrer le MP3</button>
              <button className="btn sm ghost" onClick={() => setShowText((s) => !s)}><Icon name="text" size={14} /> {showText ? 'Cacher le texte' : 'Lire le texte'}</button>
              <button className="btn sm ghost" onClick={remove}><Icon name="trash" size={14} /> Supprimer</button>
            </div>
            <div className="pod-regen">
              <div className="grow">
                <b className="small">Régénérer le podcast</b>
                <div className="small faint">Nouveau dialogue écrit par Gemini, avec les mêmes voix et la même longueur. L'ancien est gardé jusqu'à ce que le nouveau soit prêt.</div>
              </div>
              {confirmRegen ? (
                <span className="row" style={{ gap: 6 }}>
                  <button className="btn sm accent" onClick={regen}>Oui, régénérer</button>
                  <button className="btn sm ghost" onClick={() => setConfirmRegen(false)}>Non</button>
                </span>
              ) : (
                <span className="row" style={{ gap: 6 }}>
                  <button className="btn sm accent" onClick={() => setConfirmRegen(true)}><Icon name="refresh" size={14} /> Régénérer</button>
                  <button className="btn sm ghost" onClick={() => setMode('create')}>Changer les réglages</button>
                </span>
              )}
            </div>
            {showText && <Transcript lines={P.lines || []} names={{ A: savedName('A'), B: savedName('B') }} />}
            <div className="small muted" style={{ marginTop: 10 }}>Aussi dans le menu Podcasts et sur ton téléphone (Réglages › Téléphone).</div>
          </>
        )}

        {!running && (mode === 'create' || !P) && (
          <>
            {!loaded && <div className="row"><span className="spinner" /> Chargement des voix…</div>}
            {loaded && !engine && <div className="callout-box">Ajoute ta clé <b>Azure Speech</b> (gratuite) ou ElevenLabs dans <b>Réglages › Voix</b> pour créer des podcasts.</div>}
            {loaded && engine && (
              <>
                <p className="small muted" style={{ marginTop: 0 }}>Gemini écrit un dialogue fidèle à ton cours (sans rien inventer), puis deux voix {isAz ? 'Azure' : 'ElevenLabs'} le lisent. Tout se fait en arrière-plan : tu peux fermer cette fenêtre.</p>
                {engines.length > 1 && (
                  <div className="setting-row">
                    <div className="grow"><div className="t">Voix</div><div className="d">{isAz ? 'Azure : gratuit jusqu’à 500 000 caractères par mois.' : 'ElevenLabs : utilise tes crédits.'}</div></div>
                    <Segmented value={engine} onChange={(v) => update({ podcastEngine: v })} options={[{ value: 'azure', label: 'Azure' }, { value: 'eleven', label: 'ElevenLabs' }]} />
                  </div>
                )}
                {eng?.error && <div className="small" style={{ color: 'var(--danger, #e5484d)' }}>{eng.error}</div>}
                {!draft && (
                  <div className="setting-row">
                    <div className="grow"><div className="t">Longueur</div><div className="d">{(PODCAST_LENGTHS.find((l) => l.id === length) || PODCAST_LENGTHS[1]).minutes} minutes environ</div></div>
                    <Segmented value={length} onChange={setLength} options={PODCAST_LENGTHS.map((l) => ({ value: l.id, label: l.label }))} />
                  </div>
                )}
                <div className="setting-row">
                  <div className="grow"><div className="t">Animatrice</div><div className="d">Pose les questions</div></div>
                  <VoiceSelect value={voiceA} label="Voix de l'animatrice" onChange={(v) => setVoice('A', v)} />
                </div>
                <div className="setting-row">
                  <div className="grow"><div className="t">Experte</div><div className="d" style={voiceA === voiceB ? { color: 'var(--danger, #e5484d)' } : undefined}>{voiceA === voiceB ? 'Choisis deux voix différentes.' : 'Explique le cours'}</div></div>
                  <VoiceSelect value={voiceB} label="Voix de l'experte" onChange={(v) => setVoice('B', v)} />
                </div>

                {!draft && (
                  <>
                    <label className="row small" style={{ gap: 8, marginTop: 10, cursor: 'pointer' }}>
                      <input type="checkbox" checked={review} onChange={(e) => update({ podcastReview: e.target.checked })} />
                      Me laisser relire le dialogue avant de créer l'audio{isAz ? '' : ' (conseillé avec ElevenLabs)'}
                    </label>
                    <div className="row" style={{ marginTop: 12, gap: 8 }}>
                      <button className="btn primary" onClick={() => begin()} disabled={voiceA === voiceB}>
                        <Icon name="sparkles" size={14} /> {review ? 'Écrire le dialogue' : P ? 'Créer le nouveau podcast' : 'Créer le podcast'}
                      </button>
                      <button className="btn ghost" onClick={() => { update({ podcastLength: length }); setWithClaude(true); }}
                        title="Claude écrit le dialogue avec ton compte claude.ai (utile quand Gemini ne répond pas) ; tu crées ensuite l'audio ici"><Icon name="sparkles" size={14} /> Écrire avec Claude</button>
                      {P && <button className="btn ghost" onClick={() => setMode('listen')}>Revenir au podcast actuel</button>}
                    </div>
                  </>
                )}

                {draft && (
                  <>
                    <div className="row between" style={{ marginTop: 12 }}>
                      <b>« {draft.title} » <span className="chip">{draft.by === 'claude' ? 'Écrit par Claude · à relire' : 'Brouillon à relire'}</span></b>
                      <span className="small muted">{draft.lines.length} répliques · ≈ {chars(draft.lines).toLocaleString('fr-FR')} caractères{isAz ? '' : ' de crédits'}</span>
                    </div>
                    <Transcript lines={draft.lines} names={{ A: nameOf(voiceA), B: nameOf(voiceB) }} />
                    <div className="row wrap" style={{ marginTop: 12, gap: 8 }}>
                      <button className="btn primary" onClick={() => begin({ draft })} disabled={voiceA === voiceB}><Icon name="mic" size={14} /> Créer l'audio</button>
                      <button className="btn ghost" onClick={async () => { await dropDraft(); begin({ review: true }); }}><Icon name="refresh" size={14} /> Réécrire le dialogue</button>
                      <button className="btn ghost" onClick={dropDraft}>Abandonner ce brouillon</button>
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Transcript({ lines, names }) {
  return (
    <div className="podcast-text">
      {lines.map((l, i) => (
        <p key={i} className={`pl pl-${l.speaker}`}><b>{names[l.speaker] || l.speaker} :</b> {l.text}</p>
      ))}
    </div>
  );
}
