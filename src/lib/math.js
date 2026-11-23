// Mini-moteur de formules (sous-ensemble de LaTeX, sans dépendance) : $…$, $$…$$, \(…\), \[…\].
// Gère \frac, \sqrt, ^, _, \text, \times, \leq, lettres grecques, \left( \right)… Le texte est
// échappé : aucun HTML venant de l'IA n'est injecté.
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const SYM = {
  times: '×', cdot: '·', div: '÷', pm: '±', mp: '∓', ast: '∗', star: '⋆',
  leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠', approx: '≈', simeq: '≃', sim: '∼', equiv: '≡', propto: '∝',
  infty: '∞', to: '→', rightarrow: '→', leftarrow: '←', longrightarrow: '⟶', Rightarrow: '⇒', Leftarrow: '⇐', Leftrightarrow: '⇔',
  implies: '⇒', iff: '⇔', uparrow: '↑', downarrow: '↓', nearrow: '↗', searrow: '↘',
  in: '∈', notin: '∉', ni: '∋', subset: '⊂', subseteq: '⊆', supset: '⊃', cup: '∪', cap: '∩', emptyset: '∅', varnothing: '∅',
  forall: '∀', exists: '∃', neg: '¬', land: '∧', lor: '∨', sum: '∑', prod: '∏', int: '∫', partial: '∂', nabla: '∇',
  ldots: '…', cdots: '⋯', dots: '…', vdots: '⋮', degree: '°', circ: '∘', prime: '′', angle: '∠', perp: '⊥', parallel: '∥',
  percent: '%', lbrace: '{', rbrace: '}', langle: '⟨', rangle: '⟩', vert: '|', mid: '|', lvert: '|', rvert: '|', backslash: '\\',
  quad: ' ', qquad: '  ', euro: '€',
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ',
  iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ',
  phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  log: 'log', ln: 'ln', exp: 'exp', sin: 'sin', cos: 'cos', tan: 'tan', max: 'max', min: 'min', lim: 'lim',
};
const PUNCT = { ',': ' ', ';': ' ', ':': ' ', ' ': ' ', '!': '', '%': '%', '$': '$', '&': '&amp;', '#': '#', '_': '_', '{': '{', '}': '}', '|': '‖' };
const TEXT_CMDS = new Set(['text', 'textrm', 'mathrm', 'textit', 'mathit', 'operatorname', 'textnormal', 'mbox', 'textsf', 'mathsf']);
const BOLD_CMDS = new Set(['mathbf', 'textbf', 'boldsymbol', 'bm']);
const SKIP_CMDS = new Set(['displaystyle', 'textstyle', 'scriptstyle', 'limits', 'nolimits', 'big', 'Big', 'bigg', 'Bigg', 'bigl', 'bigr', 'Bigl', 'Bigr', 'biggl', 'biggr', 'middle']);

function render(tex) {
  let i = 0;
  const n = tex.length;
  const readCmd = () => {
    let name = '';
    if (!/[a-zA-Z]/.test(tex[i] || '')) { name = tex[i] || ''; i++; return name; }
    while (i < n && /[a-zA-Z]/.test(tex[i])) name += tex[i++];
    return name;
  };
  const skipSpaces = () => { while (i < n && tex[i] === ' ') i++; };
  // Contenu brut d'un groupe { … } (pour \text)
  const rawGroup = () => {
    skipSpaces();
    if (tex[i] !== '{') { const c = tex[i] || ''; i++; return c; }
    let depth = 0; let out = '';
    for (; i < n; i++) {
      const c = tex[i];
      if (c === '{') { if (depth++ === 0) continue; }
      if (c === '}') { if (--depth === 0) { i++; break; } }
      out += c;
    }
    return out.replace(/\\([{}%$&#_ ])/g, '$1').replace(/\\,|\\;|\\ /g, ' ');
  };
  // Un « atome » : groupe, commande ou caractère
  const atom = () => {
    skipSpaces();
    if (i >= n) return '';
    const c = tex[i];
    if (c === '{') { i++; return seq('}'); }
    if (c === '\\') { i++; return command(readCmd()); }
    i++;
    if (/[a-zA-Z]/.test(c)) return `<i>${c}</i>`;
    if (c === '-') return '−';
    if (c === '*') return '∗';
    if (c === '~') return ' ';
    if (c === '\'') return '′';
    return esc(c);
  };
  const command = (name) => {
    if (name === 'frac' || name === 'dfrac' || name === 'tfrac' || name === 'cfrac') {
      const a = atom(); const b = atom();
      return `<span class="mx-frac"><span class="mx-num">${a}</span><span class="mx-den">${b}</span></span>`;
    }
    if (name === 'sqrt') {
      skipSpaces();
      let idx = '';
      if (tex[i] === '[') { i++; let k = ''; while (i < n && tex[i] !== ']') k += tex[i++]; i++; idx = `<sup class="mx-root">${esc(k)}</sup>`; }
      return `<span class="mx-sqrt">${idx}√<span class="mx-rad">${atom()}</span></span>`;
    }
    if (TEXT_CMDS.has(name)) return `<span class="mx-text">${esc(rawGroup())}</span>`;
    if (BOLD_CMDS.has(name)) return `<b>${atom()}</b>`;
    if (name === 'overline' || name === 'bar') return `<span class="mx-ov">${atom()}</span>`;
    if (name === 'underline') return `<u>${atom()}</u>`;
    if (name === 'hat' || name === 'widehat') return `${atom()}̂`;
    if (name === 'tilde' || name === 'widetilde') return `${atom()}̃`;
    if (name === 'vec' || name === 'overrightarrow') return `${atom()}⃗`;
    if (name === 'dot') return `${atom()}̇`;
    if (name === 'left' || name === 'right') {
      skipSpaces();
      if (tex[i] === '\\') { i++; const d = readCmd(); return SYM[d] || PUNCT[d] || ''; }
      const d = tex[i++] || '';
      return d === '.' ? '' : esc(d);
    }
    if (name === 'begin' || name === 'end') { rawGroup(); return ''; }
    if (name === '\\') return '<br>';
    if (SKIP_CMDS.has(name)) return '';
    if (name in PUNCT) return PUNCT[name];
    if (name in SYM) return /^[a-z]{2,}$/.test(SYM[name]) ? `<span class="mx-text">${SYM[name]}</span>` : SYM[name];
    return esc(name);
  };
  // Suite d'atomes, avec exposants et indices
  const seq = (stop) => {
    let out = '';
    while (i < n) {
      if (stop && tex[i] === stop) { i++; return out; }
      const c = tex[i];
      if (c === '^' || c === '_') {
        i++;
        const tag = c === '^' ? 'sup' : 'sub';
        out += `<${tag}>${atom()}</${tag}>`;
        continue;
      }
      if (c === '&') { i++; out += ' '; continue; }
      if (c === ' ') { i++; if (!out.endsWith(' ')) out += ' '; continue; }
      out += atom();
    }
    return out;
  };
  return seq(null).replace(/<\/i><i>/g, '');
}

/** HTML d'une formule ; `display` = formule centrée sur sa ligne. */
export function renderTex(tex, display = false) {
  const clean = String(tex).replace(/\^\^|@@|==/g, '').trim();
  let html;
  try { html = render(clean); } catch { html = esc(clean); }
  return display ? `<span class="mx mx-display">${html}</span>` : `<span class="mx">${html}</span>`;
}

// $…$ n'est une formule que si son contenu y ressemble (sinon « 5 $ et 10 $ » resterait intact)
const looksMath = (s) => /\\[a-zA-Z]|[\^_{}=]/.test(s) || /^\s*[A-Za-z][A-Za-z0-9']{0,2}\s*$/.test(s) || /^[\d\s.,+\-*/()×%]+$/.test(s) && /[+\-*/×]/.test(s);
const MATH_RE = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$([^$\n]+?)\$/g;

/** Découpe un texte en morceaux { text } et { tex, display }. */
export function splitMath(s) {
  if (!/[$\\]/.test(s)) return [{ text: s }];
  const out = [];
  let last = 0;
  let m;
  MATH_RE.lastIndex = 0;
  while ((m = MATH_RE.exec(s))) {
    const tex = m[1] ?? m[2] ?? m[3] ?? m[4];
    const display = m[1] != null || m[2] != null;
    if (m[4] != null && !looksMath(tex)) continue;
    if (m.index > last) out.push({ text: s.slice(last, m.index) });
    out.push({ tex, display });
    last = MATH_RE.lastIndex;
  }
  if (last < s.length) out.push({ text: s.slice(last) });
  return out;
}

/** Version parlée ou texte brut d'une formule (lecture à voix haute, recherche). */
export function texToSpeech(s) {
  return s.replace(MATH_RE, (all, a, b, c, d) => {
    const tex = a ?? b ?? c ?? d;
    if (d != null && !looksMath(tex)) return all;
    return tex
      .replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '$1 sur $2')
      .replace(/\\text\w*\s*\{([^{}]*)\}/g, '$1')
      .replace(/\\times/g, ' fois ').replace(/\\cdot/g, ' fois ').replace(/\\div/g, ' divisé par ')
      .replace(/\\leq?/g, ' inférieur ou égal à ').replace(/\\geq?/g, ' supérieur ou égal à ').replace(/\\neq/g, ' différent de ')
      .replace(/\\sqrt\s*\{([^{}]*)\}/g, 'racine de $1').replace(/\^\{?2\}?/g, ' au carré').replace(/\\%/g, ' pour cent')
      .replace(/\\[a-zA-Z]+/g, ' ').replace(/[{}$]/g, '').replace(/\s+/g, ' ').trim();
  });
}
