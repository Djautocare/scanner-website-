'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),load=()=>import('../functions/_middleware.js');
test('HTML gets a fresh cryptographic nonce while the strict fallback policy and other protections stay intact',async()=>{
 const {secureResponse,STATIC_CSP}=await load();assert.equal(STATIC_CSP,fs.readFileSync(root+'/_headers','utf8').match(/Content-Security-Policy: ([^\n]+)/)[1]);
 const body='<h1>Test</h1><script>untrusted()</script>',seen=new Set();
 for(let i=0;i<32;i++){
  const response=secureResponse(new Response(body,{headers:{'Content-Type':'text/html; charset=utf-8',ETag:'old','Last-Modified':'old','Content-Length':String(body.length),'Content-Security-Policy':STATIC_CSP}}));
  const csp=response.headers.get('Content-Security-Policy'),nonce=csp.match(/'nonce-([^']+)'/)[1];assert.equal(Buffer.from(nonce,'base64').length,16);assert(!seen.has(nonce));seen.add(nonce);
  assert.equal(csp.replace("'nonce-"+nonce+"' ",''),STATIC_CSP);assert(!csp.split(';').find(x=>x.trim().startsWith('script-src ')).includes('unsafe-inline'));assert(csp.includes("script-src-attr 'none'"));
  assert.equal(response.headers.get('Cache-Control'),'private, no-store');assert.equal(response.headers.get('Cloudflare-CDN-Cache-Control'),'no-store');assert.equal(response.headers.get('ETag'),null);assert.equal(response.headers.get('Content-Length'),null);
  assert.equal(response.headers.get('X-Frame-Options'),'SAMEORIGIN');assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');assert.equal(await response.text(),body,'middleware must not bless arbitrary inline scripts');
 }
});
test('conditional HTML requests cannot combine a new nonce with an old cached body; asset and redirect behaviour is preserved',async()=>{
 const {onRequest,secureResponse}=await load();let forwarded;
 const response=await onRequest({request:new Request('https://app.example.test/refund',{headers:{'If-None-Match':'old','If-Modified-Since':'old',Cookie:'synthetic=fixture','X-Test':'keep'}}),next:async request=>{forwarded=request;return new Response('<h1>Page</h1>',{headers:{'Content-Type':'text/html'}});}});
 assert.equal(forwarded.headers.get('If-None-Match'),null);assert.equal(forwarded.headers.get('If-Modified-Since'),null);assert.equal(forwarded.headers.get('Cookie'),'synthetic=fixture');assert.equal(forwarded.headers.get('X-Test'),'keep');assert(response.headers.get('Content-Security-Policy').includes("'nonce-"));
 const asset=await onRequest({request:new Request('https://app.example.test/js/api.js?v=1',{headers:{'If-None-Match':'asset-tag'}}),next:async request=>{assert.equal(request.headers.get('If-None-Match'),'asset-tag');return new Response('/* script */',{headers:{'Content-Type':'application/javascript','Cache-Control':'public, max-age=600',ETag:'asset-tag'}});}});
 assert(!asset.headers.get('Content-Security-Policy').includes("'nonce-"));assert.equal(asset.headers.get('Cache-Control'),'public, max-age=600');assert.equal(asset.headers.get('ETag'),'asset-tag');assert.equal(await asset.text(),'/* script */');
 const redirect=secureResponse(new Response(null,{status:302,headers:{Location:'/login'}}));assert.equal(redirect.status,302);assert.equal(redirect.headers.get('Location'),'/login');
});
test('Functions route documents while static scripts, images, fonts, installers and manifests bypass them',()=>{
 const routes=JSON.parse(fs.readFileSync(root+'/_routes.json','utf8'));
 const matches=(pattern,value)=>new RegExp('^'+pattern.split('*').map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*')+'$').test(value);
 const invokes=url=>routes.include.some(p=>matches(p,url))&&!routes.exclude.some(p=>matches(p,url));
 for(const url of ['/','/refund','/boxes','/add.html','/settings','/retail/dashboard/','/retail/till/index.html','/manufacturing/index.html'])assert(invokes(url),url);
 for(const url of ['/js/api.js','/retail/till/sw.js','/retail/vendor/zxing-browser-0.1.5.min.js','/css/theme.css','/icon.png','/pwa/manifest.webmanifest','/assets/test.svg','/printing/setup/install-windows.ps1','/printing/setup/install-mac.command','/cdn-cgi/challenge-platform/scripts/jsd/main.js'])assert(!invokes(url),url);
 assert(routes.include.length+routes.exclude.length<100);
});
