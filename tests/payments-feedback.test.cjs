'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
function elements(){
 const button={disabled:false,isConnected:true,textContent:'Set up payments',setAttribute(k,v){this[k]=v;},removeAttribute(k){delete this[k];}};
 const feedback={textContent:'',classList:{remove(){},add(){}}},link={hidden:true,removeAttribute(k){delete this[k];}};
 return {button,feedback,link};
}
function load(){const ctx={URL,window:{top:{location:{assign(){}}}},PlatformUI:{esc:x=>String(x),api:async()=>({}),showAccessGate:()=>false}};vm.runInNewContext(fs.readFileSync(path.join(root,'platform/payments-panel.js'),'utf8'),ctx);return ctx.window.InventoryPaymentPanel;}
test('setup shows progress immediately and renders request errors next to the button',async()=>{
 const panel=load(),e=elements();let reject;
 panel.bindSetup(e.button,e.feedback,e.link,{request:()=>new Promise((_r,j)=>reject=j)});
 const pending=e.button.onclick();assert.equal(e.button.disabled,true);assert.match(e.button.textContent,/Contacting Stripe/);assert.match(e.feedback.textContent,/Preparing/);
 reject(Error('Stripe denied account creation permission'));await pending;
 assert.match(e.feedback.textContent,/denied account creation/);assert.equal(e.button.disabled,false);assert.equal(e.button.textContent,'Set up payments');assert.equal(e.link.hidden,true);
});
test('a blocked automatic redirect leaves a working explicit Stripe link',async()=>{
 const panel=load(),e=elements();panel.bindSetup(e.button,e.feedback,e.link,{request:async()=>({url:'https://connect.stripe.com/setup/fixture'}),navigate:()=>{throw Error('Navigation blocked');}});
 await e.button.onclick();assert.equal(e.link.hidden,false);assert.equal(e.link.href,'https://connect.stripe.com/setup/fixture');assert.match(e.feedback.textContent,/Continue to Stripe/);assert.equal(e.button.disabled,false);
});
test('unsafe Stripe redirects and responses from a closed panel never navigate',async()=>{
 const panel=load(),e=elements();let moved=false;
 panel.bindSetup(e.button,e.feedback,e.link,{request:async()=>({url:'https://evil.example/setup'}),navigate:()=>moved=true});await e.button.onclick();assert.equal(moved,false);assert.equal(e.link.hidden,true);assert.match(e.feedback.textContent,/unexpected setup address/);
 panel.bindSetup(e.button,e.feedback,e.link,{request:async()=>{e.button.isConnected=false;return{url:'https://connect.stripe.com/setup/fixture'};},navigate:()=>moved=true});await e.button.onclick();assert.equal(moved,false);
});
test('only account-specific dashboard links are accepted',()=>{
 const panel=load();assert.equal(panel.dashboardUrl('https://dashboard.stripe.com/'),null);assert.equal(panel.dashboardUrl('https://dashboard.stripe.com/acct_shop/test/dashboard'),'https://dashboard.stripe.com/acct_shop/test/dashboard');assert.equal(panel.dashboardUrl('https://dashboard.stripe.com/acct_shop/dashboard'),'https://dashboard.stripe.com/acct_shop/dashboard');
 for(const url of ['https://evil.example/acct_shop/dashboard','https://user@dashboard.stripe.com/acct_shop/dashboard','https://dashboard.stripe.com/acct_shop/dashboard?redirect=evil'])assert.equal(panel.dashboardUrl(url),null);
});
test('manual onboarding requests return their result from embedded tools without the generic redirect interception',async()=>{
 const calls=[],headers=[],values=new Map([['inventoryos_token','fixture-token']]);
 const ctx={URL,URLSearchParams,FormData:class{},location:{hostname:'app.inventoryos.co.uk',protocol:'https:',pathname:'/platform/'},localStorage:{getItem:k=>values.get(k)||null},fetch:async(_url,options)=>{headers.push(options);return{status:200,json:async()=>({success:true,url:'https://connect.stripe.com/setup/fixture'})};},document:{readyState:'loading',addEventListener(){}},window:{top:{location:{assign:x=>calls.push(x)}},self:{},InventoryOSLayout:{embedded:true}}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'js/api.js'),'utf8')+'\nglobalThis.TestAPI=InventoryAPI;',ctx);
 const result=await ctx.TestAPI.request('/platform/seller/payments/start',{method:'POST',manualStripeRedirect:true});assert.equal(result.success,true);assert.equal(calls.length,0);assert.equal(headers[0].manualStripeRedirect,undefined);assert.equal(headers[0].headers.Authorization,'Bearer fixture-token');
});
