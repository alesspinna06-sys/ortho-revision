import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { Segmented } from './common.jsx';
import { useToast } from './Toast.jsx';
import { useSettings } from '../lib/settings.jsx';
import { api } from '../lib/bridge.js';
import { ELEVEN_MODELS, DEFAULT_ELEVEN_MODEL, VOICE_SAMPLE, sortVoices, voiceLabel, audioUrl, DEFAULT_AZURE_VOICE, AZURE_REGIONS, sortAzureVoices, azureVoiceLabel } from '../lib/voice.js';

const fmt = (n) => (n ?? 0).toLocaleString('fr-FR');

/** Réglages › Voix : voix de l'ordinateur, Azure Speech (gratuit jusqu'à 500 000 caractères/mois) ou ElevenLabs. */
export default function VoiceSettings() {
  const { settings, update } = useSettings();
  const toast = useToast();
  const [info, setInfo] = useState({});
  const [key, setKey] = useState('');
  const [voices, setVoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [usage, setUsage] = useState(null);
  const [testing, setTesting] = useState(false);
  const [azInfo, setAzInfo] = useState({});
  const audioRef = useRef(null);
  const has = !!api.eleven;

  const loadAll = async () => {
    setLoading(true);
    const [v, u] = await Promise.all([api.eleven.voices(), api.eleven.usage()]);
    setLoading(false);
    if (v.ok) {
      const list = sortVoices(v.voices);
      setVoices(list);
      if (!settings.elevenVoice && list[0]) update({ elevenVoice: list[0].id, elevenVoiceName: list[0].name });
    } else toast({ type: 'error', text: v.error });
    setUsage(u.ok ? u : null);
  };

  useEffect(() => {
    if (!has) return;
    api.eleven.status().then((s) => { setInfo(s); if (s.hasKey) loadAll(); });
    api.azure?.status().then(setAzInfo);
    return () => { audioRef.current?.pause(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!has) return null; // version navigateur : seulement la voix de l'ordinateur

  const saveKey = async () => {
    const k = key.trim();
    const s = await api.eleven.setKey(k);
    setInfo(s);
    setKey('');
    if (k && s.hasKey) {
      toast({ type: 'success', text: 'Clé ElevenLabs enregistrée (chiffrée sur cet ordinateur)' });
      if (!azInfo.hasKey) update({ ttsEngine: 'eleven' }); // Azure reste le moteur par défaut s'il est configuré
      loadAll();
    } else {
      toast({ type: 'success', text: 'Clé ElevenLabs supprimée' });
      setVoices([]); setUsage(null);
      if (settings.ttsEngine === 'eleven') update({ ttsEngine: 'azure' });
    }
  };

  const tryVoice = async () => {
    if (!settings.elevenVoice) return;
    setTesting(true);
    const r = await api.eleven.speak({ text: VOICE_SAMPLE, voiceId: settings.elevenVoice, modelId: settings.elevenModel || DEFAULT_ELEVEN_MODEL });
    setTesting(false);
    if (!r.ok) { toast({ type: 'error', text: r.error }); return; }
    audioRef.current?.pause();
    const a = new Audio(audioUrl(r.audio, r.mime));
    audioRef.current = a;
    a.onended = () => URL.revokeObjectURL(a.src);
    a.play().catch(() => {});
    if (!r.cached) api.eleven.usage().then((u) => u.ok && setUsage(u));
  };

  const elevenOk = !!(info.hasKey && settings.elevenVoice);
  const azureOk = !!azInfo.hasKey;
  // Azure est le moteur par défaut ; sans clé Azure : ElevenLabs s'il est prêt, sinon la voix de l'ordinateur
  const wanted = settings.ttsEngine || 'azure';
  const engine = wanted === 'system' ? 'system'
    : wanted === 'eleven' ? (elevenOk ? 'eleven' : azureOk ? 'azure' : 'system')
    : azureOk ? 'azure' : elevenOk ? 'eleven' : 'system';
  const pct = usage?.limit ? Math.min(100, Math.round((usage.used / usage.limit) * 100)) : 0;

  return (
    <>
      <div className="section-title">Voix (lecture à voix haute)</div>
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="setting-row" style={{ borderTop: 0, paddingTop: 0 }}>
          <div className="grow"><div className="t">Voix utilisée pour « Écouter »</div><div className="d">Azure et ElevenLabs demandent une clé ; sans internet, sans crédits ou en cas d'erreur, la voix de l'ordinateur prend le relais.</div></div>
          <Segmented value={engine} onChange={(v) => update({ ttsEngine: v })}
            options={[{ value: 'system', label: "De l'ordinateur" }, { value: 'azure', label: 'Azure', disabled: !azureOk }, { value: 'eleven', label: 'ElevenLabs', disabled: !elevenOk }]} />
        </div>
      </div>
      {api.azure && <AzureSettings info={azInfo} setInfo={setAzInfo} audioRef={audioRef} />}
      <div className="card">
        <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
          <div className="option-icon"><Icon name="mic" /></div>
          <div className="grow">
            <div className="row"><b>Clé API ElevenLabs</b>{info.hasKey ? <span className="chip success"><Icon name="check" size={12} /> Configurée{info.fromEnv ? ' (variable ELEVENLABS_API_KEY)' : ''}</span> : <span className="chip">Facultative</span>}</div>
            <div className="small muted" style={{ margin: '4px 0 12px' }}>
              Des voix bien plus naturelles que celle de l'ordinateur pour « Écouter ». La clé est chiffrée et reste sur cet ordinateur. Chaque passage lu est gardé : le réécouter ne coûte aucun crédit.
            </div>
            <div className="row">
              <input className="input grow" type="password" placeholder={info.hasKey ? '•••••••••••••••• (laisser vide pour supprimer)' : 'sk_…'} value={key} onChange={(e) => setKey(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveKey()} aria-label="Clé API ElevenLabs" />
              <button className="btn primary" onClick={saveKey}>{key.trim() ? 'Enregistrer' : info.hasKey ? 'Supprimer' : 'Enregistrer'}</button>
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn sm" onClick={() => api.openExternal('https://elevenlabs.io/app/settings/api-keys')}><Icon name="link" size={14} /> Mes clés ElevenLabs</button>
            </div>
          </div>
        </div>


        {info.hasKey && (
          <>
            <div className="setting-row">
              <div className="grow"><div className="t">Voix ElevenLabs</div><div className="d">Les voix françaises sont en tête de liste. Ajoute-en d'autres depuis la bibliothèque de voix d'ElevenLabs, puis actualise.</div></div>
              <div className="row">
                <select className="select" style={{ width: 300 }} value={settings.elevenVoice || ''} disabled={loading || !voices.length}
                  onChange={(e) => { const v = voices.find((x) => x.id === e.target.value); update({ elevenVoice: e.target.value, elevenVoiceName: v?.name || '' }); }} aria-label="Voix ElevenLabs">
                  {!voices.length && <option value="">{loading ? 'Chargement des voix…' : 'Aucune voix'}</option>}
                  {voices.map((v) => <option key={v.id} value={v.id}>{voiceLabel(v)}</option>)}
                </select>
                <button className="btn sm" onClick={loadAll} disabled={loading} title="Actualiser la liste des voix et les crédits" aria-label="Actualiser">{loading ? <span className="spinner" /> : <Icon name="refresh" size={14} />}</button>
                <button className="btn sm" onClick={tryVoice} disabled={testing || !settings.elevenVoice}>{testing ? <span className="spinner" /> : <Icon name="play" size={14} />} Essayer</button>
              </div>
            </div>
            <div className="setting-row">
              <div className="grow"><div className="t">Qualité</div><div className="d">{(ELEVEN_MODELS.find((m) => m.id === (settings.elevenModel || DEFAULT_ELEVEN_MODEL)) || ELEVEN_MODELS[1]).d}</div></div>
              <Segmented value={settings.elevenModel || DEFAULT_ELEVEN_MODEL} onChange={(v) => update({ elevenModel: v })} options={ELEVEN_MODELS.map((m) => ({ value: m.id, label: m.label }))} />
            </div>
            {usage && usage.limit != null && (
              <div className="setting-row" style={{ display: 'block' }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <div className="t">Crédits du mois</div>
                  <div className="small muted">{fmt(usage.used)} / {fmt(usage.limit)} caractères{usage.resetAt ? ` · renouvelés le ${new Date(usage.resetAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}` : ''}</div>
                </div>
                <div className="voice-meter" aria-hidden="true"><span style={{ width: `${pct}%`, background: pct > 85 ? 'var(--danger, #e5484d)' : 'var(--accent-grad, var(--accent))' }} /></div>
                <div className="small muted" style={{ marginTop: 6 }}>Un cours entier peut demander plusieurs dizaines de milliers de caractères : écoute partie par partie si tes crédits sont limités.</div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

/** Bloc Azure Speech : clé + région (chiffrées), voix, essai, compteur du mois. */
function AzureSettings({ info, setInfo, audioRef }) {
  const { settings, update } = useSettings();
  const toast = useToast();
  const [key, setKey] = useState('');
  const [region, setRegion] = useState(info.region || 'westeurope');
  const [voices, setVoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [usage, setUsage] = useState(null);

  useEffect(() => { if (info.region) setRegion(info.region); }, [info.region]);

  const load = async () => {
    setLoading(true);
    const [v, u] = await Promise.all([api.azure.voices(), api.azure.usage()]);
    setLoading(false);
    setUsage(u.ok ? u : null);
    if (!v.ok) { toast({ type: 'error', text: v.error }); return false; }
    const list = sortAzureVoices(v.voices);
    setVoices(list);
    if (!settings.azureVoice || !list.some((x) => x.id === settings.azureVoice)) {
      const d = list.find((x) => x.id === DEFAULT_AZURE_VOICE) || list[0];
      if (d) update({ azureVoice: d.id, azureVoiceName: d.name });
    }
    return true;
  };
  useEffect(() => { if (info.hasKey) load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [info.hasKey]);

  const save = async () => {
    const k = key.trim();
    if (!k && !info.hasKey) { toast({ type: 'error', text: 'Colle la « Clé 1 » de ta ressource Speech.' }); return; }
    const s = await api.azure.setKey(k || (region !== info.region ? undefined : ''), region);
    setKey('');
    setInfo(s);
    if (s.hasKey) {
      const ok = await load();
      if (ok) {
        toast({ type: 'success', text: k ? 'Clé Azure enregistrée (chiffrée sur cet ordinateur)' : 'Région enregistrée' });
        if (k) update({ ttsEngine: 'azure' });
      }
    } else {
      toast({ type: 'success', text: 'Clé Azure supprimée' });
      setVoices([]); setUsage(null);
      if (settings.ttsEngine === 'azure') update({ ttsEngine: undefined });
    }
  };

  const tryVoice = async () => {
    setTesting(true);
    const r = await api.azure.speak({ text: VOICE_SAMPLE, voiceId: settings.azureVoice || DEFAULT_AZURE_VOICE });
    setTesting(false);
    if (!r.ok) { toast({ type: 'error', text: r.error }); return; }
    audioRef.current?.pause();
    const a = new Audio(audioUrl(r.audio, r.mime));
    audioRef.current = a;
    a.onended = () => URL.revokeObjectURL(a.src);
    a.play().catch(() => {});
    api.azure.usage().then((u) => u.ok && setUsage(u));
  };

  const pct = usage ? Math.min(100, Math.round((usage.chars / usage.limit) * 100)) : 0;
  const keyChanged = !!key.trim() || (info.hasKey && region !== info.region);

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
        <div className="option-icon"><Icon name="mic" /></div>
        <div className="grow">
          <div className="row"><b>Azure Speech (Microsoft)</b>{info.hasKey ? <span className="chip success"><Icon name="check" size={12} /> Configurée{info.fromEnv ? ' (variable AZURE_SPEECH_KEY)' : ''}</span> : <span className="chip">Conseillé · gratuit</span>}</div>
          <div className="small muted" style={{ margin: '4px 0 12px' }}>
            Voix neuronales très naturelles (Denise, Henri, Vivienne…). L'offre gratuite « Free F0 » donne 500 000 caractères par mois, soit une vingtaine de cours lus en entier. Colle la <b>Clé 1</b> de ta ressource Speech et choisis sa <b>région</b> (onglet « Clés et point de terminaison » du portail Azure). La clé est chiffrée et reste sur cet ordinateur.
          </div>
          <div className="row wrap" style={{ gap: 8 }}>
            <input className="input grow" style={{ minWidth: 220 }} type="password" placeholder={info.hasKey ? '•••••••••••••••• (laisser vide pour garder ou supprimer)' : 'Clé 1'} value={key} onChange={(e) => setKey(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} aria-label="Clé Azure Speech" />
            <select className="select" style={{ width: 230 }} value={region} onChange={(e) => setRegion(e.target.value)} aria-label="Région Azure">
              {!AZURE_REGIONS.some((r) => r.id === region) && <option value={region}>{region}</option>}
              {AZURE_REGIONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
            <button className="btn primary" onClick={save}>{keyChanged || !info.hasKey ? 'Enregistrer' : 'Supprimer'}</button>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn sm" onClick={() => api.openExternal('https://portal.azure.com/#view/Microsoft_Azure_ProjectOxford/CognitiveServicesHub/~/SpeechServices')}><Icon name="link" size={14} /> Mes ressources Speech</button>
          </div>
        </div>
      </div>

      {info.hasKey && (
        <>
          <div className="setting-row" style={{ marginTop: 10 }}>
            <div className="grow"><div className="t">Voix Azure</div><div className="d">Voix de France en tête, puis Belgique, Suisse, Canada et voix multilingues.</div></div>
            <div className="row">
              <select className="select" style={{ width: 300 }} value={settings.azureVoice || ''} disabled={loading || !voices.length}
                onChange={(e) => { const v = voices.find((x) => x.id === e.target.value); update({ azureVoice: e.target.value, azureVoiceName: v?.name || '' }); }} aria-label="Voix Azure">
                {!voices.length && <option value="">{loading ? 'Chargement des voix…' : 'Aucune voix'}</option>}
                {voices.map((v) => <option key={v.id} value={v.id}>{azureVoiceLabel(v)}</option>)}
              </select>
              <button className="btn sm" onClick={load} disabled={loading} title="Actualiser la liste des voix" aria-label="Actualiser">{loading ? <span className="spinner" /> : <Icon name="refresh" size={14} />}</button>
              <button className="btn sm" onClick={tryVoice} disabled={testing || !voices.length}>{testing ? <span className="spinner" /> : <Icon name="play" size={14} />} Essayer</button>
            </div>
          </div>
          {usage && (
            <div className="setting-row" style={{ display: 'block' }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div className="t">Caractères lus ce mois-ci</div>
                <div className="small muted">{fmt(usage.chars)} / {fmt(usage.limit)}</div>
              </div>
              <div className="voice-meter" aria-hidden="true"><span style={{ width: `${pct}%`, background: pct > 85 ? 'var(--danger, #e5484d)' : 'var(--accent-grad, var(--accent))' }} /></div>
              <div className="small muted" style={{ marginTop: 6 }}>Compté par le logiciel sur cet ordinateur (les passages déjà lus, gardés en mémoire, ne comptent pas). Le compteur officiel est dans le portail Azure, onglet « Métriques ».</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
