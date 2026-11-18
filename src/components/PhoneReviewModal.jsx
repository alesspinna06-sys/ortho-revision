import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon.jsx';
import { api } from '../lib/bridge.js';
import { getCard, putCard, refreshViews } from '../lib/db.js';
import { schedule, markActivity } from '../lib/srs.js';

/**
 * Révision des flashcards sur le téléphone : l'ordinateur envoie les cartes,
 * le téléphone renvoie chaque note, appliquée ici à la répétition espacée.
 * La séance reste ouverte tant que cette fenêtre est affichée.
 */
export default function PhoneReviewModal({ cards, title, courseNames = {}, onClose }) {
  const [state, setState] = useState({ loading: true });
  const [graded, setGraded] = useState({ n: 0, again: 0 });
  const seen = useRef(new Set());

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await api.phone.review({
        title,
        cards: cards.map((c) => ({ id: c.id, front: c.front, back: c.back, category: c.category, course: courseNames[c.courseId] || '' })),
      });
      if (!alive) return;
      if (!res.ok) return setState({ error: res.error });
      const QR = await import('qrcode');
      const img = await QR.toDataURL(res.url, { margin: 1, width: 420, errorCorrectionLevel: 'M', color: { dark: '#0b0c12', light: '#ffffff' } });
      if (alive) setState({ url: res.url, img });
    })();
    const off = api.phone.onGrade(async ({ id, grade }) => {
      const card = await getCard(id);
      if (!card) return;
      await putCard({ ...card, srs: schedule(card.srs, grade) }, { silent: true });
      markActivity();
      seen.current.add(id);
      setGraded((g) => ({ n: g.n + 1, again: g.again + (grade === 0 ? 1 : 0) }));
    });
    return () => { alive = false; off(); api.phone.reviewStop(); refreshViews(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center' }}>
        <div className="row between">
          <span className="chip accent"><Icon name="phone" size={12} /> Réviser sur mon téléphone</span>
          <button className="btn icon sm ghost" onClick={onClose} aria-label="Fermer"><Icon name="x" /></button>
        </div>
        <h2 style={{ fontSize: 23, marginTop: 14 }}>Scanne avec l'appareil photo</h2>
        <p className="muted" style={{ margin: '6px 0 0' }}>{cards.length} carte{cards.length > 1 ? 's' : ''} · {title}</p>

        {state.loading && <div className="qr shimmer" style={{ background: 'var(--chip)' }} />}
        {state.img && <div className="qr"><img src={state.img} alt="QR code de révision" /></div>}
        {state.error && (
          <div className="q-context" style={{ margin: '20px 0', textAlign: 'left', borderColor: 'rgba(239,68,68,.3)', background: 'rgba(239,68,68,.08)' }}>
            <b>Impossible de démarrer la séance.</b><br /><span className="small">{state.error}</span>
          </div>
        )}
        {state.url && <div className="code-url selectable">{state.url}</div>}

        <div className="row" style={{ justifyContent: 'center', marginTop: 16 }}>
          {graded.n > 0
            ? <span className="chip success"><Icon name="check" size={12} /> {graded.n} réponse{graded.n > 1 ? 's' : ''} enregistrée{graded.n > 1 ? 's' : ''}{graded.again ? ` · ${graded.again} à revoir` : ''}</span>
            : state.url && <span className="chip"><span className="spinner" style={{ width: 11, height: 11 }} /> En attente du téléphone…</span>}
        </div>
        <p className="faint small" style={{ marginTop: 16, marginBottom: 0 }}>
          Même Wi-Fi pour le téléphone et l'ordinateur. Garde cette fenêtre ouverte pendant la révision : ta progression est enregistrée ici, carte par carte.
        </p>
        <button className="btn primary" style={{ marginTop: 18, width: '100%' }} onClick={onClose}>Terminer la séance</button>
      </div>
    </div>,
    document.body,
  );
}
