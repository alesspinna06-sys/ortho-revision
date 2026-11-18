// Pont vers Claude (claude.ai, avec ton propre compte) : améliorer un schéma, vérifier un cours.
// Le logiciel copie une demande toute prête et ouvre Claude ; tu colles, tu copies la réponse,
// puis le logiciel la lit dans le presse-papiers. Aucun accès direct de Claude au logiciel.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon.jsx';
import { svgSrc } from './Markdown.jsx';
import { api } from '../lib/bridge.js';
import { schemaPrompt, parseSvgReply, verifyPrompt, parseVerifyReply, applyCorrections, findExtract, isOurPrompt } from '../lib/claudeBridge.js';

async function readClipboard() {
  try { return (await api.clipboard.read()) || ''; } catch { return ''; }
}

/**
 * Dès que tu reviens dans le logiciel (fenêtre au premier plan), le presse-papiers est lu tout seul :
 * si la réponse de Claude y est, elle est chargée sans avoir à cliquer sur « Coller ».
 */
function useAutoPaste(active, tryParse) {
  useEffect(() => {
    if (!active) return undefined;
    let last = '';
    const check = async () => {
      const text = await readClipboard();
      if (!text || text === last || isOurPrompt(text)) return;
      last = text;
      tryParse(text, true);
    };
    const onFocus = () => setTimeout(check, 150);
    window.addEventListener('focus', onFocus);
    const t = setInterval(() => { if (document.hasFocus()) check(); }, 1500);
    return () => { window.removeEventListener('focus', onFocus); clearInterval(t); };
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
}

function Steps({ copied, onCopy, onOpen, pasteLabel, onPaste, busy }) {
  return (
    <ol className="cb-steps">
      <li>
        <div><b>Copier la demande</b><span className="faint small">Elle contient le cours et les consignes.</span></div>
        <button className="btn sm" onClick={onCopy}><Icon name={copied ? 'check' : 'clipboard'} size={14} /> {copied ? 'Copiée' : 'Copier'}</button>
      </li>
      <li>
        <div><b>Ouvrir Claude et coller</b><span className="faint small">⌘V / Ctrl V dans la conversation, puis Entrée. La 1re fois, connecte-toi à ton compte.</span></div>
        <button className="btn sm" onClick={onOpen}><Icon name="link" size={14} /> Ouvrir Claude</button>
      </li>
      <li>
        <div><b>Copier sa réponse, puis revenir ici</b><span className="faint small">Bouton « Copier » sous le bloc de code de Claude : le logiciel la récupère tout seul en revenant ici.</span></div>
        <button className="btn sm accent" disabled={busy} onClick={onPaste}><Icon name="download" size={14} /> {pasteLabel}</button>
      </li>
    </ol>
  );
}

/** Améliorer un schéma avec Claude. `onSave(svg)` remplace le schéma. */
export function ClaudeSchemaDialog({ course, d, onSave, onClose }) {
  const [copied, setCopied] = useState(false);
  const [svg, setSvg] = useState('');
  const [err, setErr] = useState('');
  const copy = async () => { await api.clipboard.write(schemaPrompt(course, d)); setCopied(true); };
  const open = async () => { if (!copied) await copy(); api.claude.open(); };
  const tryParse = (text, auto) => {
    try { setSvg(parseSvgReply(text)); setErr(''); } catch (e) { if (!auto) setErr(isOurPrompt(text) ? 'Le presse-papiers contient encore la demande : copie d’abord la réponse de Claude.' : e.message); }
  };
  const paste = async () => tryParse(await readClipboard(), false);
  useAutoPaste(copied && !svg, tryParse);
  return createPortal(
    <div className="overlay" onClick={onClose}>
      <div className="modal cb-modal" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <div className="row between">
          <span className="chip accent"><Icon name="sparkles" size={12} /> Améliorer avec Claude</span>
          <button className="btn icon sm ghost" onClick={onClose} aria-label="Fermer"><Icon name="x" /></button>
        </div>
        <h3 style={{ margin: '12px 0 4px' }}>{d.title || 'Schéma'}</h3>
        <Steps copied={copied} onCopy={copy} onOpen={open} pasteLabel="Coller le schéma de Claude" onPaste={paste} />
        {err && <div className="cb-err small"><Icon name="alert" size={14} /> {err}</div>}
        {svg && (
          <div className="cb-compare">
            <figure><figcaption className="faint small">Avant</figcaption>{d.svg ? <img src={svgSrc(d.svg)} alt="Schéma actuel" /> : d.image ? <img src={d.image} alt="Schéma actuel" /> : null}</figure>
            <figure><figcaption className="small"><b>Après (Claude)</b></figcaption><img src={svgSrc(svg)} alt="Nouveau schéma" /></figure>
          </div>
        )}
        <div className="row between" style={{ marginTop: 16 }}>
          <span className="faint small">L'ancien schéma est gardé : « Annuler la modification » le remet.</span>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn ghost" onClick={onClose}>Fermer</button>
            <button className="btn accent" disabled={!svg} onClick={() => onSave(svg)}><Icon name="check" size={14} /> Remplacer le schéma</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

const plain = (t = '') => t.replace(/==|\*\*|\^\^|@@|\{\+\s?|\s?\+\}/g, '');
const TYPE = { erreur: ['Erreur', 'c-red'], ajout: ['Ajout douteux', 'c-violet'], manque: ['Manque', 'c-blue'], faute: ['Faute', 'c-amber'] };

/** Vérifier un cours avec Claude. `onApply(md, n)` enregistre le cours corrigé. */
export function ClaudeVerifyDialog({ course, onApply, onClose, autoStart = false }) {
  const [copied, setCopied] = useState(false);
  const [res, setRes] = useState(null);
  const [checked, setChecked] = useState({});
  const [err, setErr] = useState('');
  const copy = async () => { await api.clipboard.write(verifyPrompt(course)); setCopied(true); };
  const open = async () => { if (!copied) await copy(); api.claude.open(); };
  const tryParse = (text, auto) => {
    try {
      const r = parseVerifyReply(text);
      r.corrections = r.corrections.map((c) => ({ ...c, found: !!findExtract(course.summary || '', c.extrait) }));
      setRes(r); setErr('');
      setChecked(Object.fromEntries(r.corrections.map((c) => [c.id, c.found && (c.gravite === 'haute' || c.gravite === 'moyenne')])));
    } catch (e) { if (!auto) setErr(isOurPrompt(text) ? 'Le presse-papiers contient encore la demande : copie d’abord la réponse de Claude.' : e.message); }
  };
  const paste = async () => tryParse(await readClipboard(), false);
  useAutoPaste(copied && !res, tryParse);
  // Ouverture directe (« Relire avec Claude ») : la demande est copiée et Claude s'ouvre tout de suite
  useEffect(() => { if (autoStart) open(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const chosen = res ? res.corrections.filter((c) => checked[c.id]) : [];
  const apply = () => {
    const { md, applied, missed } = applyCorrections(course.summary || '', chosen);
    onApply(md, applied, missed.length);
  };
  return createPortal(
    <div className="overlay" onClick={onClose}>
      <div className="modal cb-modal wide" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <div className="row between">
          <span className="chip accent"><Icon name="check" size={12} /> Vérifier le cours avec Claude</span>
          <button className="btn icon sm ghost" onClick={onClose} aria-label="Fermer"><Icon name="x" /></button>
        </div>
        <p className="small faint" style={{ margin: '10px 0 0' }}>Claude compare le cours mis en forme au texte d'origine : erreurs, ajouts de l'IA douteux, oublis, fautes. Tu choisis ensuite les corrections à appliquer.</p>
        <Steps copied={copied} onCopy={copy} onOpen={open} pasteLabel="Coller la vérification" onPaste={paste} />
        {err && <div className="cb-err small"><Icon name="alert" size={14} /> {err}</div>}
        {res && (
          <div className="cb-result">
            <div className="row" style={{ gap: 10, alignItems: 'baseline' }}>
              {res.note != null && <span className="cb-note">{res.note}<small>/10</small></span>}
              <span className="small">{res.resume}</span>
            </div>
            {res.corrections.length === 0 ? <p className="small">Aucune correction proposée 🎉</p> : (
              <>
                <div className="row between small" style={{ margin: '10px 0 6px' }}>
                  <span>{chosen.length} correction{chosen.length > 1 ? 's' : ''} choisie{chosen.length > 1 ? 's' : ''} sur {res.corrections.length}</span>
                  <span className="row" style={{ gap: 6 }}>
                    <button className="btn sm ghost" onClick={() => setChecked(Object.fromEntries(res.corrections.map((c) => [c.id, c.found])))}>Tout cocher</button>
                    <button className="btn sm ghost" onClick={() => setChecked({})}>Tout décocher</button>
                  </span>
                </div>
                <ul className="cb-list">
                  {res.corrections.map((c) => (
                    <li key={c.id} className={c.found ? '' : 'missing'}>
                      <label>
                        <input type="checkbox" disabled={!c.found} checked={!!checked[c.id]} onChange={(e) => setChecked((o) => ({ ...o, [c.id]: e.target.checked }))} />
                        <span className="cb-body">
                          <span className="row" style={{ gap: 6 }}>
                            <span className={`cb-tag ${TYPE[c.type]?.[1] || ''}`}>{TYPE[c.type]?.[0] || c.type}</span>
                            {c.gravite === 'haute' && <span className="cb-tag c-red">important</span>}
                            {!c.found && <span className="faint small">passage introuvable dans le cours</span>}
                          </span>
                          <span className={c.type === 'manque' ? 'cb-at faint small' : 'cb-old'}>{c.type === 'manque' ? `Après : « ${plain(c.extrait)} »` : plain(c.extrait)}</span>
                          {c.type === 'manque' ? <span className="cb-new">+ {plain(c.correction)}</span> : c.correction ? <span className="cb-new">→ {plain(c.correction)}</span> : <span className="cb-new faint">(supprimé)</span>}
                          {c.explication && <span className="faint small">{c.explication}</span>}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
        <div className="row between" style={{ marginTop: 16 }}>
          <span className="faint small">Le cours actuel est gardé : « Annuler la vérification » le remet.</span>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn ghost" onClick={onClose}>Fermer</button>
            <button className="btn accent" disabled={!chosen.length} onClick={apply}><Icon name="check" size={14} /> Appliquer {chosen.length || ''}</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
