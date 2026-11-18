import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { Segmented } from './common.jsx';
import { useToast } from './Toast.jsx';
import { useSettings } from '../lib/settings.jsx';
import { api } from '../lib/bridge.js';
import { updateCourse } from '../lib/db.js';
import { podcastScript, PODCAST_LENGTHS } from '../lib/ai-extra.js';
import { DEFAULT_ELEVEN_MODEL, sortVoices, voiceLabel, DEFAULT_AZURE_VOICE, DEFAULT_AZURE_VOICE_B, sortAzureVoices, azureVoiceLabel } from '../lib/voice.js';

const fmtTime = (s) => { const m = Math.floor((s || 0) / 60); const r = Math.round((s || 0) % 60); return `${m} min ${String(r).padStart(2, '0')}`; };
const chars = (lines) => lines.reduce((n, l) => n + l.text.length, 0);

/** Bouton « Podcast » de la barre du cours. */
export function PodcastButton({ course, hasKey }) {
  const [open, setOpen] = useState(false);
  if (!api.podcast) return null;
  return (
    <>
      <button className={`btn sm ${course.podcast ? 'accent' : 'ghost'}`} onClick={() => setOpen(true)}
        title={course.podcast ? 'Écouter le podcast du cours' : 'Transformer le cours en podcast à deux voix (Azure ou ElevenLabs)'}>
        <Icon name="mic" size={14} /> Podcast
      </button>
      {open && <PodcastDialog course={course} hasKey={hasKey} onClose={() => setOpen(false)} />}
    </>
  );
}

function PodcastDialog({ course, hasKey, onClose }) {
  const toast = useToast();
  const { settings, update } = useSettings();
  const [mode, setMode] = useState(course.podcast ? 'listen' : 'create');
  const [eleven, setEleven] = useState(null); // { hasKey, voices }
  const [azure, setAzure] = useState(null); // { hasKey, voices }
  const [length, setLength] = useState(settings.podcastLength || 'moyen');
  const [script, setScript] = useState(null);
  const [busy, setBusy] = useState(''); // '', 'script', 'audio'
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [url, setUrl] = useState('');
  const [rate, setRate] = useState(1);
  const [showText, setShowText] = useState(false);
  const audioRef = useRef(null);

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

  // MP3 enregistré → lecteur
  useEffect(() => {
    if (mode !== 'listen' || !course.podcast) return undefined;
    let u = '';
    api.podcast.read(course.id).then((r) => {
      if (!r.ok) { toast({ type: 'error', text: r.error }); return; }
      u = URL.createObjectURL(new Blob([r.data], { type: 'audio/mpeg' }));
      setUrl(u);
    });
    return () => { if (u) URL.revokeObjectURL(u); setUrl(''); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, course.podcast?.at]);

  useEffect(() => api.podcast.onProgress((p) => { if (p.courseId === course.id) setProgress({ done: p.done, total: p.total }); }), [course.id]);
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

  const writeScript = async () => {
    if (!hasKey) { toast({ type: 'error', text: 'Ajoute ta clé Gemini dans Réglages.' }); return; }
    setBusy('script');
    try {
      update({ podcastLength: length });
      setScript(await podcastScript(course, { length }));
    } catch (e) { toast({ type: 'error', text: e.message }); }
    finally { setBusy(''); }
  };

  const makeAudio = async () => {
    if (!voiceA || !voiceB) { toast({ type: 'error', text: 'Choisis les deux voix.' }); return; }
    setBusy('audio');
    setProgress({ done: 0, total: script.lines.length });
    const r = await api.podcast.build({ courseId: course.id, engine, lines: script.lines, voices: { A: voiceA, B: voiceB }, modelId: isAz ? undefined : model });
    setBusy('');
    if (!r.ok) { toast({ type: 'error', text: r.error }); return; }
    await updateCourse(course.id, {
      podcast: { title: script.title, lines: script.lines, engine, voices: { A: voiceA, B: voiceB }, names: { A: nameOf(voiceA), B: nameOf(voiceB) }, model, length, at: Date.now(), seconds: r.seconds, bytes: r.bytes },
    });
    toast({ type: 'success', text: `Podcast prêt (${fmtTime(r.seconds)})` });
    setScript(null);
    setMode('listen');
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

  const P = course.podcast;
  const nameOf = (id) => voices.find((v) => v.id === id)?.name || [...(azure?.voices || []), ...(eleven?.voices || [])].find((v) => v.id === id)?.name || 'Voix';
  const savedName = (who) => P?.names?.[who] || nameOf(P?.voices?.[who]);
  const VoiceSelect = ({ value, onChange, label }) => (
    <select className="select" style={{ width: 280, maxWidth: '60%', flex: 'none' }} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} disabled={!voices.length || !!busy}>
      {voices.map((v) => <option key={v.id} value={v.id}>{voiceText(v)}</option>)}
    </select>
  );

  return (
    <div className="overlay" onClick={busy ? undefined : onClose}>
      <div className="modal podcast-modal" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && !busy && onClose()}>
        <div className="row between" style={{ marginBottom: 6 }}>
          <h2 style={{ margin: 0 }}><Icon name="mic" /> Podcast du cours</h2>
          <button className="btn icon sm ghost" onClick={onClose} disabled={!!busy} aria-label="Fermer"><Icon name="x" size={14} /></button>
        </div>

        {mode === 'listen' && P && (
          <>
            <div className="muted small" style={{ marginBottom: 10 }}>« {P.title} » · {fmtTime(P.seconds)} · {savedName('A')} et {savedName('B')}</div>
            {url ? <audio ref={audioRef} className="podcast-audio" controls src={url} /> : <div className="row"><span className="spinner" /> Chargement…</div>}
            <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
              <Segmented value={rate} onChange={setRate} options={[1, 1.25, 1.5].map((r) => ({ value: r, label: `× ${String(r).replace('.', ',')}` }))} />
              <button className="btn sm" onClick={save}><Icon name="download" size={14} /> Enregistrer le MP3</button>
              <button className="btn sm ghost" onClick={() => setShowText((s) => !s)}><Icon name="text" size={14} /> {showText ? 'Cacher le texte' : 'Lire le texte'}</button>
              <button className="btn sm ghost" onClick={() => setMode('create')}><Icon name="refresh" size={14} /> Refaire</button>
              <button className="btn sm ghost" onClick={remove}><Icon name="trash" size={14} /> Supprimer</button>
            </div>
            {showText && <Transcript lines={P.lines || []} names={{ A: savedName('A'), B: savedName('B') }} />}
            <div className="small muted" style={{ marginTop: 10 }}>Aussi disponible sur ton téléphone : Réglages › Téléphone.</div>
          </>
        )}

        {mode === 'create' && (
          <>
            {!loaded && <div className="row"><span className="spinner" /> Chargement des voix…</div>}
            {loaded && !engine && <div className="callout-box">Ajoute ta clé <b>Azure Speech</b> (gratuite) ou ElevenLabs dans <b>Réglages › Voix</b> pour créer des podcasts.</div>}
            {loaded && engine && (
              <>
                <p className="small muted" style={{ marginTop: 0 }}>Gemini écrit un dialogue fidèle à ton cours (sans rien inventer), puis deux voix {isAz ? 'Azure' : 'ElevenLabs'} le lisent. Tu relis le texte avant de {isAz ? 'créer l’audio' : 'dépenser des crédits'}.</p>
                {engines.length > 1 && (
                  <div className="setting-row">
                    <div className="grow"><div className="t">Voix</div><div className="d">{isAz ? 'Azure : gratuit jusqu’à 500 000 caractères par mois.' : 'ElevenLabs : utilise tes crédits.'}</div></div>
                    <Segmented value={engine} onChange={(v) => update({ podcastEngine: v })} options={[{ value: 'azure', label: 'Azure', disabled: !!busy }, { value: 'eleven', label: 'ElevenLabs', disabled: !!busy }]} />
                  </div>
                )}
                {eng?.error && <div className="small" style={{ color: 'var(--danger, #e5484d)' }}>{eng.error}</div>}
                <div className="setting-row">
                  <div className="grow"><div className="t">Longueur</div><div className="d">{(PODCAST_LENGTHS.find((l) => l.id === length) || PODCAST_LENGTHS[1]).minutes} minutes environ</div></div>
                  <Segmented value={length} onChange={setLength} options={PODCAST_LENGTHS.map((l) => ({ value: l.id, label: l.label, disabled: !!busy }))} />
                </div>
                <div className="setting-row">
                  <div className="grow"><div className="t">Animatrice</div><div className="d">Pose les questions</div></div>
                  <VoiceSelect value={voiceA} label="Voix de l'animatrice" onChange={(v) => setVoice('A', v)} />
                </div>
                <div className="setting-row">
                  <div className="grow"><div className="t">Experte</div><div className="d" style={voiceA === voiceB ? { color: 'var(--danger, #e5484d)' } : undefined}>{voiceA === voiceB ? 'Choisis deux voix différentes.' : 'Explique le cours'}</div></div>
                  <VoiceSelect value={voiceB} label="Voix de l'experte" onChange={(v) => setVoice('B', v)} />
                </div>

                {!script && (
                  <div className="row" style={{ marginTop: 12, gap: 8 }}>
                    <button className="btn primary" onClick={writeScript} disabled={!!busy}>{busy === 'script' ? <><span className="spinner" /> Écriture du dialogue…</> : <><Icon name="sparkles" size={14} /> Écrire le dialogue</>}</button>
                    {P && <button className="btn ghost" onClick={() => setMode('listen')} disabled={!!busy}>Revenir au podcast actuel</button>}
                  </div>
                )}

                {script && (
                  <>
                    <div className="row between" style={{ marginTop: 12 }}>
                      <b>« {script.title} »</b>
                      <span className="small muted">{script.lines.length} répliques · ≈ {chars(script.lines).toLocaleString('fr-FR')} caractères{isAz ? '' : ' de crédits'}</span>
                    </div>
                    <Transcript lines={script.lines} names={{ A: nameOf(voiceA), B: nameOf(voiceB) }} />
                    {busy === 'audio' ? (
                      <div style={{ marginTop: 12 }}>
                        <div className="small">Les voix lisent le dialogue… {progress.done} / {progress.total} répliques</div>
                        <div className="voice-meter"><span style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%`, background: 'var(--accent-grad, var(--accent))' }} /></div>
                      </div>
                    ) : (
                      <div className="row wrap" style={{ marginTop: 12, gap: 8 }}>
                        <button className="btn primary" onClick={makeAudio} disabled={voiceA === voiceB}><Icon name="mic" size={14} /> Créer l'audio</button>
                        <button className="btn ghost" onClick={writeScript} disabled={!!busy}><Icon name="refresh" size={14} /> Réécrire le dialogue</button>
                      </div>
                    )}
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
