import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import Icon from './components/Icon.jsx';
import { useToast } from './components/Toast.jsx';
import { api } from './lib/bridge.js';
import { useDb, getCards, purgeTrash } from './lib/db.js';
import { maybeAutoBackup } from './lib/backup.js';
import { bumpReadScale } from './lib/readScale.js';
import { useNavCollapsed, toggleNav } from './lib/layout.js';
import SearchModal from './components/SearchModal.jsx';
import StatsView from './views/StatsView.jsx';
import { setJobNotifier, useJobs, cancelAll } from './lib/jobs.js';
import { dueCards } from './lib/pick.js';
import Dashboard from './views/Dashboard.jsx';
import Library from './views/Library.jsx';
import SynthesesView from './views/SynthesesView.jsx';
import PodcastsView from './views/PodcastsView.jsx';
import ImportView from './views/ImportView.jsx';
import CourseView from './views/CourseView.jsx';
import FolderView from './views/FolderView.jsx';
import ReviewView from './views/ReviewView.jsx';
import QuizView from './views/QuizView.jsx';
import SettingsView from './views/SettingsView.jsx';
import PatientView from './views/PatientView.jsx';
import TestsView from './views/TestsView.jsx';
import PhoneticsView from './views/PhoneticsView.jsx';
import { startUsage, setUsageContext } from './lib/usage.js';

const NAV = [
  { id: 'home', label: 'Accueil', icon: 'home' },
  { id: 'library', label: 'Mes cours', icon: 'book' },
  { id: 'syntheses', label: 'Synthèses', icon: 'file' },
  { id: 'podcasts', label: 'Podcasts', icon: 'mic' },
  { id: 'import', label: 'Importer', icon: 'upload' },
  { id: 'review', label: 'Flashcards', icon: 'layers' },
  { id: 'quiz', label: 'QCM & cas', icon: 'quiz' },
  { id: 'stats', label: 'Statistiques', icon: 'chart' },
  { sep: 'Outils' },
  { id: 'patient', label: 'Patient simulé', icon: 'stetho' },
  { id: 'tests', label: 'Tests de bilan', icon: 'clipboard' },
  { id: 'phonetique', label: 'Phonétique', icon: 'mic' },
];

document.documentElement.classList.add(`platform-${api.platform}`);

export default function App() {
  const [route, setRoute] = useState({ view: 'home' });
  const [photos, setPhotos] = useState([]); // photos en attente d'OCR (téléphone ou import)
  const [hasKey, setHasKey] = useState(true);
  const toast = useToast();
  const jobs = useJobs();
  const [searchOpen, setSearchOpen] = useState(false);
  const collapsed = useNavCollapsed();
  const cards = useDb(() => getCards(), []);
  const dueCount = cards ? dueCards(cards).length : 0;

  // Changement de page animé (View Transitions de Chromium) : l'ancienne page s'efface en glissant,
  // la nouvelle arrive avec un léger rebond. Sans animation si le système demande moins de mouvement.
  const go = useCallback((view, params = {}) => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const light = !document.documentElement.classList.contains('motion-full');
    if (document.startViewTransition && !reduce && !light) {
      document.startViewTransition(() => flushSync(() => setRoute({ view, ...params })));
    } else {
      setRoute({ view, ...params });
    }
    document.querySelector('.main')?.scrollTo({ top: 0 });
  }, []);

  useEffect(() => { setJobNotifier(toast); }, [toast]);

  // Temps passé dans l'application (voir lib/usage.js)
  useEffect(() => startUsage(), []);
  useEffect(() => { if (route.view !== 'course') setUsageContext({ view: route.view, courseId: null, tab: null }); }, [route.view]);

  // Corbeille (plus de 30 jours) et sauvegarde automatique : au démarrage puis toutes les heures
  useEffect(() => {
    purgeTrash();
    const t = setTimeout(maybeAutoBackup, 8000);
    const id = setInterval(maybeAutoBackup, 3600 * 1000);
    return () => { clearTimeout(t); clearInterval(id); };
  }, []);

  // Recherche globale : ⌘K (Mac) / Ctrl+K (Windows)
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen((o) => !o); }
      // Ranger / déplier le menu : ⌘/Ctrl B
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); toggleNav(); }
      // Taille du texte : ⌘/Ctrl + (ou =), ⌘/Ctrl −, ⌘/Ctrl 0
      if ((e.metaKey || e.ctrlKey) && ['+', '=', '-', '0'].includes(e.key)) {
        e.preventDefault();
        bumpReadScale(e.key === '-' ? -1 : e.key === '0' ? 0 : 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const refreshKey = useCallback(() => api.key.status().then((s) => setHasKey(s.hasKey)), []);
  useEffect(() => { refreshKey(); }, [refreshKey]);

  // Réception des photos envoyées par le téléphone
  useEffect(() => api.phone.onFile((f) => {
    const blob = new Blob([f.data], { type: f.type });
    const file = new File([blob], f.name, { type: f.type });
    setPhotos((p) => [...p, { id: Math.random().toString(36).slice(2), file, url: URL.createObjectURL(blob), fromPhone: true }]);
  }), []);

  const props = { go, route, photos, setPhotos, jobs, hasKey, refreshKey };
  let view;
  switch (route.view) {
    case 'library': view = <Library {...props} />; break;
    case 'syntheses': view = <SynthesesView {...props} />; break;
    case 'podcasts': view = <PodcastsView {...props} />; break;
    case 'import': view = <ImportView {...props} />; break;
    case 'course': view = <CourseView key={route.id} {...props} />; break;
    case 'folder': view = <FolderView key={route.id} {...props} />; break;
    case 'review': view = <ReviewView {...props} />; break;
    case 'quiz': view = <QuizView {...props} />; break;
    case 'settings': view = <SettingsView {...props} />; break;
    case 'stats': view = <StatsView {...props} />; break;
    case 'patient': view = <PatientView key={route.simId || 'home'} {...props} />; break;
    case 'tests': view = <TestsView {...props} />; break;
    case 'phonetique': view = <PhoneticsView {...props} />; break;
    default: view = <Dashboard {...props} dueCount={dueCount} />;
  }

  const activeNav = route.view === 'course' || route.view === 'folder' ? 'library' : route.view;
  const busy = jobs.size > 0;
  // Pastille du menu qui glisse jusqu'à l'entrée active
  const sideRef = useRef(null);
  const [glider, setGlider] = useState({ opacity: 0 });
  useLayoutEffect(() => {
    const measure = () => {
      const el = sideRef.current?.querySelector('.nav-item.active');
      if (!el) { setGlider((g) => ({ ...g, opacity: 0 })); return; }
      setGlider({ opacity: 1, transform: `translate(${el.offsetLeft}px, ${el.offsetTop}px)`, width: el.offsetWidth, height: el.offsetHeight });
    };
    measure();
    const t = setTimeout(measure, 300); // après l'animation du menu rangé / déplié
    window.addEventListener('resize', measure);
    return () => { clearTimeout(t); window.removeEventListener('resize', measure); };
  }, [activeNav, collapsed, busy, photos.length, dueCount > 0]);

  return (
    <>
      <div className="backdrop" />
      <div className="titlebar-drag" />
      <div className={`app ${collapsed ? 'nav-collapsed' : ''}`}>
        <aside className="sidebar has-glider" ref={sideRef}>
          <span className="nav-glider" aria-hidden="true" style={glider} />
          <div className="brand">
            <div className="brand-logo"><Icon name="brain" size={19} stroke={2} /></div>
            <div className="brand-text">
              <div className="brand-name">Ortho Révision</div>
              <div className="brand-sub">Cours d'orthophonie</div>
            </div>
          </div>
          <button className="search-launch" onClick={() => setSearchOpen(true)} title="Rechercher dans tous les cours">
            <Icon name="search" size={15} /> <span className="grow">Rechercher</span> <kbd>{api.platform === 'darwin' ? '⌘' : 'Ctrl'} K</kbd>
          </button>
          {NAV.map((n) => n.sep ? <div key={n.sep} className="nav-sep">{n.sep}</div> : (
            <button key={n.id} className={`nav-item ${activeNav === n.id ? 'active' : ''}`} onClick={() => go(n.id)} title={collapsed ? n.label : undefined} aria-label={n.label}>
              <Icon name={n.icon} />
              <span className="nav-label">{n.label}</span>
              {n.id === 'review' && dueCount > 0 && <span className="nav-badge">{dueCount > 99 ? '99+' : dueCount}</span>}
              {n.id === 'import' && photos.length > 0 && <span className="nav-badge">{photos.length}</span>}
            </button>
          ))}
          <div className="sidebar-spacer" />
          {busy && (
            <div className="card pad-s" style={{ marginBottom: 8, borderRadius: 16 }}>
              <div className="row small" style={{ fontWeight: 600 }}><span className="spinner" style={{ color: 'var(--accent)' }} /> L'IA travaille…</div>
              <div className="faint small" style={{ marginTop: 4 }}>{[...jobs.values()].find((j) => !j.queued)?.label || [...jobs.values()][0]?.label}</div>
              {jobs.size > 1 && <div className="faint small">{jobs.size - 1} en attente</div>}
              <button className="btn sm ghost" style={{ marginTop: 8 }} onClick={() => cancelAll()}>{jobs.size > 1 ? 'Tout arrêter' : 'Arrêter'}</button>
            </div>
          )}
          {busy && collapsed && <div className="rail-busy" title={[...jobs.values()][0]?.label}><span className="spinner" style={{ color: 'var(--accent)' }} /></div>}
          <button className="nav-item collapse-btn" onClick={toggleNav} aria-expanded={!collapsed}
            title={`${collapsed ? 'Déplier le menu' : 'Ranger le menu'} (${api.platform === 'darwin' ? '⌘' : 'Ctrl'} B)`}>
            <Icon name="sidebar" /> <span className="nav-label">Ranger le menu</span>
          </button>
          <button className={`nav-item ${activeNav === 'settings' ? 'active' : ''}`} onClick={() => go('settings')} title={collapsed ? 'Réglages' : undefined} aria-label="Réglages">
            <Icon name="settings" /> <span className="nav-label">Réglages</span>
          </button>
          <div className="sidebar-foot">
            <span className={`dot ${hasKey ? 'on' : ''}`} title={hasKey ? 'Gemini connecté' : 'Clé API manquante'} />
            <span className="nav-label">{hasKey ? 'Gemini connecté' : 'Clé API manquante'}</span>
          </div>
        </aside>
        <main className="main">
          <div className="page view-enter" key={route.view + (route.id || '') + (route.simId || '') + (route.tab || '')}>{view}</div>
        </main>
      </div>
      {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} go={go} pages={NAV.filter((n) => n.id)} />}
    </>
  );
}
