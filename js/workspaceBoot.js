/* Apply saved appearance before the first screen paint. No session, API,
   permissions or account state is changed by this small bootstrap. */
(function(){
 'use strict';
 const root=document.documentElement;
 let appearance='dark',accent='green';
 try{
  appearance=localStorage.getItem('inventoryos_appearance')==='light'?'light':'dark';
  const saved=localStorage.getItem('inventoryos_theme');
  if(['green','purple','blue','gold','red','cyan'].includes(saved))accent=saved;
 }catch{ /* Storage may be unavailable; the default palette still renders. */ }
 root.setAttribute('data-appearance',appearance);
 root.setAttribute('data-theme',accent);
 root.style.colorScheme=appearance;
 if(/settings(?:\.html)?$/.test(location.pathname)){
  const sections={guide:'guidePanel',help:'helpPanel',stack:'stackPanel',settings:'settingsPanel',manufacturing:'settingsPanel'};
  let saved='settingsPanel';
  try{saved=localStorage.getItem('inventoryos_settings_view')||saved;}catch{}
  root.dataset.settingsView=sections[location.hash.slice(1)]||(['settingsPanel','guidePanel','helpPanel','stackPanel'].includes(saved)?saved:'settingsPanel');
 }
})();
