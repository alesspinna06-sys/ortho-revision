// Pont sécurisé entre l'interface (React) et le processus principal.
// La clé API ne transite jamais vers l'interface : seuls les résultats reviennent.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  platform: process.platform,
  isElectron: true,
  key: {
    status: () => ipcRenderer.invoke('key:status'),
    set: (key) => ipcRenderer.invoke('key:set', key),
  },
  gemini: {
    generate: (req) => ipcRenderer.invoke('gemini:generate', req),
    onStatus: (cb) => { const f = (_e, s) => cb(s); ipcRenderer.on('gemini:status', f); return () => ipcRenderer.removeListener('gemini:status', f); },
    models: () => ipcRenderer.invoke('gemini:models'),
    upload: (req) => ipcRenderer.invoke('gemini:upload', req),
  },
  phone: {
    start: () => ipcRenderer.invoke('phone:start'),
    stop: () => ipcRenderer.invoke('phone:stop'),
    onFile: (cb) => {
      const handler = (_e, file) => cb(file);
      ipcRenderer.on('phone:file', handler);
      return () => ipcRenderer.removeListener('phone:file', handler);
    },
    review: (payload) => ipcRenderer.invoke('phone:review', payload),
    reviewStop: () => ipcRenderer.invoke('phone:reviewStop'),
    onGrade: (cb) => {
      const handler = (_e, g) => cb(g);
      ipcRenderer.on('phone:grade', handler);
      return () => ipcRenderer.removeListener('phone:grade', handler);
    },
  },
  backup: {
    info: () => ipcRenderer.invoke('backup:info'),
    choose: () => ipcRenderer.invoke('backup:choose'),
    write: (json) => ipcRenderer.invoke('backup:write', json),
    open: () => ipcRenderer.invoke('backup:open'),
  },
  commons: {
    search: (q) => ipcRenderer.invoke('commons:search', q),
    image: (url) => ipcRenderer.invoke('commons:image', url),
  },
  define: { lookup: (term) => ipcRenderer.invoke('define:lookup', term) },
  eleven: {
    status: () => ipcRenderer.invoke('eleven:status'),
    setKey: (key) => ipcRenderer.invoke('eleven:setKey', key),
    voices: () => ipcRenderer.invoke('eleven:voices'),
    usage: () => ipcRenderer.invoke('eleven:usage'),
    speak: (req) => ipcRenderer.invoke('eleven:speak', req),
  },
  azure: {
    status: () => ipcRenderer.invoke('azure:status'),
    setKey: (key, region) => ipcRenderer.invoke('azure:setKey', { key, region }),
    voices: () => ipcRenderer.invoke('azure:voices'),
    speak: (req) => ipcRenderer.invoke('azure:speak', req),
    usage: () => ipcRenderer.invoke('azure:usage'),
  },
  podcast: {
    cancel: (courseId) => ipcRenderer.invoke('podcast:cancel', courseId),
    build: (req) => ipcRenderer.invoke('podcast:build', req),
    read: (id) => ipcRenderer.invoke('podcast:read', id),
    save: (id, name) => ipcRenderer.invoke('podcast:save', { id, name }),
    remove: (id) => ipcRenderer.invoke('podcast:delete', id),
    onProgress: (cb) => {
      const handler = (_e, p) => cb(p);
      ipcRenderer.on('podcast:progress', handler);
      return () => ipcRenderer.removeListener('podcast:progress', handler);
    },
  },
  update: {
    status: () => ipcRenderer.invoke('update:status'),
    check: () => ipcRenderer.invoke('update:check'),
    install: () => ipcRenderer.invoke('update:install'),
    onStatus: (cb) => {
      const handler = (_e, s) => cb(s);
      ipcRenderer.on('update:status', handler);
      return () => ipcRenderer.removeListener('update:status', handler);
    },
  },
  library: {
    status: () => ipcRenderer.invoke('library:status'),
    set: (on) => ipcRenderer.invoke('library:set', on),
    reset: () => ipcRenderer.invoke('library:reset'),
    onRequest: (cb) => {
      const handler = (_e, r) => cb(r);
      ipcRenderer.on('library:req', handler);
      return () => ipcRenderer.removeListener('library:req', handler);
    },
    reply: (id, ok, data, error) => ipcRenderer.send('library:res', { id, ok, data, error }),
  },
  gpu: { info: () => ipcRenderer.invoke('gpu:info'), set: (on) => ipcRenderer.invoke('gpu:set', on) },
  claude: { open: () => ipcRenderer.invoke('claude:open') },
  clipboard: { read: () => ipcRenderer.invoke('clipboard:read'), write: (t) => ipcRenderer.invoke('clipboard:write', t) },
  printPdf: (opts) => ipcRenderer.invoke('print:pdf', opts),
  setTheme: (mode) => ipcRenderer.send('theme:set', mode),
  openExternal: (url) => ipcRenderer.invoke('open:external', url),
});
