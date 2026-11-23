// Mémorise la position de lecture d'un cours et la restaure à la réouverture.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon.jsx';
import { getReadPos, saveReadPos, clearReadPos } from '../lib/readPos.js';

const BLOCKS = '.prose :is(p, li, h2, h3, h4, h5, blockquote, td, th, .md-table-cap)';
const squash = (s = '') => s.replace(/\s+/g, ' ').trim();

/** Position actuelle : premier paragraphe visible, sa partie (« ## » = h3) et la proportion lue. */
function currentPos(root, main) {
  const blocks = [...root.querySelectorAll(BLOCKS)].filter((b) => b.offsetParent);
  const top = blocks.find((b) => b.getBoundingClientRect().bottom > 90);
  if (!top) return null;
  const parts = [...root.querySelectorAll('.md-root > .prose > h3')];
  let part = 0;
  let heading = null;
  parts.forEach((h, i) => { if (h === top || (h.compareDocumentPosition(top) & Node.DOCUMENT_POSITION_FOLLOWING)) { part = i + 1; heading = h; } });
  const ratio = main.scrollHeight > main.clientHeight ? main.scrollTop / (main.scrollHeight - main.clientHeight) : 0;
  return {
    blockText: squash(top.textContent).slice(0, 80),
    heading: heading?.id || '',
    headingText: squash(heading?.textContent || ''),
    part, parts: parts.length, ratio,
  };
}

export function useReadingResume(rootRef, courseId, active, ready) {
  const [notice, setNotice] = useState(null);
  const restored = useRef(false);
  // Restauration (une fois, quand le cours est affiché)
  useEffect(() => {
    if (!active || !ready || restored.current) return undefined;
    const root = rootRef.current;
    const main = document.querySelector('.main');
    if (!root || !main) return undefined;
    restored.current = true;
    const pos = getReadPos(courseId);
    if (!pos || pos.ratio < 0.02) return undefined;
    const t = setTimeout(() => {
      const start = pos.blockText.toLowerCase().slice(0, 50);
      const el = [...root.querySelectorAll(BLOCKS)].find((b) => squash(b.textContent).toLowerCase().startsWith(start))
        || (pos.heading && root.querySelector(`#${CSS.escape(pos.heading)}`));
      if (el) {
        const y = el.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop - 90;
        main.scrollTo({ top: Math.max(0, y), behavior: 'instant' });
      } else {
        main.scrollTo({ top: pos.ratio * (main.scrollHeight - main.clientHeight), behavior: 'instant' });
      }
      setNotice(pos);
    }, 80);
    return () => clearTimeout(t);
  }, [active, ready, courseId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Enregistrement pendant la lecture (au plus toutes les 0,6 s)
  useEffect(() => {
    if (!active || !ready) return undefined;
    const root = rootRef.current;
    const main = document.querySelector('.main');
    if (!root || !main) return undefined;
    let timer = null;
    const save = () => {
      const p = currentPos(root, main);
      if (p) saveReadPos(courseId, p);
    };
    const onScroll = () => { clearTimeout(timer); timer = setTimeout(save, 600); };
    main.addEventListener('scroll', onScroll, { passive: true });
    return () => { clearTimeout(timer); main.removeEventListener('scroll', onScroll); };
  }, [active, ready, courseId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  const toTop = () => {
    document.querySelector('.main')?.scrollTo({ top: 0, behavior: 'smooth' });
    clearReadPos(courseId);
    setNotice(null);
  };
  const banner = notice && createPortal(
    <div className="resume-chip no-print" role="status">
      <Icon name="bookmark" size={14} />
      <span>Reprise là où tu t'étais arrêtée{notice.part ? ` · partie ${notice.part}${notice.parts ? ` sur ${notice.parts}` : ''}` : ''}</span>
      <button className="btn sm ghost" onClick={toTop}>Revenir au début</button>
      <button className="btn icon sm ghost" onClick={() => setNotice(null)} aria-label="Fermer"><Icon name="x" size={13} /></button>
    </div>,
    document.body,
  );
  return banner;
}
