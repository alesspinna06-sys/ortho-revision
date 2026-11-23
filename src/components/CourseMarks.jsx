// Marque-pages et notes de couleur dans le cours, et sommaire dynamique (bord droit de la fenêtre).
// Un marque-page est ancré sur un passage du texte (citation + début du paragraphe + titre de la partie) :
// il est retrouvé même si le cours est régénéré. Le surlignage utilise l'API « CSS Custom Highlight »
// (aucune modification du texte du cours) ; un petit drapeau est ajouté dans la marge.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon.jsx';

export const MARK_COLORS = [
  { key: 'yellow', name: 'Jaune', hex: '#eab308' },
  { key: 'green', name: 'Vert', hex: '#22c55e' },
  { key: 'blue', name: 'Bleu', hex: '#3b82f6' },
  { key: 'violet', name: 'Violet', hex: '#a855f7' },
  { key: 'pink', name: 'Rose', hex: '#ec4899' },
  { key: 'orange', name: 'Orange', hex: '#f97316' },
];
const colorOf = (k) => MARK_COLORS.find((c) => c.key === k) || MARK_COLORS[0];

const BLOCKS = 'p, li, h2, h3, h4, h5, blockquote, td, th, .md-table-cap';
const squash = (s = '') => s.replace(/\s+/g, ' ').trim();
const lc = (s = '') => squash(s).toLowerCase();

/** Bloc de texte (paragraphe, élément de liste, titre) du cours qui contient ce nœud. */
export function blockOf(node, root) {
  const el = node?.nodeType === 1 ? node : node?.parentElement;
  const b = el?.closest?.(BLOCKS);
  return b && root?.contains(b) && b.closest('.prose') ? b : null;
}

/** Titre de la partie dans laquelle se trouve un élément (le dernier titre qui le précède). */
function headingBefore(el, root) {
  let last = null;
  for (const h of root.querySelectorAll('.prose h2, .prose h3, .prose h4')) {
    if (h === el || (h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)) last = h;
    else break;
  }
  return last;
}

/** Ancre d'un nouveau marque-page à partir d'un bloc et du texte choisi. */
export function anchorFor(block, root, quote) {
  const h = /^H\d$/.test(block.tagName) ? block : headingBefore(block, root);
  return { quote: squash(quote || block.textContent).slice(0, 300), blockText: squash(block.textContent).slice(0, 80), heading: h?.id || '' };
}

/** Retrouve le bloc d'un marque-page dans le cours affiché. */
function locate(mark, blocks, root) {
  const q = lc(mark.quote);
  const start = lc(mark.blockText).slice(0, 40);
  const hits = q ? blocks.filter((b) => lc(b.textContent).includes(q)) : [];
  if (hits.length) return hits.find((b) => lc(b.textContent).startsWith(start)) || hits[0];
  if (start) { const b = blocks.find((x) => lc(x.textContent).startsWith(start)); if (b) return b; }
  return mark.heading ? root.querySelector(`#${CSS.escape(mark.heading)}`) : null;
}

/** Plage de texte (Range) de la citation dans le bloc, espaces ignorés. */
function rangeIn(el, quote) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const map = []; // pour chaque caractère du texte « tassé » : [nœud, position]
  let text = '';
  let space = true;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const v = n.nodeValue;
    for (let i = 0; i < v.length; i++) {
      if (/\s/.test(v[i])) { if (!space) { text += ' '; map.push([n, i]); space = true; } }
      else { text += v[i].toLowerCase(); map.push([n, i]); space = false; }
    }
  }
  const q = lc(quote);
  const at = q ? text.indexOf(q) : -1;
  if (at < 0) return null;
  const r = document.createRange();
  const [sn, so] = map[at];
  const [en, eo] = map[at + q.length - 1];
  r.setStart(sn, so);
  r.setEnd(en, eo + 1);
  return r;
}

/**
 * Affiche les marque-pages dans le cours (surlignage + drapeau dans la marge) et renvoie
 * leur position : { [id]: { el, heading, order } }.
 */
export function useMarkDecorations(rootRef, marks, deps) {
  const [placed, setPlaced] = useState({});
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    root.querySelectorAll('.mk-flag').forEach((f) => f.remove());
    root.querySelectorAll('[data-mk]').forEach((b) => { b.removeAttribute('data-mk'); b.style.removeProperty('--mk'); });
    const blocks = [...root.querySelectorAll(`.prose :is(${BLOCKS})`)];
    const ranges = {};
    const out = {};
    const perBlock = new Map();
    (marks || []).forEach((m) => {
      const el = locate(m, blocks, root);
      if (!el) return;
      const c = colorOf(m.color);
      const h = /^H\d$/.test(el.tagName) ? el : headingBefore(el, root);
      out[m.id] = { el, heading: h?.id || '', order: blocks.indexOf(el) };
      const r = m.quote ? rangeIn(el, m.quote) : null;
      if (r) (ranges[c.key] ||= []).push(r);
      el.setAttribute('data-mk', c.key);
      el.style.setProperty('--mk', c.hex);
      const n = perBlock.get(el) || 0;
      perBlock.set(el, n + 1);
      const flag = document.createElement('button');
      flag.type = 'button';
      flag.className = `mk-flag no-print${m.note ? ' has-note' : ''}`;
      flag.dataset.mid = m.id;
      flag.style.setProperty('--mk', c.hex);
      flag.style.top = `${2 + n * 24}px`;
      flag.title = m.note ? `${c.name} — ${m.note}` : `Marque-page ${c.name.toLowerCase()} (cliquer pour modifier)`;
      flag.setAttribute('aria-label', flag.title);
      el.prepend(flag);
    });
    if (window.CSS?.highlights && window.Highlight) {
      MARK_COLORS.forEach((c) => {
        if (ranges[c.key]?.length) CSS.highlights.set(`mk-${c.key}`, new Highlight(...ranges[c.key]));
        else CSS.highlights.delete(`mk-${c.key}`);
      });
    }
    setPlaced(out);
    return undefined;
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (window.CSS?.highlights) MARK_COLORS.forEach((c) => CSS.highlights.delete(`mk-${c.key}`)); }, []);
  return placed;
}

/** Fenêtre de création / modification d'un marque-page. */
export function MarkDialog({ mark, onSave, onDelete, onClose }) {
  const [color, setColor] = useState(mark.color || 'yellow');
  const [note, setNote] = useState(mark.note || '');
  const save = (e) => { e.preventDefault(); onSave({ ...mark, color, note: note.trim() }); };
  return createPortal(
    <div className="overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={save}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose(); if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save(e); }}>
        <div className="row between">
          <span className="chip accent"><Icon name="bookmark" size={12} /> {mark.id ? 'Marque-page' : 'Nouveau marque-page'}</span>
          <button type="button" className="btn icon sm ghost" onClick={onClose} aria-label="Fermer"><Icon name="x" /></button>
        </div>
        {mark.quote && <blockquote className="mk-quote" style={{ '--mk': colorOf(color).hex }}>« {mark.quote.length > 220 ? `${mark.quote.slice(0, 220)}…` : mark.quote} »</blockquote>}
        <div className="field" style={{ marginTop: 12 }}>
          <label>Couleur</label>
          <div className="swatches" role="radiogroup" aria-label="Couleur du marque-page">
            {MARK_COLORS.map((c) => (
              <button key={c.key} type="button" role="radio" aria-checked={color === c.key} aria-label={c.name} title={c.name}
                className={`swatch ${color === c.key ? 'on' : ''}`} style={{ background: c.hex }} onClick={() => setColor(c.key)} />
            ))}
          </div>
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <label htmlFor="mk-note">Note <span className="faint small">(facultative)</span></label>
          <textarea id="mk-note" className="textarea" rows={3} value={note} autoFocus onChange={(e) => setNote(e.target.value)}
            placeholder="Ex. : à revoir avant le partiel, la prof a insisté là-dessus…" maxLength={600} />
        </div>
        <div className="row between wrap" style={{ marginTop: 16, gap: 8 }}>
          {mark.id ? <button type="button" className="btn ghost danger" onClick={() => onDelete(mark.id)}><Icon name="trash" size={14} /> Supprimer</button> : <span />}
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn ghost" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn accent">Enregistrer</button>
          </div>
        </div>
      </form>
    </div>,
    document.body,
  );
}

const PIN_KEY = 'toc-pin';

/**
 * Sommaire dynamique : une poignée sur le bord droit ; le panneau s'ouvre au survol du bord
 * (ou en cliquant la poignée), suit la lecture et liste les marque-pages de chaque partie.
 */
export function TocRail({ rootRef, toc, marks, placed, onAddHere, onEdit, find, times = {} }) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(() => { try { return localStorage.getItem(PIN_KEY) === '1'; } catch { return false; } });
  const [active, setActive] = useState('');
  const [filter, setFilter] = useState('all');
  const timer = useRef(null);
  const forced = useRef(''); // partie choisie dans le sommaire (prioritaire tant qu'on ne fait pas défiler soi-même)
  const finding = !!find && find.query.trim().length >= 2;
  const shown = open || pinned || finding;

  const show = () => { clearTimeout(timer.current); setOpen(true); };
  const hide = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(false), 280); };
  const pin = () => setPinned((p) => { const v = !p; try { localStorage.setItem(PIN_KEY, v ? '1' : '0'); } catch { /* */ } if (!v) setOpen(false); return v; });

  useEffect(() => {
    document.documentElement.classList.toggle('toc-side', pinned);
    return () => document.documentElement.classList.remove('toc-side');
  }, [pinned]);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!shown) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && !pinned && !finding) setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shown, pinned]);

  // Partie en cours de lecture
  useEffect(() => {
    const spy = () => {
      const root = rootRef.current;
      if (!root) return;
      let cur = '';
      // En bas du cours, la dernière partie visible est la partie en cours (elle ne peut pas monter plus haut)
      const main = root.closest('.main');
      const atEnd = main && main.scrollTop + main.clientHeight >= main.scrollHeight - 6;
      const limit = atEnd ? window.innerHeight * 0.8 : 150;
      for (const h of root.querySelectorAll('.prose h2, .prose h3, .prose h4')) {
        if (h.getBoundingClientRect().top < limit) cur = h.id; else break;
      }
      setActive(forced.current || cur);
    };
    spy();
    const manual = () => { forced.current = ''; };
    window.addEventListener('scroll', spy, true);
    window.addEventListener('wheel', manual, { passive: true });
    window.addEventListener('keydown', manual);
    return () => { window.removeEventListener('scroll', spy, true); window.removeEventListener('wheel', manual); window.removeEventListener('keydown', manual); };
  }, [rootRef, toc]);

  const used = useMemo(() => MARK_COLORS.filter((c) => (marks || []).some((m) => m.color === c.key)), [marks]);
  const visible = (marks || []).filter((m) => filter === 'all' || m.color === filter);
  const byHeading = useMemo(() => {
    const m = new Map();
    const lost = [];
    visible.forEach((mk) => {
      const p = placed[mk.id];
      const h = p ? p.heading : null;
      if (p == null) { lost.push(mk); return; }
      if (!m.has(h)) m.set(h, []);
      m.get(h).push({ ...mk, order: p.order });
    });
    m.forEach((list) => list.sort((a, b) => a.order - b.order));
    return { m, lost };
  }, [visible, placed]);

  const go = (id) => { forced.current = id; setActive(id); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const jump = (mk) => {
    const el = placed[mk.id]?.el;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.remove('mk-flash');
    void el.offsetWidth; // relance l'animation
    el.classList.add('mk-flash');
    setTimeout(() => el.classList.remove('mk-flash'), 1600);
  };
  const MarkRow = ({ mk }) => (
    <div className="toc-mark" style={{ '--mk': colorOf(mk.color).hex }}>
      <button className="toc-mark-main" onClick={() => jump(mk)} title="Aller au marque-page">
        <span className="toc-mk-dot" />
        <span className="toc-mk-text">{mk.note || mk.quote || mk.blockText}</span>
      </button>
      <button className="toc-mark-edit" onClick={() => onEdit(mk)} aria-label="Modifier le marque-page" title="Modifier"><Icon name="edit" size={12} /></button>
    </div>
  );
  const intro = byHeading.m.get('') || [];
  const count = (marks || []).length;

  return createPortal(
    <div className={`toc-rail no-print ${shown ? 'open' : ''} ${pinned ? 'pinned' : ''}`} onMouseLeave={hide}>
      <div className="toc-hot" onMouseEnter={show} aria-hidden="true" />
      <button className="toc-handle" onMouseEnter={show} onClick={() => (shown && !pinned ? setOpen(false) : show())} aria-expanded={shown} aria-label="Sommaire et marque-pages">
        <Icon name="list" size={15} />
        {count > 0 && <span className="toc-handle-n">{count}</span>}
      </button>
      <aside className="toc-panel" onMouseEnter={show} aria-label="Sommaire du cours et marque-pages" aria-hidden={!shown}>
        <div className="toc-panel-head">
          <b>Sommaire</b>
          <span className="faint small">{count ? `${count} marque-page${count > 1 ? 's' : ''}` : ''}</span>
          <button className={`btn icon sm ghost ${pinned ? 'on' : ''}`} onClick={pin} aria-pressed={pinned} title={pinned ? 'Détacher (le panneau se cache)' : 'Garder ouvert à côté du cours'}><Icon name="pin" size={14} /></button>
        </div>
        {finding ? (
          <div className="toc-find-head">
            <Icon name="search" size={13} /> <b>« {find.query.trim()} »</b>
            <span className="faint small">{find.total ? `${find.total} résultat${find.total > 1 ? 's' : ''}` : 'aucun résultat'}</span>
          </div>
        ) : <button className="btn sm toc-add" onClick={onAddHere}><Icon name="bookmark" size={14} /> Marque-page ici</button>}
        {used.length > 1 && (
          <div className="toc-filter" role="group" aria-label="Filtrer les marque-pages par couleur">
            <button className={`toc-f ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>Tous</button>
            {used.map((c) => (
              <button key={c.key} className={`toc-f dot ${filter === c.key ? 'on' : ''}`} style={{ '--mk': c.hex }} onClick={() => setFilter(c.key)} aria-label={c.name} title={c.name} />
            ))}
          </div>
        )}
        <nav className="toc-list">
          {intro.map((mk) => <MarkRow key={mk.id} mk={mk} />)}
          {finding && (find.byHeading.get('') || []).slice(0, 4).map((x) => (
            <button key={x.i} className={`toc-hit ${x.i === find.current ? 'on' : ''}`} onClick={() => find.onPick(x.i)}>…{x.snippet}…</button>
          ))}
          {toc.map((h) => (
            <div key={h.id}>
              <button className={`toc-h l${h.level} ${active === h.id ? 'on' : ''} ${finding && !find.byHeading.has(h.id) ? 'dim' : ''}`} onClick={() => go(h.id)}>
                {h.text}{finding && find.byHeading.has(h.id) && <span className="toc-hitn">{find.byHeading.get(h.id).length}</span>}
                {!finding && times[h.id] >= 2 && <span className="toc-min">{times[h.id]} min</span>}
              </button>
              {finding && (find.byHeading.get(h.id) || []).slice(0, 4).map((x) => (
                <button key={x.i} className={`toc-hit ${x.i === find.current ? 'on' : ''}`} onClick={() => find.onPick(x.i)}>…{x.snippet}…</button>
              ))}
              {finding && (find.byHeading.get(h.id) || []).length > 4 && <div className="toc-more faint small">+ {(find.byHeading.get(h.id).length - 4)} autre{find.byHeading.get(h.id).length - 4 > 1 ? 's' : ''} (Entrée pour les parcourir)</div>}
              {(byHeading.m.get(h.id) || []).map((mk) => <MarkRow key={mk.id} mk={mk} />)}
            </div>
          ))}
          {byHeading.lost.length > 0 && (
            <>
              <div className="toc-lost faint small">Passage introuvable (le cours a changé) :</div>
              {byHeading.lost.map((mk) => <MarkRow key={mk.id} mk={mk} />)}
            </>
          )}
        </nav>
        {!count && <p className="faint small toc-tip">Sélectionne un passage du cours, puis « Marque-page », pour l'ajouter ici avec une couleur et une note.</p>}
      </aside>
    </div>,
    document.body,
  );
}
