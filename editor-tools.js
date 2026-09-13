'use strict';

// Pointer events cover mouse, pen and touch; the handle also works with a keyboard.
let blockDrag=null, imageQueue=Promise.resolve(), pendingImagePaste=null;
function editorAvailable(){return ready&&mode==='editor'&&page()&&!page().deleted&&!$('#view').closest('[inert]')&&!conflict;}
function moveEditorBlock(id,index){
 if(!editorAvailable())return;
 const blocks=page().blocks,from=blocks.findIndex(b=>b.id===id);
 if(from<0)return;
 index=Math.max(0,Math.min(blocks.length-1,index));
 if(from===index)return;
 blocks.splice(index,0,blocks.splice(from,1)[0]);page().updated=Date.now();changed();render();
 [...document.querySelectorAll('[data-drag-block]')].find(b=>b.dataset.dragBlock===id)?.focus({preventScroll:true});
 notice(`Bloc déplacé en position ${index+1} sur ${blocks.length}.`);
}
function finishBlockDrag(commit){
 const drag=blockDrag;if(!drag)return;blockDrag=null;cancelAnimationFrame(drag.frame);
 document.body.classList.remove('block-dragging');drag.element.classList.remove('dragging');
 if($('#view').hasPointerCapture(drag.pointer))$('#view').releasePointerCapture(drag.pointer);
 if(!drag.started)return;
 if(!editorAvailable()||page()!==drag.page||!drag.element.isConnected)return;
 const ids=[...$('#blocks').children].map(el=>el.dataset.block),old=drag.page.blocks;
 if(commit&&ids.length===old.length&&ids.every(id=>old.some(b=>b.id===id))){
  const changedOrder=ids.some((id,i)=>id!==old[i].id);
  if(changedOrder){drag.page.blocks=ids.map(id=>old.find(b=>b.id===id));drag.page.updated=Date.now();changed();}
  render();notice(`Bloc placé en position ${ids.indexOf(drag.id)+1} sur ${ids.length}.`);
 }else render();
 [...document.querySelectorAll('[data-drag-block]')].find(b=>b.dataset.dragBlock===drag.id)?.focus({preventScroll:true});
}
function previewBlockDrag(){
 const d=blockDrag;if(!d||!d.started)return;
 if(!editorAvailable()||page()!==d.page||!d.element.isConnected){finishBlockDrag(false);return;}
 const others=[...$('#blocks').children].filter(el=>el!==d.element);
 const next=others.find(el=>{const r=el.getBoundingClientRect();return d.y<r.top+r.height/2;});
 if(d.element.nextElementSibling!==(next||null))$('#blocks').insertBefore(d.element,next||null);
}
function scrollBlockDrag(){
 const d=blockDrag;if(!d||!d.started)return;
 const delta=d.y<90?-Math.min(18,(90-d.y)/4):d.y>innerHeight-90?Math.min(18,(d.y-innerHeight+90)/4):0;
 if(delta){window.scrollBy(0,delta);previewBlockDrag();}
 if(blockDrag)d.frame=requestAnimationFrame(scrollBlockDrag);
}
$('#view').addEventListener('pointerdown',event=>{
 const handle=event.target.closest('[data-drag-block]');
 if(!handle||!editorAvailable()||event.button!==0||blockDrag)return;
 blockDrag={id:handle.dataset.dragBlock,element:handle.closest('[data-block]'),page:page(),pointer:event.pointerId,x:event.clientX,y:event.clientY,startY:event.clientY,started:false};
 $('#view').setPointerCapture(event.pointerId);
});
$('#view').addEventListener('pointermove',event=>{
 const d=blockDrag;if(!d||d.pointer!==event.pointerId)return;d.y=event.clientY;
 if(!d.started&&Math.hypot(event.clientX-d.x,event.clientY-d.startY)>6){d.started=true;d.element.classList.add('dragging');document.body.classList.add('block-dragging');d.frame=requestAnimationFrame(scrollBlockDrag);}
 if(d.started){event.preventDefault();previewBlockDrag();}
});
$('#view').addEventListener('pointerup',event=>{if(blockDrag?.pointer===event.pointerId)finishBlockDrag(true);});
$('#view').addEventListener('pointercancel',()=>finishBlockDrag(false));
$('#view').addEventListener('lostpointercapture',()=>finishBlockDrag(false));
window.addEventListener('blur',()=>finishBlockDrag(false));
document.addEventListener('keydown',event=>{
 if(event.key==='Escape'&&blockDrag){event.preventDefault();finishBlockDrag(false);return;}
 const handle=event.target.closest('[data-drag-block]');if(!handle||!editorAvailable())return;
 const i=page().blocks.findIndex(b=>b.id===handle.dataset.dragBlock);
 const positions={ArrowUp:i-1,ArrowDown:i+1,Home:0,End:page().blocks.length-1};
 if(Object.hasOwn(positions,event.key)){event.preventDefault();moveEditorBlock(handle.dataset.dragBlock,positions[event.key]);}
});

function queueEditorImages(files,intent){
 const origin=intent.library||library;
 imageQueue=imageQueue.catch(()=>{}).then(async()=>{
  const valid=()=>{
   const target=library.pages.find(p=>p.id===intent.pageId);
   if(library!==origin||!target||target.deleted||conflict||window.curioSync?.meta.owner&&window.curioSync.meta.owner!==window.curioSync.user?.id)throw Error('La page a changé. Reviens dans son éditeur pour ajouter l’image.');
   if(intent.replaceId&&!target.blocks.some(b=>b.id===intent.replaceId&&b.type==='image'))throw Error('Le bloc à remplacer n’existe plus.');
   return target;
  };
  valid();
  if(intent.replaceId&&files.length!==1)throw Error('Colle une seule image pour remplacer ce bloc.');
  const prepared=[];
  for(const file of files){
   if(!['image/png','image/jpeg','image/gif','image/webp'].includes(file.type)||file.size>12*1024*1024)throw Error('Choisis une image PNG, JPEG, GIF ou WebP de moins de 12 Mo.');
   const data=await readDataUrl(file),image=new Image();image.src=data;
   try{await image.decode();}catch{throw Error('Cette image est illisible. Essaie une autre image.');}
   prepared.push({id:uid(),data});
  }
  valid();
  const tx=db.transaction('images','readwrite'),finished=done(tx);
  for(const item of prepared)tx.objectStore('images').put(item.data,item.id);
  await finished;
  const target=valid();
  if(intent.replaceId){target.blocks.find(b=>b.id===intent.replaceId).image=prepared[0].id;}
  else{
   let index=target.blocks.findIndex(b=>b.id===intent.afterId);index=index<0?target.blocks.length:index+1;
   target.blocks.splice(index,0,...prepared.map(item=>({id:uid(),type:'image',image:item.id,text:'',layout:'wide'})));
  }
  target.updated=Date.now();changed();
  if(mode==='editor'&&pageId===target.id)render();
  notice(intent.replaceId?'Image remplacée. La légende et la disposition sont conservées.':`${prepared.length} image(s) ajoutée(s).`);
 }).catch(error=>notice(error.message||'Impossible d’enregistrer cette image.'));
 return imageQueue;
}
$('#image-input').onchange=event=>{
 const files=[...event.target.files];event.target.value='';if(!files.length)return;
 const intent=typeof imageTarget==='string'?{pageId:imageTarget}:imageTarget;
 if(intent)queueEditorImages(files,intent);
};
$('#view').addEventListener('click',async event=>{
 const button=event.target.closest('button');if(!button||!editorAvailable())return;
 if(button.dataset.replaceImage){pendingImagePaste=null;imageTarget={pageId,replaceId:button.dataset.replaceImage,library};$('#image-input').click();}
 if(button.dataset.pasteImage){
  const intent={pageId,replaceId:button.dataset.pasteImage,library};pendingImagePaste=intent;
  try{
   if(!navigator.clipboard?.read)throw Error();
   const items=await navigator.clipboard.read(),files=[];
   for(const item of items){const type=item.types.find(t=>['image/png','image/jpeg','image/gif','image/webp'].includes(t));if(type)files.push(await item.getType(type));}
   if(!files.length)throw Error();
   pendingImagePaste=null;await queueEditorImages(files,intent);
  }catch{
   if(mode==='editor'&&pageId===intent.pageId&&button.isConnected){button.focus();notice('Copie une image, puis appuie sur Ctrl + V (ou Cmd + V) sur ce bouton pour la remplacer.');}
   else pendingImagePaste=null;
  }
 }
});
document.addEventListener('paste',event=>{
 if(!editorAvailable()||!$('#view').contains(event.target))return;
 const files=[...(event.clipboardData?.items||[])].filter(i=>i.kind==='file'&&i.type.startsWith('image/')).map(i=>i.getAsFile()).filter(Boolean);
 if(!files.length)return;event.preventDefault();
 const replaceButton=event.target.closest('[data-paste-image]');
 const intent=replaceButton&&pendingImagePaste?.pageId===pageId&&pendingImagePaste.replaceId===replaceButton.dataset.pasteImage?pendingImagePaste:{pageId,afterId:event.target.closest('[data-block]')?.dataset.block};
 pendingImagePaste=null;queueEditorImages(files,intent);
});
