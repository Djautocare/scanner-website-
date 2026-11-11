(function(){
'use strict';
if(window.InventoryProTrial)return;
const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let timer=null,observer=null,billingTimer=null,generation=0;
function readState(data){
 const b=data?.billing;if(!b||b.is_admin_plan_override||b.is_business_trial||b.stripe_subscription_id)return null;
 if((b.workspace_plan_key||b.plan_key)!=='pro'||(b.workspace_billing_status||b.billing_status)!=='trialing')return null;
 const end=Date.parse(b.trial_ends_at),server=Date.parse(data.server_now);if(!Number.isFinite(end))return null;
 const offset=Number.isFinite(server)?server-Date.now():0;
 return {end,offset,active:end>Date.now()+offset};
}
function remaining(state){
 const seconds=Math.max(0,Math.ceil((state.end-Date.now()-state.offset)/1000));if(!seconds)return 'Trial ended';
 return Math.floor(seconds/86400)+'d '+Math.floor(seconds%86400/3600)+'h '+Math.floor(seconds%3600/60)+'m '+seconds%60+'s remaining';
}
function expiry(state){return new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Europe/London'}).format(new Date(state.end))+' (UK time)';}
function stylesheet(){if(!document.querySelector('link[href*="css/businessTrial.css"]')){const css=document.createElement('link');css.rel='stylesheet';css.href='/css/businessTrial.css?v=2';document.head.append(css)}}
function billing(data,onExpiry){
 clearInterval(billingTimer);let panel=$('proTrialInfo');const state=readState(data);
 if(!state){if(panel){panel.hidden=true;panel.innerHTML=''}return}
 if(!panel){const anchor=$('businessTrialInfo')||$('plansGrid');if(!anchor)return;panel=document.createElement('section');panel.id='proTrialInfo';panel.className='business-trial-info';anchor.before(panel)}
 stylesheet();panel.hidden=false;panel.innerHTML='<h2>'+(state.active?'Your trial':'Your trial has ended')+'</h2>'+
 (state.active?'<p id="proTrialCountdown" role="timer" class="pro-trial-countdown"></p><p>You’ll return to Intro on '+esc(expiry(state))+'.</p>':'')+
 '<p>'+(state.active?'When the countdown ends, Trial features become unavailable and your account continues on Intro.':'Your account continues on Intro. Trial features have ended, and your saved stock and work are kept.')+' Choose Intro, Premium or Pro below. You will not be charged automatically for this trial. Paid plans start only after you complete checkout.</p>';
 if(state.active){let ended=false;const tick=()=>{const el=$('proTrialCountdown');if(!el)return;el.textContent=remaining(state);if(!ended&&state.end<=Date.now()+state.offset){ended=true;clearInterval(billingTimer);onExpiry?.()}};tick();if(!ended)billingTimer=setInterval(tick,1000)}
}
function clear(){clearInterval(timer);observer?.disconnect();observer=null;$('proTrialNotice')?.remove()}
function host(){return $('iosShellTopbarHost')||$('inventory-topbar')}
function workspace(){try{return localStorage.getItem('inventoryos_selected_workspace_id')}catch{return null}}
async function refresh(){
 if(/\/(admin|billing)\.html$/i.test(location.pathname)||typeof InventoryAPI==='undefined'||!InventoryAPI.isLoggedIn?.()||!host())return;
 const selected=workspace(),g=++generation;
 try{
  const data=await InventoryAPI.request('/billing/status',{headers:selected?{'X-Workspace-Id':selected}:{}});
  if(g!==generation||selected!==workspace())return;const state=data.success&&readState(data);
  if(!state||(selected&&String(data.workspace?.id)!==selected)){clear();return}
  stylesheet();clear();const panel=document.createElement('section');panel.id='proTrialNotice';panel.className='business-trial-topbar';panel.setAttribute('aria-label',state.active?'Trial':'Trial ended');
  const title=state.active?'Your trial ends '+expiry(state)+'. No automatic charge. Choose your next plan.':'Your trial has ended. Continue with Intro or choose Premium or Pro.';
  panel.innerHTML='<a class="business-trial-pill" href="/billing.html#plansGrid" title="'+esc(title)+'">'+(state.active?'Your trial':'Trial ended')+'</a><a class="business-trial-pill business-trial-timer" href="/billing.html#plansGrid" title="'+esc(title)+'">'+(state.active?'<span data-pro-trial-remaining role="timer" aria-label="Trial time remaining"></span>':'Choose your plan →')+'</a>';
  // Match Business trials exactly: append inside the existing horizontal
  // controls, never beside the host or in a separate mobile-width block.
  const mountHost=host(),mount=()=>{if(g!==generation||selected!==workspace())return;const controls=mountHost.querySelector('.inventory-topbar-right');if(controls&&!controls.contains(panel))controls.append(panel)};
  observer=new MutationObserver(mount);observer.observe(mountHost,{childList:true,subtree:true});mount();
  if(state.active){let ended=false;const tick=()=>{const el=panel.querySelector('[data-pro-trial-remaining]');if(el)el.textContent=remaining(state);if(!ended&&state.end<=Date.now()+state.offset){ended=true;clearInterval(timer);panel.setAttribute('aria-label','Trial ended');panel.querySelector('.business-trial-pill').textContent='Trial ended';if(el)el.textContent='Choose your plan →';refresh()}};tick();if(!ended)timer=setInterval(tick,1000)}
 }catch{if(g===generation)clear()}
}
window.InventoryProTrial={readState,billing,refresh};
window.addEventListener('inventory-selection-changed',()=>{++generation;clear();refresh()});
window.addEventListener('inventoryos-shell-ready',refresh);window.addEventListener('inventoryos-session-updated',refresh);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',refresh,{once:true});else refresh();
if(!/\/(admin|billing)\.html$/i.test(location.pathname))setInterval(()=>{if(!document.hidden)refresh()},60000);
})();
