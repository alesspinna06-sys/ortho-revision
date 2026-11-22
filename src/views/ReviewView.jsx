import { useEffect, useState } from 'react';
import Icon from '../components/Icon.jsx';
import FlashcardSession from '../components/FlashcardSession.jsx';
import PhoneReviewModal from '../components/PhoneReviewModal.jsx';
import { Empty, courseColor } from '../components/common.jsx';
import { folderBg } from '../components/CourseCard.jsx';
import { useDb, getCards, getCourses, getFolders } from '../lib/db.js';
import { dueCards, shuffle, weakCards } from '../lib/pick.js';
import { mastery } from '../lib/srs.js';

export default function ReviewView({ go, route }) {
  const data = useDb(async () => {
    const [cards, courses, folders] = await Promise.all([getCards(), getCourses(), getFolders()]);
    return { cards, courses, folders };
  }, []);
  const [session, setSession] = useState(null);
  const [folderId, setFolderId] = useState(route.folderId || '');
  const [phone, setPhone] = useState(null);

  useEffect(() => { setFolderId(route.folderId || ''); }, [route.folderId]);

  useEffect(() => {
    if (route.weak && data && !session) {
      const list = weakCards(data.cards);
      if (list.length) setSession({ list: shuffle(list), title: 'Cartes difficiles' });
    }
    if (route.autostart && data && !session) {
      const list = dueCards(data.cards);
      if (list.length) setSession({ list, title: 'Révision du jour' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (!data) return null;
  const names = Object.fromEntries(data.courses.map((c) => [c.id, c.title]));
  if (session) return <FlashcardSession cards={session.list} title={session.title} courseNames={names} onExit={() => { setSession(null); if (route.autostart) go('home'); if (route.weak) go('stats'); }} />;

  const folder = data.folders.find((f) => f.id === folderId);
  const inFolder = folder ? new Set(data.courses.filter((c) => c.folderId === folder.id).map((c) => c.id)) : null;
  const scope = inFolder ? data.courses.filter((c) => inFolder.has(c.id)) : data.courses;
  const cards = inFolder ? data.cards.filter((k) => inFolder.has(k.courseId)) : data.cards;
  const scopeTitle = folder ? folder.name : 'Toutes matières confondues';
  const due = dueCards(cards);
  const byCourse = scope.map((c) => {
    const cs = cards.filter((k) => k.courseId === c.id);
    return { c, cs, due: dueCards(cs).length, mastered: cs.filter((k) => mastery(k) === 'mastered').length };
  }).filter((x) => x.cs.length);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Flashcards</h1>
          <div className="page-sub">Répétition espacée : chaque carte revient juste avant que tu l'oublies.</div>
        </div>
        {folder && (
          <button className="btn" onClick={() => go('folder', { id: folder.id })}><Icon name="folder" size={15} /> Voir le dossier</button>
        )}
      </div>

      {data.cards.length === 0 ? (
        <div className="card"><Empty icon="layers" title="Aucune flashcard" text="Importe un cours : les cartes sont créées automatiquement.">
          <button className="btn primary" onClick={() => go('import')}>Importer un cours</button>
        </Empty></div>
      ) : (
        <>
          {data.folders.length > 0 && (
            <div className="row wrap scope-bar" role="tablist" aria-label="Choisir un dossier">
              <button className={`chip-btn ${!folder ? 'on' : ''}`} onClick={() => setFolderId('')}>Tous les dossiers</button>
              {data.folders.map((f) => (
                <button key={f.id} className={`chip-btn ${folder?.id === f.id ? 'on' : ''}`} style={{ '--c': f.color }} onClick={() => setFolderId(f.id)}>
                  <span className="dot-c" style={{ background: f.color }} /> {f.name}
                </button>
              ))}
            </div>
          )}

          <div className="hero row between" style={folder ? { background: folderBg(folder.color) } : undefined}>
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div className="label">{scopeTitle}</div>
              <div className="big" style={{ marginTop: 10 }}>{due.length}</div>
              <div className="label">carte{due.length > 1 ? 's' : ''} à réviser maintenant</div>
            </div>
            <div className="stack" style={{ position: 'relative', zIndex: 1 }}>
              <button className="btn white lg" disabled={!due.length} onClick={() => setSession({ list: due, title: folder ? `Révision · ${folder.name}` : 'Révision du jour' })}><Icon name="play" size={16} /> Réviser</button>
              <button className="btn lg" style={{ background: 'rgba(255,255,255,.16)', color: '#fff', borderColor: 'rgba(255,255,255,.25)' }}
                disabled={!cards.length}
                onClick={() => setSession({ list: shuffle(cards).slice(0, 30), title: folder ? `Mélange · ${folder.name}` : 'Mélange libre' })}>
                Mélange libre (30)
              </button>
              <button className="btn lg" style={{ background: 'rgba(255,255,255,.16)', color: '#fff', borderColor: 'rgba(255,255,255,.25)' }}
                disabled={!cards.length}
                onClick={() => setPhone({ list: due.length ? due : shuffle(cards).slice(0, 30), title: folder ? `Révision · ${folder.name}` : due.length ? 'Révision du jour' : 'Mélange libre' })}>
                <Icon name="phone" size={16} /> Sur mon téléphone
              </button>
            </div>
          </div>

          {phone && <PhoneReviewModal cards={phone.list} title={phone.title} courseNames={names} onClose={() => setPhone(null)} />}

          <div className="section-title">Par cours</div>
          {byCourse.length === 0 ? (
            <div className="card"><Empty icon="layers" title="Aucune flashcard dans ce dossier" text="Range des cours dans le dossier : leurs cartes apparaîtront ici." /></div>
          ) : (
            <div className="card" style={{ padding: 8 }}>
              {byCourse.map(({ c, cs, due: d, mastered }) => (
                <div key={c.id} className="list-row" onClick={() => setSession({ list: d ? dueCards(cs) : shuffle(cs), title: c.title })}>
                  <div className="course-icon" style={{ background: courseColor(c.subject || c.title) }}><Icon name="layers" size={17} /></div>
                  <div className="grow">
                    <div style={{ fontWeight: 600 }}>{c.title}</div>
                    <div className="progress" style={{ marginTop: 8, maxWidth: 260 }}><i style={{ transform: `scaleX(${mastered / cs.length})` }} /></div>
                  </div>
                  <span className="faint small">{mastered}/{cs.length} maîtrisées</span>
                  {d > 0 ? <span className="chip accent">{d} à revoir</span> : <span className="chip success">À jour</span>}
                  <Icon name="right" size={16} className="faint" />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
