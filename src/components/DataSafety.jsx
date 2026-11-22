import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import { Switch, relDate } from './common.jsx';
import { useToast } from './Toast.jsx';
import { api } from '../lib/bridge.js';
import { useDb, getTrash, restoreTrash, deleteTrash, emptyTrash, TRASH_DAYS } from '../lib/db.js';
import { autoBackupEnabled, setAutoBackup, lastBackup, backupNow } from '../lib/backup.js';

/** Réglages : sauvegarde automatique et corbeille. */
export default function DataSafety() {
  const toast = useToast();
  const [on, setOn] = useState(autoBackupEnabled);
  const [info, setInfo] = useState(null);
  const [last, setLast] = useState(lastBackup);
  const [busy, setBusy] = useState(false);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const trash = useDb(() => getTrash(), []) || [];

  useEffect(() => { api.backup.info().then(setInfo); }, []);

  const toggle = (v) => { setOn(v); setAutoBackup(v); };
  const choose = async () => { const r = await api.backup.choose(); if (r.ok) setInfo((i) => ({ ...i, dir: r.dir, isDefault: false })); };
  const now = async () => {
    setBusy(true);
    const r = await backupNow();
    setBusy(false);
    if (r.ok) { setLast(Date.now()); toast({ type: 'success', text: 'Sauvegarde enregistrée' }); }
    else toast({ type: 'error', text: r.error });
  };
  const restore = async (e) => {
    await restoreTrash(e.id);
    toast({ type: 'success', text: e.kind === 'merge' ? 'Fusion annulée : les cours d’origine sont de retour.' : `« ${e.title} » est de retour dans tes cours.` });
  };

  return (
    <>
      <div className="section-title">Sauvegardes et corbeille</div>
      <div className="card stack" style={{ gap: 18 }}>
        {info?.web ? (
          <p className="small muted" style={{ margin: 0 }}>La sauvegarde automatique fonctionne dans l'application installée. Ici, utilise <b>Exporter</b> ci-dessus.</p>
        ) : (
          <>
            <div className="row between">
              <div>
                <b>Sauvegarde automatique</b>
                <div className="small muted">Une copie complète chaque jour (les 10 plus récentes sont gardées). Choisis un dossier iCloud Drive, OneDrive ou Google Drive pour l’avoir aussi en ligne.</div>
              </div>
              <Switch on={on} onChange={toggle} label="Sauvegarde automatique" />
            </div>
            <div className="backup-dir">
              <Icon name="folder" size={16} />
              <span className="grow selectable small">{info?.dir || '…'}</span>
              <button className="btn sm ghost" onClick={choose}>Changer</button>
              <button className="btn sm ghost" onClick={() => api.backup.open()}>Ouvrir</button>
            </div>
            <div className="row between">
              <span className="small faint">{last ? `Dernière sauvegarde : ${relDate(last)} à ${new Date(last).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : 'Aucune sauvegarde pour le moment'}</span>
              <button className="btn sm" disabled={busy} onClick={now}>{busy ? <span className="spinner" /> : <Icon name="download" size={14} />} Sauvegarder maintenant</button>
            </div>
            <p className="faint small" style={{ margin: 0 }}>Pour revenir à une sauvegarde : <b>Restaurer</b> ci-dessus, puis choisis un fichier de ce dossier.</p>
          </>
        )}

        <div className="divider" />

        <div>
          <div className="row between">
            <div>
              <b>Corbeille</b>
              <div className="small muted">Les cours supprimés et les fusions restent récupérables {TRASH_DAYS} jours.</div>
            </div>
            {trash.length > 0 && (confirmEmpty
              ? <div className="row" style={{ gap: 6 }}><button className="btn sm danger" onClick={async () => { await emptyTrash(); setConfirmEmpty(false); }}>Vider définitivement</button><button className="btn sm ghost" onClick={() => setConfirmEmpty(false)}>Annuler</button></div>
              : <button className="btn sm ghost" onClick={() => setConfirmEmpty(true)}>Vider la corbeille</button>)}
          </div>
          {trash.length === 0 ? <p className="faint small" style={{ marginBottom: 0 }}>La corbeille est vide.</p> : (
            <div className="stack" style={{ gap: 6, marginTop: 12 }}>
              {trash.map((e) => {
                const left = Math.max(0, TRASH_DAYS - Math.floor((Date.now() - e.deletedAt) / 86400000));
                return (
                  <div key={e.id} className="trash-row">
                    <Icon name={e.kind === 'merge' ? 'layers' : 'trash'} size={15} />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="clamp-1" style={{ fontWeight: 600, fontSize: 14 }}>{e.kind === 'merge' ? e.title : e.title || 'Cours sans titre'}</div>
                      <div className="faint small">{e.kind === 'merge' ? 'Fusion' : 'Supprimé'} {relDate(e.deletedAt)} · encore {left} j
                        {e.kind === 'merge' ? ' · annuler la fusion efface la progression faite depuis' : ''}</div>
                    </div>
                    <button className="btn sm" onClick={() => restore(e)}><Icon name="rotate" size={14} /> {e.kind === 'merge' ? 'Annuler la fusion' : 'Restaurer'}</button>
                    <button className="btn icon sm ghost" title="Supprimer définitivement" aria-label="Supprimer définitivement" onClick={() => deleteTrash(e.id)}><Icon name="x" size={14} /></button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
