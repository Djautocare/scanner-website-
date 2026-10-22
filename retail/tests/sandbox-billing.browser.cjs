'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.RETAIL_BROWSER_MODULES),root=path.resolve(__dirname,'../..');
(async()=>{
 const f=await require('../../backend-updates/retail/tests/till-fixture.cjs')(),{P,db,owner,workspace,inventory,other}=f;
 process.env.STRIPE_SECRET_KEY='sk_live_FAKE';process.env.STRIPE_PRICE_RETAIL_MONTHLY='price_live_FAKE';
 process.env.STRIPE_RETAIL_SANDBOX_SECRET_KEY='sk_test_FAKE';process.env.STRIPE_RETAIL_SANDBOX_PRICE_MONTHLY='price_test_FAKE';process.env.STRIPE_RETAIL_SANDBOX_WEBHOOK_SECRET='whsec_FAKE';
 await db.query("UPDATE retail_stores SET name=CASE WHEN inventory_id=$1 THEN 'First shop' ELSE 'Second shop' END",[inventory]);
 let queue=Promise.resolve();
 const server=http.createServer(async(req,res)=>{try{
  const u=new URL(req.url,'http://localhost');
  if(u.pathname.startsWith('/api/')){
   let raw='';for await(const x of req)raw+=x;
   const input={...f.req(''),headers:req.headers,body:raw?JSON.parse(raw):{},params:{id:owner}};
   queue=queue.then(async()=>{try{
    let result;if(u.pathname===`/api/admin/users/${owner}/retail`)result=req.method==='POST'?await P.adminOverride(input):await P.adminStores(input);
    else if(u.pathname==='/api/retail/platform')result=await P.management(input);
    else if(u.pathname==='/api/retail/billing-summary')result=await P.billingSummary(input);
    else throw Error('Unexpected API request: '+u.pathname);
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));
   }catch(e){res.statusCode=e.statusCode||400;res.end(JSON.stringify({success:false,error:e.message}));}});return;
  }
  if(u.pathname==='/admin-test.html'){
   res.setHeader('Content-Type','text/html');res.end(`<meta charset="utf-8"><div id="drawerContent"></div><script src="/js/api.js"></script><script src="/retail/admin-platform.js"></script><script>InventoryRetailAdmin.open('${owner}')</script>`);return;
  }
  if(u.pathname==='/platform-test.html'){
   res.setHeader('Content-Type','text/html');res.end(`<meta charset="utf-8"><div id="platformNotice"></div><div id="platformMain"></div><dialog id="retailDialog"><h2 id="retailDialogTitle"></h2><div id="retailDialogBody"></div><button id="retailDialogClose">Close</button></dialog><script src="/js/api.js"></script><script>InventoryTopbar={init:async()=>{}}</script><script src="/retail/platform.js"></script><script>InventoryRetailPlatform.mount('billing',{inventory:'${other}'})</script>`);return;
  }
  const file=path.resolve(root,'.'+u.pathname);if(!file.startsWith(root+'/'))throw Error('Invalid path');
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[path.extname(file)]||'text/plain');res.end(fs.readFileSync(file));
 }catch(e){res.statusCode=404;res.end(e.message);}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:process.env.RETAIL_CHROMIUM_EXECUTABLE,args:JSON.parse(process.env.RETAIL_CHROMIUM_ARGS||'[]')});
 try{
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.addInitScript(({origin,owner,workspace})=>{
   localStorage.setItem('inventoryos_api_base',origin+'/api');localStorage.setItem('inventoryos_token','test');localStorage.setItem('inventoryos_user',JSON.stringify({id:owner,name:'Test owner'}));localStorage.setItem('inventoryos_retail_workspace_id',workspace);
  },{origin,owner,workspace});
  await page.goto(origin+'/admin-test.html');await page.locator('#retailAdminStore').selectOption(other);
  await page.getByText('Stripe sandbox testing',{exact:true}).click();
  await page.locator('#retailBillingEnvironment [name=environment]').selectOption('sandbox');await page.locator('#retailBillingEnvironment [name=reason]').fill('Separate test shop');
  await page.getByRole('button',{name:'Save billing environment',exact:true}).click();
  await page.getByText('Sandbox billing saved for Second shop.',{exact:false}).waitFor();
  assert.equal(await page.locator('#retailAdminStore').inputValue(),other);
  assert.equal(await page.locator('#retailBillingEnvironment [name=environment]').inputValue(),'sandbox');
  assert(await page.locator('#retailBillingEnvironment').isVisible());
  assert.equal((await db.query('SELECT billing_environment FROM retail_stores WHERE inventory_id=$1',[other])).rows[0].billing_environment,'sandbox');
  await page.goto(origin+'/platform-test.html');await page.getByRole('button',{name:'Test subscribe — £19.99/month',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Test subscribe — £19.99/month',exact:true}).isEnabled(),true);
  await page.goto(origin+'/retail/billing.html');await page.getByRole('button',{name:'Test subscribe — £19.99/month',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Subscribe — £19.99/month',exact:true}).count(),1);
  // An existing checkout must still prevent switching modes; show its error by the control.
  await db.query("UPDATE retail_stores SET checkout_session_id='cs_live_FAKE' WHERE inventory_id=$1",[inventory]);
  await page.goto(origin+'/admin-test.html');await page.locator('#retailAdminStore').selectOption(inventory);await page.getByText('Stripe sandbox testing',{exact:true}).click();
  await page.locator('#retailBillingEnvironment [name=environment]').selectOption('sandbox');await page.locator('#retailBillingEnvironment [name=reason]').fill('Must be rejected');await page.getByRole('button',{name:'Save billing environment',exact:true}).click();
  await page.locator('#retailBillingEnvironmentResult').getByText('This shop already has Stripe billing history. Create a separate test shop instead',{exact:true}).waitFor();
  assert.equal((await db.query('SELECT billing_environment FROM retail_stores WHERE inventory_id=$1',[inventory])).rows[0].billing_environment,'live');
  assert.deepEqual(errors,[]);await context.close();
  console.log('PASS: admin sandbox save preserves selected shop and confirms saved mode; both billing screens show Test subscribe; live shop retains normal subscribe; failed mode change is visible and preserves billing history.');
 }finally{await browser.close();await new Promise(r=>server.close(r));await db.close();}
})().catch(e=>{console.error(e);process.exit(1);});
