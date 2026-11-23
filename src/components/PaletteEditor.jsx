import { useState } from 'react';
import Icon from './Icon.jsx';
import { Segmented } from './common.jsx';
import { useSettings } from '../lib/settings.jsx';
import { DEFAULT_CUSTOM, fromPalette, contrast, validHex, mix } from '../lib/customPalette.js';

const FIELDS = [
  { key: 'bg', label: 'Fond', hint: "Couleur de fond de toute l'application" },
  { key: 'surface', label: 'Cartes et fenêtres', hint: 'Cartes, menus, fenêtres' },
  { key: 'text', label: 'Texte', hint: 'Les titres et le texte' },
  { key: 'accent', label: 'Couleur principale', hint: 'Boutons, onglets, liens, éléments actifs' },
  { key: 'accent2', label: 'Deuxième couleur', hint: 'Fin des dégradés et des halos' },
];
const canPick = typeof window !== 'undefined' && 'EyeDropper' in window;
const fmt = (n) => n.toFixed(1).replace('.', ',');

/** Une couleur : nuancier du système, code hexadécimal et pipette. */
function ColorField({ label, hint, value, onChange }) {
  const [txt, setTxt] = useState(value);
  const [prev, setPrev] = useState(value);
  if (value !== prev) { setPrev(value); setTxt(value); }
  const pick = async () => { try { const r = await new window.EyeDropper().open(); onChange(r.sRGBHex); } catch { /* annulé */ } };
  return (
    <div className="pal-field">
      <label className="pal-swatch" style={{ background: value }} title="Choisir la couleur">
        <input type="color" value={validHex(value) ? value : '#000000'} onChange={(e) => onChange(e.target.value)} aria-label={label} />
      </label>
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="t small" style={{ fontWeight: 600 }}>{label}</div>
        <div className="faint small">{hint}</div>
      </div>
      <input className="input pal-hex" value={txt} maxLength={7} spellCheck={false} aria-label={`${label} (code)`}
        onChange={(e) => { const v = e.target.value.trim(); setTxt(v); const h = v.startsWith('#') ? v : `#${v}`; if (/^#[0-9a-f]{6}$/i.test(h)) onChange(h.toLowerCase()); }} />
      {canPick && <button type="button" className="btn icon sm ghost" onClick={pick} title="Pipette : prendre une couleur à l'écran" aria-label="Pipette"><Icon name="target" size={14} /></button>}
    </div>
  );
}

/**
 * Palette personnalisée (Réglages › Apparence) : chaque couleur se choisit à la main,
 * l'interface se met à jour en direct ; on peut garder plusieurs palettes (« Mes palettes »).
 */
export default function PaletteEditor() {
  const { settings, update } = useSettings();
  const active = settings.palette === 'custom';
  const cp = { ...DEFAULT_CUSTOM, ...(settings.customPalette || {}) };
  const mine = settings.myPalettes || [];
  const [name, setName] = useState('');
  const [open, setOpen] = useState(active);

  const set = (patch) => update({ customPalette: { ...cp, ...patch }, palette: 'custom' });
  const start = () => { update({ customPalette: active ? cp : fromPalette(settings.palette || 'default'), palette: 'custom' }); setOpen(true); };
  const setMode = (mode) => {
    if (mode === cp.mode) return;
    // Changer de mode : fond, cartes et texte repartent d'une base lisible, les couleurs d'accent sont gardées
    set(mode === 'dark'
      ? { mode, bg: mix(cp.accent, '#000000', 0.88), surface: mix(cp.accent, '#000000', 0.8), text: '#ececf3' }
      : { mode, bg: mix(cp.accent, '#ffffff', 0.93), surface: '#ffffff', text: '#1c1b22' });
  };
  const cBg = contrast(cp.text, cp.bg);
  const cSurf = contrast(cp.text, cp.surface);
  // Corriger : texte clair ou foncé selon ce qui se lit le mieux ; si les cartes restent illisibles, elles suivent le fond
  const fixText = () => {
    const score = (c, surf) => Math.min(contrast(c, cp.bg), contrast(c, surf));
    const text = ['#16151c', '#f4f4f8'].sort((a, b) => score(b, cp.surface) - score(a, cp.surface))[0];
    let { surface } = cp;
    if (score(text, surface) < 4.5) surface = text === '#f4f4f8' ? mix(cp.bg, '#ffffff', 0.07) : '#ffffff';
    set({ text, surface, mode: text === '#f4f4f8' ? 'dark' : 'light' });
  };
  const save = () => {
    const n = (name || cp.name || 'Ma palette').trim().slice(0, 40);
    const entry = { ...cp, name: n, id: `p${Date.now().toString(36)}` };
    update({ myPalettes: [...mine.filter((p) => p.name !== n), entry].slice(-12), customPalette: entry, palette: 'custom' });
    setName('');
  };
  const load = (p) => { const { id, ...rest } = p; update({ customPalette: rest, palette: 'custom' }); setOpen(true); };
  const remove = (id) => update({ myPalettes: mine.filter((p) => p.id !== id) });

  return (
    <div className="setting-row" style={{ display: 'block' }}>
      <div className="row between wrap" style={{ gap: 8 }}>
        <div>
          <div className="t">Palette personnalisée</div>
          <div className="d">Choisis toi-même chaque couleur : le fond, les cartes, le texte et les couleurs d'accent.</div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          {active && <button type="button" className="btn sm ghost" onClick={() => setOpen((o) => !o)}>{open ? 'Replier' : 'Modifier'}</button>}
          {!active && <button type="button" className="btn sm accent" onClick={start}><Icon name="pen" size={14} /> Créer ma palette</button>}
        </div>
      </div>

      {mine.length > 0 && (
        <div className="pal-mine" role="list" aria-label="Mes palettes">
          {mine.map((p) => {
            const on = active && cp.name === p.name && cp.accent === p.accent && cp.bg === p.bg;
            return (
              <span key={p.id} className={`pal-chip ${on ? 'on' : ''}`} role="listitem">
                <button type="button" onClick={() => load(p)} title={`Utiliser « ${p.name} »`}>
                  <span className="pal-dots"><i style={{ background: p.bg }} /><i style={{ background: p.surface }} /><i style={{ background: p.accent }} /><i style={{ background: p.accent2 }} /></span>
                  {p.name}
                </button>
                <button type="button" className="pal-x" onClick={() => remove(p.id)} aria-label={`Supprimer « ${p.name} »`} title="Supprimer">×</button>
              </span>
            );
          })}
        </div>
      )}

      {active && open && (
        <div className="pal-editor">
          <div className="row between wrap" style={{ gap: 10 }}>
            <Segmented value={cp.mode} onChange={setMode} options={[{ value: 'light', label: 'Clair', icon: 'sun' }, { value: 'dark', label: 'Sombre', icon: 'moon' }]} />
            <button type="button" className="btn sm ghost" onClick={() => update({ customPalette: fromPalette('default'), palette: 'custom' })} title="Repartir de la palette Classique">Réinitialiser</button>
          </div>
          <div className="pal-fields">
            {FIELDS.map((f) => <ColorField key={f.key} label={f.label} hint={f.hint} value={cp[f.key]} onChange={(v) => set({ [f.key]: v })} />)}
          </div>
          <div className="row wrap" style={{ gap: 16, marginTop: 12 }}>
            <label className="row small" style={{ gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={cp.gradient !== false} onChange={(e) => set({ gradient: e.target.checked })} /> Dégradé sur les boutons
            </label>
            <span className="row small" style={{ gap: 8 }}>Halos de couleur du fond
              <Segmented value={cp.glow || 'doux'} onChange={(v) => set({ glow: v })} options={[{ value: 'aucun', label: 'Aucun' }, { value: 'doux', label: 'Doux' }, { value: 'vif', label: 'Vifs' }]} />
            </span>
          </div>
          {(cBg < 4.5 || cSurf < 4.5) && (
            <div className="pal-warn small">
              <Icon name="alert" size={14} />
              <span className="grow">Texte peu lisible : contraste {fmt(Math.min(cBg, cSurf))} : 1 {cSurf < cBg ? 'sur les cartes' : 'sur le fond'} (vise au moins 4,5 : 1).</span>
              <button type="button" className="btn sm" onClick={fixText}>Corriger</button>
            </div>
          )}
          <div className="pal-preview" aria-hidden="true">
            <div className="pal-preview-card">
              <b>Aperçu</b>
              <span className="faint small">Texte secondaire · 12 cartes à revoir</span>
              <span className="row" style={{ gap: 6, marginTop: 8 }}>
                <span className="btn sm accent">Bouton</span><span className="btn sm">Autre</span><span className="chip accent">Étiquette</span>
              </span>
            </div>
          </div>
          <div className="row wrap" style={{ gap: 8, marginTop: 12 }}>
            <input className="input" style={{ width: 220 }} placeholder={cp.name || 'Nom de la palette'} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} aria-label="Nom de la palette" />
            <button type="button" className="btn sm" onClick={save}><Icon name="bookmark" size={14} /> Garder dans « Mes palettes »</button>
          </div>
        </div>
      )}
    </div>
  );
}
