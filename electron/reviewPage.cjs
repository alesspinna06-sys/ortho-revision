// Page de révision des flashcards servie au téléphone (même Wi-Fi que l'ordinateur).
// Les cartes viennent de l'ordinateur ; chaque note est renvoyée tout de suite et
// appliquée à la répétition espacée sur l'ordinateur. Aucun contenu n'est injecté
// en HTML : les textes sont affichés avec textContent.
module.exports = (token) => `<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no">
<meta name="theme-color" content="#0b0c12">
<title>Révision · Flashcards</title>
<style>
  :root{color-scheme:dark}
  *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  html,body{height:100%}
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#f4f5fb;
    background:radial-gradient(120% 60% at 0% 0%,#2b2f7a 0%,transparent 60%),radial-gradient(100% 60% at 100% 100%,#5a2a7a 0%,transparent 55%),#0b0c12;
    display:flex;flex-direction:column;padding:calc(16px + env(safe-area-inset-top)) 16px calc(16px + env(safe-area-inset-bottom))}
  header{display:flex;justify-content:space-between;align-items:center;font-size:14px;color:#a7abc2;margin-bottom:10px;gap:10px}
  header b{color:#f4f5fb;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .bar{height:5px;border-radius:9px;background:rgba(255,255,255,.1);overflow:hidden;margin-bottom:14px}
  .bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#4f6bff,#c35cf0);transition:width .3s}
  .card{flex:1;min-height:260px;border-radius:26px;padding:22px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);
    display:flex;flex-direction:column;cursor:pointer;-webkit-user-select:none;user-select:none}
  .tags{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px}
  .tag{font-size:12px;font-weight:600;padding:4px 10px;border-radius:99px;background:rgba(255,255,255,.1);color:#cfd2e3}
  .q{font-size:21px;font-weight:650;line-height:1.35;white-space:pre-wrap}
  .a{margin-top:16px;padding-top:16px;border-top:1px solid rgba(255,255,255,.12);font-size:17px;line-height:1.5;color:#e4e6f3;white-space:pre-wrap;display:none}
  .card.on .a{display:block}
  .hint{margin-top:auto;padding-top:16px;text-align:center;font-size:13px;color:#8b90a8}
  .card.on .hint{display:none}
  .grades{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px;visibility:hidden}
  .grades.on{visibility:visible}
  .grades button{height:62px;border:0;border-radius:16px;font:inherit;font-size:14px;font-weight:650;color:#fff}
  .g0{background:#dc2626}.g1{background:#d97706}.g2{background:#16a34a}.g3{background:#2563eb}
  .end{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:10px}
  .end h1{font-size:28px;margin:0}.end p{color:#a7abc2;margin:0;line-height:1.5}
  .warn{font-size:13px;color:#fbbf24;text-align:center;margin-top:8px;min-height:18px}
</style></head><body>
<header><b id="title">Flashcards</b><span id="count"></span></header>
<div class="bar"><i id="bar"></i></div>
<div id="main" style="flex:1;display:flex;flex-direction:column"></div>
<div class="warn" id="warn"></div>
<script>
const T=${JSON.stringify(token)};
let queue=[],pos=0,total=0,done=0,pending=[];
const $=(id)=>document.getElementById(id);
const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;};
function end(msg){
  const m=$('main');m.replaceChildren();
  const box=el('div','end');box.append(el('div',null,'🎉'),el('h1',null,'Séance terminée'),el('p',null,msg||(done+' carte'+(done>1?'s':'')+' révisée'+(done>1?'s':'')+'. Ta progression est enregistrée sur l’ordinateur.')));
  m.append(box);$('bar').style.width='100%';$('count').textContent='';
}
function show(){
  const c=queue[pos];
  if(!c){return end();}
  $('count').textContent=Math.min(pos+1,queue.length)+' / '+queue.length;
  $('bar').style.width=(pos/queue.length*100)+'%';
  const m=$('main');m.replaceChildren();
  const card=el('div','card');const tags=el('div','tags');
  if(c.category)tags.append(el('span','tag',c.category));if(c.course)tags.append(el('span','tag',c.course));
  card.append(tags,el('div','q',c.front),el('div','a',c.back),el('div','hint','Touche la carte pour voir la réponse'));
  const g=el('div','grades');
  [['À revoir',0],['Difficile',1],['Bien',2],['Facile',3]].forEach(([l,v])=>{const b=el('button','g'+v,l);b.onclick=(e)=>{e.stopPropagation();grade(c,v);};g.append(b);});
  card.onclick=()=>{card.classList.toggle('on');g.classList.toggle('on',card.classList.contains('on'));};
  m.append(card,g);
}
async function send(item){
  try{
    const r=await fetch('/api/grade?t='+T,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(item)});
    if(r.status===410){end('La séance a été fermée sur l’ordinateur. Relance-la depuis l’application.');return true;}
    if(!r.ok)throw new Error();return true;
  }catch(e){return false;}
}
async function flush(){
  const keep=[];for(const it of pending){if(!(await send(it)))keep.push(it);}pending=keep;
  $('warn').textContent=pending.length?('Connexion perdue : '+pending.length+' note(s) en attente d’envoi…'):'';
}
async function grade(c,v){
  done++;pending.push({id:c.id,grade:v});flush();
  if(v===0)queue.push(c); // revient en fin de séance
  pos++;show();
}
setInterval(()=>{if(pending.length)flush();},4000);
fetch('/api/review?t='+T).then(r=>{if(!r.ok)throw new Error(r.status);return r.json();}).then(d=>{
  $('title').textContent=d.title||'Flashcards';queue=d.cards||[];total=queue.length;
  if(!total)return end('Aucune carte à réviser pour le moment.');show();
}).catch(()=>end('Aucune séance en cours. Lance « Réviser sur mon téléphone » dans l’application, puis rescanne le QR code.'));
</script></body></html>`;
