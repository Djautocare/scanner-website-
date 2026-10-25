'use strict';
// Local fixture: simulate Cloudflare adding its own nonce-bearing bootstrap.
// No real bot detection, accounts, emails, payment APIs or stock are accessed.
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright'),http=require('node:http'),assert=require('node:assert/strict');
(async()=>{
 const {secureResponse}=await import('../functions/_middleware.js');
 const server=http.createServer(async(req,res)=>{
  if(req.url.startsWith('/cdn-cgi/')){res.setHeader('Content-Type','text/javascript');res.end('window.parent.__cloudflareReady=true;');return;}
  const response=secureResponse(new Response('<!doctype html><html><body><h1>Local security fixture</h1><button id="unsafe-button" onclick="window.__bad=true">Test</button></body></html>',{headers:{'Content-Type':'text/html'}}));
  const nonce=response.headers.get('Content-Security-Policy').match(/'nonce-([^']+)'/)[1];
  // Cloudflare documents reading the nonce from the response header and adding
  // it to its generated scripts, including the hidden-frame bootstrap.
  const cloudflare='<script nonce="'+nonce+'">(function(){var a=document.createElement("iframe");a.id="cf-fixture";a.style.display="none";document.body.appendChild(a);var b=a.contentDocument;var d=b.createElement("script");d.nonce='+JSON.stringify(nonce)+';d.textContent="var s=document.createElement(\\\"script\\\");s.src=\\\"/cdn-cgi/challenge-platform/scripts/jsd/main.js\\\";document.head.appendChild(s)";b.head.appendChild(d);})();</script>';
  const hostile='<script>window.__bad=true;</script><script nonce="wrong-test-nonce">window.__bad=true;</script>';
  const body=(await response.text()).replace('</body>',cloudflare+hostile+'</body>');
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(body);
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:process.env.RETAIL_CHROMIUM_EXECUTABLE,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-zygote']});
 try{
  const context=await browser.newContext();await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  await context.addInitScript(()=>{window.__bad=false;window.__violations=[];document.addEventListener('securitypolicyviolation',e=>window.__violations.push({directive:e.effectiveDirective,blocked:e.blockedURI}));});
  const page=await context.newPage();page.setDefaultTimeout(6000);
  let previous;
  for(const url of ['/refund','/boxes']){
   const response=await page.goto(origin+url),csp=response.headers()['content-security-policy'],nonce=csp.match(/'nonce-([^']+)'/)[1];assert.notEqual(nonce,previous);previous=nonce;
   await page.waitForFunction(()=>window.__cloudflareReady===true);assert.equal(await page.evaluate(()=>window.__bad),false);await page.locator('#unsafe-button').click();assert.equal(await page.evaluate(()=>window.__bad),false);
   await page.waitForFunction(()=>window.__violations.length>=3);assert((await page.frameLocator('#cf-fixture').locator('script[src]').getAttribute('src')).startsWith('/cdn-cgi/'));
  }
  // Explicit PWA caches retain the original matching body and CSP even when
  // normal shared HTTP caches are disabled for nonce-bearing documents.
  assert.equal(await page.evaluate(async()=>{const key=location.origin+'/offline-shell-fixture',response=await fetch('/cached-shell');const policy=response.headers.get('Content-Security-Policy'),cache=await caches.open('nonce-fixture');await cache.put(key,response);const cached=await cache.match(key),ok=cached.headers.get('Content-Security-Policy')===policy&&(await cached.text()).includes('Local security fixture');await caches.delete('nonce-fixture');return ok;}),true);
  console.log('PASS: fresh nonce across pages; Cloudflare-style hidden-frame bootstrap works; missing/wrong nonce and inline event handlers stay blocked; explicit offline shell cache retains the matching CSP. Local fixture only.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
