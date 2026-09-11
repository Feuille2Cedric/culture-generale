'use strict';
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => crypto.randomUUID();
const colors = ['sage','sand','blue','rose','lavender'];
const symbols = ['✳','◉','⌘','✧','◎'];
let db, library = {topics:[],pages:[]}, revision = 0, dirty = false, timer, saving, ready = false, conflict = false;
let mode = 'home', topicId = null, pageId = null, query = '', editingTopic = null, imageTarget = null;
const req = request => new Promise((resolve,reject) => {request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
const done = tx => new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error || Error('Transaction annulée'));});
function notice(message) { $('#notice').textContent=message; $('#notice').hidden=!message; }
function status(message) { $('#save-status').textContent=message; }
async function start() {
  try {
    const opening=indexedDB.open('curio-library',1);
    opening.onupgradeneeded=()=>{opening.result.createObjectStore('state');opening.result.createObjectStore('images');};
    db=await req(opening);
    const saved=await req(db.transaction('state').objectStore('state').get('library'));
    if(saved){library=saved.library;revision=saved.revision;}
    ready=true;status('● Enregistré dans ce navigateur');render();
  } catch(error) { notice('Impossible d’ouvrir le stockage du navigateur. Autorise le stockage de ce site puis recharge la page.'); status('Stockage indisponible'); }
}
function changed() { dirty=true;status('Enregistrement…');clearTimeout(timer);timer=setTimeout(()=>save(),450); }
async function save() {
  clearTimeout(timer);
  if(saving){await saving;if(dirty&&!conflict)return save();return !dirty;}
  if(!dirty)return true;
  if(conflict)return false;
  const snapshot=structuredClone(library);dirty=false;
  saving=(async()=>{
    try{
      const tx=db.transaction('state','readwrite'), completed=done(tx), store=tx.objectStore('state');
      const current=await req(store.get('library'));
      if((current?.revision || 0)!==revision){conflict=true;tx.abort();await completed;}
      store.put({library:snapshot,revision:revision+1},'library');await completed;revision++;
      if(!dirty)status('● Enregistré dans ce navigateur');return true;
    }catch(error){dirty=true;status('Non enregistré');notice(conflict?'Une autre fenêtre a modifié la bibliothèque. Exporte tes modifications avant de recharger cette page.':'Enregistrement impossible. Le stockage est peut-être plein. Exporte ta bibliothèque pour conserver tes modifications.');return false;}
  })();
  const result=await saving;saving=null;return result;
}
const topic = () => library.topics.find(t=>t.id===topicId);
const page = () => library.pages.find(p=>p.id===pageId);
const livePages = () => library.pages.filter(p=>!p.deleted);
const date = value => new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'short'}).format(new Date(value));
function pageMatches(p){return [p.title,...p.blocks.map(b=>b.text),library.topics.find(t=>t.id===p.topic)?.title].join(' ').toLocaleLowerCase('fr').includes(query.toLocaleLowerCase('fr'));}
function render(){
  if(!ready)return;
  $('#topics').innerHTML=library.topics.map(t=>`<button class="nav topic-nav ${topicId===t.id?'active':''}" data-topic="${esc(t.id)}"><span class="dot ${esc(t.color)}"></span>${esc(t.title)}</button>`).join('');
  $('#home').classList.toggle('active',mode==='home');$('#favorites').classList.toggle('active',mode==='favorites');
  $('#breadcrumb').textContent='Mon espace / '+(query?'Recherche':mode==='editor'?(topic()?.title || 'Page'):mode==='topic'?(topic()?.title || 'Sujet'):mode==='favorites'?'Favoris':mode==='trash'?'Corbeille':'Bibliothèque');
  if(query)return renderSearch();
  if(mode==='editor'&&page())return renderEditor();
  if(mode==='topic'&&topic())return renderTopic();
  if(mode==='favorites'){ $('#view').innerHTML=`<div class="hero"><div><span class="eyebrow">À GARDER TOUT PRÈS</span><h1>Mes favoris</h1><p>Les pages auxquelles tu aimes revenir.</p></div></div>${rows(livePages().filter(p=>p.favorite))}`;return; }
  if(mode==='trash'){renderTrash();return;}
  renderHome();
}
function rows(pages){return pages.length?pages.sort((a,b)=>b.updated-a.updated).map(p=>`<button class="page-row" data-page="${esc(p.id)}"><span class="page-icon">▤</span><span class="page-name"><strong>${esc(p.title || 'Sans titre')}${p.favorite?' ☆':''}</strong><small>${esc(library.topics.find(t=>t.id===p.topic)?.title)} · ${p.blocks.length} blocs</small></span><small>${date(p.updated)}</small><span>↗</span></button>`).join(''):'<div class="empty"><h3>Tout commence par une curiosité.</h3>Les pages que tu ajoutes apparaîtront ici.</div>';}
function renderHome(){
 $('#view').innerHTML=`<div class="hero"><div><span class="eyebrow">TON ESPACE POUR COMPRENDRE LE MONDE</span><h1>La curiosité se cultive.</h1><p>Une idée, une découverte, une question.<br>Rassemble ici ce que tu veux apprendre et retenir.</p></div><button class="primary" data-action="new-topic">+ &nbsp; Nouveau sujet</button></div><div class="banner"><span class="banner-symbol">✺</span><div><h3>Fais de la place à ce qui t’intrigue.</h3><p>Crée un sujet, ouvre une page, laisse tes idées prendre forme.<br>Textes, images et liens : tout trouve sa place.</p></div></div><div class="section-heading"><h2>Mes sujets <span class="count">${library.topics.length}</span></h2><span>Un monde à explorer, à ton rythme</span></div><div class="grid">${library.topics.map((t,i)=>`<button class="card" data-topic="${esc(t.id)}"><div class="cover ${esc(t.color)}">${symbols[i%symbols.length]}</div><div class="card-body"><h3>${esc(t.title)}</h3><p>${esc(t.description || 'Un nouveau territoire à explorer.')}</p><div class="card-footer"><span>${livePages().filter(p=>p.topic===t.id).length} page(s)</span><span>Explorer ↗</span></div></div></button>`).join('')}<button class="add-card" data-action="new-topic"><span>+</span>Une nouvelle curiosité</button></div><div class="section-heading"><h2>Dernières pages explorées</h2><button class="secondary" data-action="trash">Corbeille</button></div>${rows(livePages().sort((a,b)=>(b.visited||b.updated)-(a.visited||a.updated)).slice(0,4))}<p class="editor-hint">Tes contenus restent dans ce navigateur. Pense à exporter une sauvegarde, notamment avant de changer d’appareil ou d’effacer ses données.</p>`;
}
function renderTopic(){const t=topic();$('#view').innerHTML=`<div class="hero"><div><span class="eyebrow">MON CARNET DE CONNAISSANCES</span><h1>${esc(t.title)}</h1><p>${esc(t.description)}</p></div><button class="primary" data-action="new-page">+ &nbsp; Nouvelle page</button></div><div class="section-heading"><h2>Les pages de ce sujet</h2><button class="secondary" data-action="edit-topic">Modifier le sujet</button></div>${rows(livePages().filter(p=>p.topic===t.id))}`;}
function renderSearch(){const matches=livePages().filter(pageMatches);$('#view').innerHTML=`<div class="hero"><div><span class="eyebrow">RETROUVER UNE IDÉE</span><h1>Résultats de recherche</h1><p>${matches.length} page(s) pour « ${esc(query)} »</p></div></div><div class="section-heading"><h2>Dans ta bibliothèque</h2></div>${rows(matches)}`;}
function renderTrash(){const deleted=library.pages.filter(p=>p.deleted);$('#view').innerHTML=`<div class="hero"><div><span class="eyebrow">RIEN N’EST PERDU</span><h1>La corbeille</h1><p>Restaure une page pour la retrouver dans son sujet.</p></div></div>${deleted.length?deleted.map(p=>`<div class="page-row"><span class="page-name">${esc(p.title||'Sans titre')}</span><button class="secondary" data-restore="${esc(p.id)}">Restaurer</button></div>`).join(''):'<div class="empty">La corbeille est vide.</div>'}`;}
function validUrl(value){try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)?u.href:null;}catch{return null;}}
function renderEditor(){const p=page();$('#view').innerHTML=`<div class="editor-top"><button class="secondary" data-action="back">← ${esc(topic()?.title)}</button><div class="editor-actions"><button class="secondary" data-action="favorite">${p.favorite?'★ En favori':'☆ Favori'}</button><button class="secondary" data-action="delete-page">Mettre à la corbeille</button></div></div><article class="editor"><span class="eyebrow">UNE PAGE POUR TES IDÉES</span><input class="title-input" id="page-title" aria-label="Titre de la page" placeholder="Sans titre" value="${esc(p.title)}"><div class="page-meta"><label for="page-topic">Classée dans</label><select id="page-topic">${library.topics.map(t=>`<option value="${esc(t.id)}" ${t.id===p.topic?'selected':''}>${esc(t.title)}</option>`).join('')}</select><span>· Modifiée le ${date(p.updated)}</span></div><div id="blocks">${p.blocks.map((b,i)=>blockHtml(b,i,p.blocks.length)).join('')}</div><div class="insert-tools"><button data-add="text">+ Texte</button><button data-add="heading">T Titre</button><button data-add="quote">❝ Citation</button><button data-add="image">▧ Image</button><button data-add="link">↗ Lien</button></div><p class="editor-hint">Chaque bloc se déplace avec les flèches ↑ ↓. Les images peuvent être redimensionnées et alignées. Les modifications sont enregistrées automatiquement.</p></article>`;hydrateImages();}
function blockHtml(b,i,length){const tools=`<div class="block-tools">${b.type==='image'?`<select data-layout="${esc(b.id)}" aria-label="Disposition de l’image">${[['wide','Pleine largeur'],['narrow','Centrée · 60 %'],['left','À gauche · 60 %'],['right','À droite · 60 %']].map(([v,l])=>`<option value="${v}" ${b.layout===v?'selected':''}>${l}</option>`).join('')}</select>`:''}<button data-move="${esc(b.id)}" data-dir="-1" aria-label="Monter le bloc" ${i===0?'disabled':''}>↑</button><button data-move="${esc(b.id)}" data-dir="1" aria-label="Descendre le bloc" ${i===length-1?'disabled':''}>↓</button><button data-remove="${esc(b.id)}" aria-label="Supprimer le bloc">×</button></div>`;let content;
 if(b.type==='image')content=`<img data-image="${esc(b.image)}" alt="${esc(b.text||'Image du carnet')}"><input data-text="${esc(b.id)}" aria-label="Légende de l’image" placeholder="Ajouter une légende…" value="${esc(b.text)}">`;
 else if(b.type==='link')content=`<input data-text="${esc(b.id)}" placeholder="Titre du lien" aria-label="Titre du lien" value="${esc(b.text)}"><input data-url="${esc(b.id)}" type="url" placeholder="https://…" aria-label="Adresse du lien" value="${esc(b.url)}"><a data-open-link="${esc(b.id)}" href="${esc(validUrl(b.url)||'#')}" target="_blank" rel="noopener noreferrer">Ouvrir la source ↗</a>`;
 else content=`<textarea data-text="${esc(b.id)}" aria-label="${b.type==='heading'?'Titre de section':b.type==='quote'?'Citation':'Texte'}" placeholder="${b.type==='heading'?'Un titre de section…':b.type==='quote'?'Une phrase à retenir…':'Écris ce que tu veux retenir…'}">${esc(b.text)}</textarea>`;
 return `<section class="block ${esc(b.type)} ${esc(b.layout||'wide')}" data-block="${esc(b.id)}">${tools}${content}</section>`;
}
async function hydrateImages(){for(const element of document.querySelectorAll('[data-image]')){try{const record=await req(db.transaction('images').objectStore('images').get(element.dataset.image));if(record&&element.isConnected)element.src=record;}catch{notice('Une image n’a pas pu être chargée.');}}}
function navigate(next,id){query='';$('#search').value='';mode=next;if(next==='topic')topicId=id;if(next==='editor'){pageId=id;topicId=page().topic;page().visited=Date.now();changed();}render();}
function openTopicDialog(edit=false){if(!ready)return;editingTopic=edit?topicId:null;const t=edit?topic():{title:'',description:'',color:colors[library.topics.length%colors.length]};$('#dialog-title').textContent=edit?'Modifier le sujet':'Créer un sujet';for(const name of ['title','description','color'])$('#topic-form').elements[name].value=t[name]||'';$('#topic-dialog').showModal();}
$('#topic-form').addEventListener('submit',event=>{event.preventDefault();const data=new FormData(event.target),title=data.get('title').trim();if(!title)return;const t={id:editingTopic||uid(),title,description:data.get('description').trim(),color:data.get('color')};if(editingTopic)Object.assign(topic(),t);else library.topics.push(t);changed();$('#topic-dialog').close();navigate('topic',t.id);});
$('#cancel-dialog').onclick=()=>$('#topic-dialog').close();$('#home').onclick=()=>navigate('home');$('#favorites').onclick=()=>navigate('favorites');$('#add-topic-side').onclick=()=>openTopicDialog();
$('#search').oninput=event=>{query=event.target.value.trim();render();};
document.addEventListener('click',event=>{
 const button=event.target.closest('button');if(!button||!ready)return;const d=button.dataset;
 if(d.topic)return navigate('topic',d.topic);if(d.page)return navigate('editor',d.page);
 if(d.restore){library.pages.find(p=>p.id===d.restore).deleted=false;changed();return render();}
 if(d.action==='new-topic')return openTopicDialog();if(d.action==='edit-topic')return openTopicDialog(true);
 if(d.action==='trash')return navigate('trash');if(d.action==='back')return navigate('topic',topicId);
 if(d.action==='new-page'){const p={id:uid(),topic:topicId,title:'',blocks:[{id:uid(),type:'text',text:''}],updated:Date.now(),favorite:false};library.pages.push(p);changed();navigate('editor',p.id);$('#page-title').focus();return;}
 if(d.action==='favorite'){page().favorite=!page().favorite;changed();return render();}
 if(d.action==='delete-page'){page().deleted=true;changed();return navigate('topic',topicId);}
 if(d.add){if(d.add==='image'){imageTarget=pageId;$('#image-input').click();return;}page().blocks.push({id:uid(),type:d.add,text:'',url:''});page().updated=Date.now();changed();render();$('#blocks').lastElementChild?.querySelector('textarea,input')?.focus();return;}
 if(d.move){const blocks=page().blocks,i=blocks.findIndex(b=>b.id===d.move),j=i+Number(d.dir);if(j>=0&&j<blocks.length)[blocks[i],blocks[j]]=[blocks[j],blocks[i]];changed();return render();}
 if(d.remove){const b=page().blocks.find(b=>b.id===d.remove);if((b.text||b.image||b.url)&&!confirm('Supprimer ce bloc et son contenu ?'))return;page().blocks=page().blocks.filter(b=>b.id!==d.remove);changed();render();}
});
$('#view').addEventListener('input',event=>{if(mode!=='editor'||!page())return;const el=event.target;if(el.id==='page-title')page().title=el.value;else if(el.dataset.text)page().blocks.find(b=>b.id===el.dataset.text).text=el.value;else if(el.dataset.url){page().blocks.find(b=>b.id===el.dataset.url).url=el.value;el.nextElementSibling.href=validUrl(el.value)||'#';}else return;page().updated=Date.now();changed();});
$('#view').addEventListener('change',event=>{const el=event.target;if(el.id==='page-topic'){page().topic=el.value;topicId=el.value;changed();render();}if(el.dataset.layout){page().blocks.find(b=>b.id===el.dataset.layout).layout=el.value;changed();render();}});
$('#view').addEventListener('click',event=>{const a=event.target.closest('[data-open-link]');if(a&&!validUrl(page()?.blocks.find(b=>b.id===a.dataset.openLink)?.url)){event.preventDefault();notice('Ajoute une adresse commençant par https:// ou http:// pour ouvrir ce lien.');}});
const readDataUrl=file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file);});
$('#image-input').onchange=async event=>{const file=event.target.files[0];event.target.value='';if(!file)return;try{if(!['image/png','image/jpeg','image/gif','image/webp'].includes(file.type)||file.size>12*1024*1024)throw Error('Choisis une image PNG, JPEG, GIF ou WebP de moins de 12 Mo.');const data=await readDataUrl(file),id=uid();const tx=db.transaction('images','readwrite'),completed=done(tx);tx.objectStore('images').put(data,id);await completed;const target=library.pages.find(p=>p.id===imageTarget);if(!target)return;target.blocks.push({id:uid(),type:'image',image:id,text:'',layout:'wide'});target.updated=Date.now();changed();render();}catch(error){notice(error.message||'Impossible d’enregistrer cette image.');}};
$('#export').onclick=async()=>{if(!ready)return;try{await save();const images={};for(const p of library.pages)for(const b of p.blocks)if(b.image&&!images[b.image]){const data=await req(db.transaction('images').objectStore('images').get(b.image));if(!data)throw Error('Image manquante : export interrompu.');images[b.image]=data;}const blob=new Blob([JSON.stringify({format:'curio',version:1,exportedAt:new Date().toISOString(),library,images},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`curio-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notice('Sauvegarde exportée avec tes pages et tes images. Garde ce fichier dans un endroit sûr.');}catch(error){notice(error.message||'Export impossible.');}};
function validateBackup(data){
 if(data?.format!=='curio'||data.version!==1||!Array.isArray(data.library?.topics)||!Array.isArray(data.library?.pages)||!data.images||typeof data.images!=='object')throw Error('Ce fichier n’est pas une sauvegarde Curio compatible.');
 const topicIds=new Set(),pageIds=new Set();
 for(const t of data.library.topics){if(typeof t.id!=='string'||topicIds.has(t.id)||typeof t.title!=='string'||typeof t.description!=='string'||!colors.includes(t.color))throw Error('Sujet invalide dans la sauvegarde.');topicIds.add(t.id);}
 for(const p of data.library.pages){if(typeof p.id!=='string'||pageIds.has(p.id)||!topicIds.has(p.topic)||typeof p.title!=='string'||!Number.isFinite(p.updated)||!Array.isArray(p.blocks))throw Error('Page invalide dans la sauvegarde.');pageIds.add(p.id);const blocks=new Set();for(const b of p.blocks){if(typeof b.id!=='string'||blocks.has(b.id)||!['text','heading','quote','image','link'].includes(b.type)||typeof b.text!=='string')throw Error('Bloc invalide dans la sauvegarde.');blocks.add(b.id);if(b.type==='image'&&(typeof b.image!=='string'||!/^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(data.images[b.image]||'')||!['wide','narrow','left','right'].includes(b.layout)))throw Error('Image invalide ou manquante.');if(b.type==='link'&&typeof b.url!=='string')throw Error('Lien invalide.');}}
 return data;
}
$('#import').onclick=()=>{if(ready)$('#import-input').click();};
$('#import-input').onchange=async event=>{const file=event.target.files[0];event.target.value='';if(!file)return;try{if(file.size>200*1024*1024)throw Error('Sauvegarde trop volumineuse (200 Mo maximum).');const data=validateBackup(JSON.parse(await file.text()));if(!confirm('Ajouter les sujets et les pages de cette sauvegarde à ta bibliothèque ? Tes contenus actuels seront conservés.'))return;const mapping=new Map(),imageMapping=new Map();for(const t of data.library.topics){const id=uid();mapping.set(t.id,id);t.id=id;}const tx=db.transaction('images','readwrite'),completed=done(tx);for(const p of data.library.pages)for(const b of p.blocks)if(b.type==='image'){if(!imageMapping.has(b.image)){const id=uid();imageMapping.set(b.image,id);tx.objectStore('images').put(data.images[b.image],id);}b.image=imageMapping.get(b.image);}await completed;for(const p of data.library.pages){p.id=uid();p.topic=mapping.get(p.topic);for(const b of p.blocks)b.id=uid();}library.topics.push(...data.library.topics);library.pages.push(...data.library.pages);changed();await save();navigate('home');notice(dirty?'Import chargé, mais non enregistré. Exporte une sauvegarde avant de fermer.':'Sauvegarde importée. Tes contenus précédents ont été conservés.');}catch(error){notice(error.message||'Impossible d’importer ce fichier.');}};
window.addEventListener('beforeunload',event=>{if(dirty||saving){event.preventDefault();event.returnValue='';}});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&ready)save();});
start();
