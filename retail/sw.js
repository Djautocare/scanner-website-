'use strict';
const CACHE='inventoryos-retail-shell-v5.1';
const assets=['index.html','counter.js?v=5.1','counter.css?v=5','labels.js?v=5','vendor/jsbarcode-3.11.6.min.js','pricing.js?v=5','business.js?v=5','business.css?v=5','display.html','display.js?v=5','display.css?v=5','retail.css?v=5','retail.js?v=5.1','scanner.js?v=5','keyboard-scanner.js?v=3','offline.js?v=5','shared.js?v=1','vendor/zxing-browser-0.1.5.min.js','../css/theme.css?v=5','../css/inventoryTopbar.css?v=6','../js/theme.js?v=5','../js/api.js?v=retail-1','../js/inventoryTopbar.js?v=6'].map(p=>new URL(p,self.location.href).href);
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
