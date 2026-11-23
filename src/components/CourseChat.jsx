import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import Markdown from './Markdown.jsx';
import { Empty } from './common.jsx';
import { useToast } from './Toast.jsx';
import { updateCourse, addCards, uid } from '../lib/db.js';
import { askCourse, cardFromAnswer } from '../lib/ai-extra.js';
import { CARD_CATEGORIES } from '../lib/ai.js';
import { newSrs } from '../lib/srs.js';

const MAX_MESSAGES = 60;

/** Onglet « Questions » : poser ses questions sur le cours, garder la conversation, en faire des flashcards. */
export default function CourseChat({ course, hasKey }) {
  const toast = useToast();
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [making, setMaking] = useState(null);
  const chat = course.chat || [];
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [chat.length, busy]);

  const ask = async (text = question) => {
    const q = text.trim();
    if (!q || busy) return;
    if (!hasKey) { toast({ type: 'error', text: 'Ajoute ta clé Gemini dans Réglages.' }); return; }
    setBusy(true);
    setQuestion('');
    const withQ = [...chat, { id: uid(), role: 'user', text: q, at: Date.now() }];
    await updateCourse(course.id, { chat: withQ.slice(-MAX_MESSAGES) });
    try {
      const answer = await askCourse(course, chat, q);
      await updateCourse(course.id, { chat: [...withQ, { id: uid(), role: 'assistant', text: answer, at: Date.now(), q }].slice(-MAX_MESSAGES) });
    } catch (err) {
      toast({ type: 'error', text: err.message });
      setQuestion(q);
      await updateCourse(course.id, { chat: chat.slice(-MAX_MESSAGES) });
    }
    setBusy(false);
  };

  const makeCard = async (m) => {
    setMaking(m.id);
    try {
      const c = await cardFromAnswer(m.q || '', m.text, CARD_CATEGORIES);
      await addCards([{ id: uid(), courseId: course.id, ...c, srs: newSrs(), createdAt: Date.now(), fromChat: true }]);
      await updateCourse(course.id, { chat: chat.map((x) => (x.id === m.id ? { ...x, cardMade: true } : x)) });
      toast({ type: 'success', text: `Flashcard ajoutée : « ${c.front} »` });
    } catch (err) {
      toast({ type: 'error', text: err.message });
    }
    setMaking(null);
  };

  const ideas = ['Résume-moi ce cours en 5 points', 'Quelles sont les notions que je confonds souvent ici ?', 'Donne-moi un exemple concret de la notion principale'];

  return (
    <div className="chat">
      {chat.length === 0 && !busy ? (
        <div className="card">
          <Empty icon="brain" title="Pose tes questions sur ce cours" text="Gemini répond en s'appuyant sur ton cours, et le signale quand il le complète. Chaque réponse peut devenir une flashcard.">
            <div className="row wrap" style={{ justifyContent: 'center', gap: 8 }}>
              {ideas.map((t) => <button key={t} className="chip-btn" onClick={() => ask(t)}>{t}</button>)}
            </div>
          </Empty>
        </div>
      ) : (
        <div className="chat-log">
          {chat.map((m) => (
            <div key={m.id} className={`bubble ${m.role}`}>
              {m.role === 'user' ? <div className="selectable">{m.text}</div> : (
                <>
                  <Markdown text={m.text} terms={course.keyTerms || []} />
                  <div className="bubble-actions">
                    {m.cardMade
                      ? <span className="chip success"><Icon name="check" size={12} /> Flashcard créée</span>
                      : <button className="btn sm ghost" disabled={making === m.id} onClick={() => makeCard(m)}>
                          {making === m.id ? <span className="spinner" /> : <Icon name="layers" size={14} />} En faire une flashcard
                        </button>}
                  </div>
                </>
              )}
            </div>
          ))}
          {busy && <div className="bubble assistant"><span className="spinner" style={{ color: 'var(--accent)' }} /> <span className="faint small">Gemini relit le cours…</span></div>}
          <div ref={endRef} />
        </div>
      )}

      <div className="chat-input card">
        <textarea className="textarea" rows={2} value={question} placeholder="Ta question sur ce cours… (Entrée pour envoyer, Maj + Entrée pour aller à la ligne)"
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } }} aria-label="Question sur le cours" />
        <div className="row between" style={{ marginTop: 10 }}>
          {chat.length > 0
            ? <button className="btn sm ghost" disabled={busy} onClick={() => updateCourse(course.id, { chat: [] })}><Icon name="trash" size={14} /> Effacer la conversation</button>
            : <span />}
          <button className="btn accent" disabled={busy || !question.trim()} onClick={() => ask()}><Icon name="sparkles" size={15} /> Demander</button>
        </div>
      </div>
    </div>
  );
}
