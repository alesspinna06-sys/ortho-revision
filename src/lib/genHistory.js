// Historique des générations d'un cours (Gemini, Claude, toi) et état « à jour / à régénérer ».
// GEN_VERSION augmente quand la façon de générer les cours s'améliore : les cours plus anciens
// sont alors signalés « À régénérer ».
import { getCourse, updateCourse } from './db.js';

export const GEN_VERSION = 4;
export const GEN_NOTES = {
  1: 'fiche courte (avant le 9 octobre)',
  2: 'cours complet (9 octobre)',
  3: 'cours complété et relu (27 octobre)',
  4: 'images d’origine, tableaux, liens, formules, schémas relus par Gemini (30 octobre)',
};

/** Version de génération d'un cours (déduite pour les cours générés avant cet historique). */
export function genVersionOf(c) {
  if (!c) return 0;
  if (c.genVersion) return c.genVersion;
  if ('verifiedAt' in c) return 4; // champ posé par les générations depuis le 30 octobre au soir
  if (/\{\+|^>\+ /m.test(c.summary || '')) return 3; // ajouts « complétés » : depuis le 27 octobre
  if (c.fullCourse) return 2;
  return c.summary ? 1 : 0;
}

/** État affiché par la pastille. */
export function genState(c) {
  const v = genVersionOf(c);
  const last = [...(c?.genHistory || [])].reverse().find((e) => e.kind === 'cours');
  const lastAt = last?.at || c?.generatedAt || null;
  return {
    version: v,
    never: !c?.summary,
    upToDate: v >= GEN_VERSION,
    verified: !!c?.verifiedAt,
    lastAt,
    reason: v >= GEN_VERSION ? 'Généré avec la dernière version' : `Généré avec une ancienne version : ${GEN_NOTES[v] || 'inconnue'}. Régénère-le pour avoir ${GEN_NOTES[GEN_VERSION]}.`,
  };
}

export const KINDS = {
  cours: { icon: '📄', label: 'Cours généré' },
  synthese: { icon: '🗒️', label: 'Synthèse générée' },
  couleurs: { icon: '🎨', label: 'Mise en couleurs' },
  schemas: { icon: '🧩', label: 'Schémas ajoutés' },
  schema: { icon: '🖼️', label: 'Schéma amélioré' },
  verification: { icon: '✅', label: 'Cours vérifié' },
  annulation: { icon: '↩️', label: 'Modification annulée' },
  echec: { icon: '⚠️', label: 'Échec de génération' },
};
export const BY = { gemini: 'Gemini', claude: 'Claude', toi: 'Toi' };

/** Ajoute un événement à l'historique (renvoie le nouveau tableau, 60 événements au plus). */
export const withEvent = (c, e) => [...(c?.genHistory || []), { at: Date.now(), by: 'gemini', ...e }].slice(-60);

/** Enregistre un événement dans le cours. */
export async function logGen(courseId, e, patch = {}) {
  const c = await getCourse(courseId);
  if (!c) return null;
  return updateCourse(courseId, { ...patch, genHistory: withEvent(c, e) });
}
