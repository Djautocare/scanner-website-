(function(){
'use strict';
const {$,esc,money,endpoint,api,status,task,bindForm,input,select,check,table,download,imageData,showAccessGate}=PlatformUI;
const main=$('pf-admin-main');let active=false,generation=0;
function card(title,body){return '<section class="pf-card"><h2>'+esc(title)+'</h2>'+body+'</section>';}
function btn(text,extra=''){return '<button type="button" '+extra+'>'+esc(text)+'</button>';}
function submit(text){return '<button type="submit" class="primary">'+esc(text)+'</button>';}
function area(label,name,value='',opts=''){return '<label>'+esc(label)+'<textarea name="'+esc(name)+'" '+opts+'>'+esc(value)+'</textarea></label>';}
async function admin(){
 if(!InventoryAPI.getUser()?.is_admin)throw Error('Platform owner access required.');
 const ticket=++generation;
 const access=await api('/access');if(!access.admin)throw Error('Admin access required.');
 const [x,sellers]=await Promise.all([api('/admin/moderation'),api('/admin/sellers')]);if(!active||ticket!==generation)return;
 main.innerHTML=card('Listing reviews',x.listings.map(l=>`<article class="pf-choice"><h3>${esc(l.title)} · ${esc(l.shop)}</h3>
  <p>${esc(l.description)}</p><p class="pf-muted">Text: ${esc(l.text_review)} · Image screening: ${esc(l.photo_reviews.join(', ')||'No photos')}</p>
  ${l.reports?.length?table(l.reports):''}<div class="pf-grid">${l.photo_ids.map(p=>'<img class="pf-photo mini" loading="lazy" crossorigin="use-credentials" alt="Listing photo for review" src="'+esc(endpoint('/admin/photo/'+encodeURIComponent(p)))+'">').join('')}</div>
  <form class="pf-form" data-moderate="${esc(l.id)}">${select('Decision','action',[['approved','Approve after review'],['blocked','Block publication'],['hold','Retain photos'],['release','Lift photo retention hold']])}
   ${input('Reason','reason','','required maxlength="240"')}${submit('Record decision')}</form></article>`).join('')||'<p class="pf-muted">No listings are awaiting review.</p>')+
 card('Seller controls',`<details><summary>Warnings, suspension and seller history</summary><form id="pf-seller-action" class="pf-form pf-space">${select('Storefront','shop_id',[["","Choose a seller"],...sellers.sellers.map(s=>[s.id,s.name+(s.suspended?' · Suspended':'')+' · '+s.open_reports+' open reports'])])}${select('Action','action',[['warn','Send a notice to Seller Centre'],['suspend','Suspend storefront'],['restore','Lift suspension (seller must republish)']])}${input('Reason','reason','','required maxlength="400"')}${submit('Record seller decision')}</form>${table(sellers.sellers.map(s=>({storefront:s.name,slug:s.slug,suspended:s.suspended,open_reports:s.open_reports,history:s.history})))}</details>`)+
 card('Compliance & financial records',`<p class="pf-warning">Use this only for an authorised request. Open one shop and period at a time. A fresh authenticator code is required for each access.</p>
  <form class="pf-form" id="pf-legal">${input('Retail shop inventory ID','inventory_id','','required')}
   ${input('Case reference','case_ref','','required maxlength="100"')}${area('Lawful purpose','purpose','','required maxlength="300"')}
   ${input('Start date','start','','type="date" required')}${input('End date','end','','type="date" required')}
   ${check('Show an access notice to the shop owner','notify',true)}${input('If notice must be withheld, give the reason','suppression_reason','','maxlength="240"')}
   ${input('New authenticator code','code','','required inputmode="numeric" pattern="[0-9]{6}" autocomplete="one-time-code"')}${submit('Verify and open report')}</form>
   <div id="pf-legal-report"></div>`)+
 card('Check the access log',`<form id="pf-verify" class="pf-form">${input('New authenticator code','code','','required inputmode="numeric" pattern="[0-9]{6}" autocomplete="one-time-code"')}${submit('Verify signed access history')}</form>`);
 for(const f of main.querySelectorAll('[data-moderate]'))bindForm(f,async v=>{
  const route='/admin/listing/'+encodeURIComponent(f.dataset.moderate);
  if(['hold','release'].includes(v.action))await api(route+'/retention',{body:{hold:v.action==='hold',reason:v.reason}});
  else await api(route,{body:v});
  await admin();status('Decision saved.');
 });
 bindForm($('pf-seller-action'),async v=>{await api('/admin/seller/'+encodeURIComponent(v.shop_id),{body:{action:v.action,reason:v.reason}});await admin();status('Seller decision recorded.');});
 const legal=$('pf-legal');
 bindForm(legal,async v=>{
  $('pf-legal-report').replaceChildren();legal.elements.code.value='';
  const ticket=generation;
  const x=await api('/admin/report',{body:{...v,notify:!!v.notify}});
  if(!active||ticket!==generation)return;
  $('pf-legal-report').innerHTML='<div class="pf-space">'+table([x.report.summary])+btn('Save signed case pack','id="pf-case-pack"')+'</div>';
  $('pf-case-pack').onclick=()=>download('inventoryos-case-'+x.access.id+'.json',JSON.stringify(x,null,2));
  status('Scoped access recorded.');
 });
 bindForm($('pf-verify'),async(v,f)=>{
  f.elements.code.value='';const x=await api('/admin/audit/verify',{body:v});status('Verified '+x.entries+' access records. Chain head: '+x.head);
 });
}

async function load(){
 if(!active)return;
 try{await admin();}catch(e){if(!active)return;if(!showAccessGate(main,e,load))main.innerHTML=card('Unavailable','<p>'+esc(e.message)+'</p>');}
}
document.addEventListener('inventoryos-admin-tab',event=>{
 active=event.detail==='platformAdmin';generation++;
 main.replaceChildren();status('');
 if(active)load();
});
document.addEventListener('inventoryos:security-changed',()=>{if(active)load();});
window.InventoryPlatformAdmin=Object.freeze({load});
})();
