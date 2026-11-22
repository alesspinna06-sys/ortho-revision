// Enveloppe minimaliste d'IndexedDB en promesses (≈ 1 Ko, remplace la lib "idb").
const req = (r) => new Promise((resolve, reject) => {
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});

const txDone = (t) => new Promise((resolve, reject) => {
  t.oncomplete = () => resolve();
  t.onerror = () => reject(t.error);
  t.onabort = () => reject(t.error || new Error('Transaction annulée'));
});

function wrapStore(os) {
  return {
    get: (k) => req(os.get(k)),
    getAll: (q) => req(os.getAll(q)),
    put: (v) => req(os.put(v)),
    delete: (k) => req(os.delete(k)),
    clear: () => req(os.clear()),
    index: (name) => {
      const ix = os.index(name);
      return { getAll: (q) => req(ix.getAll(q)), getAllKeys: (q) => req(ix.getAllKeys(q)) };
    },
  };
}

function wrapDb(db) {
  const read = (s) => db.transaction(s, 'readonly').objectStore(s);
  const write = async (s, fn) => {
    const t = db.transaction(s, 'readwrite');
    const r = fn(t.objectStore(s));
    await txDone(t); // attend l'écriture effective sur le disque
    return r.result;
  };
  return {
    raw: db,
    get: (s, k) => req(read(s).get(k)),
    getAll: (s) => req(read(s).getAll()),
    getAllFromIndex: (s, i, q) => req(read(s).index(i).getAll(q)),
    put: (s, v) => write(s, (os) => os.put(v)),
    delete: (s, k) => write(s, (os) => os.delete(k)),
    transaction(stores, mode = 'readonly') {
      const t = db.transaction(stores, mode);
      const names = Array.isArray(stores) ? stores : [stores];
      return { store: wrapStore(t.objectStore(names[0])), objectStore: (n) => wrapStore(t.objectStore(n)), done: txDone(t) };
    },
  };
}

export function openDB(name, version, { upgrade } = {}) {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(name, version);
    r.onupgradeneeded = (e) => upgrade?.(r.result, e.oldVersion, e.newVersion, r.transaction);
    r.onsuccess = () => resolve(wrapDb(r.result));
    r.onerror = () => reject(r.error);
    r.onblocked = () => console.warn('Base locale bloquée par un autre onglet');
  });
}
