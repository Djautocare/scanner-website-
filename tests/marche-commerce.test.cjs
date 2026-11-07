'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
function fixture(){const values=new Map(),session=new Map(),storage=m=>({getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)}),ctx={window:{localStorage:storage(values),sessionStorage:storage(session),crypto:{randomUUID}}};vm.createContext(ctx);vm.runInContext(read('marche/cart.js'),ctx);return {cart:ctx.window.MarcheCart,values};}
test('one shared basket groups sellers, caps input and never stores customer contact details',()=>{
 const {cart,values}=fixture(),item={listing_id:randomUUID(),qty:2,method:'collection'};
 cart.put('shop-one','First shop',[item]);cart.put('shop-two','Second shop',[item]);assert.equal(cart.groups().length,2);
 const revision=cart.groups()[0].revision;cart.put('shop-one','First shop',[item]);assert.equal(cart.groups().find(x=>x.slug==='shop-one').revision,revision);
 const order={slug:'shop-one',id:randomUUID(),key:'a'.repeat(43),cart_revision:revision,email:'not-stored@example.test'};cart.record(order);assert.equal(cart.orders()[0].email,undefined);
 cart.finish(order);assert.equal(cart.groups().length,1);assert.equal(cart.groups()[0].slug,'shop-two');
 values.set('inventoryos-marche-basket-v1',JSON.stringify([{slug:'bad/path',items:[item]},{slug:'shop-one',items:[{...item,qty:-5}]}]));assert.equal(cart.groups().length,0);
});
test('a paid earlier order cannot erase a later basket from the same seller',()=>{
 const {cart}=fixture(),item={listing_id:randomUUID(),qty:1,method:'delivery'};
 cart.put('shop-one','Shop',[item]);const old=cart.groups()[0].revision;
 cart.put('shop-one','Shop',[{...item,qty:2}]);cart.finish({slug:'shop-one',cart_revision:old});assert.equal(cart.groups()[0].items[0].qty,2);
});
test('friendly storefront routes preserve query state, security and ordinary assets',async()=>{
 const {onRequest}=await import('../functions/_middleware.js');
 for(const [url,pathname] of [['https://app.inventoryos.co.uk/marche/sample-store?order=fixture','/marche/index.html'],['https://marche.inventoryos.co.uk/sample-store','/marche/index.html'],['https://marche.inventoryos.co.uk/','/marche/index.html'],['https://app.inventoryos.co.uk/marche/basket.html','/marche/basket.html'],['https://app.inventoryos.co.uk/settings','/settings']]){
  let target;const r=await onRequest({request:new Request(url),next:async req=>{target=new URL(req.url);return new Response('fixture',{headers:{'Content-Type':'text/html'}});}});
  assert.equal(target.pathname,pathname);assert.equal(target.searchParams.get('order'),new URL(url).searchParams.get('order'));assert.equal(r.headers.get('X-Content-Type-Options'),'nosniff');
 }
});
