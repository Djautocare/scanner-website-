'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),{chromium}=require(process.env.RETAIL_BROWSER_MODULES);
(async()=>{
 const F=await require('../../backend-updates/retail/tests/till-fixture.cjs')(),{R,P,db,owner,workspace,inventory,other,req}=F;
 const overview=new Map();for(const inv of [inventory,other])overview.set(inv,await R.overview(req('',{},inv)));
 let mode='inactive',queue=Promise.resolve(),overviewReads=0;const errors=[];
 const server=http.createServer((request,response)=>{try{const file=path.resolve(root,'.'+new URL(request.url,'http://localhost').pathname);if(!file.startsWith(root+'/'))throw Error('Invalid path');response.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'text/javascript'})[path.extname(file)]||'application/octet-stream');response.end(fs.readFileSync(file));}catch{response.statusCode=404;response.end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,executablePath:process.env.RETAIL_CHROMIUM_EXECUTABLE,args:JSON.parse(process.env.RETAIL_CHROMIUM_ARGS||'[]')});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(({owner,workspace,inventory})=>{if(!localStorage.getItem('inventoryos_retail_workspace_id')){localStorage.setItem('inventoryos_retail_workspace_id',workspace);localStorage.setItem('inventoryos_retail_inventory_ids',JSON.stringify([inventory]));}localStorage.setItem('inventoryos_user',JSON.stringify({id:owner,name:'Test owner'}));localStorage.setItem('inventoryos_token','FAKE');if(sessionStorage.getItem('test_offline'))Object.defineProperty(navigator,'onLine',{get:()=>false,configurable:true});},{owner,workspace,inventory});
  await context.route('**/js/api.js*',route=>route.fulfill({contentType:'text/javascript',body:`window.InventoryAPI={API_BASE:${JSON.stringify(origin+'/api')},getUser:()=>JSON.parse(localStorage.getItem('inventoryos_user')),getToken:()=>localStorage.getItem('inventoryos_token'),requireLogin:()=>true,isLoggedIn:()=>true,request:async(p,o={})=>(await fetch(${JSON.stringify(origin+'/api')}+p,{...o,headers:{'Content-Type':'application/json',...(o.headers||{})}})).json()};`}));
  await context.route('**/retail/store-location.js*',route=>route.fulfill({contentType:'text/javascript',body:`window.InventoryRetailLocation={init:async()=>{},identity:()=>{},selection:()=>({workspace:localStorage.getItem('inventoryos_retail_workspace_id'),inventory:JSON.parse(localStorage.getItem('inventoryos_retail_inventory_ids')).join(',')}),mount:()=>{document.querySelector('#retailLocationView').innerHTML='<h2>Choose your Retail shop</h2>';}};`}));
  await context.route('**/api/**',async route=>{
   queue=queue.then(async()=>{try{
    const request=route.request(),url=new URL(request.url()),inv=request.headers()['x-inventory-ids']||inventory,input={...req('',{},inv),query:Object.fromEntries(url.searchParams)},p=url.pathname.slice('/api/retail'.length),localMode=inv===other?'active':mode;
    let body={success:true};if(p==='/status'){
     if(localMode==='outage')return route.fulfill({status:503,json:{success:false,error:'Temporary test outage'}});
     if(localMode==='forbidden')return route.fulfill({status:403,json:{success:false,error:'Store access was removed'}});
     body={...await R.status(input),active:localMode!=='inactive',allowed:localMode!=='inactive'};
    }else if(p==='/overview'){
     overviewReads++;if(localMode==='denied')return route.fulfill({status:402,json:{success:false,error:'Retail subscription required'}});body=overview.get(inv);
    }else if(p==='/help')body={success:true,account_email:'owner@example.test',workspace:{id:workspace,name:'Test business'},shop:{id:inv,name:'Test shop'},requests:[]};
    else if(p==='/platform')body=await P.management(input);
    else if(p==='/email-receipts/summary')body=await P.receipts.summary(input);
    await route.fulfill({json:body});
   }catch(e){await route.fulfill({status:500,json:{success:false,error:e.message}});}});await queue;
  });
  const nav=async view=>{await page.evaluate(v=>location.hash=v,view);await page.waitForFunction(v=>document.querySelector('#retailTitle').textContent===v,({tasks:'Tasks',products:'Products & stock',deliveries:'Deliveries',counts:'Stock counts',sales:'Transactions',reorders:'Reorder report',cash:'Till & cash',settings:'Retail settings',offline:'Offline & sync',transfer:'Import & export','shelf-labels':'Shelf labels',help:'Help','retail-billing':'Stores & billing','store-location':'Store location'})[view]);};
  const gated=async()=>{await page.locator('#retailView').getByRole('heading',{name:'Activate InventoryOS Retail',exact:true}).waitFor();assert.equal(await page.locator('#retailView #retailHelp').count(),0);};
  await page.goto(origin+'/retail/index.html#help');await page.getByRole('heading',{name:'Send a help request',exact:true}).waitFor();await page.waitForFunction(()=>document.querySelector('#retailConnection').textContent!=='Connecting');
  // Reproduce Help -> Tasks using the actual sidebar control, not just a reload.
  await page.locator('#retailNav [data-view=tasks]').evaluate(b=>b.click());await gated();assert.equal(await page.locator('#retailTitle').textContent(),'Tasks');
  for(const view of ['products','deliveries','counts','sales','reorders','cash','settings','offline','transfer','shelf-labels','tasks']){await nav(view);await gated();}
  assert.equal(overviewReads,0,'Inactive shops must not request paid overview data');
  await nav('retail-billing');await page.getByRole('heading',{name:'InventoryOS Retail',exact:true}).waitFor();await nav('store-location');await page.getByRole('heading',{name:'Choose your Retail shop',exact:true}).waitFor();await nav('help');await page.getByRole('heading',{name:'Send a help request',exact:true}).waitFor();
  // Failed loading must also replace the previous page instead of retaining Help.
  mode='outage';await nav('tasks');await page.locator('#retailNotice').getByText('Temporary test outage',{exact:true}).waitFor();assert.equal(await page.locator('#retailHelp').count(),0);
  // Activation restores normal rendering without requiring a new sign-in.
  mode='active';await page.getByRole('button',{name:'Refresh retail data',exact:true}).click();await page.getByRole('button',{name:'Add task',exact:true}).waitFor();await nav('help');await page.getByRole('heading',{name:'Send a help request',exact:true}).waitFor();await nav('tasks');await page.getByRole('button',{name:'Add task',exact:true}).waitFor();
  // A server rejection after status was active must invalidate the old overview.
  mode='denied';await page.getByRole('button',{name:'Refresh retail data',exact:true}).click();await gated();await nav('products');await gated();assert.equal(await page.locator('#retailView').getByText('Water',{exact:true}).count(),0);
  // A locked cached snapshot must not reappear after an offline restart.
  await page.evaluate(()=>sessionStorage.setItem('test_offline','yes'));await page.reload();await gated();assert.equal(await page.locator('#retailView').getByText('Water',{exact:true}).count(),0);
  await page.evaluate(()=>sessionStorage.removeItem('test_offline'));mode='active';await page.reload();await page.getByRole('button',{name:'Add product',exact:true}).waitFor();
  // Valid paid cached data remains usable for offline browsing.
  await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{get:()=>false,configurable:true});window.dispatchEvent(new Event('offline'));});await nav('tasks');await page.getByRole('button',{name:'Add task',exact:true}).waitFor();assert(await page.getByRole('button',{name:'Add task',exact:true}).isDisabled());
  // Store changes must not carry the inactive state into another licensed store.
  await page.evaluate(other=>{Object.defineProperty(navigator,'onLine',{get:()=>true,configurable:true});localStorage.setItem('inventoryos_retail_inventory_ids',JSON.stringify([other]));window.dispatchEvent(new Event('retail-selection-changed'));},other);await page.getByRole('button',{name:'Add task',exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector('[data-action=task-new]').disabled);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
  console.log('PASS subscription navigation: inactive Help-to-Tasks, every paid tab, billing/help/location access, failed loads, reactivation, server 402, locked-cache restart, valid offline data and per-store state.');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
