import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Politique de sécurité stricte, appliquée uniquement à la version compilée
// (en dev, Vite a besoin de scripts inline pour le rechargement à chaud).
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://upload.wikimedia.org",
  "worker-src 'self' blob:",
  "media-src 'self' blob: data:",
  "connect-src 'self' https://generativelanguage.googleapis.com",
  "font-src 'self' data:",
].join('; ');

const cspPlugin = {
  name: 'inject-csp',
  apply: 'build',
  transformIndexHtml(html) {
    return html.replace(
      '<meta charset="UTF-8" />',
      `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`
    );
  },
};

// base './' : indispensable pour que l'app se charge en file:// dans Electron
export default defineConfig({
  base: './',
  plugins: [react(), cspPlugin],
  server: { port: 5173, strictPort: true },
  build: {
    target: 'chrome120',
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
  },
});
