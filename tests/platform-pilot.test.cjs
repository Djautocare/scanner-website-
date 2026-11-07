'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
test('pilot navigation uses the authenticated API and stays hidden for another account',async()=>{
 for(const allowed of [false,true]){
  let calls=0;const link={hidden:true};
  const context={InventoryAPI:{request:async p=>{assert.equal(p,'/platform/status');calls++;return allowed?{success:true,enabled:true,pilot:true}:{success:false};}},document:{querySelectorAll:()=>[link]}};
  vm.createContext(context);vm.runInContext(read('platform/nav.js'),context);await new Promise(r=>setImmediate(r));
  assert.equal(calls,1);assert.equal(link.hidden,!allowed);
 }
});
test('marketplace API keeps the signed-in owner credentials in private pilot requests',async()=>{
 let loggedIn=true,authenticated=0,publicCalls=0;
 const context={window:{},Intl,URL,document:{getElementById:()=>null},
  fetch:async()=>{publicCalls++;return {json:async()=>({success:true})};},
  InventoryAPI:{API_BASE:'https://api.example.test',isLoggedIn:()=>loggedIn,request:async p=>{authenticated++;assert.equal(p,'/platform/marche/directory');return {success:true};}}};
 vm.createContext(context);vm.runInContext(read('platform/common.js'),context);
 await context.window.PlatformUI.api('/marche/directory',{publicOnly:true});
 assert.equal(authenticated,1);assert.equal(publicCalls,0);
 loggedIn=false;await context.window.PlatformUI.api('/marche/directory',{publicOnly:true});
 assert.equal(authenticated,1);assert.equal(publicCalls,1);
});
test('both pilot pages show the private inventory and test-payment boundary',()=>{
 for(const page of ['platform/index.html','marche/index.html']){
  assert.match(read(page),/id="pf-rollout"/);assert.match(read(page),/common\.js\?v=commerce-1/);
 }
 assert.match(read('platform/platform.js'),/Payments are in test mode/);
 assert.match(read('marche/store.js'),/No live payments/);
});

test('administration is embedded only in the portal and the old standalone URL redirects there',()=>{
 assert(!read('platform/index.html').includes('view=admin'));
 assert(!read('platform/platform.js').includes('async function admin()'));
 assert(read('platform/platform.js').includes("location.replace('/admin.html#platformAdmin')"));
 assert(read('admin.html').includes('id="platformAdmin"'));
 assert(read('admin.html').includes('/platform/admin.js?v=commerce-1'));
 assert(read('platform/admin.js').includes("api('/access')"));
 assert(read('platform/admin.js').includes('generation++'));
});
test('authenticator setup is reused and management pages request verified access before loading tools',()=>{
 assert(read('js/security-ui.js').includes('Object.freeze({loginChallenge,loadStatus,setup})'));
 const source=read('platform/platform.js');assert(source.indexOf("await api('/access')")<source.indexOf('await ({stock,seller,accounts})'));
 assert(read('js/pages/admin.1.js').includes("PlatformUI.showAccessGate($('adminMfaGate')"));
 assert(read('marche/store.js').includes("checkoutAvailable=['staging','test','live'].includes(d.checkout)"));
});
test('leaving the admin panel discards a pending review response',async()=>{
 const events={},main={innerHTML:'',replaceChildren(){this.innerHTML='';},querySelectorAll(){return [];}};
 let finish;
 const pending=new Promise(resolve=>{finish=resolve;});
 const ctx={InventoryAPI:{getUser:()=>({is_admin:true})},document:{addEventListener:(n,f)=>events[n]=f},
  window:{},PlatformUI:{$:()=>main,esc:x=>String(x??''),status(){},api:async p=>p==='/access'?{admin:true}:pending,
   bindForm(){},table:()=>'',input:()=>'',select:()=>'',check:()=>'',showAccessGate:()=>false}};
 vm.createContext(ctx);vm.runInContext(read('platform/admin.js'),ctx);
 events['inventoryos-admin-tab']({detail:'platformAdmin'});await Promise.resolve();
 events['inventoryos-admin-tab']({detail:'users'});
 finish({listings:[]});await new Promise(r=>setImmediate(r));
 assert.equal(main.innerHTML,'');
});
