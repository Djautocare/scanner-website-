'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.RETAIL_BROWSER_MODULES),root=path.resolve(__dirname,'../..');
(async()=>{
 const F=await require('../../backend-updates/retail/tests/till-fixture.cjs')(),{db,R,P,inventory,req,pool}=F;
 const sent=[],writes=[],errors=[];let completed=false,queue=Promise.resolve();
 const D=require('../../backend-updates/retail/files/utils/retailStoreDeletion').create({pool,scope:R.scope,ensureSchema:R.ensureSchema,id:require('../../backend-updates/retail/files/utils/retail').id,fail:require('../../backend-updates/retail/files/utils/retail').fail,now:()=>new Date(),sendEmail:async b=>{sent.push(b);return {id:'email_test'};}});
 const server=http.createServer(async(r,res)=>{try{
  const u=new URL(r.url,'http://localhost');
  if(u.pathname==='/test')return res.end(`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/theme.css"><link rel="stylesheet" href="/retail/retail.css"><link rel="stylesheet" href="/retail/platform.css"></head><body class="retail-body"><dialog id="retailDialog" class="retail-dialog"><header class="retail-dialog-header"><h2 id="retailDialogTitle"></h2><button id="retailDialogClose" onclick="this.closest('dialog').close()">Close</button></header><div id="retailDialogBody"></div></dialog><script>localStorage.setItem('inventoryos_retail_workspace_id',${JSON.stringify(F.workspace)});window.InventoryAPI={request:async(p,o={})=>(await fetch('/api'+p,{...o,headers:{'Content-Type':'application/json',...(o.headers||{})}})).json()};</script><script src="/retail/store-deletion.js"></script></body></html>`);
  if(u.pathname.startsWith('/api/')){const chunks=[];for await(const x of r)chunks.push(x);const body=chunks.length?JSON.parse(Buffer.concat(chunks)):{};const input={...req(''),body,query:Object.fromEntries(u.searchParams)};
   queue=queue.then(async()=>{try{let result;if(r.method==='POST')writes.push(u.pathname);if(u.pathname.endsWith('/backup'))result=await D.backup(input);else if(u.pathname.endsWith('/confirm'))result=await D.remove(input);else result=await D.preview(input);res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));}catch(e){res.end(JSON.stringify({success:false,error:e.message}));}});return;}
  const file=path.resolve(root,'.'+u.pathname);if(!file.startsWith(root+'/'))throw Error('Invalid file');res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':'text/css');res.end(fs.readFileSync(file));
 }catch(e){res.statusCode=404;res.end(e.message);}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,executablePath:process.env.RETAIL_CHROMIUM_EXECUTABLE,args:JSON.parse(process.env.RETAIL_CHROMIUM_ARGS||'[]')});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/test');
  const open=()=>page.evaluate(i=>InventoryRetailStoreDeletion.open({inventory:i,name:'Test shop',complete:()=>{window.__deleted=true;}}),inventory);
  await open();await page.getByText('Balance and close every till for this store first.',{exact:true}).waitFor();assert(await page.getByRole('button',{name:'Email my CSV backup',exact:true}).isDisabled());
  await P.ownerChange(req('',{inventory_id:inventory,action:'balance-till',till_id:F.till,amount:'20',close:true}));
  await page.getByRole('button',{name:'Refresh status',exact:true}).click();await page.getByRole('button',{name:'Email my CSV backup',exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector('[data-delete-backup]').disabled);
  assert(await page.getByRole('button',{name:'Permanently delete store',exact:true}).isDisabled());
  await page.getByRole('button',{name:'Email my CSV backup',exact:true}).evaluate(b=>{b.click();b.click();});await page.getByText(/Backup email accepted for owner@example.test/).waitFor();assert.equal(sent.length,1);assert.equal(writes.filter(x=>x.endsWith('/backup')).length,1);
  const phrase=page.locator('[name=confirmation]'),ack=page.locator('[name=received]'),remove=page.getByRole('button',{name:'Permanently delete store',exact:true});
  await phrase.fill('Confirm delete');assert(await remove.isDisabled());await ack.check();assert(await remove.isEnabled());await phrase.fill('confirm delete');assert(await remove.isDisabled());await phrase.fill('Confirm delete');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'/tmp/inventoryos-store-delete-mobile.png',fullPage:true});
  await page.setViewportSize({width:1280,height:1000});await page.screenshot({path:'/tmp/inventoryos-store-delete-desktop.png',fullPage:true});
  await remove.evaluate(b=>{b.click();b.click();});await page.waitForFunction(()=>window.__deleted===true);assert.equal(writes.filter(x=>x.endsWith('/confirm')).length,1);assert.equal((await db.query('SELECT COUNT(*)::int n FROM retail_stores WHERE inventory_id=$1',[inventory])).rows[0].n,0);assert.deepEqual(errors,[]);completed=true;
  console.log('PASS browser: mobile/desktop deletion modal, blockers, account email, mandatory received-backup checkbox, exact phrase, single send/delete on double click, successful completion and no page overflow.');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));await db.close();}
 assert(completed);
})().catch(e=>{console.error(e);process.exitCode=1;});
