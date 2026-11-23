import Icon from './Icon.jsx';
import { useReadScale, bumpReadScale, MIN, MAX } from '../lib/readScale.js';

const mod = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform) ? '⌘' : 'Ctrl';

/** Réglage de la taille du texte : A− · 120 % · A+ (raccourcis ⌘/Ctrl + et −, ⌘/Ctrl 0 pour revenir à 100 %). */
export default function TextSize() {
  const s = useReadScale();
  return (
    <div className="text-size" role="group" aria-label="Taille du texte">
      <button className="btn icon sm ghost" onClick={() => bumpReadScale(-1)} disabled={s <= MIN} title={`Texte plus petit (${mod} −)`} aria-label="Texte plus petit">
        <span className="ts-a small-a">A</span>
      </button>
      <button className="ts-value" onClick={() => bumpReadScale(0)} title={`Revenir à 100 % (${mod} 0)`} aria-label={`Taille du texte : ${Math.round(s * 100)} %. Revenir à 100 %`}>
        {Math.round(s * 100)} %
      </button>
      <button className="btn icon sm ghost" onClick={() => bumpReadScale(1)} disabled={s >= MAX} title={`Texte plus grand (${mod} +)`} aria-label="Texte plus grand">
        <span className="ts-a big-a">A</span>
      </button>
    </div>
  );
}
