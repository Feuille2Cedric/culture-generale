/* Curated supplements add pages to existing subjects without replacing local work. */
function planSupplement(current, data) {
 if(data.supplement?.version===2)return planSupplementUpdates(current,data);
 if(data.supplement?.version!==1||typeof data.supplement.id!=='string')throw Error('Complément Curio invalide.');
 const result=structuredClone(current),images={},topicMap=new Map(),categoryMap=new Map(),imageMap=new Map();
 const key=value=>value.trim().normalize('NFC').toLocaleLowerCase('fr');
 const knownPages=new Set(result.pages.map(p=>p.id));
 const fingerprint=(p,topics)=>JSON.stringify([key(topics.find(t=>t.id===p.topic)?.title||''),p.title,p.kind||'article',p.author||'',p.blocks.map(({type,text,url,layout})=>({type,text,url,layout}))]);
 const knownContent=new Set(result.pages.map(p=>fingerprint(p,result.topics)));
 const incoming=data.library.pages.filter(p=>!knownPages.has(p.id)&&!knownContent.has(fingerprint(p,data.library.topics)));
 let added=0;
 for(const source of data.library.topics){
  if(!incoming.some(p=>p.topic===source.id))continue;
  let target=result.topics.find(t=>t.id===source.id);
  if(!target){const matches=result.topics.filter(t=>key(t.title)===key(source.title));if(matches.length===1)target=matches[0];}
  if(!target){target={...structuredClone(source),categories:[]};result.topics.push(target);}
  topicMap.set(source.id,target.id);
  const categories=new Map();
  for(const sourceCategory of source.categories||[]){
   if(!incoming.some(p=>p.topic===source.id&&p.category===sourceCategory.id))continue;
   target.categories??=[];
   let category=target.categories.find(c=>c.id===sourceCategory.id)||target.categories.find(c=>key(c.title)===key(sourceCategory.title));
   if(!category){category=structuredClone(sourceCategory);target.categories.push(category);}
   categories.set(sourceCategory.id,category.id);
  }
  categoryMap.set(source.id,categories);
 }
 for(const source of incoming){
  const page=structuredClone(source);page.topic=topicMap.get(source.topic);
  if(source.category)page.category=categoryMap.get(source.topic).get(source.category);
  for(const block of page.blocks){
   block.id=crypto.randomUUID();
   if(block.type==='image'){
    if(!imageMap.has(block.image)){
     const id=crypto.randomUUID();imageMap.set(block.image,id);images[id]=data.images[block.image];
    }
    block.image=imageMap.get(block.image);
   }
  }
  result.pages.push(page);added++;
 }
 return {library:result,images,added,skipped:data.library.pages.length-added};
}

// A v2 pack explicitly identifies each work. Existing notes are never replaced.
// Older clients reject v2 packs, so they cannot accidentally import duplicate books.
function planSupplementUpdates(current,data){
 const pack=data.supplement;
 if(typeof pack.id!=='string'||!pack.id||!Array.isArray(pack.operations)||pack.operations.length!==data.library.pages.length)throw Error('Complément de mise à jour invalide.');
 const result=structuredClone(current),images={},imageMap=new Map(),processed=new Set();
 const key=s=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr').replace(/œ/g,'oe').replace(/[^a-z0-9]/g,'');
 const copyBlocks=blocks=>structuredClone(blocks).map(b=>{
  b.id=crypto.randomUUID();
  if(b.type==='image'){
   if(!imageMap.has(b.image)){const id=crypto.randomUUID();imageMap.set(b.image,id);images[id]=data.images[b.image];}
   b.image=imageMap.get(b.image);
  }
  return b;
 });
 let added=0,updated=0,skipped=0;
 for(const op of pack.operations){
  if(!op||typeof op.pageId!=='string'||processed.has(op.pageId)||!['append','cover'].includes(op.mode)||typeof op.createIfMissing!=='boolean'||!Array.isArray(op.matchIds)||!op.matchIds.every(x=>typeof x==='string')||!Array.isArray(op.matchTitles)||!op.matchTitles.length||!op.matchTitles.every(x=>typeof x==='string'&&x.trim()))throw Error('Opération de complément invalide.');
  processed.add(op.pageId);
  const source=data.library.pages.find(p=>p.id===op.pageId);
  if(!source)throw Error('Page du complément introuvable.');
  if(op.mode==='cover'&&(op.createIfMissing||source.blocks.filter(b=>b.type==='image').length!==1||source.blocks.some(b=>!['image','link'].includes(b.type))))throw Error('Une couverture seule ne peut pas modifier le texte ni créer une page.');
  const topic=data.library.topics.find(t=>t.id===source.topic),titles=new Set(op.matchTitles.map(key));
  const candidates=result.pages.filter(p=>p.id===source.id||op.matchIds.includes(p.id)||
   (titles.has(key(p.title))&&key(result.topics.find(t=>t.id===p.topic)?.title||'')===key(topic.title)));
  if(candidates.length>1)throw Error(`Plusieurs fiches correspondent à « ${source.title} ». Aucun changement enregistré : renomme les fiches pour identifier celle à compléter.`);
  const target=candidates[0],marker=pack.id+'/'+op.pageId;
  if(target){
   if(Array.isArray(target.supplementImports)&&target.supplementImports.includes(marker)){skipped++;continue;}
   const covers=source.blocks.filter(b=>b.type==='image'),rest=source.blocks.filter(b=>b.type!=='image');
   target.blocks.unshift(...copyBlocks(covers));
   target.blocks.push(...copyBlocks(rest));
   target.supplementImports=[...(Array.isArray(target.supplementImports)?target.supplementImports:[]),marker];
   target.updated=Date.now();updated++;
  }else{
   if(!op.createIfMissing)throw Error(`La fiche « ${source.title} » est introuvable. Aucun changement enregistré : importe d’abord la fiche existante à compléter.`);
   const matches=result.topics.filter(t=>t.id===topic.id||key(t.title)===key(topic.title));
   if(matches.length>1)throw Error(`Regroupe d’abord les sujets « ${topic.title} » en double.`);
   let dest=matches[0];
   if(!dest){dest={...structuredClone(topic),categories:[]};result.topics.push(dest);}
   const page={...structuredClone(source),topic:dest.id,blocks:copyBlocks(source.blocks),supplementImports:[marker]};
   if(source.category){
    const category=topic.categories.find(c=>c.id===source.category);
    dest.categories??=[];
    let mapped=dest.categories.find(c=>c.id===category.id||key(c.title)===key(category.title));
    if(!mapped){mapped=structuredClone(category);dest.categories.push(mapped);}
    page.category=mapped.id;
   }
   result.pages.push(page);added++;
  }
 }
 return {library:result,images,added,updated,skipped};
}

async function importSupplement(data){
 if(!await save())throw Error('Enregistre ou exporte tes modifications locales avant cet import.');
 const plan=planSupplement(library,data);
 if(!plan.added&&!plan.updated){notice('Ce complément est déjà présent. Aucune modification.');return;}
 if(!confirm(`Ajouter ${plan.added} nouvelles connaissances${plan.updated?` et compléter ${plan.updated} fiches existantes`:''} ? Tes textes et images actuels seront conservés. Les éléments déjà importés seront ignorés.`))return;
 await commitSupplementPlan(plan);
}

function planTopicRepair(current){
 const result=structuredClone(current),names=new Map(),mapping=new Map(),topics=[];
 const key=s=>s.trim().normalize('NFC').toLocaleLowerCase('fr');
 for(const source of result.topics){
  let target=names.get(key(source.title));
  if(!target){target=source;names.set(key(source.title),target);topics.push(target);}
  const categories=new Map();
  for(const category of source.categories||[]){
   target.categories??=[];
   let match=target.categories.find(c=>key(c.title)===key(category.title));
   if(!match){match=structuredClone(category);target.categories.push(match);}
   categories.set(category.id,match.id);
  }
  if(target!==source&&source.description&&source.description!==target.description){
   target.description=[target.description,source.description].filter(Boolean).join('\n\n');
  }
  mapping.set(source.id,{id:target.id,categories});
 }
 for(const p of result.pages){const target=mapping.get(p.topic);p.topic=target.id;if(p.category)p.category=target.categories.get(p.category)||p.category;}
 const merged=result.topics.length-topics.length;result.topics=topics;
 return {library:result,images:{},merged,added:0,skipped:0};
}

async function repairDuplicateTopics(){
 try{
  if(!ready||!await save())return;
  const plan=planTopicRepair(library);
  if(!plan.merged){notice('Aucun sujet en double.');return;}
  if(!confirm(`Regrouper ${plan.merged} sujets en double ? Toutes les pages et images seront conservées. Les sous-catégories de même nom seront réunies.`))return;
  await commitSupplementPlan(plan);
 }catch(e){notice(e.message||'Impossible de regrouper les sujets.');}
}

async function commitSupplementPlan(plan){
 // Freeze interaction and pause sync while committing pages and images atomically.
 // Selecting an import file gives focus back to the window, which can start a sync
 // cycle at the exact same time. Wait for that cycle instead of rejecting the import.
 const nodes=[...document.querySelectorAll('main,aside')],inert=nodes.map(n=>n.inert),sync=window.curioSync;

 if(sync){
  const deadline=Date.now()+30000;

  while(sync.busy){
   if(Date.now()>=deadline){
    throw Error('La synchronisation prend trop de temps. Réessaie l’import dans quelques instants.');
   }

   await new Promise(resolve=>setTimeout(resolve,100));
  }

  // Claim the sync flag synchronously before another focus/interval cycle can start.
  sync.busy=true;
 }

 nodes.forEach(n=>n.inert=true);

 try{
  const tx=db.transaction(['state','images'],'readwrite'),
        wait=done(tx),
        store=tx.objectStore('state');

  const stored=await req(store.get('library'));

  if((stored?.revision||0)!==revision){
   tx.abort();

   try{
    await wait;
   }catch{}

   throw Error('Une autre fenêtre a modifié la bibliothèque. Recharge avant de réessayer.');
  }

  const next=revision+1;

  if(plan.merged||plan.updated){
   store.put(
    {
     library:structuredClone(library),
     revision
    },
    plan.merged?'before-topic-repair':'before-supplement-update'
   );
  }

  store.put(
   {
    library:plan.library,
    revision:next
   },
   'library'
  );

  for(const [id,image] of Object.entries(plan.images)){
   tx.objectStore('images').put(image,id);
  }

  await wait;

  library=plan.library;
  revision=next;

  status('● Enregistré dans ce navigateur');
  navigate('home');

  notice(
   plan.merged
    ? `${plan.merged} sujets regroupés. Toutes tes pages et images sont conservées.`
    : `${plan.added} connaissances ajoutées. ${plan.updated||0} fiches complétées. ${plan.skipped} déjà présente(s), ignorée(s).`
  );

  sync?.mark();

 }finally{

  if(sync){
   sync.busy=false;
  }

  nodes.forEach((n,i)=>{
   n.inert=inert[i];
  });

  if(sync?.meta.owner&&sync.meta.owner!==sync.user?.id){
   sync.lock(true);
  }
 }
}
