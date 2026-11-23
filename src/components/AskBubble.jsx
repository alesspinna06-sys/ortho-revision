import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon.jsx';
import Markdown from './Markdown.jsx';
import { useToast } from './Toast.jsx';
import { updateCourse, addCards, uid } from '../lib/db.js';
import { askAbout, cardFromAnswer } from '../lib/ai-extra.js';
import { CARD_CATEGORIES } from '../lib/ai.js';
import { newSrs } from '../lib/srs.js';

// Bulle « Poser une question » qui suit la lecture du cours : déplaçable, position gardée,
// ouverte par un clic, par ⌘/Ctrl J ou par « Demander » sur un passage sélectionné.
const POS_KEY = 'ask-bubble-pos';
const SIZE = 52;
const MAX_MESSAGES = 60; // comme l'onglet « Questions »
const short = (s, n = 40) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// Position en proportion de la place disponible (1, 1 = en bas à droite) : reste à l'écran si la fenêtre change de taille
function loadPos() {
  try {
    const p = JSON.parse(localStorage.getItem(POS_KEY));
    if (p && typeof p.rx === 'number' && typeof p.ry === 'number') return p;
  } catch { /* stockage indisponible */ }
  return { rx: 1, ry: 0.86 };
}
const toXY = (p) => ({
  x: 12 + Math.min(1, Math.max(0, p.rx)) * Math.max(0, window.innerWidth - SIZE - 24),
  y: 12 + Math.min(1, Math.max(0, p.ry)) * Math.max(0, window.innerHeight - SIZE - 24),
});

/** Ce que l'on est en train de lire : passage sélectionné (s'il y en a un), son paragraphe, et la partie visible. */
export function readingContext() {
  const sel = window.getSelection();
  const txt = sel ? sel.toString().replace(/\s+/g, ' ').trim() : '';
  const node = sel?.anchorNode ? (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement) : null;
  let quote = '';
  let paragraph = '';
  if (txt && txt.length <= 600 && node?.closest?.('.prose')) {
    quote = txt;
    paragraph = (node.closest('p, li, blockquote, td, .callout') || node).textContent.replace(/\s+/g, ' ').trim();
  }
  const hs = [...document.querySelectorAll('.course-sheet .prose h2, .course-sheet .prose h3')];
  let heading = '';
  for (const h of hs) {
    if (h.getBoundingClientRect().top < 140) heading = h.textContent.trim();
    else break;
  }
  if (!heading && hs[0]) heading = hs[0].textContent.trim();
  return { quote, paragraph, heading };
}

export default function AskBubble({ course, hasKey, onOpenChat }) {
  const toast = useToast();
  const [pos, setPos] = useState(loadPos);
  const [xy, setXY] = useState(() => toXY(loadPos()));
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState({ quote: '', paragraph: '', heading: '' });
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [thread, setThread] = useState([]); // échanges depuis l'ouverture : {id, q, quote, a, err, cardMade}
  const drag = useRef(null);
  const inputRef = useRef(null);
  const endRef = useRef(null);
  const courseRef = useRef(course);
  courseRef.current = course;

  useEffect(() => {
    const onResize = () => setXY(toXY(pos));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [pos]);

  const openWith = (f) => {
    const next = { quote: '', paragraph: '', heading: '', ...f };
    if (next.quote) setThread([]); // nouveau passage : nouvelle discussion (les anciennes restent dans « Questions »)
    setFocus(next);
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 40);
  };

  // « Demander » depuis la barre de sélection, raccourci ⌘/Ctrl J, Échap pour fermer
  useEffect(() => {
    const onAsk = (e) => openWith(e.detail || {});
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        if (open) setOpen(false); else openWith(readingContext());
      } else if (e.key === 'Escape' && open) setOpen(false);
    };
    window.addEventListener('ask-course', onAsk);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('ask-course', onAsk); window.removeEventListener('keydown', onKey); };
  }, [open]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [thread, busy]);

  // Glisser la bulle (au-delà de 5 px) ; sinon c'est un clic
  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault(); // garde la sélection du texte
    drag.current = { sx: e.clientX, sy: e.clientY, x0: xy.x, y0: xy.y, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) < 5) return;
    d.moved = true;
    setXY({
      x: Math.min(window.innerWidth - SIZE - 12, Math.max(12, d.x0 + dx)),
      y: Math.min(window.innerHeight - SIZE - 12, Math.max(12, d.y0 + dy)),
    });
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved) {
      const p = {
        rx: (xy.x - 12) / Math.max(1, window.innerWidth - SIZE - 24),
        ry: (xy.y - 12) / Math.max(1, window.innerHeight - SIZE - 24),
      };
      setPos(p);
      try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch { /* stockage indisponible */ }
    } else if (open) setOpen(false);
    else openWith(readingContext());
  };

  const ask = async (text = q) => {
    const question = text.trim();
    if (!question || busy) return;
    if (!hasKey) { toast({ type: 'error', text: 'Ajoute ta clé Gemini dans Réglages.' }); return; }
    setBusy(true);
    setQ('');
    const id = uid();
    const f = focus;
    setThread((t) => [...t, { id, q: question, quote: f.quote, a: '' }]);
    try {
      const c = courseRef.current;
      const a = await askAbout(c, c.chat || [], question, f);
      setThread((t) => t.map((x) => (x.id === id ? { ...x, a } : x)));
      // Aussi gardé dans l'onglet « Questions » du cours
      const userText = f.quote ? `« ${short(f.quote, 200)} » — ${question}` : question;
      const now = Date.now();
      await updateCourse(c.id, {
        chat: [...(courseRef.current.chat || []), { id: uid(), role: 'user', text: userText, at: now }, { id, role: 'assistant', text: a, at: now, q: userText }].slice(-MAX_MESSAGES),
      });
    } catch (e) {
      setThread((t) => t.map((x) => (x.id === id ? { ...x, err: e.message } : x)));
    } finally {
      setBusy(false);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  };

  const makeCard = async (m) => {
    try {
      const c = await cardFromAnswer(m.q, m.a, CARD_CATEGORIES);
      await addCards([{ id: uid(), courseId: course.id, ...c, srs: newSrs(), createdAt: Date.now(), fromChat: true }]);
      setThread((t) => t.map((x) => (x.id === m.id ? { ...x, cardMade: true } : x)));
      toast({ type: 'success', text: 'Flashcard ajoutée au cours' });
    } catch (e) { toast({ type: 'error', text: e.message }); }
  };

  const ideas = focus.quote
    ? [`Explique « ${short(focus.quote)} » simplement`, 'Donne-moi un exemple concret', 'Pourquoi est-ce important ici ?', 'Quel lien avec le reste du cours ?']
    : [focus.heading ? `Résume la partie « ${short(focus.heading)} »` : 'Résume ce que je viens de lire', 'Explique cette partie plus simplement', 'Quels pièges éviter sur cette partie ?'];

  // Le panneau s'ouvre du côté où il y a de la place
  const W = Math.min(400, window.innerWidth - 24);
  const right = xy.x > window.innerWidth / 2;
  const below = xy.y < window.innerHeight / 2;
  const panelStyle = {
    width: W,
    left: right ? Math.max(12, xy.x + SIZE - W) : Math.min(window.innerWidth - W - 12, xy.x),
    ...(below
      ? { top: xy.y + SIZE + 10, maxHeight: Math.max(260, window.innerHeight - xy.y - SIZE - 22) }
      : { bottom: window.innerHeight - xy.y + 10, maxHeight: Math.max(260, xy.y - 22) }),
  };

  return createPortal(
    <>
      <button type="button" className={`ask-bubble ${open ? 'on' : ''}`} style={{ left: xy.x, top: xy.y }}
        title="Poser une question sur le cours (⌘/Ctrl J). Glisse-moi pour me déplacer." aria-label="Poser une question sur le cours" aria-expanded={open}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (open) setOpen(false); else openWith(readingContext()); } }}>
        <Icon name={open ? 'x' : 'search'} size={22} />
      </button>
      {open && (
        <div className="ask-panel" style={panelStyle} role="dialog" aria-label="Question sur le cours">
          <div className="ask-head">
            <b>Une question sur ce cours ?</b>
            <button type="button" className="btn icon sm ghost" onClick={() => setOpen(false)} aria-label="Fermer"><Icon name="x" size={14} /></button>
          </div>
          {(focus.quote || focus.heading) && (
            <div className="ask-focus">
              {focus.quote
                ? <><span className="faint">À propos de</span> « {short(focus.quote, 140)} »</>
                : <><span className="faint">Partie lue :</span> {focus.heading}</>}
              <button type="button" className="ask-focus-x" aria-label="Ne plus cibler ce passage"
                onClick={() => setFocus({ quote: '', paragraph: '', heading: focus.quote ? focus.heading : '' })}>×</button>
            </div>
          )}
          <div className="ask-thread">
            {thread.length === 0 && (
              <div className="ask-ideas">
                {ideas.map((t) => <button key={t} type="button" className="chip-btn" onClick={() => ask(t)}>{t}</button>)}
              </div>
            )}
            {thread.map((m) => (
              <div key={m.id} className="ask-msg">
                <div className="ask-q">{m.q}</div>
                {m.err ? <div className="small" style={{ color: 'var(--danger)' }}>{m.err}</div>
                  : m.a ? (
                    <>
                      <div className="ask-a"><Markdown text={m.a} terms={course.keyTerms || []} /></div>
                      <div><button type="button" className="btn sm ghost" disabled={m.cardMade} onClick={() => makeCard(m)}>
                        <Icon name="layers" size={13} /> {m.cardMade ? 'Flashcard créée' : 'En faire une flashcard'}
                      </button></div>
                    </>
                  ) : <div className="faint small row" style={{ gap: 8 }}><span className="spinner" /> Je cherche dans ton cours…</div>}
              </div>
            ))}
            <div ref={endRef} />
          </div>
          <form className="ask-input" onSubmit={(e) => { e.preventDefault(); ask(); }}>
            <textarea ref={inputRef} rows={2} className="ask-text" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder={focus.quote ? 'Ta question sur ce passage…' : 'Un mot, une phrase, un concept du cours…'} aria-label="Ta question"
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } }} />
            <button type="submit" className="btn accent" disabled={busy || !q.trim()} aria-label="Envoyer"><Icon name="sparkles" size={15} /></button>
          </form>
          <div className="ask-foot faint small">
            Entrée pour envoyer · ⌘/Ctrl J pour ouvrir ou fermer · tout est gardé dans l'onglet{' '}
            <button type="button" onClick={() => { setOpen(false); onOpenChat?.(); }}>Questions</button>
          </div>
        </div>
      )}
    </>,
    document.body,
  );
}
