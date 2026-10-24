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
