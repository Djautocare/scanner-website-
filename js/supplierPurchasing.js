(() => {
 'use strict';
 const dialog=document.getElementById('supplier-purchasing');
 const trigger=document.getElementById('open-supplier-purchasing');
 if(!dialog||!trigger)return;
 const main=dialog.querySelector('[data-purchasing-main]');
 const message=dialog.querySelector('[data-purchasing-message]');
 const endpoint='/reorder/purchase-orders';
 const attempts=new WeakMap();
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const gbp=value=>new Intl.NumberFormat(document.documentElement.lang||'en-GB',{style:'currency',currency:'GBP'}).format(Number(value)/100);
 const name=key=>({draft:'Draft',approved:'Approved',issued:'Issued',cancelled:'Cancelled',ordered:'Awaiting receipt',received:'In holding',complete:'Assigned'}[key]||'Needs review');
 const number=order=>order.order_number?'PO-'+String(order.order_number).padStart(6,'0'):name(order.status);
 const activeScope=()=>JSON.stringify(['inventoryos_selected_workspace_id','inventoryos_selected_inventory_ids'].map(k=>localStorage.getItem(k)||''));
 let scope,revision=0,busy=false;

 function announce(text){message.textContent=text;}
 function amount(value) {
  if(!/^\d{1,8}(?:\.\d{1,2})?$/.test(value))throw Error('Enter a valid amount in pounds and pence.');
  const [pounds,pence='']=value.split('.');
  const result=Number(pounds)*100+Number(pence.padEnd(2,'0'));
  if(result<1)throw Error('Enter a positive amount.');
  return result;
 }
 function requestId(form,data){
  const fingerprint=JSON.stringify(data);
  const old=attempts.get(form);
  if(old?.fingerprint===fingerprint)return old.id;
  const id=crypto.randomUUID();
  attempts.set(form,{id,fingerprint});
  return id;
 }
 async function call(path,body) {
  if(scope!==activeScope()||!dialog.open)throw Error('Your inventory changed. Close Supplier documents and open it again.');
  const answer=await InventoryAPI.request(path,body?{method:'POST',body:JSON.stringify(body)}:{});
  if(scope!==activeScope()||!dialog.open)throw Error('Your inventory changed. Close Supplier documents and open it again.');
  if(!answer?.success)throw Error(answer?.error||'Could not load supplier documents.');
  return answer;
 }
 function action(label,verb,detail='',secondary=true) {
  return '<button type="button" class="'+(secondary?'secondary':'')+'" data-purchasing-action="'+verb+'" '+detail+'>'+label+'</button>';
 }
 function selectRows(orders) {
  return orders.map(row=>`<label class="supplier-pick">
   <input name="order_ids" type="checkbox" value="${escape(row.id)}" data-inventory="${escape(row.inventory_id)}">
   <span translate="no">${escape(row.item_name)} × ${escape(row.quantity)} · ${escape(row.inventory_name)}</span>
   <strong>${gbp(Math.round(Number(row.total_cost)*100))}</strong></label>`).join('');
 }
 async function overview() {
  const view=++revision;
  announce('Loading supplier documents…');
  const result=await call(endpoint);
  if(view!==revision||!dialog.open)return;
  const choices=selectRows(result.eligible);
  main.innerHTML='<section><h3>Purchase orders</h3>'+(result.orders.length?
   '<ul class="supplier-orders">'+result.orders.map(order=>`<li><div><strong translate="no">${escape(order.supplier)}</strong>
    <span>${escape(number(order))} · ${escape(name(order.status))} · ${gbp(order.total_pence)}</span>
    <span>${escape(order.received_count)} / ${escape(order.line_count)} lines received${order.missing_count?' · Linked reorder missing':''}</span></div>
     ${action('Open','detail','data-id="'+escape(order.id)+'"')}</li>`).join('')+'</ul>':
    '<p>No purchase orders in the selected inventories.</p>')+'</section>'+
   (result.permissions.draft?`<section class="supplier-create"><h3>New purchase order</h3>${choices?`<form data-purchasing-form="draft">
    <p>Select priced reorders from one inventory for the same supplier. Receive stock through the Ordered tab.</p>
    <div class="supplier-choices">${choices}</div>
    <div class="supplier-grid"><label>Your business <input required maxlength="140" name="buyer"></label>
    <label>Supplier <input required maxlength="140" name="supplier"></label></div>
    <label>Supplier contact or address (optional) <textarea name="supplier_details" maxlength="400"></textarea></label>
    <label>Purchase order notes (optional) <textarea name="notes" maxlength="400"></textarea></label>
    <button type="submit">Create draft</button></form>`:'<p>No unlinked reorders have a total cost. Set the cost in the Ordered tab.</p>'}</section>`:'');
  announce('');
 }
 function billForm(id) {
  return `<details><summary>Record supplier invoice</summary>
   <form data-purchasing-form="invoice" data-order="${escape(id)}">
    <div class="supplier-grid"><label>Supplier invoice number <input name="reference" maxlength="100" required></label>
    <label>Invoice total (£) <input name="amount" type="number" min=".01" step=".01" max="99999999.99" required></label>
    <label>Invoice date <input name="invoice_date" type="date" required></label>
    <label>Due date <input name="due_date" type="date" required></label></div>
    <button type="submit">Record invoice</button>
   </form></details>`;
 }
 function invoiceCard(order,invoice) {
  const outstanding=Number(invoice.amount_pence)-Number(invoice.paid_pence);
  const payments=invoice.payments.map(row=>`<li>${escape(row.paid_on)} · ${gbp(row.amount_pence)} · <span translate="no">${escape(row.reference)}</span></li>`).join('');
  return `<section class="supplier-invoice">
   <h4>Invoice <span translate="no">${escape(invoice.reference)}</span></h4>
   <p>Issued ${escape(invoice.invoice_date)} · Due ${escape(invoice.due_date)}</p>
   <p>${gbp(invoice.paid_pence)} paid · <strong>${gbp(outstanding)} outstanding</strong>${invoice.overdue?' · Overdue':outstanding===0?' · Paid':''}</p>
   ${payments?'<ul aria-label="Payment history">'+payments+'</ul>':''}
   ${outstanding>0?`<details><summary>Record a payment already made</summary>
    <form data-purchasing-form="payment" data-order="${escape(order.id)}" data-invoice="${escape(invoice.id)}">
    <p>Use a unique payment reference for this invoice. This saves a record only.</p>
    <div class="supplier-grid"><label>Paid amount (£) <input name="amount" type="number" min=".01" step=".01" max="${(outstanding/100).toFixed(2)}" required></label>
    <label>Payment date <input name="paid_on" type="date" required></label>
    <label>Unique payment reference <input name="reference" maxlength="120" required></label></div>
    <button type="submit">Record payment</button></form></details>`:''}
   </section>`;
 }
 async function detail(id){
  const view=++revision;
  announce('Loading purchase order…');
  const data=await call(endpoint+'/'+encodeURIComponent(id));
  if(view!==revision||!dialog.open)return;
  const {order,lines,invoices,permissions}=data;
  const params='data-id="'+escape(id)+'" data-version="'+escape(order.version)+'"';
  const controls=permissions.finance?
   (order.status==='draft'?action('Approve','approve',params,false):'')+
   (order.status==='approved'?action('Issue and number','issue',params,false):'')+
   (['draft','approved'].includes(order.status)?action('Cancel document','cancel',params):''):'';
  main.innerHTML=`<div class="supplier-actions">${action('All purchase orders','list')}${controls}${order.status==='issued'?action('Print / Save PDF','print'):''}</div>
   <article class="supplier-document" id="supplier-purchase-paper">
    <h3>Purchase order · ${escape(number(order))}</h3>
    <dl><dt>From</dt><dd translate="no">${escape(order.buyer)}</dd>
    <dt>Supplier</dt><dd translate="no">${escape(order.supplier)}${order.supplier_details?'<br>'+escape(order.supplier_details):''}</dd>
    <dt>Status</dt><dd>${escape(name(order.status))}</dd>
    ${order.issued_at?'<dt>Issue date</dt><dd>'+escape(new Intl.DateTimeFormat(document.documentElement.lang,{dateStyle:'medium',timeZone:'Europe/London'}).format(new Date(order.issued_at)))+'</dd>':''}</dl>
    <div class="supplier-table"><table><thead><tr><th scope="col">Product</th><th scope="col">Quantity</th><th scope="col">Order total</th><th class="supplier-screen" scope="col">Receipt</th></tr></thead>
    <tbody>${lines.map(item=>`<tr><td translate="no">${escape(item.description)}<small>${escape(item.barcode)}</small></td><td>${escape(item.quantity)}</td><td>${gbp(item.total_pence)}</td><td class="supplier-screen">${escape(name(item.stock_status))}</td></tr>`).join('')}</tbody></table></div>
    <p class="supplier-total"><strong>Total ${gbp(order.total_pence)}</strong></p>
    ${order.notes?'<p translate="no">'+escape(order.notes)+'</p>':''}
   </article>
   ${order.status==='issued'&&permissions.finance?`<section class="supplier-create"><h3>Supplier invoices and payments</h3>
    ${invoices.map(invoice=>invoiceCard(order,invoice)).join('')}${billForm(id)}</section>`:''}`;
  announce('');
 }
 async function perform(button,work){
  if(busy||!dialog.open)return;
  busy=true;
  if(button)button.disabled=true;
  try{await work();}
  catch(err){if(dialog.open)announce(err.message||'Could not save supplier documents.');}
  finally{
   busy=false;
   if(button)button.disabled=false;
  }
 }
 trigger.addEventListener('click',()=>{
  scope=activeScope();
  main.replaceChildren();
  dialog.showModal();
  void perform(trigger,overview);
 });
 dialog.addEventListener('close',()=>{revision++;document.body.classList.remove('print-supplier-order');});
 dialog.addEventListener('click',event=>{
  const button=event.target.closest('[data-purchasing-action]');
  if(!button)return;
  const verb=button.dataset.purchasingAction,id=button.dataset.id;
  if(verb==='close'){dialog.close();return;}
  if(verb==='print'){
   document.body.classList.add('print-supplier-order');
   try{window.print();}
   finally{document.body.classList.remove('print-supplier-order');}
   return;
  }
  void perform(button,async()=>{
   if(verb==='list')return overview();
   if(verb==='detail')return detail(id);
   announce('Saving purchase order…');
   await call(endpoint+'/'+encodeURIComponent(id)+'/action',{action:verb,version:Number(button.dataset.version)});
   return detail(id);
  });
 });
 dialog.addEventListener('submit',event=>{
  const form=event.target;
  if(!form.matches('[data-purchasing-form]'))return;
  event.preventDefault();
  void perform(event.submitter,async()=>{
   const fields=new FormData(form),data=Object.fromEntries(fields);
   const kind=form.dataset.purchasingForm,id=form.dataset.order;
   let path=endpoint;
   if(kind==='draft'){
    const selected=[...form.querySelectorAll('input[name="order_ids"]:checked')];
    if(!selected.length||new Set(selected.map(input=>input.dataset.inventory)).size!==1)throw Error('Select priced reorders from one inventory.');
    data.order_ids=fields.getAll('order_ids');
   }else{
    data.amount_pence=amount(data.amount);
    delete data.amount;
    path+='/'+encodeURIComponent(id)+'/invoices';
    if(kind==='payment')path+='/'+encodeURIComponent(form.dataset.invoice)+'/payments';
   }
   announce('Saving supplier document…');
   const result=await call(path,{...data,request_id:requestId(form,data)});
   if(dialog.open)return detail(id||result.id);
  });
 });
})();
