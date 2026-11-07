(function(){
'use strict';
if(typeof InventoryAPI==='undefined')return;
InventoryAPI.request('/platform/status').then(r=>{
  if(r?.success&&(r.enabled||r.staging))for(const el of document.querySelectorAll('[data-platform-staging]'))el.hidden=false;
 }).catch(()=>{});
})();
