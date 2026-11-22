import { useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import QrModal from '../components/QrModal.jsx';
import { useToast } from '../components/Toast.jsx';
import { ACCEPTED, extractFile, isImage, buildMedia } from '../lib/extract.js';
import { ocrImages, ocrPdf } from '../lib/ai.js';
import { addCourse, addMedia, getFolders, useDb } from '../lib/db.js';
import { enqueue } from '../lib/jobs.js';
import { useSettings } from '../lib/settings.jsx';

const FORMATS = ['PowerPoint', 'Word', 'Excel', 'PDF', 'Texte', 'Photos'];

export default function ImportView({ go, route, photos, setPhotos, hasKey }) {
  const { settings } = useSettings();
  const toast = useToast();
  const folders = useDb(() => getFolders(), []) || [];
  const [folderId, setFolderId] = useState(route?.folderId || '');
  const [over, setOver] = useState(false);
  const [items, setItems] = useState([]); // suivi des imports
  const [qrOpen, setQrOpen] = useState(false);
  const [phoneStart, setPhoneStart] = useState(0);
  const [photoTitle, setPhotoTitle] = useState('');
  const [ocrBusy, setOcrBusy] = useState('');
  const [paste, setPaste] = useState({ open: false, title: '', text: '' });
  const fileInput = useRef(null);
  const photoInput = useRef(null);

  const setItem = (id, patch) => setItems((l) => l.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  // Crée le cours, garde les schémas / pages d'origine, puis lance la génération
  const createAndGenerate = async (data, mediaItems = []) => {
    const media = await buildMedia(mediaItems);
    const course = await addCourse({ folderId: folderId || null, ...data, mediaCount: media.length });
    await addMedia(course.id, media);
    if (settings.autoGenerate && hasKey) enqueue(course.id);
    return course;
  };

  async function handleFiles(fileList) {
    const files = [...fileList];
    const imgs = files.filter(isImage);
    const docs = files.filter((f) => !isImage(f));
    if (imgs.length) {
      setPhotos((p) => [...p, ...imgs.map((file) => ({ id: Math.random().toString(36).slice(2), file, url: URL.createObjectURL(file) }))]);
      toast({ type: 'success', text: `${imgs.length} photo${imgs.length > 1 ? 's' : ''} ajoutée${imgs.length > 1 ? 's' : ''} — vérifie l'ordre puis crée le cours.` });
    }
    for (const file of docs) {
      const id = Math.random().toString(36).slice(2);
      setItems((l) => [{ id, name: file.name, status: 'Extraction du texte…' }, ...l]);
      try {
        let res = await extractFile(file);
        if (res.needsOcr) {
          if (!hasKey) throw new Error('PDF scanné : la lecture des images nécessite la clé Gemini.');
          setItem(id, { status: 'PDF scanné : lecture par l’IA…' });
          res = { ...res, text: await ocrPdf(file) };
        }
        if (!res.text?.trim()) throw new Error('Aucun texte trouvé dans ce fichier.');
        const course = await createAndGenerate({ title: res.title, text: res.text, sourceType: res.sourceType, sourceName: file.name }, res.mediaItems);
        setItem(id, { status: 'done', courseId: course.id });
      } catch (err) {
        console.error(err);
        setItem(id, { status: 'error', error: err.message });
      }
    }
  }

  async function createFromPhotos() {
    if (!hasKey) { toast({ type: 'error', text: 'Ajoute ta clé Gemini dans Réglages pour lire les photos.' }); return; }
    try {
      const imgs = photos.filter((p) => p.file.type !== 'application/pdf').map((p) => p.file);
      const pdfs = photos.filter((p) => p.file.type === 'application/pdf').map((p) => p.file);
      const parts = [];
      if (imgs.length) parts.push(await ocrImages(imgs, setOcrBusy));
      for (const pdf of pdfs) { setOcrBusy(`Lecture de ${pdf.name}…`); parts.push(await ocrPdf(pdf)); }
      const text = parts.join('\n\n').trim();
      if (!text) throw new Error("Aucun texte n'a été reconnu sur les photos.");
      const title = photoTitle.trim() || `Cours photographié du ${new Date().toLocaleDateString('fr-FR')}`;
      const mediaItems = photos.map((p) => ({ kind: p.file.type === 'application/pdf' ? 'pdf' : 'image', blob: p.file, name: p.file.name }));
      const course = await createAndGenerate({ title, titleLocked: !!photoTitle.trim(), text, sourceType: 'photo', sourceName: `${photos.length} photo(s)` }, mediaItems);
      photos.forEach((p) => URL.revokeObjectURL(p.url));
      setPhotos([]);
      setPhotoTitle('');
      go('course', { id: course.id });
    } catch (err) {
      toast({ type: 'error', text: err.message });
    } finally {
      setOcrBusy('');
    }
  }

  async function createFromPaste() {
    if (!paste.text.trim()) return;
    const course = await createAndGenerate({ title: paste.title.trim() || 'Notes collées', titleLocked: !!paste.title.trim(), text: paste.text.trim(), sourceType: 'text' });
    setPaste({ open: false, title: '', text: '' });
    go('course', { id: course.id });
  }

  const move = (idx, dir) => setPhotos((p) => {
    const a = p.slice(); const j = idx + dir;
    if (j < 0 || j >= a.length) return a;
    [a[idx], a[j]] = [a[j], a[idx]];
    return a;
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Importer un cours</h1>
          <div className="page-sub">
            {settings.autoGenerate && hasKey
              ? 'Fiche, flashcards et QCM sont générés automatiquement après l’import.'
              : 'Le texte est extrait et enregistré. Lance la génération IA depuis la page du cours.'}
          </div>
        </div>
      </div>

      <div
        className={`dropzone ${over ? 'over' : ''}`}
        onClick={() => fileInput.current.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); handleFiles(e.dataTransfer.files); }}
      >
        <div className="drop-icon"><Icon name="upload" size={28} stroke={2.1} /></div>
        <h3>Glisse tes fichiers ici</h3>
        <div className="muted" style={{ marginTop: 4 }}>ou clique pour parcourir — plusieurs fichiers à la fois possibles</div>
        <div className="formats">{FORMATS.map((f) => <span key={f} className="chip">{f}</span>)}</div>
        <input ref={fileInput} type="file" multiple accept={ACCEPTED} hidden onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }} />
      </div>

      {folders.length > 0 && (
        <div className="row" style={{ marginTop: 16, gap: 10 }}>
          <span className="small muted">Ranger les prochains cours dans :</span>
          <select className="select" style={{ width: 240 }} value={folderId} onChange={(e) => setFolderId(e.target.value)}>
            <option value="">Aucun dossier (racine)</option>
            {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
      )}

      {items.length > 0 && (
        <div className="card" style={{ padding: 8, marginTop: 16 }}>
          {items.map((it) => (
            <div key={it.id} className="list-row" onClick={() => it.courseId && go('course', { id: it.courseId })} style={{ cursor: it.courseId ? 'pointer' : 'default' }}>
              <div className="option-icon" style={{ width: 38, height: 38, borderRadius: 12 }}><Icon name="file" size={17} /></div>
              <div className="grow">
                <div style={{ fontWeight: 600 }}>{it.name}</div>
                <div className="small" style={{ color: it.status === 'error' ? 'var(--danger)' : 'var(--text-3)' }}>
                  {it.status === 'done' ? 'Cours créé — ouvrir' : it.status === 'error' ? it.error : it.status}
                </div>
              </div>
              {it.status === 'done' ? <span className="chip success"><Icon name="check" size={12} /> Importé</span>
                : it.status === 'error' ? <span className="chip danger">Échec</span>
                : <span className="spinner" style={{ color: 'var(--accent)' }} />}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-3" style={{ marginTop: 16 }}>
        <div className="card interactive option-card" onClick={() => { setPhoneStart(photos.filter((p) => p.fromPhone).length); setQrOpen(true); }}>
          <div className="option-icon"><Icon name="phone" /></div>
          <div><b>Depuis mon téléphone</b><div className="small muted">Scanne un QR code et photographie tes pages.</div></div>
        </div>
        <div className="card interactive option-card" onClick={() => photoInput.current.click()}>
          <div className="option-icon"><Icon name="camera" /></div>
          <div><b>Importer des photos</b><div className="small muted">Notes manuscrites ou polycopiés scannés.</div></div>
          <input ref={photoInput} type="file" multiple accept="image/*,.heic,.heif" hidden onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }} />
        </div>
        <div className="card interactive option-card" onClick={() => setPaste((p) => ({ ...p, open: !p.open }))}>
          <div className="option-icon"><Icon name="text" /></div>
          <div><b>Coller du texte</b><div className="small muted">Depuis un mail, un site ou tes notes.</div></div>
        </div>
      </div>

      {paste.open && (
        <div className="card view-enter" style={{ marginTop: 16 }}>
          <div className="stack">
            <input className="input" placeholder="Titre du cours (facultatif)" value={paste.title} onChange={(e) => setPaste({ ...paste, title: e.target.value })} />
            <textarea className="textarea" style={{ minHeight: 200 }} placeholder="Colle ici le contenu du cours…" value={paste.text} onChange={(e) => setPaste({ ...paste, text: e.target.value })} />
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn ghost" onClick={() => setPaste({ open: false, title: '', text: '' })}>Annuler</button>
              <button className="btn primary" disabled={!paste.text.trim()} onClick={createFromPaste}>Créer le cours</button>
            </div>
          </div>
        </div>
      )}

      {photos.length > 0 && (
        <>
          <div className="section-title">
            <span>Photos en attente <span className="faint">· {photos.length}</span></span>
            <button className="btn sm ghost" onClick={() => { photos.forEach((p) => URL.revokeObjectURL(p.url)); setPhotos([]); }}>Tout retirer</button>
          </div>
          <div className="card">
            <div className="thumbs">
              {photos.map((p, i) => (
                <div key={p.id} className="thumb" title="Clic gauche/droit sur les flèches pour réordonner">
                  {p.file.type === 'application/pdf'
                    ? <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}><Icon name="file" size={34} /></div>
                    : <img src={p.url} alt="" loading="lazy" decoding="async" />}
                  <span className="n">{i + 1}</span>
                  <button onClick={() => { URL.revokeObjectURL(p.url); setPhotos((l) => l.filter((x) => x.id !== p.id)); }} aria-label="Retirer"><Icon name="x" size={14} /></button>
                  <div className="row" style={{ position: 'absolute', right: 6, bottom: 6, gap: 4 }}>
                    <button style={{ position: 'static' }} onClick={() => move(i, -1)} aria-label="Avant"><Icon name="left" size={14} /></button>
                    <button style={{ position: 'static' }} onClick={() => move(i, 1)} aria-label="Après"><Icon name="right" size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
            <div className="row" style={{ marginTop: 18 }}>
              <input className="input grow" placeholder="Titre du cours (facultatif, l'IA en proposera un)" value={photoTitle} onChange={(e) => setPhotoTitle(e.target.value)} />
              <button className="btn accent" disabled={!!ocrBusy} onClick={createFromPhotos}>
                {ocrBusy ? <><span className="spinner" /> {ocrBusy}</> : <><Icon name="sparkles" /> Transformer en cours</>}
              </button>
            </div>
            <div className="faint small" style={{ marginTop: 10 }}>Les pages sont lues dans l'ordre affiché, puis assemblées en un seul cours éditable.</div>
          </div>
        </>
      )}

      {qrOpen && <QrModal onClose={() => setQrOpen(false)} received={photos.filter((p) => p.fromPhone).length - phoneStart} />}
    </>
  );
}
