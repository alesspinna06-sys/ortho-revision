// Menu latéral rangé (colonne d'icônes) ou déplié. Gardé sur cet ordinateur.
import { useEffect, useState } from 'react';

const KEY = 'sidebar-collapsed';
const listeners = new Set();
let collapsed = false;
try { collapsed = localStorage.getItem(KEY) === '1'; } catch { /* stockage indisponible */ }

export const isNavCollapsed = () => collapsed;
export function setNavCollapsed(v) {
  collapsed = !!v;
  try { localStorage.setItem(KEY, collapsed ? '1' : '0'); } catch { /* stockage indisponible */ }
  listeners.forEach((f) => f(collapsed));
}
export const toggleNav = () => setNavCollapsed(!collapsed);

export function useNavCollapsed() {
  const [c, setC] = useState(collapsed);
  useEffect(() => { listeners.add(setC); return () => listeners.delete(setC); }, []);
  return c;
}
