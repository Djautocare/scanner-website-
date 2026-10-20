/* Shared deterministic integer-penny pricing. Used by server and prepared tills. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.InventoryRetailPricing=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const active=(x,at)=>x.active!==false&&(!x.starts_at||Date.parse(x.starts_at)<=at)&&(!x.ends_at||Date.parse(x.ends_at)>at);
  function allocate(amount, entries, weight){
    if(!amount)return entries.map(()=>0);
    const sum=entries.reduce((n,x)=>n+weight(x),0);
    if(!sum)return entries.map(()=>0);
    const result=entries.map((x,index)=>{const numerator=BigInt(amount)*BigInt(weight(x));return {index,value:Number(numerator/BigInt(sum)),rest:numerator%BigInt(sum)};});
    let left=amount-result.reduce((n,x)=>n+x.value,0);
    for(const x of [...result].sort((a,b)=>a.rest===b.rest?a.index-b.index:a.rest>b.rest?-1:1)){if(!left--)break;x.value++;}
    return result.map(x=>x.value);
  }
  function price(input, rules={}, at=Date.now(), reward=null){
    const lines=input.map(i=>({...i,list_total_pence:i.qty*i.unit_price_pence,line_total_pence:i.qty*i.unit_price_pence,line_discount_pence:0,labels:[],remaining:i.qty,effective:i.unit_price_pence}));
    const applications=[];
    for(const l of lines){
      const rs=(rules.reductions||[]).filter(r=>r.product_id===l.product_id&&active(r,at));
      if(rs.length){const reduction=Math.min(l.unit_price_pence,...rs.map(r=>r.reduced_price_pence));if(reduction<l.unit_price_pence){l.effective=reduction;l.line_total_pence=reduction*l.qty;l.labels.push('Timed reduction');}}
    }
    const offers=(rules.offers||[]).filter(o=>active(o,at)).sort((a,b)=>(b.priority||0)-(a.priority||0)||a.id.localeCompare(b.id));
    for(const offer of offers){
      const r=offer.rule, selected=[];
      if(offer.kind==='percent'){
        for(const l of lines.filter(l=>r.product_ids.includes(l.product_id)&&l.remaining>0)){const amount=Math.floor((l.remaining*l.effective*r.percent+50)/100);if(amount>0){selected.push({line:l,qty:l.remaining,discount:amount});}}
      }else if(offer.kind==='multi_buy'){
        const l=lines.find(l=>l.product_id===r.product_id);
        if(l){const bundles=Math.floor(l.remaining/r.buy_qty),saving=r.buy_qty*l.effective-r.bundle_price_pence;if(bundles>0&&saving>0)selected.push({line:l,qty:bundles*r.buy_qty,discount:bundles*saving});}
      }else if(offer.kind==='meal_deal'){
        const groups=r.groups.map(ids=>lines.filter(l=>ids.includes(l.product_id)&&l.remaining>0).sort((a,b)=>b.effective-a.effective||a.product_id.localeCompare(b.product_id)));
        let bundles=Math.min(...groups.map(g=>g.reduce((n,l)=>n+l.remaining,0)));
        // Bulk by price-band, not by individual unit, to bound work for large quantities.
        const available=new Map(lines.map(l=>[l.product_id,l.remaining]));
        while(bundles>0){
          const chosen=groups.map(g=>g.find(l=>available.get(l.product_id)>0));if(chosen.some(l=>!l))break;
          const count=Math.min(bundles,...chosen.map(l=>available.get(l.product_id))),gross=chosen.reduce((n,l)=>n+l.effective,0),saving=gross-r.bundle_price_pence;
          if(saving<=0)break;
          const discounts=allocate(count*saving,chosen,l=>l.effective);
          chosen.forEach((l,i)=>{selected.push({line:l,qty:count,discount:discounts[i]});available.set(l.product_id,available.get(l.product_id)-count);});
          bundles-=count;
        }
      }
      let saving=0;
      for(const x of selected){x.line.remaining-=x.qty;x.line.line_total_pence-=x.discount;x.line.labels.push(offer.name);saving+=x.discount;}
      if(saving)applications.push({id:offer.id,name:offer.name,discount_pence:saving});
    }
    if(reward){const l=lines.find(l=>l.product_id===reward.product_id);if(l&&l.qty>0){const saving=Math.ceil(l.line_total_pence/l.qty);l.line_total_pence-=saving;l.labels.push('Loyalty reward');applications.push({name:'Loyalty reward',discount_pence:saving});}}
    for(const l of lines){l.line_discount_pence=l.list_total_pence-l.line_total_pence;l.labels=[...new Set(l.labels)];delete l.remaining;delete l.effective;}
    const total=lines.reduce((n,l)=>n+l.line_total_pence,0),list=lines.reduce((n,l)=>n+l.list_total_pence,0);
    if(!Number.isSafeInteger(total)||total<0||total>100000000)throw Error('Sale total exceeds the supported money limit');
    return {lines,total_pence:total,list_total_pence:list,discount_pence:list-total,applications};
  }
  return {price,allocate};
});
