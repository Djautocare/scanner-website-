(function(){
'use strict';
const {$,esc,money,endpoint,api,status,task,bindForm,input,select,check,table,download,imageData}=PlatformUI;
const main=$('pf-main'),params=new URLSearchParams(location.search);
if(params.get('view')==='admin'){location.replace('/admin.html#platformAdmin');return;}
const view=['stock','seller','accounts'].includes(params.get('view'))?params.get('view'):'stock';
const views={stock:['Stock links','Keep workspaces separate or see their sellable stock in one pool.'],
 seller:['Seller Centre','Set up a Mi Marché storefront, then review drafts and fulfil orders.'],
 accounts:['Accounts & Tax Centre','Build a dated record pack from your Retail shop.']};
$('pf-title').textContent=views[view][0];$('pf-subtitle').textContent=views[view][1];
for(const a of document.querySelectorAll('[data-view]')){
 if(a.dataset.view===view)a.setAttribute('aria-current','page');
}
function card(title,body){return '<section class="pf-card"><h2>'+esc(title)+'</h2>'+body+'</section>';}
function btn(text,extra=''){return '<button type="button" '+extra+'>'+esc(text)+'</button>';}
function submit(text){return '<button type="submit" class="primary">'+esc(text)+'</button>';}
function area(label,name,value='',opts=''){return '<label>'+esc(label)+'<textarea name="'+esc(name)+'" '+opts+'>'+esc(value)+'</textarea></label>';}
const invLabel=x=>x.name+' · '+(x.kind==='retail'?'Retail':'Reseller / Manufacturing')+' · '+x.workspace_name;
function makePence(v){return v===''?null:Math.round(Number(v)*100);}

async function stock(){
 const d=await api('/stock');
 const active=new Set(d.current?.current_ids||[]);
 const choices=d.inventories.map(i=>check(invLabel(i),'inventory',active.has(i.id)).replace('type="checkbox"','type="checkbox" value="'+esc(i.id)+'"'));
 main.innerHTML=card('Inventory sharing',`<p><span class="pf-pill">${active.size?'Linked · '+active.size+' inventories':'Independent stock'}</span></p>
 <p class="pf-muted">Quantities stay in their original branches and locations. The pool adds matching SKUs; it cannot tell if two inventories describe the same physical item. Materials are separate from finished stock.</p>
 <form class="pf-form" id="pf-link-form">${choices.join('')||'<p>No inventories owned by this account.</p>'}
 <div class="pf-actions">${submit('Preview selected inventories')}${btn('Keep stock independent','id="pf-independent"')}</div></form>`)+
 (active.size?card('Current pool',table(d.current.products.slice(0,40).map(x=>({sku:x.sku,name:x.name,quantity:x.quantity,unreserved:x.available})))+
  '<p class="pf-muted">'+esc(d.current.product_count)+' product groups. Each sale still uses its own branch’s stock.</p>'):'')+'<div id="pf-link-preview"></div>';
 const form=$('pf-link-form');
 form.onchange=()=>{$('pf-link-preview').replaceChildren();};
 const preview=async ids=>{
  const v=await api('/stock/preview',{body:{inventory_ids:ids}}), word=ids.length?'LINK STOCK':'KEEP INDEPENDENT';
  $('pf-link-preview').innerHTML=card(ids.length?'Review this stock link':'Review independent stock',`
   <p class="pf-warning">${ids.length?'This adds quantities across inventories. If the same units were entered more than once, they will be counted more than once. Check the overlaps before linking.':'Removing the shared view does not remove stock or cancel orders.'}</p>
   ${table(v.sources.map(x=>({inventory:x.name,quantity:x.quantity,reserved:x.reserved})))}
   ${v.overlap_count?'<h3>Overlapping SKUs · '+esc(v.overlap_count)+'</h3>'+table(v.overlaps.slice(0,35).map(x=>({sku:x.sku,product:x.name,combined:x.quantity}))):''}
   <form class="pf-form" id="pf-link-confirm">${input('Type '+word,'confirmation','','required autocomplete="off"')}
   ${submit(ids.length?'Confirm stock link':'Keep these inventories independent')}</form>`);
  bindForm($('pf-link-confirm'),async f=>{
   await api('/stock/confirm',{body:{inventory_ids:ids,preview_hash:v.preview_hash,confirmation:f.confirmation}});
   await stock();status(ids.length?'Inventories linked. Quantities remain in their original locations.':'Inventories are independent.');
  });
  $('pf-link-confirm').querySelector('input').focus();
 };
 bindForm(form,async()=>{
  const ids=new FormData(form).getAll('inventory');
  if(ids.length<2)throw Error('Select at least two inventories, or choose Keep stock independent.');
  await preview(ids);
 });
 $('pf-independent').onclick=task($('pf-independent'),()=>preview([]));
}

let sellerTab='shop',sellerData,search='',filter='all',offset=0;
async function seller(){
 sellerData=await api('/seller');
 if(!sellerData.shop)sellerTab='shop';
 renderSeller();
}
function renderSeller(){
 const d=sellerData, shop=d.shop;
 const tabs=[['shop','Shop'],['branches','Branches'],['catalogue','Catalogue & photos'],['orders','Orders']];
 main.innerHTML='<nav class="pf-tabs" aria-label="Seller sections">'+tabs.map(([k,label])=>btn(label,
  'data-seller-tab="'+k+'" '+(sellerTab===k?'aria-current="page"':'')+(shop?'':' disabled'))).join('')+
  (shop?'<a class="pf-button" href="/marche/?shop='+encodeURIComponent(shop.slug)+'">View storefront</a>':'')+'</nav><div id="pf-seller-view" class="pf-stack"></div>';
 for(const b of main.querySelectorAll('[data-seller-tab]'))b.onclick=()=>{sellerTab=b.dataset.sellerTab;status();renderSeller();};
 ({shop:shopForm,branches:branchForm,catalogue:catalogue,orders:orders})[sellerTab]();
}
function shopForm(){
 const d=sellerData.shop, target=$('pf-seller-view');
 target.innerHTML=card(d?'Storefront details':'Create a storefront',`<form id="pf-shop" class="pf-form">
 ${input('Shop name','name',d?.name,'required maxlength="90"')}${input('Shop address','slug',d?.slug,'required maxlength="40" pattern="[a-z0-9][a-z0-9\x2d]{2,39}"')}
 ${area('Shop description','description',d?.description,'maxlength="600"')}${input('Accent colour','accent',d?.accent||'#6d43de','type="color"')}
 ${d?check('Publish this shop in the staging marketplace','published',d.published):''}
 ${submit(d?'Save storefront':'Create storefront')}</form>`)+
 (d?card('Logo and banner',`<form id="pf-brand" class="pf-form">${select('Image type','kind',[['logo','Logo'],['banner','Banner']])}
 <label>Choose a photo<input type="file" name="file" accept="image/jpeg,image/png,image/webp" required></label>${submit('Upload image')}</form>`)+
 card('Payments','<div id="pf-payments" class="pf-stack" role="status">Checking Stripe payment setup…</div>'):'');
 bindForm($('pf-shop'),async f=>{
  await api('/seller/shop',{body:{...f,published:!!f.published,revision:d?.revision}});await seller();status('Shop saved.');
 });
 if(!d)return;
 bindForm($('pf-brand'),async (f,form)=>{
  await api('/seller/brand',{body:{kind:f.kind,photo:await imageData(form.elements.file.files[0])}});form.reset();status('Image uploaded.');
 });
 paymentsPanel();
}
let paymentLoad=0;
async function paymentsPanel(){
 const generation=++paymentLoad;
 const panel=$('pf-payments');
 if(!panel)return;
 try{
  const p=await api('/seller/payments');if(!panel.isConnected||generation!==paymentLoad)return;
  const labels={not_configured:'Payments not configured',not_started:'Set up your payments',creation_pending:'Finish setting up payments',
   incomplete:'More information needed',pending:'Stripe is reviewing your details',ready:'Ready to accept test payments',
   unavailable:'Could not check Stripe status',review_required:'Payment setup needs support review',assigned_test_account:'Operator-assigned test account'};
  const canStart=p.configured&&!['assigned_test_account','review_required','unavailable'].includes(p.status);
  panel.innerHTML='<p><span class="pf-pill">'+esc(labels[p.status]||'Check payment setup')+'</span></p>'+
   '<p class="pf-muted">Stripe collects your business, bank and identity details securely. InventoryOS receives 0.5% of the goods total; Stripe processing fees are separate.</p>'+
   '<p class="pf-warning">Sandbox setup. This does not enable live payments.</p>'+
   (p.action_needed?'<p>Stripe needs additional information. Continue setup or open your Stripe Dashboard.</p>':'')+
   (p.status==='not_configured'?'<p class="pf-muted">The platform owner needs to configure the Stripe sandbox before sellers can begin.</p>':'')+
   (params.get('payments')==='refresh'?'<p>The previous Stripe link expired or was already used. Continue setup to open a fresh link.</p>':'')+
   '<div class="pf-actions">'+
   (canStart?btn(p.status==='not_started'?'Set up payments':p.ready?'Review Stripe setup':'Continue setup','id="pf-payment-start" class="primary"'):'')+
   btn('Refresh payment status','id="pf-payment-refresh"')+
   (p.configured?'<a class="pf-button" href="https://dashboard.stripe.com/" target="_blank" rel="noopener noreferrer">Open Stripe Dashboard</a>':'')+'</div>';
  const start=$('pf-payment-start');
  if(start)start.onclick=task(start,async()=>{
   const x=await api('/seller/payments/start',{body:{}}),u=new URL(x.url);
   if(u.protocol!=='https:'||u.hostname!=='connect.stripe.com'||u.username||u.password)throw Error('Unexpected Stripe setup address');
   location.assign(u.href);
  });
  $('pf-payment-refresh').onclick=task($('pf-payment-refresh'),paymentsPanel);
 }catch(e){if(panel.isConnected&&generation===paymentLoad)panel.textContent='Payment status unavailable. '+e.message;}
}
function branchForm(){
 const d=sellerData,target=$('pf-seller-view');
 target.innerHTML=card('Branch fulfilment',`<form id="pf-branch" class="pf-form">
 ${select('Inventory','inventory_id',[['','Choose an inventory'],...d.inventories.map(x=>[x.id,invLabel(x)])])}
 ${input('Public branch name','name','','required maxlength="90"')}
 ${check('Offer collection','collection')}${input('Collection address (shared after payment)','collection_address','','maxlength="240"')}
 ${input('Delivery fee in £ (blank to disable delivery)','delivery','','type="number" min="0" max="1000" step=".01"')}
 ${check('Branch is active','enabled',true)}${check('Create drafts automatically for new products','auto_drafts')}
 ${submit('Save branch')}</form>`)+
 (d.branches.length?'<div class="pf-grid">'+d.branches.map(b=>card(b.name,`<p class="pf-muted">${b.enabled?'Active':'Paused'} · ${b.collection?'Collection available':'No collection'} · ${b.delivery_pence==null?'No delivery':'Delivery '+esc(money(b.delivery_pence))}</p>
 <div class="pf-actions">${btn('Edit','data-branch-edit="'+esc(b.inventory_id)+'"')}${btn('Import products','data-import="'+esc(b.id)+'"')}</div>`)).join('')+'</div>':'');
 const form=$('pf-branch'),field=k=>form.elements.namedItem(k);
 field('inventory_id').required=true;
 function fill(id){
  const b=d.branches.find(x=>x.inventory_id===id), inv=d.inventories.find(x=>x.id===id);
  field('inventory_id').value=id;field('name').value=b?.name||inv?.name||'';
  field('collection').checked=b?.collection||false;field('collection_address').value=b?.collection_address||'';
  field('delivery').value=b?.delivery_pence==null?'':(b.delivery_pence/100).toFixed(2);
  field('enabled').checked=b?.enabled??true;field('auto_drafts').checked=b?.auto_drafts??false;
 }
 field('inventory_id').onchange=()=>fill(field('inventory_id').value);
 bindForm(form,async f=>{
  await api('/seller/branch',{body:{...f,collection:!!f.collection,enabled:!!f.enabled,auto_drafts:!!f.auto_drafts,delivery_pence:makePence(f.delivery)}});
  await seller();status('Branch saved.');
 });
 for(const b of target.querySelectorAll('[data-branch-edit]'))b.onclick=()=>{fill(b.dataset.branchEdit);field('name').focus();};
 for(const b of target.querySelectorAll('[data-import]'))b.onclick=task(b,async()=>{
  const r=await api('/seller/branch/'+encodeURIComponent(b.dataset.import)+'/import',{body:{}});
  sellerTab='catalogue';await seller();status(r.created+' new drafts imported.');
 });
}
function catalogue(){
 const target=$('pf-seller-view'), found=sellerData.listings.filter(x=>(filter==='all'||x.state===filter)&&
   [x.title,x.sku,x.branch_name].some(v=>String(v||'').toLowerCase().includes(search.toLowerCase())));
 const visible=found.slice(offset,offset+35);
 target.innerHTML=card('Find a product',`<form id="pf-list-filter" class="pf-form">
 ${input('Search by product, SKU or branch','search',search)}
 ${select('Status','state',['all','draft','review','approved','blocked','archived'].map(s=>[s,s==='all'?'All statuses':s]),filter)}
 ${submit('Apply filter')}</form><p class="pf-muted">${found.length} results · showing ${visible.length}</p>`)+
 '<div class="pf-stack">'+visible.map(l=>`<details class="pf-card" data-listing="${esc(l.id)}"><summary>${esc(l.title)} · ${esc(l.branch_name)} <span class="pf-pill">${esc(l.state)}</span></summary>
 <p class="pf-muted">${esc(l.sku)} · ${l.photos} photo${l.photos===1?'':'s'}${l.review_reason?' · '+esc(l.review_reason):''}</p>
 ${l.state==='archived'?'':`<div class="pf-grid-2">
 <form class="pf-form" data-listing-form>${input('Product title','title',l.title,'required maxlength="140"')}
 ${area('Description','description',l.description,'maxlength="1800"')}${input('Category','category',l.category,'maxlength="60"')}
 ${input('Selling price (£)','price',l.price_pence==null?'':(l.price_pence/100).toFixed(2),'required type="number" min=".01" max="100000" step=".01"')}
 ${select('VAT rate included in price','vat_rate',[[0,'0% / none'],[5,'5%'],[20,'20%']],l.vat_rate)}
 ${check('One-off item: archive photos after it sells','one_off',l.one_off)}${submit('Save details')}</form>
 <div><form class="pf-form" data-photo-form><label>Take or choose a product photo<input name="file" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" required></label>
 ${submit('Upload photo')}</form><div class="pf-actions pf-space">${btn('Send for review','data-submit-review')}</div></div></div>`}</details>`).join('')+
 '</div><div class="pf-actions">'+(offset>0?btn('Previous','id="pf-page-prev"'):'')+(offset+35<found.length?btn('Next','id="pf-page-next"'):'')+'</div>';
 bindForm($('pf-list-filter'),async f=>{search=f.search;filter=f.state;offset=0;catalogue();});
 if($('pf-page-prev'))$('pf-page-prev').onclick=()=>{offset=Math.max(0,offset-35);catalogue();};
 if($('pf-page-next'))$('pf-page-next').onclick=()=>{offset+=35;catalogue();};
 for(const el of target.querySelectorAll('[data-listing]')){
  const id=el.dataset.listing, route='/seller/listing/'+encodeURIComponent(id);
  const reopen=async()=>{await seller();const next=[...document.querySelectorAll('[data-listing]')].find(x=>x.dataset.listing===id);if(next)next.open=true;};
  const f=el.querySelector('[data-listing-form]'), img=el.querySelector('[data-photo-form]'), review=el.querySelector('[data-submit-review]');
  if(f)bindForm(f,async v=>{
   await api(route,{body:{...v,one_off:!!v.one_off,price_pence:makePence(v.price),vat_rate:Number(v.vat_rate)}});
   await reopen();status('Details saved.');
  });
  if(img)bindForm(img,async (_,form)=>{await api(route+'/photo',{body:{photo:await imageData(form.elements.file.files[0])}});await reopen();status('Photo uploaded.');});
  if(review)review.onclick=task(review,async()=>{await api(route+'/review',{body:{}});await reopen();status('Listing sent for review.');});
 }
}
function orders(){
 const target=$('pf-seller-view');
 target.innerHTML=sellerData.orders.map(o=>card(o.branch_name,`<p><span class="pf-pill">${esc(o.provider==='demo'?'Demo payment':'Stripe sandbox')} · ${esc(o.payment_status)}</span> ${esc(o.method)} · ${esc(o.state)}</p>
 <p class="pf-muted">Order ${esc(o.order_reference)}</p><p>${esc(o.contact.name)} · ${esc(o.contact.email)}${o.method==='delivery'?'<br>'+esc([o.contact.address,o.contact.town,o.contact.postcode].join(', ')):''}</p>
 ${table(o.items)}${o.payment_status==='review'?'<p class="pf-warning">Stock needs review. Hold fulfilment.</p>':''}
 ${o.payment_status==='paid'&&((o.method==='delivery'&&o.state==='pending')||(o.method==='collection'&&['pending','ready'].includes(o.state)))?
  `<form class="pf-form" data-order="${esc(o.id)}">${o.method==='delivery'?input('Tracking reference','tracking','','maxlength="100"'):''}
  ${submit(o.method==='delivery'?'Mark sent':o.state==='pending'?'Ready for collection':'Mark collected')}</form>`:''}`)).join('')||card('No orders yet','<p class="pf-muted">Paid test orders appear here, split by branch.</p>');
 for(const f of target.querySelectorAll('[data-order]'))bindForm(f,async v=>{
  const o=sellerData.orders.find(x=>x.id===f.dataset.order),state=o.method==='delivery'?'sent':o.state==='pending'?'ready':'collected';
  await api('/seller/branch-order/'+encodeURIComponent(o.id),{body:{...v,state}});await seller();status('Order updated.');
 });
}

const reportLabels={summary:'Overview',sales:'Sales statement',refunds:'Returns',cash:'Cash reconciliation',valuation:'Stock valuation',vat:'VAT summary',expenses:'Expenses',history:'Audit history',marketplace:'Marketplace test orders',notices:'Access notices'};
const localDay=()=>{const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Europe/London'}).formatToParts().map(p=>[p.type,p.value]));return parts.year+'-'+parts.month+'-'+parts.day;};
async function accounts(){
 const dir=await api('/stock'), shops=dir.inventories.filter(i=>i.kind==='retail');
 main.innerHTML=card('Report period',`<form class="pf-form" id="pf-accounts">
  ${select('Retail shop','shop',[['','Choose a shop'],...shops.map(i=>[i.id,invLabel(i)])])}
  ${input('Start date','start',localDay().slice(0,8)+'01','type="date" required')}
  ${input('End date','end',localDay(),'type="date" required')}${submit('Run report')}</form>`)+
  '<div id="pf-report" class="pf-stack"></div>';
 const f=$('pf-accounts');f.elements.shop.required=true;
 bindForm(f,async d=>{
  const base='/accounts/'+encodeURIComponent(d.shop), dates=new URLSearchParams({start:d.start,end:d.end});
  const report=await api(base+'?'+dates), target=$('pf-report');let sheet='summary';
  function show(){
   const rows=sheet==='summary'?Object.entries(report.summary).map(([metric,value])=>({metric:metric.replaceAll('_',' '),value:metric.endsWith('_pence')&&value!=null?money(value):value})):report[sheet].slice(0,100);
   target.innerHTML=card(report.store.name,`<p class="pf-muted">${esc(report.start)} to ${esc(report.end)} · ${esc(report.timezone)}</p>
    <p class="pf-warning">${report.coverage.valuation_available?'Stock is estimated at recorded unit cost. Check missing costs and review the report before filing.':'No opening stock record exists for that period end.'} Test orders are kept separate.</p>
    <nav class="pf-tabs" aria-label="Reports">${Object.entries(reportLabels).map(([key,label])=>btn(label,'data-sheet="'+key+'" '+(sheet===key?'aria-current="page"':''))).join('')}</nav>
    ${table(rows)}<div class="pf-actions">${btn('Download CSV','data-export="csv"')}${btn('Download PDF','data-export="pdf"')}${btn('Download period pack','id="pf-pack"')}</div>`)+
   card('Record an expense',`<form class="pf-form" id="pf-expense">${input('Date','day',localDay(),'type="date" required')}
    ${input('Category','category','','required maxlength="80"')}${input('Total including VAT (£)','total','','type="number" required min=".01" step=".01"')}
    ${input('VAT included (£)','vat','0','type="number" required min="0" step=".01"')}${input('Reference or note','detail','','maxlength="240"')}${submit('Record expense')}</form>`);
   for(const b of target.querySelectorAll('[data-sheet]'))b.onclick=()=>{sheet=b.dataset.sheet;show();};
   for(const b of target.querySelectorAll('[data-export]'))b.onclick=task(b,async()=>{
    const x=await api(base+'?'+new URLSearchParams({...Object.fromEntries(dates),sheet,format:b.dataset.export}));
    download(x.filename,Uint8Array.from(atob(x.base64),c=>c.charCodeAt(0)),b.dataset.export==='pdf'?'application/pdf':'text/csv');
   });
   $('pf-pack').onclick=()=>download('inventoryos-period-pack-'+report.end+'.json',JSON.stringify(report,null,2));
   const expense=$('pf-expense');let request_id=crypto.randomUUID();
   bindForm(expense,async v=>{
    await api(base+'/expense',{body:{...v,request_id,total_pence:makePence(v.total),vat_pence:makePence(v.vat)}});
    request_id=crypto.randomUUID();f.requestSubmit();status('Expense recorded.');
   });
  }
  show();
 });
 if(shops.length===1)f.elements.shop.value=shops[0].id;
}

async function run(){
 if(!InventoryAPI.isLoggedIn()){location.href="/login.html?returnTo="+encodeURIComponent("/platform/?view="+view);return;}
 const s=await api('/status');
 if(!(s.enabled||s.staging))throw Error('These tools are not enabled for your account.');
 if(s.pilot)$('pf-rollout').textContent='Private pilot · Changes affect your selected test inventories. Payments are in test mode.';
 await api('/access');
 await ({stock,seller,accounts})[view]();
}
function failed(e){if(!PlatformUI.showAccessGate(main,e,()=>run().catch(failed)))status(e.message,true);}
document.addEventListener('inventoryos:security-changed',()=>run().catch(failed));
run().catch(failed);
})();
