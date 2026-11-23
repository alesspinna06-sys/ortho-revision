import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import { useToast } from './Toast.jsx';
import { api } from '../lib/bridge.js';

function Qr({ url, label }) {
  const [img, setImg] = useState('');
  useEffect(() => {
    let alive = true;
    if (!url) return undefined;
    import('qrcode').then((QR) => QR.toDataURL(url, { margin: 1, width: 360, errorCorrectionLevel: 'M', color: { dark: '#0b0c12', light: '#ffffff' } }))
      .then((d) => alive && setImg(d)).catch(() => {});
    return () => { alive = false; };
  }, [url]);
  return img ? <img src={img} alt={`QR code : ${label}`} width={160} height={160} style={{ borderRadius: 12, background: '#fff' }} /> : <div style={{ width: 160, height: 160 }} />;
}

function LinkCard({ title, help, url, toast }) {
  const copy = async () => {
    try { if (api.clipboard?.write) await api.clipboard.write(url); else await navigator.clipboard.writeText(url); toast({ type: 'success', text: 'Lien copié' }); }
    catch { toast({ type: 'error', text: 'Impossible de copier le lien.' }); }
  };
  return (
    <div className="phone-link">
      <Qr url={url} label={title} />
      <div className="grow" style={{ minWidth: 0 }}>
        <b>{title}</b>
        <div className="small muted" style={{ margin: '4px 0 8px' }}>{help}</div>
        <code className="phone-url">{url}</code>
        <div className="row" style={{ marginTop: 8 }}><button className="btn sm" onClick={copy}><Icon name="clipboard" size={14} /> Copier le lien</button></div>
      </div>
    </div>
  );
}

/** Réglages › Téléphone : lire ses cours et écouter ses podcasts sur le téléphone (Wi-Fi, ou partout avec Tailscale). */
export default function PhoneAccess() {
  const toast = useToast();
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState(false);
  const has = !!api.library;
  useEffect(() => { if (has) api.library.status().then(setSt); }, [has]);
  if (!has) return null;

  const toggle = async () => {
    setBusy(true);
    const r = await api.library.set(!st?.on);
    setBusy(false);
    setSt(r);
    if (!r.ok) toast({ type: 'error', text: r.error });
  };
  const reset = async () => {
    setBusy(true);
    const r = await api.library.reset();
    setBusy(false);
    setSt(r);
    toast(r.ok ? { type: 'success', text: "Nouveau lien créé : l'ancien ne marche plus." } : { type: 'error', text: r.error });
  };

  return (
    <>
      <div className="section-title">Téléphone</div>
      <div className="card">
        <div className="setting-row" style={{ paddingTop: 0 }}>
          <div className="option-icon"><Icon name="phone" /></div>
          <div className="grow">
            <div className="t">Mes cours et podcasts sur le téléphone</div>
            <div className="d">Lis tes cours, tes synthèses et écoute tes podcasts depuis le navigateur du téléphone, tant que ce logiciel est ouvert sur l'ordinateur. Le lien contient une clé secrète : ne le partage pas.</div>
          </div>
          <button className={`btn ${st?.on ? '' : 'primary'}`} onClick={toggle} disabled={busy}>{busy ? <span className="spinner" /> : null}{st?.on ? 'Couper' : 'Activer'}</button>
        </div>
        {st?.on && !st.running && <div className="small" style={{ color: 'var(--danger, #e5484d)' }}>L'accès n'a pas pu démarrer{st.error ? ` : ${st.error}` : '.'}</div>}
        {st?.on && st.running && (
          <>
            {st.lan && <LinkCard toast={toast} url={st.lan} title="À la maison (même Wi-Fi)" help="Scanne le QR code avec l'appareil photo du téléphone, puis ajoute la page à l'écran d'accueil (iPhone : Partager › Sur l'écran d'accueil ; Android : ⋮ › Ajouter à l'écran d'accueil)." />}
            {st.tailscale
              ? <LinkCard toast={toast} url={st.tailscale} title="Partout avec Tailscale" help="Marche depuis n'importe où (4G, autre Wi-Fi) si Tailscale est allumé sur le téléphone et sur cet ordinateur, avec le même compte." />
              : <div className="small muted" style={{ marginTop: 12 }}>Pour y accéder hors de chez toi : installe <b>Tailscale</b> sur cet ordinateur et sur le téléphone (même compte), puis reviens ici : un second lien apparaîtra.</div>}
            <div className="row" style={{ marginTop: 14, gap: 8 }}>
              <button className="btn sm ghost" onClick={() => api.library.status().then(setSt)}><Icon name="refresh" size={14} /> Actualiser les adresses</button>
              <button className="btn sm ghost" onClick={reset} disabled={busy} title="Le lien actuel cesse de marcher (utile si tu l'as partagé par erreur)"><Icon name="key" size={14} /> Nouveau lien secret</button>
            </div>
            <div className="small muted" style={{ marginTop: 10 }}>Au premier lancement, l'ordinateur peut demander d'autoriser le logiciel sur le réseau : accepte (sur Windows, pour les réseaux privés).</div>
          </>
        )}
      </div>
    </>
  );
}
