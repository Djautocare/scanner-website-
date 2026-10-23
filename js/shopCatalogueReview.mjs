const amount=v=>Number.isSafeInteger(v)&&v>=0;
export function productProfit(v){
 if(!amount(v.price_pence)||v.price_pence===0||(!amount(v.cost_pence)&&!amount(v.replacement_cost_pence))||!amount(v.inbound_pence??0))return null;
 const cost=Math.max(amount(v.cost_pence)?v.cost_pence:0,amount(v.replacement_cost_pence)?v.replacement_cost_pence:0)+(v.inbound_pence??0),profit=v.price_pence-cost;
 return {pence:profit,margin:profit/v.price_pence*100,estimated:!amount(v.cost_pence)};
}
export function approvalProblem(v){
 if(!amount(v.cost_pence))return 'Purchase cost needed';
 const p=productProfit(v);if(!p||p.pence<=0)return 'Selling price must exceed costs';
 if(!Array.isArray(v.dimensions_mm)||v.dimensions_mm.length!==3||v.dimensions_mm.some(n=>!Number.isSafeInteger(n)||n<1||n>10000))return 'Pack measurements needed';
 if(!Number.isSafeInteger(v.weight_g)||v.weight_g<1||v.weight_g>20000)return 'Pack weight needed';
 return '';
}
export function needsApproval(v){return v.price_estimated===true||v.review_required===true||v.cost_verified!==true||v.shipping_verified!==true;}
