const amount=v=>Number.isSafeInteger(v)&&v>=0;
export function productProfit(v){
 if(!amount(v.price_pence)||v.price_pence===0||!amount(v.replacement_cost_pence)||!amount(v.inbound_pence??0))return null;
 const cost=v.replacement_cost_pence+(v.inbound_pence??0),profit=v.price_pence-cost;
 return {pence:profit,margin:profit/v.price_pence*100,estimated:false};
}
export function priceApprovalProblem(v){
 if(!amount(v.price_pence)||v.price_pence===0)return 'Selling price needed';
 const p=productProfit(v);return !p?'Supplier cost needed':p.pence<=0?'Selling price must exceed costs':'';
}
export function approvalProblems(v){
 const problems=[];
 const price=priceApprovalProblem(v);if(price)problems.push(price);
 if(!Array.isArray(v.dimensions_mm)||v.dimensions_mm.length!==3||v.dimensions_mm.some(n=>!Number.isSafeInteger(n)||n<1||n>10000))problems.push('Pack measurements needed');
 if(!Number.isSafeInteger(v.weight_g)||v.weight_g<1||v.weight_g>20000)problems.push('Pack weight needed');
 return problems;
}
export function approvalProblem(v){return approvalProblems(v)[0]||'';}
export function needsApproval(v){return v.price_estimated===true||v.review_required===true||v.cost_verified!==true||v.shipping_verified!==true;}
