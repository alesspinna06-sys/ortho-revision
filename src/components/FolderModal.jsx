import { useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon.jsx';
import { addFolder, updateFolder, FOLDER_COLORS } from '../lib/db.js';
import ColorPicker from './ColorPicker.jsx';

/** Création ou modification d'un dossier : nom et couleur. */
export default function FolderModal({ folder, onClose, onSaved }) {
  const [name, setName] = useState(folder?.name || '');
  const [color, setColor] = useState(folder?.color || FOLDER_COLORS[0]);

  const save = async (e) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    const saved = folder
      ? await updateFolder(folder.id, { name: n, color })
      : await addFolder({ name: n, color });
    onSaved?.(saved);
    onClose();
  };

  return createPortal(
    <div className="overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <div className="row between">
          <span className="chip accent"><Icon name="folder" size={12} /> {folder ? 'Modifier le dossier' : 'Nouveau dossier'}</span>
          <button type="button" className="btn icon sm ghost" onClick={onClose} aria-label="Fermer"><Icon name="x" /></button>
        </div>

        <div className="folder-preview" style={{ background: `linear-gradient(135deg, ${color}, ${color}b0)` }}>
          <Icon name="folder" size={26} />
          <span>{name.trim() || 'Nom du dossier'}</span>
        </div>

        <div className="field" style={{ marginTop: 18 }}>
          <label htmlFor="folder-name">Nom</label>
          <input id="folder-name" className="input" autoFocus placeholder="Ex. Neurologie, Voix, Langage écrit…" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        </div>

        <div className="field" style={{ marginTop: 16 }}>
          <label>Couleur</label>
          <ColorPicker value={color} onChange={setColor} label="Couleur du dossier" />
        </div>

        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 22 }}>
          <button type="button" className="btn ghost" onClick={onClose}>Annuler</button>
          <button type="submit" className="btn primary" disabled={!name.trim()}>{folder ? 'Enregistrer' : 'Créer le dossier'}</button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
