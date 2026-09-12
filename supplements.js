/* Curated supplements add pages to existing subjects without replacing local work. */
function planSupplement(current, data) {
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

async function importSupplement(data){
 if(!await save())throw Error('Enregistre ou exporte tes modifications locales avant cet import.');
 const plan=planSupplement(library,data);
 if(!plan.added){notice('Ce complément est déjà présent. Aucune page ajoutée.');return;}
 if(!confirm(`Ajouter ${plan.added} nouvelles connaissances à tes thèmes ? Tes pages actuelles seront conservées. Les pages de ce complément déjà présentes seront ignorées.`))return;
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
 const nodes=[...document.querySelectorAll('main,aside')],inert=nodes.map(n=>n.inert),sync=window.curioSync;
 const priorBusy=sync?.busy;
 if(priorBusy)throw Error('Une synchronisation est en cours. Réessaie l’import dans quelques instants.');
 if(sync)sync.busy=true;
 nodes.forEach(n=>n.inert=true);
 try{
  const tx=db.transaction(['state','images'],'readwrite'),wait=done(tx),store=tx.objectStore('state');
  const stored=await req(store.get('library'));
  if((stored?.revision||0)!==revision){tx.abort();try{await wait;}catch{}throw Error('Une autre fenêtre a modifié la bibliothèque. Recharge avant de réessayer.');}
  const next=revision+1;
  if(plan.merged)store.put({library:structuredClone(library),revision},'before-topic-repair');
  store.put({library:plan.library,revision:next},'library');
  for(const [id,image] of Object.entries(plan.images))tx.objectStore('images').put(image,id);
  await wait;library=plan.library;revision=next;
  status('● Enregistré dans ce navigateur');navigate('home');
  notice(plan.merged?`${plan.merged} sujets regroupés. Toutes tes pages et images sont conservées.`:`${plan.added} connaissances ajoutées à tes thèmes. ${plan.skipped} déjà présente(s), ignorée(s).`);
  sync?.mark();
 }finally{
  if(sync)sync.busy=false;
  nodes.forEach((n,i)=>n.inert=inert[i]);
  if(sync?.meta.owner&&sync.meta.owner!==sync.user?.id)sync.lock(true);
 }
}
