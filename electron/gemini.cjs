// Appels à l'API Google Gemini (REST, sans SDK = plus léger).
// Documentation : https://ai.google.dev/gemini-api/docs
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function frenchError(status, message) {
  if (status === 400 && /API key/i.test(message)) return 'Clé API Gemini invalide. Vérifie-la dans Réglages.';
  if (status === 401 || status === 403) return 'Clé API refusée (403). Vérifie la clé ou ses restrictions dans Google AI Studio.';
  if (status === 404) return `Modèle introuvable. Choisis un autre modèle dans Réglages (« Détecter les modèles »). Détail : ${message}`;
  if (status === 429) return 'Quota Gemini atteint (limite gratuite). Patiente une minute puis réessaie.';
  if (status >= 500) return 'Le service Gemini est momentanément indisponible. Réessaie dans un instant.';
  return message || `Erreur Gemini (${status})`;
}

/** Sources web citées par la recherche Google (ancrage) : [{ title, uri }] sans doublon. */
function groundingSources(cand) {
  const seen = new Set();
  return ((cand.groundingMetadata && cand.groundingMetadata.groundingChunks) || [])
    .map((c) => c.web).filter((w) => w && w.uri)
    .filter((w) => { const k = w.title || w.uri; if (seen.has(k)) return false; seen.add(k); return true; })
    .map((w) => ({ title: w.title || w.uri, uri: w.uri }));
}

/**
 * req = { model, system, parts: [{text}|{inlineData:{mimeType,data}}], schema?, temperature?, search? }
 * search : active la recherche Google (actualités) ; incompatible avec schema.
 * Renvoie { text, sources } (text = JSON sous forme de chaîne si schema fourni).
 */
async function generate(apiKey, req) {
  if (!apiKey) throw new Error('Aucune clé API Gemini. Ajoute-la dans Réglages › Intelligence artificielle.');
  const model = (req.model || 'gemini-flash-latest').replace(/^models\//, '');
  const body = {
    contents: [{ role: 'user', parts: req.parts }],
    generationConfig: {
      temperature: req.temperature ?? 0.4,
      ...(req.schema && !req.search ? { responseMimeType: 'application/json', responseSchema: req.schema } : {}),
      ...(req.image ? { responseModalities: ['TEXT', 'IMAGE'] } : {}),
    },
  };
  if (req.search) body.tools = [{ google_search: {} }];
  if (req.system) body.systemInstruction = { parts: [{ text: req.system }] };

  // Durée maximale d'une demande (nouvelles tentatives et modèles de repli compris) : jamais d'attente sans fin
  req.deadline = Date.now() + (req.deadlineMs || 8 * 60 * 1000);
  req.say = typeof req.onStatus === 'function' ? req.onStatus : () => {};
  // Modèle surchargé il y a peu : on passe directement par celui qui a marché (10 min), puis on réessaie le modèle choisi
  if (sticky && sticky.key === apiKey && sticky.from === model && Date.now() < sticky.until && !req.image) {
    try { return { ...(await callModel(apiKey, sticky.to, body, req, 2)), model: sticky.to, fallbackFrom: model }; }
    catch (e) { if (isKeyError(e)) throw e; sticky = null; }
  }
  try {
    return { ...(await callModel(apiKey, model, body, req, 3)), model };
  } catch (err) {
    // Repli seulement si Google est surchargé (5xx) : jamais pour une clé refusée, un quota ou un contenu bloqué
    if (!(err.status >= 500) || req.image) throw err;
    for (const alt of await fallbackModels(apiKey, model)) {
      if (Date.now() > req.deadline - 20000) break;
      req.say({ text: `Gemini (${model}) ne répond pas : essai avec ${alt}…` });
      try {
        const r = await callModel(apiKey, alt, body, req, 1);
        sticky = { key: apiKey, from: model, to: alt, until: Date.now() + 10 * 60 * 1000 };
        console.warn(`[gemini] ${model} surchargé : réponse donnée par ${alt}`);
        return { ...r, model: alt, fallbackFrom: model };
      } catch (e) {
        if (isKeyError(e)) throw e;
      }
    }
    if (err.timeout) throw new Error("Gemini n'a pas répondu à temps : il est surchargé chez Google en ce moment (ce n'est pas ta clé). Réessaie un peu plus tard, ou utilise « Générer avec Claude » dans le cours.");
    throw new Error("Gemini est surchargé chez Google en ce moment (erreur 503 : ce n'est pas ta clé). Le logiciel a aussi essayé d'autres modèles Gemini, sans succès. Réessaie un peu plus tard, ou choisis un autre modèle dans Réglages › IA.");
  }
}

let sticky = null; // { key, from, to, until } : repli en cours
const isKeyError = (e) => e && (e.status === 401 || e.status === 403 || (e.status === 400 && /API key/i.test(e.raw || '')));

/** Un appel à un modèle, avec quelques nouvelles tentatives pour les erreurs temporaires (429, 5xx). */
async function callModel(apiKey, model, body, req, tries) {
  let lastErr;
  for (let attempt = 0; attempt < tries; attempt++) {
    const left = (req.deadline || Date.now() + 480000) - Date.now();
    if (left < 5000) break;
    let res;
    try {
      res = await fetch(`${BASE}/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(body),
        // Une réponse ne doit pas se faire attendre plus de 4 minutes (et jamais au-delà de la limite totale)
        signal: AbortSignal.timeout(Math.min(req.timeoutMs || 240000, left)),
      });
    } catch (e) {
      if (e && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
        lastErr = new Error("Gemini n'a pas répondu à temps (surchargé).");
        lastErr.status = 504; lastErr.timeout = true;
        (req.say || (() => {}))({ text: `Gemini (${model}) ne répond pas depuis plusieurs minutes…` });
        break; // inutile de réessayer le même modèle : on passe au repli
      }
      lastErr = new Error('Impossible de joindre Gemini : vérifie ta connexion à internet.');
      lastErr.status = 503;
      if (attempt < tries - 1) { await sleep(3000); continue; }
      break;
    }
    if (res.ok) {
      const data = await res.json();
      const cand = data.candidates && data.candidates[0];
      if (!cand) {
        const reason = data.promptFeedback && data.promptFeedback.blockReason;
        throw new Error(reason ? `Contenu bloqué par Gemini (${reason}).` : 'Réponse vide de Gemini.');
      }
      const parts = (cand.content && cand.content.parts) || [];
      const text = parts.map((p) => p.text || '').join('');
      const images = parts.filter((p) => p.inlineData).map((p) => ({ mimeType: p.inlineData.mimeType, data: p.inlineData.data }));
      if (!text && !images.length) throw new Error(`Réponse vide (motif : ${cand.finishReason || 'inconnu'}).`);
      if (cand.finishReason === 'MAX_TOKENS' && req.schema) throw new Error("Réponse de l'IA trop longue (coupée). Réessaie.");
      return { text, sources: groundingSources(cand), images };
    }
    let msg = '';
    try { msg = (await res.json()).error.message; } catch {}
    lastErr = new Error(frenchError(res.status, msg));
    lastErr.status = res.status;
    lastErr.raw = msg;
    // Nouvelle tentative uniquement pour les erreurs temporaires (pas d'attente après la dernière)
    if ((res.status === 429 || res.status >= 500) && attempt < tries - 1) {
      (req.say || (() => {}))({ text: `Gemini surchargé (erreur ${res.status}) : nouvel essai dans ${3 * (attempt + 1)} s…` });
      await sleep(3000 * (attempt + 1));
      continue;
    }
    break;
  }
  throw lastErr || Object.assign(new Error("Gemini n'a pas répondu à temps (surchargé)."), { status: 504, timeout: true });
}

let modelCache = null; // { key, at, ids } : liste des modèles du compte (1 h)
async function availableModels(apiKey) {
  if (modelCache && modelCache.key === apiKey && Date.now() - modelCache.at < 3600 * 1000) return modelCache.ids;
  try {
    const ids = (await listModels(apiKey)).map((m) => m.id);
    modelCache = { key: apiKey, at: Date.now(), ids };
    return ids;
  } catch { return []; }
}
const verOf = (id) => { const m = id.match(/gemini-(\d+(?:\.\d+)?)/); return m ? parseFloat(m[1]) : 0; };

/** Autres modèles à essayer quand le modèle choisi est surchargé : Flash stables (du plus récent au plus ancien), puis Flash-Lite, puis Pro. */
async function fallbackModels(apiKey, model) {
  const ids = await availableModels(apiKey);
  const bad = /image|tts|audio|live|embed|native|computer|robotics|learnlm|gemma|exp/i;
  if (!ids.length) return ['gemini-flash-lite-latest', 'gemini-pro-latest'].filter((id) => id !== model);
  const stable = ids.filter((id) => /^gemini-\d+(\.\d+)?-flash(-lite)?$/.test(id))
    .sort((a, b) => (a.includes('lite') - b.includes('lite')) || verOf(b) - verOf(a));
  const order = [...stable.filter((id) => !id.includes('lite')), 'gemini-flash-lite-latest', ...stable.filter((id) => id.includes('lite')), 'gemini-pro-latest'];
  const seen = new Set([model]);
  return order.filter((id) => ids.includes(id) && !bad.test(id) && !seen.has(id) && seen.add(id)).slice(0, 4);
}

async function listModels(apiKey) {
  if (!apiKey) throw new Error('Aucune clé API Gemini.');
  const res = await fetch(`${BASE}/models?pageSize=200`, { headers: { 'x-goog-api-key': apiKey } });
  if (!res.ok) {
    let msg = ''; try { msg = (await res.json()).error.message; } catch {}
    throw new Error(frenchError(res.status, msg));
  }
  const data = await res.json();
  return (data.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => ({ id: m.name.replace(/^models\//, ''), label: m.displayName || m.name }))
    .filter((m) => /gemini/i.test(m.id));
}

/**
 * Envoie un fichier lourd (ex. enregistrement audio d'un oral) à l'API Files de Gemini,
 * puis attend qu'il soit prêt. Renvoie { uri, mimeType } à utiliser dans parts : { fileData }.
 * Les fichiers envoyés sont supprimés automatiquement par Google après 48 h.
 */
async function uploadFile(apiKey, { data, mimeType, displayName }) {
  if (!apiKey) throw new Error('Aucune clé API Gemini. Ajoute-la dans Réglages › Intelligence artificielle.');
  const bytes = Buffer.from(data);
  const start = await fetch('https://generativelanguage.googleapis.com/upload/v1beta/files', {
    method: 'POST',
    headers: {
      'x-goog-api-key': apiKey,
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(bytes.length),
      'X-Goog-Upload-Header-Content-Type': mimeType,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: displayName || 'fichier' } }),
  });
  if (!start.ok) {
    let msg = ''; try { msg = (await start.json()).error.message; } catch {}
    throw new Error(frenchError(start.status, msg));
  }
  const uploadUrl = start.headers.get('x-goog-upload-url');
  if (!uploadUrl) throw new Error("Envoi du fichier à Gemini impossible (pas d'adresse d'envoi).");
  const up = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' },
    body: bytes,
  });
  if (!up.ok) throw new Error(frenchError(up.status, "l'envoi du fichier a échoué"));
  let file = (await up.json()).file;
  for (let i = 0; i < 60 && file && file.state === 'PROCESSING'; i++) {
    await sleep(2000);
    const r = await fetch(`${BASE}/${file.name}`, { headers: { 'x-goog-api-key': apiKey } });
    if (r.ok) file = await r.json();
  }
  if (!file || file.state === 'FAILED') throw new Error('Gemini n’a pas pu lire ce fichier.');
  return { uri: file.uri, mimeType: file.mimeType || mimeType };
}

module.exports = { generate, listModels, uploadFile };
