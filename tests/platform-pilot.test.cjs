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
  assert.match(read(page),/id="pf-rollout"/);assert.match(read(page),/common\.js\?v=pilot-1/);
 }
 assert.match(read('platform/platform.js'),/Payments are in test mode/);
 assert.match(read('marche/store.js'),/No live payments/);
});
