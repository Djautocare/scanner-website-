'use strict';
const assert=require('node:assert/strict');
const {createLookup,SOURCES}=require('../files/utils/retailCatalogue');
const code='3017620422003';
const reply=(type='food',barcode=code)=>new Response(JSON.stringify({product:{code:barcode,product_name:'Example shop product',product_type:type}}),{status:200});
(async()=>{
 for(const [source,meta] of Object.entries(SOURCES)){
  let calls=[];
  const lookup=createLookup({fetcher:async(url,options)=>{calls.push(url);assert.equal(options.redirect,'manual');assert.equal(new URL(url).searchParams.get('product_type'),'all');if(calls.length===1&&source!=='openfoodfacts')return new Response(null,{status:302,headers:{location:'https://'+meta.host+'/api/v3/product/'+code+'?product_type='+meta.type}});return reply(meta.type);}});
  const r=await lookup.lookup(code,'actor');assert.equal(r.product.source,source);assert.equal(r.product.source_name,meta.label);assert.equal(new URL(r.product.source_url).hostname,meta.host);assert.equal(r.product.barcode,code);
  await lookup.lookup(code,'different actor');assert.equal(calls.length,source==='openfoodfacts'?1:2,'cached universal lookup');
 }
 const bad=[
  'https://evil.example/api/v3/product/'+code,
  'http://world.openbeautyfacts.org/api/v3/product/'+code,
  'https://a:b@world.openbeautyfacts.org/api/v3/product/'+code,
  'https://world.openbeautyfacts.org:8443/api/v3/product/'+code,
  'https://world.openbeautyfacts.org/api/v3/product/3760044183738',
  'https://world.openbeautyfacts.org/private/'+code,
  'https://world.openbeautyfacts.org.evil.example/api/v3/product/'+code
 ];
 for(const location of bad){let count=0;await assert.rejects(()=>createLookup({fetcher:async()=>{count++;return new Response(null,{status:302,headers:{location}});}}).lookup(code,'actor'),/redirect was rejected/);assert.equal(count,1);}
 await assert.rejects(()=>createLookup({fetcher:async()=>new Response(null,{status:302,headers:{location:'https://world.openfoodfacts.org/api/v3/product/'+code}})}).lookup(code,'actor'),/loop/);
 const upc='012345678905';const normalized=await createLookup({fetcher:async()=>reply('product','0'+upc)}).lookup(upc,'actor');assert.equal(normalized.product.barcode,upc);assert.equal(normalized.product.source,'openproductsfacts');
 await assert.rejects(()=>createLookup({fetcher:async()=>reply('food','3760044183738')}).lookup(code,'actor'),/different barcode/);
 const missing=await createLookup({fetcher:async()=>new Response(JSON.stringify({status:'failure',result:{id:'product_not_found'}}))}).lookup(code,'actor');assert.equal(missing.found,false);
 console.log('PASS: food/alcohol, beauty, household and pet-product catalogue source routing, cache/attribution, UPC leading-zero equivalence and strict redirect host/protocol/port/credentials/path/barcode/loop rejection.');
})().catch(e=>{console.error(e);process.exit(1);});
