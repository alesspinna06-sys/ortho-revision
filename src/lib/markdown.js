// Mini-moteur Markdown (aucune dépendance). Le texte est échappé AVANT le
// formatage : aucun HTML provenant de l'IA ne peut être injecté.
// Supporte : # titres, listes, listes numérotées, > citations, **gras**, *italique*,
// `code` et ==surlignage== (termes clés).
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

import { splitMath, renderTex } from './math.js';

// Formules ($…$) rendues à part, le reste du texte mis en forme normalement
function inline(s) {
  return splitMath(s).map((p) => (p.tex != null ? renderTex(p.tex, p.display) : inlineText(p.text))).join('');
}
const VIDEO = /youtu\.?be|vimeo\.com|dailymotion|\.mp4(\?|$)|video/i;
function inlineText(s) {
  return esc(s)
    // [texte](https://…) : lien cliquable, ouvert dans le navigateur
    .replace(/\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)]+)\)/g, (_, t, u) => `<a class="ext-link${VIDEO.test(u) || /vidéo/i.test(t) ? ' is-video' : ''}" href="${u}" target="_blank" rel="noopener noreferrer" title="${u}">${t}</a>`)
    // data-t = le terme sans mise en forme (sert à retrouver sa définition)
    .replace(/==(.+?)==/g, (_, t) => `<mark data-t="${t.replace(/[*`]|@@|\^\^/g, '')}" tabindex="0">${t}</mark>`)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    // {+ … +} : morceau de phrase complété par l'IA
    .replace(/\{\+\s?([\s\S]+?)\s?\+\}/g, '<span class="ai-add" title="Complété par l’IA">$1</span>')
    // Étiquettes de couleur : @@auteur, test, œuvre@@ et ^^date, chiffre^^
    .replace(/@@(.+?)@@/g, '<span class="t-who">$1</span>')
    .replace(/\^\^(.+?)\^\^/g, '<span class="t-num">$1</span>');
}

// Repérage automatique (cours déjà générés, sans étiquettes) : années et pourcentages,
// seulement dans le texte (jamais dans une balise ni dans une étiquette existante).
// Une année n'est repérée que si elle n'est pas une quantité (« 2000 tonnes », « 1500 € »…) ni dans une suite de données.
const AUTO_NUM = /(^|[^\d,.|])((?:1[6-9]\d{2}|20[0-4]\d)(?:[–-](?:1[6-9]\d{2}|20[0-4]\d))?|\d+(?:[.,]\d+)?\s?%)(?!\d|[.,]\d|\s*(?:\||tonnes?\b|t\b|€|euros?|kg|km|m²|m2|g\b|l\b|litres?|habitants|personnes|individus|ménages|élèves|salariés|emplois|entreprises|unités|exemplaires|patients|enfants|mots|heures|h\b|min|jours|ans\b|mois|points|pts|\$|dollars?))/g;
function autoTag(html) {
  let depth = 0;
  return html.split(/(<[^>]+>)/).map((part) => {
    if (part.startsWith('<')) {
      // Rien de repéré dans une étiquette, une formule ou un lien
      if (/^<(span class="(t-num|t-who|mx)|a )/.test(part) || (depth && /^<span/.test(part))) depth++;
      else if ((part === '</span>' || part === '</a>') && depth) depth--;
      return part;
    }
    return depth ? part : part.replace(AUTO_NUM, '$1<span class="t-num">$2</span>');
  }).join('');
}
const fmt = (s) => (/\|.*\|/.test(s) ? inline(s) : autoTag(inline(s)));

// --- Tableaux -----------------------------------------------------------------------
const cells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
function tableHtml(rows, caption = '') {
  const sep = rows.length > 1 && rows[1].every((c) => /^:?-{2,}:?$/.test(c));
  const head = sep ? rows[0] : null;
  const body = sep ? rows.slice(2) : rows;
  const width = Math.max(...rows.map((r) => r.length));
  const pad = (r) => [...r, ...Array(Math.max(0, width - r.length)).fill('')];
  const num = (c) => /^[-+−]?\d[\d\s.,]*\s?(%|€)?$/.test(c);
  return `<div class="md-table">${caption ? `<div class="md-table-cap">${inline(caption)}</div>` : ''}<table>${head ? `<thead><tr>${pad(head).map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead>` : ''}<tbody>${body.map((r) => `<tr>${pad(r).map((c, i) => (i === 0 && !head ? `<th scope="row">${inline(c)}</th>` : `<td${num(c) ? ' class="n"' : ''}>${inline(c)}</td>`)).join('')}</tr>`).join('')}</tbody></table></div>`;
}
/**
 * Tableau « aplati » sur une ligne (anciens cours) : « Titre : Prix en € : 0,50 | 1 | 2 Quantité : 3750 | 3500 »
 * → une ligne de tableau par « libellé : valeurs ». Renvoie null si le paragraphe n'en est pas un.
 */
const FLAT_ROW = /([^:|]+?)\s*:\s*((?:[-−]?\d[\d.,]*\s?(?:%|€)?\s*\|\s*){2,}[-−]?\d[\d.,]*\s?(?:%|€)?)/g;
function flatTable(text) {
  if ((text.match(/\|/g) || []).length < 4) return null;
  const rows = [];
  let first = -1; let last = 0; let m;
  FLAT_ROW.lastIndex = 0;
  while ((m = FLAT_ROW.exec(text))) {
    if (first < 0) first = m.index;
    rows.push([m[1].trim(), ...m[2].split('|').map((v) => v.trim())]);
    last = FLAT_ROW.lastIndex;
  }
  if (rows.length < 2 && !(rows.length === 1 && rows[0].length > 4)) return null;
  // Le titre du tableau est devant la 1re ligne ; « Marché du kaki, Prix en € » → titre « Marché du kaki », ligne « Prix en € »
  let caption = text.slice(0, first).trim().replace(/[:–-]\s*$/, '').trim();
  const lab = rows[0][0];
  const cut = lab.lastIndexOf(', ');
  if (cut > 0) { caption = `${caption ? `${caption} : ` : ''}${lab.slice(0, cut)}`; rows[0][0] = lab.slice(cut + 2); }
  const after = text.slice(last).trim();
  return tableHtml(rows, caption) + (after ? `<p>${fmt(after)}</p>` : '');
}

// Encadrés : « >[def] » définition, « >[ex] » exemple, « >[retenir] » à retenir, « >[piege] » attention,
// « >[methode] » méthode. Un paragraphe qui commence par « Définition : », « Exemple : »… en devient un aussi.
export const CALLOUTS = {
  def: 'Définition', ex: 'Exemple', retenir: 'À retenir', piege: 'Attention', methode: 'Méthode',
};
const AUTO_CALLOUT = [
  [/^(?:\*\*)?(?:d[ée]finition|d[ée]f\.)\s*(?:\*\*)?\s*[:–-]/i, 'def'],
  [/^(?:\*\*)?(?:exemples?|ex\.|par exemple|illustration)\s*(?:\*\*)?\s*[:–-]/i, 'ex'],
  [/^(?:\*\*)?(?:[àa] retenir|important|l'essentiel|essentiel)\s*(?:\*\*)?\s*[:–-]/i, 'retenir'],
  [/^(?:\*\*)?(?:attention|pi[èe]ge|erreur fr[ée]quente|[àa] ne pas confondre|remarque importante)\s*(?:\*\*)?\s*[:!–-]/i, 'piege'],
  [/^(?:\*\*)?(?:m[ée]thode|[ée]tapes?|formule|calcul)\s*(?:\*\*)?\s*[:–-]/i, 'methode'],
];
/** [type, texte sans le mot d'introduction] si le paragraphe commence par « Définition : », « Exemple : »… */
const autoKind = (text) => {
  const hit = AUTO_CALLOUT.find(([re]) => re.test(text));
  return hit ? [hit[1], text.replace(hit[0], '').trim() || text] : null;
};
const calloutHtml = (kind, lines) => `<div class="callout c-${kind}"><span class="callout-tag">${CALLOUTS[kind]}</span>${lines.map((l) => (/^[-*•]\s+/.test(l) ? `<p class="c-li">${fmt(l.replace(/^[-*•]\s+/, ''))}</p>` : `<p>${fmt(l)}</p>`)).join('')}</div>`;

/** Identifiant stable d'un titre (sommaire du cours). */
export function slug(text = '') {
  return 'h-' + text.replace(/==|\*\*|\*|`|@@|\^\^|\{\+|\+\}/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}
function headingId(text, ids) {
  const base = slug(text);
  const n = ids.get(base) || 0;
  ids.set(base, n + 1);
  return n ? `${base}-${n + 1}` : base;
}

/** Titres "##" d'un texte Markdown, avec les mêmes identifiants que le rendu. */
export function headings(md = '', depth = 1) {
  const ids = new Map();
  const out = [];
  md.replace(/\r/g, '').split('\n').forEach((line) => {
    const m = line.trimEnd().match(/^(#{1,4})\s+(.*)$/);
    if (!m) return;
    const id = headingId(m[2], ids);
    if (m[1].length <= depth + 1) out.push({ level: m[1].length, text: m[2].replace(/==|\*\*|\*|`|@@|\^\^|\{\+\s?|\s?\+\}/g, ''), id });
  });
  return out;
}

export function renderMarkdown(md = '') {
  const ids = new Map();
  const lines = md.replace(/\r/g, '').split('\n');
  const out = [];
  let list = null; // 'ul' | 'ol'
  let para = [];
  const flushPara = () => {
    if (!para.length) return;
    const t = para.join(' ');
    const flat = flatTable(t);
    const auto = !flat && autoKind(t);
    out.push(flat || (auto ? calloutHtml(auto[0], [auto[1]]) : `<p>${fmt(t)}</p>`));
    para = [];
  };
  let tbl = null; // lignes « | … | » en cours
  const flushTbl = () => { if (tbl) { out.push(tableHtml(tbl)); tbl = null; } };
  let box = null; // encadré en cours : { kind, lines }
  const flushBox = () => { if (box) { out.push(calloutHtml(box.kind, box.lines)); box = null; } };
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  // Lignes « >+ » consécutives : un encadré « Complété par l'IA » (partie manquante, réponse à une question…)
  let ai = null;
  const flushAi = () => {
    if (!ai) return;
    const body = ai.map((l) => (/^[-*•]\s+/.test(l) ? `<p class="ai-li">• ${fmt(l.replace(/^[-*•]\s+/, ''))}</p>` : `<p>${fmt(l)}</p>`)).join('');
    out.push(`<div class="ai-block"><span class="ai-tag">Complété par l’IA</span>${body}</div>`);
    ai = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    let m;
    if (/^\s*\|.*\|\s*$/.test(line)) {
      flushPara(); closeList(); flushAi(); flushBox();
      (tbl ||= []).push(cells(line));
      continue;
    }
    flushTbl();
    if ((m = line.match(/^>\[(def|ex|retenir|piege|methode)\]\s?(.*)$/i))) {
      flushPara(); closeList(); flushAi();
      const kind = m[1].toLowerCase();
      if (box && box.kind !== kind) flushBox();
      if (!box) box = { kind, lines: [] };
      if (m[2].trim()) box.lines.push(m[2].trim());
      continue;
    }
    flushBox();
    if ((m = line.match(/^>\+\s?(.*)$/))) {
      flushPara(); closeList();
      if (!ai) ai = [];
      if (m[1].trim()) ai.push(m[1].trim());
      continue;
    }
    flushAi();
    if (!line.trim()) { flushPara(); closeList(); continue; }
    if ((m = line.match(/^(#{1,4})\s+(.*)$/))) {
      flushPara(); closeList();
      const level = Math.min(m[1].length + 1, 5); // # -> h2 (le h1 est le titre du cours)
      const cls = /^(?:\W*)(?:[àa] retenir|l'essentiel|conclusion|pi[èe]ges)/i.test(m[2]) ? ' class="h-key"' : '';
      out.push(`<h${level} id="${headingId(m[2], ids)}"${cls}>${fmt(m[2])}</h${level}>`);
    } else if ((m = line.match(/^\s*[-*•]\s+(.*)$/))) {
      flushPara();
      if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; }
      const nested = /^\s{2,}/.test(line) ? ' class="sub"' : '';
      out.push(`<li${nested}>${fmt(m[1])}</li>`);
    } else if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
      flushPara();
      if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; }
      out.push(`<li>${fmt(m[1])}</li>`);
    } else if ((m = line.match(/^>\s?(.*)$/))) {
      flushPara(); closeList();
      out.push(`<blockquote>${fmt(m[1])}</blockquote>`);
    } else if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      flushPara(); closeList(); out.push('<hr/>');
    } else {
      closeList();
      para.push(line.trim());
    }
  }
  flushTbl(); flushBox(); flushAi(); flushPara(); closeList();
  return out.join('\n');
}
