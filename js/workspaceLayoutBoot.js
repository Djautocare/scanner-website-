/* Account-specific presentation. The server decides locked layouts; cached
   preferences never grant product access or change a subscription. */
(function(){
'use strict';
if(window.InventoryOSLayout)return;
const root=document.documentElement,embedded=window.top!==window.self&&new URLSearchParams(location.search).get('workspaceEmbed')==='1';
if(embedded)root.dataset.workspaceEmbed='true';
let resolveReady;const ready=new Promise(resolve=>resolveReady=resolve),key=id=>'inventoryos_layout:'+id;
function user(){try{return JSON.parse(localStorage.getItem('inventoryos_user')||'null');}catch{return null;}}
let available=false;let preferences=null;try{const u=user();preferences=u?.id?JSON.parse(localStorage.getItem(key(u.id))||'null'):null;}catch{}
function apply(value){preferences=value;root.dataset.workspaceLayout=value?.layout||'classic';window.dispatchEvent(new CustomEvent('inventoryos-layout-ready',{detail:value}));}
if(preferences)root.dataset.workspaceLayout=preferences.layout;
async function load(){
 if(typeof InventoryAPI==='undefined'||!InventoryAPI.isLoggedIn()){resolveReady(null);return;}
 const owner=InventoryAPI.getUser()?.id;
 try{const r=await InventoryAPI.request('/workspace-ui/preferences');if(InventoryAPI.getUser()?.id!==owner){resolveReady(null);return;}
  if(r?.success&&r.preferences){available=true;apply(r.preferences);try{localStorage.setItem(key(owner),JSON.stringify(r.preferences));}catch{}}
  else if(!preferences)apply({layout:'classic',layout_locked:false,tools:{}});
 }catch{if(!preferences)apply({layout:'classic',layout_locked:false,tools:{}});}
 resolveReady(preferences);
 const pages={'/':'overview','/index.html':'overview','/add.html':'products','/search.html':'products','/remove.html':'products','/move.html':'products','/boxes.html':'products','/dispatch-centre.html':'dispatch','/expenses.html':'expenses','/salestracker.html':'reports','/reorders.html':'purchasing','/manufacturing/':'production','/manufacturing/index.html':'production','/retail/':'sales','/retail/index.html':'sales','/retail/dashboard/index.html':'sales','/settings.html':'settings'};
 if(available&&preferences?.layout==='unified'&&!embedded&&window.top===window.self&&pages[location.pathname]){
  const target=new URL('/workspace/',location.origin);target.searchParams.set('view',pages[location.pathname]);
  if(!['/','/index.html'].includes(location.pathname)){target.searchParams.set('screen',location.pathname+location.search+location.hash);}
  location.replace(target.pathname+target.search);
 }
}
window.InventoryOSLayout={ready,get:()=>preferences,available:()=>available,reload:load,embedded};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});else load();
})();
