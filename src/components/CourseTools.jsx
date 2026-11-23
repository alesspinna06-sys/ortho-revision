// Outils dans le cours : tableaux dynamiques (tri, graphique, transposition, valeurs cachées, copie),
// mode « Révision active » (mots clés cachés à retrouver) et galerie des images du fichier d'origine.
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon.jsx';
import { useDb, getMedia, updateCourse } from '../lib/db.js';
import { insertSchema } from '../lib/ai-extra.js';
import { headings } from '../lib/markdown.js';

// ---------------------------------------------------------------------------
// 1. Tableaux dynamiques
// ---------------------------------------------------------------------------
const toNum = (s) => {
  const t = String(s).replace(/\s| | /g, '').replace(/[%€$]/g, '').replace(/−/g, '-').replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(t) ? parseFloat(t) : null;
};
const COLORS = ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#0ea5e9', '#a855f7'];
const svgEl = (tag, attrs = {}, text) => {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  if (text != null) el.textContent = text;
  return el;
};

/** Lit un tableau affiché : { head: [..] | null, rows: [[..]], rowLabels: bool } */
function readTable(table) {
  const head = table.tHead ? [...table.tHead.rows[0].cells].map((c) => c.textContent.trim()) : null;
  const rows = [...table.tBodies[0].rows].map((r) => [...r.cells].map((c) => c.textContent.trim()));
  return { head, rows, rowLabels: !head && rows.every((r) => r[0] && toNum(r[0]) == null) };
}

/** Données d'un graphique : x (nombres ou libellés) et séries numériques. */
function chartData({ head, rows, rowLabels }) {
  if (rowLabels) {
    // Une série par ligne ; si la 1re ligne est numérique, elle sert d'axe des abscisses
    const vals = rows.map((r) => r.slice(1).map(toNum));
    const firstNumeric = vals[0].every((v) => v != null);
    if (firstNumeric && rows.length >= 2) return { xLabel: rows[0][0], x: vals[0], series: rows.slice(1).map((r, i) => ({ name: r[0], ys: vals[i + 1] })) };
    return { xLabel: '', x: rows[0].slice(1).map((_, i) => String(i + 1)), series: rows.map((r, i) => ({ name: r[0], ys: vals[i] })) };
  }
  const all = head ? [head, ...rows] : rows;
  const h = head || all[0].map((_, i) => `Colonne ${i + 1}`);
  const body = head ? rows : rows;
  const xs = body.map((r) => r[0]);
  const xNum = xs.every((v) => toNum(v) != null);
  const series = h.slice(1).map((name, j) => ({ name, ys: body.map((r) => toNum(r[j + 1])) })).filter((s) => s.ys.filter((v) => v != null).length >= 2);
  return { xLabel: h[0], x: xNum ? xs.map(toNum) : xs, series };
}

function drawChart(data) {
  const W = 680; const H = 320; const P = { l: 58, r: 18, t: 20, b: 50 };
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'tbl-chart', role: 'img', 'aria-label': 'Graphique du tableau' });
  const ys = data.series.flatMap((s) => s.ys).filter((v) => v != null);
  if (!ys.length) return null;
  const numericX = data.x.every((v) => typeof v === 'number');
  const yMin = Math.min(0, ...ys); const yMax = Math.max(...ys) || 1;
  const xMin = numericX ? Math.min(...data.x) : 0; const xMax = numericX ? Math.max(...data.x) : data.x.length - 1;
  const X = (v, i) => P.l + (W - P.l - P.r) * ((numericX ? v : i) - xMin) / ((xMax - xMin) || 1);
  const Y = (v) => H - P.b - (H - P.t - P.b) * (v - yMin) / ((yMax - yMin) || 1);
  for (let k = 0; k <= 4; k++) {
    const v = yMin + (yMax - yMin) * k / 4;
    svg.append(svgEl('line', { x1: P.l, x2: W - P.r, y1: Y(v), y2: Y(v), class: 'grid' }));
    svg.append(svgEl('text', { x: P.l - 8, y: Y(v) + 4, 'text-anchor': 'end', class: 'ax' }, Number(v.toFixed(2)).toLocaleString('fr-FR')));
  }
  data.x.forEach((v, i) => svg.append(svgEl('text', { x: X(v, i), y: H - P.b + 18, 'text-anchor': 'middle', class: 'ax' }, typeof v === 'number' ? v.toLocaleString('fr-FR') : String(v).slice(0, 12))));
  if (data.xLabel) svg.append(svgEl('text', { x: (W + P.l) / 2, y: H - 8, 'text-anchor': 'middle', class: 'ax-t' }, data.xLabel));
  const bars = !numericX && data.series.length <= 3;
  data.series.forEach((s, si) => {
    const color = COLORS[si % COLORS.length];
    if (bars) {
      const slot = (W - P.l - P.r) / Math.max(1, data.x.length); const bw = Math.min(36, slot / (data.series.length + 1));
      s.ys.forEach((v, i) => { if (v == null) return; const x = P.l + slot * i + slot / 2 - (bw * data.series.length) / 2 + bw * si; svg.append(svgEl('rect', { x, y: Y(Math.max(0, v)), width: bw - 3, height: Math.abs(Y(v) - Y(0)), rx: 4, fill: color })); });
    } else {
      const pts = s.ys.map((v, i) => (v == null ? null : [X(data.x[i], i), Y(v)])).filter(Boolean);
      svg.append(svgEl('polyline', { points: pts.map((p) => p.join(',')).join(' '), fill: 'none', stroke: color, 'stroke-width': 3, 'stroke-linejoin': 'round' }));
      pts.forEach(([x, y]) => svg.append(svgEl('circle', { cx: x, cy: y, r: 4.5, fill: color })));
    }
    svg.append(svgEl('rect', { x: P.l + 8 + si * 200, y: 4, width: 12, height: 12, rx: 3, fill: color }));
    svg.append(svgEl('text', { x: P.l + 26 + si * 200, y: 14, class: 'lg' }, String(s.name).slice(0, 28)));
  });
  // Deux courbes qui se croisent (offre / demande…) : point de rencontre signalé
  if (numericX && data.series.length === 2) {
    const [a, b] = data.series;
    for (let i = 0; i < data.x.length - 1; i++) {
      const d1 = a.ys[i] - b.ys[i]; const d2 = a.ys[i + 1] - b.ys[i + 1];
      if ([d1, d2].some((v) => Number.isNaN(v))) continue;
      if (d1 === 0 || d1 * d2 < 0) {
        const t = d1 === 0 ? 0 : d1 / (d1 - d2);
        const xv = data.x[i] + (data.x[i + 1] - data.x[i]) * t; const yv = a.ys[i] + (a.ys[i + 1] - a.ys[i]) * t;
        svg.append(svgEl('circle', { cx: X(xv, i), cy: Y(yv), r: 7, class: 'eq' }));
        svg.append(svgEl('text', { x: X(xv, i) + 10, y: Y(yv) - 10, class: 'eq-t' }, `Rencontre ≈ (${Number(xv.toFixed(2)).toLocaleString('fr-FR')} ; ${Math.round(yv).toLocaleString('fr-FR')})`));
        break;
      }
    }
  }
  return svg;
}

function enhanceTable(box) {
  if (box.querySelector('.tbl-tools')) return;
  const table = box.querySelector('table');
  if (!table) return;
  const original = table.innerHTML;
  const tools = document.createElement('div');
  tools.className = 'tbl-tools no-print';
  const btn = (label, title, fn) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'tbl-btn'; b.textContent = label; b.title = title;
    b.addEventListener('click', (e) => { e.preventDefault(); fn(b); });
    tools.append(b);
    return b;
  };
  const data = chartData(readTable(table));
  if (data.series.length) {
    btn('📈 Graphique', 'Voir ce tableau en graphique', (b) => {
      const old = box.querySelector('.tbl-chart-wrap');
      if (old) { old.remove(); b.classList.remove('on'); return; }
      const svg = drawChart(chartData(readTable(table)));
      if (!svg) return;
      const wrap = document.createElement('div'); wrap.className = 'tbl-chart-wrap'; wrap.append(svg);
      box.append(wrap); b.classList.add('on');
    });
  }
  btn('⇄ Pivoter', 'Échanger lignes et colonnes', (b) => {
    if (b.classList.toggle('on')) {
      const { head, rows } = readTable(table);
      const m = head ? [head, ...rows] : rows;
      const t = m[0].map((_, j) => m.map((r) => r[j] ?? ''));
      table.innerHTML = '';
      const tb = table.createTBody();
      t.forEach((r) => { const tr = tb.insertRow(); r.forEach((c, j) => { const cell = document.createElement(j === 0 ? 'th' : 'td'); cell.textContent = c; if (j && toNum(c) != null) cell.className = 'n'; tr.append(cell); }); });
    } else table.innerHTML = original;
  });
  btn('🙈 Cacher les valeurs', 'Révision : les valeurs sont cachées, clique sur une case pour la voir', (b) => {
    const on = b.classList.toggle('on');
    table.querySelectorAll('td').forEach((td) => { td.classList.toggle('tbl-hide', on); td.classList.remove('tbl-shown'); });
    b.textContent = on ? '👁 Tout montrer' : '🙈 Cacher les valeurs';
  });
  btn('⧉ Copier', 'Copier le tableau (à coller dans Excel ou Word)', async (b) => {
    const { head, rows } = readTable(table);
    const tsv = (head ? [head, ...rows] : rows).map((r) => r.join('\t')).join('\n');
    try { await navigator.clipboard.writeText(tsv); b.textContent = '✓ Copié'; } catch { b.textContent = 'Copie impossible'; }
    setTimeout(() => { b.textContent = '⧉ Copier'; }, 1600);
  });
  box.prepend(tools);
  // Tri : clic sur un en-tête de colonne
  table.tHead?.querySelectorAll('th').forEach((th, j) => {
    th.classList.add('tbl-sort'); th.title = 'Trier selon cette colonne';
    th.addEventListener('click', () => {
      const asc = th.dataset.sort !== 'asc';
      table.tHead.querySelectorAll('th').forEach((x) => delete x.dataset.sort);
      th.dataset.sort = asc ? 'asc' : 'desc';
      const rows = [...table.tBodies[0].rows];
      rows.sort((a, b) => {
        const x = a.cells[j]?.textContent.trim() || ''; const y = b.cells[j]?.textContent.trim() || '';
        const nx = toNum(x); const ny = toNum(y);
        const c = nx != null && ny != null ? nx - ny : x.localeCompare(y, 'fr', { numeric: true });
        return asc ? c : -c;
      });
      rows.forEach((r) => table.tBodies[0].append(r));
    });
  });
  // Valeur cachée : un clic la montre ; survol = colonne en surbrillance
  table.addEventListener('click', (e) => { const td = e.target.closest('td.tbl-hide'); if (td) td.classList.toggle('tbl-shown'); });
  table.addEventListener('mouseover', (e) => {
    const c = e.target.closest('td, th'); if (!c) return;
    const j = c.cellIndex;
    table.querySelectorAll('.col-hl').forEach((x) => x.classList.remove('col-hl'));
    [...table.rows].forEach((r) => r.cells[j]?.classList.add('col-hl'));
  });
  table.addEventListener('mouseleave', () => table.querySelectorAll('.col-hl').forEach((x) => x.classList.remove('col-hl')));
}

export function useTableTools(rootRef, deps) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.querySelectorAll('.md-table').forEach(enhanceTable);
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}

// ---------------------------------------------------------------------------
// 2. Révision active : mots clés, gras, dates et auteurs cachés, à retrouver
// ---------------------------------------------------------------------------
const CLOZE = '.prose :is(mark, strong, .t-num, .t-who)';
export function useCloze(rootRef, on, deps) {
  const [count, setCount] = useState({ total: 0, shown: 0 });
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const update = () => setCount({ total: root.querySelectorAll(CLOZE).length, shown: root.querySelectorAll('.cz-shown').length });
    root.classList.toggle('cloze-on', on);
    if (!on) { root.querySelectorAll('.cz-shown').forEach((x) => x.classList.remove('cz-shown')); return undefined; }
    update();
    // Clic sur un mot caché : on le montre (et la bulle de définition ne s'ouvre pas encore)
    const onClick = (e) => {
      const el = e.target.closest?.(':is(mark, strong, .t-num, .t-who)');
      if (!el || !el.closest('.prose') || el.classList.contains('cz-shown')) return;
      e.preventDefault(); e.stopPropagation();
      el.classList.add('cz-shown');
      update();
    };
    // Pas de focus (donc pas de bulle de définition) sur un mot encore caché
    const onDown = (e) => {
      const el = e.target.closest?.(':is(mark, strong, .t-num, .t-who)');
      if (el && el.closest('.prose') && !el.classList.contains('cz-shown')) e.preventDefault();
    };
    root.addEventListener('mousedown', onDown, true);
    root.addEventListener('click', onClick, true);
    return () => { root.removeEventListener('click', onClick, true); root.removeEventListener('mousedown', onDown, true); };
  }, [on, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  const revealAll = () => { rootRef.current?.querySelectorAll(CLOZE).forEach((x) => x.classList.add('cz-shown')); setCount((c) => ({ ...c, shown: c.total })); };
  const reset = () => { rootRef.current?.querySelectorAll('.cz-shown').forEach((x) => x.classList.remove('cz-shown')); setCount((c) => ({ ...c, shown: 0 })); };
  return { ...count, revealAll, reset };
}

export function ClozeBar({ total, shown, revealAll, reset, onClose }) {
  return createPortal(
    <div className="cloze-bar no-print" role="status">
      <span className="cloze-ico">🧠</span>
      <span><b>Révision active</b> · clique sur les cases pour retrouver les mots · <b>{shown}</b>/{total}</span>
      <div className="progress" style={{ width: 120 }}><i style={{ transform: `scaleX(${total ? shown / total : 0})` }} /></div>
      <button className="btn sm ghost" onClick={revealAll}>Tout montrer</button>
      <button className="btn sm ghost" onClick={reset}>Recommencer</button>
      <button className="btn icon sm ghost" onClick={onClose} aria-label="Quitter la révision active"><Icon name="x" size={13} /></button>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// 3. Galerie : toutes les images du fichier d'origine, à placer dans le cours
// ---------------------------------------------------------------------------
export function CourseGallery({ course, onClose, toast }) {
  const media = useDb(() => getMedia(course.id), [course.id]);
  const sections = useMemo(() => headings(course.summary || '', 2).filter((h) => h.level <= 3).map((h) => h.text), [course.summary]);
  const [zoom, setZoom] = useState(null);
  const [target, setTarget] = useState({});
  const images = (media || []).filter((m) => /^image\//.test(m.mimeType || ''));
  const url = (m) => `data:${m.mimeType};base64,${m.data}`;
  const key = (u) => `${u.length}:${u.slice(Math.floor(u.length / 2), Math.floor(u.length / 2) + 80)}`;
  const placed = new Set((course.diagrams || []).filter((d) => d.image).map((d) => key(d.image)));
  const place = async (m, i) => {
    const section = target[m.id] ?? sections[0] ?? '';
    const ids = (course.diagrams || []).map((d) => Number(d.id) || 0);
    const id = Math.max(500, ...ids) + 1;
    const title = m.name && !/^Image \d+$/.test(m.name) ? m.name : `Image ${i + 1} du cours`;
    await updateCourse(course.id, {
      diagrams: [...(course.diagrams || []), { id, title, section, image: url(m), source: 'cours', credit: 'Document du cours d’origine' }],
      summary: insertSchema(course.summary || '', section, id, title),
    });
    toast?.({ type: 'success', text: `Image placée dans « ${section || 'le cours'} »` });
  };
  return createPortal(
    <div className="overlay" onClick={onClose}>
      <div className="modal gallery-modal" onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <span className="chip accent"><Icon name="image" size={12} /> Images du fichier d'origine</span>
          <button className="btn icon sm ghost" onClick={onClose} aria-label="Fermer"><Icon name="x" /></button>
        </div>
        {!media ? null : !images.length ? (
          <p className="small muted" style={{ marginTop: 14 }}>Aucune image enregistrée pour ce cours. Clique sur « Ajouter le fichier d’origine » et choisis le PowerPoint, le Word ou le PDF du cours.</p>
        ) : (
          <>
            <p className="small muted" style={{ margin: '12px 0' }}>{images.length} image{images.length > 1 ? 's' : ''}. Celles qui ne sont pas encore dans le cours peuvent y être placées, dans la partie de ton choix.</p>
            <div className="gallery-grid">
              {images.map((m, i) => {
                const isIn = placed.has(key(url(m)));
                return (
                  <div key={m.id} className={`gallery-item ${isIn ? 'in' : ''}`}>
                    <button className="gallery-thumb" onClick={() => setZoom(url(m))} title="Agrandir"><img src={url(m)} alt={m.name || `Image ${i + 1}`} loading="lazy" /></button>
                    <div className="gallery-meta">
                      {isIn ? <span className="chip success"><Icon name="check" size={11} /> Dans le cours</span> : (
                        <>
                          <select className="select sm-select" value={target[m.id] ?? sections[0] ?? ''} onChange={(e) => setTarget((t) => ({ ...t, [m.id]: e.target.value }))} aria-label="Partie du cours">
                            {sections.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                          <button className="btn sm accent" onClick={() => place(m, i)}>Placer</button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
        {zoom && <div className="gallery-zoom" onClick={() => setZoom(null)}><img src={zoom} alt="" /></div>}
      </div>
    </div>,
    document.body,
  );
}

/** Temps de lecture (200 mots/min) du cours et de chaque partie (id du titre → minutes). */
export function readingTimes(md = '') {
  const hs = headings(md, 3);
  const per = {};
  let cur = '';
  let k = 0;
  let total = 0;
  md.split('\n').forEach((line) => {
    if (/^#{1,4}\s/.test(line)) { cur = hs[k]?.id || ''; k++; return; }
    const w = (line.replace(/\[\[schema:\d+\]\]/g, '').match(/[\p{L}\p{N}]+/gu) || []).length;
    total += w;
    if (cur) per[cur] = (per[cur] || 0) + w;
  });
  Object.keys(per).forEach((id) => { per[id] = Math.max(1, Math.round(per[id] / 200)); });
  return { total: Math.max(1, Math.round(total / 200)), per };
}
