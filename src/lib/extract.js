// Extraction du texte et de la structure des documents importés.
// Les bibliothèques sont chargées à la demande (import dynamique) pour que
// l'application démarre vite, même sur un ancien Mac.

export const ACCEPTED = '.pdf,.docx,.pptx,.xlsx,.xls,.ods,.csv,.txt,.md,.rtf,.png,.jpg,.jpeg,.webp,.heic,.heif';

export function extOf(name = '') {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
}

export function isImage(file) {
  return /^image\//.test(file.type) || ['png', 'jpg', 'jpeg', 'webp', 'heic', 'heif'].includes(extOf(file.name));
}

const cleanTitle = (name) => name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();

// Taille maximale d'un PDF gardé en entier pour que l'IA lise ses schémas
const PDF_MEDIA_MAX = 6 * 1024 * 1024;

/**
 * Renvoie { title, text, sourceType, mediaItems } ou { needsOcr: true, ... } pour un PDF scanné.
 * mediaItems : schémas / pages d'origine (Blob) à transmettre à l'IA pour la fiche.
 */
export async function extractFile(file) {
  const ext = extOf(file.name);
  const title = cleanTitle(file.name);
  switch (ext) {
    case 'txt': case 'md': case 'csv':
      return { title, text: (await file.text()).trim(), sourceType: ext, mediaItems: [] };
    case 'rtf':
      return { title, text: rtfToText(await file.text()), sourceType: 'rtf', mediaItems: [] };
    case 'docx': {
      const { text, images } = await docxToText(file);
      return { title, text, sourceType: 'word', mediaItems: images };
    }
    case 'pptx': {
      const { text, images } = await pptxToText(file);
      return { title, text, sourceType: 'powerpoint', mediaItems: images };
    }
    case 'xlsx': case 'xls': case 'ods':
      return { title, text: await sheetToText(file), sourceType: 'excel', mediaItems: [] };
    case 'pdf': {
      const { text, pages } = await pdfToText(file);
      const mediaItems = file.size <= PDF_MEDIA_MAX ? [{ kind: 'pdf', blob: file, name: file.name }] : [];
      // Peu de texte par page => PDF scanné : on passera par l'OCR Gemini
      if (text.replace(/\s/g, '').length < 80 * pages) return { title, text, sourceType: 'pdf', needsOcr: true, mediaItems };
      return { title, text, sourceType: 'pdf', mediaItems };
    }
    case 'doc': case 'ppt':
      throw new Error(`Le format .${ext} (ancien Office) n'est pas lisible : enregistre le fichier en .${ext}x depuis Word/PowerPoint.`);
    default:
      throw new Error(`Format non pris en charge : .${ext || '?'}`);
  }
}

// --- Word (.docx) : conserve titres et listes ---------------------------------
async function docxToText(file) {
  const mod = await import('mammoth/mammoth.browser.js');
  const mammoth = mod.default || mod;
  const images = [];
  // Les images (schémas) sont mises de côté ; le texte garde une ligne vide à leur place.
  // Chaque image garde sa place dans le texte grâce au repère « [Image N] »
  const convertImage = mammoth.images.imgElement(async (image) => {
    if (/^image\/(png|jpe?g|webp|gif)$/.test(image.contentType || '')) {
      const buf = await image.read();
      if (buf.byteLength >= 4 * 1024) { // les petites icônes sont ignorées
        images.push({ kind: 'image', blob: new Blob([buf], { type: image.contentType }), name: `Image ${images.length + 1}` });
        return { src: '', alt: `[Image ${images.length}]` };
      }
    }
    return { src: '' };
  });
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() }, { convertImage });
  return { text: htmlToMarkdown(html), images };
}

/** Texte d'un élément HTML en gardant les liens « [texte](adresse) » et les repères d'images. */
function richText(node) {
  let out = '';
  node.childNodes.forEach((n) => {
    if (n.nodeType === 3) out += n.textContent;
    else if (n.tagName === 'A' && /^https?:/i.test(n.getAttribute('href') || '')) {
      const t = n.textContent.replace(/\s+/g, ' ').trim();
      const url = n.getAttribute('href');
      out += t ? ` [${t.replace(/[[\]]/g, '')}](${url}) ` : ` [lien](${url}) `;
    } else if (n.tagName === 'IMG') { if (/^\[Image \d+\]$/.test(n.getAttribute('alt') || '')) out += `\n${n.getAttribute('alt')}\n`; }
    else if (n.tagName === 'BR') out += '\n';
    else if (n.nodeType === 1 && !/^(UL|OL)$/.test(n.tagName)) out += richText(n);
  });
  return out;
}
const tidy = (s) => s.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');

function htmlToMarkdown(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out = [];
  const walk = (node, depth = 0) => {
    for (const el of node.children) {
      const tag = el.tagName.toLowerCase();
      const txt = tidy(richText(el));
      if (/^h[1-6]$/.test(tag)) { if (txt) out.push(`\n${'#'.repeat(+tag[1])} ${txt}\n`); }
      else if (tag === 'ul' || tag === 'ol') walk(el, depth + 1);
      else if (tag === 'li') {
        const own = tidy(richText(el)).replace(/\n/g, ' ');
        if (own) out.push(`${'  '.repeat(Math.max(0, depth - 1))}- ${own}`);
        [...el.children].filter((c) => /^(UL|OL)$/.test(c.tagName)).forEach((c) => walk(c, depth + 1));
      } else if (tag === 'table') {
        // Tableau Markdown : une ligne par ligne du tableau d'origine
        let first = true;
        for (const tr of el.querySelectorAll('tr')) {
          const cells = [...tr.children].map((c) => tidy(richText(c)).replace(/\n/g, ' ').replace(/\|/g, '/'));
          if (!cells.some(Boolean)) continue;
          out.push(`| ${cells.join(' | ')} |`);
          if (first) { out.push(`|${cells.map(() => '---').join('|')}|`); first = false; }
        }
        out.push('');
      } else if (txt) out.push(txt + '\n');
    }
  };
  walk(doc.body);
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// --- PowerPoint (.pptx) : texte de chaque diapo + notes de l'orateur ----------
async function pptxToText(file) {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const num = (p) => +p.match(/(\d+)\.xml$/)[1];
  // Images des diapositives (schémas) : PNG / JPEG / WebP seulement, les petites icônes sont ignorées
  const images = [];
  const imageNo = new Map(); // chemin dans le fichier → numéro « Image N »
  const media = Object.keys(zip.files).filter((p) => /^ppt\/media\/[^/]+\.(png|jpe?g|webp|gif)$/i.test(p))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })); // image2 avant image10
  for (const path of media) {
    const blob = await zip.file(path).async('blob');
    if (blob.size < 6 * 1024) continue;
    const type = /png$/i.test(path) ? 'image/png' : /webp$/i.test(path) ? 'image/webp' : /gif$/i.test(path) ? 'image/gif' : 'image/jpeg';
    images.push({ kind: 'image', blob: new Blob([blob], { type }), name: `Image ${images.length + 1}` });
    imageNo.set(path, images.length);
  }
  // Liens d'une diapositive (rId → adresse), d'après son fichier .rels
  const relsOf = async (slidePath) => {
    const f = zip.file(slidePath.replace(/slides\/(slide\d+\.xml)$/, 'slides/_rels/$1.rels'));
    const map = {};
    if (!f) return map;
    const doc = parser.parseFromString(await f.async('string'), 'application/xml');
    for (const r of doc.getElementsByTagName('Relationship')) {
      const target = r.getAttribute('Target') || '';
      map[r.getAttribute('Id')] = { target, external: r.getAttribute('TargetMode') === 'External', type: r.getAttribute('Type') || '' };
    }
    return map;
  };
  const resolveMedia = (target) => `ppt/${target.replace(/^\.\.\//, '')}`;
  const slides = Object.keys(zip.files).filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p)).sort((a, b) => num(a) - num(b));
  const parser = new DOMParser();
  const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const rid = (el, name) => el.getAttributeNS(R_NS, name) || el.getAttribute(`r:${name}`) || '';
  /** Paragraphes d'une diapositive ; un mot avec lien devient « [mot](adresse) ». */
  const paragraphs = (xml, rels = {}) => {
    const doc = parser.parseFromString(xml, 'application/xml');
    const lines = [...doc.getElementsByTagNameNS('*', 'p')].map((p) => {
      let line = '';
      for (const run of p.children) {
        const t = [...run.getElementsByTagNameNS('*', 't')].map((x) => x.textContent).join('');
        if (!t) continue;
        const link = run.getElementsByTagNameNS('*', 'hlinkClick')[0];
        const rel = link && rels[rid(link, 'id')];
        line += rel?.external && /^https?:/i.test(rel.target) ? `[${t.trim().replace(/[[\]]/g, '') || 'lien'}](${rel.target})${/\s$/.test(t) ? ' ' : ''}` : t;
      }
      return line.trim();
    }).filter(Boolean);
    // Images, vidéos et liens posés sur des formes (pas sur du texte)
    const extra = [];
    for (const blip of doc.getElementsByTagNameNS('*', 'blip')) {
      const rel = rels[rid(blip, 'embed')];
      const no = rel && imageNo.get(resolveMedia(rel.target));
      if (no && !extra.includes(`[Image ${no}]`)) extra.push(`[Image ${no}]`);
    }
    for (const v of [...doc.getElementsByTagNameNS('*', 'videoFile'), ...doc.getElementsByTagNameNS('*', 'media')]) {
      const rel = rels[rid(v, 'link')] || rels[rid(v, 'embed')];
      if (!rel) continue;
      const line = rel.external && /^https?:/i.test(rel.target) ? `[▶ Vidéo](${rel.target})` : `(Vidéo intégrée au diaporama : ${rel.target.split('/').pop()} — à regarder dans le fichier d'origine)`;
      if (!extra.includes(line)) extra.push(line);
    }
    for (const c of doc.getElementsByTagNameNS('*', 'cNvPr')) {
      const link = c.getElementsByTagNameNS('*', 'hlinkClick')[0];
      const rel = link && rels[rid(link, 'id')];
      if (rel?.external && /^https?:/i.test(rel.target)) {
        const line = `[${(c.getAttribute('descr') || c.getAttribute('name') || 'Lien').replace(/[[\]]/g, '')}](${rel.target})`;
        if (!lines.join(' ').includes(rel.target) && !extra.includes(line)) extra.push(line);
      }
    }
    return [...lines, ...extra];
  };
  const out = [];
  for (const path of slides) {
    const n = num(path);
    const lines = paragraphs(await zip.file(path).async('string'), await relsOf(path));
    const notesFile = zip.file(`ppt/notesSlides/notesSlide${n}.xml`);
    const notes = notesFile ? paragraphs(await notesFile.async('string')).filter((l) => !/^\d+$/.test(l)) : [];
    if (!lines.length && !notes.length) continue;
    const [first, ...rest] = lines;
    out.push(`## Diapositive ${n}${first ? ' — ' + first : ''}`);
    rest.forEach((l) => out.push(`- ${l}`));
    if (notes.length) out.push(`> Notes : ${notes.join(' ')}`);
    out.push('');
  }
  return { text: out.join('\n').trim(), images };
}

/**
 * Transforme les éléments extraits (Blob) en médias prêts pour l'IA, compressés et bornés
 * (nombre et poids totaux) pour rester sous la limite d'envoi de Gemini.
 */
const MEDIA_MAX = 12;
const MEDIA_BUDGET = 9 * 1024 * 1024; // caractères base64 au total (~6,7 Mo)
export async function buildMedia(items = []) {
  const out = [];
  let size = 0;
  for (const it of items) {
    if (out.length >= MEDIA_MAX) break;
    try {
      const m = it.kind === 'pdf'
        ? { mimeType: 'application/pdf', data: await blobToBase64(it.blob) }
        : await prepareImage(it.blob, 1400);
      if (size + m.data.length > MEDIA_BUDGET) continue;
      size += m.data.length;
      out.push({ ...m, name: it.name || '' });
    } catch (e) {
      console.warn('Média ignoré :', e);
    }
  }
  return out;
}

// --- Excel / tableurs ------------------------------------------------------
async function sheetToText(file) {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  return wb.SheetNames.map((name) => {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, blankrows: false, defval: '' });
    const lines = rows.map((r) => r.map((c) => String(c).trim()).join(' | ')).filter((l) => l.replace(/[|\s]/g, ''));
    return `## Feuille « ${name} »\n${lines.join('\n')}`;
  }).join('\n\n').trim();
}

// --- PDF -------------------------------------------------------------------------
async function pdfToText(file) {
  const pdfjs = await import('pdfjs-dist');
  const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const parts = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    let line = '';
    const lines = [];
    for (const item of content.items) {
      line += item.str;
      if (item.hasEOL) { lines.push(line.trim()); line = ''; }
    }
    if (line.trim()) lines.push(line.trim());
    // Liens cliquables de la page (vidéos, sites…)
    try {
      const links = (await page.getAnnotations()).filter((a) => a.subtype === 'Link' && /^https?:/i.test(a.url || '')).map((a) => a.url);
      [...new Set(links)].forEach((u) => lines.push(`[${/youtu|vimeo|dailymotion/i.test(u) ? '▶ Vidéo' : 'Lien'}](${u})`));
    } catch { /* page sans annotations */ }
    const text = lines.filter(Boolean).join('\n');
    if (text) parts.push(`## Page ${i}\n${text}`);
    page.cleanup();
  }
  await pdf.destroy();
  return { text: parts.join('\n\n'), pages: pdf.numPages || 1 };
}

// --- RTF basique ---------------------------------------------------------------
function rtfToText(rtf) {
  return rtf
    .replace(/\\par[d]?/g, '\n')
    .replace(/\\'([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\[a-z]+-?\d* ?/gi, '')
    .replace(/[{}]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// --- Images : compression avant envoi à l'IA (moins de données = plus rapide) --
export async function prepareImage(blob, max = 2000) {
  const type = blob.type || '';
  if (/heic|heif/i.test(type) || /\.(heic|heif)$/i.test(blob.name || '')) {
    // Chromium ne décode pas le HEIC : on l'envoie tel quel (Gemini le lit).
    return { mimeType: 'image/heic', data: await blobToBase64(blob) };
  }
  try {
    const bmp = await createImageBitmap(blob);
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * s);
    canvas.height = Math.round(bmp.height * s);
    const ctx = canvas.getContext('2d');
    // Fond blanc : sans cela, les zones transparentes d'un PNG deviennent noires en JPEG
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close?.();
    const out = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
    return { mimeType: 'image/jpeg', data: await blobToBase64(out) };
  } catch {
    return { mimeType: type || 'image/jpeg', data: await blobToBase64(blob) };
  }
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
