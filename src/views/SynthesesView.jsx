import { useState } from 'react';
import Icon from '../components/Icon.jsx';
import Markdown from '../components/Markdown.jsx';
import { Empty } from '../components/common.jsx';
import { useToast } from '../components/Toast.jsx';
import TextSize from '../components/TextSize.jsx';
import { api } from '../lib/bridge.js';
import { useNavCollapsed, toggleNav } from '../lib/layout.js';
import { headings } from '../lib/markdown.js';
import { useSettings } from '../lib/settings.jsx';
import { sheetClass } from '../lib/courseStyle.js';
import { useDb, getCourses, getFolders, getCourse, getFolder } from '../lib/db.js';
import { enqueue } from '../lib/jobs.js';

/** Menu Synthèses : la liste, ou la synthèse d'un cours en pleine page (route.id = id du cours). */
export default function SynthesesView(props) {
  return props.route?.id ? <SynthesisPage {...props} /> : <SynthesesList {...props} />;
}

/** Synthèse d'un cours en pleine page : lecture confortable, PDF, accès au cours. */
function SynthesisPage({ go, route, jobs, hasKey }) {
  const toast = useToast();
  const { settings } = useSettings();
  const navCollapsed = useNavCollapsed();
  const id = route.id;
  const data = useDb(async () => {
    const course = await getCourse(id);
    return { course, folder: course?.folderId ? await getFolder(course.folderId) : null };
  }, [id]);
  if (!data) return null;
  const { course, folder } = data;
  if (!course) return <Empty icon="alert" title="Cours introuvable"><button className="btn" onClick={() => go('syntheses')}>Toutes les synthèses</button></Empty>;
  const job = jobs.get(id);
  const toc = headings(course.synthesis || '').filter((h) => h.level <= 2);
  const writing = !!job && (job.label || '').toLowerCase().includes('synth');
  const make = () => {
    if (!hasKey) { toast({ type: 'error', text: 'Ajoute ta clé Gemini dans Réglages.' }); return; }
    enqueue(id, ['synthesis']);
  };
  const exportPdf = async () => {
    document.body.classList.add('print-fiche');
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
      const r = await api.printPdf({ title: `Synthèse - ${course.title}` });
      if (r?.ok && r.path) toast({ type: 'success', text: 'Synthèse enregistrée en PDF' });
      else if (r && !r.ok && r.error) toast({ type: 'error', text: r.error });
    } finally { document.body.classList.remove('print-fiche'); }
  };
  return (
    <>
      <button className="back-link no-print" onClick={() => go('syntheses', folder ? { folderId: folder.id } : {})}>
        <Icon name="left" size={16} /> {folder ? `Synthèses · ${folder.name}` : 'Toutes les synthèses'}
      </button>
      <div className="page-head no-print">
        <div style={{ minWidth: 0 }}>
          <div className="row wrap" style={{ gap: 8, marginBottom: 6 }}>
            <span className="chip accent"><Icon name="clipboard" size={12} /> Synthèse</span>
            {folder && <span className="chip"><span className="dot-c" style={{ background: folder.color }} /> {folder.name}</span>}
            {course.synthesisAt && <span className="faint small">créée le {new Date(course.synthesisAt).toLocaleDateString('fr-FR')}</span>}
          </div>
          <h1 className="page-title">{course.title}</h1>
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          <TextSize />
          {course.synthesis && <button className="btn ghost" onClick={exportPdf}><Icon name="download" size={15} /> PDF</button>}
          {course.synthesis && <button className="btn ghost" disabled={!!job || !course.summary} onClick={make} title="Refaire la synthèse à partir du cours"><Icon name="refresh" size={15} /> Régénérer</button>}
          <button className={`btn ${navCollapsed ? 'on' : ''}`} onClick={toggleNav} aria-pressed={navCollapsed} title={navCollapsed ? 'Réafficher le menu (⌘/Ctrl B)' : 'Plein écran : ranger le menu (⌘/Ctrl B)'}>
            <Icon name={navCollapsed ? 'sidebar' : 'expand'} size={15} /> {navCollapsed ? 'Menu' : 'Plein écran'}
          </button>
          <button className="btn" onClick={() => go('course', { id, synthesis: 'side' })} title="Ouvrir le cours, avec la synthèse sur le côté"><Icon name="sidebar" size={15} /> Avec le cours</button>
          <button className="btn accent" onClick={() => go('course', { id })}><Icon name="book" size={15} /> Ouvrir le cours</button>
        </div>
      </div>
      {toc.length > 2 && (
        <nav className="row wrap synth-toc no-print" aria-label="Sommaire de la synthèse">
          {toc.map((h) => (
            <button key={h.id} className="chip-btn" onClick={() => document.getElementById(h.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{h.text}</button>
          ))}
        </nav>
      )}
      {course.synthesis && (course.synthesisV || 1) < 2 && (
        <div className="card row synth-old no-print">
          <Icon name="sparkles" size={16} />
          <span className="grow small">Cette synthèse a été faite avec l’ancienne version, plus courte. <b>Régénère-la</b> pour avoir la version détaillée (explications, contexte, exemples).</span>
          <button className="btn sm accent" disabled={!!job || !course.summary} onClick={make}><Icon name="refresh" size={14} /> Régénérer</button>
        </div>
      )}
      <div className="print-area">
        <div className="print-head"><h1>Synthèse — {course.title}</h1><div>{course.subject || ''}</div></div>
        <div className={`card synth-page ${sheetClass(settings)}`}>
          {writing ? (
            <div className="synth-empty"><span className="spinner" style={{ color: 'var(--accent)' }} /> Rédaction de la synthèse…</div>
          ) : course.synthesis ? (
            <Markdown text={course.synthesis} terms={course.keyTerms || []} />
          ) : (
            <div className="synth-empty">
              <Icon name="clipboard" size={26} />
              <b>Pas encore de synthèse pour ce cours</b>
              <span className="small muted">{job ? 'Elle sera rédigée à la fin de la génération en cours.' : course.summary ? 'Une version condensée du cours, avec ses explications et ses exemples.' : 'Le cours complet doit d’abord être généré.'}</span>
              <button className="btn accent" disabled={!!job || !course.summary} onClick={make}><Icon name="sparkles" size={15} /> Créer la synthèse</button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/** Synthèses détaillées, une par cours : entre la fiche et le cours complet. */
function SynthesesList({ go, route, jobs, hasKey }) {
  const toast = useToast();
  const data = useDb(async () => ({ courses: await getCourses(), folders: await getFolders() }), []);
  const [q, setQ] = useState('');
  const [folder, setFolder] = useState(route?.folderId ?? 'all'); // 'all' | id de dossier | 'cat:<catégorie>'
  const [open, setOpen] = useState(() => new Set());
  const [confirmAll, setConfirmAll] = useState(false);
  if (!data) return null;
  const { courses, folders } = data;

  const needle = q.trim().toLowerCase();
  // Rangement : les vrais dossiers d'abord ; un cours sans dossier est rangé selon sa catégorie
  // (la matière : « Regards croisés »…), qui fait alors office de dossier.
  const folderIds = new Set(folders.map((f) => f.id));
  const keyOf = (c) => (c.folderId && folderIds.has(c.folderId) ? c.folderId : `cat:${(c.subject || '').trim()}`);
  const COLORS = ['#8b5cf6', '#ec4899', '#f59e0b', '#22c55e', '#06b6d4', '#ef4444', '#5b5bf7', '#64748b'];
  const cats = [...new Set(courses.filter((c) => keyOf(c).startsWith('cat:')).map((c) => (c.subject || '').trim()))]
    .sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, 'fr')));
  const allGroups = [
    ...folders.map((f) => ({ id: f.id, name: f.name, color: f.color, real: true })),
    ...cats.map((n, i) => ({ id: `cat:${n}`, name: n || 'Sans catégorie', color: n ? COLORS[i % COLORS.length] : '#94a3b8', real: false })),
  ];
  const list = courses.filter((c) => (!needle || `${c.title} ${c.subject || ''}`.toLowerCase().includes(needle))
    && (folder === 'all' || keyOf(c) === folder));
  const groups = allGroups.map((g) => ({ ...g, items: list.filter((c) => keyOf(c) === g.id) })).filter((g) => g.items.length);
  const countIn = (gid) => courses.filter((c) => keyOf(c) === gid).length;
  const withSynth = (items) => items.filter((c) => c.synthesis).length;
  const make = (c) => {
    if (!hasKey) { toast({ type: 'error', text: 'Ajoute ta clé Gemini dans Réglages.' }); return; }
    enqueue(c.id, ['synthesis']);
  };
  const old = courses.filter((c) => c.synthesis && c.summary && (c.synthesisV || 1) < 2 && !jobs.get(c.id));
  const redoAll = () => {
    if (!hasKey) { toast({ type: 'error', text: 'Ajoute ta clé Gemini dans Réglages.' }); return; }
    old.forEach((c) => enqueue(c.id, ['synthesis']));
    setConfirmAll(false);
    toast({ type: 'success', text: `${old.length} synthèse${old.length > 1 ? 's' : ''} en cours de mise à jour` });
  };
  const toggle = (id) => setOpen((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Synthèses</h1>
          <div className="page-sub">Une version condensée de chaque cours, entre la fiche et le cours complet</div>
        </div>
        {old.length > 0 && (
          confirmAll ? (
            <div className="row wrap" style={{ gap: 8 }}>
              <span className="small muted">{old.length} synthèse{old.length > 1 ? 's' : ''} à refaire, l’une après l’autre ({old.length * 3} appels Gemini environ).</span>
              <button className="btn accent" onClick={redoAll}>Lancer</button>
              <button className="btn ghost" onClick={() => setConfirmAll(false)}>Annuler</button>
            </div>
          ) : (
            <button className="btn" onClick={() => setConfirmAll(true)} title="Refaire les synthèses créées avec l’ancienne version, plus courte">
              <Icon name="refresh" size={15} /> Mettre à jour {old.length} ancienne{old.length > 1 ? 's' : ''} synthèse{old.length > 1 ? 's' : ''}
            </button>
          )
        )}
      </div>
      {courses.length === 0 ? (
        <div className="card"><Empty icon="file" title="Pas encore de cours" text="Importe un cours : sa synthèse sera créée automatiquement." /></div>
      ) : (
        <>
          <input className="input" style={{ marginBottom: 16 }} placeholder="Rechercher une synthèse…" value={q}
            onChange={(e) => setQ(e.target.value)} aria-label="Rechercher une synthèse" />
          {allGroups.length > 1 && (
            <div className="row wrap synth-filter" role="group" aria-label="Filtrer par dossier">
              <button className={`chip ${folder === 'all' ? 'accent' : ''}`} aria-pressed={folder === 'all'} onClick={() => setFolder('all')}>Tous les dossiers</button>
              {allGroups.map((g) => (
                <button key={g.id} className={`chip ${folder === g.id ? 'accent' : ''}`} aria-pressed={folder === g.id} onClick={() => setFolder(g.id)}>
                  <span className="dot-c" style={{ background: g.color }} /> {g.name} <span className="faint">{countIn(g.id)}</span>
                </button>
              ))}
            </div>
          )}
          {groups.map((g) => (
            <section key={g.id || 'none'} className="synth-group">
              {allGroups.length > 1 && (
                <div className="synth-group-head">
                  <span className="dot-c" style={{ background: g.color, width: 12, height: 12 }} />
                  <b>{g.name}</b>
                  <span className="faint small">{withSynth(g.items)}/{g.items.length} synthèse{g.items.length > 1 ? 's' : ''}</span>
                  {g.real && <button className="btn sm ghost" style={{ marginLeft: 'auto' }} onClick={() => go('folder', { id: g.id })}><Icon name="folder" size={14} /> Ouvrir le dossier</button>}
                </div>
              )}
              <div className="stack" style={{ gap: 12 }}>
                {g.items.map((c) => {
              const busy = !!jobs.get(c.id);
              const isOpen = open.has(c.id);
              return (
                <div key={c.id} className="card" style={{ padding: '18px 22px' }}>
                  <div className="row between wrap" style={{ gap: 10 }}>
                    <div className="grow" style={{ minWidth: 0 }}>
                      <button className="synth-link" onClick={() => go('syntheses', { id: c.id })} title="Ouvrir la synthèse en pleine page">{c.title}</button>
                      <div className="faint small">
                        {c.subject || 'Sans matière'}{c.synthesisAt ? ` · créée le ${new Date(c.synthesisAt).toLocaleDateString('fr-FR')}` : ''}
                        {c.synthesis && (c.synthesisV || 1) < 2 && <span className="chip warning" style={{ marginLeft: 8 }} title="Faite avec l’ancienne version, plus courte">ancienne version</span>}
                      </div>
                    </div>
                    <div className="row wrap" style={{ gap: 6 }}>
                      {busy && <span className="chip accent"><span className="spinner" /> En cours…</span>}
                      {c.synthesis ? (
                        <>
                          <button className="btn sm accent" onClick={() => go('syntheses', { id: c.id })}><Icon name="expand" size={14} /> Lire en grand</button>
                          <button className="btn sm ghost" onClick={() => toggle(c.id)} aria-expanded={isOpen}>{isOpen ? 'Replier' : 'Aperçu'}</button>
                          <button className="btn sm ghost" disabled={busy} onClick={() => make(c)} title="Refaire la synthèse à partir du cours">
                            <Icon name="refresh" size={14} /> Régénérer
                          </button>
                        </>
                      ) : (
                        <button className="btn sm accent" disabled={busy || !c.summary} onClick={() => make(c)}
                          title={c.summary ? 'Créer la synthèse de ce cours' : 'Le cours complet doit d’abord être rédigé'}>
                          <Icon name="sparkles" size={14} /> Créer la synthèse
                        </button>
                      )}
                      <button className="btn sm ghost" onClick={() => go('course', { id: c.id })}>Ouvrir le cours</button>
                    </div>
                  </div>
                  {c.synthesis && isOpen && <div style={{ marginTop: 14 }}><Markdown text={c.synthesis} terms={c.keyTerms || []} /></div>}
                </div>
              );
                })}
              </div>
            </section>
          ))}
          {list.length === 0 && <div className="faint" style={{ marginTop: 14 }}>Aucun cours ne correspond.</div>}
        </>
      )}
    </>
  );
}
