'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../js/workspaceLayoutBoot.js'),'utf8');
async function boot({response,cached,embedded=false,pathname='/settings.html',search='',hash=''}={}){
 const values=new Map([['inventoryos_user',JSON.stringify({id:'fixture'})]]),redirects=[];
 if(cached)values.set('inventoryos_layout:fixture',JSON.stringify(cached));
 const context={URL,URLSearchParams,Promise,JSON,CustomEvent:class{},document:{readyState:'complete',documentElement:{dataset:{}}},location:{origin:'https://app.example.test',pathname,search,hash,replace:value=>redirects.push(value)},localStorage:{getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)},InventoryAPI:{isLoggedIn:()=>true,getUser:()=>({id:'fixture'}),request:async route=>{assert.equal(route,'/workspace-ui/preferences');return response;}},dispatchEvent(){}};
 context.window=context;context.self=context;context.top=embedded?{}:context;
 vm.runInNewContext(source,context);await context.InventoryOSLayout.ready;await Promise.resolve();
 return {context,redirects};
}
test('a fresh server preference opens the new layout and preserves the requested tool',async()=>{
 const {context,redirects}=await boot({response:{success:true,preferences:{layout:'unified',layout_locked:false}},hash:'#guide'});
 assert.equal(context.InventoryOSLayout.available(),true);assert.equal(redirects.length,1);
 const target=new URL(redirects[0],'https://app.example.test');assert.equal(target.pathname,'/workspace/');assert.equal(target.searchParams.get('view'),'settings');assert.equal(target.searchParams.get('screen'),'/settings.html#guide');
});
test('an old or unavailable backend never redirects on the basis of a cached preference',async()=>{
 const {context,redirects}=await boot({response:{success:false},cached:{layout:'unified'}});
 assert.equal(context.InventoryOSLayout.available(),false);assert.equal(redirects.length,0);
});
test('Classic and embedded tools remain on their page',async()=>{
 const classic=await boot({response:{success:true,preferences:{layout:'classic',layout_locked:true}}});assert.equal(classic.redirects.length,0);
 const embedded=await boot({response:{success:true,preferences:{layout:'unified'}},embedded:true,search:'?workspaceEmbed=1'});assert.equal(embedded.redirects.length,0);assert.equal(embedded.context.document.documentElement.dataset.workspaceEmbed,'true');
});
