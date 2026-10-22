(function(){'use strict';
const KEY='inventoryos_receipt_queue_v1:',esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const read=key=>{try{return JSON.parse(localStorage.getItem(KEY+key)||'[]').filter(j=>Date.now()-j.created<7*86400000);}catch{return [];}};
const write=(key,rows)=>localStorage.setItem(KEY+key,JSON.stringify(rows));let flushing=false;
async function flush(context,send){if(flushing||!navigator.onLine||!context)return;flushing=true;try{const rows=read(context),keep=[];for(const job of rows){try{await send(job.body);}catch(e){keep.push(job);}}write(context,keep);return {waiting:keep.length};}finally{flushing=false;}}
function attach({root,sale,send,context,email='',enabled,sandbox=false,getStatus}){
 if(!root||!sale?.id||!enabled)return;const area=document.createElement('section');area.className='retail-email-receipt';area.innerHTML='<div class="retail-action-row"><button type="button" data-receipt-email-open>Email / resend receipt</button><button type="button" data-receipt-both>Print & email</button><button type="button" data-receipt-none>No receipt / done</button></div><form class="retail-form" hidden><label>Customer email<input type="email" name="email" required maxlength="254" autocomplete="off" value="'+esc(email)+'"></label><p>Only this receipt will be sent. No marketing signup.'+(sandbox?' Sandbox: delivery goes to the shop owner’s email for testing.':'')+'</p><button type="submit" class="retail-primary">Send receipt</button><p role="status" aria-live="polite"></p></form>';root.append(area);
 let request=null,lastEmail='',alsoPrint=false;const form=area.querySelector('form'),status=area.querySelector('[role=status]');
 const open=both=>{alsoPrint=both;form.hidden=false;form.elements.email.focus();};
 area.querySelector('[data-receipt-email-open]').onclick=()=>open(false);area.querySelector('[data-receipt-both]').onclick=()=>open(true);area.querySelector('[data-receipt-none]').onclick=()=>root.closest('dialog')?.close();
 form.onsubmit=async e=>{e.preventDefault();if(form.dataset.busy)return;const email=form.elements.email.value.trim();if(!request||email!==lastEmail){request=crypto.randomUUID();lastEmail=email;}const body={sale_id:sale.id,email,request_id:request};form.dataset.busy='true';e.submitter.disabled=true;status.textContent='Queuing receipt…';
 try{if(sale.pending_sync||!navigator.onLine){if(!context)throw Error('Reconnect before emailing this receipt.');const rows=read(context);if(rows.length>=100)throw Error('Sync queued receipts before adding more.');if(!rows.some(r=>r.body.request_id===request))rows.push({body,created:Date.now()});write(context,rows);status.textContent='Saved on this device. Receipt will be queued after this sale syncs.';}else{const result=await send(body);status.textContent=result.message||'Receipt queued. The sale is already complete.';if(getStatus&&result.receipt_email?.id){let polls=0;const timer=setInterval(async()=>{if(!area.isConnected||++polls>30){clearInterval(timer);return;}try{const r=await getStatus(result.receipt_email.id),job=r.receipt_email;if(job.status!=='pending'){clearInterval(timer);status.textContent=job.status==='sent'?'Receipt sent.':job.error||'Receipt was not sent. The sale is complete.';}}catch{clearInterval(timer);}},3000);}}if(alsoPrint){alsoPrint=false;InventoryRetailPrint.print();}}
 catch(error){status.textContent=error.message+' The sale is still complete.';}
 finally{delete form.dataset.busy;e.submitter.disabled=false;}
 };
}
window.InventoryReceiptEmail={attach,flush};
})();
