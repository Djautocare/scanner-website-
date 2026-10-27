'use strict';
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png'};
const server=http.createServer((req,res)=>{let p=path.join(root,new URL(req.url,'http://localhost').pathname);if(!fs.existsSync(p)&&fs.existsSync(p+'.html'))p+='.html';if(!p.startsWith(root)||!fs.existsSync(p)||fs.statSync(p).isDirectory()){res.statusCode=404;res.end('');return;}res.setHeader('Content-Type',mime[path.extname(p)]||'text/plain');res.end(fs.readFileSync(p));});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({executablePath:process.env.RETAIL_CHROMIUM_EXECUTABLE||'/workspace/projects/inventoryos-supplier-bulk/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});try{
for(const kind of ['first-free','downgrade','failed-free']){
 let selected=kind==='downgrade',planKey=selected?'pro':'free',writes=0,confirmations=0;
 const context=await browser.newContext();await context.addInitScript(base=>{localStorage.setItem('inventoryos_token','fixture-token');localStorage.setItem('inventoryos_user',JSON.stringify({id:'billing-fixture'}));localStorage.setItem('inventoryos_api_base',base);},origin+'/api');
 await context.route('**/js/businessTrial.js*',route=>route.fulfill({contentType:'text/javascript',body:'window.InventoryBusinessTrial={billing(){},requestMarkup(){return "";}};'}));
 await context.route('**/retail/shared.js*',route=>route.fulfill({contentType:'text/javascript',body:'window.InventoryRetail={};'}));
 await context.route('**/api/**',async route=>{const url=new URL(route.request().url());let data={success:true};
  if(url.pathname.endsWith('/auth/security/capabilities'))data={success:true,cookie_sessions:false};
  else if(url.pathname.endsWith('/billing/status'))data={success:true,workspace:{id:1,name:'Fixture'},billing:{plan_selected:selected,access_allowed:selected,plan_key:planKey,plan_name:planKey==='pro'?'Pro':'Free'},plans:[{key:'free',name:'Free',monthly_price:0,features:['100 active items']},{key:'pro',name:'Pro',monthly_price:14.99,features:['Example paid tools']}]};
  else if(url.pathname.endsWith('/billing/create-checkout-session')){writes++;assert.equal(JSON.parse(route.request().postData()).plan,'free');await new Promise(r=>setTimeout(r,100));if(kind==='failed-free')data={success:false,error:'Fixture checkout failed'};else{selected=true;planKey='free';data={success:true,free_selected:true};}}
  else if(url.pathname.endsWith('/auth/theme'))data={success:true,theme:'green'};
  return route.fulfill({json:data});
 });
 const page=await context.newPage();page.on('dialog',async dialog=>{confirmations++;await dialog.accept();});await page.goto(origin+'/billing.html');await page.locator('[data-plan="free"]').waitFor();await page.locator('[data-plan="free"]').dblclick();
 if(kind==='first-free'){await page.waitForURL('**/getting-started.html');await page.locator('#practice-create-location').waitFor();assert.equal(confirmations,0);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('inventoryos_getting_started_v1:billing-fixture')).status),'pending');}
 else if(kind==='downgrade'){await page.locator('[data-plan="free"][disabled]').waitFor();assert(page.url().endsWith('/billing.html'));assert.equal(confirmations,1);assert.equal(await page.evaluate(()=>localStorage.getItem('inventoryos_getting_started_v1:billing-fixture')),null);}
 else{await page.getByText('Fixture checkout failed',{exact:true}).waitFor();assert.equal(await page.locator('[data-plan="free"]').isEnabled(),true);assert.equal(await page.evaluate(()=>localStorage.getItem('inventoryos_getting_started_v1:billing-fixture')),null);}
 assert.equal(writes,1);console.log('PASS real billing page '+kind+': one plan request, correct tutorial trigger and confirmation behaviour.');await context.close();
}
}finally{await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
