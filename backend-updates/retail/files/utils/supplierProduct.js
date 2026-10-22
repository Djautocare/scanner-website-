'use strict';
const dns = require('node:dns').promises;
const net = require('node:net');
const http = require('node:http');
const https = require('node:https');
const fail = message => Object.assign(new Error(message), {statusCode:400});
const blocked = new net.BlockList();
for (const [ip,bits] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]]) blocked.addSubnet(ip,bits,'ipv4');
function publicIP(ip) {
 const family=net.isIP(ip);
 if(family===4)return !blocked.check(ip,'ipv4');
 if(family!==6||!/^2[0-9a-f]{3}:/i.test(ip))return false;
 const v6=new net.BlockList();for(const [a,n]of [['2001::',23],['2001:db8::',32],['2002::',16]])v6.addSubnet(a,n,'ipv6');
 return !v6.check(ip,'ipv6');
}
function safeURL(value) {
 let u;try{u=new URL(value);}catch{throw fail('Enter a public supplier product URL');}
 const host=u.hostname.replace(/^\[|\]$/g,'').toLowerCase();
 if(value.length>1000||!['http:','https:'].includes(u.protocol)||u.username||u.password||u.port||!host.includes('.')&&net.isIP(host)!==6||/(^|\.)(localhost|local|internal|test|invalid)$/.test(host)||net.isIP(host)&&!publicIP(host))throw fail('Use a public supplier URL with its default port');
 return u;
}
async function fetchPage(value,{lookup=dns.lookup,request}={}) {
 const started=Date.now(),deadline=12000;
 async function hop(url,n) {
  if(n>4)throw fail('Too many supplier redirects');
  const u=safeURL(url),host=u.hostname.replace(/^\[|\]$/g,'');
  let timer;
  const addresses=await Promise.race([lookup(host,{all:true,verbatim:true}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(fail('Supplier lookup timed out')),Math.max(1,deadline-(Date.now()-started)));})]).finally(()=>clearTimeout(timer));
  if(!addresses.length||addresses.some(a=>!publicIP(a.address)))throw fail('Supplier resolved to a private or unsupported address');
  const pinned=addresses[0];
  return new Promise((resolve,reject)=>{
   const req=(request||(u.protocol==='https:'?https.request:http.request))(u,{method:'GET',headers:{'User-Agent':'InventoryOS-SupplierLookup/1.0','Accept':'text/html,application/ld+json,application/json','Accept-Encoding':'identity'},lookup:(_h,options,cb)=>cb(null,options?.all?[pinned]:pinned.address, pinned.family)},res=>{
    if([301,302,303,307,308].includes(res.statusCode)){
     res.resume();let next;try{next=new URL(res.headers.location,u);if(u.protocol==='https:'&&next.protocol!=='https:')throw fail('Supplier redirected to insecure HTTP');}catch(e){reject(e);return;}resolve(hop(next.href,n+1));return;
    }
    if(res.statusCode!==200){res.resume();reject(fail('Supplier page is unavailable or requires a login'));return;}
    if(!/text\/html|application\/(ld\+)?json/i.test(res.headers['content-type']||'')||res.headers['content-encoding']&&res.headers['content-encoding']!=='identity'){res.resume();reject(fail('Supplier page format is unsupported'));return;}
    let bytes=0;const chunks=[];res.on('data',b=>{bytes+=b.length;if(bytes>1500000){req.destroy(fail('Supplier page is too large'));return;}chunks.push(b);});res.on('error',reject);res.on('end',()=>resolve({body:Buffer.concat(chunks).toString('utf8'),url:u.href}));
   });
   const timeout=setTimeout(()=>req.destroy(fail('Supplier lookup timed out')),Math.max(1,deadline-(Date.now()-started)));req.on('error',reject);req.on('close',()=>clearTimeout(timeout));req.end();
  });
 }
 return hop(value,0);
}
function parseProduct(body,url,{sku='',variant_id=''}={}) {
 const objects=[];
 function walk(v){if(!v||typeof v!=='object')return;if(Array.isArray(v)){v.forEach(walk);return;}const types=[].concat(v['@type']||[]);if(types.includes('Product'))objects.push(v);for(const key of ['@graph','hasVariant','mainEntity','itemListElement','item'])walk(v[key]);}
 try{walk(JSON.parse(body));}catch{}
 for(const m of body.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)){try{walk(JSON.parse(m[1]));}catch{}}
 const requestedVariant=variant_id||new URL(url).searchParams.get('variant')||'';
 let candidates=objects.flatMap(p=>[].concat(p.offers||[]).map(o=>({p,o,code:String(p.sku||o.sku||new URL(url).pathname.match(/\/p\/([\w-]+)\/?$/)?.[1]||''),variant:String(p.productID||o.sku||'')})));
 if(sku)candidates=candidates.filter(x=>x.code===sku);
 if(requestedVariant)candidates=candidates.filter(x=>x.variant===requestedVariant||String(x.o.url||x.p.url||'').includes('variant='+requestedVariant));
 candidates=candidates.filter(({o})=>!['AggregateOffer'].includes(o['@type'])&&o.price!==undefined&&String(o.priceCurrency||'').toUpperCase()==='GBP');
 const unique=new Map(candidates.map(x=>[x.code+'|'+x.o.price,x]));
 if(unique.size!==1)throw fail('No unambiguous GBP product price was found. Enter the code and price manually');
 const {p,o,code,variant}=unique.values().next().value,raw=String(o.price);
 if(!/^\d{1,7}(\.\d{1,2})?$/.test(raw)||Number(raw)<=0)throw fail('Supplier price could not be read safely');
 return {name:String(p.name||'').slice(0,300),sku:code||new URL(url).pathname.match(/\/p\/([\w-]+)\/?$/)?.[1]||'',variant_id:requestedVariant||variant,pack_price_pence:Math.round(Number(raw)*100),currency:'GBP',availability:String(o.availability||''),url};
}
async function lookupProduct(url,identity){const page=await fetchPage(url);return parseProduct(page.body,page.url,identity);}
module.exports={publicIP,safeURL,fetchPage,parseProduct,lookupProduct};
