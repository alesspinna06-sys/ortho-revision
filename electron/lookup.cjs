// Recherche de définitions sur Wikipédia (en français, sans clé). Exécuté dans le processus principal.
const UA = 'OrthoRevision/1.0 (application de révision ; usage personnel)';

async function query(params) {
  const qs = new URLSearchParams({ action: 'query', format: 'json', origin: '*', ...params });
  const res = await fetch(`https://fr.wikipedia.org/w/api.php?${qs}`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(9000),
  });
  if (!res.ok) throw new Error(`Wikipédia a répondu ${res.status}.`);
  const data = await res.json();
  if (data.error) throw new Error(`Wikipédia : ${data.error.info || data.error.code}`);
  return Object.values((data.query && data.query.pages) || {});
}

const EXTRACT = { prop: 'extracts|info|pageprops', exintro: '1', explaintext: '1', exsentences: '4', inprop: 'url', ppprop: 'disambiguation' };
const clean = (s) => String(s || '').replace(/\s*\([^()]*\/[^()]*\)/g, '').replace(/\s+/g, ' ').trim();

function toResult(pg) {
  const extract = clean(pg.extract);
  if (pg.missing !== undefined || !extract || (pg.pageprops && pg.pageprops.disambiguation !== undefined)) return null;
  if (/peut (faire )?référence à|peut désigner|may refer to/i.test(extract.slice(0, 200))) return null;
  return { source: 'Wikipédia', title: pg.title, extract: extract.slice(0, 900), url: pg.fullurl || `https://fr.wikipedia.org/wiki/${encodeURIComponent(pg.title)}` };
}

/** Renvoie jusqu'à 3 extraits : d'abord la page au titre exact (redirections suivies), puis les meilleurs résultats de recherche. */
async function lookup(term) {
  const t = String(term || '').trim().slice(0, 80);
  if (!t) return { ok: true, results: [] };
  try {
    const variants = [...new Set([t, t.charAt(0).toUpperCase() + t.slice(1), t.toLowerCase()])];
    const out = [];
    const seen = new Set();
    const push = (r) => { if (r && !seen.has(r.title)) { seen.add(r.title); out.push(r); } };
    const exact = await query({ ...EXTRACT, titles: variants.join('|'), redirects: '1' });
    exact.forEach((pg) => push(toResult(pg)));
    if (out.length < 3) {
      const found = (await query({ ...EXTRACT, generator: 'search', gsrsearch: t, gsrlimit: '4', exlimit: '4' }))
        .sort((a, b) => (a.index || 99) - (b.index || 99));
      found.forEach((pg) => push(toResult(pg)));
    }
    return { ok: true, results: out.slice(0, 3) };
  } catch (err) {
    return { ok: false, error: err.message || String(err), results: [] };
  }
}

module.exports = { lookup };
