(() => {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = pence => new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(pence/100);
  const states = { draft:'Draft',quote:'Quote',confirmed:'Confirmed',backorder:'Backorder',cancelled:'Cancelled',
    returned:'Return recorded',to_dispatch:'In Dispatch Centre',fulfilled:'Fulfilled',needs_matching:'Needs product matching' };
  function btn(label,action) { return '<button class="btn quiet" data-order-workflow="'+action+'" type="button">'+label+'</button>'; }

  async function open({ order, api, show, refresh }) {
    const path='/workspace-orders/'+encodeURIComponent(order.id);
    const result=await api(path+'/workflow');
    const {order:state}=result;
    const lines=order.lines || [];
    const canEdit=!order.pack_id && lines.length>0 && !['cancelled','returned'].includes(state.status);
    const canSplit=canEdit && ['draft','confirmed','backorder'].includes(state.status) && lines.reduce((sum,row)=>sum+row.qty,0)>1;
    const liveStatus=state.packing_status==='packed'&&state.status!=='returned'?'fulfilled':state.status;
    const shortages=result.shortages.length?'<section class="business-section"><h3>Stock shortages</h3><ul>'+
      result.shortages.map(row=>'<li>'+escape(row.description)+' · '+row.available+' available of '+row.qty+'</li>').join('')+'</ul></section>':'';
    show('Order workflow', '<p class="muted">'+escape(order.reference||order.id.slice(0,8))+' · '+escape(states[liveStatus]||liveStatus)+'</p>'+shortages+
      (canEdit?'<section class="business-section"><div class="form-grid"><label class="workspace-field">Customer or company<input data-customer-name maxlength="160" value="'+escape(state.customer_name)+'"></label>'+
      '<label class="workspace-field">Quote expiry<input data-quote-expiry type="date" value="'+escape(state.valid_until)+'"></label>'+
      '</div><label class="workspace-field">Billing address<textarea data-customer-address maxlength="500">'+escape(state.customer_address)+'</textarea></label>'+
      '<div class="dialog-actions">'+btn('Save quote','quote')+(state.status==='quote'?btn('Print quote','print'):'')+btn('Confirm order','confirm')+
      (['confirmed','backorder'].includes(state.status)?btn('Check stock','check_stock'):'')+btn('Cancel order','cancel')+'</div></section>':'')+
      (canSplit?'<details class="business-section"><summary>Split into another parcel</summary><form data-order-split>'+
        lines.map(line=>'<label class="workspace-field">'+escape(line.description)+' <small>'+line.qty+' currently on order</small>'+
          '<input name="quantities" type="number" min="0" max="'+line.qty+'" required value="0"></label>').join('')+
        '<button class="btn primary" type="submit">Create separate parcel order</button></form></details>':'')+
      (liveStatus==='fulfilled'?'<p>Record the return after you process the stock or payment in the original sales workflow.</p>'+btn('Record return','return'):'')+
      (result.events.length?'<section class="business-section"><h3>Order history</h3><ul>'+result.events.map(item=>'<li>'+
        escape(states[item.action]||item.action.replaceAll('_',' '))+' · '+escape(new Date(item.happened_at).toLocaleString())+'</li>').join('')+'</ul></section>':'')+
      '<p data-order-workflow-status role="status"></p>');
    const host=document.getElementById('dialog-content'), message=host.querySelector('[data-order-workflow-status]');
    let busy=false, attempt;
    async function run(pathSuffix,body){
      if(busy)return;
      busy=true;message.textContent='Saving…';
      try{await api(path+pathSuffix,body);await refresh();}catch(err){message.textContent=err.message;}
      finally{busy=false;}
    }
    host.querySelectorAll('[data-order-workflow]').forEach(button=>button.onclick=()=>{
      const action=button.dataset.orderWorkflow;
      if(action==='print')return print(order,state);
      if(['cancel','return'].includes(action)&&!confirm(action==='cancel'?'Cancel this order?':'Record this order as returned?'))return;
      return run('/workflow',{action,version:state.version,customer_name:host.querySelector('[data-customer-name]')?.value,
        customer_address:host.querySelector('[data-customer-address]')?.value,valid_until:host.querySelector('[data-quote-expiry]')?.value||null});
    });
    const form=host.querySelector('[data-order-split]');
    if(form)form.onsubmit=event=>{
      event.preventDefault();
      const quantities=new FormData(form).getAll('quantities').map(Number), key=JSON.stringify(quantities);
      if(attempt?.key!==key)attempt={key,id:crypto.randomUUID()};
      return run('/split',{request_id:attempt.id,version:state.version,quantities});
    };
  }

  function print(order, state){
    const output=document.createElement('article');
    output.className='workspace-quote-print';
    const lines=order.lines || [], priced=lines.every(line=>line.unit_price_pence!=null);
    output.innerHTML='<h1>Quote '+escape(order.reference||order.id.slice(0,8))+'</h1><p>Valid until '+escape(state.valid_until||'confirmation')+
      '</p><p>'+escape(state.customer_name)+'</p><p>'+escape(state.customer_address)+'</p><table><thead><tr><th>Item</th><th>Qty</th><th>Unit price</th></tr></thead><tbody>'+
      lines.map(line=>'<tr><td>'+escape(line.description)+'</td><td>'+line.qty+'</td><td>'+(line.unit_price_pence==null?'To confirm':money(line.unit_price_pence))+'</td></tr>').join('')+
      '</tbody></table>'+(priced?'<p><strong>Quote total '+money(lines.reduce((sum,line)=>sum+line.qty*line.unit_price_pence,0))+'</strong></p>':'')+
      (order.note?'<p>'+escape(order.note)+'</p>':'');
    document.body.append(output);
    const cleanup=()=>output.remove();
    window.addEventListener('afterprint',cleanup,{once:true});
    try{window.print();}catch(err){cleanup();throw err;}
  }
  window.InventoryOrderWorkflow={open};
})();
