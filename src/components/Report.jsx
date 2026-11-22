import { useState } from 'react';
import Icon from './Icon.jsx';
import Markdown from './Markdown.jsx';
import { Ring } from './common.jsx';

/** Rapport de correction : note sur 20, grille, points forts / faibles, corrigé masquable. */
export default function Report({ r, corrigeLabel = 'Correction détaillée' }) {
  const [open, setOpen] = useState(false);
  if (!r) return null;
  const note = Math.max(0, Math.min(20, Number(r.note) || 0));
  const fr = (x) => String(Math.round(Number(x) * 2) / 2).replace('.', ',');
  return (
    <div className="stack view-enter" style={{ gap: 16 }}>
      <div className="card row" style={{ gap: 26, alignItems: 'center' }}>
        <div style={{ position: 'relative' }}>
          <Ring value={note / 20} size={124} stroke={11} />
          <div className="grade-over">{fr(note)}<small>/20</small></div>
        </div>
        <div className="grow selectable" style={{ lineHeight: 1.65 }}>{r.appreciation}</div>
      </div>
      {r.criteres?.length > 0 && (
        <div className="card">
          <b>Grille d'évaluation</b>
          <div className="stack" style={{ gap: 12, marginTop: 12 }}>
            {r.criteres.map((c, i) => (
              <div key={i}>
                <div className="row between"><span style={{ fontWeight: 600 }}>{c.critere}</span><span className="chip">{fr(c.note)}/{c.max}</span></div>
                <div className="progress" style={{ margin: '8px 0 6px' }}><i style={{ transform: `scaleX(${c.max ? c.note / c.max : 0})` }} /></div>
                <div className="small muted selectable">{c.commentaire}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="grid grid-2">
        {r.pointsForts?.length > 0 && <List title="Points forts" icon="check" tone="success" items={r.pointsForts} />}
        {r.pointsFaibles?.length > 0 && <List title="À améliorer" icon="alert" tone="warning" items={r.pointsFaibles} />}
      </div>
      {r.conseils?.length > 0 && <List title="Conseils" icon="target" tone="accent" items={r.conseils} />}
      {r.corrige && (
        <div className="card">
          <div className="row between"><b>{corrigeLabel}</b><button className="btn sm" onClick={() => setOpen((o) => !o)}>{open ? 'Masquer' : 'Afficher'}</button></div>
          {open && <div style={{ marginTop: 14 }}><Markdown text={r.corrige} /></div>}
        </div>
      )}
      <p className="faint small" style={{ textAlign: 'center', margin: 0 }}>Correction indicative produite par l'IA : elle aide à progresser mais ne remplace pas l'avis d'un enseignant.</p>
    </div>
  );
}

function List({ title, icon, tone, items }) {
  return (
    <div className="card">
      <span className={`chip ${tone}`}><Icon name={icon} size={12} /> {title}</span>
      <ul className="clean-list selectable" style={{ marginTop: 10 }}>{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
    </div>
  );
}
