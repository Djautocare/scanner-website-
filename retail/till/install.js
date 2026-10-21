(function(){'use strict';
// Capture the browser event before the scanner and the Till application load.
let promptEvent=null,options=null,installed=false;
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();promptEvent=event;});
window.addEventListener('appinstalled',()=>{promptEvent=null;installed=true;options?.notice('InventoryOS Till was installed. Open it from your device’s apps.');});
const url=()=>new URL('retail/till/index.html',document.baseURI).href;
function installOrderHelp(apple,edge){if(apple)return '';const manager=edge?'edge://apps':'chrome://apps';return `<section class="retail-note"><h3>Only InventoryOS appears in your app list?</h3><p>The main InventoryOS app covers this website, including the Till address. Chrome can hide the separate Till install prompt while the main app is installed.</p><ol><li>Finish any current transactions. In a normal browser tab, open <code>${manager}</code>.</li><li>Uninstall <strong>InventoryOS</strong>. Leave <strong>Also delete data from Chrome</strong> (or any option to clear site data) <strong>unticked</strong>. Keep your website data.</li><li>Close the old InventoryOS app window. In a normal browser tab, open the Till address below.</li><li>Reload the Till page and use <strong>Install / reinstall</strong> or the browser’s <strong>Install page as app</strong> menu. Check that the app is named <strong>InventoryOS Till</strong>, then install it.</li><li>Once Till appears separately in your app list, you can install the main InventoryOS app again from the main website.</li></ol><p>Installing Till first is the workaround for these overlapping apps. Clearing cookies or refreshing installation files does not resolve this overlap.</p></section>`;}
function help(){
 const apple=/iPhone|iPad|iPod/.test(navigator.userAgent),edge=/Edg\//.test(navigator.userAgent);
 options.show('Install InventoryOS Till',`<p>${installed?'The browser reported that Till was installed. You can open it from your device’s apps.':'Open the Till address in a normal browser tab to install or reinstall it.'}</p><p>${apple?'In Safari, tap Share, then Add to Home Screen.':edge?'In Edge, open Settings and more (…) → More tools → Apps → Install this site as an app.':'In Chrome, open the menu (⋮) → Cast, save, and share → Install page as app. On Android, look for Install app or Add to Home screen.'}</p>${installOrderHelp(apple,edge)}<p>If the browser still lists Till as installed, remove that app from the browser’s app settings first, then reopen this address.</p><p><a id="tillInstallAddress" target="_blank" rel="noopener">Open Till in a browser tab</a></p><div class="retail-action-row"><button id="tillCopyInstall">Copy Till address</button><button id="tillRefreshInstall">Refresh installation files</button></div><p class="retail-help">Refreshing installation files keeps your inventory connection, website login and saved payment information. Your browser controls when its install prompt is available.</p><p id="tillInstallStatus" role="status"></p>`);
 document.querySelector('#tillInstallAddress').href=url();
 document.querySelector('#tillCopyInstall').onclick=async()=>{const s=document.querySelector('#tillInstallStatus');try{await navigator.clipboard.writeText(url());s.textContent='Till address copied.';}catch{s.textContent=url();}};
 document.querySelector('#tillRefreshInstall').onclick=async event=>{
  const s=document.querySelector('#tillInstallStatus');
  if(!options.canChange()){s.textContent='Finish, park or clear the current transaction before refreshing installation files.';return;}
  event.target.disabled=true;s.textContent='Refreshing Till installation files…';
  try{
   const scope=new URL('retail/till/',document.baseURI).href;
   if('serviceWorker' in navigator){const registrations=await navigator.serviceWorker.getRegistrations();for(const registration of registrations)if(registration.scope===scope)await registration.unregister();}
   if('caches' in window){const keys=await caches.keys();await Promise.all(keys.filter(key=>key.startsWith('inventoryos-till-')).map(key=>caches.delete(key)));}
   location.reload();
  }catch{s.textContent='Could not refresh the installation files. Close this tab and try the browser’s install menu.';event.target.disabled=false;}
 };
}
async function open(){
 if(!options)return;
 if(!options.canChange()){options.notice('Finish, park or clear the current transaction before opening installation help.');return;}
 const event=promptEvent;promptEvent=null;
 if(event){try{await event.prompt();const choice=await event.userChoice;if(choice?.outcome==='accepted'){options.notice('Installation requested. Check your browser or device for the installed Till app.');return;}}catch{/* Consumed or unavailable browser prompts fall back to manual installation. */}}
 help();
}
window.InventoryTillInstall={configure(value){options=value;},open};
})();
