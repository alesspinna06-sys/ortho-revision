import { FOLDER_COLORS } from '../lib/db.js';

/** Couleur d'un dossier : palette, autre couleur (sélecteur libre) et pipette (si le système la permet). */
export default function ColorPicker({ value, onChange, label = 'Couleur' }) {
  const custom = !FOLDER_COLORS.includes(value);
  const canPick = typeof window !== 'undefined' && 'EyeDropper' in window;
  const pick = async () => {
    try {
      const r = await new window.EyeDropper().open();
      onChange(r.sRGBHex);
    } catch { /* pipette annulée */ }
  };
  return (
    <div className="color-picker">
      <div className="swatches" role="radiogroup" aria-label={label}>
        {FOLDER_COLORS.map((c) => (
          <button key={c} type="button" role="radio" aria-checked={value === c} aria-label={c}
            className={`swatch ${value === c ? 'on' : ''}`} style={{ background: c }}
            onClick={() => onChange(c)} />
        ))}
        <label className={`swatch ${custom ? 'on' : ''}`} title="Autre couleur"
          style={{ background: custom ? value : 'conic-gradient(#ef4444, #f59e0b, #22c55e, #06b6d4, #4f46e5, #ec4899, #ef4444)', position: 'relative', overflow: 'hidden', display: 'inline-block', cursor: 'pointer' }}>
          <input type="color" value={value} aria-label="Autre couleur"
            onChange={(e) => onChange(e.target.value)}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }} />
        </label>
        {canPick && <button type="button" className="btn sm" onClick={pick} title="Prendre une couleur à l'écran">Pipette</button>}
      </div>
    </div>
  );
}
