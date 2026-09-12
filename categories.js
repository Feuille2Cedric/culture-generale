'use strict';
let categoryFilter = 'all', categoryEditId = null, categoryTopicId = null;
const categoriesOf = t => t?.categories || [];
const categoryOf = p => categoriesOf(library.topics.find(t=>t.id===p.topic)).find(c=>c.id===p.category);
const categoryKey = value => value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr');
function recoverNotionCategories(doc){
 let updated=false;
 for(const p of doc.pages){
  if(p.category!==undefined || p.source?.type!=='notion-html' || !Array.isArray(p.source.path) || p.source.path.length<3)continue;
  const t=doc.topics.find(t=>t.id===p.topic);
  const title=p.source.path.slice(1,-1).filter(s=>typeof s==='string').map(s=>s.replace(/[\s\u{1F000}-\u{1FFFF}\u2600-\u27FF\uFE0F\u200D]+$/u,'').trim()).filter(Boolean).join(' / ');
  if(!t||!title)continue;
  t.categories ||= [];
  let c=t.categories.find(c=>categoryKey(c.title)===categoryKey(title));
  if(!c){c={id:uid(),title};t.categories.push(c);}
  p.category=c.id;updated=true;
 }
 return updated;
}
function categoryOptions(p){return `<label for="page-category">Sous-catégorie</label><select id="page-category"><option value="">Non classée</option>${ordered(categoriesOf(library.topics.find(t=>t.id===p.topic))).map(c=>`<option value="${esc(c.id)}" ${p.category===c.id?'selected':''}>${esc(c.title)}</option>`).join('')}</select><button class="secondary" data-category-new="true" type="button">+ Sous-catégorie</button>`;}
function categoryToolbar(t){
 const all=livePages().filter(p=>p.topic===t.id),cats=ordered(categoriesOf(t));
 if(!['all','unfiled',...cats.map(c=>c.id)].includes(categoryFilter))categoryFilter='all';
 const chip=(id,label,count)=>`<button class="category-chip ${categoryFilter===id?'selected':''}" data-category-filter="${esc(id)}" aria-pressed="${categoryFilter===id}">${esc(label)} <span>${count}</span></button>`;
 const suggestions=categoryKey(t.title)==='cinema'?['Acteurs','Films']:categoryKey(t.title)==='musique'?['Albums','Ballets','Singles']:[];
 return `<section class="category-panel" aria-label="Sous-catégories"><div class="category-heading"><span class="eyebrow">EXPLORER PAR SOUS-CATÉGORIE</span><button class="secondary" data-category-new="true">+ Sous-catégorie</button></div><div class="category-chips">${chip('all','Tout',all.length)}${cats.map(c=>chip(c.id,c.title,all.filter(p=>p.category===c.id).length)).join('')}${chip('unfiled','Non classées',all.filter(p=>!categoryOf(p)).length)}</div>${cats.some(c=>c.id===categoryFilter)?`<div class="category-actions"><button data-category-rename="${esc(categoryFilter)}">Renommer</button><button data-category-delete="${esc(categoryFilter)}">Supprimer la sous-catégorie</button></div>`:''}${!cats.length&&suggestions.length?`<div class="category-suggestions"><span>Pour commencer :</span>${suggestions.map(s=>`<button data-category-suggest="${esc(s)}">+ ${esc(s)}</button>`).join('')}</div>`:''}</section>`;
}
function filteredTopicPages(){return livePages().filter(p=>p.topic===topicId&&(categoryFilter==='all'||categoryFilter==='unfiled'&&!categoryOf(p)||p.category===categoryFilter));}
function openCategoryDialog(id=null,suggestion=''){
 categoryTopicId=topicId;categoryEditId=id;
 const existing=categoriesOf(topic()).find(c=>c.id===id);
 $('#category-dialog-title').textContent=existing?'Renommer la sous-catégorie':'Créer une sous-catégorie';
 $('#category-name').value=existing?.title||suggestion;
 $('#category-name').setCustomValidity('');
 $('#category-dialog').showModal();$('#category-name').focus();
}
function initCategories(){
 $('#category-cancel').onclick=()=>$('#category-dialog').close();
 $('#category-name').oninput=()=>$('#category-name').setCustomValidity('');
 $('#category-form').onsubmit=event=>{
  event.preventDefault();const t=library.topics.find(t=>t.id===categoryTopicId),name=$('#category-name'),title=name.value.trim();
  if(!t)return;
  if(!title){name.setCustomValidity('Donne un nom à cette sous-catégorie.');name.reportValidity();return;}
  if(categoriesOf(t).some(c=>c.id!==categoryEditId&&categoryKey(c.title)===categoryKey(title))){name.setCustomValidity('Cette sous-catégorie existe déjà dans ce sujet.');name.reportValidity();return;}
  t.categories ||= [];let c=t.categories.find(c=>c.id===categoryEditId);
  if(c)c.title=title;else{c={id:uid(),title};t.categories.push(c);}
  if(mode==='editor'&&page()?.topic===t.id){page().category=c.id;page().updated=Date.now();}else categoryFilter=c.id;
  changed();$('#category-dialog').close();render();
 };
 document.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button||!ready)return;const d=button.dataset;
  if(d.categoryNew)return openCategoryDialog();
  if(d.categorySuggest)return openCategoryDialog(null,d.categorySuggest);
  if(d.categoryRename)return openCategoryDialog(d.categoryRename);
  if(d.categoryFilter){categoryFilter=d.categoryFilter;return render();}
  if(d.categoryDelete){
   const t=topic(),c=categoriesOf(t).find(c=>c.id===d.categoryDelete);if(!c)return;
   if(!confirm(`Supprimer « ${c.title} » ? Ses connaissances seront conservées dans « Non classées ».`))return;
   t.categories=t.categories.filter(item=>item.id!==c.id);
   for(const p of library.pages)if(p.topic===t.id&&p.category===c.id)p.category='';
   categoryFilter='all';changed();render();
  }
 });
 $('#view').addEventListener('change',event=>{
  if(event.target.id==='page-category'&&page()){page().category=event.target.value;page().updated=Date.now();changed();}
 });
}
