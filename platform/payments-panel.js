(function(){
'use strict';
const {esc,api,showAccessGate}=PlatformUI;
function dashboardUrl(value){
 try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='dashboard.stripe.com'&&!u.username&&!u.password&&/^\/acct_[A-Za-z0-9]+\/(?:test\/)?dashboard$/.test(u.pathname)&&!u.search&&!u.hash?u.href:null;}catch{return null;}
}
function onboardingUrl(value){
 const u=new URL(value);if(u.protocol!=='https:'||u.hostname!=='connect.stripe.com'||u.username||u.password)throw Error('Stripe returned an unexpected setup address. Please contact support.');return u.href;
}
function bindSetup(button,feedback,continueLink,{request=()=>api('/seller/payments/start',{body:{},manualStripeRedirect:true}),navigate=url=>window.top.location.assign(url),accessGate=showAccessGate}={}){
 button.onclick=async event=>{
  event?.preventDefault();if(button.disabled)return;
  const label=button.textContent;button.disabled=true;button.setAttribute('aria-busy','true');button.textContent='Contacting Stripe…';
  feedback.classList.remove('pf-error');feedback.textContent='Preparing your secure Stripe setup. This can take a moment.';continueLink.hidden=true;continueLink.removeAttribute('href');
  try{
   const result=await request();if(!button.isConnected)return;
   const url=onboardingUrl(result.url);continueLink.href=url;continueLink.hidden=false;
   feedback.textContent='Opening Stripe. If you stay on this page, use Continue to Stripe below.';
   try{navigate(url);}catch{feedback.textContent='Your browser did not open Stripe automatically. Use Continue to Stripe below.';}
  }catch(error){
   if(!button.isConnected)return;
   if(!accessGate(feedback,error,()=>button.onclick())){feedback.textContent=error.message||'Payment setup could not start. Please try again.';feedback.classList.add('pf-error');}
  }finally{if(button.isConnected){button.disabled=false;button.removeAttribute('aria-busy');button.textContent=label;}}
 };
}
function mount(panel,p,refresh,{expired=false}={}){
 const labels={not_configured:'Payments not configured',not_started:'Set up your payments',creation_pending:'Finish setting up payments',incomplete:'More information needed',pending:'Stripe is reviewing your details',ready:p.environment==='live'?'Ready for live payments':'Ready for test payments',unavailable:'Could not check Stripe status',review_required:'Payment setup needs support review',assigned_test_account:'Operator-assigned test account'};
 const canStart=p.configured&&!['assigned_test_account','review_required','unavailable'].includes(p.status),dashboard=dashboardUrl(p.dashboard_url);
 panel.innerHTML='<p><span class="pf-pill">'+esc(labels[p.status]||'Check payment setup')+'</span></p><p class="pf-muted">Stripe collects your business, bank and identity details securely. InventoryOS receives 0.5% of the goods total; Stripe processing fees are separate.</p>'+
  '<p class="pf-warning">'+(p.environment==='live'?'Live setup: real customer payments when checkout is enabled.':'Sandbox setup: no real payments.')+'</p>'+
  (p.action_needed?'<p>Stripe needs more information. Continue setup to finish your shop’s payment account.</p>':'')+
  (p.status==='not_configured'?'<p>Payment setup needs configuring on the InventoryOS server first.</p>':'')+
  (expired?'<p>Your previous Stripe link expired. Continue setup to open a fresh link.</p>':'')+
  '<div class="pf-actions">'+(canStart?'<button type="button" class="primary" id="pf-payment-start">'+(p.status==='not_started'?'Set up payments':p.ready?'Review Stripe setup':'Continue setup')+'</button>':'')+
  '<button type="button" id="pf-payment-refresh">Refresh payment status</button>'+ (dashboard?'<a class="pf-button" href="'+esc(dashboard)+'" target="_blank" rel="noopener noreferrer">Open this shop’s Stripe Dashboard</a>':'')+'</div>'+
  '<div id="pf-payment-feedback" role="status" aria-live="polite" aria-atomic="true"></div><p><a id="pf-payment-continue" class="pf-button primary" target="_top" hidden>Continue to Stripe ↗</a></p>'+
  '<p class="pf-muted">'+(dashboard?'The dashboard link selects this shop’s connected account. Sign in with the Stripe login used during setup.':'Complete the shop’s Stripe setup first. Your dashboard link will appear here afterwards.')+'</p>';
 const button=panel.querySelector('#pf-payment-start');
 if(button)bindSetup(button,panel.querySelector('#pf-payment-feedback'),panel.querySelector('#pf-payment-continue'));
 const refreshButton=panel.querySelector('#pf-payment-refresh');refreshButton.onclick=async()=>{refreshButton.disabled=true;refreshButton.textContent='Checking Stripe…';try{await refresh();}finally{if(refreshButton.isConnected){refreshButton.disabled=false;refreshButton.textContent='Refresh payment status';}}};
}
window.InventoryPaymentPanel={mount,bindSetup,dashboardUrl,onboardingUrl};
})();
