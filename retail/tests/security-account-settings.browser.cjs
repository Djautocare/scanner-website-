'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.RETAIL_BROWSER_MODULES),root=path.resolve(__dirname,'../..');
(async()=>{
 const server=http.createServer((req,res)=>{try{const p=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!p.startsWith(root+'/'))throw Error('path');res.setHeader('Content-Security-Policy',fs.readFileSync(root+'/_headers','utf8').match(/Content-Security-Policy: ([^\n]+)/)[1]);res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'text/javascript'})[path.extname(p)]||'application/octet-stream');res.end(fs.readFileSync(p));}catch{res.statusCode=404;res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:process.env.RETAIL_CHROMIUM_EXECUTABLE,args:JSON.parse(process.env.RETAIL_CHROMIUM_ARGS||'[]')});
 try{
 for(const admin of [false,true]){
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage(),errors=[],writes=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(({origin})=>{localStorage.setItem('inventoryos_api_base',origin+'/api');localStorage.setItem('inventoryos_token','FAKE');localStorage.setItem('inventoryos_user',JSON.stringify({id:'account-1',name:'Test Account',email:'test@example.test'}));localStorage.setItem('inventoryos_selected_workspace_id','workspace-1');localStorage.setItem('inventoryos_selected_inventory_ids',JSON.stringify(['inventory-1']));},{origin});
  await page.route('**/api/**',async route=>{
   const req=route.request(),u=new URL(req.url()),p=u.pathname.slice(4);if(req.method()!=='GET')writes.push({path:p,body:req.postDataJSON()});
   const workspace={id:'workspace-1',name:'Test workspace',role:'owner',settings:{location_label_singular:'Box',location_label_plural:'Boxes'}},inventory={id:'inventory-1',workspace_id:workspace.id,workspace_name:workspace.name,name:'Test stock',role:'owner',is_default:true};let body={success:true};
   if(p==='/me')body.user={id:'account-1',name:'Test Account',email:'test@example.test',theme:'green'};
   else if(p==='/workspaces/current')body.workspace=workspace;
   else if(p==='/workspaces/inventories')body.inventories=[inventory];
   else if(p==='/billing/status')body={success:true,workspace,billing:{plan_key:'business',plan_name:'Business',allowed:true}};
   else if(p==='/billing/storage-status')body.storage={plan_name:'Business',percentage:1,used_bytes:1024,limit_bytes:102400};
   else if(p==='/admin/me'){await new Promise(r=>setTimeout(r,200));body.admin=admin;}
   else if(p==='/manufacturing/status'){await new Promise(r=>setTimeout(r,250));body={success:true,workspace_id:workspace.id,role:'owner',allowed:true,enabled:false,active:false};}
   else if(p==='/remove-preferences')body={success:true,settings:{},can_edit:true};
   else if(p==='/inbound-labels/status')body={success:true,allowed:false,recent:[],progress:[]};
   else if(p==='/help')body={success:true,workspace,account_email:'test@example.test',requests:[]};
   else if(p==='/auth/theme')body.theme='green';
   await route.fulfill({json:body});
  });
  await page.goto(origin+'/settings.html?area=retail');await page.locator('#account-settings-workspace #manufacturingSettingsCard').waitFor({state:'attached'});await page.locator('#account-settings-dispatch #removePreferencesCard').waitFor({state:'attached'});
  assert.equal(await page.locator('.settings-accordion > details:not([hidden])').count(),admin?11:10);assert.equal(await page.locator('#settingsBackDashboard').getAttribute('href'),'retail/index.html');assert.equal((await page.locator('#iosShellHeading h1').innerText()).trim(),'Settings');
  assert.equal(await page.locator('#account-settings-admin').isVisible(),admin);assert.equal(await page.getByRole('button',{name:'Open Admin Portal',exact:true}).isVisible(),false);
  if(!admin)await page.screenshot({path:'/tmp/inventoryos-account-settings-dark.png',fullPage:true});
  if(admin){await page.locator('#account-settings-admin > summary').click();assert(await page.getByRole('button',{name:'Open Admin Portal',exact:true}).isVisible());}
  await page.locator('#account-settings-printing > summary').click();const printing=page.locator('#printingSettingsCard');assert(await printing.isVisible());
  if(!admin)await page.locator('#account-settings-printing').screenshot({path:'/tmp/inventoryos-printer-setup-dark.png'});
  assert(await printing.getByRole('button',{name:'Set up printing for Windows Intel, AMD & ARM · 64-bit',exact:true}).isVisible());assert(await printing.getByRole('button',{name:'Set up printing for Mac Apple silicon & Intel',exact:true}).isVisible());await printing.getByText('Standard QZ Tray downloads only',{exact:true}).click();
  for(const [name,file]of [['Download for Windows Intel / AMD · 64-bit','qz-tray-2.3.0-x86_64.exe'],['Download for Mac Apple silicon · M-series','qz-tray-2.3.0-arm64.pkg'],['Download for Mac Intel processor','qz-tray-2.3.0-x86_64.pkg']]){const link=printing.getByRole('link',{name,exact:true});assert(await link.isVisible());assert((await link.getAttribute('href')).endsWith('/'+file));assert.equal(await link.getAttribute('rel'),'noopener noreferrer');}
  assert.equal(await printing.getByRole('link',{name:'Open Printer Setup & test labels',exact:true}).getAttribute('href'),'printer-setup.html');await printing.getByText('Windows on ARM and other downloads',{exact:true}).click();assert(await printing.getByRole('link',{name:'Download for Windows ARM ARM64 / Snapdragon',exact:true}).isVisible());
  await page.locator('#account-settings-security > summary').click();await page.locator('#currentPassword').fill('test-password');await page.locator('#newPassword').fill('new-password');await page.locator('#confirmPassword').fill('new-password');await page.getByRole('button',{name:'Change Password',exact:true}).click();await page.getByText('Password changed successfully',{exact:false}).waitFor();assert.equal(writes.filter(x=>x.path==='/auth/change-password').length,1);
  await page.locator('#account-settings-appearance > summary').click();await page.getByRole('button',{name:'Blue',exact:true}).click();assert.equal(await page.locator('html').getAttribute('data-theme'),'blue');await page.getByRole('button',{name:'Light',exact:true}).click();assert.equal(await page.locator('html').getAttribute('data-appearance'),'light');
  await page.locator('#account-settings-dispatch > summary').click();await page.getByRole('button',{name:'Save Selling & Dispatch Settings',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#removePreferencesCard').textContent.includes('saved'));assert.equal(writes.filter(x=>x.path==='/remove-preferences').length,1);
  await page.getByRole('tab',{name:'Help',exact:true}).click();await page.getByRole('heading',{name:'Send a help request',exact:true}).waitFor();await page.getByRole('tab',{name:'Settings',exact:false}).click();assert(await page.locator('#account-settings-dispatch').evaluate(el=>el.open));
  await page.locator('#account-settings-workspace > summary').focus();await page.keyboard.press('Enter');assert(await page.locator('#account-settings-workspace').evaluate(el=>el.open));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.equal(await page.locator('.settings-grid > .card').count(),0);assert.deepEqual(errors,[]);
  await page.locator('.settings-accordion > details').evaluateAll(items=>items.forEach(el=>el.open=false));
  await page.screenshot({path:'/tmp/inventoryos-account-settings-'+(admin?'admin':'member')+'.png',fullPage:true});
 }
 console.log('PASS account settings: mobile dropdowns, delayed workspace/dispatch controls, backend-approved admin visibility, preserved password/theme/preferences actions, keyboard access, Help navigation and Retail return link.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exit(1);});
