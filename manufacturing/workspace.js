(function(){'use strict';
const $=id=>document.getElementById(id);
function menu(open){const mobile=matchMedia('(max-width:760px)').matches,side=$('mfgSidebar');side.classList.toggle('open',mobile&&open);side.inert=mobile&&!open;if(mobile)side.setAttribute('aria-hidden',String(!open));else side.removeAttribute('aria-hidden');$('mfgMenu').setAttribute('aria-expanded',String(mobile&&open));}
function boot(){const user=InventoryAPI.getUser();$('mfgPersonName').textContent=user?.name||'Your account';$('mfgAvatar').textContent=(user?.name||'Inventory OS').split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase();$('mfgLogout').onclick=()=>InventoryAPI.logout();$('mfgMenu').onclick=()=>menu(!$('mfgSidebar').classList.contains('open'));menu(false);window.addEventListener('resize',()=>menu(false));document.addEventListener('keydown',e=>{if(e.key==='Escape')menu(false);});}
window.addEventListener('inventoryos-manufacturing-view',e=>{$('mfgPageTitle').textContent=e.detail==='overview'?'Manufacturing dashboard':e.detail[0].toUpperCase()+e.detail.slice(1);menu(false);});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();})();
