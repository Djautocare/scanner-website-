(function(){'use strict';
const panel=document.getElementById('settingsPanel'),grid=panel?.querySelector('.settings-grid');if(!grid)return;
const groups=[
 ['workspace','Workspace & team',['workspaceSettingsCard','workspaceMembersSettingsCard','manufacturingSettingsCard']],
 ['billing','Billing & subscriptions',['billingSettingsCard']],
 ['appearance','Appearance',['appearanceSettingsCard']],
 ['devices','Apps & devices',['installSettingsCard']],
 ['printing','Printing',['printingSettingsCard']],
 ['security','Security',['securitySettingsCard']],
 ['dispatch','Stock & dispatch',['removePreferencesCard','inboundEmailSettingsCard']],
 ['data','Data import',['dataManagementSettingsCard']],
 ['about','About InventoryOS',['aboutSettingsCard']],
 ['admin','Administration',['adminCard']]
];
const accordion=document.createElement('div');accordion.className='settings-accordion';accordion.setAttribute('aria-label','Account settings groups');grid.before(accordion);
const key='inventoryos_settings_groups:'+String((typeof InventoryAPI!=='undefined'&&InventoryAPI.getUser?.()?.id)||'account');let opened=[];try{opened=JSON.parse(sessionStorage.getItem(key)||'[]');if(!Array.isArray(opened))opened=[];}catch{}
const entries=groups.map(([id,title,ids])=>{
 const group=document.createElement('details');group.className='settings-group';group.id='account-settings-'+id;group.hidden=true;group.open=opened.includes(id);
 const summary=document.createElement('summary');summary.textContent=title;group.append(summary);
 const body=document.createElement('div');body.className='settings-group-body';group.append(body);accordion.append(group);
 group.addEventListener('toggle',()=>{try{sessionStorage.setItem(key,JSON.stringify(entries.filter(e=>e.group.open).map(e=>e.id)));}catch{}});
 return {id,ids,group,body};
});
function organise(){
 const install=document.getElementById('inventoryosInstallMain')?.closest('.card');if(install&&!install.id)install.id='installSettingsCard';
 for(const entry of entries){
  for(const id of entry.ids){const card=document.getElementById(id);if(card&&card.parentNode!==entry.body)entry.body.append(card);}
  entry.group.hidden=entry.id==='admin'?document.getElementById('adminCard')?.style.display==='none'||!entry.body.children.length:!entry.body.children.length;
 }
}
organise();
// Existing modules may insert workspace controls after their API requests finish.
// Move the original nodes once; keep their values, listeners and permission checks.
const observer=new MutationObserver(organise);observer.observe(grid,{childList:true});
observer.observe(document.getElementById('adminCard'),{attributes:true,attributeFilter:['style']});
const fromRetail=new URL(location.href).searchParams.get('area')==='retail';
if(fromRetail){
 const back=document.getElementById('settingsBackDashboard');if(back){back.href='retail/index.html';back.textContent='← Back to Retail dashboard';}
}
})();
