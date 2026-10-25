'use strict';
// Synthetic local API only; no live account, stock, email or payment is touched.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const root=path.resolve(__dirname,'..'),policy=fs.readFileSync(root+'/_headers','utf8').match(/Content-Security-Policy: ([^\n]+)/)[1];
const user={id:'11111111-1111-4111-8111-111111111111',name:'Demo',email:'demo@example.test',theme:'green'},workspace={id:'22222222-2222-4222-8222-222222222222',name:'Demo workspace',role:'owner',settings:{location_label_singular:'Shelf',location_label_plural:'Shelves'}},inventory={id:'33333333-3333-4333-8333-333333333333',workspace_id:workspace.id,name:'Demo inventory',role:'owner',is_default:true};
const fixtureText='<img data-upload-fixture src=x onerror="window.__unsafe=true"><script>window.__unsafe=true</script> & "quoted"';
function api(u){const p=u.pathname.slice(4);
 if(p==='/auth/security/capabilities')return {success:true,cookie_sessions:false};
 if(p==='/me')return {success:true,user};
 if(p==='/workspaces/current')return {success:true,workspace,inventory,inventories:[inventory]};
 if(p==='/workspaces'||p==='/inventories')return {success:true,workspaces:[workspace],inventories:[inventory]};
 if(p==='/billing/status')return {success:true,plan_key:'business',plan_selected:true,allowed:true,access:{allowed:true,plan_key:'business'},subscription:{plan_key:'business'}};
 if(p==='/stale')return {success:true,results:[{description:fixtureText,barcode:'ITEM-1',location:'BOX-1',qty:1,daysOld:30}]};
 if(p==='/search')return {success:true,results:[{description:fixtureText,barcode:'ITEM-1',totalQty:1,locations:[{location:'BOX-1',qty:1}]}]};
 if(p==='/sales/tracker')return {success:true,allTime:{profitMargin:0},thisMonth:{profitTrend:0},thisWeek:{profitTrend:0},monthlyBreakdown:[{month:'October',salesCount:1}],last10Sales:[{date:'2026-10-25',item:fixtureText,amount:0}]};
 if(p==='/mystery-boxes/profit')return {success:true,mysteryBoxes:[{mysteryBoxId:'MB-1',name:fixtureText,notes:fixtureText,status:'Active',items:[{barcode:'ITEM-1',description:fixtureText}]}]};
 return {success:true,user,workspace,inventory,inventories:[inventory],workspaces:[workspace],results:[],products:[],boxes:[],jobs:[],requests:[],recent:[],progress:[],settings:{},summary:{},stats:{},can_edit:true};
}
(async()=>{
 const server=http.createServer(async(req,res)=>{const u=new URL(req.url,'http://localhost');if(u.pathname.startsWith('/api/')){let text='';for await(const chunk of req)text+=chunk;const result=api(u,req.method,text?JSON.parse(text):{});if(req.method!=='GET')await new Promise(r=>setTimeout(r,160));res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));return;}let file=path.resolve(root,'.'+decodeURIComponent(u.pathname));if(!file.startsWith(root+'/')){res.statusCode=403;return res.end();}try{res.setHeader('Content-Security-Policy',policy);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.statusCode=404;res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:process.env.RETAIL_CHROMIUM_EXECUTABLE,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-zygote']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});await context.addInitScript(({origin,user,workspace,inventory})=>{localStorage.setItem('inventoryos_api_base',origin+'/api');localStorage.setItem('inventoryos_user',JSON.stringify(user));localStorage.setItem('inventoryos_token','local-fixture-token');localStorage.setItem('inventoryos_selected_workspace_id',workspace.id);localStorage.setItem('inventoryos_selected_inventory_ids',JSON.stringify([inventory.id]));window.__csp=[];document.addEventListener('securitypolicyviolation',e=>window.__csp.push(e.violatedDirective));},{origin,user,workspace,inventory});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.fulfill({contentType:'text/javascript',body:''}));
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(7000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.dismiss());
  for(const [url,selector,action]of [['stale.html','.item-name'],['salestracker.html','.sale-item'],['mysteryboxes.html','.mb-name'],['reprint.html','.result-title',async()=>{await page.locator('#query').fill('fixture');await page.getByRole('button',{name:'Search Product',exact:true}).click();}]]){
   await page.goto(origin+'/'+url);if(action)await action();await page.locator(selector).first().waitFor();assert((await page.locator(selector).first().textContent()).includes(fixtureText),url+' displays the literal imported name');assert.equal(await page.locator('[data-upload-fixture]').count(),0,url+' must not create imported HTML elements');assert.equal(await page.evaluate(()=>window.__unsafe),undefined);
  }
  assert.deepEqual(errors,[]);console.log('PASS: imported HTML-shaped names remain plain text on stale stock, sales tracker, mystery boxes and barcode reprinting. Local synthetic API only.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
