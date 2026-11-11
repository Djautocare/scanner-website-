'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
function element(){return {innerHTML:'',textContent:'',hidden:false,value:'',style:{},children:[],classList:{add(){},remove(){},contains(){return false;},toggle(){}},setAttribute(){},removeAttribute(){},addEventListener(){},querySelector(){return element();},querySelectorAll(){return [];},after(){},focus(){}};}
function fixture(pathname='/index.html'){
 const nodes=new Map(),values=new Map(),context={console,URL,Date,Intl,JSON,Map,Set,Promise,encodeURIComponent,decodeURIComponent,setInterval(){},clearInterval(){},setTimeout(){},clearTimeout(){},CustomEvent:class{constructor(type,init){this.type=type;this.detail=init?.detail;}},crypto:{randomUUID:()=> 'fixture-id'}};
 context.document={readyState:'loading',hidden:false,body:element(),addEventListener(){},getElementById:id=>nodes.get(id)||nodes.set(id,element()).get(id),querySelector:selector=>nodes.get(selector)||nodes.set(selector,element()).get(selector),querySelectorAll:()=>[]};
 context.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
 context.location={pathname,hash:'',search:''};context.history={replaceState(){}};context.matchMedia=()=>({matches:false});
 context.InventoryAPI={getUser:()=>({id:'fixture-account'}),getSelectedInventoryHeader:()=> 'fixture-inventory'};
 context.window=context;context.addEventListener=()=>{};context.dispatchEvent=()=>{};context.sessionStorage=context.localStorage;
 vm.createContext(context);return {context,nodes};
}
function expose(file,name,expression){return read(file).replace(/\}\)\(\);\s*$/,`window.${name}=${expression};})();`);}
test('reseller navigation reaches existing live pages and expands the current stock section',()=>{
 const {context}=fixture('/remove.html');vm.runInContext(read('js/appShell.js'),context);
 assert.equal(context.InventoryOSAppShell.currentPageKey(),'remove');
 const html=context.InventoryOSAppShell.navigation('remove');
 assert.match(html,/<details class="design-nav-group" open><summary>Stock/);
 assert.match(html,/href="remove.html"[\s\S]*?aria-current="page"/);
 assert.match(html,/data-design-area-links/);
 assert.match(html,/href="settings.html#guide"/);
 assert.match(html,/href="getting-started.html\?replay=1"/);
 for(const [,href]of html.matchAll(/href="([^"]+)"/g))assert(fs.existsSync(path.join(root,href.split(/[?#]/)[0])),href);
 for(const [route,key]of [['printjobs','printjobs'],['boxcontents','boxes'],['workspace-members','settings']]){context.location.pathname='/'+route+'.html';assert.equal(context.InventoryOSAppShell.currentPageKey(),key);}
 assert(!html.includes('admin.html'),'Admin visibility remains with the authorised account controls');
});
test('all Manufacturing views render with empty live inventory; setup uses the existing routes',()=>{
 const {context,nodes}=fixture('/manufacturing/index.html');
 context.InventoryRecipeCalculator={view:()=>'<p>Calculator</p>'};
 vm.runInContext(expose('js/manufacturing.js','fixtureUI','{render,set(value,tab){data=value;selected=tab;}}'),context);
 const data={status:{allowed:true,enabled:true,role:'owner'},materials:[],rawlots:[],recipes:[],runs:[],equipment:[],timers:[],finished:[],units:['each','g','kg','ml','l','m']};
 for(const tab of ['overview','setup','materials','recipes','calculate','production','batches','equipment','timers']){
  context.fixtureUI.set(data,tab);context.fixtureUI.render();assert(nodes.get('mfgView').innerHTML.length>0,tab);
 }
 context.fixtureUI.set(data,'setup');context.fixtureUI.render();const html=nodes.get('mfgView').innerHTML;
 for(const route of ['materials','recipes','calculate','production'])assert(html.includes('data-tab="'+route+'"'));
 assert(!html.includes('demo PIN'));assert(html.includes('does not change stock'));
});
test('Manufacturing setup retains viewer and disabled-mode write restrictions',()=>{
 const {context,nodes}=fixture('/manufacturing/index.html');context.InventoryRecipeCalculator={view:()=>''};
 vm.runInContext(expose('js/manufacturing.js','fixtureUI','{render,set(value){data=value;selected="setup";}}'),context);
 for(const status of [{allowed:true,enabled:true,role:'viewer'},{allowed:true,enabled:false,role:'owner'},{allowed:false,enabled:true,role:'owner'}]){
  context.fixtureUI.set({status,materials:[],recipes:[],runs:[]});context.fixtureUI.render();
  const writes=[...nodes.get('mfgView').innerHTML.matchAll(/<button[^>]*data-action="[^"]+"[^>]*>/g)].map(m=>m[0]);
  assert(writes.length>=3);assert(writes.every(tag=>tag.includes('disabled')));
 }
});
function retailFixture(){
 const f=fixture('/retail/index.html'),c=f.context;
 c.InventoryRetailLocation={selection:()=>({workspace:'shop-workspace',inventory:'shop-inventory'}),identity(){}};
 c.InventoryRetailOffline={};c.InventoryRetailLabels={create:()=>({})};
 c.InventoryRetailKeyboard={attach(){}};
 c.InventoryRetailBusiness={create:()=>({nav:()=>[],views:{},broadcast(){},extras:()=>({})})};
 c.InventoryRetailOrdering={create:()=>({views:{},mount(){},supported:()=>false})};
 vm.runInContext(read('retail/counter.js'),c);
 vm.runInContext(expose('retail/retail.js','fixtureUI','{render,set(value,tab,active){data=value;online=true;view=tab;currentScope=scopeKey();pageAccess={scope:scopeKey(),active};}}'),c);
 return f;
}
test('Retail setup renders a real one-use till pairing path without demo credentials',()=>{
 const {context,nodes}=retailFixture();
 context.fixtureUI.set({role:'owner',counts:[],operations:{},business:{config:{features:{}}}},'setup',true);context.fixtureUI.render();
 const html=nodes.get('#retailView').innerHTML;
 for(const route of ['store-location','products','tills','cash'])assert(html.includes('data-view="'+route+'"'));
 assert(html.includes('Get pairing code'));assert(html.includes('one-use code'));assert(html.includes('retail/till/index.html'));
 assert.equal(nodes.get('#retailManageTills').hidden,false);
 assert(!/482913|1001|1234/.test(html));
});
test('unsubscribed Retail cannot retain a previously rendered page, including new setup',()=>{
 const {context,nodes}=retailFixture(),data={role:'owner',counts:[],operations:{},business:{config:{features:{}}}};
 for(const tab of ['setup','products','tasks','dashboard']){
  context.fixtureUI.set(data,tab,false);context.fixtureUI.render();const html=nodes.get('#retailView').innerHTML;
  assert(html.includes('Check your store coverage'),tab);assert(!html.includes('A clear path to your first sale.'),tab);
 }
});
test('Retail setup and navigation keep management links away from viewer accounts',()=>{
 const {context,nodes}=retailFixture();
 context.fixtureUI.set({role:'viewer',counts:[],operations:{},business:{config:{features:{}}}},'setup',true);context.fixtureUI.render();
 const nav=nodes.get('#retailNav').innerHTML,html=nodes.get('#retailView').innerHTML;
 assert(!nav.includes('data-view="staff-access"'));assert(!nav.includes('data-view="tills"'));assert(!nav.includes('data-view="retail-billing"'));
 assert.equal(nodes.get('#retailManageTills').hidden,true);
 assert.match(html,/<button[^>]+data-view="tills" disabled/);assert(!html.includes('>Staff access</button>'));
});
test('Till offline navigation returns the HTML shell rather than a new stylesheet or script',async()=>{
 const events={},matches=[],context={URL,self:{location:{href:'https://app.example.test/retail/till/sw.js',origin:'https://app.example.test'},addEventListener:(name,fn)=>events[name]=fn},caches:{open:async()=>({match:async url=>{matches.push(url);return {html:true};}})},fetch:async()=>{throw Error('Offline');}};
 vm.createContext(context);vm.runInContext(read('retail/till/sw.js'),context);let response;
 events.fetch({request:{method:'GET',mode:'navigate',url:'https://app.example.test/retail/till/index.html'},respondWith:p=>response=p});
 assert.deepEqual(await response,{html:true});assert.deepEqual(matches,['https://app.example.test/retail/till/index.html']);
});
test('Retail and Till precaches include the exact released shared design assets and changed modules',()=>{
 const retail=read('retail/sw.js'),till=read('retail/till/sw.js');
 for(const sw of [retail,till])for(const file of ['css/workspaceDesign.css?v=smooth-20261103','js/workspaceDesign.js?v=smooth-20261103'])assert(sw.includes(file));
 for(const file of ['counter.js?v=smooth-20261103','../platform/nav.js?v=mfa-1'])assert(retail.includes(file));assert(retail.includes('shared.js?v=workspace-20261102'));
 assert(read('retail/dashboard/index.html').includes('/platform/nav.js?v=mfa-1'));
 for(const page of ['retail/index.html','retail/dashboard/index.html']){
  const assets=[...read(page).matchAll(/src="retail\/((?:retail|platform)\.js\?v=[^"]+)"/g)];
  assert.equal(assets.length,2);
  for(const [,asset] of assets)assert(retail.includes(asset),asset);
 }
 const tillAsset=read('retail/till/index.html').match(/src="retail\/till\/(till\.js\?v=[^"]+)"/);
 assert(tillAsset&&till.includes(tillAsset[1]));
 assert(!/localStorage|indexedDB\.deleteDatabase/.test(retail+till));
});

test('shop setup shows Pro pricing for the subscription and the additional store', async () => {
 const {context}=fixture('/retail/index.html');
 context.InventoryAPI.request=async path=>{
  assert.equal(path,'/retail/workspaces');
  return {success:true,separate_workspaces:true,workspaces:[],stores:[]};
 };
 vm.runInContext(read('retail/store-location.js'),context);
 await context.InventoryRetailLocation.init();
 const html=context.InventoryRetailLocation.render();
 assert.match(html,/InventoryOS Pro is £19\.99\/month and includes your first physical store/);
 assert.match(html,/Each additional physical store is £10\/month/);
 assert.doesNotMatch(html,/£19\.99 per shop|Choose its subscription/);
});

test('store billing labels separate subscriptions and sandbox checkout', async () => {
 const {context,nodes}=fixture('/retail/billing.html');
 const store=(inventory_id,name,billing)=>({inventory_id,name,workspace_name:'Example business',billing});
 const totals={monthly_pence:1799,renewing_monthly_pence:1799,subscribed_shops:1,unknown_prices:0,shops:1};
 context.location.href='https://app.inventoryos.co.uk/retail/billing.html';
 context.InventoryAPI.isLoggedIn=()=>true;
 context.InventoryAPI.request=async path=>{
  assert.equal(path,'/retail/billing-summary');
  return {success:true,live:totals,sandbox:{...totals,shops:1},stores:[
   store('live','Existing shop',{environment:'live',amount_pence:1799,subscribed:true,status:'active'}),
   store('test','Test shop',{environment:'sandbox',amount_pence:null,subscribed:false,checkout_configured:true})
  ]};
 };
 vm.runInContext(read('retail/billing.js'),context);
 await new Promise(resolve=>setImmediate(resolve));
 const html=nodes.get('#billingShops').innerHTML;
 assert.match(html,/Existing separate shop subscription[\s\S]+£17\.99/);
 assert.match(html,/SANDBOX · TEST PAYMENTS ONLY[\s\S]+Start sandbox test checkout/);
 assert.doesNotMatch(html.split('SANDBOX · TEST PAYMENTS ONLY')[1],/£19\.99/);
});
