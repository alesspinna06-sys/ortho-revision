// Pont vers Claude (claude.ai) : demandes prêtes à coller, et lecture des réponses copiées.
import { sectionExcerpt } from './ai-extra.js';
import { sanitizeSvg } from './ai.js';
import { DOMAIN } from './domain.js';

const plainCourse = (md = '') => md.replace(/\[\[schema:\d+\]\]/g, '').trim();

// Direction artistique du logiciel (design « Liquid Glass » : cartes claires, coins très arrondis,
// dégradés indigo → violet, ombres douces). Claude repart de zéro avec ce guide, au lieu de
// retoucher le schéma de Gemini (sinon les deux se ressemblent trop).
export const CLAUDE_SVG_DESIGN = `DIRECTION ARTISTIQUE (celle du logiciel : moderne, épurée, « verre dépoli », type app iOS / Linear / Notion) :
- Toile : viewBox="0 0 1200 800", fond = un <rect> plein cadre rx="32" rempli d'un dégradé très doux (#f8f9ff → #f4f1ff), rien d'autre derrière.
- Cartes : <rect> blancs (#ffffff), rx 20 à 24, bordure 1 px #e6e8f2, ombre douce via un filtre <feDropShadow dx="0" dy="8" stdDeviation="14" flood-color="#4f46e5" flood-opacity="0.10"/>. Beaucoup d'espace : marges extérieures ≥ 56 px, 28 px minimum entre deux cartes, padding intérieur ≥ 22 px.
- Couleurs : accent principal = dégradé indigo → violet (#4f46e5 → #8b5cf6) ; couleurs de catégories : indigo #4f46e5, violet #8b5cf6, rose #ec4899, turquoise #14b8a6, ambre #f59e0b, bleu #0ea5e9. Une catégorie = une couleur, utilisée en pastille, en bande latérale de 6 px à gauche de la carte, ou en fond très pâle (même teinte à 8-10 % d'opacité). Jamais plus de 4 couleurs dans un schéma.
- Typographie : font-family="Inter, 'Segoe UI', system-ui, -apple-system, Helvetica, Arial, sans-serif". Titre 34 px, poids 800, couleur #1e1b4b, avec un sous-titre de 16 px #6b7280 dessous. Titres de cartes 19-21 px poids 700 #1e1b4b ; texte 15-16 px #475569, interligne 1,4 ; petites étiquettes en MAJUSCULES 12 px, letter-spacing 1.5, couleur de la catégorie.
- Éléments modernes : pastilles numérotées (cercle r=18 en dégradé, chiffre blanc 15 px gras), puces « pill » (rect rx = hauteur/2), petites icônes dessinées en traits simples (stroke 2, stroke-linecap round) dans un carré arrondi coloré pâle, séparateurs fins #eef0f6.
- Flèches : traits de 2,5 px, extrémités arrondies, courbes de Bézier douces (pas d'angles brusques), pointe définie par un <marker> fin ; couleur #a5b4fc ou couleur de la catégorie ; étiquette de flèche dans une petite pill blanche.
- Composition : choisis la forme qui explique le mieux le contenu (flux en étapes, frise, cycle, carte mentale radiale, comparaison en colonnes, matrice 2×2, pyramide, entonnoir, arbre). Alignements sur une grille, symétrie, une lecture évidente de gauche à droite ou de haut en bas. Un encadré « À retenir » en bas (fond dégradé indigo→violet, texte blanc) si utile.
- Texte : chaque ligne tient dans sa carte (largeur estimée = nombre de caractères × 0,55 × taille de police) ; au-delà, découpe en plusieurs <tspan x=… dy="1.4em">. Rien ne déborde, ne se chevauche, ne sort de la toile.
- Interdit (le logiciel le refuse) : <script>, <foreignObject>, <image>, <style> avec @import, polices externes, liens, attributs on…, emoji. Autorisés : <defs>, <linearGradient>, <radialGradient>, <filter> (feDropShadow, feGaussianBlur), <marker>, <clipPath>, <g>, <path>, <rect>, <circle>, <ellipse>, <line>, <polyline>, <polygon>, <text>, <tspan>.`;

/** Demande : redessiner un schéma. */
export function schemaPrompt(course, d) {
  return `Bonjour Claude ! Je révise avec un logiciel qui génère des schémas avec une autre IA. Ils sont justes mais pas assez beaux. Crée-moi une version magnifique, moderne et propre de ce schéma, dans la direction artistique du logiciel décrite plus bas.

Cours : « ${course.title} »${course.subject ? ` (${course.subject})` : ''}, pour ${DOMAIN.audience}.
Schéma : « ${d.title || 'sans titre'} »${d.caption ? ` — ${d.caption}` : ''}.

Extrait du cours (le schéma doit être fidèle à ce contenu, sans rien inventer) :
"""
${sectionExcerpt(course, d.section || d.title, 6000)}
"""
${d.svg ? `
Schéma actuel (SVG) — à utiliser UNIQUEMENT pour son contenu (notions, liens, étapes). NE reprends PAS sa mise en page, ses formes ni ses couleurs : repars d'une page blanche et choisis la meilleure composition.
\`\`\`svg
${d.svg}
\`\`\`
` : ''}
${CLAUDE_SVG_DESIGN}

Avant de répondre, vérifie mentalement : aucun texte ne déborde, rien ne se chevauche, la hiérarchie se lit en 3 secondes, le rendu ressemble à une illustration de keynote soignée et pas à un diagramme technique.

Réponds avec UN SEUL bloc de code \`\`\`svg … \`\`\` contenant le SVG complet (pas d'artefact, pas de HTML autour, pas d'explication).`;
}

/** Lit le SVG dans la réponse copiée depuis Claude. */
export function parseSvgReply(text = '') {
  const m = String(text).match(/<svg[\s\S]*<\/svg>/i);
  if (!m) throw new Error('Aucun schéma trouvé dans ce qui a été copié. Dans Claude, copie le bloc de code du schéma (bouton « Copier »), puis réessaie.');
  // On retire d'abord ce qui est interdit (script, contenu HTML), sinon tout le schéma serait refusé
  const svg = sanitizeSvg(m[0].replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '').replace(/<(iframe|object|embed)[^>]*\/?>/gi, ''));
  if (!svg) throw new Error('Le schéma copié n’est pas valide. Demande à Claude de le renvoyer en un seul bloc ```svg.');
  return svg;
}

/** Demande : vérifier le cours (fidélité au texte d'origine, ajouts de l'IA, fautes). */
export function verifyPrompt(course) {
  return `Bonjour Claude ! Un logiciel de révision a mis en forme mon cours avec une IA (Gemini), qui l'a aussi complété (passages entre {+ et +} et lignes commençant par ">+"). Peux-tu le vérifier soigneusement ?

Cours : « ${course.title} »${course.subject ? ` (${course.subject})` : ''}, pour ${DOMAIN.audience}.

=== TEXTE D'ORIGINE (référence) ===
${(course.text || '').slice(0, 150000)}
=== FIN DU TEXTE D'ORIGINE ===

=== COURS MIS EN FORME (à vérifier) ===
${plainCourse(course.summary).slice(0, 150000)}
=== FIN DU COURS ===

Vérifie : 1) les erreurs ou déformations par rapport au texte d'origine ; 2) les ajouts de l'IA faux, douteux ou inutiles ; 3) les informations importantes du texte d'origine qui manquent ; 4) les fautes d'orthographe ou de grammaire.

Réponds avec UN SEUL bloc \`\`\`json … \`\`\` (rien d'autre), de cette forme :
{"note": 8, "resume": "deux phrases sur la qualité du cours",
 "corrections": [
  {"type": "erreur" | "ajout" | "manque" | "faute", "gravite": "haute" | "moyenne" | "faible",
   "extrait": "passage EXACT recopié du cours mis en forme (10 à 200 caractères, avec ses éventuels symboles ==, **, {+ +})",
   "correction": "texte qui remplace l'extrait (pour « manque » : texte à AJOUTER après l'extrait ; vide pour supprimer l'extrait)",
   "explication": "pourquoi, en une phrase"}
 ]}
Ne signale que les erreurs certaines et importantes : une correction par problème réel, jamais de remplissage. Si le cours est fidèle au texte d'origine, la liste peut être vide. Maximum 15 corrections, les plus importantes d'abord. « faute » seulement pour les fautes qui gênent la compréhension. N'invente rien : appuie-toi sur le texte d'origine et sur des connaissances sûres.`;
}

/** Lit le JSON de vérification copié depuis Claude. */
export function parseVerifyReply(text = '') {
  const block = String(text).match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = block ? block[1] : (String(text).match(/\{[\s\S]*\}/) || [])[0];
  if (!raw) throw new Error('Aucune vérification trouvée dans ce qui a été copié. Copie toute la réponse de Claude (ou son bloc JSON), puis réessaie.');
  let data;
  try { data = JSON.parse(raw); } catch { throw new Error('La réponse copiée est incomplète. Copie le bloc JSON entier de Claude, puis réessaie.'); }
  const corrections = (data.corrections || []).filter((c) => c && typeof c.extrait === 'string' && c.extrait.trim())
    .map((c, i) => ({ id: i, type: c.type || 'erreur', gravite: c.gravite || 'moyenne', extrait: c.extrait, correction: String(c.correction ?? ''), explication: c.explication || '' }));
  return { note: data.note, resume: data.resume || '', corrections };
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Retrouve un extrait dans le cours, même si Claude a oublié des symboles de mise en forme. */
export function findExtract(md, extrait) {
  const exact = md.indexOf(extrait);
  if (exact >= 0) return [exact, exact + extrait.length];
  const words = extrait.replace(/==|\*\*|\^\^|@@|\{\+|\+\}/g, ' ').split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const SEP = '(?:\\s|==|\\*\\*|\\^\\^|@@|\\{\\+|\\+\\}|\\*)+';
  const re = new RegExp(`(?:==|\\*\\*|\\^\\^|@@|\\{\\+\\s?)?${words.map(esc).join(SEP)}(?:==|\\*\\*|\\^\\^|@@|\\s?\\+\\})?`);
  const m = re.exec(md);
  return m ? [m.index, m.index + m[0].length] : null;
}

/** Applique les corrections choisies ; renvoie le nouveau cours et le nombre appliqué / introuvable. */
export function applyCorrections(md, list) {
  let out = md;
  let applied = 0;
  const missed = [];
  list.forEach((c) => {
    const at = findExtract(out, c.extrait);
    if (!at) { missed.push(c); return; }
    const [a, b] = at;
    if (c.type === 'manque') {
      const eol = out.indexOf('\n', b);
      const cut = eol < 0 ? out.length : eol;
      out = `${out.slice(0, cut)}\n\n>+ ${c.correction.replace(/\n+/g, ' ')}\n${out.slice(cut)}`;
    } else {
      out = out.slice(0, a) + c.correction + out.slice(b);
    }
    applied++;
  });
  return { md: out, applied, missed };
}

/** Le presse-papiers contient-il encore notre propre demande (et pas la réponse de Claude) ? */
export const isOurPrompt = (text = '') => /^Bonjour Claude ! /.test(String(text).trim());
