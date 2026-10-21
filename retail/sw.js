'use strict';
const CACHE=self.RETAIL_DASHBOARD?'inventoryos-retail-dashboard-v1':'inventoryos-retail-shell-v8';
const ROOT=new URL(self.RETAIL_DASHBOARD?'../':'./',self.location.href),ENTRY=new URL(self.RETAIL_DASHBOARD?'dashboard/index.html':'index.html',ROOT).href;
const assets=['platform.js?v=5','platform.css?v=3','counter.js?v=6.2','counter.css?v=5','labels.js?v=5','vendor/jsbarcode-3.11.6.min.js','pricing.js?v=5','print.js?v=1','business.js?v=5.2','business.css?v=5','display.html','display.js?v=5','display.css?v=5','retail.css?v=8','retail.js?v=8','scanner.js?v=6','keyboard-scanner.js?v=3','offline.js?v=5.1','shared.js?v=6','vendor/zxing-browser-0.1.5.min.js','../css/theme.css?v=5','../js/theme.js?v=6','../js/api.js?v=retail-2','store-location.js?v=1','dashboard/install.js?v=1','dashboard/manifest.webmanifest','../pwa/main-192.png','../pwa/main-512.png'].map(p=>new URL(p,ROOT).href);assets.unshift(ENTRY);
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(assets))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(self.RETAIL_DASHBOARD?'inventoryos-retail-dashboard-':'inventoryos-retail-shell-')&&k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const url=new URL(e.request.url);
  // Cache only this explicit public app shell. API responses, tokens and account data are never cached here.
  if(e.request.mode==='navigate'&&url.origin===self.location.origin&&url.pathname.startsWith(new URL('./',self.location.href).pathname)){
    e.respondWith(fetch(e.request).catch(()=>caches.open(CACHE).then(c=>c.match(url.pathname.endsWith('/display.html') ? new URL('display.html',ROOT).href : assets[0]))));return;
  }
  if(assets.includes(url.href))e.respondWith(caches.open(CACHE).then(async c=>(await c.match(e.request))||fetch(e.request)));
});
