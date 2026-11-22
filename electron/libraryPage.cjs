// Page du téléphone : bibliothèque de cours, lecture (cours / synthèse) et podcasts.
// Le HTML des cours vient du logiciel (Markdown déjà échappé par markdown.js) ; tout le reste passe par textContent.
module.exports = function libraryPage({ token, appName, nonce }) {
  const T = JSON.stringify(token);
  const NAME = String(appName || 'Mes cours').replace(/[<>&"]/g, '');
  return `<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#5b5bd6">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="${NAME}">
<link rel="manifest" href="/manifest.json?t=${encodeURIComponent(token)}">
<title>${NAME}</title>
<style>
:root { color-scheme: light dark; --bg:#f6f6fb; --card:#fff; --text:#16161d; --muted:#6b6b7b; --line:rgba(20,20,40,.1); --accent:#5b5bd6; --chip:rgba(91,91,214,.1); --size:17px; }
@media (prefers-color-scheme: dark) { :root { --bg:#0f0f14; --card:#1a1a22; --text:#ececf3; --muted:#9a9aab; --line:rgba(255,255,255,.1); --accent:#8f8ff5; --chip:rgba(143,143,245,.15); } }
* { box-sizing: border-box; }
html, body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.5 -apple-system, "Segoe UI", Roboto, sans-serif; -webkit-text-size-adjust: 100%; }
header { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 10px; padding: calc(10px + env(safe-area-inset-top)) 14px 10px; background: color-mix(in srgb, var(--bg) 88%, transparent); backdrop-filter: blur(14px); border-bottom: 1px solid var(--line); }
header h1 { font-size: 18px; margin: 0; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
button, .btn { font: inherit; border: 1px solid var(--line); background: var(--card); color: var(--text); border-radius: 12px; padding: 8px 12px; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; }
button.on { background: var(--accent); color: #fff; border-color: transparent; }
main { padding: 12px 14px calc(30px + env(safe-area-inset-bottom)); max-width: 760px; margin: 0 auto; }
input[type=search] { width: 100%; font: inherit; padding: 11px 14px; border-radius: 14px; border: 1px solid var(--line); background: var(--card); color: var(--text); }
.chips { display: flex; gap: 8px; margin: 12px 0 4px; overflow-x: auto; }
.group { margin: 18px 0 8px; font-size: 13px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; display: flex; align-items: center; gap: 8px; }
.dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.item { display: block; width: 100%; text-align: left; background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 12px 14px; margin: 8px 0; }
.item b { display: block; font-size: 16px; }
.item small { color: var(--muted); }
.tag { display: inline-block; font-size: 12px; padding: 2px 8px; border-radius: 999px; background: var(--chip); color: var(--accent); margin-right: 6px; }
.empty, .err { text-align: center; color: var(--muted); padding: 40px 10px; }
.err { color: #d33; }
.tabs { display: flex; gap: 8px; margin: 4px 0 12px; }
.player { background: var(--card); border: 1px solid var(--line); border-radius: 18px; padding: 12px; margin-bottom: 14px; }
.player audio { width: 100%; }
.player .row { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
.prose { font-size: var(--size); line-height: 1.65; overflow-wrap: anywhere; }
.prose h1, .prose h2, .prose h3 { line-height: 1.25; margin: 1.3em 0 .5em; }
.prose h2 { font-size: 1.3em; } .prose h3 { font-size: 1.12em; }
.prose mark { background: color-mix(in srgb, var(--accent) 22%, transparent); color: inherit; border-radius: 4px; padding: 0 2px; }
.prose img { max-width: 100%; height: auto; border-radius: 12px; background: #fff; }
.prose figure { margin: 16px 0; } .prose figcaption { font-size: .85em; color: var(--muted); margin-top: 4px; }
.prose .callout { border-left: 4px solid var(--accent); background: var(--chip); padding: 8px 12px; border-radius: 10px; margin: 12px 0; }
.prose .t-who { font-weight: 650; color: var(--accent); } .prose .t-num { font-weight: 650; }
.prose .md-table { overflow-x: auto; } .prose table { border-collapse: collapse; font-size: .92em; } .prose td, .prose th { border: 1px solid var(--line); padding: 4px 8px; }
.prose a { color: var(--accent); }
.prose .ai-add, .prose .added { background: color-mix(in srgb, #8b5cf6 12%, transparent); }
.hidden { display: none !important; }
</style>
</head><body>
<header><button id="back" class="hidden" aria-label="Retour">‹</button><h1 id="title">${NAME}</h1><button id="smaller" class="hidden" aria-label="Texte plus petit">A−</button><button id="bigger" class="hidden" aria-label="Texte plus grand">A+</button></header>
<main id="main"><div class="empty">Chargement…</div></main>
<script nonce="${nonce}">
(function () {
  var T = ${T};
  var q = function (p) { return p + (p.indexOf('?') < 0 ? '?' : '&') + 't=' + encodeURIComponent(T); };
  var main = document.getElementById('main');
  var titleEl = document.getElementById('title');
  var back = document.getElementById('back');
  var smaller = document.getElementById('smaller'), bigger = document.getElementById('bigger');
  var lib = null, filter = 'all', search = '';
  var size = Number(localStorage.getItem('size')) || 17;
  document.documentElement.style.setProperty('--size', size + 'px');
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function fmtMin(s) { var m = Math.round((s || 0) / 60); return m < 1 ? 'moins d’une minute' : m + ' min'; }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, ''); }
  function getJSON(url) { return fetch(q(url)).then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || 'Erreur'); return d; }); }); }
  function fail(e) { main.textContent = ''; main.appendChild(el('div', 'err', (e && e.message) || 'Le logiciel ne répond pas. Vérifie qu’il est ouvert sur l’ordinateur.')); }
  function setSize(d) { size = Math.max(13, Math.min(28, size + d)); localStorage.setItem('size', size); document.documentElement.style.setProperty('--size', size + 'px'); }
  smaller.onclick = function () { setSize(-1); }; bigger.onclick = function () { setSize(1); };
  back.onclick = function () { location.hash = ''; };

  function renderList() {
    titleEl.textContent = lib.app || ${JSON.stringify(NAME)};
    back.classList.add('hidden'); smaller.classList.add('hidden'); bigger.classList.add('hidden');
    main.textContent = '';
    var s = el('input'); s.type = 'search'; s.placeholder = 'Chercher un cours…'; s.value = search;
    s.oninput = function () { search = s.value; draw(); };
    main.appendChild(s);
    var chips = el('div', 'chips');
    [['all', 'Tous les cours'], ['podcast', '🎧 Podcasts']].forEach(function (c) {
      var b = el('button', filter === c[0] ? 'on' : '', c[1]);
      b.onclick = function () { filter = c[0]; renderList(); };
      chips.appendChild(b);
    });
    main.appendChild(chips);
    var box = el('div'); main.appendChild(box);
    function draw() {
      box.textContent = '';
      var n = norm(search);
      var list = lib.courses.filter(function (c) { return (filter !== 'podcast' || c.podcast) && (!n || norm(c.title + ' ' + (c.subject || '')).indexOf(n) >= 0); });
      if (!list.length) { box.appendChild(el('div', 'empty', filter === 'podcast' ? 'Aucun podcast pour l’instant : crée-en un depuis un cours sur l’ordinateur.' : 'Aucun cours trouvé.')); return; }
      var folders = {}; (lib.folders || []).forEach(function (f) { folders[f.id] = f; });
      var groups = {};
      list.forEach(function (c) { var k = c.folderId && folders[c.folderId] ? c.folderId : (c.subject ? 'cat:' + c.subject : 'none'); (groups[k] = groups[k] || []).push(c); });
      Object.keys(groups).sort(function (a, b) { return (a === 'none') - (b === 'none'); }).forEach(function (k) {
        var f = folders[k];
        var g = el('div', 'group');
        if (f) { var d = el('span', 'dot'); d.style.background = f.color || '#888'; g.appendChild(d); }
        g.appendChild(document.createTextNode(f ? f.name : k === 'none' ? 'Sans dossier' : k.slice(4)));
        box.appendChild(g);
        groups[k].forEach(function (c) {
          var it = el('button', 'item');
          it.appendChild(el('b', '', c.title));
          var meta = el('small');
          if (c.podcast) meta.appendChild(el('span', 'tag', '🎧 ' + fmtMin(c.podcast.seconds)));
          if (c.hasSynthesis) meta.appendChild(el('span', 'tag', 'Synthèse'));
          meta.appendChild(document.createTextNode(c.minutes ? '≈ ' + c.minutes + ' min de lecture' : ''));
          it.appendChild(meta);
          it.onclick = function () { location.hash = 'c=' + encodeURIComponent(c.id); };
          box.appendChild(it);
        });
      });
    }
    draw();
  }

  function renderCourse(id) {
    main.textContent = ''; main.appendChild(el('div', 'empty', 'Chargement du cours…'));
    back.classList.remove('hidden'); smaller.classList.remove('hidden'); bigger.classList.remove('hidden');
    getJSON('/api/course?id=' + encodeURIComponent(id)).then(function (c) {
      titleEl.textContent = c.title;
      main.textContent = '';
      if (c.podcast) {
        var p = el('div', 'player');
        p.appendChild(el('b', '', '🎧 ' + (c.podcast.title || 'Podcast')));
        var a = el('audio'); a.controls = true; a.preload = 'metadata'; a.src = q('/podcast?id=' + encodeURIComponent(c.id) + '&v=' + (c.podcast.at || 0));
        var key = 'pos-' + c.id + '-' + (c.podcast.at || 0);
        a.addEventListener('loadedmetadata', function () { var t = Number(localStorage.getItem(key)); if (t > 5 && t < a.duration - 5) a.currentTime = t; });
        a.addEventListener('timeupdate', function () { localStorage.setItem(key, String(Math.floor(a.currentTime))); });
        p.appendChild(a);
        var row = el('div', 'row');
        [1, 1.25, 1.5].forEach(function (r) { var b = el('button', r === 1 ? 'on' : '', '× ' + String(r).replace('.', ',')); b.onclick = function () { a.playbackRate = r; [].forEach.call(row.querySelectorAll('button'), function (x) { x.classList.remove('on'); }); b.classList.add('on'); }; row.appendChild(b); });
        var dl = el('a', 'btn', '⬇ Télécharger le MP3'); dl.href = q('/podcast?id=' + encodeURIComponent(c.id) + '&dl=1&name=' + encodeURIComponent(c.title));
        row.appendChild(dl);
        p.appendChild(row);
        main.appendChild(p);
      }
      var view = c.synthesisHtml && sessionStorage.getItem('tab') === 'synthese' ? 'synthese' : 'cours';
      var tabs = el('div', 'tabs');
      var prose = el('div', 'prose');
      function show(v) {
        view = v; sessionStorage.setItem('tab', v);
        [].forEach.call(tabs.children, function (b) { b.classList.toggle('on', b.dataset.v === v); });
        prose.innerHTML = v === 'synthese' ? c.synthesisHtml : c.html; // HTML produit par le logiciel (texte échappé)
        window.scrollTo(0, 0);
      }
      if (c.synthesisHtml) {
        [['cours', 'Cours'], ['synthese', 'Synthèse']].forEach(function (t) { var b = el('button', '', t[1]); b.dataset.v = t[0]; b.onclick = function () { show(t[0]); }; tabs.appendChild(b); });
        main.appendChild(tabs);
      }
      main.appendChild(prose);
      show(view);
    }).catch(fail);
  }

  function route() {
    var m = /c=([^&]+)/.exec(location.hash);
    if (m) return renderCourse(decodeURIComponent(m[1]));
    if (lib) return renderList();
    getJSON('/api/library').then(function (d) { lib = d; renderList(); }).catch(fail);
  }
  window.addEventListener('hashchange', function () { if (!location.hash) lib = null; route(); });
  route();
})();
</script>
</body></html>`;
};
