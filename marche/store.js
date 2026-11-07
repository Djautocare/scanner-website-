(function(){
'use strict';
const {$,esc,money,endpoint,api,status,task,bindForm,input,select}=PlatformUI;
const main=$('pf-main'), params=new URLSearchParams(location.search);
const pathSlug=location.hostname.startsWith('marche.')?location.pathname.split('/').filter(Boolean)[0]:'';
const handle=params.get('shop')||pathSlug||'';
const market=(path,body)=>api('/marche'+path,{body,publicOnly:true});
const route='/shop/'+encodeURIComponent(handle), KEY='ios-marche-staging-'+handle;
let checkoutAvailable=false;
let shop,catalogue=[],branches=[],cart=new Map(),methods=new Map(),quoted,order,search='',page=0;
function button(label,attr=''){return '<button type="button" '+attr+'>'+esc(label)+'</button>';}
function save(v){sessionStorage.setItem(KEY,JSON.stringify(v));}
function saved(){try{return JSON.parse(sessionStorage.getItem(KEY)||'null');}catch{return null;}}
function removeSaved(){sessionStorage.removeItem(KEY);}
function setText(id,text){$(id).textContent=text;}
function bodyItems(){
 return [...cart].map(([id,qty])=>({listing_id:id,qty,method:methods.get(catalogue.find(x=>x.id===id)?.branch_id)}));
}
function safeReturn(){
 const u=new URL(location.href);u.searchParams.delete('order');u.searchParams.delete('cancel');return u.href;
}
function base64url(){
 const b=crypto.getRandomValues(new Uint8Array(32));return btoa(String.fromCharCode(...b)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
}
async function directory(){
 const d=await market('/directory');
 main.innerHTML=d.shops.length?'<div class="pf-grid">'+d.shops.map(s=>
  `<article class="pf-card"><p class="pf-kicker">Independent shop</p><h2>${esc(s.name)}</h2>
  <p class="pf-muted">${esc(s.description||'Browse this storefront.')}</p>
  <a class="pf-button" href="/marche/?shop=${encodeURIComponent(s.slug)}">Visit shop</a></article>`).join('')+'</div>':
  '<article class="pf-card"><h2>No shops published yet</h2><p class="pf-muted">Create a test storefront in Seller Centre to try the marketplace.</p></article>';
}
async function loadShop(){
 const d=await market(route);
 shop=d.shop;catalogue=d.listings;branches=d.branches;checkoutAvailable=d.checkout==='staging';
 setText('pf-title',shop.name);setText('pf-subtitle',shop.description||'Browse items by branch, with delivery and collection where available.');
 if(/^#[a-f0-9]{6}$/i.test(shop.accent))$('pf-hero').style.borderBottom='4px solid '+shop.accent;
 for(const kind of ['logo','banner']){
  const img=document.createElement('img');img.className='pf-'+kind;img.alt='';img.hidden=true;
  img.onload=()=>{img.hidden=false;};img.src=endpoint('/marche/brand/'+encodeURIComponent(handle)+'/'+kind);
  $('pf-hero').prepend(img);
 }
 const s=saved(), expected=params.get('order')||s?.id;
 if(s?.id&&expected===s.id&&s.key){
  order=s;await showOrder();return;
 }
 if(params.has('order')){
  main.innerHTML='<div class="pf-card"><h2>Order link</h2><p>Open the checkout in the original browser tab to see its status.</p><a class="pf-button" href="'+esc(safeReturn())+'">Back to shop</a></div>';return;
 }
 // Keep a checkout attempt through transient network errors. An unchanged
 // submission repeats the same idempotent server request.
 if(s?.body){
  for(const x of s.body.items||[]){
   const l=catalogue.find(p=>p.id===x.listing_id);
   if(l){cart.set(l.id,x.qty);methods.set(l.branch_id,x.method);}
  }
 }
 renderShop();
}
function renderShop(){
 main.innerHTML='<div class="pf-split"><section id="pf-products" class="pf-stack"></section><aside id="pf-basket" class="pf-card pf-basket"></aside></div>';
 renderProducts();renderBasket();
}
function renderProducts(){
 const found=catalogue.filter(x=>[x.title,x.sku,x.category].some(v=>String(v||'').toLowerCase().includes(search.toLowerCase())));
 $('pf-products').innerHTML=`<form class="pf-form pf-card" id="pf-search">
  ${input('Search this shop','search',search)}<button type="submit">Search</button></form>
  <div class="pf-grid">${found.slice(page,page+30).map(x=>{
   const b=branches.find(s=>s.id===x.branch_id), canAdd=checkoutAvailable&&x.available>0&&(cart.get(x.id)||0)<x.available;
   return `<article class="pf-card pf-product">
    ${x.photo_id?'<img class="pf-photo" alt="" loading="lazy" src="'+esc(endpoint('/marche/photo/'+encodeURIComponent(x.photo_id)))+'">':''}
    <p class="pf-kicker">${esc(x.category)} · ${esc(b?.name)}</p><h2>${esc(x.title)}</h2>
    <p class="pf-muted">${esc(x.description)}</p><p class="pf-total">${esc(money(x.price_pence))}</p>
    <div class="pf-actions">${canAdd?button('Add to basket','data-add="'+esc(x.id)+'" class="primary"'):
     '<span class="pf-pill">'+(!checkoutAvailable?'Preview only':x.available?'In basket':x.sold_out_at?'Sold':'Unavailable')+'</span>'}</div>
    <details><summary>Report listing</summary><form class="pf-form" data-report="${esc(x.id)}">
     ${select('Reason','category',[['safety','Safety or prohibited item'],['counterfeit','Possible counterfeit'],['other','Other']])}
     ${input('Details (optional)','detail','','maxlength="350"')}<button type="submit">Send report</button></form></details>
   </article>`;
  }).join('')||'<p class="pf-muted">No items match this search.</p>'}</div>
  <div class="pf-actions">${page>0?button('Previous','id="pf-prev"'):''}${page+30<found.length?button('Next','id="pf-next"'):''}</div>`;
 bindForm($('pf-search'),async f=>{search=f.search;page=0;renderProducts();});
 if($('pf-prev'))$('pf-prev').onclick=()=>{page=Math.max(0,page-30);renderProducts();};
 if($('pf-next'))$('pf-next').onclick=()=>{page+=30;renderProducts();};
 for(const b of $('pf-products').querySelectorAll('[data-add]'))b.onclick=()=>{
  const x=catalogue.find(p=>p.id===b.dataset.add);
  if((cart.get(x.id)||0)>=x.available)return;
  cart.set(x.id,(cart.get(x.id)||0)+1);const branch=branches.find(b=>b.id===x.branch_id);
  if(!methods.has(x.branch_id))methods.set(x.branch_id,branch.collection?'collection':'delivery');
  quoted=null;renderBasket();renderProducts();status(x.title+' added.');
 };
 for(const f of $('pf-products').querySelectorAll('[data-report]'))bindForm(f,async v=>{
  await market('/listing/'+encodeURIComponent(f.dataset.report)+'/report',v);f.reset();status('Listing reported for review.');
 });
}
function renderBasket(){
 const basket=$('pf-basket');
 if(!checkoutAvailable){basket.innerHTML='<h2>Storefront preview</h2><p class="pf-muted">Online ordering is not open yet. No stock will be reserved and no payment will be taken.</p>';return;}
 const items=[...cart].map(([id,qty])=>({...catalogue.find(x=>x.id===id),qty})).filter(x=>x.id);
 if(!items.length){basket.innerHTML='<h2>Your basket</h2><p class="pf-muted">Add something from the shop to get started.</p>';return;}
 const byBranch=new Map();
 for(const item of items){const b=branches.find(x=>x.id===item.branch_id);if(!byBranch.has(b.id))byBranch.set(b.id,{...b,items:[]});byBranch.get(b.id).items.push(item);}
 basket.innerHTML=`<h2>Your basket</h2><form class="pf-form" id="pf-quote">
  ${[...byBranch.values()].map(b=>`<div class="pf-choice"><h3>${esc(b.name)}</h3>
   ${b.items.map(l=>`<div class="pf-actions"><span>${l.qty} × ${esc(l.title)} · ${esc(money(l.qty*l.price_pence))}</span>
    ${button('−','data-quantity="'+esc(l.id)+'" data-by="-1" aria-label="Remove one '+esc(l.title)+'"')}
    ${button('+','data-quantity="'+esc(l.id)+'" data-by="1" aria-label="Add one '+esc(l.title)+'" '+(l.qty>=l.available?'disabled':''))}</div>`).join('')}
   ${select('Fulfilment for '+b.name,b.id,[...(b.collection?[['collection','Free collection']]:[]),...(b.delivery_pence!=null?[['delivery','Delivery · '+money(b.delivery_pence)]]:[])],methods.get(b.id))}
   </div>`).join('')}
  <button type="submit" class="primary">Check total</button></form><div id="pf-quote-result"></div>`;
 const form=$('pf-quote');
 form.onchange=e=>{if(e.target.tagName==='SELECT'){methods.set(e.target.name,e.target.value);quoted=null;$('pf-quote-result').replaceChildren();}};
 bindForm(form,async()=>{quoted=await market(route+'/quote',{items:bodyItems()});renderQuote();});
 for(const b of basket.querySelectorAll('[data-quantity]'))b.onclick=()=>{
  const id=b.dataset.quantity,next=(cart.get(id)||0)+Number(b.dataset.by);
  if(next<=0)cart.delete(id);else cart.set(id,next);
  quoted=null;renderBasket();renderProducts();
 };
}
function renderQuote(){
 const v=quoted,delivery=v.branches.some(b=>b.method==='delivery'), previous=saved()?.body||{};
 $('pf-quote-result').innerHTML=`<div class="pf-choice"><h3>Total ${esc(money(v.total_pence))}</h3>
  <p class="pf-muted">Items ${esc(money(v.subtotal_pence))}${v.branches.map(b=>'<br>'+esc(b.name)+': '+(b.method==='collection'?'Free collection':esc(money(b.delivery_pence))+' delivery')).join('')}</p></div>
 <form class="pf-form" id="pf-pay">${input('Name','name',previous.name,'required maxlength="100"')}
  ${input('Email','email',previous.email,'type="email" required maxlength="254"')}
  ${delivery?input('Street address','address',previous.address,'required maxlength="150"')+input('Town','town',previous.town,'required maxlength="80"')+
    input('UK postcode','postcode',previous.postcode,'required maxlength="9"'):''}
  <p class="pf-muted">Use test details. This checkout does not accept live payments.</p><button type="submit" class="primary">Reserve and continue</button></form>`;
 bindForm($('pf-pay'),async f=>{
  const body={...f,items:bodyItems(),total_pence:v.total_pence},fingerprint=JSON.stringify(body), existing=saved();
  if(existing?.fingerprint===fingerprint)Object.assign(body,{client_id:existing.body.client_id,lookup_key:existing.key});
  else Object.assign(body,{client_id:crypto.randomUUID(),lookup_key:base64url()});
  const prior={body,key:body.lookup_key,fingerprint};save(prior);
  const result=await market(route+'/checkout',body);
  order={...prior,id:result.order_id,provider:result.provider};save(order);
  if(result.payment_url){
   const target=new URL(result.payment_url);
   if(target.protocol!=='https:'||target.hostname!=='checkout.stripe.com')throw Error('Unexpected payment address');
   location.href=target.href;return;
  }
  await showOrder();
 });
}
async function showOrder(){
 const v=await market('/order/'+encodeURIComponent(order.id),{lookup_key:order.key});
 const labels={paid:'Test order confirmed',held:'Stock reserved',review:'Payment needs review',released:'Reservation released'};
 main.innerHTML=`<section class="pf-card"><h2>${esc(labels[v.status]||v.status)}</h2><p class="pf-muted">Reference ${esc(v.order_id)}</p>
  <p class="pf-total">${esc(money(v.total_pence))}</p>
  ${v.branches.map(b=>'<div class="pf-choice"><strong>'+esc(b.branch_name)+'</strong><span>'+esc(b.method)+' · '+esc(b.state)+'</span>'+
   (b.collection_address?'<p>'+esc(b.collection_address)+'</p>':'')+(b.tracking?'<p>Tracking: '+esc(b.tracking)+'</p>':'')+'</div>').join('')}
  <div class="pf-actions">${v.status==='held'&&v.provider==='demo'?button('Confirm test payment','id="pf-demo-pay" class="primary"')+button('Cancel reservation','id="pf-demo-cancel"'):''}
   ${v.status==='held'&&v.provider==='stripe_test'?button('Check sandbox payment','id="pf-check-pay"'):''}
   ${v.status!=='held'?button('Back to shop','id="pf-shop-back"'):''}</div></section>`;
 for(const [id,action] of [['pf-demo-pay','pay'],['pf-demo-cancel','cancel']])if($(id))$(id).onclick=task($(id),async()=>{
  await market('/order/'+encodeURIComponent(order.id)+'/test',{lookup_key:order.key,action});await showOrder();
 });
 if($('pf-check-pay'))$('pf-check-pay').onclick=task($('pf-check-pay'),showOrder);
 if($('pf-shop-back'))$('pf-shop-back').onclick=()=>{removeSaved();location.href=safeReturn();};
}
async function run(){
 const s=await api('/status',{publicOnly:true});if(!(s.enabled||s.staging))throw Error('Mi Marché is not open for public orders yet.');
 if(s.mode==='general')$('pf-rollout').textContent='Mi Marché preview · Online checkout is not open yet.';
 if(s.pilot)$('pf-rollout').textContent='Private pilot · Only your account can access this marketplace. Use test stock and test contact details. No live payments.';
 await (handle?loadShop():directory());
}
run().catch(e=>status(e.message,true));
})();
