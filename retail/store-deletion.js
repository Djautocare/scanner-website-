(function(){'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function open({inventory,name,blocked,complete}){
 const reason=blocked?.();if(reason)throw Error(reason);
 const workspace=localStorage.getItem('inventoryos_retail_workspace_id'),key='inventoryos_store_delete_'+workspace+'_'+inventory;
 const dialog=document.querySelector('#retailDialog');dialog.close();document.querySelector('#retailDialogTitle').textContent='Delete '+name;
 const root=document.querySelector('#retailDialogBody');root.innerHTML=`<div class="store-delete"><p>This permanently removes this store’s products, sales, customers, orders and other store records. Your account, other stores and shared staff remain.</p><p>Shop and email-receipt subscriptions will stop renewing at the end of their current billing periods. Existing charges and usage remain payable.</p><p><strong>Before starting:</strong> sync offline sales on every device, finish transactions, log staff out and balance and close tills.</p><div data-delete-blockers role="status"></div><ol class="store-delete-steps"><li><strong>Email your backup</strong><p>Products have their own CSV. Sales, customers, orders and other records have separate CSVs. Login credentials and staff PINs are excluded.</p><p>Account email: <strong data-delete-email>Loading…</strong></p><button type="button" data-delete-backup class="retail-primary" disabled>Email my CSV backup</button></li><li><strong>Save the attachments, then confirm</strong><p data-delete-unlock>These controls unlock after the backup email is accepted.</p><form data-delete-form class="retail-form"><label class="retail-check-label"><input type="checkbox" name="received" required disabled> <span data-delete-ack>I have received and saved the emailed CSV backup.</span></label><label><span>Type <strong>Confirm delete</strong></span><input name="confirmation" autocomplete="off" spellcheck="false" required disabled placeholder="Confirm delete"></label><button type="submit" class="store-delete-confirm" disabled>Permanently delete store</button></form></li></ol><p data-delete-notice role="status" aria-live="polite"></p><button type="button" data-delete-refresh>Refresh status</button></div>`;dialog.showModal();
 const email=root.querySelector('[data-delete-email]'),ack=root.querySelector('[data-delete-ack]'),form=root.querySelector('form'),send=root.querySelector('[data-delete-backup]'),notice=root.querySelector('[data-delete-notice]'),refresh=root.querySelector('[data-delete-refresh]');
 let context=null,busy=false,backupId=sessionStorage.getItem(key)||'',sent=false,deleting=false;
 const alive=()=>root.isConnected&&root.querySelector('[data-delete-form]')===form&&localStorage.getItem('inventoryos_retail_workspace_id')===workspace;
 async function request(path,body){if(!alive())throw Error('Retail business changed. Reopen the store before continuing.');const r=await InventoryAPI.request('/retail/stores/deletion'+path,{headers:{'X-Workspace-Id':workspace,'X-Inventory-Ids':inventory,'X-Retail-Till-Id':''},...(body?{method:'POST',body:JSON.stringify(body)}:{})});if(!r.success)throw Error(r.error||'Store deletion is unavailable. Install the store deletion backend update and restart the backend.');return r;}
 function controls(){if(!alive())return;const ready=context&&!context.blockers.length;send.disabled=busy||!ready||deleting;refresh.disabled=busy;form.elements.received.disabled=busy||!ready||!sent;form.elements.confirmation.disabled=busy||!ready||!sent;form.querySelector('[type=submit]').disabled=busy||!ready||!sent||!form.elements.received.checked||form.elements.confirmation.value!=='Confirm delete';dialog.setAttribute('aria-busy',String(busy));}
 function note(t){if(alive())notice.textContent=t;}
 async function load(){
  context=null;controls();
  try{const r=await request('?inventory_id='+encodeURIComponent(inventory));if(!alive())return;if(!r.email||!Array.isArray(r.blockers))throw Error('The store check returned incomplete details. Install the latest store deletion backend update and restart.');context=r;email.textContent=r.email;ack.textContent='I have received and saved the CSV backup emailed to '+r.email+'.';
  const list=root.querySelector('[data-delete-blockers]');list.innerHTML=r.blockers?.length?'<p><strong>Complete these steps first:</strong></p><ul>'+r.blockers.map(t=>'<li>'+esc(t)+'</li>').join('')+'</ul>':'';
  deleting=r.deleting;if(r.backup&&r.backup.status!=='deleted'){backupId=r.backup.id;sessionStorage.setItem(key,backupId);sent=['sent','deleting'].includes(r.backup.status);}else if(!r.backup){backupId='';sent=false;sessionStorage.removeItem(key);}
  if(sent)note(deleting?'Deletion was started. Confirm below to safely resume it.':'Backup email accepted. Check your inbox and save every CSV attachment before confirming deletion.');else note('');root.querySelector('[data-delete-unlock]').hidden=sent;controls();
  }catch(e){context=null;if(alive()){email.textContent='Unable to load account email';root.querySelector('[data-delete-unlock]').hidden=false;note('Store checks could not be loaded. The controls will stay locked until this is fixed. '+e.message);}throw e;}
 }
 form.oninput=controls;form.onchange=controls;
 send.onclick=async()=>{if(busy)return;busy=true;controls();note('Preparing your CSV files and emailing the backup…');try{
  // Reuse the ID after timeouts so a successful send cannot be duplicated.
  if(sent||!backupId){backupId=crypto.randomUUID();sessionStorage.setItem(key,backupId);sent=false;form.elements.received.checked=false;form.elements.confirmation.value='';}
  const r=await request('/backup',{inventory_id:inventory,request_id:backupId});sent=['sent','deleting'].includes(r.status);await load();note('Backup email accepted for '+r.email+'. Check your inbox (and spam) and save all attachments. The store has not been deleted.');
 }catch(e){note(e.message);}finally{busy=false;controls();}};
 form.onsubmit=async e=>{e.preventDefault();if(busy||!sent||!form.elements.received.checked||form.elements.confirmation.value!=='Confirm delete')return;const reason=blocked?.();if(reason)return note(reason);busy=true;controls();note('Stopping subscription renewals and deleting this store. Please wait…');try{
  const r=await request('/confirm',{inventory_id:inventory,backup_id:backupId,backup_received:form.elements.received.checked,confirmation:form.elements.confirmation.value});if(!r.deleted)throw Error('Deletion was not confirmed. Refresh the status before retrying.');
  sessionStorage.removeItem(key);if(!alive())return;dialog.close();await complete?.(inventory);
 }catch(e){note(e.message);form.elements.received.checked=false;form.elements.confirmation.value='';try{await load();note(e.message);}catch{} }finally{busy=false;controls();}};
 refresh.onclick=async()=>{if(busy)return;busy=true;controls();try{await load();}catch(e){note(e.message);}finally{busy=false;controls();}};
 load().catch(()=>controls());
}
window.InventoryRetailStoreDeletion={open};
})();
