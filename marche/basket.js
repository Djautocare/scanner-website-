(function(){
'use strict';
const {$,esc,money,api,status}=PlatformUI;
async function run(){
 const host=$('pf-main'),groups=MarcheCart.groups(),orders=MarcheCart.orders();
 host.innerHTML='<p class="pf-muted">Checking seller totals…</p>';
 const results=await Promise.all(groups.map(async g=>{try{const q=await api('/marche/shop/'+encodeURIComponent(g.slug)+'/quote',{publicOnly:true,body:{items:g.items}});return {...g,quote:q};}catch(e){return {...g,error:e.message};}}));
 const states=await Promise.all(orders.map(async o=>{try{return {...o,...await api('/marche/order/'+encodeURIComponent(o.id),{publicOnly:true,body:{lookup_key:o.key}})};}catch{return {...o,status:'Unavailable — open the original checkout'};}}));
 for(const o of states)if(['paid','review'].includes(o.status))MarcheCart.finish(o);
 const active=new Set(MarcheCart.groups().map(x=>x.slug));
 const visible=results.filter(x=>active.has(x.slug));
 let total=0;for(const r of visible)if(r.quote)total+=r.quote.total_pence;
 host.innerHTML='<section class="pf-card"><h2>One payment per seller</h2><p>Each seller handles their own order. Completing one payment does not complete the others. You can return here between payments. Removing a basket does not cancel an existing reservation; open the order to cancel it.</p>'+ (visible.length?'<p class="pf-total">'+esc(money(total))+(visible.some(x=>x.error)?' + totals needing review':' combined total')+'</p>':'<p class="pf-muted">Your basket is empty.</p>')+'</section><div class="pf-grid">'+visible.map(g=>'<section class="pf-card"><h2>'+esc(g.name)+'</h2><p>'+g.items.reduce((n,i)=>n+i.qty,0)+(g.items.reduce((n,i)=>n+i.qty,0)===1?' item':' items')+'</p>'+(g.error?'<p class="pf-warning">'+esc(g.error)+'</p>':'<p class="pf-total">'+esc(money(g.quote.total_pence))+'</p>')+'<div class="pf-actions"><a class="pf-button primary" href="/marche/'+encodeURIComponent(g.slug)+'">Review & pay this seller</a><button type="button" data-remove="'+esc(g.slug)+'">Remove seller</button></div></section>').join('')+'</div>'+
 (states.length?'<section class="pf-card"><h2>Recent checkout attempts</h2><p class="pf-muted">Status updates from each seller. Keep this browser session to retain these private order links.</p>'+states.map(o=>'<div class="pf-choice"><strong>'+esc(o.slug)+'</strong><span>'+esc(o.status)+(o.refunded_pence?' · refunded '+esc(money(o.refunded_pence)):'')+'</span><a class="pf-button" href="/marche/'+encodeURIComponent(o.slug)+'?order='+encodeURIComponent(o.id)+'">View order</a></div>').join('')+'</section>':'');
 for(const b of host.querySelectorAll('[data-remove]'))b.onclick=()=>{MarcheCart.put(b.dataset.remove,'',[]);run().catch(e=>status(e.message,true));};
}
run().catch(e=>status(e.message,true));
})();
