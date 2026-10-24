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
 if(!Number.isSafeInteger(v.weight_g)||v.weight_g<1||v.weight_g>70000)problems.push('Pack weight needed');
 return problems;
}
export function approvalProblem(v){return approvalProblems(v)[0]||'';}
export function needsApproval(v){return v.price_estimated===true||v.review_required===true||v.cost_verified!==true||v.shipping_verified!==true;}

export function measurementProblems(v){return approvalProblems(v).filter(p=>p==='Pack measurements needed'||p==='Pack weight needed');}
export function variantPublicationProblems(v){
 const problems=approvalProblems(v);
 if(v.price_estimated===true)problems.push('Selling price awaiting approval');
 if(v.cost_verified!==true)problems.push('Supplier cost awaiting approval');
 if(v.shipping_verified!==true)problems.push('Shipping awaiting approval');
 if(v.review_required===true)problems.push('Variant awaiting review');
 if(v.preview_error)problems.push(v.preview_error);
 if(variantMatches(v,'packs'))problems.push('Check supplier minimum and selling pack quantities');
 if(v.availability_mode!=='supplier'&&variantMatches(v,'stock'))problems.push('Stock quantity needed');
 if(v.publish_ready===false&&!problems.length)problems.push('Backend approval check failed — install the latest Shop backend update');
 return [...new Set(problems)];
}
export function productPublicationProblems(p,variants){
 const problems=[];
 try{const u=new URL(p.image_url);if(u.protocol!=='https:'||u.username||u.password||u.port||! /\.(?:webp|jpe?g|png)$/i.test(u.pathname))throw Error();}catch{problems.push('Product image needed');}
 if(!String(p.image_rights||'').trim())problems.push('Image permission reference needed');
 if(!variants.length)problems.push('No variants added');
 for(const v of variants)for(const problem of variantPublicationProblems(v))problems.push((v.sku||v.name||v.id)+': '+problem);
 return problems;
}
export const catalogueFilters=Object.freeze([
 ['all','All products'],['blocked','Needs attention'],['price','Missing selling price'],['cost','Missing supplier cost'],
 ['measurements','Missing measurements or weight'],['dimensions','Missing pack dimensions'],['weight','Missing pack weight'],
 ['image','Missing product image'],['rights','Missing image permission'],['supplier','Missing supplier link'],['source','Missing supplier price-check details'],
 ['packs','Invalid pack quantities'],['stock','Supplier availability needs checking'],['outofstock','Supplier currently unavailable'],
 ['delivery','Delivery or price-check issue'],['review','Awaiting approval'],['draft','Unpublished products'],['ready','Ready to publish'],['published','Published products']
]);
export function variantMatches(v,filter){
 if(filter==='price')return !amount(v.price_pence)||v.price_pence===0;
 if(filter==='cost')return !amount(v.replacement_cost_pence);
 if(filter==='measurements')return measurementProblems(v).length>0;
 if(filter==='dimensions')return measurementProblems(v).includes('Pack measurements needed');
 if(filter==='weight')return measurementProblems(v).includes('Pack weight needed');
 if(filter==='supplier')return !String(v.supplier_url||'').trim();
 if(filter==='source')return !String(v.supplier_url||'').trim()||!String(v.supplier_variant_id||'').trim();
 if(filter==='packs')return ['supplier_price_units','supplier_min_order_qty','sale_units_per_pack'].some(k=>!Number.isSafeInteger(v[k]??1)||(v[k]??1)<1||(v[k]??1)>1000000);
 if(filter==='stock')return v.availability_mode==='supplier'?v.availability_status==='unknown':!amount(v.stock);
 if(filter==='outofstock'){if(v.availability_mode==='supplier')return v.availability_status==='unavailable';const min=v.min_order_qty??Math.ceil((v.supplier_price_units??1)*(v.supplier_min_order_qty??1)/(v.sale_units_per_pack??1));return amount(v.stock)&&v.stock<min;}
 if(filter==='delivery')return !!(v.preview_error||v.check_error);
 if(filter==='review')return needsApproval(v);
 if(filter==='blocked')return variantPublicationProblems(v).length>0||variantMatches(v,'packs')||variantMatches(v,'stock');
 return true;
}
export function catalogueMatch(p,variants,filter='all',prepared=p){
 if(filter==='draft')return !p.published;
 if(filter==='published')return p.published===true;
 if(filter==='ready')return !p.published&&!productPublicationProblems(prepared,variants).length;
 if(filter==='blocked')return productPublicationProblems(prepared,variants).length>0;
 if(filter==='image')return productPublicationProblems(prepared,[]).includes('Product image needed');
 if(filter==='rights')return !String(prepared.image_rights||'').trim();
 if(filter==='all')return true;
 return variants.some(v=>variantMatches(v,filter));
}
