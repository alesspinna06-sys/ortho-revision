import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon.jsx';
import { Segmented, relDate } from './common.jsx';
import { useToast } from './Toast.jsx';
import { useDb, getCourses, getFolders, addFolder, updateCourse, mergeCourses, FOLDER_COLORS } from '../lib/db.js';
import { findSimilar, pairKey, suggestFolderName, SENSITIVITY, MERGE } from '../lib/similar.js';
import { enqueue } from '../lib/jobs.js';

const IGNORE_KEY = 'similar-ignored';
const loadIgnored = () => { try { return new Set(JSON.parse(localStorage.getItem(IGNORE_KEY) || '[]')); } catch { return new Set(); } };
const saveIgnored = (set) => { try { localStorage.setItem(IGNORE_KEY, JSON.stringify([...set])); } catch { /* stockage indisponible */ } };

/** Fenêtre « Cours similaires » : fusionner, ranger dans un dossier ou ignorer. */
export default function SimilarModal({ onClose, go, hasKey }) {
  const data = useDb(async () => {
    const [courses, folders] = await Promise.all([getCourses(), getFolders()]);
    return { courses, folders };
  }, []);
  const [level, setLevel] = useState('normal');
  const [ignored, setIgnored] = useState(loadIgnored);

  const groups = useMemo(
    () => (data ? findSimilar(data.courses, { threshold: SENSITIVITY[level], ignored }) : []),
    [data, level, ignored],
  );

  const ignore = (group) => {
    const next = new Set(ignored);
    group.courses.forEach((a) => group.courses.forEach((b) => { if (a.id !== b.id) next.add(pairKey(a.id, b.id)); }));
    saveIgnored(next);
    setIgnored(next);
  };
  const resetIgnored = () => { saveIgnored(new Set()); setIgnored(new Set()); };

  return createPortal(
    <div className="overlay" onClick={onClose}>
      <div className="modal similar-modal" onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <span className="chip accent"><Icon name="link" size={12} /> Cours similaires</span>
          <button className="btn icon sm ghost" onClick={onClose} aria-label="Fermer"><Icon name="x" /></button>
        </div>
        <h2 style={{ fontSize: 22, margin: '14px 0 4px' }}>Regrouper les cours proches</h2>
        <p className="muted small" style={{ margin: 0 }}>
          L'analyse compare les titres, les termes clés et le contenu de tes cours, directement sur cet ordinateur (sans IA, sans quota).
        </p>

        <div className="row between wrap" style={{ margin: '16px 0 12px', gap: 10 }}>
          <Segmented value={level} onChange={setLevel} options={[
            { value: 'strict', label: 'Très proches' },
            { value: 'normal', label: 'Proches' },
            { value: 'large', label: 'Large' },
          ]} />
          {ignored.size > 0 && <button className="btn sm ghost" onClick={resetIgnored}>Revoir les groupes ignorés</button>}
        </div>

        {!data ? <div className="spinner" /> : groups.length === 0 ? (
          <div className="empty" style={{ padding: '30px 10px' }}>
            <div className="big-icon"><Icon name="check" size={26} /></div>
            <h3>Aucun cours assez proche</h3>
            <p>{data.courses.length < 2 ? 'Il faut au moins deux cours.' : 'Essaie le réglage « Large » pour une recherche plus souple.'}</p>
          </div>
        ) : (
          <div className="stack" style={{ gap: 12 }}>
            {groups.map((g) => (
              <SimilarGroup
                key={g.courses.map((c) => c.id).join('|')} group={g} folders={data.folders} go={go} hasKey={hasKey}
                onIgnore={() => ignore(g)} onDone={onClose}
              />
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function SimilarGroup({ group, folders, go, hasKey, onIgnore, onDone }) {
  const toast = useToast();
  const veryClose = group.score >= MERGE;
  // Meilleur score de chaque cours avec un autre cours du groupe
  const best = useMemo(() => {
    const m = new Map();
    group.pairs.forEach((p) => {
      m.set(p.a, Math.max(m.get(p.a) || 0, p.score));
      m.set(p.b, Math.max(m.get(p.b) || 0, p.score));
    });
    return m;
  }, [group]);
  const [checked, setChecked] = useState(() => new Set(
    group.courses.filter((c) => !veryClose || (best.get(c.id) || 0) >= MERGE).map((c) => c.id),
  ));
  const [mode, setMode] = useState(null); // null | 'merge' | 'folder'
  const selected = group.courses.filter((c) => checked.has(c.id));
  const [targetId, setTargetId] = useState(selected[0]?.id || group.courses[0].id);
  const [folderChoice, setFolderChoice] = useState('new');
  const [folderName, setFolderName] = useState(() => suggestFolderName(group.courses));
  const [busy, setBusy] = useState(false);

  const toggle = (id) => setChecked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const target = selected.find((c) => c.id === targetId) || selected[0];

  const doMerge = async () => {
    if (selected.length < 2 || !target) return;
    setBusy(true);
    try {
      const merged = await mergeCourses(target.id, selected.map((c) => c.id).filter((id) => id !== target.id));
      if (hasKey) enqueue(merged.id, ['summary']);
      toast({ type: 'success', text: `${selected.length} cours fusionnés.${hasKey ? ' La fiche est en cours de réécriture.' : ' Ajoute ta clé Gemini pour refaire la fiche.'}` });
      onDone();
      go('course', { id: merged.id });
    } catch (err) {
      toast({ type: 'error', text: err.message });
      setBusy(false);
    }
  };

  const doFolder = async () => {
    if (!selected.length) return;
    setBusy(true);
    try {
      const folderId = folderChoice === 'new'
        ? (await addFolder({ name: folderName, color: FOLDER_COLORS[folders.length % FOLDER_COLORS.length] })).id
        : folderChoice;
      for (const c of selected) await updateCourse(c.id, { folderId });
      toast({ type: 'success', text: `${selected.length} cours rangés dans le dossier.` });
      onDone();
      go('folder', { id: folderId });
    } catch (err) {
      toast({ type: 'error', text: err.message });
      setBusy(false);
    }
  };

  return (
    <div className="similar-group">
      <div className="row between" style={{ marginBottom: 8 }}>
        <span className={`chip ${veryClose ? 'warning' : 'accent'}`}>
          {veryClose ? 'Presque identiques : fusion conseillée' : 'Sujets proches : à ranger ensemble'}
        </span>
        <button className="btn sm ghost" onClick={onIgnore} disabled={busy}>Ignorer</button>
      </div>

      <div className="stack" style={{ gap: 4 }}>
        {group.courses.map((c) => (
          <label key={c.id} className="similar-row">
            <input type="checkbox" checked={checked.has(c.id)} onChange={() => toggle(c.id)} />
            <span className="grow">
              <b>{c.title}</b>
              <span className="faint small">
                {' · '}{c.subject || 'Sans matière'}
                {c.folderId ? ` · ${folders.find((f) => f.id === c.folderId)?.name || ''}` : ''}
                {c.sourceName ? ` · ${c.sourceName}` : ''} · importé {relDate(c.createdAt)}
              </span>
            </span>
            <span className="similar-score" title="Proximité avec le cours le plus proche du groupe">{Math.round((best.get(c.id) || 0) * 100)} %</span>
          </label>
        ))}
      </div>

      {mode === null && (
        <div className="row wrap" style={{ marginTop: 12, gap: 8 }}>
          <button className="btn sm primary" disabled={selected.length < 2} onClick={() => { setTargetId(selected[0].id); setMode('merge'); }}>
            <Icon name="layers" size={14} /> Fusionner ({selected.length})
          </button>
          <button className="btn sm" disabled={!selected.length} onClick={() => setMode('folder')}>
            <Icon name="folder" size={14} /> Ranger dans un dossier
          </button>
        </div>
      )}

      {mode === 'merge' && (
        <div className="similar-panel">
          <div className="field">
            <label>Cours de base (sa page et ses réglages sont gardés)</label>
            <select className="select" value={target?.id} onChange={(e) => setTargetId(e.target.value)}>
              {selected.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </div>
          <p className="small muted" style={{ margin: '10px 0' }}>
            Les {selected.length} cours deviennent un seul cours. Les textes sont mis bout à bout. Les flashcards (avec ta progression), les QCM et les schémas sont regroupés, et les doublons ne sont gardés qu'une fois. La fiche est ensuite réécrite par l'IA.
            {' '}Tu pourras l'annuler pendant 30 jours depuis <b>Réglages › Corbeille</b>.
          </p>
          <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn sm ghost" onClick={() => setMode(null)} disabled={busy}>Annuler</button>
            <button className="btn sm danger" onClick={doMerge} disabled={busy || selected.length < 2}>
              {busy ? <span className="spinner" /> : <Icon name="layers" size={14} />} Fusionner
            </button>
          </div>
        </div>
      )}

      {mode === 'folder' && (
        <div className="similar-panel">
          <div className="field">
            <label>Dossier</label>
            <select className="select" value={folderChoice} onChange={(e) => setFolderChoice(e.target.value)}>
              <option value="new">Nouveau dossier…</option>
              {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          {folderChoice === 'new' && (
            <div className="field" style={{ marginTop: 10 }}>
              <label>Nom du nouveau dossier</label>
              <input className="input" value={folderName} maxLength={60} onChange={(e) => setFolderName(e.target.value)} />
            </div>
          )}
          <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            <button className="btn sm ghost" onClick={() => setMode(null)} disabled={busy}>Annuler</button>
            <button className="btn sm primary" onClick={doFolder} disabled={busy || (folderChoice === 'new' && !folderName.trim())}>
              {busy ? <span className="spinner" /> : <Icon name="folder" size={14} />} Ranger {selected.length} cours
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
