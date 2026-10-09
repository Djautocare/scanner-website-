(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=v=>v?new Date(v).toLocaleString('en-GB'):'Unknown';
const names={new:'New',ongoing:'Ongoing',completed:'Help completed'};
const workspace=()=>localStorage.getItem('inventoryos_selected_workspace_id')||'';
const headers=id=>id?{'X-Workspace-Id':id}:{};
let context=null,contextGeneration=0,submitting=false,submissionKey=null,submissionFingerprint=null;
let adminScope='active',adminPage=1,adminPages=1,adminGeneration=0,searchTimer;
function uuid(){if(crypto.randomUUID)return crypto.randomUUID();const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const s=Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20);}
function userRequest(r){return '<details class="help-request"><summary><span class="help-state">'+esc(names[r.status]||r.status)+'</span>'+esc(r.topic)+'</summary><div class="help-meta">'+esc(date(r.created_at))+' · '+esc(r.workspace_name)+' · #'+esc(r.id.slice(0,8).toUpperCase())+'</div><div class="help-message">'+esc(r.message)+'</div></details>';}
async function loadUser(){
 if(!$('helpPanel')||$('helpPanel').hidden)return;
 const g=++contextGeneration,id=workspace();context=null;$('sendHelp').disabled=true;
 $('helpAccount').textContent='Loading account…';$('helpWorkspace').textContent='Loading workspace…';
 const d=await InventoryAPI.request('/help',{headers:headers(id)});
 if(g!==contextGeneration||id!==workspace())return;
 if(!d.success){$('helpResult').textContent=d.error||'Could not load Help.';return;}
 if(id&&String(d.workspace.id)!==id){$('helpResult').textContent='Select your workspace again before sending.';return;}
 context={...d,selected:id};$('helpAccount').textContent=d.account_email;$('helpWorkspace').textContent=d.workspace.name;
 $('sendHelp').disabled=submitting;
 $('helpHistory').innerHTML=(d.requests||[]).map(userRequest).join('')||'<p class="help-copy">No help requests from your account in this workspace yet.</p>';
}
async function send(event){
 event.preventDefault();if(submitting||!context)return;
 if(context.selected!==workspace()){await loadUser();return;}
 const topic=$('helpTopic').value.trim(),message=$('helpMessage').value.trim();
 if(!topic||topic.length>120||!message||message.length>5000){$('helpResult').textContent='Enter a topic and a message (up to 5,000 characters).';return;}
 const expected=context.workspace.id,fingerprint=JSON.stringify([expected,topic,message]);
 if(fingerprint!==submissionFingerprint){submissionKey=uuid();submissionFingerprint=fingerprint;}
 submitting=true;$('sendHelp').disabled=true;$('helpTopic').disabled=true;$('helpMessage').disabled=true;
 $('helpResult').textContent='Sending your help request…';
 try {
  const d=await InventoryAPI.request('/help',{method:'POST',headers:headers(expected),body:JSON.stringify({topic,message,client_request_id:submissionKey})});
  if(!d.success){$('helpResult').textContent=d.error||'Could not send. Your message is still here; you can try again.';return;}
  submissionKey=null;submissionFingerprint=null;$('helpForm').reset();$('helpCharacters').textContent='0 / 5,000';
  $('helpResult').textContent='Request #'+d.request.id.slice(0,8).toUpperCase()+' sent from '+d.request.workspace_name+'. We’ll reply to your account email.';
  await loadUser();
 }catch{$('helpResult').textContent='Could not connect. Your message is still here; try again.';}
 finally{submitting=false;$('helpTopic').disabled=false;$('helpMessage').disabled=false;$('sendHelp').disabled=!context;}
}
function notificationText(r){
 if(r.notification_status==='sent')return 'Email copy sent '+date(r.notification_sent_at);
 if(r.notification_status==='failed')return 'Email copy needs attention. Request is safely saved here.';
 if(r.notification_status==='sending')return 'Sending email copy…';
 return Number(r.notification_attempts)>0?'Email copy queued for retry.':'Email copy queued.';
}
function adminRequest(r){
 const contact='mailto:'+encodeURIComponent(r.account_email)+'?subject='+encodeURIComponent('Re: InventoryOS help ['+r.id.slice(0,8).toUpperCase()+']: '+r.topic);
 return '<details class="help-request"><summary><span class="help-state">'+esc(names[r.status]||r.status)+'</span>'+esc(r.topic)+'</summary><div class="help-meta"><strong>'+esc(r.account_email)+'</strong> · '+esc(r.account_name||'Unknown name')+'<br>Workspace: '+esc(r.workspace_name)+'<br>Sent: '+esc(date(r.created_at))+(r.completed_at?'<br>Completed: '+esc(date(r.completed_at)):'')+' · #'+esc(r.id.slice(0,8).toUpperCase())+'</div><div class="help-message">'+esc(r.message)+'</div><div class="help-meta">'+esc(notificationText(r))+'</div><div class="help-actions"><a class="help-button" href="'+esc(contact)+'">Reply by email</a>'+
 (r.status==='completed'?'<button class="help-button" data-help-status="ongoing" data-help-id="'+esc(r.id)+'">Reopen as ongoing</button>':'<button class="help-button" data-help-status="ongoing" data-help-id="'+esc(r.id)+'" '+(r.status==='ongoing'?'disabled':'')+'>Ongoing</button><button class="help-button primary" data-help-status="completed" data-help-id="'+esc(r.id)+'">Help completed</button>')+
 (r.notification_status==='failed'?'<button class="help-button" data-help-retry="'+esc(r.id)+'">Retry email copy</button>':'')+'</div></details>';
}
async function loadAdmin(){
 if(!$('helpAdmin')||!$('helpAdmin').classList.contains('active'))return;
 const g=++adminGeneration;$('helpAdminResult').textContent='Loading help requests…';
 const q=new URLSearchParams({scope:adminScope,page:adminPage,search:$('helpSearch').value.trim(),sort:$('helpSort').value,account:$('helpAccountFilter').value,status:$('helpStatusFilter').value});
 const d=await InventoryAPI.request('/admin/help?'+q);
 if(g!==adminGeneration)return;
 if(!d.success){$('helpAdminResult').textContent=d.error||'Could not load help requests.';return;}
 adminPages=d.pages;adminPage=d.page;
 if(adminPage>adminPages){adminPage=adminPages;return loadAdmin();}
 const previous=$('helpAccountFilter').value;
 $('helpAccountFilter').innerHTML='<option value="">All accounts</option>'+(d.accounts||[]).map(a=>'<option value="'+esc(a.id)+'">'+esc(a.email)+'</option>').join('');
 $('helpAccountFilter').value=previous;
 $('helpAdminList').innerHTML=(d.requests||[]).map(adminRequest).join('')||'<p class="help-copy">'+(adminScope==='archived'?'No archived requests match these filters.':'No active requests match these filters.')+'</p>';
 $('helpCounts').textContent=d.counts.new+' new · '+d.counts.ongoing+' ongoing · '+d.counts.archived+' archived';
 $('helpPage').textContent='Page '+adminPage+' of '+adminPages+' · '+d.total+' request'+(d.total===1?'':'s');
 $('helpPrev').disabled=adminPage<=1;$('helpNext').disabled=adminPage>=adminPages;
 $('helpAdminResult').textContent='';
}
function scope(value){
 adminScope=value;adminPage=1;
 $('helpActive').setAttribute('aria-selected',value==='active');$('helpArchive').setAttribute('aria-selected',value==='archived');
 $('helpStatusFilterLabel').hidden=value==='archived';loadAdmin();
}
async function action(event){
 const b=event.target.closest('[data-help-status],[data-help-retry]');if(!b||b.disabled)return;
 const retry=b.dataset.helpRetry,status=b.dataset.helpStatus,id=retry||b.dataset.helpId;
 if(status==='completed'&&!confirm('Mark this help request completed and move it to the archive?'))return;
 if(retry&&!confirm('Retry the email copy? If an earlier send succeeded without confirmation, this may deliver another copy.'))return;
 b.disabled=true;$('helpAdminResult').textContent='Updating request…';
 try {
  const d=await InventoryAPI.request('/admin/help/'+encodeURIComponent(id)+(retry?'/retry-email':'/status'),{method:retry?'POST':'PATCH',body:JSON.stringify(retry?{}:{status})});
  if(!d.success){$('helpAdminResult').textContent=d.error||'Could not update request.';return;}
  await loadAdmin();
 }catch{$('helpAdminResult').textContent='Could not connect. Try again.';}
 finally{b.disabled=false;}
}
function init(){
 if($('helpForm')){
  $('helpForm').addEventListener('submit',send);
  $('helpMessage').addEventListener('input',()=>{$('helpCharacters').textContent=$('helpMessage').value.length.toLocaleString('en-GB')+' / 5,000';});
  document.querySelector('[data-settings-tab="helpPanel"]')?.addEventListener('click',loadUser);
  $('refreshHelpHistory').addEventListener('click',loadUser);
  window.addEventListener('inventory-selection-changed',()=>{++contextGeneration;context=null;submissionKey=null;submissionFingerprint=null;loadUser();});
  loadUser();
 }
 if($('helpAdmin')){
  $('helpActive').onclick=()=>scope('active');$('helpArchive').onclick=()=>scope('archived');
  $('helpRefresh').onclick=loadAdmin;$('helpAdminList').addEventListener('click',action);
  $('helpSearch').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{adminPage=1;loadAdmin();},250);});
  ['helpSort','helpAccountFilter','helpStatusFilter'].forEach(id=>$(id).addEventListener('change',()=>{adminPage=1;loadAdmin();}));
  $('helpPrev').onclick=()=>{if(adminPage>1){adminPage--;loadAdmin();}};
  $('helpNext').onclick=()=>{if(adminPage<adminPages){adminPage++;loadAdmin();}};
 }
}
window.InventoryHelp={loadAdmin,loadUser};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
