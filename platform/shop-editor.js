(function(){
'use strict';
const {$,esc,money,endpoint,api,status,task,imageData}=PlatformUI;
const Display=MarcheDisplay;
let draft,ownerKey,dirty=false,disposeFilters;
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
function mount(target,data,reload){
 const shop=data.shop;
 if(!shop)return;
 if(ownerKey!==shop.id||!draft||!dirty){
  dirty=false;ownerKey=shop.id;draft={...shop,design:JSON.parse(JSON.stringify(shop.design||{}))};
  draft.design.quick_filters||=[];
  if(!draft.design.banners)draft.design.banners=data.branding?.includes('banner')?[{id:'legacy',x:50,y:50,zoom:1}]:[];
  draft.logoSrc=data.branding?.includes('logo')?endpoint('/seller/brand/'+encodeURIComponent(shop.slug)+'/logo'):'';
 }
 let selected='',mobile=false,loading=0;
 const url=t=>t.src||endpoint(t.id==='legacy'?'/seller/brand/'+encodeURIComponent(shop.slug)+'/banner':'/seller/banner/'+encodeURIComponent(t.id));
 const enabled=data.branches.some(b=>b.enabled),ready=enabled&&data.listings.some(l=>l.state==='approved'&&data.branches.some(b=>b.id===l.branch_id&&b.enabled));
 target.innerHTML=`<div class="ms-editor-head"><div><p class="pf-kicker">MAKE YOURSELF AT HOME</p><h2>Your shop, made yours.</h2></div><span class="pf-pill">${shop.published?'Published':'Draft · only you can preview'}</span></div>
 <div class="ms-progress"><span>${enabled?'✓':'1.'} Connect your stock</span><span>${ready?'✓':'2.'} Add your first listing</span><span>${shop.published?'✓':'3.'} Make it yours & publish</span></div>
 <div class="ms-editor"><aside class="ms-inspector">
 <section class="pf-card"><h3 class="ms-section-title">The essentials</h3><form id="ms-details" class="pf-form">
 <label>Shop name<input name="name" required maxlength="90" value="${esc(draft.name)}"></label>
 <label>Shop address<input name="slug" required maxlength="40" pattern="[a-z0-9][a-z0-9-]{2,39}" value="${esc(draft.slug)}"></label>
 <label>Your story<textarea name="description" maxlength="600">${esc(draft.description)}</textarea></label>
 <label>Accent colour<input name="accent" type="color" value="${esc(draft.accent)}"></label></form></section>
 <section class="pf-card"><h3 class="ms-section-title">Your banner</h3><p class="ms-help">Upload straight into the space on your preview. Combine up to six photos, then drag, crop or zoom each one.</p>
 <button type="button" id="ms-banner-add">Add banner images</button><div id="ms-image-list" class="pf-stack"></div></section>
 <section class="pf-card"><h3 class="ms-section-title">Quick filters</h3><p class="ms-help">Use your product categories, such as Pastry, Bread or Cookies. Add as many as you need. Extra filters appear under More categories.</p>
 <form id="ms-add-filter" class="pf-form"><div class="ms-add-filter"><input name="category" maxlength="60" aria-label="Category for quick filter" list="ms-categories" placeholder="e.g. Pastry" required><button type="submit" aria-label="Add quick filter">Add</button></div>
 <datalist id="ms-categories">${[...new Set(data.listings.map(x=>x.category))].filter(Boolean).map(x=>'<option value="'+esc(x)+'">').join('')}</datalist></form><div id="ms-filter-list" class="ms-filter-tags"></div></section>
 </aside><section class="ms-preview-wrap"><div class="ms-preview-tools"><span>LIVE PREVIEW · changes show here first</span><div class="pf-actions"><button type="button" data-size="desktop" aria-pressed="true">Desktop</button><button type="button" data-size="mobile" aria-pressed="false">Mobile</button></div></div>
 <div id="ms-preview" class="ms-preview"></div><p class="ms-canvas-hint">Click your banner or logo to personalise it. Preview products come from your catalogue.</p></section></div>
 <div class="ms-publish-bar"><div><strong id="ms-save-label">All changes saved</strong><p>${shop.published?'Save to update your published shop.':ready?'Your first listing is ready. Publish whenever you are.':'Add an enabled branch and a ready listing before publishing.'}</p></div><div class="pf-actions"><button type="button" id="ms-discard">Discard changes</button><button type="button" id="ms-save">Save changes</button><button type="button" class="primary" id="ms-publish" ${!shop.published&&!ready?'disabled':''}>${shop.published?'Unpublish shop':'Publish shop'}</button></div></div>
 <input type="file" id="ms-banner-file" accept="image/jpeg,image/png,image/webp" multiple hidden><input type="file" id="ms-logo-file" accept="image/jpeg,image/png,image/webp" hidden>
 <dialog id="ms-crop" class="ms-crop" aria-labelledby="ms-crop-title"><div class="ms-crop-body"><div><p class="pf-kicker">FRAME YOUR PHOTO</p><h2 id="ms-crop-title">Make the right part shine.</h2></div><p class="ms-help">Drag the image or use the position sliders. Zoom in to crop more closely.</p><div id="ms-crop-stage"></div><div class="ms-crop-controls pf-form"><label>Horizontal position<input type="range" min="0" max="100" name="x" aria-label="Horizontal position"></label><label>Vertical position<input type="range" min="0" max="100" name="y" aria-label="Vertical position"></label><label>Zoom<input type="range" min="1" max="3" step="0.01" name="zoom" aria-label="Zoom"></label></div><div class="pf-actions"><button type="button" id="ms-crop-apply" class="primary">Use this crop</button><button type="button" id="ms-crop-cancel">Cancel</button></div></div></dialog>`;
 function changed(){dirty=true;$('ms-save-label').textContent='Unsaved changes';}
 function draw(){
  disposeFilters?.();
  const products=data.listings.filter(l=>l.state!=='archived'&&(!selected||String(l.category).toLowerCase()===selected.toLowerCase())).slice(0,4);
  $('ms-preview').classList.toggle('mobile',mobile);
  $('ms-preview').innerHTML=`<div class="ms-preview-brand"><strong>Mi Marché</strong><span>Your independent shop</span></div>${Display.banner(draft.design.banners,url,true)}
   <button type="button" class="ms-add-banner" id="ms-canvas-upload">${draft.design.banners.length?'＋ Add another banner image':'＋ Upload your banner here'}</button>
   <div class="ms-identity" style="border-bottom:3px solid ${esc(draft.accent)}"><div class="ms-logo-upload"><button type="button" class="ms-logo-slot" id="ms-logo-pick" aria-label="Upload shop logo">${draft.logoSrc?'<img alt="Shop logo" src="'+esc(draft.logoSrc)+'">':'＋'}</button><div><strong>Shop logo</strong><br><small>Click to upload${draft.logoSrc?' · <button type="button" id="ms-logo-remove">Remove</button>':''}</small></div></div><h2>${esc(draft.name||'Your shop name')}</h2><p>${esc(draft.description||'Tell customers a little about your shop.')}</p></div>
   <div class="ms-preview-catalogue">${Display.filters(draft.design.quick_filters,selected)}<div class="ms-preview-products">${products.map(p=>'<article class="ms-preview-product">'+(p.preview_photo_id?'<img alt="" src="'+esc(endpoint('/seller/photo/'+encodeURIComponent(p.preview_photo_id)))+'">':'<div class="ms-product-placeholder" aria-hidden="true">'+esc(p.title.slice(0,1))+'</div>')+'<strong>'+esc(p.title)+'</strong><p>'+esc(p.category||'Other')+'</p><strong>'+esc(p.price_pence?money(p.price_pence):'Add a price')+'</strong></article>').join('')||'<p class="pf-muted">'+(selected?'No products in this category yet. Use the same category on your listings.':'Your products will appear here when you add them.')+'</p>'}</div></div>`;
  disposeFilters=Display.bindFilters($('ms-preview'),value=>{selected=value;draw();});
  $('ms-canvas-upload').onclick=pickBanner;$('ms-logo-pick').onclick=()=>$('ms-logo-file').click();
  if($('ms-logo-remove'))$('ms-logo-remove').onclick=()=>{draft.logoSrc='';draft.logo=null;draft.remove_logo=true;changed();draw();};
  $('ms-preview').querySelectorAll('[data-edit-tile]').forEach(b=>b.onclick=()=>crop(Number(b.dataset.editTile)));
  $('ms-image-list').innerHTML=draft.design.banners.map((t,i)=>'<div class="pf-actions"><button type="button" data-crop="'+i+'">Edit image '+(i+1)+'</button><button type="button" data-move="'+i+'" aria-label="Move image '+(i+1)+' left" '+(i===0?'disabled':'')+'>←</button><button type="button" data-remove="'+i+'" aria-label="Remove image '+(i+1)+'">Remove</button></div>').join('');
  $('ms-image-list').querySelectorAll('[data-crop]').forEach(b=>b.onclick=()=>crop(Number(b.dataset.crop)));
  $('ms-image-list').querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{draft.design.banners.splice(Number(b.dataset.remove),1);changed();draw();});
  $('ms-image-list').querySelectorAll('[data-move]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.move);[draft.design.banners[i-1],draft.design.banners[i]]=[draft.design.banners[i],draft.design.banners[i-1]];changed();draw();});
  $('ms-filter-list').innerHTML=draft.design.quick_filters.map((f,i)=>'<div class="ms-filter-tag"><span>'+esc(f)+'</span><button type="button" data-up="'+i+'" aria-label="Move '+esc(f)+' earlier" '+(!i?'disabled':'')+'>←</button><button type="button" data-delete-filter="'+i+'" aria-label="Remove '+esc(f)+' filter">×</button></div>').join('');
  $('ms-filter-list').querySelectorAll('[data-delete-filter]').forEach(b=>b.onclick=()=>{const [removed]=draft.design.quick_filters.splice(Number(b.dataset.deleteFilter),1);if(selected===removed)selected='';changed();draw();});
  $('ms-filter-list').querySelectorAll('[data-up]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.up);[draft.design.quick_filters[i-1],draft.design.quick_filters[i]]=[draft.design.quick_filters[i],draft.design.quick_filters[i-1]];changed();draw();});
 }
 function pickBanner(){if(draft.design.banners.length>=6){status('You can combine up to six banner images. Remove one to add another.',true);return;}$('ms-banner-file').click();}
 function crop(i){
  const dialog=$('ms-crop'),tile={...draft.design.banners[i]},controls=dialog.querySelector('.ms-crop-controls');
  const paint=()=>{$('ms-crop-stage').innerHTML=Display.banner([tile],url);$('ms-crop-stage').firstChild.classList.add('ms-crop-stage');};
  for(const k of ['x','y','zoom']){controls.querySelector('[name='+k+']').value=tile[k];}
  controls.oninput=()=>{for(const k of ['x','y','zoom'])tile[k]=Number(controls.querySelector('[name='+k+']').value);paint();};
  let origin;
  const stage=$('ms-crop-stage');
  stage.onpointerdown=e=>{origin={clientX:e.clientX,clientY:e.clientY,x:tile.x,y:tile.y};stage.setPointerCapture(e.pointerId);};
  stage.onpointermove=e=>{if(!origin)return;tile.x=Math.max(0,Math.min(100,origin.x-(e.clientX-origin.clientX)/stage.clientWidth*100));tile.y=Math.max(0,Math.min(100,origin.y-(e.clientY-origin.clientY)/stage.clientHeight*100));for(const k of ['x','y'])controls.querySelector('[name='+k+']').value=tile[k];paint();};
  stage.onpointerup=stage.onpointercancel=()=>{origin=null;};
  $('ms-crop-apply').onclick=()=>{draft.design.banners[i]=tile;changed();dialog.close();draw();};
  $('ms-crop-cancel').onclick=()=>dialog.close();paint();dialog.showModal();
 }
 const detail=$('ms-details');detail.onsubmit=e=>e.preventDefault();
 detail.oninput=()=>{for(const k of ['name','slug','description','accent'])draft[k]=detail.elements[k].value;changed();draw();};
 $('ms-banner-add').onclick=pickBanner;
 $('ms-banner-file').onchange=async e=>{
  loading++;$('ms-save-label').textContent='Preparing banner images…';
  try{
   const files=[...e.target.files];if(files.length+draft.design.banners.length>6)throw Error('Choose up to six images in total.');
   const fresh=[];for(const file of files){const photo=await imageData(file);fresh.push({photo,src:'data:image/jpeg;base64,'+photo,x:50,y:50,zoom:1});}
   draft.design.banners.push(...fresh);changed();draw();if(fresh.length===1)crop(draft.design.banners.length-1);
  }catch(err){status(err.message,true);}finally{loading--;e.target.value='';}
 };
 $('ms-logo-file').onchange=async e=>{loading++;try{draft.logo=await imageData(e.target.files[0]);draft.logoSrc='data:image/jpeg;base64,'+draft.logo;draft.remove_logo=false;changed();draw();}catch(err){status(err.message,true);}finally{loading--;e.target.value='';}};
 $('ms-add-filter').onsubmit=e=>{e.preventDefault();const f=e.target.elements.category.value.trim();if(!f)return;if(draft.design.quick_filters.some(x=>x.toLowerCase()===f.toLowerCase())){status('That quick filter is already added.',true);return;}draft.design.quick_filters.push(f);e.target.reset();changed();draw();};
 target.querySelectorAll('[data-size]').forEach(b=>b.onclick=()=>{mobile=b.dataset.size==='mobile';target.querySelectorAll('[data-size]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));draw();});
 async function save(published){
  if(loading)throw Error('Wait for your images to finish loading.');
  if(!detail.reportValidity())return;
  const controls=[...target.querySelectorAll('input,textarea,button')].map(x=>({el:x,disabled:x.disabled}));controls.forEach(x=>x.el.disabled=true);
  try{
   await api('/seller/shop',{body:{name:draft.name,slug:draft.slug,description:draft.description,accent:draft.accent,published,revision:draft.revision,logo:draft.logo,remove_logo:draft.remove_logo,
    design:{quick_filters:draft.design.quick_filters,banners:draft.design.banners.map(({src,...t})=>t)}}});
   draft=null;dirty=false;await reload();status(published?'Your storefront changes are published.':'Shop draft saved.');
  }finally{controls.forEach(x=>x.el.disabled=x.disabled);}
 }
 $('ms-discard').onclick=task($('ms-discard'),async()=>{draft=null;dirty=false;await reload();status('Unsaved shop changes discarded.');});
 $('ms-save').onclick=task($('ms-save'),()=>save(shop.published));
 $('ms-publish').onclick=task($('ms-publish'),()=>save(!shop.published));
 draw();if(dirty)$('ms-save-label').textContent='Unsaved changes';
 return {dirty:()=>dirty};
}
window.MarcheShopEditor={mount};
})();
