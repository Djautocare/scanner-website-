import {test} from 'node:test';import assert from 'node:assert/strict';import {productProfit,approvalProblem,approvalProblems,priceApprovalProblem,needsApproval} from '../js/shopCatalogueReview.mjs';
const v={cost_pence:400,replacement_cost_pence:500,inbound_pence:50,price_pence:1000,dimensions_mm:[100,200,30],weight_g:500,cost_verified:false,shipping_verified:false,review_required:true,price_estimated:true};
test('normal-price profit uses supplier cost plus inbound without discounts',()=>{assert.deepEqual(productProfit({...v,preview:{profit_pence:1},gross_profit_pence:99999}),{pence:450,margin:45,estimated:false});assert.equal(productProfit({...v,cost_pence:600}).pence,450);assert.equal(productProfit({...v,price_pence:500}).pence,-50);});
test('supplier-only costs are sufficient and unknown costs never become zero-cost profit',()=>{assert.equal(productProfit({...v,cost_pence:null}).estimated,false);assert.equal(productProfit({...v,cost_pence:null,replacement_cost_pence:null}),null);assert.equal(productProfit({...v,price_pence:null}),null);assert.equal(productProfit({...v,cost_pence:0,replacement_cost_pence:0}).pence,950);});
test('bulk approval requires supplier costs, profitable prices and complete measurements',()=>{assert.equal(approvalProblem(v),'');for(const patch of [{replacement_cost_pence:null},{price_pence:550},{dimensions_mm:null},{dimensions_mm:[1,0,3]},{dimensions_mm:[1,2,3.5]},{weight_g:0},{weight_g:20001}])assert.notEqual(approvalProblem({...v,...patch}),'');});
test('already approved variants are omitted while provisional prices still need approval',()=>{assert.equal(needsApproval(v),true);const done={...v,cost_verified:true,shipping_verified:true,review_required:false,price_estimated:false};assert.equal(needsApproval(done),false);assert.equal(needsApproval({...done,price_estimated:true}),true);});

test('price approval is separate from physical stock verification and lists every missing field',()=>{
 const draft={...v,cost_pence:null,dimensions_mm:null,weight_g:null};
 assert.equal(priceApprovalProblem(draft),'');
 assert.deepEqual(approvalProblems(draft),['Pack measurements needed','Pack weight needed']);
 assert.notEqual(priceApprovalProblem({...draft,replacement_cost_pence:null}),'');
 assert.notEqual(priceApprovalProblem({...draft,price_pence:500}),'');
});

test('supplier cost alone is sufficient and legacy purchase cost cannot hide missing supplier cost',()=>{
 assert.equal(approvalProblem({...v,cost_pence:null}),'');
 assert.deepEqual(approvalProblems({...v,replacement_cost_pence:null}),['Supplier cost needed']);
 assert.equal(productProfit({...v,cost_pence:999999}).pence,450);
});

import {measurementProblems,variantPublicationProblems,productPublicationProblems,catalogueMatch} from '../js/shopCatalogueReview.mjs';
const approved={...v,cost_pence:null,cost_verified:true,shipping_verified:true,review_required:false,price_estimated:false,publish_ready:true,stock:10};
const product={id:'test',name:'Test',image_url:'https://inventoryos.co.uk/assets/test.webp',image_rights:'Own image',published:false};
test('catalogue filters find one missing measurement even when review flags claim approval',()=>{
 const missing={...approved,dimensions_mm:null};
 assert.deepEqual(measurementProblems(missing),['Pack measurements needed']);
 assert.equal(catalogueMatch(product,[approved,missing],'measurements'),true);
 assert.equal(catalogueMatch(product,[approved],'measurements'),false);
 assert.equal(catalogueMatch(product,[{...missing,review_required:true}],'review'),true);
 assert.equal(catalogueMatch(product,[approved],'ready'),true);
 assert.equal(catalogueMatch({...product,published:true},[approved],'ready'),false);
 assert.equal(catalogueMatch(product,[missing],'blocked'),true);
 assert.equal(catalogueMatch(product,[],'ready'),false);
});
test('publication requires images, all approved variants and successful shipping checks',()=>{
 assert.deepEqual(productPublicationProblems(product,[approved]),[]);
 assert(productPublicationProblems({...product,image_rights:''},[approved]).includes('Image permission reference needed'));
 assert(productPublicationProblems({...product,image_url:'javascript:alert(1)'},[approved]).includes('Product image needed'));
 for(const patch of [{cost_verified:false},{shipping_verified:false},{price_estimated:true},{review_required:true},{preview_error:'Pack does not fit configured packaging'},{publish_ready:false},{replacement_cost_pence:null}])assert(variantPublicationProblems({...approved,...patch}).length>0);
 assert.equal(catalogueMatch({...product,published:true},[approved],'published'),true);
 assert.equal(catalogueMatch(product,[approved],'draft'),true);
});

import {catalogueFilters,variantMatches} from '../js/shopCatalogueReview.mjs';
test('missing-field filters distinguish zero stock, free cost, prices, shipping, supplier details and image rights',()=>{
 for(const [filter,patch]of [['price',{price_pence:null}],['cost',{replacement_cost_pence:null}],['dimensions',{dimensions_mm:null}],['weight',{weight_g:null}],['supplier',{supplier_url:''}],['source',{supplier_url:'https://example.test/item',supplier_variant_id:''}],['packs',{supplier_price_units:0}],['stock',{stock:null}],['outofstock',{stock:0}],['delivery',{preview_error:'Shipping review'}]]){
  assert.equal(catalogueMatch(product,[{...approved,...patch}],filter),true,filter);
 }
 assert.equal(variantMatches({...approved,replacement_cost_pence:0},'cost'),false);
 assert.equal(variantMatches({...approved,stock:0},'stock'),false);
 assert.equal(variantMatches({...approved,price_pence:0},'price'),true);
 assert.equal(variantMatches({...approved,dimensions_mm:[1,0,1]},'dimensions'),true);
 assert.equal(catalogueMatch({...product,image_url:''},[approved],'image'),true);
 assert.equal(catalogueMatch({...product,image_rights:''},[approved],'rights'),true);
 assert.equal(new Set(catalogueFilters.map(f=>f[0])).size,catalogueFilters.length);
});
