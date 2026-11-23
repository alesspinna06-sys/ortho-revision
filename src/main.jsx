import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { SettingsProvider } from './lib/settings.jsx';
import { ToastProvider } from './components/Toast.jsx';
import { startPhoneLibrary } from './lib/phoneLibrary.js';
import { UpdateBanner } from './components/Updates.jsx';
// Écritures manuscrites de l'apparence « Cahier » (intégrées : fonctionnent sans internet)
import '@fontsource/kalam/400.css';
import '@fontsource/kalam/700.css';
import '@fontsource/caveat/600.css';
import '@fontsource/caveat/700.css';
import '@fontsource/patrick-hand/400.css';
import '@fontsource/shantell-sans/400.css';
import '@fontsource/shantell-sans/700.css';
import '@fontsource/comic-neue/400.css';
import '@fontsource/comic-neue/700.css';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import './styles/global.css';
import './styles/course-styles.css';
import './styles/motion.css';
import './styles/themes.css';

// Empêche la fenêtre d'ouvrir un fichier lâché en dehors de la zone de dépôt
for (const ev of ['dragover', 'drop']) window.addEventListener(ev, (e) => e.preventDefault());

startPhoneLibrary(); // répond au téléphone (Réglages › Téléphone)

createRoot(document.getElementById('root')).render(
  <SettingsProvider>
    <ToastProvider>
      <App />
      <UpdateBanner />
    </ToastProvider>
  </SettingsProvider>
);
