import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {coreSteps,createPractice,addPracticeStock,removePracticeStock,reorderQuantity,receivePracticeOrder,assignPracticeOrder,escapeHTML} from '../js/practice-model.mjs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
function fixture({account='new',pathname='/index.html',pending,storageFails=false}={}){
 const values=new Map([['inventoryos_token','fixture-session'],['inventoryos_user',JSON.stringify({id:account})]]),redirects=[];
 if(pending)values.set('inventoryos_getting_started_v1:'+encodeURIComponent(account),JSON.stringify({version:1,status:'pending',step:'add-name',coreComplete:false,explored:[]}));
 const location={pathname,assign:url=>redirects.push(['assign',url]),replace:url=>redirects.push(['replace',url])};
 const localStorage={getItem:k=>values.get(k)??null,setItem(k,v){if(storageFails)throw Error('Storage full');values.set(k,v);}};
 const context={localStorage,location,Map,Set};context.window=context;vm.createContext(context);vm.runInContext(read('js/onboarding-gate.js'),context);
 return {api:context.InventoryGettingStarted,values,redirects,context};
}
test('newly enrolled accounts are sent to practice; existing users and Retail are not interrupted',()=>{
 assert.deepEqual(fixture().redirects,[]);assert.deepEqual(fixture({pending:true}).redirects,[['replace','/getting-started.html']]);
 for(const pathname of ['/login.html','/billing.html','/settings.html','/getting-started.html','/retail/dashboard/index.html','/retail/till/index.html'])assert.deepEqual(fixture({pending:true,pathname}).redirects,[],pathname);
 const f=fixture();assert(f.api.begin());assert.deepEqual(f.redirects,[['assign','/getting-started.html']]);assert.equal(f.api.read().status,'pending');
 assert(f.api.finish('new'));f.redirects.length=0;f.api.enforce();assert.equal(f.redirects.length,0);
});
test('tutorial markers are per account and contain no practice item, quantity, receipt or location data',()=>{
 const f=fixture({pending:true});f.api.write({status:'pending',step:'remove-qty',coreComplete:false,explored:['dispatch','invented'],item:{name:'Private item'},location:'Secret shelf',receipt:'private bytes',qty:234});
 const record=JSON.parse(f.values.get('inventoryos_getting_started_v1:new'));assert.deepEqual(Object.keys(record).sort(),['version','status','step','coreComplete','explored'].sort());assert.deepEqual(record.explored,['dispatch']);
 f.values.set('inventoryos_user',JSON.stringify({id:'another'}));assert.equal(f.api.read(),null);assert.equal(f.api.finish('new'),false);assert.equal(JSON.parse(f.values.get('inventoryos_getting_started_v1:new')).status,'pending');
});
test('practice stock validates quantities and uses isolated memory with explicit removal and receiving steps',()=>{
 const m=createPractice();m.location={name:'BOX-1',notes:''};addPracticeStock(m,{name:'Example item',qty:2,location:'BOX-1'});assert.equal(m.item.qty,2);
 assert.throws(()=>removePracticeStock(m,1));m.bundle=true;m.consolidated=true;assert.throws(()=>removePracticeStock(m,3));assert.equal(m.item.qty,2);removePracticeStock(m,1);assert.equal(m.item.qty,1);
 assert.equal(reorderQuantity(m),9);m.order={qty:9,status:'needed'};assert.throws(()=>receivePracticeOrder(m));m.order.status='ordered';receivePracticeOrder(m);assert.equal(m.item.qty,1);assignPracticeOrder(m);assert.equal(m.item.qty,10);
 assert.throws(()=>addPracticeStock(m,{name:'',qty:2,location:'BOX-1'}));assert.throws(()=>addPracticeStock(m,{name:'Item',qty:1.5,location:'BOX-1'}));assert.throws(()=>addPracticeStock(m,{name:'Item',qty:2,location:'other'}));
 const fresh=createPractice();assert.equal(fresh.item.qty,0);assert.equal(fresh.location,null);assert.deepEqual(fresh.expenses,[]);assert.deepEqual(fresh.labels,[]);
});
test('resumed progress uses fresh examples, keeps the tutorial step and never restores entered practice data',()=>{
 const resumed=createPractice({step:'remove-confirm',item:{name:'PRIVATE'},coreComplete:false});assert.equal(resumed.step,'remove-confirm');assert.equal(resumed.item.name,'Thermal label roll');assert.equal(resumed.item.qty,2);assert.equal(resumed.location.name,'BOX-1');
 assert.equal(createPractice({step:'unknown'}).step,coreSteps[0]);assert.equal(createPractice({step:'core-done'}).coreComplete,true);
 assert(!escapeHTML('<img src=x onerror=alert(1)>').includes('<img'));
});
test('practice is noindex, has no live API/email/printing integration, and the guide exposes replay',()=>{
 const html=read('getting-started.html'),script=read('js/practice.js'),model=read('js/practice-model.mjs');
 assert(html.includes('noindex,nofollow'));assert(!html.includes('/js/api.js'));assert(!html.includes('qz-tray'));assert(!html.includes('security-session.js'));
 assert(!/\b(?:fetch|XMLHttpRequest|WebSocket|sendBeacon)\s*\(/.test(script+model));assert(!/localStorage\.(?:setItem|removeItem)/.test(script+model));assert(!script.includes('manufacturing'));
 assert(script.includes('Send test email'));assert(script.includes('no real email is sent or received'));assert(script.includes('Settings → Help'));assert(read('settings.html').includes('getting-started.html?replay=1'));
 for(const name of ['index','add','remove','boxes','billing','login']){const page=read(name+'.html');assert(page.includes('/js/onboarding-gate.js?v=1'));assert(page.indexOf('/js/onboarding-gate.js')<page.indexOf('js/api.js'));}
});
test('Free selection starts practice only for the first successful selection, with duplicate-click protection',async()=>{
 async function choose({selected=false,plan='free',success=true}={}){
  const records=[],elements={};
  const document={getElementById:id=>elements[id]??={innerText:'',disabled:false,classList:{toggle(){}}},querySelectorAll:()=>[]};
  let resolveRequest;
  const api={requireLogin:()=>true,request:async(path,options)=>{if(path==='/billing/status')return {success:false};records.push(JSON.parse(options.body).plan);return new Promise(resolve=>resolveRequest=resolve);}};
  const context={InventoryAPI:api,localStorage:{getItem:()=>null},document,InventoryBusinessTrial:{},confirm:()=>{records.push('confirm');return true;},console,window:{InventoryGettingStarted:{begin:()=>{records.push('practice');return true;}},location:{}}};
  vm.createContext(context);vm.runInContext(read('js/pages/billing.1.js'),context);vm.runInContext('currentStatus={billing:{plan_selected:'+selected+',plan_key:"pro"},plans:[]};',context);
  const first=context.choosePlan(plan),second=context.choosePlan(plan);await Promise.resolve();assert.equal(records.filter(x=>x===plan).length,1);resolveRequest(success?{success:true,...(plan==='free'?{free_selected:true}:{url:'https://checkout.stripe.com/example'})}:{success:false,error:'No change'});await Promise.all([first,second]);return records;
 }
 const fresh=await choose();assert(fresh.includes('practice'));assert(!fresh.includes('confirm'));
 const downgrade=await choose({selected:true});assert(downgrade.includes('confirm'));assert(!downgrade.includes('practice'));
 assert(!(await choose({success:false})).includes('practice'));assert(!(await choose({plan:'pro'})).includes('practice'));
});
