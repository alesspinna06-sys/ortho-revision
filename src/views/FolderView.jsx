import { useState } from 'react';
import Icon from '../components/Icon.jsx';
import CourseCard, { folderBg } from '../components/CourseCard.jsx';
import { Empty } from '../components/common.jsx';
import ColorPicker from '../components/ColorPicker.jsx';
import { useDb, getFolder, getFolders, getCourses, getCards, getQuestions, updateFolder, deleteFolder, updateCourse, FOLDER_COLORS } from '../lib/db.js';

export default function FolderView({ go, route, jobs }) {
  const id = route.id;
  const [confirm, setConfirm] = useState(false);
  const [addId, setAddId] = useState('');
  const data = useDb(async () => {
    const [folder, folders, courses, cards, questions] = await Promise.all([getFolder(id), getFolders(), getCourses(), getCards(), getQuestions()]);
    const count = (list) => list.reduce((m, x) => ((m[x.courseId] = (m[x.courseId] || 0) + 1), m), {});
    return { folder, folders, courses, cards: count(cards), questions: count(questions) };
  }, [id]);

  if (!data) return null;
  const { folder, folders, courses, cards, questions } = data;
  if (!folder) return <Empty icon="alert" title="Dossier introuvable"><button className="btn" onClick={() => go('library')}>Retour</button></Empty>;

  const inside = courses.filter((c) => c.folderId === id);
  const outside = courses.filter((c) => c.folderId !== id);
  const cardsCount = inside.reduce((n, c) => n + (cards[c.id] || 0), 0);
  const quizCount = inside.reduce((n, c) => n + (questions[c.id] || 0), 0);

  return (
    <>
      <button className="back-link" onClick={() => go('library')}><Icon name="left" size={16} /> Mes cours</button>

      <div className="folder-hero" style={{ background: folderBg(folder.color) }}>
        <div className="folder-hero-icon"><Icon name="folder" size={28} /></div>
        <div className="grow" style={{ position: 'relative', zIndex: 1, minWidth: 0 }}>
          <input
            className="title-input folder-title" defaultValue={folder.name} key={folder.name} maxLength={60} aria-label="Nom du dossier"
            onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== folder.name) updateFolder(id, { name: v }); else e.target.value = folder.name; }}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
          <div className="small" style={{ opacity: 0.9, marginTop: 4 }}>
            {inside.length} cours · {cardsCount} flashcards · {quizCount} questions
          </div>
        </div>
        <div className="row folder-hero-actions" style={{ position: 'relative', zIndex: 1 }}>
          <button className="btn white" disabled={!cardsCount} title={cardsCount ? '' : 'Aucune flashcard dans ce dossier'} onClick={() => go('review', { folderId: id })}>
            <Icon name="layers" size={15} /> Flashcards du dossier
          </button>
          <button className="btn" style={{ background: 'rgba(255,255,255,.18)', color: '#fff', borderColor: 'rgba(255,255,255,.3)' }} disabled={!quizCount} title={quizCount ? '' : 'Aucune question dans ce dossier'} onClick={() => go('quiz', { folderId: id })}>
            <Icon name="quiz" size={15} /> QCM du dossier
          </button>
          <button className="btn" style={{ background: 'rgba(255,255,255,.18)', color: '#fff', borderColor: 'rgba(255,255,255,.3)' }} disabled={!inside.length} onClick={() => go('syntheses', { folderId: id })}>
            <Icon name="clipboard" size={15} /> Synthèses du dossier
          </button>
          <button className="btn" style={{ background: 'rgba(255,255,255,.18)', color: '#fff', borderColor: 'rgba(255,255,255,.3)' }} onClick={() => go('import', { folderId: id })}>
            <Icon name="plus" size={15} /> Importer un cours ici
          </button>
        </div>
      </div>

      <div className="card folder-settings">
        <div className="field">
          <label>Couleur du dossier</label>
          <ColorPicker value={folder.color} onChange={(c) => updateFolder(id, { color: c })} label="Couleur du dossier" />
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          {confirm ? (
            <>
              <span className="small muted grow">Les cours du dossier ne seront pas supprimés : ils reviendront à la racine.</span>
              <button className="btn danger" onClick={async () => { await deleteFolder(id); go('library'); }}>Supprimer le dossier</button>
              <button className="btn ghost" onClick={() => setConfirm(false)}>Annuler</button>
            </>
          ) : (
            <button className="btn ghost danger" onClick={() => setConfirm(true)}><Icon name="trash" size={15} /> Supprimer le dossier</button>
          )}
        </div>
      </div>

      <div className="section-title">Cours du dossier</div>
      {inside.length === 0 ? (
        <div className="card"><Empty icon="book" title="Dossier vide" text="Range un cours ici : depuis la liste ci-dessous, ou depuis la carte de chaque cours." /></div>
      ) : (
        <div className="grid grid-auto">
          {inside.map((c) => (
            <CourseCard key={c.id} course={c} folders={folders} job={jobs.get(c.id)} go={go} cards={cards[c.id] || 0} questions={questions[c.id] || 0} />
          ))}
        </div>
      )}

      {outside.length > 0 && (
        <div className="row wrap" style={{ marginTop: 20 }}>
          <span className="small muted">Ajouter un cours à ce dossier :</span>
          <select className="select" style={{ width: 300 }} value={addId} onChange={(e) => {
            const cid = e.target.value;
            setAddId('');
            if (cid) updateCourse(cid, { folderId: id });
          }}>
            <option value="">Choisir un cours…</option>
            {outside.map((c) => <option key={c.id} value={c.id}>{c.title}{c.folderId ? ` (${folders.find((f) => f.id === c.folderId)?.name || 'autre dossier'})` : ''}</option>)}
          </select>
        </div>
      )}
    </>
  );
}
