// Accès unifié aux fonctions "système".
// - Dans l'application Electron : window.api (clé chiffrée, appels via le processus principal).
// - Dans un navigateur (npm run web) : repli direct vers l'API Gemini, clé gardée en local.
const WEB_KEY = 'ortho-gemini-key';
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

const webApi = {
  platform: 'web',
  isElectron: false,
  key: {
    status: async () => ({ hasKey: !!localStorage.getItem(WEB_KEY), fromEnv: false }),
    set: async (k) => {
      if (k) localStorage.setItem(WEB_KEY, k.trim()); else localStorage.removeItem(WEB_KEY);
      return { hasKey: !!k };
    },
  },
  gemini: {
    async generate(req) {
      const key = localStorage.getItem(WEB_KEY);
      if (!key) return { ok: false, error: 'Aucune clé API Gemini. Ajoute-la dans Réglages.' };
      const body = {
        contents: [{ role: 'user', parts: req.parts }],
        generationConfig: {
          temperature: req.temperature ?? 0.4,
          ...(req.schema && !req.search ? { responseMimeType: 'application/json', responseSchema: req.schema } : {}),
        },
      };
      if (req.search) body.tools = [{ google_search: {} }];
      if (req.system) body.systemInstruction = { parts: [{ text: req.system }] };
      try {
        const r = await fetch(`${BASE}/models/${req.model || 'gemini-flash-latest'}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify(body),
        });
        const data = await r.json();
        if (!r.ok) return { ok: false, error: data?.error?.message || `Erreur ${r.status}` };
        const cand = data.candidates?.[0];
        const text = (cand?.content?.parts || []).map((p) => p.text || '').join('');
        const seen = new Set();
        const sources = (cand?.groundingMetadata?.groundingChunks || []).map((c) => c.web).filter((w) => w?.uri)
          .filter((w) => { const k = w.title || w.uri; if (seen.has(k)) return false; seen.add(k); return true; })
          .map((w) => ({ title: w.title || w.uri, uri: w.uri }));
        return text ? { ok: true, text, sources } : { ok: false, error: 'Réponse vide de Gemini.' };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },
    async upload({ data, mimeType, displayName }) {
      const key = localStorage.getItem(WEB_KEY);
      try {
        const start = await fetch('https://generativelanguage.googleapis.com/upload/v1beta/files', {
          method: 'POST',
          headers: {
            'x-goog-api-key': key || '', 'X-Goog-Upload-Protocol': 'resumable', 'X-Goog-Upload-Command': 'start',
            'X-Goog-Upload-Header-Content-Length': String(data.byteLength), 'X-Goog-Upload-Header-Content-Type': mimeType,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ file: { display_name: displayName || 'fichier' } }),
        });
        const url = start.headers.get('x-goog-upload-url');
        if (!start.ok || !url) return { ok: false, error: `Envoi impossible (${start.status})` };
        const up = await fetch(url, { method: 'POST', headers: { 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' }, body: data });
        let file = (await up.json()).file;
        for (let i = 0; i < 60 && file?.state === 'PROCESSING'; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          file = await (await fetch(`${BASE}/${file.name}`, { headers: { 'x-goog-api-key': key || '' } })).json();
        }
        return file?.uri ? { ok: true, uri: file.uri, mimeType: file.mimeType || mimeType } : { ok: false, error: 'Fichier refusé par Gemini.' };
      } catch (e) { return { ok: false, error: e.message }; }
    },
    async models() {
      const key = localStorage.getItem(WEB_KEY);
      try {
        const r = await fetch(`${BASE}/models?pageSize=200`, { headers: { 'x-goog-api-key': key || '' } });
        const data = await r.json();
        if (!r.ok) return { ok: false, error: data?.error?.message };
        return {
          ok: true,
          models: (data.models || [])
            .filter((m) => m.supportedGenerationMethods?.includes('generateContent') && /gemini/.test(m.name))
            .map((m) => ({ id: m.name.replace('models/', ''), label: m.displayName })),
        };
      } catch (e) { return { ok: false, error: e.message }; }
    },
  },
  phone: {
    start: async () => ({ ok: false, error: "L'envoi depuis le téléphone fonctionne uniquement dans l'application installée." }),
    stop: async () => ({ ok: true }),
    onFile: () => () => {},
    review: async () => ({ ok: false, error: "La révision sur téléphone fonctionne uniquement dans l'application installée." }),
    reviewStop: async () => ({ ok: true }),
    onGrade: () => () => {},
  },
  // Dans un navigateur, pas d'accès aux dossiers : sauvegarde automatique indisponible
  backup: {
    info: async () => ({ dir: '', web: true }),
    choose: async () => ({ ok: false }),
    write: async () => ({ ok: false, error: "Sauvegarde automatique disponible uniquement dans l'application installée." }),
    open: async () => {},
  },
  commons: {
    search: async () => ({ ok: false, error: "Recherche d'images disponible uniquement dans l'application installée." }),
    image: async () => ({ ok: false, error: "Recherche d'images disponible uniquement dans l'application installée." }),
  },
  // Dans un navigateur, Wikipédia accepte les appels directs (origin=*)
  define: {
    lookup: async (term) => {
      try {
        const qs = new URLSearchParams({ action: 'query', format: 'json', origin: '*', prop: 'extracts|info', exintro: '1', explaintext: '1', exsentences: '4', inprop: 'url', redirects: '1', titles: String(term || '').trim() });
        const data = await (await fetch(`https://fr.wikipedia.org/w/api.php?${qs}`)).json();
        const results = Object.values(data.query?.pages || {}).filter((p) => p.extract).map((p) => ({ source: 'Wikipédia', title: p.title, extract: p.extract.slice(0, 900), url: p.fullurl }));
        return { ok: true, results };
      } catch (e) { return { ok: false, error: e.message, results: [] }; }
    },
  },
  gpu: { info: async () => ({ off: false, web: true }), set: async () => {} },
  claude: { open: async () => { window.open('https://claude.ai/new', '_blank', 'noopener'); return { ok: true }; } },
  clipboard: { read: async () => navigator.clipboard.readText(), write: async (t) => navigator.clipboard.writeText(t) },
  printPdf: async () => { window.print(); return { ok: true }; },
  setTheme: () => {},
  openExternal: async (url) => window.open(url, '_blank', 'noopener'),
};

const rawApi = window.api || webApi;
// Gemini surchargé : un autre modèle a répondu → événement « gemini-fallback » (notification dans jobs.js)
export const api = rawApi.gemini && rawApi.gemini.generate
  ? { ...rawApi, gemini: { ...rawApi.gemini, generate: async (req) => {
    const r = await rawApi.gemini.generate(req);
    if (r && r.ok && r.fallbackFrom) window.dispatchEvent(new CustomEvent('gemini-fallback', { detail: { from: r.fallbackFrom, model: r.model } }));
    return r;
  } } }
  : rawApi;
