import { useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Switch, Segmented } from '../components/common.jsx';
import { useToast } from '../components/Toast.jsx';
import DataSafety from '../components/DataSafety.jsx';
import { useSettings } from '../lib/settings.jsx';
import { api } from '../lib/bridge.js';
import { testConnection } from '../lib/ai.js';
import { exportAll, importAll, clearAll } from '../lib/db.js';
import Markdown from '../components/Markdown.jsx';
import { DOMAIN } from '../lib/domain.js';
import { COURSE_STYLES, PAPERS, LEVELS, LEADINGS, WIDTHS, CAHIER_FONTS, CAHIER_INKS, sheetClass } from '../lib/courseStyle.js';
import { PALETTES, UI_FONTS } from '../lib/themes.js';
import ColorPicker from '../components/ColorPicker.jsx';
import VoiceSettings from '../components/VoiceSettings.jsx';
import PhoneAccess from '../components/PhoneAccess.jsx';
import { UpdateSettings } from '../components/Updates.jsx';

const PRESET_MODELS = [
  { id: 'gemini-flash-latest', label: 'Gemini Flash (dernière version) — recommandé' },
  { id: 'gemini-flash-lite-latest', label: 'Gemini Flash-Lite (dernière version) — plus rapide' },
];

export default function SettingsView({ hasKey, refreshKey }) {
  const { settings, update } = useSettings();
  const toast = useToast();
  const [key, setKey] = useState('');
  const [keyInfo, setKeyInfo] = useState({});
  const [testing, setTesting] = useState(false);
  const [models, setModels] = useState(PRESET_MODELS);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const importRef = useRef(null);

  useEffect(() => { api.key.status().then(setKeyInfo); }, [hasKey]);

  const saveKey = async () => {
    await api.key.set(key.trim());
    setKey('');
    await refreshKey();
    toast({ type: 'success', text: key.trim() ? 'Clé enregistrée (chiffrée sur cet ordinateur)' : 'Clé supprimée' });
  };

  const test = async () => {
    setTesting(true);
    try { await testConnection(); toast({ type: 'success', text: `Connexion à Gemini réussie (${settings.model})` }); }
    catch (e) { toast({ type: 'error', text: e.message }); }
    setTesting(false);
  };

  const detectModels = async () => {
    const r = await api.gemini.models();
    if (!r.ok) return toast({ type: 'error', text: r.error });
    const ids = new Set(PRESET_MODELS.map((m) => m.id));
    const flash = r.models.filter((m) => /flash/i.test(m.id) && !/tts|image|live|audio|embedding/i.test(m.id) && !ids.has(m.id));
    setModels([...PRESET_MODELS, ...flash]);
    toast({ type: 'success', text: `${flash.length} modèles Flash disponibles sur ton compte` });
  };

  const doExport = async () => {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ortho-revision-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const doImport = async (file) => {
    try { await importAll(JSON.parse(await file.text())); toast({ type: 'success', text: 'Sauvegarde restaurée' }); }
    catch (e) { toast({ type: 'error', text: e.message }); }
  };

  return (
    <>
      <div className="page-head"><div><h1 className="page-title">Réglages</h1></div></div>

      <div className="section-title" style={{ marginTop: 0 }}>Intelligence artificielle</div>
      <div className="card">
        <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
          <div className="option-icon"><Icon name="key" /></div>
          <div className="grow">
            <div className="row"><b>Clé API Google Gemini</b>{hasKey ? <span className="chip success"><Icon name="check" size={12} /> Configurée{keyInfo.fromEnv ? ' (variable GEMINI_API_KEY)' : ''}</span> : <span className="chip warning">Manquante</span>}</div>
            <div className="small muted" style={{ margin: '4px 0 12px' }}>
              Gratuite : crée-la sur Google AI Studio (compte Google), puis colle-la ici. Elle est chiffrée et reste sur cet ordinateur.
            </div>
            <div className="row">
              <input className="input grow" type="password" placeholder={hasKey ? '•••••••••••••••• (laisser vide pour supprimer)' : 'AIza…'} value={key} onChange={(e) => setKey(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveKey()} />
              <button className="btn primary" onClick={saveKey}>{key.trim() ? 'Enregistrer' : hasKey ? 'Supprimer' : 'Enregistrer'}</button>
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn sm" onClick={() => api.openExternal('https://aistudio.google.com/apikey')}><Icon name="link" size={14} /> Obtenir une clé gratuite</button>
              <button className="btn sm" disabled={!hasKey || testing} onClick={test}>{testing ? <span className="spinner" /> : <Icon name="zap" size={14} />} Tester la connexion</button>
            </div>
          </div>
        </div>

        <div className="setting-row" style={{ marginTop: 10 }}>
          <div className="grow"><div className="t">Modèle</div><div className="d">« Flash » : excellent rapport vitesse/qualité, inclus dans l'offre gratuite.</div></div>
          <div className="row">
            <select className="select" style={{ width: 340 }} value={settings.model} onChange={(e) => update({ model: e.target.value })}>
              {!models.some((m) => m.id === settings.model) && <option value={settings.model}>{settings.model}</option>}
              {models.map((m) => <option key={m.id} value={m.id}>{m.label || m.id}</option>)}
            </select>
            <button className="btn sm" disabled={!hasKey} onClick={detectModels} title="Lister les modèles de ton compte"><Icon name="refresh" size={14} /></button>
          </div>
        </div>
        <div className="setting-row">
          <div className="grow"><div className="t">Génération automatique</div><div className="d">Créer fiche, flashcards et QCM dès qu'un cours est importé.</div></div>
          <Switch on={settings.autoGenerate} onChange={(v) => update({ autoGenerate: v })} />
        </div>
        <div className="setting-row">
          <div className="grow"><div className="t">Questions transversales</div><div className="d">Relier chaque nouveau cours à ceux déjà étudiés (cas cliniques croisés).</div></div>
          <Switch on={settings.crossQuestions} onChange={(v) => update({ crossQuestions: v })} />
        </div>
        <div className="setting-row">
          <div className="grow"><div className="t">Compléter le cours</div><div className="d">Terminer les phrases laissées en suspens, rédiger les parties manquantes (« Conclusion : »…) et répondre aux questions du cours. Les ajouts sont vérifiés, puis signalés en violet.</div></div>
          <Switch on={settings.completeCourse !== false} onChange={(v) => update({ completeCourse: v })} />
        </div>
        <div className="setting-row">
          <div className="grow"><div className="t">Relire les schémas</div><div className="d">Après la génération, Gemini regarde chaque schéma comme une image et corrige ce qui dépasse, se chevauche ou manque (un peu plus long, sans coût supplémentaire).</div></div>
          <Switch on={settings.reviewSchemas !== false} onChange={(v) => update({ reviewSchemas: v })} />
        </div>
        <div className="setting-row">
          <div className="grow"><div className="t">Claude (claude.ai)</div><div className="d">Les boutons « Améliorer avec Claude » (sous un schéma) et « Vérifier avec Claude » (barre du cours) ouvrent Claude dans une fenêtre du logiciel, avec ton compte. La demande est copiée : tu la colles, tu copies la réponse de Claude, puis tu reviens cliquer sur « Coller ». La connexion est retenue.</div></div>
          <button className="btn sm" onClick={() => api.claude.open()}><Icon name="link" size={14} /> Ouvrir Claude</button>
        </div>
        <div className="setting-row">
          <div className="grow"><div className="t">Proposer la relecture par Claude</div><div className="d">Après chaque cours généré, un bandeau propose de le faire relire en entier par Claude (texte d'origine, ajouts de Gemini, fautes). La réponse copiée est récupérée toute seule quand tu reviens dans le logiciel.</div></div>
          <Switch on={settings.claudeReview !== false} onChange={(v) => update({ claudeReview: v })} />
        </div>
        <div className="setting-row">
          <div className="grow"><div className="t">Quantité par cours</div><div className="d">Flashcards et questions générées à l'import.</div></div>
          <div className="row">
            <select className="select" style={{ width: 150 }} value={settings.cardsPerCourse} onChange={(e) => update({ cardsPerCourse: +e.target.value })}>
              {[10, 15, 20, 30, 40].map((n) => <option key={n} value={n}>{n} cartes</option>)}
            </select>
            <select className="select" style={{ width: 160 }} value={settings.questionsPerCourse} onChange={(e) => update({ questionsPerCourse: +e.target.value })}>
              {[6, 10, 12, 16, 20].map((n) => <option key={n} value={n}>{n} questions</option>)}
            </select>
          </div>
        </div>
      </div>

      <VoiceSettings />

      <PhoneAccess />

      <UpdateSettings />

      <div className="section-title">Apparence</div>
      <div className="card">
        <div className="setting-row" style={{ paddingTop: 0 }}>
          <div className="grow"><div className="t">Prénom</div><div className="d">Affiché sur l'accueil.</div></div>
          <input className="input" style={{ width: 220 }} value={settings.name} onChange={(e) => update({ name: e.target.value })} />
        </div>
        <div className="setting-row">
          <div className="grow"><div className="t">Thème</div>{(settings.palette || 'default') !== 'default' && <div className="d">La palette choisie ci-dessous décide du mode clair ou sombre.</div>}</div>
          <Segmented value={settings.theme} onChange={(v) => update({ theme: v, palette: 'default' })} options={[
            { value: 'system', label: 'Auto', icon: 'monitor' },
            { value: 'light', label: 'Clair', icon: 'sun' },
            { value: 'dark', label: 'Sombre', icon: 'moon' },
          ]} />
        </div>
        <div className="setting-row" style={{ display: 'block' }}>
          <div className="t" style={{ marginBottom: 10 }}>Palette de couleurs</div>
          <div className="palettes" role="radiogroup" aria-label="Palette de couleurs">
            {PALETTES.map((p) => (
              <button key={p.id} type="button" role="radio" aria-checked={(settings.palette || 'default') === p.id}
                className={`palette-pick ${(settings.palette || 'default') === p.id ? 'on' : ''}`} onClick={() => update({ palette: p.id })}>
                <span className="palette-swatch" style={{ background: p.mode ? p.bg : `linear-gradient(135deg, ${p.bg} 50%, ${p.bg2} 50%)` }}>
                  <b /><b /><i style={{ background: p.accent }} />
                </span>
                <span>{p.label} <span className="palette-mode">{p.mode === 'dark' ? '· sombre' : p.mode === 'light' ? '· clair' : '· clair ou sombre'}</span></span>
              </button>
            ))}
          </div>
        </div>
        <div className="setting-row" style={{ display: 'block' }}>
          <div className="t" style={{ marginBottom: 8 }}>Police de l'interface</div>
          <div className="font-picks" role="radiogroup" aria-label="Police de l'interface">
            {UI_FONTS.map((f) => (
              <button key={f.id} type="button" role="radio" aria-checked={(settings.uiFont || 'system') === f.id}
                className={`font-pick ${(settings.uiFont || 'system') === f.id ? 'on' : ''}`} onClick={() => update({ uiFont: f.id })}>
                <b style={{ fontFamily: f.family }}>Révision</b><span>{f.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="setting-row">
          <div className="grow"><div className="t">Animations</div><div className="d">« Auto » : complètes, et allégées en mode performance ou si l'accélération graphique est coupée.</div></div>
          <Segmented value={settings.motion || 'auto'} onChange={(v) => update({ motion: v })} options={[
            { value: 'auto', label: 'Auto' }, { value: 'full', label: 'Complètes' }, { value: 'light', label: 'Légères' }, { value: 'off', label: 'Aucune' },
          ]} />
        </div>
        <GpuRow />
        <div className="setting-row" style={{ paddingBottom: 0 }}>
          <div className="grow"><div className="t">Mode performance</div><div className="d">Désactive les effets de flou pour plus de fluidité sur les ordinateurs anciens.</div></div>
          <Switch on={settings.liteMode} onChange={(v) => update({ liteMode: v })} />
        </div>
      </div>

      <div className="section-title">Apparence des cours</div>
      <div className="card">
        <div className="style-picks" role="radiogroup" aria-label="Apparence des cours">
          {COURSE_STYLES.map((st) => (
            <button key={st.id} type="button" role="radio" aria-checked={(settings.courseStyle || 'sobre') === st.id}
              className={`style-pick ${(settings.courseStyle || 'sobre') === st.id ? 'on' : ''}`} onClick={() => update({ courseStyle: st.id })}>
              <div className={`style-preview ${sheetClass(settings, st.id)}`} aria-hidden="true">
                <Markdown text={DOMAIN.styleSample} terms={[]} />
              </div>
              <div className="style-pick-text">
                <b>{st.label}</b>
                <span className="faint small">{st.desc}</span>
              </div>
            </button>
          ))}
        </div>
        {(settings.courseStyle || 'sobre') === 'cahier' && (
          <>
            <div className="setting-row">
              <div className="grow"><div className="t">Papier</div><div className="d">Le quadrillage de la feuille (« Uni » : le plus lisible).</div></div>
              <Segmented value={settings.paper || 'carreaux'} onChange={(v) => update({ paper: v })} options={PAPERS.map((x) => ({ value: x.id, label: x.label }))} />
            </div>
            <div className="setting-row" style={{ display: 'block' }}>
              <div className="t" style={{ marginBottom: 8 }}>Écriture</div>
              <div className="font-picks" role="radiogroup" aria-label="Écriture du cahier">
                {CAHIER_FONTS.map((f) => (
                  <button key={f.id} type="button" role="radio" aria-checked={(settings.cahierFont || 'shantell') === f.id}
                    className={`font-pick ${(settings.cahierFont || 'shantell') === f.id ? 'on' : ''}`} onClick={() => update({ cahierFont: f.id })}>
                    <b style={{ fontFamily: f.family }}>Révision</b><span>{f.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="setting-row" style={{ display: 'block' }}>
              <div className="t" style={{ marginBottom: 8 }}>Couleurs des stylos</div>
              <div className="ink-picks" role="radiogroup" aria-label="Couleurs des stylos">
                {CAHIER_INKS.map((k) => (
                  <button key={k.id} type="button" role="radio" aria-checked={(settings.cahierInk || 'bleu') === k.id}
                    className={`ink-pick ${(settings.cahierInk || 'bleu') === k.id ? 'on' : ''}`} onClick={() => update({ cahierInk: k.id })}>
                    <span className="ink-dot" style={{ background: k.colors[0] }} /><span className="ink-dot" style={{ background: k.colors[1] }} /> {k.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
        <div className="setting-row">
          <div className="grow"><div className="t">Interligne</div><div className="d">L'espace entre les lignes du cours (sans effet sur le papier Seyès du cahier).</div></div>
          <Segmented value={settings.courseLeading || 'normal'} onChange={(v) => update({ courseLeading: v })} options={LEADINGS.map((x) => ({ value: x.id, label: x.label }))} />
        </div>
        <div className="setting-row">
          <div className="grow"><div className="t">Largeur du texte</div><div className="d">Étroite pour lire en colonne, large pour profiter de tout l'écran.</div></div>
          <Segmented value={settings.courseWidth || 'normal'} onChange={(v) => update({ courseWidth: v })} options={WIDTHS.map((x) => ({ value: x.id, label: x.label }))} />
        </div>
        {(settings.courseStyle || 'sobre') !== 'cahier' && (
          <div className="setting-row" style={{ display: 'block' }}>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
              <div><div className="t">Couleur d'accent des cours</div><div className="d">Titres, pastilles et cartes des apparences Sobre et Moderne (le Cahier a ses stylos).</div></div>
              {settings.courseAccent && <button className="btn sm ghost" onClick={() => update({ courseAccent: '' })}>Par défaut</button>}
            </div>
            <ColorPicker value={settings.courseAccent || '#4f46e5'} onChange={(c) => update({ courseAccent: c })} label="Couleur d'accent des cours" />
          </div>
        )}
        <div className="setting-row" style={{ paddingBottom: 0 }}>
          <div className="grow"><div className="t">Couleurs</div><div className="d">Intensité des encadrés et du surlignage (définitions en bleu, exemples en vert, pièges en rouge, à retenir en jaune, méthodes en violet).</div></div>
          <Segmented value={settings.colorLevel || 'normal'} onChange={(v) => update({ colorLevel: v })} options={LEVELS.map((x) => ({ value: x.id, label: x.label }))} />
        </div>
      </div>

      <div className="section-title">Données</div>
      <div className="card">
        <div className="setting-row" style={{ paddingTop: 0 }}>
          <div className="grow"><div className="t">Sauvegarde</div><div className="d">Exporte tous tes cours et ta progression dans un fichier (pour changer d'ordinateur, par exemple).</div></div>
          <div className="row">
            <button className="btn" onClick={doExport}><Icon name="download" size={15} /> Exporter</button>
            <button className="btn" onClick={() => importRef.current.click()}><Icon name="upload" size={15} /> Restaurer</button>
            <input ref={importRef} type="file" accept=".json" hidden onChange={(e) => { e.target.files[0] && doImport(e.target.files[0]); e.target.value = ''; }} />
          </div>
        </div>
        <div className="setting-row" style={{ paddingBottom: 0 }}>
          <div className="grow"><div className="t">Tout effacer</div><div className="d">Supprime définitivement tous les cours, cartes et questions.</div></div>
          {confirmWipe
            ? <div className="row"><button className="btn danger" onClick={async () => { await clearAll(); setConfirmWipe(false); toast('Données effacées'); }}>Confirmer</button><button className="btn ghost" onClick={() => setConfirmWipe(false)}>Annuler</button></div>
            : <button className="btn danger" onClick={() => setConfirmWipe(true)}><Icon name="trash" size={15} /> Effacer</button>}
        </div>
      </div>

      <DataSafety />
      <p className="faint small" style={{ textAlign: 'center', marginTop: 30 }}>Ortho Révision 1.0 · {api.isElectron ? `application ${api.platform === 'darwin' ? 'macOS' : api.platform === 'win32' ? 'Windows' : api.platform}` : 'version navigateur'}</p>
    </>
  );
}

/** Accélération graphique : coupée automatiquement si la fenêtre ne s'affichait pas ; réactivable ici (redémarre le logiciel). */
function GpuRow() {
  const [g, setG] = useState(null);
  useEffect(() => { api.gpu?.info().then(setG).catch(() => setG({ web: true })); }, []);
  if (!g || g.web) return null;
  return (
    <div className="setting-row">
      <div className="grow">
        <div className="t">Accélération graphique</div>
        <div className="d">{g.off
          ? (g.auto ? 'Coupée automatiquement car la fenêtre ne s’affichait pas sur cet ordinateur. Animations allégées.' : 'Coupée : animations allégées.')
          : 'Active : animations fluides. Si la fenêtre ne s’affiche plus, elle est coupée toute seule au lancement suivant.'}</div>
      </div>
      <Switch on={!g.off} onChange={(v) => api.gpu.set(v)} label="Accélération graphique (redémarre le logiciel)" />
    </div>
  );
}
