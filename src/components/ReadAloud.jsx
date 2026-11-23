import { texToSpeech } from '../lib/math.js';
import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { useToast } from './Toast.jsx';
import { useSettings } from '../lib/settings.jsx';
import { api } from '../lib/bridge.js';
import { DEFAULT_ELEVEN_MODEL, audioUrl, DEFAULT_AZURE_VOICE } from '../lib/voice.js';

// Texte lisible à voix haute : sans balises Markdown ni repères de schéma
export function speakable(md = '') {
  return texToSpeech(md)
    .replace(/\[([^\]\n]+)\]\((https?:[^)]+)\)/g, '$1')
    .replace(/^\s*\[Image \d+\]\s*$/gm, '')
    .replace(/\[\[schema:\d+\]\]/g, '')
    .replace(/^#{1,6}\s*(.*)$/gm, '$1.')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/^>\[(?:def|ex|retenir|piege|methode)\]\s?/gim, '')
    .replace(/^>\+?\s?/gm, '')
    .replace(/@@|\^\^/g, '')
    .replace(/\{\+\s?|\s?\+\}/g, '')
    .replace(/==|\*\*|\*|`/g, '')
    .replace(/→/g, ', donc ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

// Morceaux de texte : courts pour la voix de l'ordinateur (Chromium coupe les lectures longues),
// plus longs pour ElevenLabs (phrasé plus naturel, moins de demandes).
function chunks(text, max = 220) {
  const out = [];
  let cur = '';
  const flush = () => { if (cur.trim()) out.push(cur.trim()); cur = ''; };
  text.split(/\n+/).forEach((line) => {
    const sentences = line.match(/[^.!?;:]+[.!?;:]*/g) || [line];
    sentences.forEach((s) => {
      if ((cur + s).length > max && cur) flush();
      cur += s;
    });
    if (max <= 300) flush(); else cur += '\n';
  });
  flush();
  return out.filter(Boolean);
}

function frenchVoice() {
  const voices = window.speechSynthesis.getVoices().filter((v) => /^fr/i.test(v.lang));
  const prefer = [/amélie|amelie|audrey|thomas|marie|denise|henri|julie|paul|google/i];
  return voices.find((v) => /fr-FR/i.test(v.lang) && prefer[0].test(v.name)) || voices.find((v) => /fr-FR/i.test(v.lang)) || voices[0] || null;
}

/**
 * Bouton « Écouter » : lit la fiche avec la voix choisie dans Réglages › Voix.
 * ElevenLabs (voix naturelle, morceau suivant préparé pendant la lecture) ou voix de l'ordinateur
 * (gratuite, sans internet) — qui prend le relais si ElevenLabs n'est pas disponible.
 */
export default function ReadAloud({ text }) {
  const { settings } = useSettings();
  const toast = useToast();
  const sysOk = typeof window !== 'undefined' && 'speechSynthesis' in window;
  // Voix en ligne : Azure ou ElevenLabs (le mode interne s'appelle 'eleven' pour les deux)
  // Azure par défaut (dès qu'une clé Azure est enregistrée) ; « De l'ordinateur » ou ElevenLabs si choisis dans Réglages › Voix
  const [azureKey, setAzureKey] = useState(false);
  useEffect(() => { let alive = true; api.azure?.status().then((s) => alive && setAzureKey(!!s.hasKey)).catch(() => {}); return () => { alive = false; }; }, []);
  const wanted = settings.ttsEngine || 'azure';
  const elevenReady = !!api.eleven && !!settings.elevenVoice;
  const azureOk = !!api.azure && azureKey && wanted === 'azure';
  const elevenOk = azureOk || (elevenReady && (wanted === 'eleven' || (wanted === 'azure' && !azureKey)));
  const [state, setState] = useState('idle'); // idle | loading | playing | paused
  const [rate, setRate] = useState(() => { try { return Number(localStorage.getItem('read-rate')) || 1; } catch { return 1; } });
  const queue = useRef([]);
  const idx = useRef(0);
  const stopped = useRef(true);
  const mode = useRef('system'); // moteur de la lecture en cours
  const audio = useRef(null);
  const pending = useRef(new Map()); // n° du morceau → promesse de son adresse audio
  const urls = useRef([]);
  const paused = useRef(false); // pause demandée (même entre deux morceaux)
  const rateRef = useRef(rate);
  rateRef.current = rate;

  const cleanup = () => {
    audio.current?.pause();
    audio.current = null;
    urls.current.forEach((u) => URL.revokeObjectURL(u));
    urls.current = [];
    pending.current = new Map();
  };
  useEffect(() => () => { stopped.current = true; if (sysOk) window.speechSynthesis.cancel(); cleanup(); }, [sysOk]);
  if (!sysOk && !elevenOk) return null;

  // ---------- voix de l'ordinateur
  const speakNext = () => {
    if (stopped.current) return;
    const part = queue.current[idx.current];
    if (!part) { stopped.current = true; setState('idle'); return; }
    const u = new SpeechSynthesisUtterance(part);
    const v = frenchVoice();
    if (v) u.voice = v;
    u.lang = v?.lang || 'fr-FR';
    u.rate = rateRef.current;
    u.onend = () => { idx.current += 1; speakNext(); };
    u.onerror = () => { idx.current += 1; speakNext(); };
    window.speechSynthesis.speak(u);
  };
  const startSystem = (parts) => {
    mode.current = 'system';
    queue.current = parts;
    idx.current = 0;
    setState('playing');
    if (!window.speechSynthesis.getVoices().length) setTimeout(speakNext, 300); else speakNext();
  };

  // ---------- ElevenLabs
  const fetchPart = (i) => {
    if (i >= queue.current.length) return Promise.resolve(null);
    if (!pending.current.has(i)) {
      const p = (azureOk
        ? api.azure.speak({ text: queue.current[i], voiceId: settings.azureVoice || DEFAULT_AZURE_VOICE })
        : api.eleven.speak({ text: queue.current[i], voiceId: settings.elevenVoice, modelId: settings.elevenModel || DEFAULT_ELEVEN_MODEL }))
        .then((r) => {
          if (!r.ok) throw new Error(r.error);
          const url = audioUrl(r.audio, r.mime);
          urls.current.push(url);
          return url;
        });
      p.catch(() => {});
      pending.current.set(i, p);
    }
    return pending.current.get(i);
  };
  const playPart = async (i) => {
    if (stopped.current) return;
    if (i >= queue.current.length) { stopped.current = true; cleanup(); setState('idle'); return; }
    idx.current = i;
    let url;
    try {
      if (!pending.current.has(i)) setState('loading');
      url = await fetchPart(i);
    } catch (e) {
      if (stopped.current) return;
      // ElevenLabs indisponible (crédits, clé, réseau) : la voix de l'ordinateur termine la lecture
      const rest = queue.current.slice(i).join('\n');
      cleanup();
      if (sysOk) {
        toast({ type: 'error', text: /relais/.test(e.message) ? e.message : `${e.message} Lecture avec la voix de l'ordinateur.` });
        startSystem(chunks(rest));
      } else { toast({ type: 'error', text: e.message }); stopped.current = true; setState('idle'); }
      return;
    }
    if (stopped.current) return;
    const a = audio.current || new Audio();
    audio.current = a;
    a.src = url;
    a.playbackRate = rateRef.current;
    a.onended = () => playPart(i + 1);
    fetchPart(i + 1); // prépare le morceau suivant pendant la lecture
    if (paused.current) { setState('paused'); return; } // en pause : le morceau attend « Reprendre »
    try { await a.play(); } catch { /* lecture interrompue */ }
    if (stopped.current) return;
    if (paused.current) { a.pause(); setState('paused'); return; }
    setState('playing');
  };

  // ---------- commandes
  const play = () => {
    if (state === 'paused') {
      paused.current = false;
      if (mode.current === 'eleven') {
        const a = audio.current;
        if (a && a.src && !a.ended) { a.play().catch(() => {}); setState('playing'); } else playPart(idx.current);
      } else { window.speechSynthesis.resume(); setState('playing'); }
      return;
    }
    paused.current = false;
    if (sysOk) window.speechSynthesis.cancel();
    cleanup();
    stopped.current = false;
    const clean = speakable(text);
    if (elevenOk) {
      mode.current = 'eleven';
      queue.current = chunks(clean, 1800);
      playPart(0);
    } else startSystem(chunks(clean));
  };
  const pause = () => {
    paused.current = true;
    if (mode.current === 'eleven') audio.current?.pause();
    else window.speechSynthesis.pause();
    setState('paused');
  };
  const stop = () => {
    stopped.current = true;
    paused.current = false;
    if (sysOk) window.speechSynthesis.cancel();
    cleanup();
    setState('idle');
  };
  const changeRate = (r) => {
    setRate(r);
    rateRef.current = r;
    try { localStorage.setItem('read-rate', String(r)); } catch { /* indisponible */ }
    if (mode.current === 'eleven' && audio.current) audio.current.playbackRate = r; // sans couper la lecture
    else if (state !== 'idle') stop();
  };

  const label = azureOk ? `Lire la fiche avec la voix ${settings.azureVoiceName || 'Azure'}` : elevenOk ? `Lire la fiche avec la voix ${settings.elevenVoiceName || 'ElevenLabs'}` : "Lire la fiche avec la voix de l'ordinateur";
  return (
    <div className="read-aloud" role="group" aria-label="Lecture à voix haute">
      {state === 'loading'
        ? <button className="btn sm ghost" disabled title="La voix se prépare"><span className="spinner" /> Préparation…</button>
        : state === 'playing'
          ? <button className="btn sm ghost" onClick={pause} title="Pause"><Icon name="pause" size={14} /> Pause</button>
          : <button className="btn sm ghost" onClick={play} title={label}><Icon name="play" size={14} /> {state === 'paused' ? 'Reprendre' : 'Écouter'}</button>}
      {state !== 'idle' && <button className="btn icon sm ghost" onClick={stop} title="Arrêter" aria-label="Arrêter la lecture"><Icon name="x" size={14} /></button>}
      {state !== 'idle' && (
        <select className="select sm-select" style={{ width: 82 }} value={rate} onChange={(e) => changeRate(Number(e.target.value))} aria-label="Vitesse de lecture">
          {[0.8, 1, 1.2, 1.4].map((r) => <option key={r} value={r}>× {String(r).replace('.', ',')}</option>)}
        </select>
      )}
    </div>
  );
}
