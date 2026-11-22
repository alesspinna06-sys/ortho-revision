// Extras de l'apparence « Moderne » : parties qui apparaissent au défilement et se replient,
// barre de progression de lecture, et carte « Repères » (frise des dates, chiffres clés, auteurs).
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon.jsx';

const flat = (root) => [...root.querySelectorAll('.md-root > .prose > *, .md-root > figure')];

/** Apparition au défilement + bouton pour replier chaque grande partie. */
export function useModernEffects(rootRef, on, deps) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const clean = () => {
      root.querySelectorAll('.fold-btn').forEach((b) => b.remove());
      root.querySelectorAll('.rv, .in, .fold-hide, .folded').forEach((el) => el.classList.remove('rv', 'in', 'fold-hide', 'folded'));
    };
    clean();
    if (!on) return undefined;
    const els = flat(root);
    // Apparition : seulement pour ce qui est encore sous l'écran (rien ne disparaît sous les yeux)
    let io = null;
    if (window.IntersectionObserver && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches && !document.documentElement.classList.contains('lite')) {
      io = new IntersectionObserver((list) => list.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      }), { rootMargin: '0px 0px -8% 0px' });
      els.forEach((el) => {
        if (el.getBoundingClientRect().top > window.innerHeight) { el.classList.add('rv'); io.observe(el); }
      });
    }
    // Replier une partie (titre « ## » = h3 dans le rendu)
    root.querySelectorAll('.md-root > .prose > h3').forEach((h) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'fold-btn no-print';
      b.setAttribute('aria-label', 'Replier ou déplier cette partie');
      b.title = 'Replier / déplier la partie';
      h.append(b);
    });
    const onClick = (e) => {
      const btn = e.target.closest?.('.fold-btn');
      if (!btn) return;
      e.preventDefault();
      const h = btn.parentElement;
      const fold = !h.classList.contains('folded');
      h.classList.toggle('folded', fold);
      const list = flat(root);
      for (let i = list.indexOf(h) + 1; i < list.length; i++) {
        if (list[i].tagName === 'H3') break;
        list[i].classList.toggle('fold-hide', fold);
      }
    };
    root.addEventListener('click', onClick);
    return () => { io?.disconnect(); root.removeEventListener('click', onClick); clean(); };
  }, [on, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Barre fine en haut de la fenêtre : où en est la lecture du cours. */
export function ReadingProgress() {
  const [p, setP] = useState(0);
  useEffect(() => {
    const main = document.querySelector('.main');
    if (!main) return undefined;
    const onScroll = () => setP(main.scrollHeight > main.clientHeight ? main.scrollTop / (main.scrollHeight - main.clientHeight) : 0);
    onScroll();
    main.addEventListener('scroll', onScroll, { passive: true });
    return () => main.removeEventListener('scroll', onScroll);
  }, []);
  return createPortal(<div className="read-progress no-print" aria-hidden="true"><i style={{ transform: `scaleX(${p})` }} /></div>, document.body);
}

const YEAR = /\b(1[0-9]{3}|20[0-9]{2})\b/;

/** Fenêtre « Ajouter un repère » : date, chiffre clé ou auteur, choisi par l'utilisatrice. */
export function RepereDialog({ initial, onSave, onClose }) {
  const guess = /^\s*(\d{3,4}|\d{3,4}\s*[–-]\s*\d{2,4})\s*$/.test(initial.label || '') ? 'date' : /\d/.test(initial.label || '') ? 'num' : 'who';
  const [kind, setKind] = useState(initial.kind || guess);
  const [label, setLabel] = useState(initial.label || '');
  const [text, setText] = useState(initial.text || '');
  const save = (e) => { e.preventDefault(); if (label.trim()) onSave({ ...initial, kind, label: label.trim(), text: text.trim() }); };
  return createPortal(
    <div className="overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={save} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <div className="row between">
          <span className="chip accent"><Icon name="target" size={12} /> {initial.id ? 'Repère' : 'Nouveau repère'}</span>
          <button type="button" className="btn icon sm ghost" onClick={onClose} aria-label="Fermer"><Icon name="x" /></button>
        </div>
        <div className="row wrap" style={{ gap: 6, marginTop: 14 }} role="radiogroup" aria-label="Type de repère">
          {[['date', '📅 Date'], ['num', '🔢 Chiffre clé'], ['who', '👤 Auteur / référence']].map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} className={`chip ${kind === k ? 'accent' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setKind(k)}>{l}</button>
          ))}
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <label htmlFor="rep-label">{kind === 'date' ? 'Date' : kind === 'num' ? 'Chiffre' : 'Nom'}</label>
          <input id="rep-label" className="input" value={label} maxLength={60} autoFocus onChange={(e) => setLabel(e.target.value)} placeholder={kind === 'date' ? 'ex. 1945' : kind === 'num' ? 'ex. 12 %' : 'ex. Bourdieu'} />
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <label htmlFor="rep-text">Ce qu'il faut retenir <span className="faint small">(affiché sous le repère)</span></label>
          <textarea id="rep-text" className="textarea" rows={2} maxLength={240} value={text} onChange={(e) => setText(e.target.value)} placeholder="ex. création de la Sécurité sociale" />
        </div>
        <div className="row between" style={{ marginTop: 16 }}>
          {initial.id ? <button type="button" className="btn ghost danger" onClick={() => onSave(null)}><Icon name="trash" size={14} /> Supprimer</button> : <span />}
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn ghost" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn accent" disabled={!label.trim()}>Enregistrer</button>
          </div>
        </div>
      </form>
    </div>,
    document.body,
  );
}

/**
 * Carte « Repères » en tête du cours : uniquement les repères choisis à la main
 * (sélectionne un mot du cours → « Repère »). Frise des dates, chiffres clés, auteurs.
 */
export function Reperes({ items = [], rootRef, onEdit, onAdd }) {
  const [open, setOpen] = useState(true);
  const dates = items.filter((r) => r.kind === 'date').map((r) => ({ ...r, year: Number((r.label.match(YEAR) || [])[1] || 0) })).sort((a, b) => a.year - b.year);
  const nums = items.filter((r) => r.kind === 'num');
  const who = items.filter((r) => r.kind === 'who');
  const jump = (r) => {
    const root = rootRef.current;
    if (!root) return;
    const needle = (r.blockText || '').slice(0, 50).toLowerCase();
    const label = r.label.toLowerCase();
    const blocks = [...root.querySelectorAll('.prose p, .prose li, .prose .callout, .prose td, .prose th')];
    const el = (needle && blocks.find((x) => x.textContent.replace(/\s+/g, ' ').trim().toLowerCase().startsWith(needle)))
      || blocks.find((x) => x.textContent.toLowerCase().includes(label));
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.remove('mk-flash'); void el.offsetWidth; el.classList.add('mk-flash');
    setTimeout(() => el.classList.remove('mk-flash'), 1600);
  };
  const edit = (e, r) => { e.preventDefault(); e.stopPropagation(); onEdit(r); };
  return (
    <div className="reperes no-print">
      <div className="reperes-head">
        <button className="reperes-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <Icon name="target" size={15} /> <b>Repères du cours</b>
          <span className="faint small">{[dates.length && `${dates.length} date${dates.length > 1 ? 's' : ''}`, nums.length && `${nums.length} chiffre${nums.length > 1 ? 's' : ''}`, who.length && `${who.length} auteur${who.length > 1 ? 's' : ''}`].filter(Boolean).join(' · ')}</span>
          <span className="reperes-chev" aria-hidden="true">{open ? '▾' : '▸'}</span>
        </button>
        <button className="btn sm ghost" onClick={onAdd} title="Ajouter un repère (ou sélectionne un mot du cours, puis « Repère »)"><Icon name="plus" size={13} /> Ajouter</button>
      </div>
      {open && (
        <>
          {dates.length > 0 && (
            <div className="frise" role="list" aria-label="Frise des dates">
              {dates.map((d) => (
                <button key={d.id} role="listitem" className="frise-item" onClick={() => jump(d)} onContextMenu={(e) => edit(e, d)} title="Clic : aller au passage · clic droit : modifier">
                  <span className="frise-dot" />
                  <b>{d.label}</b>
                  {d.text && <span className="frise-ctx">{d.text}</span>}
                  <span className="rep-edit" role="button" aria-label="Modifier le repère" onClick={(e) => edit(e, d)}>✎</span>
                </button>
              ))}
            </div>
          )}
          {(nums.length > 0 || who.length > 0) && (
            <div className="reperes-row">
              {nums.map((n) => <button key={n.id} className="rep-num" onClick={() => jump(n)} onContextMenu={(e) => edit(e, n)} title={n.text || 'Clic droit : modifier'}>{n.label}{n.text ? <span className="rep-sub"> · {n.text}</span> : null}<span className="rep-edit" onClick={(e) => edit(e, n)}>✎</span></button>)}
              {who.map((w) => (
                <button key={w.id} className="rep-who" onClick={() => jump(w)} onContextMenu={(e) => edit(e, w)} title={w.text || 'Clic droit : modifier'}>
                  <span className="rep-av">{w.label.replace(/^(le|la|les|l')\s*/i, '').charAt(0).toUpperCase()}</span>{w.label}{w.text ? <span className="rep-sub"> · {w.text}</span> : null}
                  <span className="rep-edit" onClick={(e) => edit(e, w)}>✎</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
