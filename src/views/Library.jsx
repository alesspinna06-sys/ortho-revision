import { useMemo, useState } from 'react';
import Icon from '../components/Icon.jsx';
import CourseCard, { folderBg } from '../components/CourseCard.jsx';
import FolderModal from '../components/FolderModal.jsx';
import SimilarModal from '../components/SimilarModal.jsx';
import { Empty } from '../components/common.jsx';
import { useDb, getCourses, getCards, getQuestions, getFolders } from '../lib/db.js';
import { GenHistoryModal } from '../components/GenBadge.jsx';
import { genState } from '../lib/genHistory.js';
import { enqueue } from '../lib/jobs.js';
import { useToast } from '../components/Toast.jsx';

export default function Library({ go, jobs, hasKey }) {
  const [q, setQ] = useState('');
  const [subject, setSubject] = useState('');
  const [acq, setAcq] = useState('all'); // all | todo | done
  const [folderOpen, setFolderOpen] = useState(false);
  const [similarOpen, setSimilarOpen] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const [stale, setStale] = useState(false); // filtre « À régénérer »
  const toast = useToast();
  const regenerateAll = (list2) => {
    if (!hasKey) { toast({ type: 'error', text: 'Ajoute ta clé Gemini dans Réglages.' }); return; }
    list2.forEach((c) => enqueue(c.id, ['summary']));
    setHistOpen(false);
    toast({ type: 'success', text: `${list2.length} cours ajouté${list2.length > 1 ? 's' : ''} à la file de régénération (un à la fois)` });
  };
  const data = useDb(async () => {
    const [courses, cards, questions, folders] = await Promise.all([getCourses(), getCards(), getQuestions(), getFolders()]);
    const count = (list) => list.reduce((m, x) => ((m[x.courseId] = (m[x.courseId] || 0) + 1), m), {});
    return { courses, folders, cards: count(cards), questions: count(questions) };
  }, []);

  const subjects = useMemo(() => [...new Set((data?.courses || []).map((c) => c.subject).filter(Boolean))].sort(), [data]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    // Le filtre « À régénérer » s'éteint de lui-même quand tout est à jour
    const staleOn = stale && (data?.courses || []).some((c) => c.summary && !genState(c).upToDate);
    return (data?.courses || []).filter((c) =>
      (!subject || c.subject === subject) &&
      (acq === 'all' || (acq === 'done') === !!c.acquired) &&
      (!staleOn || (c.summary && !genState(c).upToDate)) &&
      (!s || c.title.toLowerCase().includes(s) || (c.subject || '').toLowerCase().includes(s) || (c.keyTerms || []).some((k) => k.term.toLowerCase().includes(s)))
    );
  }, [data, q, subject, acq, stale]);

  if (!data) return null;
  const countIn = (fid) => data.courses.filter((c) => c.folderId === fid).length;
  const staleCount = data.courses.filter((c) => c.summary && !genState(c).upToDate).length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Mes cours</h1>
          <div className="page-sub">{data.courses.length} cours · {data.folders.length} dossier{data.folders.length > 1 ? 's' : ''} · tout est enregistré sur cet ordinateur</div>
        </div>
        <div className="row">
          {data.courses.length > 1 && (
            <button className="btn" onClick={() => setSimilarOpen(true)} title="Repérer les cours qui se ressemblent pour les fusionner ou les ranger ensemble">
              <Icon name="link" /> Cours similaires
            </button>
          )}
          {data.courses.length > 0 && <button className="btn" onClick={() => setHistOpen(true)} title="Toutes les générations et vérifications (Gemini, Claude)">🕘 Historique</button>}
          <button className="btn" onClick={() => setFolderOpen(true)}><Icon name="folderPlus" /> Nouveau dossier</button>
          <button className="btn accent" onClick={() => go('import')}><Icon name="plus" /> Ajouter</button>
        </div>
      </div>

      {data.folders.length > 0 && (
        <>
          <div className="section-title" style={{ marginTop: 0 }}>Dossiers</div>
          <div className="grid folders-grid">
            {data.folders.map((f) => (
              <button key={f.id} className="folder-tile" style={{ background: folderBg(f.color) }} onClick={() => go('folder', { id: f.id })}>
                <Icon name="folder" size={22} />
                <span className="folder-name">{f.name}</span>
                <span className="folder-count">{countIn(f.id)} cours</span>
              </button>
            ))}
          </div>
          <div className="section-title">Tous les cours</div>
        </>
      )}

      {data.courses.length > 0 && (
        <div className="row wrap" style={{ marginBottom: 20 }}>
          <div className="search grow" style={{ maxWidth: 420 }}>
            <Icon name="search" size={16} />
            <input className="input" placeholder="Rechercher un cours, une notion…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="row wrap" role="group" aria-label="Filtrer selon l'état d'avancement">
            {[['all', 'Tous'], ['todo', 'À réviser'], ['done', `Acquis (${data.courses.filter((c) => c.acquired).length})`]].map(([k, l]) => (
              <button key={k} className={`chip ${acq === k ? 'accent' : ''}`} style={{ cursor: 'pointer' }} aria-pressed={acq === k} onClick={() => setAcq(k)}>{l}</button>
            ))}
          </div>
          {staleCount > 0 && (
            <div className="row wrap">
              <button className={`chip gen-chip ${stale ? 'accent' : ''}`} style={{ cursor: 'pointer' }} aria-pressed={stale} onClick={() => setStale((x) => !x)} title="Cours générés avec une ancienne version : régénère-les pour profiter des dernières améliorations">↻ À régénérer ({staleCount})</button>
              {stale && <button className="btn sm accent" onClick={() => regenerateAll(data.courses.filter((c) => c.summary && !genState(c).upToDate))}>Tout régénérer</button>}
            </div>
          )}
          {subjects.length > 1 && (
            <div className="row wrap">
              <button className={`chip ${!subject ? 'accent' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setSubject('')}>Toutes</button>
              {subjects.map((s) => (
                <button key={s} className={`chip ${subject === s ? 'accent' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setSubject(s)}>{s}</button>
              ))}
            </div>
          )}
        </div>
      )}

      {data.courses.length === 0 ? (
        <div className="card"><Empty icon="book" title="Aucun cours pour l'instant" text="Importe tes supports : l'IA prépare automatiquement fiches, flashcards et QCM.">
          <button className="btn primary" onClick={() => go('import')}>Importer un cours</button>
        </Empty></div>
      ) : list.length === 0 ? (
        <div className="card"><Empty icon="search" title="Aucun résultat" text="Essaie un autre mot-clé." /></div>
      ) : (
        <div className="grid grid-auto">
          {list.map((c) => (
            <CourseCard
              key={c.id} course={c} folders={data.folders} job={jobs.get(c.id)} go={go}
              cards={data.cards[c.id] || 0} questions={data.questions[c.id] || 0}
            />
          ))}
        </div>
      )}

      {histOpen && <GenHistoryModal courses={data.courses} go={go} onClose={() => setHistOpen(false)} onRegenerate={regenerateAll} />}
      {similarOpen && <SimilarModal onClose={() => setSimilarOpen(false)} go={go} hasKey={hasKey} />}
      {folderOpen && <FolderModal onClose={() => setFolderOpen(false)} onSaved={(f) => f && go('folder', { id: f.id })} />}
    </>
  );
}
