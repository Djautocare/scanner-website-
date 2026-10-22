(function(){'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>'£'+(Number(n||0)/100).toFixed(2),when=s=>s?new Date(s).toLocaleString('en-GB'):'Not started';
async function request(path,options={}){
 const r=await InventoryAPI.request(path,{...options,headers:{'X-Workspace-Id':'','X-Inventory-Ids':'',...options.headers}});
 if(!r.success)throw Error(r.error||'Email-receipt billing is unavailable. Please try again.');return r;
}
const pricing=`<details class="receipt-billing-pricing"><summary>Pricing &amp; usage ranges</summary><p>£2.99 for the first 30 days. After that, billed monthly in arrears using these ranges. Email receipts are a separate subscription for each shop; printed receipts are included in Retail.</p><div class="retail-table-wrap"><table class="retail-table"><thead><tr><th>Emailed receipts per usage month</th><th>Monthly fee</th></tr></thead><tbody><tr><td>0–1,000</td><td>£2.99</td></tr><tr><td>1,001–5,000</td><td>£4.99</td></tr><tr><td>5,001–10,000</td><td>£9.99</td></tr><tr><td>10,001–25,000</td><td>£19.99</td></tr></tbody></table></div><p>A paid Retail subscription is required. Cancelling Retail also schedules cancellation of this add-on. The usage month starts when the introductory 30 days end. The £2.99 minimum applies even with no sends.</p><p>Successful sends and requested resends count. Failed sends and automatic retries add no extra usage. Sending pauses at 25,000 per usage month; contact hello@inventoryos.co.uk for higher volumes. Cancellation stops renewal; usage already incurred can appear on the final invoice.</p></details>`;
function mount(root,{inventory='',paid=false}={}){
 if(!root)return;root.__receiptBilling?.destroy();
 let shops=[],busy=false,polls=0,timer=null,disposed=false;
 const alive=()=>!disposed&&root.isConnected;
 root.classList.add('receipt-billing');root.innerHTML='<h2>Email receipts</h2><p class="retail-muted">Optional add-on · billed separately for each shop</p>'+pricing+'<p data-receipt-notice role="status" aria-live="polite">Loading email-receipt billing…</p><div data-receipt-shops></div>';
 const note=t=>{if(alive())root.querySelector('[data-receipt-notice]').textContent=t;};
 const button=(label,action,s,disabled=false)=>'<button type="button" data-receipt-action="'+action+'" data-receipt-shop="'+esc(s.inventory_id)+'" '+(disabled?'disabled':'')+'>'+esc(label)+'</button>';
 function render(){
  if(!alive())return;
  root.querySelector('[data-receipt-shops]').innerHTML=shops.map(s=>{
   const a=s.receipts,status=a.override&&!a.subscribed?'Admin test access until '+when(a.override_expires_at):a.subscribed?(a.intro?'Introductory 30 days until '+when(a.intro_end):'Usage month ends '+when(a.period_end)):a.status==='none'?'Not activated':a.status.replaceAll('_',' ');
   return '<article class="receipt-billing-shop"><h3>'+esc(s.name)+'</h3>'+(a.environment==='sandbox'?'<p class="receipt-billing-tag">SANDBOX — test payments only</p>':'')+'<p>'+esc(status)+'</p><p>Receipt sender: <strong>'+esc(s.receipt_name)+'</strong></p><p><strong>'+Number(a.sent).toLocaleString()+' / '+Number(a.limit).toLocaleString()+' sent</strong> · '+Number(a.pending)+' queued'+(a.subscribed?'<br>Current usage-month estimate: '+money(a.estimated_pence):a.override?'<br>Free admin override — no subscription charge':'')+'</p>'+(a.cancel_at_period_end?'<p>Cancellation scheduled. Access ends '+when(a.period_end)+'.</p>':'')+'<div class="retail-action-row">'+(!a.subscribed&&!a.override?button(a.environment==='sandbox'?'Test activate — £2.99 first 30 days':'Activate — £2.99 first 30 days','checkout',s,!a.configured||!a.email_ready):'')+(a.subscribed?button('Manage email-receipt billing','portal',s)+(!a.cancel_at_period_end?button('Cancel email receipts','cancel',s):''):'')+button('Refresh email-receipt status','refresh',s)+'</div>'+(!a.configured?'<p class="retail-muted">Email-receipt billing is not configured yet. Contact InventoryOS support.</p>':'')+(!a.email_ready?'<p class="retail-muted">Email receipts are not ready to send yet. Contact InventoryOS support.</p>':'')+'<form data-receipt-contact="'+esc(s.inventory_id)+'" class="retail-form"><label>Shop contact email for receipt replies<input name="reply_to" type="email" maxlength="254" placeholder="Defaults to the owner’s email" value="'+esc(a.reply_to)+'"></label><button type="submit">Save contact email</button><p role="status"></p></form></article>';
  }).join('')||'<p>'+ (inventory?'Only the shop owner can manage this shop’s email-receipt subscription.':'Create a Retail shop first.')+'</p>';
 }
 async function load(){const r=await request('/retail/email-receipts/summary');if(!alive())return;shops=(r.stores||[]).filter(s=>!inventory||s.inventory_id===inventory);render();}
 async function action(s,kind,extra={}){
  const key='inventoryos_receipt_checkout:'+s.inventory_id;let id=sessionStorage.getItem(key);if(!id){id=crypto.randomUUID();sessionStorage.setItem(key,id);}
  const result=await request('/retail/email-receipts/billing',{method:'POST',headers:{'X-Workspace-Id':s.workspace_id,'X-Inventory-Ids':s.inventory_id},body:JSON.stringify({inventory_id:s.inventory_id,action:kind,request_id:id,...extra})});
  if(!alive())return;
  if(result.url){const u=new URL(result.url);if(u.protocol!=='https:'||!['checkout.stripe.com','billing.stripe.com'].includes(u.hostname))throw Error('Unexpected Stripe address');sessionStorage.setItem('inventoryos_receipt_return_shop',JSON.stringify({user:InventoryAPI.getUser()?.id,workspace:s.workspace_id,inventory:s.inventory_id}));sessionStorage.removeItem(key);location.assign(result.url);}else{sessionStorage.removeItem(key);await load();}
 }
 async function click(e){
  const b=e.target.closest('[data-receipt-action]');if(!b||!root.contains(b)||busy||b.disabled)return;
  const s=shops.find(s=>s.inventory_id===b.dataset.receiptShop),kind=b.dataset.receiptAction;if(!s)return;
  if(kind==='checkout'&&!confirm((s.receipts.environment==='sandbox'?'SANDBOX TEST — no real charge.\n\n':'')+'Activate email receipts for '+s.name+'? £2.99 for the first 30 days, then £2.99–£19.99 per usage month based on the published ranges, billed in arrears. This is a separate subscription.'))return;
  if(kind==='cancel'&&!confirm('Open Stripe to cancel '+s.name+'’s email-receipt subscription? Its Retail subscription is separate.'))return;
  busy=true;b.disabled=true;root.setAttribute('aria-busy','true');note('Updating email-receipt billing…');
  try{await action(s,kind,{accept_pricing:kind==='checkout'});note('Email-receipt billing refreshed.');}catch(error){note(error.message);}finally{busy=false;root.removeAttribute('aria-busy');if(b.isConnected)b.disabled=false;}
 }
 async function submit(e){
  const form=e.target;if(!form.matches('form[data-receipt-contact]'))return;e.preventDefault();if(busy)return;
  const s=shops.find(s=>s.inventory_id===form.dataset.receiptContact),b=e.submitter||form.querySelector('button');if(!s)return;
  busy=true;b.disabled=true;root.setAttribute('aria-busy','true');
  try{await action(s,'settings',{reply_to:new FormData(form).get('reply_to')});note('Shop contact email saved.');}catch(error){if(form.isConnected)form.querySelector('[role=status]').textContent=error.message;}finally{busy=false;root.removeAttribute('aria-busy');if(b.isConnected)b.disabled=false;}
 }
 root.addEventListener('click',click);root.addEventListener('submit',submit);
 const ready=load().then(()=>{
  note('');if(!paid||!alive())return;
  note('Waiting for Stripe payment confirmation…');timer=setInterval(async()=>{
   if(!alive()){clearInterval(timer);return;}if(busy||root.contains(document.activeElement)&&document.activeElement.matches('input,textarea,select'))return;busy=true;
   try{await load();if(!shops.some(s=>s.receipts.checkout_pending)){clearInterval(timer);note('Email-receipt billing is up to date.');}}catch(error){note(error.message);}finally{busy=false;}
   if(++polls>=10){clearInterval(timer);note('If your payment is pending, refresh email-receipt status shortly.');}
  },3000);
 }).catch(error=>note(error.message));
 const controller={ready,destroy(){disposed=true;clearInterval(timer);root.removeEventListener('click',click);root.removeEventListener('submit',submit);}};root.__receiptBilling=controller;return controller;
}
window.InventoryRetailReceiptBilling={mount};
// Existing Stripe sessions return to this URL. Continue into the combined page.
if(document.querySelector('[data-receipt-billing-page]')){
 if(!InventoryAPI.isLoggedIn())location.replace('login.html?returnTo=%2Fretail%2Femail-receipts.html');
 else{
  try{const saved=JSON.parse(sessionStorage.getItem('inventoryos_receipt_return_shop')||'null');if(saved?.user===InventoryAPI.getUser()?.id&&saved.workspace&&saved.inventory){localStorage.setItem('inventoryos_retail_workspace_id',saved.workspace);localStorage.setItem('inventoryos_retail_inventory_ids',JSON.stringify([saved.inventory]));localStorage.setItem('inventoryos_retail_store',saved.inventory);}sessionStorage.removeItem('inventoryos_receipt_return_shop');}catch{}
  const next=new URL('retail/index.html',document.baseURI);if(new URL(location.href).searchParams.has('paid'))next.searchParams.set('receipt_checkout','success');next.hash='retail-billing';location.replace(next.href);
 }
}
})();
