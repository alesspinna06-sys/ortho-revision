// Sauvegarde automatique quotidienne (fichier .json dans un dossier au choix : Documents, iCloud Drive, OneDrive…).
import { api } from './bridge.js';
import { exportAll, getCourses } from './db.js';

const ON = 'auto-backup';
const LAST = 'auto-backup-last';
const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k, v) => { try { localStorage.setItem(k, v); } catch { /* stockage indisponible */ } };

export const autoBackupEnabled = () => get(ON) !== 'off';
export const setAutoBackup = (on) => set(ON, on ? 'on' : 'off');
export const lastBackup = () => Number(get(LAST)) || 0;

export async function backupNow() {
  const res = await api.backup.write(JSON.stringify(await exportAll()));
  if (res.ok) set(LAST, String(Date.now()));
  return res;
}

/** Une sauvegarde par jour au plus, seulement s'il y a des cours (on n'écrase jamais une sauvegarde par du vide). */
export async function maybeAutoBackup() {
  if (!api.isElectron || !autoBackupEnabled()) return null;
  if (Date.now() - lastBackup() < 20 * 3600 * 1000) return null;
  if (!(await getCourses()).length) return null;
  const res = await backupNow();
  if (!res.ok) console.warn('Sauvegarde automatique impossible :', res.error);
  return res;
}
