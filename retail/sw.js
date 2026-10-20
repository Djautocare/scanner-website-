'use strict';
const CACHE='inventoryos-retail-shell-v4';
const assets=['index.html','pricing.js?v=4','business.js?v=4','business.css?v=4','display.html','display.js?v=4','display.css?v=4','retail.css?v=4','retail.js?v=4','scanner.js?v=4','keyboard-scanner.js?v=3','offline.js?v=4','shared.js?v=1','vendor/zxing-browser-0.1.5.min.js','../css/theme.css','../css/inventoryTopbar.css?v=6','../js/theme.js','../js/api.js?v=retail-1','../js/inventoryTopbar.js?v=6'].map(p=>new URL(p,self.location.href).href);
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(assets))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('inventoryos-retail-shell-')&&k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const url=new URL(e.request.url);
  // Cache only this explicit public app shell. API responses, tokens and account data are never cached here.
  if(e.request.mode==='navigate'&&url.origin===self.location.origin&&url.pathname.startsWith(new URL('./',self.location.href).pathname)){
    e.respondWith(fetch(e.request).catch(()=>caches.open(CACHE).then(c=>c.match(url.pathname.endsWith('/display.html') ? new URL('display.html',self.location.href).href : assets[0]))));return;
  }
  if(assets.includes(url.href))e.respondWith(caches.open(CACHE).then(async c=>(await c.match(e.request))||fetch(e.request)));
});
