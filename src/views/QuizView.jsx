import { useEffect, useState } from 'react';
import Icon from '../components/Icon.jsx';
import QuizSession from '../components/QuizSession.jsx';
import { Empty, Segmented, relDate } from '../components/common.jsx';
import { useDb, getQuestions, getCourses, getHistory, getFolders } from '../lib/db.js';
import { pickQuestions } from '../lib/pick.js';

export default function QuizView({ go, route }) {
  const data = useDb(async () => {
    const [questions, courses, history, folders] = await Promise.all([getQuestions(), getCourses(), getHistory(), getFolders()]);
    return { questions, courses, folders, history: history.filter((h) => h.type === 'quiz') };
  }, []);
  // Portée : '' (tous les cours), 'f:<id>' (un dossier) ou 'c:<id>' (un cours)
  const [scope, setScope] = useState(route.folderId ? `f:${route.folderId}` : '');
  const [mode, setMode] = useState('mix');
  const [n, setN] = useState(10);
  const [session, setSession] = useState(null);

  useEffect(() => { setScope(route.folderId ? `f:${route.folderId}` : ''); }, [route.folderId]);

  useEffect(() => {
    if (route.autostart && data && !session && data.questions.length) {
      const weak = route.mode === 'weak';
      const list = pickQuestions(data.questions, 10, route.mode || 'mix');
      if (list.length) setSession({ list, title: weak ? 'Mes erreurs' : 'Toutes matières', courseId: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (!data) return null;
  if (session) return <QuizSession questions={session.list} title={session.title} courseId={session.courseId}
    onExit={() => { setSession(null); if (route.autostart) go(route.mode === 'weak' ? 'stats' : 'home'); }} />;

  const [kind, rawId] = [scope.slice(0, 2), scope.slice(2)];
  const folder = kind === 'f:' ? data.folders.find((f) => f.id === rawId) : null;
  const course = kind === 'c:' ? data.courses.find((c) => c.id === rawId) : null;
  const folderCourses = folder ? new Set(data.courses.filter((c) => c.folderId === folder.id).map((c) => c.id)) : null;
  const pool = course
    ? data.questions.filter((q) => q.courseId === course.id)
    : folderCourses ? data.questions.filter((q) => folderCourses.has(q.courseId)) : data.questions;
  const available = pickQuestions(pool, 9999, mode).length;
  const names = Object.fromEntries(data.courses.map((c) => [c.id, c.title]));
  const scopeTitle = folder ? folder.name : course ? course.title : 'Toutes matières';

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">QCM & cas cliniques</h1>
          <div className="page-sub">Entraînement type examen, avec correction détaillée. {data.questions.length} questions au total.</div>
        </div>
      </div>

      {data.questions.length === 0 ? (
        <div className="card"><Empty icon="quiz" title="Aucune question" text="Les QCM sont générés automatiquement à chaque nouveau cours importé.">
          <button className="btn primary" onClick={() => go('import')}>Importer un cours</button>
        </Empty></div>
      ) : (
        <div className="card" style={{ padding: 26 }}>
          <div className="grid grid-2" style={{ gap: 22 }}>
            <div className="field">
              <label htmlFor="quiz-scope">Portée</label>
              <select id="quiz-scope" className="select" value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="">Tous les cours (révision globale)</option>
                {data.folders.length > 0 && (
                  <optgroup label="Dossiers">
                    {data.folders.map((f) => <option key={f.id} value={`f:${f.id}`}>📁 {f.name}</option>)}
                  </optgroup>
                )}
                <optgroup label="Cours">
                  {data.courses.map((c) => <option key={c.id} value={`c:${c.id}`}>{c.title}</option>)}
                </optgroup>
              </select>
            </div>
            <div className="field">
              <label>Nombre de questions</label>
              <Segmented value={n} onChange={setN} options={[5, 10, 20, 40].map((x) => ({ value: x, label: String(x) }))} />
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Type d'entraînement</label>
              <Segmented value={mode} onChange={setMode} options={[
                { value: 'mix', label: 'Mélange' },
                { value: 'qcm', label: 'QCM' },
                { value: 'cas', label: 'Cas cliniques', icon: 'stetho' },
                { value: 'weak', label: 'Mes erreurs', icon: 'target' },
              ]} />
            </div>
          </div>
          <div className="row between wrap" style={{ marginTop: 26, gap: 14 }}>
            <span className="faint small">{available} question{available > 1 ? 's' : ''} disponible{available > 1 ? 's' : ''} · {scopeTitle} · priorité aux questions ratées et jamais vues</span>
            <button className="btn accent lg" disabled={!available}
              onClick={() => setSession({ list: pickQuestions(pool, n, mode), title: scopeTitle, courseId: course ? course.id : null })}>
              <Icon name="play" size={16} /> Commencer
            </button>
          </div>
        </div>
      )}

      {data.history.length > 0 && (
        <>
          <div className="section-title">Historique</div>
          <div className="card" style={{ padding: 8 }}>
            {data.history.slice(0, 8).map((h) => (
              <div key={h.id} className="list-row" style={{ cursor: 'default' }}>
                <div className="grow">
                  <div style={{ fontWeight: 600 }}>{h.courseId ? names[h.courseId] || h.title : h.title || 'Toutes matières'}</div>
                  <div className="faint small">{relDate(h.date)}</div>
                </div>
                <span className={`chip ${h.score / h.total >= 0.7 ? 'success' : h.score / h.total >= 0.5 ? 'warning' : 'danger'}`}>{h.score}/{h.total}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
