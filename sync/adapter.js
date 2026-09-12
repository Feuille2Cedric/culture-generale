window.startCurioSync=async function(){
 const adapter={
  app:'curio',empty:()=>({topics:[],pages:[]}),editing:()=>mode==='editor'||Boolean(document.querySelector('dialog[open]:not(.sync-dialog)')),
  read:async()=>{
   if(!await save())throw Error('Termine la sauvegarde locale avant de synchroniser.');
   const stored=await req(db.transaction('state').objectStore('state').get('library'));
   if(stored&&stored.revision!==revision){library=structuredClone(stored.library);revision=stored.revision;render();}
   return structuredClone(library);
  },
  imageIds:doc=>[...new Set(doc.pages.flatMap(p=>p.blocks.filter(b=>b.type==='image').map(b=>b.image)))],
  image:async id=>req(db.transaction('images').objectStore('images').get(id)),
  export:(doc,images)=>({format:'curio',version:1,exportedAt:new Date().toISOString(),library:doc,images}),
  validate:async(doc,downloaded)=>{const images={...downloaded};for(const id of adapter.imageIds(doc))if(!images[id])images[id]=await adapter.image(id);validateBackup(adapter.export(doc,images));},
  freeze:()=>{const nodes=[...document.querySelectorAll('main,aside')],values=nodes.map(el=>el.inert);nodes.forEach(el=>el.inert=true);return()=>nodes.forEach((el,i)=>el.inert=values[i]);},
  apply:async(doc,downloaded)=>{
   const images={...downloaded};for(const id of adapter.imageIds(doc))if(!images[id])images[id]=await adapter.image(id);
   validateBackup(adapter.export(doc,images));
   const tx=db.transaction(['state','images'],'readwrite'),wait=done(tx),store=tx.objectStore('state');
   const current=await req(store.get('library'));
   if((current?.revision||0)!==revision){tx.abort();try{await wait;}catch{}throw Error('Une autre fenêtre a changé les données locales. Recharge la page.');}
   const nextRevision=revision+1;store.put({library:doc,revision:nextRevision},'library');
   for(const [id,value] of Object.entries(downloaded))tx.objectStore('images').put(value,id);
   await wait;library=structuredClone(doc);revision=nextRevision;render();
  }
 };
 window.curioSync=new PersonalSync(adapter);
 try{await window.curioSync.init();}catch(e){window.curioSync.message('Synchronisation indisponible : '+e.message);}
};
