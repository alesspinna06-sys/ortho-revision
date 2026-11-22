import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon.jsx';
import { getCourses, getCards, getQuestions, getFolders } from '../lib/db.js';
import { lastRead } from '../lib/readPos.js';

const norm = (s = '') => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const clean = (s = '') => s.replace(/\[\[schema:\d+\]\]/g, '').replace(/==|\*\*|`|^#+\s*/gm, '');

/** Extrait autour de la première occurrence, avec le mot cherché en surbrillance. */
function Snippet({ text, words }) {
  const t = clean(text).replace(/\s+/g, ' ');
  const n = norm(t);
  let at = -1;
  for (const w of words) { const i = n.indexOf(w); if (i >= 0 && (at < 0 || i < at)) at = i; }
  if (at < 0) return <span>{t.slice(0, 140)}{t.length > 140 ? '…' : ''}</span>;
  const from = Math.max(0, at - 60);
  const part = t.slice(from, from + 170);
  const np = norm(part);
  // Découpe en morceaux surlignés (la normalisation garde les longueurs pour le français courant)
  const marks = [];
  for (const w of words) { let i = np.indexOf(w); while (i >= 0) { marks.push([i, i + w.length]); i = np.indexOf(w, i + w.length); } }
  marks.sort((a, b) => a[0] - b[0]);
  const out = [];
  let cur = 0;
  marks.forEach(([a, b], k) => { if (a < cur) return; out.push(part.slice(cur, a)); out.push(<mark key={k}>{part.slice(a, b)}</mark>); cur = b; });
  out.push(part.slice(cur));
  return <span>{from > 0 ? '…' : ''}{out}{from + 170 < t.length ? '…' : ''}</span>;
}

// Palette de commandes : « flashcards déglutition », « synthèse mobilité », « qcm neuro », « réglages »…
const VERBS = [
  { re: /^(flashcards?|cartes?|reviser|revision|reviser)$/, label: 'Flashcards', icon: 'layers', course: (c, go) => go('course', { id: c.id, tab: 'cards' }), folder: (f, go) => go('review', { folderId: f.id }), page: 'review' },
  { re: /^(qcm|quiz|cas)$/, label: 'QCM', icon: 'quiz', course: (c, go) => go('course', { id: c.id, tab: 'quiz' }), folder: (f, go) => go('quiz', { folderId: f.id }), page: 'quiz' },
  { re: /^(syntheses?|synth|resume|resumes)$/, label: 'Synthèse', icon: 'clipboard', course: (c, go) => go('syntheses', { id: c.id }), folder: (f, go) => go('syntheses', { folderId: f.id }), page: 'syntheses' },
  { re: /^(cours|ouvrir|lire)$/, label: 'Cours', icon: 'book', course: (c, go) => go('course', { id: c.id }), folder: (f, go) => go('folder', { id: f.id }), page: 'library' },
  { re: /^(dossiers?)$/, label: 'Dossier', icon: 'folder', folder: (f, go) => go('folder', { id: f.id }), page: 'library' },
  { re: /^(approfondir|approfondissement|actualites?)$/, label: 'Approfondir', icon: 'zap', course: (c, go) => go('course', { id: c.id, tab: 'deepen' }) },
  { re: /^(texte|source)$/, label: 'Texte source', icon: 'text', course: (c, go) => go('course', { id: c.id, tab: 'text' }) },
  { re: /^(continuer|reprendre)$/, label: 'Continuer', icon: 'bookmark', resume: true },
];
const QUICK = [VERBS[3], VERBS[2], VERBS[0], VERBS[1]]; // un cours tapé seul : Ouvrir, Synthèse, Flashcards, QCM

/** Cours (ou dossiers) dont le titre contient tous les mots ; les titres qui commencent par le 1er mot d'abord. */
function bestMatches(list, words, key) {
  if (!words.length) return [];
  return list
    .map((x) => ({ x, n: norm(key(x)) }))
    .filter((r) => words.every((w) => r.n.includes(w)))
    .map((r) => ({ ...r, score: (r.n.startsWith(words[0]) ? 2 : 0) + (r.n.split(/\W+/).some((t) => t.startsWith(words[0])) ? 1 : 0) - r.n.length / 400 }))
    .sort((a, b) => b.score - a.score)
    .map((r) => r.x);
}

/** Recherche globale (⌘K / Ctrl+K) dans les cours, les flashcards et les questions, + palette de commandes. */
export default function SearchModal({ onClose, go, pages = [] }) {
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    Promise.all([getCourses(), getCards(), getQuestions(), getFolders()]).then(([courses, cards, questions, folders]) => {
      const names = Object.fromEntries(courses.map((c) => [c.id, c.title]));
      setData({
        list: courses, folders,
        courses: courses.map((c) => ({ c, hay: norm(`${c.title} ${c.subject} ${(c.keyTerms || []).map((k) => `${k.term} ${k.definition}`).join(' ')} ${c.summary || ''} ${c.text || ''}`) })),
        cards: cards.map((k) => ({ k, course: names[k.courseId], hay: norm(`${k.front} ${k.back}`) })),
        questions: questions.map((x) => ({ x, course: names[x.courseId], hay: norm(`${x.context || ''} ${x.question} ${x.options.join(' ')} ${x.explanation}`) })),
      });
    });
    inputRef.current?.focus();
  }, []);

  const words = useMemo(() => norm(q).split(/\s+/).filter((w) => w.length >= 2), [q]);
  const results = useMemo(() => {
    if (!data || !words.length) return [];
    const hit = (hay) => words.every((w) => hay.includes(w));
    const out = [];
    // 1. Commandes
    const cmd = (title, sub, icon, fn) => out.push({ cmd: true, type: 'Aller à', icon, title, sub, go: fn });
    const verb = VERBS.find((v) => v.re.test(words[0]));
    const rest = verb ? words.slice(1) : words;
    if (verb?.resume) {
      const last = lastRead(data.list);
      if (last) cmd(`Continuer : ${last.course.title}`, last.pos.part ? `partie ${last.pos.part}${last.pos.parts ? ` sur ${last.pos.parts}` : ''}` : '', 'bookmark', () => go('course', { id: last.course.id }));
    } else if (verb) {
      if (verb.course) bestMatches(data.list, rest, (c) => `${c.title} ${c.subject || ''}`).slice(0, 4).forEach((c) => cmd(`${verb.label} · ${c.title}`, c.subject, verb.icon, () => verb.course(c, go)));
      if (verb.folder) bestMatches(data.folders, rest, (f) => f.name).slice(0, 2).forEach((f) => cmd(`${verb.label} du dossier · ${f.name}`, 'Dossier', 'folder', () => verb.folder(f, go)));
      if (!rest.length && verb.page) { const pg = pages.find((x) => x.id === verb.page); if (pg) cmd(pg.label, 'Page', pg.icon, () => go(pg.id)); }
    } else {
      pages.filter((pg) => words.every((w) => norm(pg.label).includes(w))).slice(0, 3).forEach((pg) => cmd(pg.label, 'Page', pg.icon, () => go(pg.id)));
      if (words.every((w) => 'reglages parametres options'.includes(w))) cmd('Réglages', 'Page', 'settings', () => go('settings'));
      const top = bestMatches(data.list, words, (c) => c.title)[0];
      if (top) QUICK.forEach((v) => cmd(`${v.label === 'Cours' ? 'Ouvrir' : v.label} · ${top.title}`, top.subject, v.icon, () => v.course(top, go)));
      bestMatches(data.folders, words, (f) => f.name).slice(0, 1).forEach((f) => cmd(`Dossier · ${f.name}`, 'Dossier', 'folder', () => go('folder', { id: f.id })));
    }
    // 2. Contenu
    if (verb) return out; // commande tapée : pas de résultats de contenu en plus
    data.courses.filter((r) => hit(r.hay)).slice(0, 8).forEach((r) => {
      const term = (r.c.keyTerms || []).find((k) => words.every((w) => norm(`${k.term} ${k.definition}`).includes(w)));
      // Ouvre le cours avec la recherche « dans le cours » déjà lancée sur ces mots
      out.push({ type: 'Cours', icon: 'book', title: r.c.title, sub: r.c.subject, text: term ? `${term.term} : ${term.definition}` : `${r.c.summary || ''} ${r.c.text || ''}`, go: () => go('course', { id: r.c.id, find: q.trim() }) });
    });
    data.cards.filter((r) => hit(r.hay)).slice(0, 8).forEach((r) => {
      out.push({ type: 'Flashcard', icon: 'layers', title: r.k.front, sub: r.course, text: r.k.back, go: () => go('course', { id: r.k.courseId, tab: 'cards' }) });
    });
    data.questions.filter((r) => hit(r.hay)).slice(0, 8).forEach((r) => {
      out.push({ type: 'Question', icon: 'quiz', title: r.x.question, sub: r.course, text: r.x.explanation, go: () => go('course', { id: r.x.courseId, tab: 'quiz' }) });
    });
    return out;
  }, [data, words, go, pages, q]);

  useEffect(() => { setActive(0); }, [q]);
  const open = (r) => { r.go(); onClose(); };
  const onKey = (e) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    if (e.key === 'Enter' && results[active]) open(results[active]);
  };

  return createPortal(
    <div className="overlay search-overlay" onClick={onClose}>
      <div className="modal search-modal" onClick={(e) => e.stopPropagation()}>
        <div className="search search-big">
          <Icon name="search" size={18} />
          <input ref={inputRef} className="input" placeholder="Chercher, ou aller à… (« flashcards déglutition », « synthèse »…)" value={q}
            onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} aria-label="Recherche dans tous les cours" />
        </div>
        <div className="search-results" role="listbox">
          {!words.length ? (
            <div className="faint small search-help">
              <p style={{ margin: 0 }}>Tape au moins deux lettres : notions, cours, flashcards et QCM. ↑ ↓ pour choisir, Entrée pour ouvrir.</p>
              <p style={{ margin: '8px 0 0' }}>Raccourcis : <kbd>flashcards …</kbd> <kbd>qcm …</kbd> <kbd>synthèse …</kbd> <kbd>cours …</kbd> <kbd>dossier …</kbd> <kbd>continuer</kbd> — suivis du nom d'un cours ou d'un dossier.</p>
            </div>
          ) : !results.length ? (
            <p className="faint small" style={{ padding: '14px 6px', margin: 0 }}>Aucun résultat pour « {q} ».</p>
          ) : results.map((r, i) => (
            <button key={i} role="option" aria-selected={i === active} className={`search-hit ${i === active ? 'on' : ''}`} onMouseEnter={() => setActive(i)} onClick={() => open(r)}>
              <span className="search-ico"><Icon name={r.icon} size={15} /></span>
              <span className="grow" style={{ minWidth: 0 }}>
                <span className="search-title">{r.title}</span>
                <span className="search-meta">{r.type}{r.sub ? ` · ${r.sub}` : ''}</span>
                {!r.cmd && <span className="search-snippet"><Snippet text={r.text || ''} words={words} /></span>}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
