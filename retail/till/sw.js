'use strict';
const CACHE='inventoryos-till-v12';const urls=['../../js/security-session.js?v=1','../../js/security-events.js?v=1','index.html','../receipt-email.js?v=1','../interactions.js?v=1','basket.js?v=1','install.js?v=2','till.js?v=9','till.css?v=3','manifest.webmanifest','../../pwa/till-192.png','../../pwa/till-512.png','../../css/theme.css?v=contrast-1','../../js/theme.js?v=contrast-1','../retail.css?v=6','../keyboard-scanner.js?v=3','../scanner.js?v=6','../pricing.js?v=5','../print.js?v=1','../vendor/zxing-browser-0.1.5.min.js'].map(p=>new URL(p,self.location.href).href);
self.addEventListener('install',e=>e.waitUntil(
 caches.open(CACHE).then(c=>c.addAll(urls)).then(()=>self.skipWaiting())
));
self.addEventListener('activate',e=>e.waitUntil(
 caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('inventoryos-till-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())
));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;const url=new URL(e.request.url);if(e.request.mode==='navigate'&&url.origin===self.location.origin&&url.pathname.startsWith('/retail/till/')){e.respondWith(fetch(e.request).catch(()=>caches.open(CACHE).then(c=>c.match(urls[0]))));return;}if(urls.includes(url.href))e.respondWith(caches.open(CACHE).then(async c=>await c.match(e.request)||fetch(e.request)));});
