(function(){'use strict';
if(window.InventoryRetail)return;
function navigation(){
 document.getElementById('retailSettingsCard')?.remove();
 document.querySelectorAll('.ios-shell-nav[aria-label="Workspace"],.sidebar-nav[aria-label="Main navigation"]').forEach(nav=>{
  let link=nav.querySelector('[data-retail-nav]');if(!link){link=document.createElement('a');link.href='retail/index.html';link.dataset.retailNav='';link.className=nav.classList.contains('ios-shell-nav')?'ios-shell-nav-link':'sidebar-link';link.innerHTML='<span aria-hidden="true">▦</span> <span>InventoryOS Retail</span>';nav.append(link);}link.hidden=false;link.style.display='';
 });
}
window.InventoryRetail={refresh:navigation};
window.addEventListener('inventoryos-shell-ready',navigation);window.addEventListener('inventory-selection-changed',navigation);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',navigation,{once:true});else navigation();
})();
