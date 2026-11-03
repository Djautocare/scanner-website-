'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=name=>fs.readFileSync(path.join(root,name),'utf8');
function interactions(){
 const events={},timers=new Map();let next=0;
 const context={document:{addEventListener:(type,fn)=>events[type]=fn},addEventListener:(type,fn)=>events[type]=fn,setTimeout:fn=>{timers.set(++next,fn);return next;},clearTimeout:id=>timers.delete(id)};context.window=context;vm.createContext(context);vm.runInContext(read('retail/interactions.js'),context);
 return {events,api:context.InventoryRetailInteractions,flush(){const jobs=[...timers.values()];timers.clear();jobs.forEach(fn=>fn());}};
}
test('a second pointer-down never flushes a render and detaches the next clicked control',()=>{
 const {events,api,flush}=interactions(),a={isConnected:true},b={isConnected:true};let renders=0;
 const render=()=>{renders++;b.isConnected=false;};
 events.pointerdown({target:{closest:()=>a}});assert(api.defer(render));events.pointerup();
 events.pointerdown({target:{closest:()=>b}});assert.equal(renders,0);assert.equal(b.isConnected,true);
 assert(api.defer(render));events.click();flush();assert.equal(renders,1);
});
test('settled navigation removes its stale queued repaint without dropping another component update',()=>{
 const {events,api,flush}=interactions();let page=0,dialog=0;const render=()=>page++,other=()=>dialog++;
 events.pointerdown({target:{closest:()=>({isConnected:true})}});assert(api.defer(render));assert(api.defer(other));
 api.settled(render);events.click();flush();assert.equal(page,0);assert.equal(dialog,1);
});
test('first-paint bootstrap restores saved palette and the requested Settings deep link',()=>{
 const attrs={},context={document:{documentElement:{dataset:{},style:{},setAttribute:(name,value)=>attrs[name]=value}},location:{pathname:'/settings.html',hash:'#guide'},localStorage:{getItem:key=>({inventoryos_appearance:'light',inventoryos_theme:'purple',inventoryos_settings_view:'settingsPanel'})[key]}};
 vm.createContext(context);vm.runInContext(read('js/workspaceBoot.js'),context);
 assert.equal(attrs['data-appearance'],'light');assert.equal(attrs['data-theme'],'purple');assert.equal(context.document.documentElement.dataset.settingsView,'guidePanel');
});
test('blocked local storage still gives the page a usable default appearance',()=>{
 const attrs={},context={document:{documentElement:{dataset:{},style:{},setAttribute:(name,value)=>attrs[name]=value}},location:{pathname:'/add.html'},localStorage:{getItem(){throw Error('Blocked');}}};vm.createContext(context);vm.runInContext(read('js/workspaceBoot.js'),context);assert.equal(attrs['data-appearance'],'dark');assert.equal(attrs['data-theme'],'green');
});
test('reseller pages ship their final shell and workflow before hydration instead of rebuilding a visible legacy page',()=>{
 for(const name of ['add','remove','boxes','settings','search','move','printjobs','expenses','reorders']){
  const source=read(name+'.html');assert.match(source,/<body[^>]+data-workspace-design="reseller"/);assert(source.includes('data-static-shell="1"'),name);assert(source.indexOf('id="iosShellMount"')<source.lastIndexOf('js/appShell.js'),name);assert(source.includes('class="design-utilitybar"'),name);assert(source.indexOf('workspaceBoot.js')<source.indexOf('<body'),name);
 }
 const dashboard=read('index.html');assert(dashboard.includes('data-design-navigation="1"'));assert(dashboard.includes('class="design-nav-group"'));
});
test('Settings sections and accordion groups are in the HTML before account scripts run',()=>{
 const source=read('settings.html');for(const id of ['account-settings-workspace','account-settings-printing','account-settings-security'])assert(source.includes('id="'+id+'"'));
});
test('simultaneous workspace initialisers share one request; a newer selection invalidates the old render',async()=>{
 const source=read('js/inventoryTopbar.js'),a=source.indexOf('    const initialisations = new Map();'),b=source.indexOf('    async function initialiseContainer(',a),requests=[];let workspace='one';
 const context={Map,document:{getElementById:()=>container},getSelectedWorkspaceId:()=>workspace,getSelectedIds:()=>['inventory'],initialiseContainer:(id,current)=>new Promise(resolve=>requests.push({current,resolve}))};const container={};vm.createContext(context);vm.runInContext(source.slice(a,b),context);
 const first=context.init(),same=context.init();assert.equal(first,same);assert.equal(requests.length,1);
 workspace='two';const latest=context.init();assert.notEqual(first,latest);assert.equal(requests.length,2);assert.equal(requests[0].current(),false);assert.equal(requests[1].current(),true);
 requests[0].resolve(false);await first;assert.equal(requests[1].current(),true);requests[1].resolve(true);assert.equal(await latest,true);
});
