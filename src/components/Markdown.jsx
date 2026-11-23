import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { renderMarkdown } from '../lib/markdown.js';

// Le HTML du texte est produit à partir d'un texte entièrement échappé (voir markdown.js).
// Les schémas (SVG) ne passent jamais par innerHTML : ils sont affichés dans une <img>.

const norm = (s = '') => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export const svgSrc = (svg) => {
  const bytes = new TextEncoder().encode(svg);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return `data:image/svg+xml;base64,${btoa(bin)}`;
};

/**
 * text      : Markdown de la fiche (peut contenir des lignes [[schema:N]])
 * diagrams  : [{ id, title, svg }] recréés par l'IA
 * terms     : [{ term, definition }] — si fourni, les mots ==surlignés== affichent
 *             leur définition au survol (ou au clic)
 */
function Markdown({ text = '', diagrams = [], terms, renderActions }) {
  const interactive = Array.isArray(terms);
  const blocks = useMemo(() => {
    const out = [];
    const placed = new Set();
    // Le repère [[schema:N]] est reconnu n'importe où (seul sur sa ligne, dans une liste, en fin de phrase…)
    text.split(/[ \t]*(?:[-*•][ \t]+)?\[\[schema:(\d+)\]\][ \t]*/).forEach((chunk, i) => {
      if (i % 2 === 1) { out.push({ type: 'schema', id: Number(chunk) }); placed.add(Number(chunk)); }
      else if (chunk.trim()) {
        const html = renderMarkdown(chunk);
        out.push({ type: 'text', html: interactive ? html : html.replace(/ tabindex="0"/g, '') });
      }
    });
    // Schémas recréés mais que l'IA a oublié de placer : affichés en fin de fiche plutôt que perdus
    diagrams.forEach((d) => { if (!placed.has(Number(d.id))) out.push({ type: 'schema', id: Number(d.id) }); });
    return out;
  }, [text, diagrams, interactive]);
  const lookup = useMemo(() => {
    const m = new Map();
    (terms || []).forEach((t) => { if (t?.term) m.set(norm(t.term), t.definition || ''); });
    return m;
  }, [terms]);

  const findDef = (term) => {
    const k = norm(term);
    if (lookup.has(k)) return lookup.get(k);
    // Variante proche (pluriel, article…) : seulement pour des termes assez longs, sinon « a » trouverait n'importe quoi
    if (k.length > 3) for (const [key, def] of lookup) if (key.length > 3 && (k.includes(key) || key.includes(k))) return def;
    return null;
  };

  // --- Bulle de définition ------------------------------------------------------
  const [pop, setPop] = useState(null);
  const pinnedRef = useRef(false);
  const timer = useRef(null);
  const rootRef = useRef(null);
  const clear = () => clearTimeout(timer.current);
  const setPopState = (p) => { pinnedRef.current = !!p?.pinned; setPop(p); };

  const openFor = (el, pinned) => {
    const r = el.getBoundingClientRect();
    const below = r.top < 160;
    setPopState({
      term: el.dataset.t,
      def: findDef(el.dataset.t),
      x: Math.min(window.innerWidth - 170, Math.max(170, r.left + r.width / 2)),
      y: below ? r.bottom + 10 : r.top - 10,
      below,
      pinned,
    });
  };

  const onOver = (e) => {
    if (!interactive || pinnedRef.current) return;
    const el = e.target.closest?.('mark[data-t]');
    if (!el) return;
    clear();
    timer.current = setTimeout(() => openFor(el, false), 350); // « survol long »
  };
  const onOut = (e) => {
    if (!interactive || !e.target.closest?.('mark[data-t]')) return;
    clear();
    if (!pinnedRef.current) setPop(null);
  };
  const onClick = (e) => {
    if (!interactive) return;
    const el = e.target.closest?.('mark[data-t]');
    if (!el) return;
    clear();
    if (pinnedRef.current && pop?.term === el.dataset.t) { setPopState(null); return; }
    openFor(el, true);
  };
  const onFocus = (e) => {
    if (!interactive || pinnedRef.current) return;
    const el = e.target.closest?.('mark[data-t]');
    if (el) openFor(el, false);
  };
  const onBlur = (e) => {
    if (interactive && e.target.closest?.('mark[data-t]') && !pinnedRef.current) setPop(null);
  };

  useEffect(() => {
    if (!pop) return undefined;
    const close = (e) => {
      if (e.type === 'keydown' && e.key !== 'Escape') return;
      if (e.type === 'mousedown' && (e.target.closest?.('mark[data-t]') || e.target.closest?.('.term-pop'))) return;
      setPopState(null);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [!!pop]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => clear(), []);

  return (
    <div ref={rootRef} className={`md-root ${interactive ? 'terms-on' : ''}`} onMouseOver={onOver} onMouseOut={onOut} onClick={onClick} onFocus={onFocus} onBlur={onBlur}>
      {blocks.map((b, i) => {
        if (b.type === 'text') return <HtmlBlock key={i} html={b.html} />;
        const d = diagrams.find((x) => Number(x.id) === b.id);
        return (d?.svg || d?.image) ? <DiagramFigure key={i} d={d}>{renderActions?.(d)}</DiagramFigure> : null;
      })}

      {pop && createPortal(
        <div className={`term-pop ${pop.below ? 'below' : ''}`} role="tooltip" style={{ left: pop.x, top: pop.y }}>
          <div className="term-pop-title"><Dot /> {pop.term}</div>
          <p>{pop.def || 'Pas de définition enregistrée pour ce terme. Régénère la fiche pour la compléter.'}</p>
          {pop.pinned && <span className="faint small">Clique ailleurs pour fermer</span>}
        </div>,
        document.body,
      )}
    </div>
  );
}

const Dot = () => <span className="term-dot" aria-hidden="true" />;

// Bloc de texte mémorisé : le HTML n'est réécrit que s'il change vraiment. Sinon, une simple
// mise à jour de l'écran recréerait le texte et effacerait la sélection en cours (React 19).
const HtmlBlock = memo(function HtmlBlock({ html }) {
  const inner = useMemo(() => ({ __html: html }), [html]);
  return <div className="prose selectable" dangerouslySetInnerHTML={inner} />;
});

/** Schéma (SVG nettoyé) affiché dans une <img> : aucun script ne peut s'exécuter. Clic = agrandir. */
export function DiagramFigure({ d, children }) {
  const [open, setOpen] = useState(false);
  const src = d.image || svgSrc(d.svg);
  return (
    <figure className="diagram">
      <button type="button" className="diagram-zoom" onClick={() => setOpen(true)} title="Agrandir le schéma" aria-label={`Agrandir le schéma : ${d.title || 'schéma du cours'}`}>
        <img src={src} alt={d.title || 'Schéma du cours'} loading="lazy" decoding="async" />
      </button>
      {d.title && <figcaption>{d.title}</figcaption>}
      {d.caption && <p className="diagram-caption">{d.caption}</p>}
      {d.credit && <p className="diagram-credit">Source : {d.credit}</p>}
      {children}
      {open && <Lightbox src={src} title={d.title} onClose={() => setOpen(false)} />}
    </figure>
  );
}

/** Schéma en grand, avec zoom (boutons, molette, clavier). */
function Lightbox({ src, title, onClose }) {
  const [z, setZ] = useState(1);
  const bump = (dir) => setZ((v) => Math.round(Math.min(4, Math.max(0.5, dir === 0 ? 1 : v + dir * 0.25)) * 100) / 100);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === '+' || e.key === '=') bump(1);
      if (e.key === '-') bump(-1);
      if (e.key === '0') bump(0);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return createPortal(
    <div className="overlay lightbox" onClick={onClose}>
      <div className="lightbox-bar" onClick={(e) => e.stopPropagation()}>
        <span className="grow">{title}</span>
        <button className="btn icon sm" onClick={() => bump(-1)} aria-label="Dézoomer">−</button>
        <button className="btn sm" onClick={() => bump(0)} aria-label="Taille réelle">{Math.round(z * 100)} %</button>
        <button className="btn icon sm" onClick={() => bump(1)} aria-label="Zoomer">+</button>
        <button className="btn icon sm" onClick={onClose} aria-label="Fermer">✕</button>
      </div>
      <div className="lightbox-stage" onClick={(e) => e.stopPropagation()}
        onWheel={(e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); bump(e.deltaY < 0 ? 1 : -1); } }}>
        <img src={src} alt={title || 'Schéma'} style={{ width: `${z * 100}%` }} />
      </div>
    </div>,
    document.body,
  );
}

export default memo(Markdown);
