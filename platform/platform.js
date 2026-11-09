(function(){
'use strict';
const {$,esc,money,endpoint,api,status,task,bindForm,input,select,check,table,download,imageData}=PlatformUI;
const main=$('pf-main'),params=new URLSearchParams(location.search);
if(params.get('view')==='admin'){location.replace('/admin.html#platformAdmin');return;}
const view=['stock','seller','accounts'].includes(params.get('view'))?params.get('view'):'stock';
const views={stock:['Stock links','Keep workspaces separate or see their sellable stock in one pool.'],
 seller:['Your shop','Make it yours, connect your stock and start selling on Mi Marché.'],
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
  '<p class="pf-muted">'+esc(d.current.product_count)+' product groups. Each sale still uses its own branch’s stock.</p>'):'')+'<div id="pf-link-preview"></div>'+card('Inspected production returns',`<form id="pf-return-shop" class="pf-form">${select('Retail shop','inventory_id',[["","Choose a shop"],...d.inventories.filter(x=>x.kind==='retail').map(x=>[x.id,invLabel(x)])])}${submit('Find original batch sales')}</form><div id="pf-return-options"></div>`);
 bindForm($('pf-return-shop'),async v=>{const x=await api('/production/returns?'+new URLSearchParams(v)),host=$('pf-return-options');host.innerHTML=x.options.length?`<form id="pf-return-form" class="pf-form pf-space">${select('Product and original batch sale','choice',x.options.map((o,i)=>[i,o.name+' · '+o.batch_code+' · '+o.returnable_qty+' returnable · '+o.sale_reference]))}${input('Quantity','qty',1,'required type="number" min="1" step="1"')}${input('Inspection / return reason','reason','','required maxlength="240"')}${check('Batch verified, goods inspected and safe to resell','inspected')}${submit('Return to original batch')}</form>`:'<p class="pf-muted">No batch sales are available for a return.</p>';if(!x.options.length)return;const f=$('pf-return-form');let request_id=crypto.randomUUID();const limit=()=>{f.elements.qty.max=x.options[Number(f.elements.choice.value)].returnable_qty;};f.elements.choice.onchange=limit;limit();bindForm(f,async b=>{const o=x.options[Number(b.choice)];await api('/production/return',{body:{request_id,inventory_id:v.inventory_id,lot_id:o.lot_id,original_stock_event_id:o.original_stock_event_id,qty:Number(b.qty),reason:b.reason,inspected:!!b.inspected}});request_id=crypto.randomUUID();await stock();status('Inspected goods returned to their original batch.');});});
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

let sellerTab=params.get('tab')==='orders'?'orders':'shop',sellerData,search='',filter='all',offset=0;
async function seller(){
 sellerData=await api('/seller');
 if(!sellerData.shop)sellerTab='shop';
 renderSeller();
}
function renderSeller(){
 main.innerHTML=SellerNavigation.render(sellerData,sellerTab)+'<div id="pf-seller-view" class="pf-stack" role="tabpanel" aria-labelledby="seller-tab-'+sellerTab+'" tabindex="-1"></div>';
 SellerNavigation.bind(main,key=>{sellerTab=key;status();renderSeller();});
 const qr=main.querySelector('[data-print-storefront-qr]');
 if(qr)qr.onclick=()=>{try{MarcheQrDesigner.open(sellerData);}catch(error){status(error.message,true);}};
 const pending=({shop:shopForm,branches:branchForm,catalogue:catalogue,orders:orders,cases:paymentCases})[sellerTab]();if(pending?.catch)pending.catch(e=>status(e.message,true));
}
function shopForm(){
 const d=sellerData.shop, target=$('pf-seller-view');
 if(d&&sellerData.appearance_version===1&&window.MarcheShopEditor){
  target.innerHTML='<div id="ms-designer"></div><details class="pf-card"><summary>Payment settings</summary><div id="pf-payments" class="pf-stack pf-space" role="status">Checking payment setup…</div></details>';
  MarcheShopEditor.mount($('ms-designer'),sellerData,seller);paymentsPanel();return;
 }
 target.innerHTML=(sellerData.warnings?.length?card('Platform notices',table(sellerData.warnings)):'')+card(d?'Storefront details':'A place for your shop to call home.',`<p class="pf-muted">Start with a name and address. Next, personalise your storefront in a live preview, connect your stock and add your products.</p><form id="pf-shop" class="pf-form">
 ${input('Shop name','name',d?.name,'required maxlength="90"')}${input('Shop address','slug',d?.slug,'required maxlength="40" pattern="[a-z0-9][a-z0-9\x2d]{2,39}"')}
 ${area('Shop description','description',d?.description,'maxlength="600"')}${input('Accent colour','accent',d?.accent||'#6d43de','type="color"')}
 ${d?check('Publish this storefront','published',d.published):''}
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
  InventoryPaymentPanel.mount(panel,p,paymentsPanel,{expired:params.get('payments')==='refresh',shop:sellerData.shop});
 }catch(e){if(panel.isConnected&&generation===paymentLoad)panel.textContent='Payment status unavailable. '+e.message;}
}
function branchForm(){
 const d=sellerData,target=$('pf-seller-view');
 target.innerHTML=card('Branch fulfilment',`<form id="pf-branch" class="pf-form">
 ${select('Inventory','inventory_id',[['','Choose an inventory'],...d.inventories.map(x=>[x.id,invLabel(x)])])}
 ${input('Public branch name','name','','required maxlength="90"')}
 ${check('Offer free collection','collection')}
 <div class="pf-form" id="pf-collection-settings" hidden>
 ${input('Collection address (shared after payment)','collection_address','','maxlength="240"')}
 ${d.collection_distance_version===1
   ? input('Collection postcode area (optional)','collection_outcode','','maxlength="4" placeholder="e.g. M30" autocapitalize="characters" spellcheck="false" aria-describedby="pf-collection-help"')+
     '<p id="pf-collection-help" class="pf-muted">Enter the first part of the postcode to show customers an approximate collection distance.</p>'
   : ''}
 </div>
 ${input('Delivery fee in £ (blank to disable delivery)','delivery','','type="number" min="0" max="1000" step=".01"')}
 ${check('Branch is active','enabled',true)}${check('Create drafts automatically for new products','auto_drafts')}
 ${submit('Save branch')}</form>`)+
 (d.branches.length?'<div class="pf-grid">'+d.branches.map(b=>card(b.name,`<p class="pf-muted">${b.enabled?'Active':'Paused'} · ${b.collection?'Free collection':'No collection'} · ${b.delivery_pence==null?'No delivery':'Delivery '+esc(money(b.delivery_pence))}</p>
 ${b.collection&&b.collection_area?.outcode?'<p class="pf-muted">Collection distance from '+esc(b.collection_area.outcode)+'</p>':''}
 <div class="pf-actions">${btn('Edit','data-branch-edit="'+esc(b.inventory_id)+'"')}${btn('Import products','data-import="'+esc(b.id)+'"')}</div>`)).join('')+'</div>':'');
 const form=$('pf-branch'),field=k=>form.elements.namedItem(k);
 field('inventory_id').required=true;
 function toggleCollection(){
  const enabled=field('collection').checked;
  $('pf-collection-settings').hidden=!enabled;
  field('collection_address').required=enabled;
 }
 field('collection').onchange=toggleCollection;
 function fill(id){
  const b=d.branches.find(x=>x.inventory_id===id), inv=d.inventories.find(x=>x.id===id);
  field('inventory_id').value=id;field('name').value=b?.name||inv?.name||'';
  field('collection').checked=b?.collection||false;field('collection_address').value=b?.collection_address||'';
  if(field('collection_outcode'))field('collection_outcode').value=b?.collection_area?.outcode||'';
  field('delivery').value=b?.delivery_pence==null?'':(b.delivery_pence/100).toFixed(2);
  field('enabled').checked=b?.enabled??true;field('auto_drafts').checked=b?.auto_drafts??false;
  toggleCollection();
 }
 field('inventory_id').onchange=()=>fill(field('inventory_id').value);
 bindForm(form,async f=>{
  const branch=d.branches.find(x=>x.inventory_id===f.inventory_id);
  if(f.collection_outcode?.trim().toUpperCase()===branch?.collection_area?.outcode)delete f.collection_outcode;
  else if(f.collection_outcode!==undefined)f.collection_outcode=f.collection_outcode.trim();
  await api('/seller/branch',{body:{...f,collection:!!f.collection,enabled:!!f.enabled,auto_drafts:!!f.auto_drafts,delivery_pence:makePence(f.delivery)}});
  await seller();status('Branch saved.');
 });
 for(const b of target.querySelectorAll('[data-branch-edit]'))b.onclick=()=>{fill(b.dataset.branchEdit);field('name').focus();};
 for(const b of target.querySelectorAll('[data-import]'))b.onclick=task(b,async()=>{
  const r=await api('/seller/branch/'+encodeURIComponent(b.dataset.import)+'/import',{body:{}});
  sellerTab='catalogue';await seller();status(r.created+' new drafts imported.');
 });
}
function listingMessage(r){return r.state==='approved'?'Item ready for your published shop.':r.state==='review'?'This item needs a review before it can appear.':r.state==='blocked'?'Publication blocked: this item contains prohibited terms.':r.reason||'Draft saved. Add a price and photo to list it.';}
const draftTotal=n=>n+' draft'+(n===1?'':'s');
function catalogueActions(d){
 if(d.catalogue_tools?.version!==1)return '';
 const {visible,cleared}=d.catalogue_tools;
 const clear=visible?btn('Clear all drafts','id="pf-drafts-clear"'):'';
 const restore=cleared?btn('Restore '+cleared+' cleared draft'+(cleared===1?'':'s'),'id="pf-drafts-restore"'):'';
 return card('Catalogue tools',`<div class="pf-actions">${clear}${restore}</div>
  ${visible?`<p class="pf-muted">${esc(draftTotal(visible))} can be cleared. Published items, reviews and inventory are kept.</p>`:''}
  ${d.branches.length?`<details id="pf-csv-panel"><summary>Bulk add from a spreadsheet</summary>
    <p class="pf-muted">Match SKUs from the chosen branch. Add new catalogue drafts or bring back cleared drafts. You can leave the other columns blank to use your saved product details.</p>
    <form class="pf-form" id="pf-csv-form">
     ${select('Branch','branch_id',d.branches.map(b=>[b.id,b.name]))}
     <label>Upload a CSV<input name="csv_file" type="file" accept=".csv,text/csv"></label>
     ${area('Or paste CSV data','csv_text','','maxlength="131072" rows="3" placeholder="sku,title,description,category,price,vat_rate"')}
     <p class="pf-muted">Export your spreadsheet as CSV UTF-8. Format SKUs as text to keep leading zeros. Up to 250 rows and 128 KB per import.</p>
     <div class="pf-actions">${submit('Preview import')}${btn('Download CSV template','id="pf-csv-template"')}</div>
    </form><div id="pf-csv-preview" class="pf-space" aria-live="polite"></div></details>`:
   '<p class="pf-muted">Connect a branch inventory in Stock &amp; delivery to import products.</p>'}`);
}
function bindCatalogueActions(){
 const clear=$('pf-drafts-clear'), restore=$('pf-drafts-restore');
 const change=async action=>{
  if(action==='clear'&&!window.confirm('Clear all catalogue drafts and pause automatic draft creation? Cleared drafts can be restored here.'))return;
  const r=await api('/seller/drafts',{body:{action}});
  offset=0;await seller();
  status(action==='clear'?draftTotal(r.count)+' cleared. Automatic draft creation paused.':'Restored '+draftTotal(r.count)+'.');
 };
 if(clear)clear.onclick=task(clear,()=>change('clear'));
 if(restore)restore.onclick=task(restore,()=>change('restore'));
 const form=$('pf-csv-form');
 if(!form)return;
 const preview=$('pf-csv-preview');
 let generation=0;
 form.addEventListener('input',()=>{generation++;preview.replaceChildren();});
 $('pf-csv-template').onclick=()=>download('mi-marche-product-import.csv',
   'sku,title,description,category,price,vat_rate\r\n001234,Example product,,Accessories,12.50,0\r\n','text/csv;charset=utf-8');
 bindForm(form,async (fields,active)=>{
  const current=++generation;
  preview.textContent='Checking the spreadsheet…';
  try{
   const file=active.elements.csv_file.files[0];
   if(file&&(!/\.csv$/i.test(file.name)||!file.size||file.size>131072))throw Error('Choose a CSV under 128 KB.');
   if(file&&fields.csv_text.trim())throw Error('Choose a CSV file or paste CSV data.');
   let csv=fields.csv_text;
   if(file){
    try{csv=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());}
    catch{throw Error('Save the spreadsheet as CSV UTF-8 and upload it again.');}
   }
   const route='/seller/branch/'+encodeURIComponent(fields.branch_id)+'/csv/';
   const r=await api(route+'preview',{body:{csv}});
   if(current!==generation||!preview.isConnected)return;
   preview.innerHTML=`<h3>Import preview</h3><p>${esc(r.ready)} ready · ${esc(r.rows.length-r.ready)} skipped</p>`+
     table(r.rows.map(row=>({row:row.line,sku:row.sku,title:row.title,price:row.price_pence==null?null:money(row.price_pence),result:row.status})))+
     (r.ready?btn('Import '+draftTotal(r.ready),'id="pf-csv-apply"'):'');
   const apply=$('pf-csv-apply');
   if(apply)apply.onclick=task(apply,async()=>{
    const imported=await api(route+'import',{body:{csv,preview_hash:r.preview_hash}});
    search='';filter='draft';offset=0;await seller();
    status(draftTotal(imported.imported)+' added to the catalogue.');
   });
  }catch(error){if(current===generation)preview.textContent=error.message;}
 });
}
function catalogue(){
 const target=$('pf-seller-view'), found=sellerData.listings.filter(x=>(filter==='all'||x.state===filter)&&
   [x.title,x.sku,x.branch_name].some(v=>String(v||'').toLowerCase().includes(search.toLowerCase())));
 const visible=found.slice(offset,offset+35);
 target.innerHTML=catalogueActions(sellerData)+card('Your products',`<p class="pf-muted">Add a price and photo, then your item lists automatically. Flagged words or photos go to review. Draft shops stay private until you publish them.</p><form id="pf-list-filter" class="pf-form">
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
 ${submit('Upload photo')}</form><div class="pf-actions pf-space">${btn('List item / recheck','data-submit-review')}</div></div></div>`}</details>`).join('')+
 '</div><div class="pf-actions">'+(offset>0?btn('Previous','id="pf-page-prev"'):'')+(offset+35<found.length?btn('Next','id="pf-page-next"'):'')+'</div>';
 bindCatalogueActions();
 bindForm($('pf-list-filter'),async f=>{search=f.search;filter=f.state;offset=0;catalogue();});
 if($('pf-page-prev'))$('pf-page-prev').onclick=()=>{offset=Math.max(0,offset-35);catalogue();};
 if($('pf-page-next'))$('pf-page-next').onclick=()=>{offset+=35;catalogue();};
 for(const el of target.querySelectorAll('[data-listing]')){
  const id=el.dataset.listing, route='/seller/listing/'+encodeURIComponent(id);
  const reopen=async()=>{await seller();const next=[...document.querySelectorAll('[data-listing]')].find(x=>x.dataset.listing===id);if(next)next.open=true;};
  const f=el.querySelector('[data-listing-form]'), img=el.querySelector('[data-photo-form]'), review=el.querySelector('[data-submit-review]');
  if(f)bindForm(f,async v=>{
   const r=await api(route,{body:{...v,one_off:!!v.one_off,price_pence:makePence(v.price),vat_rate:Number(v.vat_rate)}});
   await reopen();status(listingMessage(r));
  });
  if(img)bindForm(img,async (_,form)=>{const r=await api(route+'/photo',{body:{photo:await imageData(form.elements.file.files[0])}});await reopen();status(listingMessage(r));});
  if(review)review.onclick=task(review,async()=>{const r=await api(route+'/review',{body:{}});await reopen();status(listingMessage(r));});
 }
}
function orders(){
 const target=$('pf-seller-view');
 target.innerHTML=sellerData.orders.map(o=>card(o.branch_name,`<p><span class="pf-pill">${esc(o.provider==='demo'?'Test order · Simulated payment':o.provider==='stripe_live'?'Live payment':'Stripe sandbox')} · ${esc(o.payment_status)}</span> ${esc(o.method)} · ${esc(o.state)}</p>
 <p class="pf-muted">Order ${esc(o.order_reference)}</p><p>${esc(o.contact.name)} · ${esc(o.contact.email)}${o.method==='delivery'?'<br>'+esc([o.contact.address,o.contact.town,o.contact.postcode].join(', ')):''}</p>
 ${table(o.items)}${o.refunded_pence?'<p class="pf-warning">Refunded '+esc(money(o.refunded_pence))+'</p>':''}${o.risk_state?'<p class="pf-warning">Payment case needs review. Do not dispatch.</p>':''}${o.payment_status==='review'?'<p class="pf-warning">Stock needs review. Hold fulfilment.</p>':''}
 ${o.payment_status==='review'&&o.refunded_pence?btn('Release fully refunded reservation','data-release-refund="'+esc(o.order_reference)+'"'):''}
 ${sellerData.invoice_version===1&&(o.payment_status==='paid'||o.paid_at)?btn(o.provider==='stripe_live'?'Invoice':'Sample invoice','data-invoice-order="'+esc(o.order_reference)+'"'):''}
 ${o.payment_status==='held'?btn('Cancel unpaid reservation','data-cancel-order="'+esc(o.order_reference)+'"'):''}
 ${o.payment_status==='paid'&&!o.refunded_pence&&!o.risk_state&&((o.method==='delivery'&&o.state==='pending')||(o.method==='collection'&&['pending','ready'].includes(o.state)))?
  `<form class="pf-form" data-order="${esc(o.id)}">${o.method==='delivery'?input('Tracking reference','tracking','','maxlength="100"'):''}
  ${submit(o.method==='delivery'?'Mark sent':o.state==='pending'?'Ready for collection':'Mark collected')}</form>`:''}`)).join('')||card('No orders yet','<p class="pf-muted">Orders appear here, split by branch.</p>');
 target.insertAdjacentHTML('afterbegin','<div class="pf-actions">'+btn('Refresh orders','id="pf-refresh-orders"')+'</div>');
 $('pf-refresh-orders').onclick=task($('pf-refresh-orders'),seller);
 for(const b of target.querySelectorAll('[data-invoice-order]'))b.onclick=()=>{
  const route=reference=>'/seller/order/'+encodeURIComponent(reference)+'/invoice';
  InventorySaleInvoice.open({reference:b.dataset.invoiceOrder,load:reference=>api(route(reference)),
    submit:(reference,body)=>api(route(reference),{body})});
 };
 for(const b of target.querySelectorAll('[data-release-refund]'))b.onclick=task(b,async()=>{await api('/seller/order/'+encodeURIComponent(b.dataset.releaseRefund)+'/release-refunded',{body:{}});await seller();status('Refunded reservation released.');});
 for(const b of target.querySelectorAll('[data-cancel-order]'))b.onclick=task(b,async()=>{await api('/seller/order/'+encodeURIComponent(b.dataset.cancelOrder)+'/cancel',{body:{}});await seller();status('Reservation updated.');});
 for(const f of target.querySelectorAll('[data-order]'))bindForm(f,async v=>{
  const o=sellerData.orders.find(x=>x.id===f.dataset.order),state=o.method==='delivery'?'sent':o.state==='pending'?'ready':'collected';
  await api('/seller/branch-order/'+encodeURIComponent(o.id),{body:{...v,state}});await seller();status('Order updated.');
 });
}

async function paymentCases(){
 const host=$('pf-seller-view'),d=await api('/seller/cases');if(!host.isConnected)return;
 host.innerHTML=card('Refunds & payment cases','<p class="pf-warning">Refunds return money only. Restock returned goods separately after inspection. Handle dispute evidence in your Stripe Dashboard.</p>'+table(d.refunds)+table(d.risks))+
 card('Refund an order',`<form id="pf-refund" class="pf-form">${select('Paid order','order_id',[['','Choose an order'],...[...new Map(sellerData.orders.map(x=>[x.order_reference,x])).values()].filter(x=>x.provider!=='demo'&&['paid','review'].includes(x.payment_status)&&!x.risk_state).map(x=>[x.order_reference,x.order_reference])])}
 ${input('Reason','reason','','required maxlength="240"')}${check('Refund the entire remaining payment; stock stays unchanged','confirmed')}${submit('Confirm full refund')}</form>`)+card('Review a won dispute',`<form id="pf-dispute" class="pf-form">${select('Order','order_id',[["","Choose an order"],...[...new Map(sellerData.orders.filter(x=>x.risk_state==='review_dispute').map(x=>[x.order_reference,x])).values()].map(x=>[x.order_reference,x.order_reference])])}${submit('Recheck dispute with Stripe')}</form><p class="pf-muted">Only disputes confirmed as won can be cleared for fulfilment.</p>`);
 bindForm($('pf-dispute'),async v=>{await api('/seller/order/'+encodeURIComponent(v.order_id)+'/review-dispute',{body:{}});await seller();status('Dispute verified with Stripe.');});
 const form=$('pf-refund');let request_id=crypto.randomUUID();
 bindForm(form,async v=>{if(!v.confirmed)throw Error('Confirm the refund before proceeding');const r=await api('/seller/order/'+encodeURIComponent(v.order_id)+'/refund',{body:{request_id,reason:v.reason}});status('Refund '+r.state+'. Do not repeat with a new request.');if(['succeeded','failed','canceled'].includes(r.state))request_id=crypto.randomUUID();});
}
const reportLabels={summary:'Overview',sales:'Sales statement',refunds:'Returns',cash:'Cash reconciliation',valuation:'Stock valuation',vat:'VAT summary',expenses:'Expenses',history:'Audit history',marketplace:'Marketplace orders',marketplace_financials:'Live marketplace ledger',notices:'Access notices'};
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
   $('pf-pack').onclick=task($('pf-pack'),async()=>{const x=await api(base+'/pack?'+dates);download(x.filename,Uint8Array.from(atob(x.base64),c=>c.charCodeAt(0)),'application/zip');});
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
