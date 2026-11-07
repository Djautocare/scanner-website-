(function(root){
'use strict';
const KEY='inventoryos-marche-basket-v1',ORDERS='inventoryos-marche-orders-v1';
const slug=s=>typeof s==='string'&&/^[a-z0-9][a-z0-9-]{2,39}$/.test(s);
const id=s=>typeof s==='string'&&/^[a-f0-9-]{36}$/i.test(s);
function read(store,key){try{const x=JSON.parse(store.getItem(key)||'[]');return Array.isArray(x)?x:[];}catch{return [];}}
function groups(){return read(root.localStorage,KEY).filter(x=>slug(x.slug)&&Array.isArray(x.items)).slice(0,20).map(x=>({slug:x.slug,name:String(x.name||x.slug).slice(0,90),revision:x.revision,items:x.items.filter(i=>id(i.listing_id)&&Number.isSafeInteger(i.qty)&&i.qty>0&&i.qty<=1000&&['delivery','collection'].includes(i.method)).slice(0,100)})).filter(x=>x.items.length);}
function put(handle,name,items){
 if(!slug(handle))throw Error('Invalid storefront');
 const existing=groups().find(x=>x.slug===handle),all=groups().filter(x=>x.slug!==handle);
 if(items.length){if(all.length>=20)throw Error('Your basket can contain up to 20 sellers');const revision=existing?.revision&&JSON.stringify(existing.items)===JSON.stringify(items)?existing.revision:root.crypto.randomUUID();all.push({slug:handle,name,items,revision});}
 root.localStorage.setItem(KEY,JSON.stringify(all));
}
function orders(){return read(root.sessionStorage,ORDERS).filter(x=>slug(x.slug)&&id(x.id)&&/^[A-Za-z0-9_-]{43}$/.test(x.key||'')).slice(-30);}
function record(order){const all=orders().filter(x=>x.id!==order.id);all.push({slug:order.slug,id:order.id,key:order.key,cart_revision:order.cart_revision});root.sessionStorage.setItem(ORDERS,JSON.stringify(all.slice(-30)));}
function finish(order){const current=groups().find(x=>x.slug===order.slug);if(current?.revision&&current.revision===order.cart_revision)put(order.slug,'',[]);}
root.MarcheCart=Object.freeze({groups,put,orders,record,finish});
})(window);
