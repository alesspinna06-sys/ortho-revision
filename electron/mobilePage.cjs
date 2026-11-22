// Page web servie au téléphone (aucune installation nécessaire côté mobile).
// Les photos sont redimensionnées sur le téléphone avant l'envoi (plus rapide,
// et convertit les HEIC d'iPhone en JPEG).
module.exports = (token) => `<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0b0c12">
<title>Ortho Révision · Envoi de photos</title>
<style>
  :root{color-scheme:dark}
  *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  body{margin:0;min-height:100vh;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#f4f5fb;
    background:radial-gradient(120% 60% at 0% 0%,#2b2f7a 0%,transparent 60%),radial-gradient(100% 60% at 100% 100%,#5a2a7a 0%,transparent 55%),#0b0c12;
    padding:calc(28px + env(safe-area-inset-top)) 20px 40px}
  h1{font-size:28px;letter-spacing:-.02em;margin:0 0 6px}
  p{color:#a7abc2;margin:0 0 24px;line-height:1.45}
  .card{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14);border-radius:24px;padding:18px;margin-bottom:14px;
    -webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px)}
  label.btn{display:flex;align-items:center;justify-content:center;gap:10px;height:58px;border-radius:18px;font-weight:600;font-size:17px;cursor:pointer}
  .primary{background:#fff;color:#0b0c12}
  .ghost{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.16);margin-top:10px}
  input{display:none}
  ul{list-style:none;margin:0;padding:0}
  li{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.08)}
  li:last-child{border:0}
  li img{width:44px;height:44px;border-radius:10px;object-fit:cover}
  li span{flex:1;font-size:14px;color:#cfd2e3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .ok{color:#4ade80}.err{color:#f87171}.wait{color:#a7abc2}
  .hint{font-size:13px;color:#8b90a8;text-align:center;margin-top:18px}
</style></head><body>
  <h1>Envoyer un cours 📸</h1>
  <p>Photographie tes pages de cours. Elles arrivent directement dans l’application sur l’ordinateur.</p>
  <div class="card">
    <label class="btn primary">📷 Prendre une photo<input id="cam" type="file" accept="image/*" capture="environment"></label>
    <label class="btn ghost">🖼️ Choisir dans la galerie<input id="lib" type="file" accept="image/*,application/pdf" multiple></label>
  </div>
  <div class="card" id="listCard" style="display:none"><ul id="list"></ul></div>
  <div class="hint">Garde cette page ouverte. Le téléphone et l’ordinateur doivent être sur le même Wi-Fi.</div>
<script>
const T=${JSON.stringify(token)};
const list=document.getElementById('list');
function resize(file){
  return new Promise((resolve)=>{
    if(file.type==='application/pdf') return resolve(file);
    const img=new Image(); const url=URL.createObjectURL(file);
    img.onload=()=>{
      const max=2200; let w=img.naturalWidth,h=img.naturalHeight;
      const s=Math.min(1,max/Math.max(w,h)); w=Math.round(w*s); h=Math.round(h*s);
      const c=document.createElement('canvas'); c.width=w; c.height=h;
      c.getContext('2d').drawImage(img,0,0,w,h);
      c.toBlob((b)=>{URL.revokeObjectURL(url); resolve(b||file);},'image/jpeg',0.85);
    };
    img.onerror=()=>{URL.revokeObjectURL(url); resolve(file);};
    img.src=url;
  });
}
async function send(file){
  document.getElementById('listCard').style.display='block';
  const li=document.createElement('li');
  const thumb=file.type.startsWith('image/')?'<img src="'+URL.createObjectURL(file)+'">':'<div style="width:44px;text-align:center">📄</div>';
  li.innerHTML=thumb+'<span></span><b class="wait">Envoi…</b>';
  li.querySelector('span').textContent=file.name||'photo.jpg';
  list.prepend(li);
  const st=li.querySelector('b');
  try{
    const blob=await resize(file);
    const name=(file.name||'photo').replace(/\\.[^.]+$/,'')+(blob.type==='application/pdf'?'.pdf':'.jpg');
    const r=await fetch('/upload?t='+T,{method:'POST',headers:{'Content-Type':blob.type||'image/jpeg','X-Filename':encodeURIComponent(name)},body:blob});
    if(!r.ok) throw new Error(r.status);
    st.textContent='✓ Reçu'; st.className='ok';
  }catch(e){ st.textContent='Échec'; st.className='err'; }
}
for(const id of ['cam','lib']){
  document.getElementById(id).addEventListener('change',async(e)=>{
    for(const f of e.target.files) await send(f);
    e.target.value='';
  });
}
</script></body></html>`;
