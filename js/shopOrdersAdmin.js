(function(){'use strict';
const $=id=>document.getElementById(id),section=$('shopOrders');if(!section)return;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(Number(v)/100);
const date=v=>v?new Date(v).toLocaleString('en-GB'):'—';
let page=1,total=0,selected=null,dirty=false,saving=false,pending=null,listSequence=0,detailSequence=0,searchTimer;
const requestId=()=>{if(crypto.randomUUID)return crypto.randomUUID();const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;return Array.from(bytes,(b,i)=>([4,6,8,10].includes(i)?'-':'')+b.toString(16).padStart(2,'0')).join('');};
const statuses=['new','processing','dispatched','completed','cancelled'];
const label=s=>String(s||'').replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());
async function request(path,options){const data=await InventoryAPI.request('/admin/shop-orders'+path,options);if(!data?.success)throw Error(data?.error||'Shop orders could not load. Check that the shop backend update is installed.');return data;}
function message(text,error=false){const el=$('shopOrdersStatus');el.textContent=text;el.setAttribute('role',error?'alert':'status');}
async function load(silent=false){
 const seq=++listSequence;
 if(!silent)message('Loading shop orders…');
 try{
  const query=new URLSearchParams({mode:$('shopOrderMode').value,status:$('shopOrderStatusFilter').value,q:$('shopOrderSearch').value,page});
  const data=await request('?'+query);if(seq!==listSequence)return;
  total=data.total;$('shopOrderCount').textContent=total+' '+(total===1?'order':'orders');
  $('shopOrdersList').innerHTML=data.orders.length?data.orders.map(o=>`<button type="button" class="shop-admin-order ${selected===o.id?'selected':''}" data-shop-order="${esc(o.id)}"><span><strong>${esc(o.invoice_reference||o.reference)}</strong><small>${date(o.created_at)}</small></span><span><strong>${esc(o.customer_name||o.customer_email)}</strong><small>${esc(o.customer_email)}</small></span><span><strong>${money(o.total_pence)}</strong><small>${esc(label(o.payment_status))} · ${esc(label(o.status))}${Number(o.failed_emails)?' · Email needs attention':''}</small></span></button>`).join(''):'<div class="shop-admin-empty">No shop orders match these filters.</div>';
  $('shopOrderPage').textContent='Page '+page;$('shopOrderPrevious').disabled=page===1;$('shopOrderNext').disabled=page*30>=total;
  if(!silent)message($('shopOrderMode').value==='test'?'Sandbox orders. Test customer emails are routed to your configured shop test inbox.':'Live shop orders.');
 }catch(e){if(seq===listSequence)message(e.message,true);}
}
async function open(id,{saved=false}={}){
 if(saving&&!saved){message('Wait for the current order to finish saving.');return;}
 if(dirty&&!saved&&!confirm('Discard the unsaved order changes?'))return;
 selected=id;const seq=++detailSequence;$('shopOrderDetail').hidden=false;$('shopOrderDetail').innerHTML='<p>Loading order…</p>';
 try{
  const {order:o}=await request('/'+encodeURIComponent(id));if(seq!==detailSequence)return;dirty=false;pending=null;
  const address=[o.customer_name,...['line1','line2','city','state','postal_code','country'].map(k=>o.shipping_address[k])].filter(Boolean).map(esc).join('<br>');
  const options=o.payment_status==='paid'?statuses:['awaiting_payment','cancelled'];
  $('shopOrderDetail').innerHTML=`<div class="shop-admin-detail-heading"><div><h3>${esc(o.invoice_reference||o.reference)}</h3><span>${o.livemode?'Live order':'SANDBOX TEST'} · ${esc(label(o.payment_status))}</span></div><button type="button" class="dark" id="shopOrderClose">Close</button></div><p>${esc(o.customer_email)}</p><div class="shop-admin-address"><strong>Deliver to</strong><p>${address}</p></div><div class="shop-admin-items">${o.items.map(x=>`<div><span>${esc(x.name)}<small>Quantity: ${x.quantity}</small></span><strong>${money(x.total_pence)}</strong></div>`).join('')}<div><strong>${o.payment_status==='paid'?'Total paid':'Order total'}</strong><strong>${money(o.total_pence)}</strong></div></div><div class="actions"><button id="shopOrderInvoice" type="button" ${o.payment_status!=='paid'?'disabled':''}>Download invoice</button><button id="shopOrderReload" type="button" class="dark">Refresh order</button></div><form id="shopOrderForm"><fieldset id="shopOrderFields"><label for="shopOrderState">Order status</label><select id="shopOrderState">${options.map(x=>`<option value="${x}" ${x===o.status?'selected':''}>${label(x)}</option>`).join('')}</select><label for="shopOrderTracking">Royal Mail tracking number</label><input id="shopOrderTracking" value="${esc(o.tracking_number)}" maxlength="100" autocomplete="off"><label for="shopOrderNotes">Internal notes</label><textarea id="shopOrderNotes" maxlength="4000">${esc(o.admin_notes)}</textarea><p class="helper">Status and tracking changes email the customer after verified payment. Internal notes stay private. Cancelling here does not issue a Stripe refund.</p><button type="submit" id="shopOrderSave">Save order</button></fieldset><p id="shopOrderSaveStatus" role="status" aria-live="polite"></p></form><h4>Customer emails</h4><div class="shop-admin-email-list">${o.emails.length?o.emails.map(e=>`<p><strong>${e.kind==='confirmation'?'Confirmation + invoice':'Order update'}</strong><span>${esc(label(e.status))}${e.sent_at?' · '+date(e.sent_at):''}${e.error_code?' · '+esc(e.error_code):''}</span></p>`).join(''):'<p>Waiting for verified payment.</p>'}</div><details><summary>Order history</summary>${o.history.map(e=>`<p><strong>${esc(label(e.action))}</strong><br><small>${date(e.created_at)}</small>${e.details.status?'<br>'+esc(label(e.details.status)):''}</p>`).join('')}</details>`;
  $('shopOrderClose').onclick=()=>{if(saving)return;if(dirty&&!confirm('Discard the unsaved order changes?'))return;detailSequence++;selected=null;dirty=false;$('shopOrderDetail').hidden=true;load(true);};
  $('shopOrderReload').onclick=()=>open(id);
  $('shopOrderForm').addEventListener('input',()=>{dirty=true;pending=null;});
  $('shopOrderForm').addEventListener('submit',async event=>{
   event.preventDefault();if(saving)return;saving=true;$('shopOrderFields').disabled=true;
   const feedback=$('shopOrderSaveStatus');feedback.textContent='Saving order…';
   try{pending??={client_request_id:requestId(),version:o.version,status:$('shopOrderState').value,tracking_number:$('shopOrderTracking').value,admin_notes:$('shopOrderNotes').value};
   const data=await request('/'+id,{method:'POST',body:JSON.stringify(pending)});dirty=false;pending=null;await open(id,{saved:true});message(data.order.email_queued?'Order saved. Customer update email queued.':'Order saved.');await load(true);}
   catch(e){feedback.textContent=e.message;feedback.setAttribute('role','alert');}
   finally{saving=false;if($('shopOrderFields'))$('shopOrderFields').disabled=false;}
  });
  $('shopOrderInvoice').onclick=async()=>{
   $('shopOrderInvoice').disabled=true;
   const win=window.open('about:blank','_blank');if(win)win.opener=null;
   try{const data=await request('/'+id+'/invoice');if(data.pdf_base64){if(typeof data.pdf_base64!=='string'||data.pdf_base64.length>8*1024*1024||!/^Invoice-IOS-(?:TEST-)?[0-9]+\.pdf$/.test(data.filename||''))throw Error('Invalid invoice download.');const raw=atob(data.pdf_base64);if(raw.slice(0,5)!=='%PDF-')throw Error('Invalid invoice file.');const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0)),href=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'})),link=document.createElement('a');link.href=href;link.download=data.filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(href),30000);win?.close();message('Invoice downloaded: '+data.reference);return;}const url=new URL(data.url);if(url.protocol!=='https:'||!['pay.stripe.com','invoice.stripe.com','files.stripe.com','b.stripecdn.com'].includes(url.hostname))throw Error('Unexpected invoice address.');if(win)win.location.href=url.href;else message('Allow pop-ups to open the invoice, then try again.',true);}
   catch(e){win?.close();message(e.message,true);}finally{if($('shopOrderInvoice'))$('shopOrderInvoice').disabled=false;}
  };
 }catch(e){if(seq===detailSequence)$('shopOrderDetail').textContent=e.message;}
}
$('shopOrdersList').addEventListener('click',event=>{const button=event.target.closest('[data-shop-order]');if(button)open(button.dataset.shopOrder);});
$('shopOrderRefresh').onclick=()=>load();
for(const id of ['shopOrderMode','shopOrderStatusFilter'])$(id).addEventListener('change',()=>{page=1;load();});
$('shopOrderSearch').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{page=1;load();},250);});
$('shopOrderPrevious').onclick=()=>{if(page>1){page--;load();}};$('shopOrderNext').onclick=()=>{if(page*30<total){page++;load();}};
window.InventoryShopOrders={load};
if(section.classList.contains('active'))load();
document.addEventListener('inventoryos-admin-tab',event=>{if(event.detail==='shopOrders')load();});
setInterval(()=>{if(section.classList.contains('active')&&document.visibilityState==='visible'&&!saving)load(true);},30000);
})();
