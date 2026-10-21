(function(){'use strict';let promptEvent=null;
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();promptEvent=event;});
window.addEventListener('appinstalled',()=>{promptEvent=null;const el=document.querySelector('#retailInstall');if(el)el.textContent='Retail app installed';});
const entry=()=>new URL('retail/dashboard/index.html',document.baseURI);
function help(){const apple=/iPhone|iPad|iPod/.test(navigator.userAgent),edge=/Edg\//.test(navigator.userAgent),d=document.querySelector('#retailDialog');d.close();document.querySelector('#retailDialogTitle').textContent='Install InventoryOS Retail';document.querySelector('#retailDialogBody').innerHTML=`<p>Install the Retail dashboard as its own app. It opens directly to Retail and uses your normal account login.</p><p>${apple?'In Safari, use Share → Add to Home Screen.':'Open this page in a normal browser tab, then use '+(edge?'Edge → More tools → Apps → Install this site as an app.':'Chrome → Cast, save and share → Install page as app.')}</p><p><a id="retailPwaAddress" target="_blank" rel="noopener">Open the Retail install page</a></p>${apple?'':'<h3>Only the main InventoryOS app is listed?</h3><p>Its scope covers Retail, so Chrome can hide the Retail install prompt. Finish transactions and sync saved sales. Uninstall the main InventoryOS app, keeping “Also delete data from Chrome” unticked. Install the Till and Retail dashboard apps first, then reinstall the main app if wanted. Till and Dashboard have separate, non-overlapping app scopes.</p><p>After installation, use chrome://apps (or edge://apps) to create the app’s desktop shortcut.</p>'}<p id="retailPwaStatus" role="status"></p>`;document.querySelector('#retailPwaAddress').href=entry().href;d.showModal();}
async function install(){
 const block=window.InventoryRetailInstallGuard?.();if(block){const el=document.querySelector('#retailNotice');el.hidden=false;el.textContent=block;return;}
 if(!location.pathname.includes('/retail/dashboard/')){const target=entry();target.search='?install=1';location.href=target.href;return;}
 const event=promptEvent;promptEvent=null;if(event){try{await event.prompt();const choice=await event.userChoice;if(choice?.outcome==='accepted')return;}catch{}}
 help();
}
function init(){const button=document.querySelector('#retailInstall');if(button)button.onclick=install;const address=document.querySelector('#retailStoreIdentity'),brand=document.querySelector('.retail-brand');if(location.pathname.includes('/retail/dashboard/')){if(address)address.href=entry().href+'#store-location';if(brand)brand.href=entry().href;}}
let offered=false;window.InventoryRetailPWA={ready(){if(!offered&&new URL(location.href).searchParams.get('install')==='1'){offered=true;help();}}};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
