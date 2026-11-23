import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon.jsx';
import { api } from '../lib/bridge.js';

/** Affiche un QR code : le téléphone l'ouvre et envoie ses photos à l'app. */
export default function QrModal({ onClose, received }) {
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await api.phone.start();
      if (!alive) return;
      if (!res.ok) return setState({ error: res.error });
      const QR = await import('qrcode');
      const img = await QR.toDataURL(res.url, { margin: 1, width: 420, errorCorrectionLevel: 'M', color: { dark: '#0b0c12', light: '#ffffff' } });
      if (alive) setState({ url: res.url, img });
    })();
    return () => { alive = false; api.phone.stop(); };
  }, []);

  return createPortal(
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center' }}>
        <div className="row between">
          <span className="chip accent"><Icon name="phone" size={12} /> Depuis ton téléphone</span>
          <button className="btn icon sm ghost" onClick={onClose} aria-label="Fermer"><Icon name="x" /></button>
        </div>
        <h2 style={{ fontSize: 24, marginTop: 14 }}>Scanne avec l'appareil photo</h2>
        <p className="muted" style={{ margin: '6px 0 0' }}>Ouvre le lien, photographie tes pages : elles arrivent ici instantanément.</p>

        {state.loading && <div className="qr shimmer" style={{ background: 'var(--chip)' }} />}
        {state.img && <div className="qr"><img src={state.img} alt="QR code d'envoi" /></div>}
        {state.error && (
          <div className="q-context" style={{ margin: '20px 0', textAlign: 'left', borderColor: 'rgba(239,68,68,.3)', background: 'rgba(239,68,68,.08)' }}>
            <b>Impossible de démarrer l'envoi.</b><br /><span className="small">{state.error}</span>
          </div>
        )}
        {state.url && <div className="code-url selectable">{state.url}</div>}

        <div className="row" style={{ justifyContent: 'center', marginTop: 18 }}>
          {received > 0
            ? <span className="chip success"><Icon name="check" size={12} /> {received} photo{received > 1 ? 's' : ''} reçue{received > 1 ? 's' : ''}</span>
            : state.url && <span className="chip"><span className="spinner" style={{ width: 11, height: 11 }} /> En attente de photos…</span>}
        </div>
        <p className="faint small" style={{ marginTop: 16, marginBottom: 0 }}>
          Le téléphone et l'ordinateur doivent être sur le même Wi-Fi. Au premier lancement, autorise l'accès réseau si le pare-feu le demande.
        </p>
        <button className="btn primary" style={{ marginTop: 18, width: '100%' }} onClick={onClose}>Terminé</button>
      </div>
    </div>,
    document.body
  );
}
