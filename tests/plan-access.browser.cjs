'use strict';
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png'};
const server=http.createServer((req,res)=>{let p=path.join(root,new URL(req.url,'http://localhost').pathname);if(!p.startsWith(root)||!fs.existsSync(p)||fs.statSync(p).isDirectory()){res.statusCode=404;res.end('');return;}res.setHeader('Content-Type',mime[path.extname(p)]||'text/plain');res.end(fs.readFileSync(p));});
const plans=['free','starter','pro','business'].map(key=>({key,name:key[0].toUpperCase()+key.slice(1),monthly_price:0,features:['Fixture plan feature']}));
const scenarios=[
 {name:'selected Free with stale inactive billing',key:'free',access:false,repair:true},
 {name:'expired paid plan on an older backend',key:'pro',access:false,repair:true,confirm:true},
 {name:'expired Business trial falls back to Free',key:'free',access:true,account:true,fallback:true},
 {name:'Business trial reverts to paid Starter',key:'starter',access:true,account:true},
 {name:'Pro cancellation remains active until period end',key:'pro',access:true,account:true},
 {name:'feature denial does not deny account access',key:'free',access:false,account:true},
 {name:'new account still selects a plan',key:'free',access:false,selected:false}
];
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({executablePath:process.env.RETAIL_CHROMIUM_EXECUTABLE||'/workspace/projects/inventoryos-supplier-bulk/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});try{
 for(const fixture of scenarios){
  let row={plan_selected:fixture.selected!==false,plan_key:fixture.key,plan_name:fixture.key,billing_status:fixture.access?'active':'none',access_allowed:fixture.access,is_free_fallback:fixture.fallback||false},writes=0,confirmations=0;
  if(typeof fixture.account==='boolean')row.account_access_allowed=fixture.account;
  const context=await browser.newContext({viewport:{width:375,height:812}});
  await context.addInitScript(base=>{localStorage.setItem('inventoryos_token','fixture-token');localStorage.setItem('inventoryos_user',JSON.stringify({id:'access-fixture'}));localStorage.setItem('inventoryos_api_base',base);},origin+'/api');
  await context.route('**/js/businessTrial.js*',r=>r.fulfill({contentType:'text/javascript',body:'window.InventoryBusinessTrial={billing(){},requestMarkup(){return "";}};'}));
  await context.route('**/retail/shared.js*',r=>r.fulfill({contentType:'text/javascript',body:'window.InventoryRetail={};'}));
  await context.route(origin+'/index.html',r=>r.fulfill({contentType:'text/html',body:'<p>Dashboard reached</p>'}));
  await context.route('**/api/**',async route=>{
   const url=new URL(route.request().url());let data={success:true};
   if(url.pathname.endsWith('/auth/security/capabilities'))data={success:true,cookie_sessions:false};
   else if(url.pathname.endsWith('/billing/status'))data={success:true,workspace:{id:1,name:'Fixture'},billing:row,plans};
   else if(url.pathname.endsWith('/billing/create-checkout-session')){writes++;assert.equal(JSON.parse(route.request().postData()).plan,'free');await new Promise(r=>setTimeout(r,75));row={plan_selected:true,plan_key:'free',plan_name:'Free',billing_status:'free',access_allowed:true,account_access_allowed:true};data={success:true,free_selected:true};}
   else if(url.pathname.endsWith('/auth/theme'))data={success:true,theme:'green'};
   return route.fulfill({json:data});
  });
  const page=await context.newPage();page.on('dialog',async d=>{confirmations++;await d.accept();});await page.goto(origin+'/billing.html');await page.locator('[data-plan="free"]').waitFor();
  const allowed=Boolean(row.plan_selected&&(row.account_access_allowed??row.access_allowed));
  assert.equal(await page.locator('#dashboardTopButton').isEnabled(),allowed,fixture.name);
  if(fixture.repair){
   assert.equal(await page.locator('[data-plan="free"]').isEnabled(),true);assert.equal(await page.locator('[data-plan="free"]').innerText(),'Continue with Free');
   assert(!await page.locator('#message').innerText().then(t=>t.includes('billing status is locked')));
   await page.locator('[data-plan="free"]').dblclick();await page.waitForFunction(()=>document.querySelector('#dashboardTopButton')?.disabled===false);
   assert.equal(writes,1);assert.equal(confirmations,fixture.confirm?1:0);assert.equal(await page.evaluate(()=>localStorage.getItem('inventoryos_getting_started_v1:access-fixture')),null);
  }else if(allowed){assert.equal(await page.locator('[data-plan="'+fixture.key+'"]').innerText(),'Current Plan');assert.equal(await page.locator('[data-plan="'+fixture.key+'"]').isEnabled(),false);}
  if(fixture.fallback)assert((await page.locator('#statusText').innerText()).includes('your saved stock is kept'));
  await page.goto(origin+'/login.html');await page.waitForURL(allowed||fixture.repair?'**/index.html':'**/billing.html');
  assert.equal(writes,fixture.repair?1:0);console.log('PASS billing + login: '+fixture.name);await context.close();
 }
}finally{await browser.close();await new Promise(r=>server.close(r));}})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
