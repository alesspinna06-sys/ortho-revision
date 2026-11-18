import { useLayoutEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';

export function Switch({ on, onChange, label }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className={`switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)} />;
}

/** Onglets avec une pastille qui glisse (et rebondit légèrement) jusqu'à l'onglet choisi. */
export function Segmented({ value, onChange, options }) {
  const ref = useRef(null);
  const [pill, setPill] = useState(null);
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return undefined;
    const measure = () => {
      const el = box.querySelector('button.on');
      setPill(el ? { transform: `translate(${el.offsetLeft}px, ${el.offsetTop}px)`, width: el.offsetWidth, height: el.offsetHeight } : null);
    };
    measure();
    const ro = window.ResizeObserver ? new ResizeObserver(measure) : null;
    ro?.observe(box);
    return () => ro?.disconnect();
  }, [value, options.length]);
  return (
    <div className="segmented has-pill" role="tablist" ref={ref}>
      {pill && <span className="seg-pill" aria-hidden="true" style={pill} />}
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} className={value === o.value ? 'on' : ''} disabled={!!o.disabled} onClick={() => onChange(o.value)}>
          {o.icon && <Icon name={o.icon} size={15} />}
          {o.label}
          {o.count != null && <span className="count">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Empty({ icon = 'book', title, text, children }) {
  return (
    <div className="empty">
      <div className="big-icon"><Icon name={icon} size={30} /></div>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {children}
    </div>
  );
}

export function Ring({ value, size = 150, stroke = 12 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <defs>
          <linearGradient id="rg" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#4f6bff" /><stop offset="1" stopColor="#c35cf0" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--chip)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="url(#rg)" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(1, value)))} />
      </svg>
      <div className="val">{Math.round(value * 100)}%</div>
    </div>
  );
}

// Couleur stable par matière (pour les pastilles des cours)
const PALETTE = [
  'linear-gradient(135deg,#4f6bff,#8b5cf6)', 'linear-gradient(135deg,#06b6d4,#3b82f6)',
  'linear-gradient(135deg,#f472b6,#a855f7)', 'linear-gradient(135deg,#22c55e,#14b8a6)',
  'linear-gradient(135deg,#f59e0b,#ef4444)', 'linear-gradient(135deg,#6366f1,#ec4899)',
];
export function courseColor(key = '') {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export const SOURCE_ICON = { powerpoint: 'layers', word: 'file', excel: 'text', pdf: 'file', photo: 'camera', text: 'text', txt: 'text', md: 'text', csv: 'text', rtf: 'file' };

export function relDate(ts) {
  const d = Math.round((Date.now() - ts) / 86400000);
  if (d <= 0) return "aujourd'hui";
  if (d === 1) return 'hier';
  if (d < 7) return `il y a ${d} j`;
  return new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export function StatusChip({ course, job }) {
  if (job) return <span className="chip accent"><span className="spinner" style={{ width: 11, height: 11 }} /> {job.label.replace('…', '')}</span>;
  if (course.status === 'error') return <span className="chip danger"><Icon name="alert" size={12} /> Erreur</span>;
  if (course.status === 'ready') return <span className="chip success"><Icon name="check" size={12} /> Prêt</span>;
  return <span className="chip">Non généré</span>;
}
