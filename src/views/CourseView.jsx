import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../components/Icon.jsx';
import Markdown, { DiagramFigure } from '../components/Markdown.jsx';
import { api } from '../lib/bridge.js';
import ReadAloud from '../components/ReadAloud.jsx';
import TextSize from '../components/TextSize.jsx';
import { useNavCollapsed, toggleNav } from '../lib/layout.js';
import { headings } from '../lib/markdown.js';
import { insertSchema, removeSchema, suggestDiagrams, defineTerm, redrawSchemaSvg, drawSchemaImage, imageKeywords, reviewSchemaVisual } from '../lib/ai-extra.js';
import { ClaudeSchemaDialog, ClaudeVerifyDialog, ClaudeGenerateDialog } from '../components/ClaudeBridge.jsx';
import { GenBadge, GenHistoryModal } from '../components/GenBadge.jsx';
import { withEvent } from '../lib/genHistory.js';
import CourseChat from '../components/CourseChat.jsx';
import AskBubble from '../components/AskBubble.jsx';
import { PodcastButton } from '../components/Podcast.jsx';
import DiagramQuiz, { maskDiagram } from '../components/DiagramQuiz.jsx';
import PhoneReviewModal from '../components/PhoneReviewModal.jsx';
import { DOMAIN } from '../lib/domain.js';
import FlashcardSession from '../components/FlashcardSession.jsx';
import QuizSession from '../components/QuizSession.jsx';
import { Segmented, Empty, StatusChip, courseColor, SOURCE_ICON } from '../components/common.jsx';
import { useToast } from '../components/Toast.jsx';
import { useDb, getCourse, getCards, getQuestions, getFolders, updateCourse, deleteCourse, deleteCard, deleteQuestion, replaceMedia, addCards, uid, setAcquired } from '../lib/db.js';
import { ACCEPTED, extractFile, isImage, buildMedia } from '../lib/extract.js';
import { enqueue } from '../lib/jobs.js';
import { shuffle, pickQuestions } from '../lib/pick.js';
import { mastery, newSrs } from '../lib/srs.js';
import { normTerm, highlightTerm, unhighlightTerm } from '../lib/terms.js';
import { setUsageContext } from '../lib/usage.js';
import SynthesisDrawer from '../components/SynthesisDrawer.jsx';
import { useMarkDecorations, MarkDialog, TocRail, blockOf, anchorFor } from '../components/CourseMarks.jsx';
import { useModernEffects, ReadingProgress, Reperes, RepereDialog } from '../components/CourseExtras.jsx';
import { FindBar, useCourseFind, useHitsByHeading, scrollToHit } from '../components/CourseFind.jsx';
import { useReadingResume } from '../components/ReadingResume.jsx';
import { useTableTools, useCloze, ClozeBar, CourseGallery, readingTimes } from '../components/CourseTools.jsx';
import { useSettings } from '../lib/settings.jsx';
import { sheetClass } from '../lib/courseStyle.js';

export default function CourseView({ go, route, jobs, hasKey }) {
  const id = route.id;
  const toast = useToast();
  const data = useDb(async () => {
    const [course, cards, questions, folders] = await Promise.all([getCourse(id), getCards(id), getQuestions(id), getFolders()]);
    return { course, cards, questions, folders };
  }, [id]);
  const [tab, setTab] = useState(route.tab || 'fiche');
  useEffect(() => { setUsageContext({ view: 'course', courseId: id, tab }); }, [id, tab]);
  const [synthOpen, setSynthOpen] = useState(route.synthesis || null); // null | 'side' | 'wide' | 'last'
  const [phoneOpen, setPhoneOpen] = useState(false);
  const navCollapsed = useNavCollapsed();
  const [session, setSession] = useState(null);
  const [text, setText] = useState(null);
  const [nQuiz, setNQuiz] = useState(10);
  const [confirmDel, setConfirmDel] = useState(false);
  const [attachBusy, setAttachBusy] = useState(false);
  const [genOpen, setGenOpen] = useState(false);
  // Sommaire replié ou déplié : le choix est gardé sur cet ordinateur
  const [tocOpen, setTocOpen] = useState(() => { try { return localStorage.getItem('toc-open') !== '0'; } catch { return true; } });
  const toggleToc = () => setTocOpen((o) => {
    const next = !o;
    try { localStorage.setItem('toc-open', next ? '1' : '0'); } catch { /* stockage indisponible */ }
    return next;
  });
  const attachInput = useRef(null);
  const ficheRef = useRef(null);
  const [sel, setSel] = useState(null); // mot ou passage sélectionné dans la fiche
  const [markDialog, setMarkDialog] = useState(null); // marque-page en cours de création ou de modification
  const [repDialog, setRepDialog] = useState(null); // repère (date, chiffre, auteur) choisi à la main
  const [termDialog, setTermDialog] = useState(null); // fenêtre « mot important »
  const [changing, setChanging] = useState(null); // id du schéma à changer
  const [claudeSchema, setClaudeSchema] = useState(null); // id du schéma à améliorer avec Claude
  const [claudeGen, setClaudeGen] = useState(null); // fenêtre « Générer avec Claude » : tâches cochées au départ
  const [claudeVerify, setClaudeVerify] = useState(false); // fenêtre « Vérifier avec Claude » (false | 'manual' | 'auto')
  const [geminiFixing, setGeminiFixing] = useState(null); // id du schéma relu par Gemini
  const [histOpen, setHistOpen] = useState(false); // historique des générations
  // Sélection d'un mot dans la fiche : affiche le bouton « Surligner ce mot »
  useEffect(() => {
    const check = () => {
      const s = window.getSelection();
      const txt = s ? s.toString().trim() : '';
      const root = ficheRef.current;
      const node = s && s.anchorNode ? (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement) : null;
      // Seulement dans le texte du cours (pas dans les champs, boutons ou titres d'outils)
      if (!s || s.isCollapsed || !root || !node || !root.contains(node) || !node.closest('.prose') || txt.length < 2 || txt.length > 400) { setSel(null); return; }
      // Mot court : « Surligner » et « Marque-page » ; passage plus long : « Marque-page » seulement
      const block = blockOf(s.anchorNode, root);
      const anchor = block ? anchorFor(block, root, txt.split('\n')[0]) : null;
      const short = txt.length <= 60 && !/\n/.test(txt);
      if (!short && !anchor) { setSel(null); return; }
      const r = s.getRangeAt(0).getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) { setSel(null); return; } // mot sorti de l'écran
      // Au-dessus du mot s'il y a la place, sinon en dessous (jamais hors de l'écran)
      setSel({ text: txt, short, anchor, ctx: block ? block.textContent.replace(/\s+/g, ' ').trim() : '', x: Math.min(window.innerWidth - 170, Math.max(170, r.left + r.width / 2)), y: r.top > 56 ? r.top - 46 : r.bottom + 10 });
    };
    document.addEventListener('mouseup', check);
    document.addEventListener('keyup', check);
    window.addEventListener('scroll', check, true); // le bouton suit le mot pendant le défilement
    return () => { document.removeEventListener('mouseup', check); document.removeEventListener('keyup', check); window.removeEventListener('scroll', check, true); };
  }, []);

  useEffect(() => { if (data?.course && text === null) setText(data.course.text); }, [data, text]);

  // Apparence des cours (Réglages) ; « Moderne » : apparition au défilement et parties repliables
  const { settings } = useSettings();
  const modern = (settings.courseStyle || 'sobre') === 'moderne';
  useModernEffects(ficheRef, modern && tab === 'fiche', [data?.course?.summary, tab, !!data]);
  // Recherche dans le cours (⌘F / Ctrl F) ; route.find = mots venus de la recherche globale
  const [findOpen, setFindOpen] = useState(!!route.find);
  const [findQuery, setFindQuery] = useState(route.find || '');
  const [findCur, setFindCur] = useState(0);
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setTab('fiche');
        setFindOpen(true);
        if (findOpen) document.querySelector('.find-input')?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [findOpen]);
  const findHits = useCourseFind(ficheRef, findOpen && tab === 'fiche' ? findQuery : '', findCur, [data?.course?.summary, tab, !!data, settings.courseStyle]);
  const hitsByHeading = useHitsByHeading(findHits);
  // En tapant : on va au premier résultat
  useEffect(() => {
    if (!findHits.length) return undefined;
    const t = setTimeout(() => scrollToHit(findHits[findCur % findHits.length]), 200);
    return () => clearTimeout(t);
  }, [findHits]); // eslint-disable-line react-hooks/exhaustive-deps
  // Tableaux dynamiques, révision active, galerie des images d'origine
  const [clozeOn, setClozeOn] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  useTableTools(ficheRef, [data?.course?.summary, tab, !!data, settings.courseStyle, clozeOn]);
  const cloze = useCloze(ficheRef, clozeOn && tab === 'fiche', [data?.course?.summary, tab, !!data]);
  // Reprendre la lecture là où on s'était arrêté (sauf si on arrive pour une recherche)
  const resumeBanner = useReadingResume(ficheRef, id, tab === 'fiche' && !route.find, !!data?.course?.summary);
  // Marque-pages : surlignage et drapeaux dans le cours, clic sur un drapeau = modifier
  const marks = data?.course?.marks || [];
  const placedMarks = useMarkDecorations(ficheRef, marks, [data?.course?.summary, JSON.stringify(marks), tab, !!data]);
  useEffect(() => {
    const root = ficheRef.current;
    if (!root) return undefined;
    const onClick = (e) => {
      const f = e.target.closest?.('.mk-flag');
      if (!f) return;
      e.preventDefault();
      const m = (data?.course?.marks || []).find((x) => x.id === f.dataset.mid);
      if (m) setMarkDialog(m);
    };
    root.addEventListener('click', onClick);
    return () => root.removeEventListener('click', onClick);
  }, [data, tab]);

  if (!data) return null;
  const { course, cards, questions, folders } = data;
  if (!course) return <Empty icon="alert" title="Cours introuvable"><button className="btn" onClick={() => go('library')}>Retour</button></Empty>;

  const job = jobs.get(id);
  const run = (tasks, opts) => {
    if (!hasKey) { toast({ type: 'error', text: 'Ajoute ta clé Gemini dans Réglages.' }); return; }
    enqueue(id, tasks, opts);
  };

  // Joindre le fichier d'origine (ou des captures) à un cours existant : seule la fiche est
  // régénérée, les flashcards, les QCM et la progression sont conservés.
  const attachSchemas = async (fileList) => {
    const files = [...fileList];
    if (!files.length) return;
    if (!hasKey) { toast({ type: 'error', text: 'Ajoute ta clé Gemini dans Réglages.' }); return; }
    setAttachBusy(true);
    try {
      const items = [];
      const texts = [];
      for (const f of files) {
        if (isImage(f)) items.push({ kind: 'image', blob: f, name: `Image ${items.length + 1}` });
        else {
          const r = await extractFile(f);
          (r.mediaItems || []).forEach((m) => items.push({ ...m, name: /^Image \d+$/.test(m.name || '') ? `Image ${items.length + 1}` : m.name }));
          if (r.text && r.text.trim().length > 200) texts.push(r.text.trim());
        }
      }
      const media = await buildMedia(items);
      // Fichier d'origine réimporté : son texte remplace l'ancien (liens, vidéos et places des images retrouvés)
      if (texts.length) await updateCourse(id, { text: texts.join('\n\n') });
      if (!media.length && texts.length) {
        toast({ type: 'success', text: 'Fichier d’origine relu (liens et vidéos compris) : le cours est en cours de régénération.' });
        run(['summary']);
        return;
      }
      if (!media.length) {
        toast({ type: 'error', text: "Aucun schéma exploitable dans ce fichier. Si les schémas sont dessinés avec les formes de PowerPoint, enregistre la présentation en PDF (moins de 6 Mo) et ajoute ce PDF, ou ajoute des captures d'écran." });
        return;
      }
      await replaceMedia(id, media);
      toast({ type: 'success', text: `${media.length} image${media.length > 1 ? 's' : ''} du cours d'origine${texts.length ? ', liens et vidéos' : ''} : le cours est en cours de régénération.` });
      run(['summary']);
    } catch (err) {
      toast({ type: 'error', text: err.message });
    } finally {
      setAttachBusy(false);
    }
  };
  const attachButton = (
    <>
      <button className="btn sm ghost" disabled={!!job || attachBusy} onClick={() => attachInput.current?.click()}
        title="Joins le PowerPoint, le Word, le PDF ou des photos d'origine : l'IA reprend ses images (affichées dans le cours quand elles sont utiles), ses liens et ses vidéos, et recrée les schémas. Les flashcards et ta progression sont conservées.">
        {attachBusy ? <span className="spinner" /> : <Icon name="image" size={14} />} {course.mediaCount ? 'Relire le fichier d’origine' : 'Ajouter le fichier d’origine'}
      </button>
      <input ref={attachInput} type="file" multiple hidden accept={ACCEPTED} onChange={(e) => { attachSchemas(e.target.files); e.target.value = ''; }} />
    </>
  );

  const times = readingTimes(course.summary || '');
  // Marque-pages : enregistrés dans le cours (course.marks)
  const railToc = headings(course.summary || '', 2).filter((h) => h.level <= 3);
  const saveMark = async (m) => {
    const list = course.marks || [];
    const next = m.id ? list.map((x) => (x.id === m.id ? { ...x, ...m } : x)) : [...list, { ...m, id: uid(), createdAt: Date.now() }];
    await updateCourse(id, { marks: next });
    setMarkDialog(null);
    toast({ type: 'success', text: m.id ? 'Marque-page modifié' : 'Marque-page ajouté (visible dans le sommaire, à droite)' });
  };
  // Repères choisis à la main (course.reperes) ; onSave(null) = supprimer
  const saveRepere = async (r) => {
    const list = course.reperes || [];
    const target = repDialog;
    const next = r == null ? list.filter((x) => x.id !== target?.id)
      : r.id ? list.map((x) => (x.id === r.id ? r : x)) : [...list, { ...r, id: uid(), createdAt: Date.now() }];
    await updateCourse(id, { reperes: next });
    setRepDialog(null);
    if (r && !r.id) toast({ type: 'success', text: `« ${r.label} » ajouté aux repères du cours` });
  };
  const deleteMark = async (mid) => {
    await updateCourse(id, { marks: (course.marks || []).filter((x) => x.id !== mid) });
    setMarkDialog(null);
  };
  // « Marque-page ici » : sur le premier paragraphe visible
  const addMarkHere = () => {
    const root = ficheRef.current;
    if (!root) return;
    const blocks = [...root.querySelectorAll('.prose :is(p, li, h2, h3, h4, h5, blockquote)')];
    const b = blocks.find((x) => x.getBoundingClientRect().top >= 90) || blocks[0];
    if (!b) return;
    setMarkDialog({ ...anchorFor(b, root, ''), quote: '', color: 'yellow', note: '' });
  };

  // Mot important : glossaire, surlignage dans la fiche, et flashcard (une seule par mot)
  const addTerm = async (term, definition, sources = []) => {
    const nk = normTerm(term);
    const before = course.summary || '';
    const after = highlightTerm(before, term);
    await updateCourse(id, {
      keyTerms: [...(course.keyTerms || []).filter((k) => normTerm(k.term) !== nk), { term, definition, manual: true, ...(sources.length ? { sources } : {}) }],
      summary: after,
    });
    const hasCard = (await getCards(id)).some((c) => normTerm(c.front) === nk);
    if (!hasCard) await addCards([{ id: uid(), courseId: id, front: term, back: definition, category: 'Définition', srs: newSrs(), createdAt: Date.now() }]);
    setTermDialog(null);
    toast({ type: 'success', text: `« ${term} » ${after !== before ? 'surligné dans le cours, ' : ''}ajouté au glossaire${hasCard ? '' : ' et aux flashcards'}` });
  };
  // Remplace les champs d'un schéma (svg, image, source…) puis ferme la fenêtre
  const saveDiagram = async (diagId, patch) => {
    await updateCourse(id, { diagrams: (course.diagrams || []).map((x) => (x.id === diagId ? { ...x, ...patch } : x)) });
    setChanging(null);
    toast({ type: 'success', text: 'Schéma mis à jour' });
  };
  // Nouveau SVG d'un schéma (Claude ou Gemini) : l'ancien est gardé pour pouvoir annuler
  const replaceSvg = async (diagId, svg, by) => {
    const d0 = (course.diagrams || []).find((x) => x.id === diagId);
    await updateCourse(id, {
      diagrams: (course.diagrams || []).map((x) => (x.id === diagId ? { ...x, svg, image: undefined, prev: { svg: x.svg, image: x.image, credit: x.credit, source: x.source }, improvedBy: by } : x)),
      genHistory: withEvent(course, { kind: 'schema', by: by === 'Claude' ? 'claude' : 'gemini', detail: d0?.title || '' }),
    });
    toast({ type: 'success', text: `Schéma amélioré par ${by}` });
  };
  const undoSvg = (diagId) => updateCourse(id, {
    diagrams: (course.diagrams || []).map((x) => (x.id === diagId && x.prev ? { ...x, ...x.prev, prev: undefined, improvedBy: undefined } : x)),
    genHistory: withEvent(course, { kind: 'annulation', by: 'toi', detail: `Schéma « ${(course.diagrams || []).find((x) => x.id === diagId)?.title || ''} » remis comme avant` }),
  });
  const geminiFix = async (d) => {
    if (!hasKey) { toast({ type: 'error', text: 'Ajoute ta clé Gemini dans Réglages.' }); return; }
    setGeminiFixing(d.id);
    try {
      const svg = await reviewSchemaVisual(course, d);
      if (svg) await replaceSvg(d.id, svg, 'Gemini');
      else toast({ type: 'info', text: 'Gemini n’a vu aucun défaut à corriger sur ce schéma.' });
    } catch (e) { toast({ type: 'error', text: e.message }); }
    setGeminiFixing(null);
  };
  const applyVerify = async (md, applied, missed) => {
    await updateCourse(id, { summary: md, summaryBackup: course.summary, verifiedAt: Date.now(), genHistory: withEvent(course, { kind: 'verification', by: 'claude', detail: `${applied} correction${applied > 1 ? 's' : ''} appliquée${applied > 1 ? 's' : ''}` }) });
    setClaudeVerify(false);
    toast({ type: 'success', text: `${applied} correction${applied > 1 ? 's' : ''} appliquée${applied > 1 ? 's' : ''}${missed ? ` (${missed} passage${missed > 1 ? 's' : ''} introuvable${missed > 1 ? 's' : ''})` : ''}` });
  };
  const removeTerm = (term) => updateCourse(id, {
    keyTerms: (course.keyTerms || []).filter((k) => normTerm(k.term) !== normTerm(term)),
    summary: unhighlightTerm(course.summary || '', term),
  });

  if (session?.type === 'cards') return <FlashcardSession cards={session.list} title={course.title} onExit={() => setSession(null)} />;
  if (session?.type === 'diagrams') return <DiagramQuiz diagrams={course.diagrams || []} title={course.title} onExit={() => setSession(null)} />;
  if (session?.type === 'quiz') return <QuizSession questions={session.list} title={course.title} courseId={id} onExit={() => setSession(null)} />;

  const mastered = cards.filter((c) => mastery(c) === 'mastered').length;
  // Schémas déjà placés dans le texte du cours (repères [[schema:N]])
  const placedIds = new Set([...(course.summary || '').matchAll(/\[\[schema:(\d+)\]\]/g)].map((m) => Number(m[1])));
  const summaryDiagrams = (course.diagrams || []).filter((d) => !d.generated || placedIds.has(Number(d.id)));
  const canDiagramQuiz = DOMAIN.features?.diagramQuiz && (course.diagrams || []).some((d) => maskDiagram(d));
  // Export PDF : la page passe en mode impression (fiche seule, fond blanc) le temps de l'export
  const exportPdf = async () => {
    document.body.classList.add('print-fiche');
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
      const r = await api.printPdf({ title: course.title });
      if (r?.ok && r.path) toast({ type: 'success', text: 'Fiche enregistrée en PDF' });
      else if (r && !r.ok && r.error) toast({ type: 'error', text: r.error });
    } finally {
      document.body.classList.remove('print-fiche');
    }
  };
  // Schémas générés pas encore placés dans une partie du cours
  const generatedDiagrams = (course.diagrams || []).filter((d) => d.generated && !placedIds.has(Number(d.id)));
  // Actions sous un schéma généré : le placer dans le cours, le supprimer
  const schemaActions = (d) => (
    <div className="diagram-actions">
      <span className="small" style={{ color: '#6b7085' }}>{d.generated ? (d.request ? `Demande : « ${d.request} »` : 'Choisi par l’IA') : (d.credit ? '' : '')}</span>
      <button className="btn sm ghost" onClick={() => setChanging(d.id)}><Icon name="edit" size={14} /> Changer le schéma</button>
      {d.source !== 'cours' && <button className="btn sm ghost cb-btn" onClick={() => setClaudeSchema(d.id)} title="Claude redessine ce schéma (avec ton compte claude.ai)"><Icon name="sparkles" size={14} /> Améliorer avec Claude</button>}
      {d.svg && <button className="btn sm ghost" disabled={geminiFixing != null} onClick={() => geminiFix(d)} title="Gemini regarde le schéma comme une image et corrige ce qui dépasse, se chevauche ou manque">
        <Icon name={geminiFixing === d.id ? 'refresh' : 'search'} size={14} /> {geminiFixing === d.id ? 'Relecture…' : 'Relire avec Gemini'}</button>}
      {d.prev && <button className="btn sm ghost" onClick={() => undoSvg(d.id)} title={`Remettre le schéma d’avant (amélioré par ${d.improvedBy || 'l’IA'})`}><Icon name="rotate" size={14} /> Annuler la modification</button>}
      {d.generated && !placedIds.has(Number(d.id)) && (
        <button className="btn sm ghost" onClick={() => updateCourse(id, { summary: insertSchema(course.summary || '', d.section || '', d.id) })}>Mettre dans le cours</button>
      )}
      {d.generated && (
        <button className="btn icon sm ghost" title="Supprimer ce schéma" aria-label="Supprimer ce schéma"
          onClick={() => updateCourse(id, { diagrams: (course.diagrams || []).filter((x) => x.id !== d.id), summary: removeSchema(course.summary || '', d.id) })}>
          <Icon name="trash" size={14} />
        </button>
      )}
    </div>
  );
  const toc = headings(course.summary || '').filter((h) => h.level === 1 || h.level === 2).filter((h, i, a) => a.some((x) => x.level === 1) ? h.level === 1 : true);

  return (
    <>
      <button className="back-link" onClick={() => go('library')}><Icon name="left" size={16} /> Mes cours</button>
      <div className="row course-head" style={{ alignItems: 'flex-start', gap: 16, marginBottom: 22 }}>
        <div className="course-icon" style={{ width: 52, height: 52, borderRadius: 17, background: courseColor(course.subject || course.title) }}>
          <Icon name={SOURCE_ICON[course.sourceType] || 'file'} size={22} />
        </div>
        <div className="grow">
          <input
            className="title-input" defaultValue={course.title} key={course.title}
            onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== course.title) updateCourse(id, { title: v, titleLocked: true }); }}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
          <div className="row wrap" style={{ marginTop: 6 }}>
            <input
              className="chip" style={{ outline: 'none', width: Math.max(110, (course.subject || '').length * 8 + 30) }}
              defaultValue={course.subject} key={course.subject} placeholder="+ Matière"
              onBlur={(e) => e.target.value !== course.subject && updateCourse(id, { subject: e.target.value.trim() })}
            />
            <StatusChip course={course} job={job} />
            {!job && <GenBadge course={course} onClick={() => setHistOpen(true)} />}
            <button className="btn sm ghost" onClick={() => setHistOpen(true)} title="Historique des générations de ce cours (Gemini, Claude)">🕘 Historique</button>
            <select className="select sm-select" aria-label="Dossier du cours" value={course.folderId || ''}
              onChange={(e) => updateCourse(id, { folderId: e.target.value || null })}>
              <option value="">Sans dossier</option>
              {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            {course.sourceName && <span className="faint small">{course.sourceName}</span>}
          </div>
        </div>
        <div className="row">
          <TextSize />
          <div className={`synth-split ${course.synthesis ? '' : 'missing'}`} role="group" aria-label="Synthèse du cours">
            <button className="synth-main" onClick={() => go('syntheses', { id })}
              title={course.synthesis ? 'Ouvrir la synthèse en pleine page (menu Synthèses)' : 'Synthèse du cours (pas encore créée)'}>
              <Icon name="clipboard" size={16} /> Synthèse{!course.synthesis && <span className="synth-dot" aria-hidden="true" />}
            </button>
            <button className={`synth-alt ${synthOpen === 'side' ? 'on' : ''}`} onClick={() => setSynthOpen((o) => (o === 'side' ? null : 'side'))} title="Synthèse sur le côté, à côté du cours" aria-label="Ouvrir la synthèse sur le côté"><Icon name="sidebar" size={15} /></button>
            <button className="synth-alt" onClick={() => go('syntheses', { id })} title="Synthèse en pleine page" aria-label="Ouvrir la synthèse en pleine page"><Icon name="expand" size={15} /></button>
          </div>
          <button className={`btn ${course.acquired ? 'acquired-on' : 'ghost'}`} aria-pressed={!!course.acquired} onClick={() => setAcquired(id, !course.acquired)}
            title={course.acquired ? 'Ce cours est acquis : clique pour le remettre « à réviser »' : 'Cocher ce cours comme acquis'}>
            <Icon name="check" size={15} /> {course.acquired ? 'Acquis' : 'Marquer acquis'}
          </button>
          <button className={`btn icon ghost ${navCollapsed ? 'on' : ''}`} onClick={toggleNav} aria-pressed={navCollapsed}
            title={navCollapsed ? 'Réafficher le menu (⌘/Ctrl B)' : 'Agrandir le cours : ranger le menu (⌘/Ctrl B)'} aria-label={navCollapsed ? 'Réafficher le menu' : 'Agrandir le cours'}>
            <Icon name={navCollapsed ? 'sidebar' : 'expand'} />
          </button>
          {course.status !== 'ready' && !job && <button className="btn accent" onClick={() => run()}><Icon name="sparkles" /> Générer avec l'IA</button>}
          {confirmDel ? (
            <>
              <button className="btn danger" onClick={async () => { await deleteCourse(id); go('library'); }}>Confirmer</button>
              <button className="btn ghost" onClick={() => setConfirmDel(false)}>Annuler</button>
            </>
          ) : (
            <button className="btn icon ghost" title="Supprimer le cours" onClick={() => setConfirmDel(true)}><Icon name="trash" /></button>
          )}
        </div>
      </div>

      {course.status === 'error' && !job && (
        <div className="card row" style={{ marginBottom: 16, borderColor: 'rgba(239,68,68,.35)' }}>
          <Icon name="alert" style={{ color: 'var(--danger)' }} />
          <div className="grow small">{course.error}</div>
          <button className="btn sm" onClick={() => run()}>Réessayer</button>
          <button className="btn sm accent" onClick={() => setClaudeGen(['course', 'synthesis', 'cards', 'questions'].filter((t) => t === 'course' || (t === 'cards' ? !cards.length : t === 'questions' ? !questions.length : !course.synthesis)))}
            title="Solution de secours : Claude rédige le cours à la place de Gemini (avec ton compte claude.ai)"><Icon name="sparkles" size={14} /> Générer avec Claude</button>
        </div>
      )}

      {job && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="row between small"><b className="row"><span className="spinner" style={{ color: 'var(--accent)' }} /> {job.label}</b><span className="faint">{job.step}/{job.total}</span></div>
          <div className="progress" style={{ marginTop: 10 }}><i style={{ transform: `scaleX(${Math.max(0.06, job.step / job.total)})` }} /></div>
        </div>
      )}

      <Segmented
        value={tab} onChange={setTab}
        options={[
          { value: 'fiche', label: 'Cours', icon: 'file' },
          { value: 'deepen', label: 'Approfondir', icon: 'zap' },
          { value: 'chat', label: 'Questions', icon: 'brain', count: (course.chat || []).filter((m) => m.role === 'user').length || undefined },
          { value: 'cards', label: 'Flashcards', icon: 'layers', count: cards.length },
          { value: 'quiz', label: 'QCM', icon: 'quiz', count: questions.length },
          { value: 'text', label: 'Texte source', icon: 'text' },
        ]}
      />

      <div key={tab} className="view-enter" style={{ marginTop: 20 }}>
        {tab === 'fiche' && (
          course.summary ? (
            <>
              <div className="print-area">
              <div className="print-head">
                <h1>{course.title}</h1>
                {course.subject && <div>{course.subject}</div>}
              </div>
              <div className={`card ${sheetClass(settings)}`} ref={ficheRef} style={{ padding: '30px 36px' }}>
                <div className="row between wrap fiche-head" style={{ marginBottom: 14, gap: 8 }}>
                  <span className="row" style={{ gap: 6 }}>
                    <span className="chip accent"><Icon name="sparkles" size={12} /> Cours complet</span>
                    <span className="chip" title="Temps de lecture estimé (200 mots par minute)">≈ {times.total} min de lecture</span>
                  </span>
                  <div className="row wrap fiche-tools" style={{ gap: 6 }}>
                    <button className={`btn sm ${clozeOn ? 'accent' : 'ghost'}`} aria-pressed={clozeOn} onClick={() => setClozeOn((o) => !o)}
                      title="Les mots clés, le gras, les dates et les auteurs sont cachés : retrouve-les, puis clique pour vérifier">
                      🧠 Révision active
                    </button>
                    {course.mediaCount > 0 && (
                      <button className="btn sm ghost" onClick={() => setGalleryOpen(true)} title="Toutes les images du fichier d'origine, à placer dans le cours">
                        <Icon name="image" size={14} /> Images du cours
                      </button>
                    )}
                    <ReadAloud text={course.summary} />
                    <PodcastButton course={course} hasKey={hasKey} />
                    <button className="btn sm ghost" onClick={exportPdf} title="Enregistrer la fiche (avec ses schémas et le glossaire) en PDF, pour l'imprimer ou la garder"><Icon name="download" size={14} /> PDF</button>
                    {canDiagramQuiz && (
                      <button className="btn sm ghost" onClick={() => setSession({ type: 'diagrams' })} title="Les étiquettes des schémas sont masquées : retrouve-les">
                        <Icon name="target" size={14} /> Schémas à trous
                      </button>
                    )}
                    {attachButton}
                    <button className="btn sm ghost" disabled={!!job} onClick={() => setGenOpen((o) => !o)}
                      title="L'IA dessine de nouveaux schémas à partir du cours (carte mentale, étapes, classification…)">
                      <Icon name="sparkles" size={14} /> Générer des schémas
                    </button>
                    {!/^>\[(?:def|ex|retenir|piege|methode)\]|@@|\^\^/m.test(course.summary || '') && (
                      <button className="btn sm ghost" disabled={!!job} onClick={() => run(['colorize'])}
                        title="L'IA ajoute les couleurs (définitions, exemples, pièges, dates, auteurs) sans changer un mot du cours">
                        <Icon name="sparkles" size={14} /> Mettre en couleurs
                      </button>
                    )}
                    <button className="btn sm ghost cb-btn" disabled={!!job} onClick={() => setClaudeVerify(true)} title="Claude compare le cours au texte d'origine et propose des corrections (avec ton compte claude.ai)"><Icon name="check" size={14} /> Vérifier avec Claude</button>
                    {course.summaryBackup && <button className="btn sm ghost" onClick={() => updateCourse(id, { summary: course.summaryBackup, summaryBackup: undefined, verifiedAt: null, genHistory: withEvent(course, { kind: 'annulation', by: 'toi', detail: 'Vérification de Claude annulée' }) })} title="Remettre le cours tel qu'il était avant les corrections de Claude"><Icon name="rotate" size={14} /> Annuler la vérification</button>}
                    <button className="btn sm ghost" disabled={!!job} onClick={() => run(['summary'])}><Icon name="refresh" size={14} /> Régénérer</button>
                    <button className="btn sm ghost cb-btn" disabled={!!job} onClick={() => setClaudeGen(['course'])} title="Solution de secours si Gemini ne répond pas : Claude rédige le cours, la synthèse, les flashcards ou les QCM (avec ton compte claude.ai)"><Icon name="sparkles" size={14} /> Avec Claude</button>
                  </div>
                </div>
                {genOpen && <GeneratePanel job={job} course={course} onRun={({ request, terms, count }) => { run(['diagrams'], { diagramRequest: request, diagramTerms: terms, diagramCount: count }); setGenOpen(false); }} onClose={() => setGenOpen(false)} />}
                {course.fullCourse && !job && !course.verifiedAt && !course.verifyLater && settings.claudeReview !== false && (
                  <div className="cb-banner no-print">
                    <span className="cb-banner-ico" aria-hidden="true">✓</span>
                    <div className="grow"><b>Faire relire ce cours par Claude ?</b><div className="small faint">Claude compare tout le cours au texte d'origine et vérifie chaque ajout de Gemini. Gratuit avec ton compte claude.ai : un clic, tu colles, tu copies sa réponse, le logiciel s'occupe du reste.</div></div>
                    <button className="btn sm accent" onClick={() => setClaudeVerify('auto')}>Relire avec Claude</button>
                    <button className="btn sm ghost" onClick={() => updateCourse(id, { verifyLater: true })}>Plus tard</button>
                  </div>
                )}
                {!course.fullCourse && !job && (
                  <div className="q-context small no-print" style={{ marginBottom: 16 }}>
                    <b>Version courte.</b> Ce cours a été rédigé avant la retranscription complète. Clique sur <b>Régénérer</b> pour obtenir le cours en entier, plus détaillé. Tes flashcards et tes QCM sont conservés.
                  </div>
                )}
                {!course.mediaCount && !summaryDiagrams.length && ['powerpoint', 'word', 'pdf', 'photo'].includes(course.sourceType) && (
                  <div className="q-context small" style={{ marginBottom: 16 }}>
                    <b>Schémas manquants ?</b> Ce cours a été importé avant que les schémas soient conservés. Clique sur <b>Ajouter le fichier d’origine</b> et choisis-le : le cours sera refait avec ses images, ses liens et ses schémas, sans toucher à tes flashcards ni à tes QCM.
                  </div>
                )}
                {toc.length >= 3 && (
                  <div className="toc-wrap no-print">
                    <button className="toc-toggle" onClick={toggleToc} aria-expanded={tocOpen} aria-controls="course-toc-list"
                      title={tocOpen ? 'Replier le sommaire' : 'Déplier le sommaire'}>
                      <span aria-hidden="true">{tocOpen ? '▾' : '▸'}</span> Sommaire <span className="faint">({toc.length})</span>
                    </button>
                    {tocOpen && (
                      <nav id="course-toc-list" className="course-toc" aria-label="Sommaire du cours">
                        {toc.map((h) => (
                          <button key={h.id} className="chip-btn" onClick={() => document.getElementById(h.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{h.text}</button>
                        ))}
                      </nav>
                    )}
                  </div>
                )}
                {(course.reperes || []).length > 0 && <Reperes items={course.reperes} rootRef={ficheRef} onEdit={setRepDialog} onAdd={() => setRepDialog({ label: '', text: '' })} />}
                <Markdown text={course.summary} diagrams={summaryDiagrams} terms={course.keyTerms || []} renderActions={schemaActions} />
              </div>
              <p className="faint small no-print" style={{ margin: '-8px 4px 14px' }}>
                Survole un mot surligné pour voir sa définition. Sélectionne un mot du cours pour le surligner et l'ajouter aux flashcards.{/\{\+|^>\+/m.test(course.summary || '') && <> Les passages <span className="ai-add">en violet</span> ont été complétés par l'IA.</>}
              </p>
              {generatedDiagrams.length > 0 && (
                <>
                  <div className="section-title">
                    <span>Schémas à placer <span className="faint small">{generatedDiagrams.length}</span></span>
                    <span className="faint small">Pas encore dans une partie du cours</span>
                  </div>
                  <div className="gen-grid">
                    {generatedDiagrams.map((d) => <DiagramFigure key={d.id} d={d}>{schemaActions(d)}</DiagramFigure>)}
                  </div>
                  <p className="faint small" style={{ marginTop: 10 }}>Schémas dessinés par l'IA à partir du cours : vérifie-les avant de les apprendre.</p>
                </>
              )}
              {course.keyTerms?.length > 0 && (
                <>
                  <div className="section-title">Glossaire <span className="faint small">{course.keyTerms.length} termes</span></div>
                  <div className="terms">
                    {course.keyTerms.map((k, i) => (
                      <div key={i} className="term selectable">
                        <div className="row between" style={{ gap: 8, alignItems: 'flex-start' }}>
                          <b>{k.term}{k.manual && <span className="chip accent" style={{ marginLeft: 6, fontSize: 11 }}>ajouté par toi</span>}</b>
                          <button className="btn icon sm ghost" title="Retirer ce mot du glossaire et du surlignage" aria-label={`Retirer ${k.term}`} onClick={() => removeTerm(k.term)}><Icon name="x" size={12} /></button>
                        </div>
                        <span>{k.definition}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
              </div>
            </>
          ) : job ? <Skeleton /> : (
            <div className="card"><Empty icon="sparkles" title="Pas encore de fiche" text="L'IA retranscrit le cours en entier, partie par partie, avec les termes clés surlignés et les schémas recréés.">
              <button className="btn accent" onClick={() => run()}><Icon name="sparkles" /> Générer le cours, les flashcards et les QCM</button>
              <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => setClaudeGen(['course', 'synthesis', 'cards', 'questions'])}
                title="Si Gemini ne répond pas : Claude rédige à sa place, avec ton compte claude.ai">Gemini ne répond pas ? Générer avec Claude</button>
            </Empty></div>
          )
        )}

        {tab === 'deepen' && <DeepenTab course={course} job={job} run={run} />}
        {tab === 'chat' && <CourseChat course={course} hasKey={hasKey} />}

        {tab === 'cards' && (
          <>
            <div className="row wrap" style={{ marginBottom: 16 }}>
              <button className="btn primary" disabled={!cards.length} onClick={() => setSession({ type: 'cards', list: shuffle(cards) })}><Icon name="play" size={15} /> Réviser ce cours</button>
              <button className="btn" disabled={!cards.length} onClick={() => setPhoneOpen(true)}><Icon name="phone" size={15} /> Sur mon téléphone</button>
              <button className="btn" disabled={!!job} onClick={() => run(['cards'], { cards: 10 })}><Icon name="plus" /> 10 cartes de plus</button>
              <button className="btn ghost" disabled={!!job || !course.summary} onClick={() => setClaudeGen(['cards'])} title="Si Gemini ne répond pas : Claude écrit les cartes (avec ton compte claude.ai)"><Icon name="sparkles" size={14} /> Avec Claude</button>
              <span className="faint small" style={{ marginLeft: 'auto' }}>{mastered} / {cards.length} maîtrisées</span>
            </div>
            {cards.length === 0 ? (
              <div className="card"><Empty icon="layers" title="Aucune flashcard" text="Génère des cartes recto/verso à partir de ce cours." /></div>
            ) : (
              <div className="grid grid-auto">
                {cards.map((c) => (
                  <div key={c.id} className="mini-card">
                    <div className="row between"><span className="chip">{c.category}</span>
                      <button className="btn icon sm ghost" title="Supprimer" onClick={() => deleteCard(c.id)}><Icon name="trash" size={14} /></button></div>
                    <div className="f selectable">{c.front}</div>
                    <div className="b selectable">{c.back}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'quiz' && (
          <>
            <div className="row wrap" style={{ marginBottom: 16 }}>
              <select className="select" style={{ width: 150 }} value={nQuiz} onChange={(e) => setNQuiz(+e.target.value)}>
                {[5, 10, 20, 40].map((n) => <option key={n} value={n}>{n} questions</option>)}
              </select>
              <button className="btn primary" disabled={!questions.length} onClick={() => setSession({ type: 'quiz', list: pickQuestions(questions, nQuiz) })}><Icon name="play" size={15} /> Lancer le quiz</button>
              <button className="btn" disabled={!!job} onClick={() => run(['questions'], { questions: 8 })}><Icon name="plus" /> 8 questions de plus</button>
              <button className="btn ghost" disabled={!!job || !course.summary} onClick={() => setClaudeGen(['questions'])} title="Si Gemini ne répond pas : Claude écrit les questions (avec ton compte claude.ai)"><Icon name="sparkles" size={14} /> Avec Claude</button>
            </div>
            {questions.length === 0 ? (
              <div className="card"><Empty icon="quiz" title="Aucune question" text="Génère des QCM et des cas cliniques corrigés." /></div>
            ) : (
              <div className="card" style={{ padding: 8 }}>
                {questions.map((q) => (
                  <div key={q.id} className="list-row" style={{ cursor: 'default' }}>
                    <span className={`chip ${q.kind === 'cas' ? 'accent' : ''}`}>{q.kind === 'cas' ? 'Cas' : 'QCM'}</span>
                    {q.cross && <span className="chip warning" title={q.relatedTitles?.join(', ')}><Icon name="link" size={11} /></span>}
                    <div className="grow selectable" style={{ fontSize: 14 }}>{q.question}</div>
                    <span className="faint small">{q.stats?.seen ? `${Math.round((q.stats.right / q.stats.seen) * 100)}%` : 'nouvelle'}</span>
                    <button className="btn icon sm ghost" title="Supprimer" onClick={() => deleteQuestion(q.id)}><Icon name="trash" size={14} /></button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'text' && (
          <div className="card">
            <textarea className="textarea text-source" style={{ minHeight: 420 }} value={text ?? ''} onChange={(e) => setText(e.target.value)} />
            <div className="row" style={{ marginTop: 14, justifyContent: 'flex-end' }}>
              <span className="faint small grow">{(text || '').length.toLocaleString('fr-FR')} caractères — corrige l'OCR si besoin, puis régénère.</span>
              <button className="btn" disabled={text === course.text} onClick={async () => { await updateCourse(id, { text }); toast({ type: 'success', text: 'Texte enregistré' }); }}>Enregistrer</button>
              <button className="btn accent" disabled={!!job} onClick={async () => { await updateCourse(id, { text }); run(['summary', 'cards', 'questions']); }}>
                <Icon name="sparkles" /> Enregistrer et régénérer
              </button>
            </div>
          </div>
        )}
      </div>
      {sel && !termDialog && !markDialog && createPortal(
        <div className="sel-bar" style={{ left: sel.x, top: sel.y }} onMouseDown={(e) => e.preventDefault()}>
          {sel.short && (
            <button type="button" className="term-hit" onClick={() => { setTermDialog({ term: sel.text, ctx: sel.ctx, heading: headingOfSel(sel) }); setSel(null); }}>
              <Icon name="sparkles" size={13} /> Surligner ce mot
            </button>
          )}
          {sel.short && sel.anchor && (
            <button type="button" className="mark-hit rep-hit" title="Ajouter aux repères du cours (date, chiffre clé, auteur)"
              onClick={() => {
                const block = sel.anchor.blockText || '';
                const sentence = (sel.ctx || block).split(/(?<=[.!?])\s+/).find((x) => x.includes(sel.text)) || sel.ctx || '';
                setRepDialog({ label: sel.text, text: sentence.replace(/\s+/g, ' ').trim().slice(0, 240), blockText: block });
                setSel(null); getSelection()?.removeAllRanges();
              }}>
              🎯 Repère
            </button>
          )}
          {sel.anchor && (
            <button type="button" className="mark-hit" onClick={() => { setMarkDialog({ ...sel.anchor, color: 'yellow', note: '' }); setSel(null); getSelection()?.removeAllRanges(); }}>
              <Icon name="bookmark" size={13} /> Marque-page
            </button>
          )}
          <button type="button" className="mark-hit ask-hit" title="Poser une question sur ce passage"
            onClick={() => { window.dispatchEvent(new CustomEvent('ask-course', { detail: { quote: sel.text, paragraph: sel.ctx, heading: headingOfSel(sel) } })); setSel(null); }}>
            <Icon name="search" size={13} /> Demander
          </button>
        </div>, document.body)}
      {tab === 'fiche' && course.summary && synthOpen !== 'side' && (
        <TocRail rootRef={ficheRef} toc={railToc} marks={marks} placed={placedMarks} onEdit={setMarkDialog} onAddHere={addMarkHere}
          times={times.per} find={{ query: findOpen ? findQuery : '', byHeading: hitsByHeading, total: findHits.length, current: findHits.length ? findCur % findHits.length : -1, onPick: (i) => { setFindCur(i); scrollToHit(findHits[i]); } }} />
      )}
      {modern && tab === 'fiche' && course.summary && <ReadingProgress />}
      {tab === 'fiche' && course.summary && <AskBubble course={course} hasKey={hasKey} onOpenChat={() => setTab('chat')} />}
      {tab === 'fiche' && resumeBanner}
      {clozeOn && tab === 'fiche' && <ClozeBar {...cloze} onClose={() => setClozeOn(false)} />}
      {galleryOpen && <CourseGallery course={course} toast={toast} onClose={() => setGalleryOpen(false)} />}
      {findOpen && tab === 'fiche' && <FindBar query={findQuery} setQuery={setFindQuery} hits={findHits} current={findHits.length ? findCur % findHits.length : 0} setCurrent={setFindCur} onClose={() => { setFindOpen(false); setFindQuery(''); }} />}
      {repDialog && <RepereDialog initial={repDialog} onClose={() => setRepDialog(null)} onSave={saveRepere} />}
      {markDialog && <MarkDialog mark={markDialog} onSave={saveMark} onDelete={deleteMark} onClose={() => setMarkDialog(null)} />}
      {changing != null && (course.diagrams || []).some((x) => x.id === changing) && (
        <ChangeSchemaDialog course={course} diagram={(course.diagrams || []).find((x) => x.id === changing)}
          onSave={(patch) => saveDiagram(changing, patch)} onClose={() => setChanging(null)} />
      )}
      {claudeSchema != null && (course.diagrams || []).some((x) => x.id === claudeSchema) && (
        <ClaudeSchemaDialog course={course} d={(course.diagrams || []).find((x) => x.id === claudeSchema)}
          onSave={async (svg) => { await replaceSvg(claudeSchema, svg, 'Claude'); setClaudeSchema(null); }} onClose={() => setClaudeSchema(null)} />
      )}
      {histOpen && <GenHistoryModal courses={[course]} go={go} onClose={() => setHistOpen(false)} onRegenerate={() => { setHistOpen(false); run(['summary']); }} />}
      {claudeGen && <ClaudeGenerateDialog course={course} initial={claudeGen} onClose={() => setClaudeGen(null)} />}
      {claudeVerify && <ClaudeVerifyDialog course={course} autoStart={claudeVerify === 'auto'} onApply={applyVerify} onClose={() => setClaudeVerify(false)} />}
      {synthOpen && <SynthesisDrawer key={synthOpen} courseId={id} job={job} go={go} fromCourse initialWide={false} onClose={() => setSynthOpen(null)} />}
      {termDialog && <TermDialog course={course} initialTerm={termDialog.term} ctx={{ paragraph: termDialog.ctx || '', heading: termDialog.heading || '' }} onSave={addTerm} onClose={() => setTermDialog(null)} />}
      {phoneOpen && <PhoneReviewModal cards={shuffle(cards)} title={course.title} courseNames={{ [course.id]: course.title }} onClose={() => setPhoneOpen(false)} />}
    </>
  );
}

/** Consigne facultative pour les schémas générés à la demande. */
function GeneratePanel({ job, course, onRun, onClose }) {
  const terms = (course.keyTerms || []).map((k) => k.term).filter(Boolean);
  const sections = headings(course.summary || '').map((h) => h.text);
  const MAX_TERMS = 4;
  const [request, setRequest] = useState('');
  const [picked, setPicked] = useState([]);
  const [count, setCount] = useState(2);
  const [ideas, setIdeas] = useState([]);
  const [ideasBusy, setIdeasBusy] = useState(false);
  const [ideasErr, setIdeasErr] = useState('');

  // Propositions de schémas faites par l'IA à partir du cours
  const loadIdeas = async () => {
    setIdeasBusy(true); setIdeasErr('');
    try { setIdeas(await suggestDiagrams(course, { sections })); }
    catch (err) { setIdeasErr(err.message); }
    finally { setIdeasBusy(false); }
  };
  useEffect(() => { loadIdeas(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleTerm = (t) => setPicked((p) => (p.includes(t) ? p.filter((x) => x !== t) : p.length >= MAX_TERMS ? p : [...p, t]));
  const launch = (opts) => { if (!job) onRun(opts); };

  return (
    <div className="gen-panel view-enter">
      <div className="field">
        <div className="row between wrap" style={{ gap: 8 }}>
          <label>Propositions de l'IA</label>
          <button className="btn sm ghost" disabled={ideasBusy || !!job} onClick={loadIdeas}>
            {ideasBusy ? <span className="spinner" /> : <Icon name="refresh" size={13} />} Autres idées
          </button>
        </div>
        {ideasErr && <div className="small" style={{ color: 'var(--danger)', marginTop: 6 }}>{ideasErr}</div>}
        {ideasBusy && !ideas.length && <div className="faint small" style={{ marginTop: 6 }}>Recherche d'idées dans le cours…</div>}
        {!ideasBusy && !ideasErr && !ideas.length && <div className="faint small" style={{ marginTop: 6 }}>Aucune proposition pour l'instant.</div>}
        <div className="gen-ideas">
          {ideas.map((idea, i) => (
            <button key={i} type="button" className="gen-idea" disabled={!!job}
              title={idea.why} onClick={() => launch({ request: `${idea.title} — partie « ${idea.section} »`, terms: [], count: 1 })}>
              <b>{idea.title}</b>
              <span className="faint small">{idea.section}</span>
            </button>
          ))}
        </div>
      </div>

      {terms.length > 0 && (
        <div className="field" style={{ marginTop: 16 }}>
          <label>Sur des termes du cours ? <span className="faint small">({picked.length}/{MAX_TERMS}, un schéma par terme)</span></label>
          <div className="gen-terms" role="group" aria-label="Termes à schématiser">
            {terms.map((t) => (
              <button key={t} type="button" className="chip-btn" aria-pressed={picked.includes(t)}
                disabled={!picked.includes(t) && picked.length >= MAX_TERMS} onClick={() => toggleTerm(t)}>{t}</button>
            ))}
          </div>
        </div>
      )}

      {picked.length === 0 && (
        <div className="field" style={{ marginTop: 16 }}>
          <label>Combien de schémas ?</label>
          <Segmented value={String(count)} onChange={(v) => setCount(Number(v))}
            options={[{ value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' }]} />
        </div>
      )}

      <div className="field" style={{ marginTop: 16 }}>
        <label htmlFor="gen-request">Une consigne précise ? (facultatif)</label>
        <input id="gen-request" className="input" value={request} maxLength={200}
          placeholder="Ex. les étapes du bilan, une carte mentale du cours… Laisse vide pour que l'IA choisisse."
          onChange={(e) => setRequest(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && launch({ request, terms: picked, count })} />
      </div>
      <p className="faint small" style={{ marginTop: 10 }}>Les schémas sont intégrés au cours, dans la partie qu'ils concernent.</p>
      <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
        <button className="btn sm ghost" onClick={onClose}>Annuler</button>
        <button className="btn sm accent" disabled={!!job} onClick={() => launch({ request, terms: picked, count })}>
          <Icon name="sparkles" size={14} /> {picked.length ? `Schématiser ${picked.length} terme${picked.length > 1 ? 's' : ''}` : 'Générer'}
        </button>
      </div>
    </div>
  );
}

/** Onglet « Approfondir » : détails, compléments, pièges et actualités sourcées. */
function DeepenTab({ course, job, run }) {
  const d = course.deepening;
  const [focus, setFocus] = useState(d?.focus || '');
  const [withNews, setWithNews] = useState(d ? d.news !== false : true);
  const busy = job && /Approfondissement|actualités/.test(job.label);
  const launch = () => run(['deepen'], { focus, withNews });

  const form = (
    <div className="stack" style={{ gap: 12 }}>
      <div className="field">
        <label htmlFor="deepen-focus">Un point à creuser en particulier ? (facultatif)</label>
        <input id="deepen-focus" className="input" value={focus} maxLength={200} onChange={(e) => setFocus(e.target.value)}
          placeholder="Ex. la prise en charge chez l'adulte, les débats actuels…" />
      </div>
      <div className="row between wrap" style={{ gap: 10 }}>
        <label className="check-row">
          <input type="checkbox" checked={withNews} onChange={(e) => setWithNews(e.target.checked)} />
          Inclure des actualités récentes (recherche Google, avec sources)
        </label>
        <button className="btn accent" disabled={!!job} onClick={launch}>
          {busy ? <><span className="spinner" /> Recherche en cours…</> : <><Icon name="zap" /> {d ? 'Mettre à jour' : 'Approfondir avec Gemini'}</>}
        </button>
      </div>
    </div>
  );

  if (!d) {
    return (
      <div className="card">
        <Empty icon="zap" title="Aller plus loin que le cours"
          text="Gemini développe les notions du cours, ajoute des compléments utiles, signale les pièges fréquents et, si tu le souhaites, cherche des actualités récentes en lien avec le cours, avec leurs sources." />
        <div style={{ maxWidth: 640, margin: '0 auto' }}>{form}</div>
      </div>
    );
  }

  const date = new Date(d.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <>
      <div className="card" style={{ padding: '30px 36px' }}>
        <div className="deepen-meta">
          <span className="chip accent"><Icon name="zap" size={12} /> Approfondissement</span>
          <span className="faint small">Généré le {date}{d.focus ? ` · axe : « ${d.focus} »` : ''}</span>
        </div>
        {d.notice && <div className="q-context small">{d.notice}</div>}
        {d.news && !d.sources?.length && (
          <div className="q-context small"><b>Aucune source renvoyée par la recherche.</b> Vérifie les actualités ci-dessous avant de les citer.</div>
        )}
        <Markdown text={d.markdown} terms={course.keyTerms || []} />
      </div>

      {d.sources?.length > 0 && (
        <>
          <div className="section-title">Sources <span className="faint small">{d.sources.length}</span></div>
          <div className="sources">
            {d.sources.map((src, i) => (
              <button key={src.uri} className="source-link" onClick={() => api.openExternal(src.uri)} title="Ouvrir dans le navigateur">
                <span className="n">{i + 1}</span>
                <span className="grow">{src.title}</span>
                <Icon name="link" size={14} />
              </button>
            ))}
          </div>
          <p className="faint small" style={{ marginTop: 8 }}>Sources trouvées par la recherche Google de Gemini. Ouvre-les pour vérifier avant de citer une information.</p>
        </>
      )}

      <div className="section-title">Refaire l'approfondissement</div>
      <div className="card">{form}</div>
    </>
  );
}

function Skeleton() {
  return (
    <div className="card shimmer" style={{ padding: 30 }}>
      {[70, 95, 88, 60, 92, 80].map((w, i) => (
        <div key={i} style={{ height: i === 0 ? 22 : 12, width: `${w}%`, borderRadius: 8, background: 'var(--chip)', marginBottom: i === 0 ? 22 : 12 }} />
      ))}
    </div>
  );
}

/** Fenêtre « mot important » : le mot, sa définition (saisie ou rédigée par l'IA à partir du cours). */
// Titre de la partie où se trouve la sélection (pour donner le contexte à l'IA)
function headingOfSel(sel) {
  const id = sel?.anchor?.heading;
  return id ? (document.getElementById(id)?.textContent || '').trim() : '';
}

function TermDialog({ course, initialTerm, ctx = {}, onSave, onClose }) {
  const [term, setTerm] = useState(initialTerm || '');
  const [definition, setDefinition] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sources, setSources] = useState([]);
  const [origin, setOrigin] = useState('');
  const suggest = async (web = false) => {
    if (!term.trim()) return;
    setBusy(true); setErr('');
    try {
      const r = await defineTerm(course, term.trim(), { ...ctx, web });
      setDefinition(r.definition); setSources(r.sources || []); setOrigin(r.origin);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };
  // Un mot déjà sélectionné dans le cours : la recherche de définition part toute seule
  useEffect(() => { if (initialTerm && initialTerm.trim()) suggest(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return createPortal(
    <div className="overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); if (term.trim() && definition.trim()) onSave(term.trim(), definition.trim(), sources); }}>
        <div className="row between">
          <span className="chip accent"><Icon name="sparkles" size={12} /> Mot important</span>
          <button type="button" className="btn icon sm ghost" onClick={onClose} aria-label="Fermer"><Icon name="x" /></button>
        </div>
        <div className="field" style={{ marginTop: 14 }}>
          <label htmlFor="term-word">Le mot</label>
          <input id="term-word" className="input" value={term} maxLength={60} autoFocus onChange={(e) => setTerm(e.target.value)} />
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <label htmlFor="term-def">Définition <span className="faint small">(elle sera aussi la face de la flashcard)</span></label>
          <textarea id="term-def" className="textarea" rows={3} value={definition} onChange={(e) => setDefinition(e.target.value)} placeholder={busy ? 'Recherche de la définition dans ton cours…' : "Écris la définition, ou lance la recherche sur internet."} />
          {origin === 'cours' && definition && !busy && (
            <div className="term-sources small"><span className="faint">Écrite à partir de ton cours, dans le sens du passage surligné. Pour une source extérieure : « Chercher sur internet ».</span></div>
          )}
          {sources.length > 0 && (
            <div className="term-sources small">
              <span className="faint">{origin === 'wikipedia' ? 'Extrait de' : origin === 'ia' ? 'Rédigé par l’IA (sans recherche web), vérifie-le. Sources :' : 'Trouvé sur :'}</span>
              {sources.map((x) => (
                <button key={x.uri} type="button" className="source-link" onClick={() => api.openExternal(x.uri)} title="Ouvrir dans le navigateur">{x.title || x.uri}</button>
              ))}
            </div>
          )}
        </div>
        {err && <div className="small" style={{ color: 'var(--danger)', marginTop: 8 }}>{err}</div>}
        <div className="row between wrap" style={{ marginTop: 16, gap: 8 }}>
          <button type="button" className="btn sm ghost" disabled={busy || !term.trim()} onClick={() => suggest(true)}>
            {busy ? <span className="spinner" /> : <Icon name="search" size={14} />} {definition ? 'Chercher à nouveau sur internet' : 'Chercher sur internet'}
          </button>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn ghost" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn accent" disabled={!term.trim() || !definition.trim()}>Ajouter</button>
          </div>
        </div>
      </form>
    </div>,
    document.body,
  );
}

/**
 * Allège une image avant de l'enregistrer (1400 px au plus, JPEG) : la base, la liste des cours
 * et les sauvegardes restent légères. On garde l'original s'il est déjà plus petit (ou en SVG).
 */
async function shrinkImage(dataUrl, max = 1400) {
  if (!/^data:image\/(png|jpe?g|webp|gif)/.test(dataUrl || '')) return dataUrl;
  try {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * k));
    c.height = Math.max(1, Math.round(img.naturalHeight * k));
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; // fond blanc, comme l'affichage des schémas
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    const out = c.toDataURL('image/jpeg', 0.86);
    return out.length < dataUrl.length ? out : dataUrl;
  } catch {
    return dataUrl;
  }
}

/** Changer un schéma : redessin en SVG, dessin par IA, ou image libre de droits (Wikimédia Commons). */
function ChangeSchemaDialog({ course, diagram, onSave, onClose }) {
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [q, setQ] = useState(diagram?.title || '');
  const [results, setResults] = useState(null);
  const [src, setSrc] = useState('');
  const fileRef = useRef(null);
  const [ideas, setIdeas] = useState([]);
  const [usedTerm, setUsedTerm] = useState('');
  // Idées de recherche (en anglais surtout) proposées par l'IA à l'ouverture
  useEffect(() => {
    let alive = true;
    imageKeywords(course, diagram || {}).then((k) => {
      if (!alive || !k.length) return;
      setIdeas(k);
      setQ((cur) => (cur === (diagram?.title || '') ? k[0] : cur));
    }).catch(() => {});
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const run = async (key, fn) => {
    setBusy(key); setErr('');
    try { await fn(); }
    catch (e) { setErr(e.message || String(e)); }
    finally { setBusy(''); }
  };
  // Import d'une image téléchargée (recherche faite dans le navigateur)
  const importFile = (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 4 * 1024 * 1024) { setErr('Image trop lourde (plus de 4 Mo).'); return; }
    const reader = new FileReader();
    reader.onload = () => run('import', async () => onSave({ image: await shrinkImage(reader.result), credit: src.trim() || 'source à renseigner', source: 'import' }));
    reader.readAsDataURL(f);
  };
  const redraw = () => run('svg', async () => {
    const r = await redrawSchemaSvg(course, diagram);
    await onSave({ svg: r.svg, title: r.title, caption: r.caption, image: null, credit: '', source: 'svg-ia' });
  });
  const draw = () => run('image', async () => {
    const r = await drawSchemaImage(course, diagram);
    await onSave({ image: await shrinkImage(r.image), credit: 'dessin généré par IA, à vérifier', source: 'ia-image' });
  });
  const search = (term) => run('search', async () => {
    const t = String(typeof term === 'string' ? term : q).trim();
    if (!t) return;
    setQ(t);
    const r = await api.commons.search(t);
    if (!r.ok) throw new Error(r.error);
    setResults(r.results);
    setUsedTerm(r.usedTerm || t);
    const tried = (r.tried && r.tried.length ? r.tried : [t]).map((x) => `« ${x} »`).join(', ');
    if (!r.results.length) setErr(`Aucune image pour ${tried}. Essaie une autre idée de recherche, ou ouvre la recherche dans le navigateur.`);
  });
  const pick = (r) => run('pick', async () => {
    const img = await api.commons.image(r.thumb);
    if (!img.ok) throw new Error(img.error);
    await onSave({ image: await shrinkImage(img.dataUrl), credit: [r.title, r.artist, r.license].filter(Boolean).join(' · '), source: 'commons' });
  });

  return createPortal(
    <div className="overlay" onClick={onClose}>
      <div className="modal change-schema" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Changer le schéma">
        <div className="row between">
          <span className="chip accent"><Icon name="edit" size={12} /> Changer le schéma</span>
          <button type="button" className="btn icon sm ghost" onClick={onClose} aria-label="Fermer"><Icon name="x" /></button>
        </div>
        <p className="small faint" style={{ marginTop: 8 }}>« {diagram?.title || 'Schéma'} »</p>

        <div className="change-options">
          <button type="button" className="btn" disabled={!!busy} onClick={redraw}>
            {busy === 'svg' ? <span className="spinner" /> : <Icon name="sparkles" size={14} />} Redessiner en schéma (IA)
          </button>
          <button type="button" className="btn" disabled={!!busy} onClick={draw}>
            {busy === 'image' ? <span className="spinner" /> : <Icon name="image" size={14} />} Dessin par IA (image)
          </button>
        </div>

        <div className="field" style={{ marginTop: 16 }}>
          <label htmlFor="commons-q">Image sur internet (Wikimédia Commons, libre de droits)</label>
          {ideas.length > 0 && (
            <div className="row wrap" style={{ gap: 6, marginBottom: 8 }}>
              <span className="faint small">Idées :</span>
              {ideas.map((k) => <button key={k} type="button" className="chip-btn" disabled={!!busy} onClick={() => search(k)}>{k}</button>)}
            </div>
          )}
          <div className="row wrap" style={{ gap: 8 }}>
            <input id="commons-q" className="input grow" value={q} maxLength={120} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && q.trim() && !busy && search()} placeholder="Ex. larynx anatomy" style={{ minWidth: 200 }} />
            <button type="button" className="btn" disabled={!!busy || !q.trim()} onClick={() => search()}>
              {busy === 'search' ? <span className="spinner" /> : <Icon name="search" size={14} />} Chercher
            </button>
            <button type="button" className="btn ghost" disabled={!q.trim()} onClick={() => api.openExternal(`https://commons.wikimedia.org/w/index.php?search=${encodeURIComponent(q.trim())}&title=Special%3AMediaSearch&type=image`)}>
              <Icon name="link" size={14} /> Dans le navigateur
            </button>
          </div>
        </div>

        {results && results.length > 0 && <p className="faint small" style={{ marginTop: 10 }}>Résultats pour « {usedTerm} » : clique sur une image pour l'utiliser.</p>}
        {results && results.length > 0 && (
          <div className="commons-grid">
            {results.map((r, i) => (
              <button key={i} type="button" className="commons-card" disabled={!!busy} onClick={() => pick(r)} title={r.title}>
                <img src={r.thumb} alt="" loading="lazy" />
                <span className="small">{r.title}</span>
                <span className="faint" style={{ fontSize: 11 }}>{r.license}</span>
              </button>
            ))}
          </div>
        )}
        {err && <div className="small" style={{ color: 'var(--danger)', marginTop: 12 }}>{err}</div>}

        <div className="field" style={{ marginTop: 16 }}>
          <label htmlFor="img-src">Ou importer une image téléchargée</label>
          <div className="row" style={{ gap: 8 }}>
            <input id="img-src" className="input" maxLength={160} value={src} onChange={(e) => setSrc(e.target.value)}
              placeholder="Source et licence (ex. nom de l'auteur, CC BY-SA 4.0)" />
            <button type="button" className="btn" disabled={!!busy} onClick={() => fileRef.current && fileRef.current.click()}>
              <Icon name="upload" size={14} /> Importer
            </button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" hidden onChange={importFile} />
          </div>
        </div>
        <p className="faint small" style={{ marginTop: 14 }}>La source et la licence restent affichées sous le schéma.</p>
      </div>
    </div>,
    document.body,
  );
}
