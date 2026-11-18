import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import { api } from '../lib/bridge.js';

function useUpdate() {
  const [st, setSt] = useState(null);
  useEffect(() => {
    if (!api.update) return undefined;
    api.update.status().then(setSt);
    return api.update.onStatus(setSt);
  }, []);
  return st;
}

const MSG = {
  checking: 'Recherche de mise à jour…',
  uptodate: 'Le logiciel est à jour.',
  dev: 'Version de développement : pas de mise à jour automatique.',
  notconfigured: "Les mises à jour automatiques ne sont pas encore activées : elles arriveront avec la première version publiée sur GitHub.",
};

/** Bannière en bas à gauche : nouvelle version disponible / en téléchargement / prête. */
export function UpdateBanner() {
  const st = useUpdate();
  const [hidden, setHidden] = useState('');
  if (!st || !['available', 'downloading', 'ready', 'installing'].includes(st.state) || hidden === `${st.state}-${st.version}`) return null;
  return (
    <div className="update-banner" role="status">
      <Icon name="download" size={16} />
      <div className="grow">
        <b>Version {st.version}</b>
        <div className="small">
          {st.state === 'available' && (st.canInstall ? 'Une nouvelle version est disponible.' : 'Une nouvelle version est disponible sur GitHub.')}
          {st.state === 'downloading' && `Téléchargement… ${st.percent || 0} %`}
          {st.state === 'ready' && 'Prête : elle s’installe au prochain redémarrage.'}
          {st.state === 'installing' && 'Installation, le logiciel va redémarrer…'}
        </div>
      </div>
      {st.state === 'available' && <button className="btn sm primary" onClick={() => api.update.install()}>{st.canInstall ? 'Mettre à jour' : 'Voir'}</button>}
      {st.state === 'ready' && <button className="btn sm primary" onClick={() => api.update.install()}>Redémarrer</button>}
      {['available', 'ready'].includes(st.state) && <button className="btn icon sm ghost" aria-label="Plus tard" title="Plus tard" onClick={() => setHidden(`${st.state}-${st.version}`)}><Icon name="x" size={14} /></button>}
    </div>
  );
}

/** Réglages › Mises à jour. */
export function UpdateSettings() {
  const st = useUpdate();
  const [busy, setBusy] = useState(false);
  if (!api.update) return null;
  const check = async () => { setBusy(true); await api.update.check(); setBusy(false); };
  const s = st?.state;
  return (
    <>
      <div className="section-title">Mises à jour</div>
      <div className="card">
        <div className="setting-row" style={{ paddingTop: 0 }}>
          <div className="option-icon"><Icon name="download" /></div>
          <div className="grow">
            <div className="t">Version {st?.current || '…'}</div>
            <div className="d">
              {s === 'error' ? <span style={{ color: 'var(--danger, #e5484d)' }}>{st.error}</span>
                : s === 'available' ? `La version ${st.version} est disponible.`
                  : s === 'downloading' ? `Téléchargement de la version ${st.version}… ${st.percent || 0} %`
                    : s === 'ready' ? `La version ${st.version} est prête : redémarre pour l'installer.`
                      : MSG[s] || 'Le logiciel cherche tout seul les nouvelles versions au démarrage, puis toutes les 6 heures.'}
            </div>
          </div>
          {s === 'available' && <button className="btn primary" onClick={() => api.update.install()}>{st.canInstall ? 'Mettre à jour' : 'Voir'}</button>}
          {s === 'ready' && <button className="btn primary" onClick={() => api.update.install()}>Redémarrer</button>}
          {!['available', 'ready', 'downloading', 'installing'].includes(s) && <button className="btn" onClick={check} disabled={busy || s === 'checking'}>{busy || s === 'checking' ? <span className="spinner" /> : <Icon name="refresh" size={14} />} Vérifier maintenant</button>}
        </div>
        {st?.repo && <div className="small muted">Les versions viennent de github.com/{st.repo.owner}/{st.repo.repo}.</div>}
      </div>
    </>
  );
}
