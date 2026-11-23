import Icon from '../components/Icon.jsx';
import { courseColor, relDate, StatusChip, SOURCE_ICON, Empty } from '../components/common.jsx';
import { useDb, getCourses, getCards, getQuestions, getHistory } from '../lib/db.js';
import { useSettings } from '../lib/settings.jsx';
import { streak, mastery } from '../lib/srs.js';
import { lastRead } from '../lib/readPos.js';

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Bonne nuit' : h < 18 ? 'Bonjour' : 'Bonsoir';
}

export default function Dashboard({ go, jobs, hasKey, dueCount }) {
  const { settings } = useSettings();
  const data = useDb(async () => {
    const [courses, cards, questions, history] = await Promise.all([getCourses(), getCards(), getQuestions(), getHistory()]);
    return { courses, cards, questions, history };
  }, []);
  if (!data) return null;
  const { courses, cards, questions, history } = data;

  const quizzes = history.filter((h) => h.type === 'quiz' && h.total);
  const last10 = quizzes.slice(0, 10);
  const rate = last10.length ? last10.reduce((s, h) => s + h.score / h.total, 0) / last10.length : null;
  const mastered = cards.filter((c) => mastery(c) === 'mastered').length;
  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <>
      <div className="page-head">
        <div>
          <div className="faint small" style={{ textTransform: 'capitalize', fontWeight: 600 }}>{today}</div>
          <h1 className="page-title">{greeting()} {settings.name} 👋</h1>
          <div className="page-sub">Prête pour une petite séance de révision ?</div>
        </div>
        <button className="btn accent lg" onClick={() => go('import')}><Icon name="plus" /> Ajouter un cours</button>
      </div>

      {(() => {
        const last = lastRead(courses);
        if (!last) return null;
        const { course, pos } = last;
        return (
          <button className="card continue-card" onClick={() => go('course', { id: course.id })}>
            <div className="continue-icon"><Icon name="bookmark" size={18} /></div>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="faint small" style={{ fontWeight: 650 }}>Continuer la lecture</div>
              <div className="continue-title">{course.title}{pos.part ? <span className="faint">, partie {pos.part}{pos.parts ? ` sur ${pos.parts}` : ''}</span> : null}</div>
              {pos.headingText && <div className="faint small clamp-1">{pos.headingText}</div>}
              <div className="progress" style={{ marginTop: 8, maxWidth: 360 }}><i style={{ transform: `scaleX(${Math.min(1, Math.max(0.03, pos.ratio))})` }} /></div>
            </div>
            <span className="btn accent"><Icon name="play" size={14} /> Reprendre</span>
          </button>
        );
      })()}
      {!hasKey && (
        <div className="card row" style={{ marginBottom: 16, borderColor: 'rgba(245,158,11,.35)' }}>
          <div className="option-icon" style={{ color: 'var(--warning)' }}><Icon name="key" /></div>
          <div className="grow">
            <b>Connecte l'IA Gemini pour générer fiches, flashcards et QCM</b>
            <div className="small muted">Une clé gratuite suffit — 1 minute de configuration.</div>
          </div>
          <button className="btn primary" onClick={() => go('settings')}>Configurer</button>
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: '1.35fr 1fr', gap: 16 }}>
        <div className="hero">
          <div className="row between" style={{ position: 'relative', zIndex: 1 }}>
            <span className="label">Révision du jour</span>
            <span className="row small" style={{ fontWeight: 650 }}><Icon name="flame" size={16} /> {streak()} j de suite</span>
          </div>
          <div className="big" style={{ marginTop: 18 }}>{dueCount}</div>
          <div className="label">carte{dueCount > 1 ? 's' : ''} à réviser</div>
          <div className="row" style={{ marginTop: 22, position: 'relative', zIndex: 1 }}>
            <button className="btn white lg" disabled={!dueCount} onClick={() => go('review', { autostart: true })}>
              <Icon name="play" size={16} /> Commencer
            </button>
            <button className="btn lg" style={{ background: 'rgba(255,255,255,.16)', color: '#fff', borderColor: 'rgba(255,255,255,.25)' }} disabled={!questions.length} onClick={() => go('quiz', { autostart: true })}>
              QCM express
            </button>
          </div>
        </div>
        <div className="grid grid-2">
          <Stat icon="book" label="Cours" value={courses.length} />
          <Stat icon="layers" label="Flashcards" value={cards.length} sub={`${mastered} maîtrisées`} />
          <Stat icon="quiz" label="Questions" value={questions.length} sub={`${questions.filter((q) => q.kind === 'cas').length} cas cliniques`} />
          <Stat icon="target" label="Réussite QCM" value={rate == null ? '—' : `${Math.round(rate * 100)}%`} sub="10 derniers quiz" />
        </div>
      </div>

      <div className="section-title">
        Cours récents
        {courses.length > 0 && <button className="btn sm ghost" onClick={() => go('library')}>Tout voir <Icon name="right" size={14} /></button>}
      </div>
      {courses.length === 0 ? (
        <div className="card">
          <Empty icon="upload" title="Ajoute ton premier cours" text="Glisse un PowerPoint, un Word, un PDF… ou photographie tes notes avec ton téléphone.">
            <button className="btn primary" onClick={() => go('import')}>Importer un cours</button>
          </Empty>
        </div>
      ) : (
        <div className="card" style={{ padding: 8 }}>
          {courses.slice(0, 5).map((c) => (
            <div key={c.id} className="list-row" onClick={() => go('course', { id: c.id })}>
              <div className="course-icon" style={{ background: courseColor(c.subject || c.title) }}><Icon name={SOURCE_ICON[c.sourceType] || 'file'} size={18} /></div>
              <div className="grow">
                <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.title}</div>
                <div className="faint small">{c.subject || 'Sans matière'} · {relDate(c.createdAt)}</div>
              </div>
              <StatusChip course={c} job={jobs.get(c.id)} />
              <Icon name="right" size={16} className="faint" />
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function Stat({ icon, label, value, sub }) {
  return (
    <div className="card stat pad-s">
      <div className="k"><span className="icon-bubble"><Icon name={icon} size={15} /></span>{label}</div>
      <div className="v">{value}</div>
      {sub && <div className="faint small">{sub}</div>}
    </div>
  );
}
