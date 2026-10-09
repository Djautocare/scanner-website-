(function(){
'use strict';
if(window.InventoryBusinessTrial)return;
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let adminTimer=null,billingTimer=null;
function remaining(end,offset=0){
 const seconds=Math.max(0,Math.ceil((Date.parse(end)-Date.now()-offset)/1000));
 if(!Number.isFinite(seconds)||!seconds)return 'Trial ended';
 const d=Math.floor(seconds/86400),h=Math.floor(seconds%86400/3600),m=Math.floor(seconds%3600/60),s=seconds%60;
 return (d?d+'d ':'')+h+'h '+m+'m '+s+'s remaining';
}
function expiryText(trial){
 const end=new Date(trial.ends_at);
 const date=end.toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/London'});
 const time=end.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/London'});
 return 'You’ll return to '+(trial.reverts_to_plan_name||'your existing plan')+' on '+date+' at '+time+' (UK time).';
}
function clockOffset(data){const server=Date.parse(data.server_now);return Number.isFinite(server)?server-Date.now():0;}
function requestMarkup(data){
 const trial=data.billing?.business_trial;
 if(trial?.used)return '';
 const user=InventoryAPI.getUser?.()||{};
 const body='Hi InventoryOS,\n\nPlease could I try Business free for one week?\n\nAccount email: '+(user.email||'')+'\nWorkspace: '+(data.workspace?.name||'')+'\n\nThank you.';
 const url='mailto:hello@inventoryos.co.uk?subject='+encodeURIComponent('Request a 1-week Business trial')+'&body='+encodeURIComponent(body);
 return '<div class="business-trial-request"><a class="link-btn secondary" href="'+esc(url)+'">Try Business free for 1 week</a><p>Email us to request it. We start the seven days after approving your request. No automatic charge. Optional paid add-ons are separate.</p></div>';
}
function billing(data,onExpiry){
 clearInterval(billingTimer);
 const panel=$('businessTrialInfo');if(!panel)return;
 const trial=data.billing?.business_trial;
 if(!trial?.used){panel.hidden=true;panel.innerHTML='';return;}
 if(trial.active&&!data.billing.is_business_trial){panel.hidden=false;panel.innerHTML='<h2>Business access is active</h2><p>Your current plan already provides Business access. Your trial does not change that plan or its billing.</p>';return;}
 const active=trial.active===true,offset=clockOffset(data);
 panel.hidden=false;
 panel.innerHTML='<h2>'+(active?'Your free Business trial':'Your Business trial has ended')+'</h2>'+
  (active?'<p id="businessTrialCountdown" role="timer"></p><p class="business-trial-reversion">'+esc(expiryText(trial))+'</p>':'')+
  '<p>'+(active?'The trial ends automatically and your existing plan applies again. Subscribe to Business if you want to keep its features.':'Your current plan applies again. Your stock and saved work stay in place. Choose Business to continue using its features.')+' The trial does not create a subscription or charge you.</p>';
 if(active){let expired=false;const tick=()=>{const el=$('businessTrialCountdown');if(!el)return;el.textContent=remaining(trial.ends_at,offset);if(!expired&&Date.parse(trial.ends_at)<=Date.now()+offset){expired=true;clearInterval(billingTimer);onExpiry();}};tick();if(!expired)billingTimer=setInterval(tick,1000);}
}
function stopAdmin(){clearInterval(adminTimer);adminTimer=null;}
function admin(data,callbacks){
 stopAdmin();
 const user=data.user,mount=$('drawerContent');
 const box=document.createElement('div');box.className='billing-box business-trial-admin';
 box.innerHTML='<h3>One-week Business trial</h3><p class="helper">Start this only after receiving the account’s request by email. It lasts exactly seven days, then the workspace’s existing plan applies again. Stripe billing is unchanged.</p>';
 mount.querySelector('.billing-box')?.before(box);
 if(!Array.isArray(data.trial_workspaces)){box.innerHTML+='<p class="helper">Install the Business trial backend update to enable this control.</p>';return;}
 const spaces=data.trial_workspaces;
 if(!spaces.length){box.innerHTML+='<p class="helper">This account must own a workspace to receive a trial.</p>';return;}
 box.innerHTML+='<label for="businessTrialWorkspace">Workspace</label><select id="businessTrialWorkspace">'+spaces.map(w=>'<option value="'+esc(w.id)+'">'+esc(w.name)+'</option>').join('')+'</select><div id="businessTrialState" class="helper"></div><label class="check-row"><input type="checkbox" id="businessTrialEmailRequest"> I have received this account’s trial request by email</label><div class="actions"><button id="startBusinessTrial" class="good-btn">Start 7-day Business trial</button><button id="endBusinessTrial" class="dark" hidden>End trial now</button></div><p id="businessTrialMessage" class="helper" role="status"></p>';
 const select=$('businessTrialWorkspace'),start=$('startBusinessTrial'),end=$('endBusinessTrial'),consent=$('businessTrialEmailRequest'),state=$('businessTrialState'),message=$('businessTrialMessage'),offset=clockOffset(data);
 if(spaces.some(w=>w.id===user.current_workspace_id))select.value=user.current_workspace_id;
 const chosen=()=>spaces.find(w=>w.id===select.value);
 let busy=false,expiryRefreshed=false;
 const render=()=>{
  const w=chosen(),trial=w.business_trial,active=trial.active&&Date.parse(trial.ends_at)>Date.now()+offset;
  start.hidden=active;end.hidden=!active;end.disabled=busy;
  start.disabled=busy||!consent.checked||trial.used||w.has_business_access||!user.email_verified||user.is_suspended;
  consent.disabled=busy||trial.used||w.has_business_access;
  if(active)state.textContent=expiryText(trial)+' '+remaining(trial.ends_at,offset)+'.';
  else if(trial.used)state.textContent=(trial.cancelled_at?'Trial ended early.':'Trial ended.')+' This workspace has used its trial. Its existing plan applies again.';
  else if(w.has_business_access)state.textContent='This workspace already has Business access.';
  else if(!user.email_verified||user.is_suspended)state.textContent='Verify and unsuspend the account before starting a trial.';
  else state.textContent='No trial started. The timer begins when you press Start.';
  if(trial.active&&!active&&!expiryRefreshed){expiryRefreshed=true;callbacks.expired?.();}
 };
 select.onchange=()=>{consent.checked=false;message.textContent='';expiryRefreshed=false;render();};consent.onchange=render;
 async function change(action){
  const w=chosen();
  if(action==='start'&&(!consent.checked||start.disabled))return;
  if(!window.confirm(action==='start'?'Start seven days of free Business access for '+user.email+' in '+w.name+'? Confirm you received their request by email. Their existing Stripe billing will continue unchanged.':'End the Business trial for '+w.name+' now? Their existing plan will apply again.'))return;
  busy=true;select.disabled=true;render();message.textContent='Updating trial…';
  try{
   const result=await InventoryAPI.request('/admin/users/'+encodeURIComponent(user.id)+'/business-trial',{method:'POST',body:JSON.stringify({workspace_id:w.id,action,requested_by_email:action==='start'&&consent.checked})});
   if(!result.success){message.textContent=result.error||'Could not update the trial';return;}
   message.textContent=result.message;await callbacks.updated();
  }catch(error){message.textContent=error.message||'Could not update the trial';}
  finally{busy=false;select.disabled=false;if(box.isConnected)render();}
 }
 start.onclick=()=>change('start');end.onclick=()=>change('end');
 render();adminTimer=setInterval(render,1000);
}
window.InventoryBusinessTrial={requestMarkup,billing,admin,stopAdmin};
// Keep the trial label and timer compact inside the scrolling controls row.
let noticeGeneration=0,noticeTimer=null;
function clearNotice(){clearInterval(noticeTimer);$('businessTrialNotice')?.remove();}
function noticeHost(){return $('iosShellTopbarHost')||$('inventory-topbar');}
async function refreshNotice(){
 if(/\/(admin|billing)\.html$/i.test(location.pathname)||typeof InventoryAPI==='undefined'||!InventoryAPI.isLoggedIn?.()||!noticeHost())return;
 const g=++noticeGeneration,workspace=localStorage.getItem('inventoryos_selected_workspace_id');
 try{
  const data=await InventoryAPI.request('/billing/status',{headers:workspace?{'X-Workspace-Id':workspace}:{}});
  if(g!==noticeGeneration||workspace!==localStorage.getItem('inventoryos_selected_workspace_id'))return;
  if(!data.success||!data.billing?.is_business_trial||!data.billing?.business_trial?.active){clearNotice();return;}
  if(workspace&&String(data.workspace?.id)!==workspace){clearNotice();return;}
  if(!document.querySelector('link[href*="css/businessTrial.css"]')){const css=document.createElement('link');css.rel='stylesheet';css.href='css/businessTrial.css?v=2';document.head.append(css);}
  clearNotice();const panel=document.createElement('section');panel.id='businessTrialNotice';panel.className='business-trial-topbar';panel.setAttribute('aria-label','Business trial');
  panel.innerHTML='<a class="business-trial-pill" href="billing.html" title="'+esc(expiryText(data.billing.business_trial))+'">Free Business trial</a><a class="business-trial-pill business-trial-timer" href="billing.html" title="'+esc(expiryText(data.billing.business_trial))+'"><span data-trial-remaining role="timer" aria-label="Business trial time remaining"></span></a>';
  const controls=noticeHost().querySelector('.inventory-topbar-right');
  if(controls)controls.append(panel);else noticeHost().after(panel);
  const offset=clockOffset(data),trial=data.billing.business_trial;let expired=false;
  const tick=()=>{panel.querySelector('[data-trial-remaining]').textContent=remaining(trial.ends_at,offset);if(!expired&&Date.parse(trial.ends_at)<=Date.now()+offset){expired=true;clearInterval(noticeTimer);refreshNotice();}};
  tick();if(!expired)noticeTimer=setInterval(tick,1000);
 }catch{if(g===noticeGeneration)clearNotice();}
}
window.addEventListener('inventory-selection-changed',()=>{++noticeGeneration;clearNotice();refreshNotice();});
window.addEventListener('inventoryos-shell-ready',refreshNotice);
window.addEventListener('inventoryos-session-updated',refreshNotice);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshNotice();});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',refreshNotice,{once:true});else refreshNotice();
if(!/\/(admin|billing)\.html$/i.test(location.pathname))setInterval(()=>{if(!document.hidden)refreshNotice();},60000);
})();

