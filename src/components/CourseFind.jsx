// Recherche dans le cours ouvert (⌘F / Ctrl F) : tous les résultats surlignés (API CSS Custom Highlight,
// sans toucher au texte), navigation Entrée / Maj+Entrée, et liste des résultats dans le sommaire de droite.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon.jsx';

const BLOCKS = '.prose :is(p, li, h2, h3, h4, h5, blockquote, td, th, .md-table-cap)';
const fold = (c) => c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().charAt(0) || c;

/** Toutes les occurrences de `query` dans le cours (sans tenir compte des accents ni des majuscules). */
function findAll(root, query) {
  const q = [...query.trim()].map(fold).join('').replace(/\s+/g, ' ');
  if (q.length < 2) return [];
  const hits = [];
  let lastHeading = null;
  root.querySelectorAll(BLOCKS).forEach((block) => {
    if (!block.offsetParent && !block.closest('.fold-hide')) return; // caché (onglet, aperçu…)
    if (/^H\d$/.test(block.tagName) && block.closest('.md-root > .prose')) lastHeading = block;
    // Pas de bloc imbriqué compté deux fois (li dans blockquote…)
    if (block.parentElement?.closest(BLOCKS) && block.parentElement.closest(BLOCKS) !== block) return;
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    const map = [];
    let text = '';
    let space = true;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const v = n.nodeValue;
      for (let i = 0; i < v.length; i++) {
        if (/\s/.test(v[i])) { if (!space) { text += ' '; map.push([n, i]); space = true; } }
        else { text += fold(v[i]); map.push([n, i]); space = false; }
      }
    }
    let at = text.indexOf(q);
    while (at >= 0) {
      const r = document.createRange();
      r.setStart(map[at][0], map[at][1]);
      const [en, eo] = map[at + q.length - 1];
      r.setEnd(en, eo + 1);
      const raw = block.textContent.replace(/\s+/g, ' ');
      hits.push({ range: r, block, heading: /^H\d$/.test(block.tagName) ? block.id : lastHeading?.id || '', snippet: raw.slice(Math.max(0, at - 30), at + q.length + 40) });
      at = text.indexOf(q, at + q.length);
    }
  });
  return hits;
}

export function useCourseFind(rootRef, query, current, deps) {
  const [hits, setHits] = useState([]);
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !query || query.trim().length < 2) { setHits([]); return; }
    // Les parties repliées (apparence Moderne) sont dépliées pour que tout soit trouvable
    root.querySelectorAll('h3.folded .fold-btn').forEach((b) => b.click());
    setHits(findAll(root, query));
  }, [query, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!window.CSS?.highlights || !window.Highlight) return undefined;
    if (!hits.length) { CSS.highlights.delete('find'); CSS.highlights.delete('find-cur'); return undefined; }
    CSS.highlights.set('find', new Highlight(...hits.map((h) => h.range)));
    const cur = hits[current % hits.length];
    if (cur) CSS.highlights.set('find-cur', new Highlight(cur.range));
    return undefined;
  }, [hits, current]);
  useEffect(() => () => { if (window.CSS?.highlights) { CSS.highlights.delete('find'); CSS.highlights.delete('find-cur'); } }, []);
  return hits;
}

/** Fait défiler jusqu'au résultat n°i (au centre de l'écran). */
export function scrollToHit(hit) {
  if (!hit) return;
  const main = document.querySelector('.main');
  const r = hit.range.getBoundingClientRect();
  if (!main || (!r.top && !r.bottom)) { hit.block.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
  const m = main.getBoundingClientRect();
  main.scrollTo({ top: main.scrollTop + r.top - m.top - main.clientHeight / 2 + r.height / 2, behavior: 'smooth' });
}

/** Barre de recherche flottante. */
export function FindBar({ query, setQuery, hits, current, setCurrent, onClose }) {
  const input = useRef(null);
  useEffect(() => { input.current?.focus(); input.current?.select(); }, []);
  // Échap ferme la recherche même si le curseur n'est plus dans le champ (clic dans le sommaire…)
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !document.querySelector('.modal')) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const n = hits.length;
  const go = (d) => { if (!n) return; const next = (current + d + n) % n; setCurrent(next); scrollToHit(hits[next]); };
  return createPortal(
    <div className="find-bar no-print" role="search">
      <Icon name="search" size={15} />
      <input ref={input} className="find-input" value={query} placeholder="Rechercher dans ce cours…" aria-label="Rechercher dans ce cours"
        onChange={(e) => { setQuery(e.target.value); setCurrent(0); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); go(e.shiftKey ? -1 : 1); }
        }} />
      <span className="find-count" aria-live="polite">{query.trim().length < 2 ? '' : n ? `${(current % n) + 1}/${n}` : 'aucun'}</span>
      <button className="btn icon sm ghost" disabled={!n} onClick={() => go(-1)} aria-label="Résultat précédent" title="Précédent (Maj+Entrée)"><Icon name="left" size={14} style={{ transform: 'rotate(90deg)' }} /></button>
      <button className="btn icon sm ghost" disabled={!n} onClick={() => go(1)} aria-label="Résultat suivant" title="Suivant (Entrée)"><Icon name="right" size={14} style={{ transform: 'rotate(90deg)' }} /></button>
      <button className="btn icon sm ghost" onClick={onClose} aria-label="Fermer la recherche" title="Fermer (Échap)"><Icon name="x" size={14} /></button>
    </div>,
    document.body,
  );
}

/** Résultats groupés par partie, pour le sommaire de droite. */
export function useHitsByHeading(hits) {
  return useMemo(() => {
    const m = new Map();
    hits.forEach((h, i) => { if (!m.has(h.heading)) m.set(h.heading, []); m.get(h.heading).push({ ...h, i }); });
    return m;
  }, [hits]);
}
