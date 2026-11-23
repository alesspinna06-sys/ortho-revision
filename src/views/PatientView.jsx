import { useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import Report from '../components/Report.jsx';
import { Empty, Segmented, relDate } from '../components/common.jsx';
import { useToast } from '../components/Toast.jsx';
import { useDb, getCourses, getFolders, getSims, getSim, putSim, deleteSim, uid } from '../lib/db.js';
import { generateCase, patientReply, bilanResults, evaluateCase } from '../lib/ai-ortho.js';
import { markActivity } from '../lib/srs.js';

const STEPS = [['anamnese', 'Anamnèse'], ['bilan', 'Bilan'], ['conclusion', 'Conclusion'], ['done', 'Correction']];

/** Patient simulé : anamnèse dialoguée, bilan, hypothèse diagnostique, correction. */
export default function PatientView({ go, route, hasKey }) {
  if (route.simId) return <SimSession key={route.simId} id={route.simId} go={go} hasKey={hasKey} />;
  return <SimHome go={go} hasKey={hasKey} />;
}

function SimHome({ go, hasKey }) {
  const toast = useToast();
  const data = useDb(async () => {
    const [courses, folders, sims] = await Promise.all([getCourses(), getFolders(), getSims()]);
    return { courses: courses.filter((c) => c.status === 'ready' || c.summary), folders, sims };
  }, []);
  const [scope, setScope] = useState('');
  const [level, setLevel] = useState('moyen');
  const [busy, setBusy] = useState(false);
  if (!data) return null;

  const start = async () => {
    if (!hasKey) return toast({ type: 'error', text: 'Ajoute ta clé Gemini dans Réglages.' });
    const pool = scope.startsWith('f:') ? data.courses.filter((c) => c.folderId === scope.slice(2))
      : scope.startsWith('c:') ? data.courses.filter((c) => c.id === scope.slice(2)) : data.courses;
    if (!pool.length) return toast({ type: 'error', text: 'Aucun cours prêt dans cette sélection.' });
    setBusy(true);
    try {
      const picked = pool.slice().sort(() => Math.random() - 0.5).slice(0, 6);
      const c = await generateCase({ courses: picked, level });
      const sim = { id: uid(), case: c, level, phase: 'anamnese', messages: [], bilan: '', bilanResult: null, diagnostic: '', projet: '', result: null, courseIds: picked.map((x) => x.id), createdAt: Date.now() };
      await putSim(sim);
      go('patient', { simId: sim.id });
    } catch (e) { toast({ type: 'error', text: e.message }); }
    setBusy(false);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Patient simulé</h1>
          <div className="page-sub">Entraîne-toi à l'anamnèse, au choix du bilan et au raisonnement clinique, sur des cas tirés de tes cours.</div>
        </div>
      </div>
      {!data.courses.length ? (
        <div className="card"><Empty icon="stetho" title="Il faut d'abord des cours" text="Importe et génère au moins un cours : les cas cliniques sont construits à partir de tes cours." /></div>
      ) : (
        <div className="grid grid-2" style={{ alignItems: 'start' }}>
          <div className="card stack" style={{ gap: 14 }}>
            <b style={{ fontSize: 17 }}>Nouveau patient</b>
            <div className="field">
              <label htmlFor="sim-scope">Cas tiré de</label>
              <select id="sim-scope" className="select" value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="">Tous mes cours</option>
                {data.folders.length > 0 && <optgroup label="Dossiers">{data.folders.map((f) => <option key={f.id} value={`f:${f.id}`}>📁 {f.name}</option>)}</optgroup>}
                <optgroup label="Cours">{data.courses.map((c) => <option key={c.id} value={`c:${c.id}`}>{c.title}</option>)}</optgroup>
              </select>
            </div>
            <div className="field">
              <label>Difficulté</label>
              <Segmented value={level} onChange={setLevel} options={[{ value: 'facile', label: 'Typique' }, { value: 'moyen', label: 'Classique' }, { value: 'difficile', label: 'Atypique' }]} />
            </div>
            <button className="btn accent lg" disabled={busy} onClick={start}>
              {busy ? <><span className="spinner" /> Le patient arrive…</> : <><Icon name="stetho" /> Recevoir un patient</>}
            </button>
          </div>
          <div className="card">
            <b>Déroulé</b>
            <ol className="clean-list numbered small" style={{ marginTop: 10 }}>
              <li><b>Anamnèse</b> : pose tes questions, le patient (ou sa famille) répond avec ses mots.</li>
              <li><b>Bilan</b> : propose tes épreuves, tu reçois les résultats.</li>
              <li><b>Conclusion</b> : hypothèse diagnostique, diagnostic différentiel, projet thérapeutique.</li>
              <li><b>Correction</b> : note sur 20 et cas complet expliqué.</li>
            </ol>
          </div>
        </div>
      )}

      {data.sims.length > 0 && (
        <>
          <div className="section-title">Mes patients</div>
          <div className="card" style={{ padding: 8 }}>
            {data.sims.map((x) => (
              <div key={x.id} className="list-row" onClick={() => go('patient', { simId: x.id })}>
                <Icon name="stetho" size={17} />
                <div className="grow">
                  <div style={{ fontWeight: 600 }}>{x.case?.titre || 'Patient'}</div>
                  <div className="faint small">{relDate(x.createdAt)} · {STEPS.find((s) => s[0] === x.phase)?.[1]}</div>
                </div>
                {x.result?.note != null
                  ? <span className={`chip ${x.result.note >= 12 ? 'success' : x.result.note >= 8 ? 'warning' : 'danger'}`}>{String(x.result.note).replace('.', ',')}/20</span>
                  : <span className="chip">En cours</span>}
                <button className="btn icon sm ghost" title="Supprimer" aria-label="Supprimer" onClick={(e) => { e.stopPropagation(); deleteSim(x.id); }}><Icon name="trash" size={14} /></button>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function SimSession({ id, go, hasKey }) {
  const toast = useToast();
  const [sim, setSim] = useState(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState('');
  const endRef = useRef(null);

  useEffect(() => { getSim(id).then(setSim); }, [id]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [sim?.messages?.length, busy]);
  if (!sim) return null;
  const c = sim.case;
  const save = async (patch) => { const next = { ...sim, ...patch }; setSim(next); await putSim(next); return next; };
  const guard = () => { if (!hasKey) { toast({ type: 'error', text: 'Ajoute ta clé Gemini dans Réglages.' }); return false; } return true; };

  const ask = async () => {
    const question = q.trim();
    if (!question || busy || !guard()) return;
    setQ('');
    setBusy('ask');
    const msgs = [...sim.messages, { role: 'user', text: question }];
    let next = await save({ messages: msgs });
    try {
      const answer = await patientReply({ c, history: sim.messages, question });
      next = await save({ messages: [...msgs, { role: 'patient', text: answer }] });
    } catch (e) { toast({ type: 'error', text: e.message }); setQ(question); await save({ messages: sim.messages }); }
    setBusy('');
    return next;
  };
  const askBilan = async () => {
    if (!sim.bilan.trim() || !guard()) return;
    setBusy('bilan');
    try { await save({ bilanResult: await bilanResults({ c, requested: sim.bilan }) }); } catch (e) { toast({ type: 'error', text: e.message }); }
    setBusy('');
  };
  const finish = async () => {
    if (!guard()) return;
    setBusy('eval');
    try {
      const result = await evaluateCase({ c, messages: sim.messages, bilan: sim.bilan, diagnostic: sim.diagnostic, projet: sim.projet });
      await save({ result, phase: 'done' });
      markActivity();
    } catch (e) { toast({ type: 'error', text: e.message }); }
    setBusy('');
  };
  const stepIdx = STEPS.findIndex((s) => s[0] === sim.phase);

  return (
    <>
      <button className="back-link" onClick={() => go('patient')}><Icon name="left" size={16} /> Patient simulé</button>
      <div className="stepper">
        {STEPS.map(([k, label], i) => (
          <div key={k} className={`step ${sim.phase === k ? 'on' : stepIdx > i ? 'done' : ''}`}>
            <span>{stepIdx > i ? <Icon name="check" size={12} /> : i + 1}</span>{label}
          </div>
        ))}
      </div>

      <div className="card patient-card">
        <div className="patient-avatar"><Icon name="stetho" size={22} /></div>
        <div className="grow">
          <div style={{ fontWeight: 700, fontSize: 17 }}>{c.patient.prenom}, {c.patient.age}</div>
          <div className="small muted">{c.patient.contexte}</div>
          <div className="patient-plainte selectable">« {c.plainte} »</div>
          <div className="faint small">Tu parles avec : {c.interlocuteur}</div>
        </div>
      </div>

      {sim.phase === 'anamnese' && (
        <div className="card" style={{ marginTop: 16 }}>
          <b>Anamnèse</b>
          <div className="chat-log" style={{ marginTop: 12 }}>
            {sim.messages.length === 0 && <p className="faint small">Pose ta première question (motif, développement, antécédents, vie quotidienne…).</p>}
            {sim.messages.map((m, i) => (
              <div key={i} className={`bubble ${m.role === 'user' ? 'user' : 'assistant'}`}><div className="selectable">{m.text}</div></div>
            ))}
            {busy === 'ask' && <div className="bubble assistant"><span className="spinner" /></div>}
            <div ref={endRef} />
          </div>
          <div className="row" style={{ marginTop: 12, gap: 8 }}>
            <input className="input grow" value={q} placeholder="Ta question…" aria-label="Question au patient"
              onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ask()} />
            <button className="btn primary" disabled={!q.trim() || !!busy} onClick={ask}>Demander</button>
          </div>
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
            <button className="btn accent" disabled={!sim.messages.length || !!busy} onClick={() => save({ phase: 'bilan' })}>Passer au bilan <Icon name="right" size={15} /></button>
          </div>
        </div>
      )}

      {sim.phase === 'bilan' && (
        <div className="card stack" style={{ marginTop: 16, gap: 12 }}>
          <b>Bilan</b>
          <textarea className="textarea" style={{ minHeight: 120 }} value={sim.bilan} onChange={(e) => setSim({ ...sim, bilan: e.target.value })} onBlur={() => putSim(sim)}
            placeholder="Quelles épreuves ou quels tests proposes-tu, et pourquoi ? (ex. EVALO 2-6 : phonologie, lexique…)" />
          <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn" disabled={!sim.bilan.trim() || !!busy} onClick={askBilan}>{busy === 'bilan' ? <><span className="spinner" /> Passation…</> : sim.bilanResult ? 'Refaire avec ce bilan' : 'Faire passer le bilan'}</button>
          </div>
          {sim.bilanResult && (
            <div className="bilan-results view-enter">
              {(sim.bilanResult.resultats || []).map((r, i) => (
                <div key={i} className="bilan-row"><b>{r.epreuve}</b><span>{r.resultat}</span><span className="muted small">{r.interpretation}</span></div>
              ))}
              {sim.bilanResult.remarque && <div className="q-context small" style={{ marginTop: 10 }}>{sim.bilanResult.remarque}</div>}
            </div>
          )}
          <div className="row between">
            <button className="btn ghost" onClick={() => save({ phase: 'anamnese' })}><Icon name="left" size={15} /> Anamnèse</button>
            <button className="btn accent" disabled={!sim.bilanResult || !!busy} onClick={() => save({ phase: 'conclusion' })}>Conclure <Icon name="right" size={15} /></button>
          </div>
        </div>
      )}

      {sim.phase === 'conclusion' && (
        <div className="card stack" style={{ marginTop: 16, gap: 12 }}>
          <div className="field">
            <label htmlFor="sim-diag">Hypothèse diagnostique et diagnostic différentiel</label>
            <textarea id="sim-diag" className="textarea" style={{ minHeight: 110 }} value={sim.diagnostic} onChange={(e) => setSim({ ...sim, diagnostic: e.target.value })} onBlur={() => putSim(sim)} />
          </div>
          <div className="field">
            <label htmlFor="sim-projet">Projet thérapeutique (objectifs, axes, fréquence, partenaires)</label>
            <textarea id="sim-projet" className="textarea" style={{ minHeight: 110 }} value={sim.projet} onChange={(e) => setSim({ ...sim, projet: e.target.value })} onBlur={() => putSim(sim)} />
          </div>
          <div className="row between">
            <button className="btn ghost" onClick={() => save({ phase: 'bilan' })}><Icon name="left" size={15} /> Bilan</button>
            <button className="btn accent lg" disabled={!sim.diagnostic.trim() || !!busy} onClick={finish}>{busy === 'eval' ? <><span className="spinner" /> Correction…</> : <><Icon name="check" /> Rendre ma conclusion</>}</button>
          </div>
        </div>
      )}

      {sim.phase === 'done' && (
        <div style={{ marginTop: 16 }}>
          <Report r={sim.result} corrigeLabel="Le cas complet" />
        </div>
      )}
    </>
  );
}
