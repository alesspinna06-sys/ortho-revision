import { useMemo, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Empty } from '../components/common.jsx';
import { useToast } from '../components/Toast.jsx';
import { useDb, getRefs, putRefs, deleteRef, getCourses, updateCourse } from '../lib/db.js';
import { extractTests } from '../lib/ai-ortho.js';

const key = (s = '') => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

/** Fusionne une fiche trouvée dans un cours avec la fiche existante (rien n'est écrasé par du vide). */
function mergeTest(old, t, course) {
  const pick = (a, b) => (a && a.trim() ? a : b || '');
  const sources = [...(old?.sources || [])];
  if (!sources.some((s) => s.id === course.id)) sources.push({ id: course.id, title: course.title });
  return {
    id: old?.id || `test-${key(t.nom)}`,
    kind: 'test',
    name: pick(old?.name, t.nom.trim()),
    fullName: pick(old?.fullName, t.nomComplet),
    domain: pick(old?.domain, t.domaine),
    ages: pick(old?.ages, t.ages),
    evaluates: pick(old?.evaluates, t.evalue),
    epreuves: [...new Set([...(old?.epreuves || []), ...(t.epreuves || [])].map((e) => e.trim()).filter(Boolean))],
    sources,
    updatedAt: Date.now(),
  };
}

/** Répertoire des tests de bilan, construit à partir des cours. */
export default function TestsView({ go, hasKey }) {
  const toast = useToast();
  const data = useDb(async () => {
    const [tests, courses] = await Promise.all([getRefs('test'), getCourses()]);
    return { tests, courses };
  }, []);
  const [q, setQ] = useState('');
  const [domain, setDomain] = useState('');
  const [progress, setProgress] = useState(null);

  const domains = useMemo(() => [...new Set((data?.tests || []).map((t) => t.domain).filter(Boolean))].sort(), [data]);
  const list = useMemo(() => {
    const s = key(q);
    return (data?.tests || []).filter((t) => (!domain || t.domain === domain) &&
      (!s || key(`${t.name} ${t.fullName} ${t.evaluates} ${t.epreuves.join(' ')}`).includes(s)));
  }, [data, q, domain]);
  if (!data) return null;

  const toScan = data.courses.filter((c) => c.text?.trim() && (!c.testsScannedAt || c.testsScannedAt < c.updatedAt - 1000));

  const scan = async (all = false) => {
    if (!hasKey) return toast({ type: 'error', text: 'Ajoute ta clé Gemini dans Réglages.' });
    const courses = all ? data.courses.filter((c) => c.text?.trim()) : toScan;
    if (!courses.length) return toast({ type: 'success', text: 'Le répertoire est à jour.' });
    const byKey = new Map((await getRefs('test')).map((t) => [key(t.name), t]));
    let found = 0;
    for (let i = 0; i < courses.length; i++) {
      const c = courses[i];
      setProgress({ i: i + 1, n: courses.length, title: c.title });
      try {
        const tests = await extractTests(c);
        tests.forEach((t) => { const k = key(t.nom); byKey.set(k, mergeTest(byKey.get(k), t, c)); found++; });
        await putRefs([...byKey.values()]);
        await updateCourse(c.id, { testsScannedAt: Date.now() + 2000 });
      } catch (e) {
        toast({ type: 'error', text: `${c.title} : ${e.message}` });
        if (/quota/i.test(e.message)) break;
      }
    }
    setProgress(null);
    toast({ type: 'success', text: found ? `${found} mention${found > 1 ? 's' : ''} de tests analysée${found > 1 ? 's' : ''}.` : 'Aucun test trouvé dans ces cours.' });
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Tests de bilan</h1>
          <div className="page-sub">Une fiche par test, remplie uniquement avec ce que disent tes cours.</div>
        </div>
        <div className="row">
          <button className="btn accent" disabled={!!progress} onClick={() => scan(false)}>
            {progress ? <><span className="spinner" /> Cours {progress.i}/{progress.n}…</> : <><Icon name="sparkles" /> Mettre à jour depuis mes cours{toScan.length ? ` (${toScan.length})` : ''}</>}
          </button>
        </div>
      </div>
      {progress && <div className="faint small" style={{ marginTop: -14, marginBottom: 16 }}>Lecture de « {progress.title} »…</div>}

      {data.tests.length === 0 ? (
        <div className="card"><Empty icon="clipboard" title="Aucun test pour l'instant" text="Clique sur « Mettre à jour depuis mes cours » : l'IA relève les tests cités dans chaque cours (âges, épreuves, ce qu'ils évaluent)." /></div>
      ) : (
        <>
          <div className="row wrap" style={{ marginBottom: 16 }}>
            <div className="search grow" style={{ maxWidth: 380 }}>
              <Icon name="search" size={16} />
              <input className="input" placeholder="Chercher un test, une épreuve…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="row wrap" style={{ gap: 6 }}>
              <button className={`chip-btn ${!domain ? 'on' : ''}`} onClick={() => setDomain('')}>Tous ({data.tests.length})</button>
              {domains.map((d) => <button key={d} className={`chip-btn ${domain === d ? 'on' : ''}`} onClick={() => setDomain(d)}>{d}</button>)}
            </div>
          </div>
          <div className="grid tests-grid">
            {list.map((t) => (
              <div key={t.id} className="card test-card">
                <div className="row between" style={{ alignItems: 'flex-start' }}>
                  <div>
                    <div className="test-name">{t.name}</div>
                    {t.fullName && <div className="small muted">{t.fullName}</div>}
                  </div>
                  <button className="btn icon sm ghost" title="Retirer cette fiche" aria-label="Retirer cette fiche" onClick={() => deleteRef(t.id)}><Icon name="x" size={14} /></button>
                </div>
                <div className="row wrap" style={{ gap: 6, margin: '10px 0' }}>
                  {t.domain && <span className="chip accent">{t.domain}</span>}
                  <span className="chip">{t.ages || 'Âge non précisé dans le cours'}</span>
                </div>
                {t.evaluates && <p className="small selectable" style={{ margin: '0 0 8px' }}><b>Évalue : </b>{t.evaluates}</p>}
                {t.epreuves.length > 0 && <ul className="clean-list small selectable">{t.epreuves.map((e) => <li key={e}>{e}</li>)}</ul>}
                <div className="row wrap test-sources">
                  {t.sources.map((s) => <button key={s.id} className="chip-btn" onClick={() => go('course', { id: s.id })} title="Ouvrir le cours"><Icon name="book" size={12} /> {s.title}</button>)}
                </div>
              </div>
            ))}
          </div>
          <p className="faint small" style={{ marginTop: 14 }}>
            Les fiches ne contiennent que ce que disent tes cours : vérifie les âges et les épreuves dans le manuel du test avant un bilan réel.{' '}
            <button className="link-btn" disabled={!!progress} onClick={() => scan(true)}>Relire tous les cours</button>
          </p>
        </>
      )}
    </>
  );
}
