(() => {
  'use strict';
  const endpoint = '/workspace-orders/business';
  const admin = ['owner','admin'];
  const tabs = ['Warehouses','Transfers','Bundles','Serial numbers','Batches & expiry','Price lists'];
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pounds = pence => new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(pence/100);
  const current = () => [localStorage.getItem('inventoryos_selected_workspace_id'),InventoryAPI.getSelectedInventoryHeader()].join('|');
  const option = (key,label) => '<option value="'+esc(key)+'">'+esc(label)+'</option>';
  const input = (name, label, modifiers = '') => '<label class="workspace-field">'+label+'<input name="'+name+'" '+modifiers+'></label>';
  const select = (name,label,options) => '<label class="workspace-field">'+label+'<select required name="'+name+'"><option value="">Choose '+label.toLowerCase()+'</option>'+options.join('')+'</select></label>';
  const btn = (text,attrs='',primary=false) => '<button type="button" class="btn '+(primary?'primary':'quiet')+'" '+attrs+'>'+text+'</button>';
  const submit = text => '<button type="submit" class="btn primary">'+text+'</button>';
  const list = (rows,renderer,empty) => rows.length ? '<ul class="business-records">'+rows.map(renderer).join('')+'</ul>' : '<p class="muted">'+empty+'</p>';
  let active = 0, dialog, scope, data, busy = false, attempt;

  function ids(kind){
    const names=new Map(data.warehouses.map(row=>[row.id,row.name]));
    if(kind==='warehouses')return data.warehouses.map(row=>option(row.id,row.name));
    if(kind==='products')return data.products.map(row=>option(row.id,row.description+' · '+names.get(row.inventory_id)));
    return data.locations.map(row=>option(row.id,names.get(row.inventory_id)+' / '+row.box_name));
  }
  async function api(path='',body) {
    if (scope!==current()) throw Error('The selected inventory changed. Reopen Stock operations.');
    const headers={};
    const workspace=localStorage.getItem('inventoryos_selected_workspace_id');
    if(workspace)headers['X-Workspace-Id']=workspace;
    const r=await InventoryAPI.request(endpoint+path,body?{method:'POST',body:JSON.stringify(body),headers}:{cache:'no-store',headers});
    if (scope!==current()) throw Error('The selected inventory changed. Reopen Stock operations.');
    if(!r?.success)throw Error(r?.error||'Stock operations could not be opened.');
    return r;
  }
  async function reload(){
    data=await api();
    if(dialog?.open)render();
  }
  function section(title,html){return '<section class="business-section"><h3>'+title+'</h3>'+html+'</section>';}
  function form(kind,html){return '<form class="business-form" data-business-form="'+kind+'">'+html+'</form>';}
  function row(heading,sub,actions=''){return '<li><div><strong>'+esc(heading)+'</strong><small>'+esc(sub)+'</small></div><div class="business-actions">'+actions+'</div></li>';}
  function warehousing(writer){
    const warehouses=list(data.warehouses, w=>row(w.name,[w.code,w.contact,w.stocked_locations+' stocked locations',w.units+' units',w.reserved+' held'].filter(Boolean).join(' · ')),'Select a stock inventory to see its warehouse balances.');
    return section('Warehouse balances',warehouses)+(writer?section('Warehouse details',form('warehouse',
      select('inventory_id','Inventory',ids('warehouses'))+input('code','Warehouse code','required maxlength="40"')+input('contact','Contact','maxlength="240"')+submit('Save warehouse'))):'');
  }
  function transfers(writer){
    return section('Stock transfers',list(data.transfers, t=>{
      const attrs='data-id="'+esc(t.id)+'" data-version="'+esc(t.version)+'"';
      const action=(caption,name)=>btn(caption,'data-transfer="'+name+'" '+attrs);
      const actions=btn('History','data-transfer="history" '+attrs)+(writer?(
        t.status==='requested'?action('Approve','approve')+action('Cancel','cancel'):
        t.status==='approved'?action('Dispatch','send')+action('Cancel','cancel'):
        t.status==='in_transit'?action('Receive','receive'):''):'');
      return row(t.description,t.from_location+' → '+t.to_location+' · '+t.status.replaceAll('_',' ')+' · '+t.received+'/'+t.quantity+' received',actions);
    },'Transfers requested across the selected inventories appear here.'))+(data.role!=='viewer'?section('Request a transfer',form('transfer',
      select('product_id','Source product',ids('products'))+select('from_box','Source location',ids('locations'))+
      select('to_box','Destination location',ids('locations'))+input('quantity','Units','type="number" min="1" max="1000000" required')+
      '<p class="muted">Select both inventories in the workspace. Use the same product barcode at the destination.</p>'+submit('Request transfer'))):'');
  }
  function bundles(writer) {
    const summary=list(data.products.filter(p=>p.components.length),p=>row(p.description,p.components.map(c=>c.description+' × '+c.quantity).join(', '),
      writer?btn('Edit','data-bundle="'+esc(p.id)+'"'):''),'Choose an existing product to sell as a bundle.');
    return section('Bundle products',summary)+(writer?section('Configure components',form('bundle',
      select('parent_id','Bundle product',ids('products'))+
      '<div data-bundle-parts></div>'+btn('Add component','data-business-add-part')+
      '<p class="muted">Orders keep the bundle price. Dispatch picks the component stock.</p>'+submit('Save components'))):'');
  }
  function serials(){
    return section('Tracked units',list(data.serials,s=>row(s.serial,s.description+' · '+(s.box_name||s.status.replaceAll('_',' ')),
      btn('History','data-business-history="serial" data-id="'+esc(s.id)+'"')+(!['needs_reconciliation','in_stock'].includes(s.status)||data.role==='viewer'?'':btn('Reconcile','data-serial="'+esc(s.id)+'"')+btn('Retire','data-serial-retire="'+esc(s.id)+'"'))),
      'Register serial numbers against units already in stock.'))+(data.role!=='viewer'?section('Assign a serial number',form('serial',
      '<input type="hidden" name="id">'+input('serial','Serial number','required maxlength="120"')+
      select('product_id','Product',ids('products'))+select('box_id','Current location',ids('locations'))+
      '<p class="muted">Add Stock, Move Stock, Dispatch and Discard can identify the serials they touch.</p>'+submit('Save serial'))):'');
  }
  function batches(){
    const today=new Date().toISOString().slice(0,10);
    return section('Finished batches',list(data.lots,l=>row(l.batch_code+' · '+l.product_name,
      l.qty+' units across '+l.locations+' stock positions · '+(l.expires_on?(l.expires_on<today?'Expired ':'Expires ')+l.expires_on:'No expiry')+' · '+l.status,
      btn('Trace','data-business-history="batch" data-id="'+esc(l.id)+'"')), 'Finished batches are shared with Manufacturing.'))+
      (data.role==='viewer'?'':section('Receive a named batch',form('batch',
        select('product_id','Product',ids('products'))+select('box_id','Stock location',ids('locations'))+
        input('batch_code','Batch number','required maxlength="100"')+input('expires_on','Expiry date','type="date"')+
        input('quantity','Units received','type="number" min="1" max="1000000" required')+submit('Receive batch'))));
  }
  function prices(writer){
    return section('Custom price lists',list(data.price_lists,l=>row(l.name,l.prices.map(p=>p.description+' '+pounds(p.price_pence)).join(' · ')||'No listed prices',
      writer?btn('Edit','data-price-list="'+esc(l.id)+'"'):''),
      'Use price lists to fill unit prices when creating an order.'))+(writer?section('Set a product price',form('price-list',
      '<input type="hidden" name="list_id">'+input('name','Price list name','required maxlength="80"')+
      select('product_id','Product',ids('products'))+input('amount','Unit price (£)','type="number" min="0" step="0.01" max="1000000" required')+submit('Save price'))):'');
  }
  function render(){
    const writer=admin.includes(data.role);
    const views=[warehousing,transfers,bundles,serials,batches,prices];
    dialog.querySelector('[data-business-nav]').innerHTML=tabs.map((tab,index)=>btn(tab,'data-business-tab="'+index+'" aria-pressed="'+(index===active)+'"',index===active)).join('');
    dialog.querySelector('[data-business-content]').innerHTML=views[active](writer);
  }
  function announce(message){dialog.querySelector('[data-business-status]').textContent=message;}
  function addPart(product='', amount='1') {
    const div=document.createElement('div');
    div.className='business-part';
    div.innerHTML=select('part_id','Component',ids('products'))+
      input('part_quantity','Units per bundle','type="number" min="1" max="1000000" required value="'+esc(amount)+'"')+
      btn('Remove','data-business-remove-part');
    const destination=dialog.querySelector('[data-bundle-parts]');
    if(destination.children.length>=30)return;
    destination.append(div);
    div.querySelector('select').value=product;
  }
  function requestId(body){
    const key=JSON.stringify(body);
    if(attempt?.key!==key)attempt={key,id:crypto.randomUUID()};
    return attempt.id;
  }
  async function save(body,path){
    if(busy)return;
    busy=true; announce('Saving…');
    try{await api(path,body);attempt=null;await reload();announce('Saved.');}
    catch(err){announce(err.message);}
    finally{busy=false;}
  }
  function submitForm(event){
    const form=event.target.closest('[data-business-form]');
    if(!form)return;
    event.preventDefault();
    const kind=form.dataset.businessForm;
    const values=new FormData(form), body=Object.fromEntries(values);
    if(kind==='bundle')body.components=values.getAll('part_id').map((product_id,i)=>({product_id,quantity:values.getAll('part_quantity')[i]}));
    if(kind==='price-list'){
      body.price_pence=Math.round(Number(body.amount)*100);
      body.list_id=body.list_id||requestId(body);
    }
    if(['transfer','serial','batch'].includes(kind))body.request_id=requestId(body);
    void save(body,'/'+kind);
  }
  async function click(event) {
    const button=event.target.closest('button');
    if(!button||busy)return;
    if(button.hasAttribute('data-business-close'))return dialog.close();
    if(button.hasAttribute('data-business-tab')){active=Number(button.dataset.businessTab);attempt=null;render();announce('');return;}
    if(button.hasAttribute('data-business-add-part'))return addPart();
    if(button.hasAttribute('data-business-remove-part'))return button.closest('.business-part').remove();
    if(button.dataset.bundle){
      const p=data.products.find(row=>row.id===button.dataset.bundle);
      const editor=dialog.querySelector('[data-business-form="bundle"]');
      editor.elements.parent_id.value=p.id;
      editor.querySelector('[data-bundle-parts]').replaceChildren();
      p.components.forEach(c=>addPart(c.product_id,c.quantity));editor.scrollIntoView({block:'nearest'});return;
    }
    if(button.dataset.priceList){
      const price=data.price_lists.find(row=>row.id===button.dataset.priceList);
      const editor=dialog.querySelector('[data-business-form="price-list"]');
      editor.elements.list_id.value=price.id;editor.elements.name.value=price.name;editor.scrollIntoView({block:'nearest'});return;
    }
    if(button.dataset.serial){
      const serial=data.serials.find(row=>row.id===button.dataset.serial);
      const editor=dialog.querySelector('[data-business-form="serial"]');
      editor.elements.id.value=serial.id;editor.elements.serial.value=serial.serial;
      editor.elements.serial.readOnly=true;editor.elements.product_id.value=serial.product_id;
      editor.elements.box_id.value=serial.box_id||'';editor.scrollIntoView({block:'nearest'});return;
    }
    if(button.dataset.serialRetire&&confirm('Retire this serial record? Stock quantity stays as recorded.')){
      return save({id:button.dataset.serialRetire,action:'retire'},'/serial');
    }
    if(button.dataset.businessHistory){
      try{
        const history=await api('/'+button.dataset.businessHistory+'/'+encodeURIComponent(button.dataset.id));
        announce(history.entries.map(item=>[item.action,item.location,item.qty,new Date(item.happened_at||item.created_at).toLocaleString()].filter(x=>x!=null&&x!=='').join(' · ')).join(' / '));
      }catch(err){announce(err.message);}
      return;
    }
    if(!button.dataset.transfer)return;
    const {transfer:action,id,version}=button.dataset, path='/transfer/'+encodeURIComponent(id);
    if(action==='history'){
      try{const result=await api(path);announce(result.events.map(e=>e.action+' · '+new Date(e.happened_at).toLocaleString()).join(' / '));}
      catch(err){announce(err.message);}return;
    }
    const body={action,version:Number(version)};
    if(action==='receive'){
      const item=data.transfers.find(row=>row.id===id);
      const answer=prompt('How many of the '+(item.quantity-item.received)+' units arrived?',String(item.quantity-item.received));
      if(answer==null)return;
      body.quantity=answer;
    }
    if(action==='send'&&!confirm('Mark these units dispatched from the source warehouse?'))return;
    return save(body,path);
  }
  function open(){
    if(dialog?.open)return;
    scope=current();active=0;attempt=null;
    dialog=document.createElement('dialog');
    dialog.className='business-dialog';
    dialog.setAttribute('aria-label','Stock operations');
    dialog.innerHTML='<header><h2>Stock operations</h2>'+btn('Close','data-business-close')+'</header>'+
      '<nav data-business-nav aria-label="Stock operations"></nav><p data-business-status role="status">Loading warehouse data…</p><div data-business-content></div>';
    dialog.addEventListener('close',()=>dialog.remove(),{once:true});
    dialog.addEventListener('click',click);
    dialog.addEventListener('submit',submitForm);
    document.body.append(dialog);dialog.showModal();
    void reload().then(()=>announce(''),err=>announce(err.message));
  }
  window.InventoryBusinessTools={open};
})();
