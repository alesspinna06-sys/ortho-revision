// Réponses aux demandes du téléphone (Réglages › Téléphone) : liste des cours et contenu d'un cours.
// Le HTML vient de renderMarkdown (texte échappé) ; les schémas sont des images (SVG nettoyé ou photo).
import { api } from './bridge.js';
import { getCourses, getCourse, getFolders } from './db.js';
import { renderMarkdown } from './markdown.js';
import { svgSrc } from '../components/Markdown.jsx';

const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const words = (s) => (String(s || '').match(/\S+/g) || []).length;

function figure(d) {
  if (!d) return '';
  let src = '';
  if (d.image && /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(d.image)) src = d.image;
  else if (d.svg) src = svgSrc(d.svg);
  if (!src) return '';
  return `<figure><img src="${esc(src)}" alt="${esc(d.title)}" loading="lazy">${d.title ? `<figcaption>${esc(d.title)}</figcaption>` : ''}</figure>`;
}

/** Cours mis en forme pour le téléphone, schémas compris (même découpage que Markdown.jsx). */
export function courseHtml(md = '', diagrams = []) {
  const byId = new Map((diagrams || []).map((d) => [Number(d.id), d]));
  const placed = new Set();
  let out = '';
  String(md).split(/[ \t]*(?:[-*•][ \t]+)?\[\[schema:(\d+)\]\][ \t]*/).forEach((chunk, i) => {
    if (i % 2 === 1) { placed.add(Number(chunk)); out += figure(byId.get(Number(chunk))); }
    else if (chunk.trim()) out += renderMarkdown(chunk).replace(/ tabindex="0"/g, '');
  });
  (diagrams || []).forEach((d) => { if (!placed.has(Number(d.id))) out += figure(d); });
  return out;
}

const podcastInfo = (c) => (c.podcast ? { title: c.podcast.title || c.title, seconds: c.podcast.seconds || 0, at: c.podcast.at || 0 } : null);

async function answer(type, payload) {
  if (type === 'list') {
    const [courses, folders] = await Promise.all([getCourses(), getFolders()]);
    return {
      folders: folders.map((f) => ({ id: f.id, name: f.name, color: f.color })),
      courses: courses
        .filter((c) => c.summary)
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
        .map((c) => ({
          id: c.id, title: c.title, subject: c.subject || '', folderId: c.folderId || null,
          hasSynthesis: !!c.synthesis, minutes: Math.max(1, Math.round(words(c.summary) / 200)), podcast: podcastInfo(c),
        })),
    };
  }
  if (type === 'course') {
    const c = await getCourse(payload && payload.id);
    if (!c || !c.summary) return null;
    return {
      id: c.id, title: c.title, subject: c.subject || '',
      html: courseHtml(c.summary, c.diagrams),
      synthesisHtml: c.synthesis ? courseHtml(c.synthesis, []) : '',
      podcast: podcastInfo(c),
    };
  }
  throw new Error('Demande inconnue.');
}

let started = false;
/** À appeler une fois au démarrage : le logiciel répond au serveur du téléphone. */
export function startPhoneLibrary() {
  if (started || !api.library) return;
  started = true;
  api.library.onRequest(({ id, type, payload }) => {
    answer(type, payload).then(
      (data) => api.library.reply(id, true, data),
      (err) => api.library.reply(id, false, null, err.message || String(err)),
    );
  });
}
