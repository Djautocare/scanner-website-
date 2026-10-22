(function () {
  'use strict';
  const DB = 'inventoryos-retail-device-v1';
  let database;
  const changed = () => window.dispatchEvent(new Event('retail-offline-change'));
  const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(DB) : null;
  channel?.addEventListener('message', changed);
  async function db() {
    if (!database) database = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('scopes');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('Device storage could not be opened. Offline sales are disabled.'));
    });
    return database;
  }
  async function update(key, fn) {
    const database = await db();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('scopes', 'readwrite'), store = tx.objectStore('scopes');
      let result;
      const request = store.get(key);
      request.onsuccess = () => {
        try {
          const value = request.result || { operations: [] };
          result = fn(value);
          store.put(value, key);
        } catch (e) { tx.abort(); reject(e); }
      };
      tx.oncomplete = () => { changed(); channel?.postMessage(key); resolve(result); };
      tx.onerror = () => reject(new Error('Sale could not be saved on this device. Do not complete payment until storage is working.'));
      tx.onabort = () => reject(new Error('Device storage was not saved.'));
    });
  }
  async function read(key) {
    const database = await db();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('scopes', 'readonly'), request = tx.objectStore('scopes').get(key);
      request.onsuccess = () => resolve(request.result || { operations: [] });
      request.onerror = () => reject(new Error('Could not read saved Retail data.'));
    });
  }
  function device() {
    let id = localStorage.getItem('inventoryos_retail_device');
    if (!id) { id = crypto.randomUUID(); localStorage.setItem('inventoryos_retail_device', id); }
    return id;
  }
  async function save(key, snapshot) {
    return update(key, value => {
      if (value.operations.length) return false; // An uncertain write might already exist on the server.
      value.locked_reason = ''; value.access_denied = false; value.snapshot = snapshot; value.saved_at = Date.now(); return true;
    });
  }
  function clock(value) { return Date.parse(value.snapshot?.server_now) + Date.now() - value.saved_at; }
  function canSell(value) {
    return Boolean(!value.locked_reason && navigator.locks && value.snapshot?.offline && value.snapshot.till && value.snapshot.role !== 'viewer' && clock(value) < value.snapshot.offline.expires_at && !value.operations.some(x => x.status === 'blocked'));
  }
  function vat(settings, lines) {
    if (!settings.vat_receipts) return null;
    const groups = new Map(), items = [];
    for (const i of lines) {
      if (!i.vat_treatment) throw new Error('Set every product’s VAT treatment online before taking this sale.');
      const gross = i.line_total_pence ?? i.qty * i.unit_price_pence, denominator = 100 + i.vat_rate;
      const tax = Math.floor((2 * gross * i.vat_rate + denominator) / (2 * denominator));
      const line = { product_id: i.product_id, vat_treatment: i.vat_treatment, vat_rate: i.vat_rate, gross_pence: gross, net_pence: gross - tax, vat_pence: tax };
      items.push(line);
      const key = line.vat_treatment + ':' + line.vat_rate;
      if (!groups.has(key)) groups.set(key, { vat_treatment: line.vat_treatment, vat_rate: line.vat_rate, gross_pence: 0, net_pence: 0, vat_pence: 0 });
      for (const k of ['gross_pence', 'net_pence', 'vat_pence']) groups.get(key)[k] += line[k];
    }
    const result = { version: 1, prices_include_vat: true, currency: 'GBP', business_name: settings.receipt_business_name, business_address: settings.receipt_business_address, vat_number: settings.vat_number, groups: [...groups.values()].sort((a,b) => b.vat_rate-a.vat_rate || a.vat_treatment.localeCompare(b.vat_treatment)), lines: items };
    for (const k of ['gross_pence', 'net_pence', 'vat_pence']) result[k] = items.reduce((n,x) => n+x[k],0);
    return result;
  }
  async function enqueue(key, input) {
    return update(key, value => {
      if (!canSell(value)) throw new Error('Offline checkout is not ready or needs attention. Reconnect, sync saved sales and open the till before continuing.');
      if (value.operations.length >= 1000) throw new Error('Sync the 1,000 saved sales on this device before taking another sale.');
      const { snapshot: s } = value;
      if (input.customer_id || input.staff_id || input.booking_id || input.preorder_id || input.redeem_reward || Number(input.tip || 0)) throw new Error('Customer, staff, tip and booking/preorder checkout require a connection.');
      const priced = window.InventoryRetailPricing.price(input.items, s.offline.pricing || {}, clock(value));
      if (input.reviewed_total_pence !== undefined && input.reviewed_total_pence !== priced.total_pence) throw new Error('An offer changed. Review the basket again before payment.');
      const total = priced.total_pence;
      if (!input.items.length || input.items.length > 100 || !input.items.every(i => Number.isInteger(i.qty) && i.qty>0 && i.qty<=1000000)) throw new Error('Check the basket quantities.');
      if (!/^\d{1,7}(\.\d{1,2})?$/.test(String(input.tendered)) || !Number.isSafeInteger(total) || total > 100000000) throw new Error('Check the sale and cash amounts.');
      const tendered = Math.round(Number(input.tendered)*100);
      if (tendered<total || tendered>100000000) throw new Error('Cash received must cover the sale total.');
      if (s.till.expected_pence + value.operations.reduce((n,x)=>n+x.sale.total_pence,0) + total > 100000000) throw new Error('Till cash limit reached. Reconnect and balance the till.');
      const items = input.items.map(i => {
        const p=s.products.find(p=>p.id===i.product_id && !p.archived);
        if (!p || p.price_pence!==i.unit_price_pence || p.vat_treatment!==i.vat_treatment || p.vat_rate!==i.vat_rate || !s.offline.quotes[p.id]) throw new Error('Basket prices changed. Refresh and review the sale before payment.');
        const l = priced.lines.find(l=>l.product_id===i.product_id);
        return { ...i, name:p.name, item_kind:p.item_kind, line_total_pence:l.line_total_pence, line_discount_pence:l.line_discount_pence, offline_quote:s.offline.quotes[p.id] };
      });
      const request_id=crypto.randomUUID(), occurred_at=new Date(clock(value)).toISOString();
      const sale={ id:request_id, reference:'RT-'+occurred_at.slice(0,10).replace(/-/g,'')+'-'+request_id.slice(0,8).toUpperCase(), created_at:occurred_at, total_pence:total, goods_total_pence:total, discount_pence:priced.discount_pence, promotion_snapshot:priced.applications, tendered_pence:tendered, change_pence:tendered-total, status:'completed', pending_sync:true, items:items.map(({offline_quote,...i})=>i), receipt_business:{shop_name:s.retail_access?.display_name||s.settings.receipt_business_name||s.workspace_name,timezone:s.settings.timezone||'Europe/London',name:s.settings.receipt_business_name || s.workspace_name || 'InventoryOS · Retail',address:s.settings.receipt_business_address || ''}, vat_receipt:vat(s.settings,items) };
      const body={...input,request_id,items,vat_version:s.settings.vat_version??0,offline:{context:s.offline.context,device_id:s.offline.device_id,occurred_at}};
      value.operations.push({id:request_id,body,sale,status:'queued',created_at:Date.now()});
      return {success:true,sale,queued:true};
    });
  }
  function project(value) {
    if (!value.snapshot) return null;
    const d=structuredClone(value.snapshot);
    d.server_now=new Date(clock(value)).toISOString();
    for(const op of value.operations) {
      const sale={...op.sale,pending_sync:op.status!=='applied'};
      d.sales.unshift(sale);
      if(d.till)d.till.expected_pence+=sale.total_pence;
      const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:d.settings.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(sale.created_at)).map(p=>[p.type,p.value]));
      const day=parts.year+'-'+parts.month+'-'+parts.day;
      let daily=d.daily_sales.find(x=>x.day===day); if(!daily){daily={day,net_pence:0};d.daily_sales.push(daily);} daily.net_pence+=sale.total_pence-(sale.tip_pence||0);
      for(const item of sale.items){const p=d.products.find(p=>p.id===item.product_id);if(p && item.item_kind!=='service' && p.item_kind!=='service'){p.stock_qty-=item.qty;p.stock_version++;if(p.stock_qty<0 && !d.counts.some(c=>c.product_id===p.id && c.status==='pending'))d.counts.unshift({id:'pending-'+p.id,product_id:p.id,name:p.name,barcode:p.barcode,stock_qty:p.stock_qty,status:'pending'});}}
    }
    for(const c of d.counts){const p=d.products.find(p=>p.id===c.product_id);if(p){c.stock_qty=p.stock_qty;c.stock_version=p.stock_version;}}
    for(const p of d.products)p.reserved_qty=Number(d.business?.reservations?.find(r=>r.product_id===p.id)?.reserved_qty||0);
    d.reorders=d.products.filter(p=>!p.archived && p.item_kind!=='service' && p.stock_qty-p.reserved_qty<=p.minimum_qty).map(p=>{const on_order=d.deliveries.filter(x=>!['received','cancelled'].includes(x.status)).reduce((n,x)=>n+x.items.filter(i=>i.product_id===p.id).reduce((sum,i)=>sum+i.ordered_qty-i.received_qty,0),0);return {...p,on_order,order_qty:Math.max(0,p.target_qty-p.stock_qty+p.reserved_qty-on_order)};});
    return d;
  }
  async function direct(path, options, key) {
    const selected=JSON.parse(key);
    if(String(InventoryAPI.getUser()?.id)!==String(selected.user)) throw new Error('Sign in to the account that saved these sales to sync them.');
    const response=await fetch(InventoryAPI.API_BASE+'/retail'+path,{...options,cache:'no-store',signal:AbortSignal.timeout(12000),headers:{'Content-Type':'application/json','Authorization':'Bearer '+InventoryAPI.getToken(),'X-Workspace-Id':selected.workspace,'X-Inventory-Ids':selected.inventory}});
    const result=await response.json().catch(()=>({success:false,error:'Invalid backend response. Install the latest Retail backend update.'}));
    if(!response.ok || !result.success)throw Object.assign(new Error(result.error || 'Sync failed'),{status:response.status});
    return result;
  }
  async function sync(key, retry=false) {
    if(!navigator.onLine || !navigator.locks)return;
    return navigator.locks.request(DB+':'+key,{ifAvailable:true},async lock=>{
      if(!lock)return;
      let value=await read(key);
      for(const op of value.operations){
        if(op.status==='applied')continue;
        if(op.status==='blocked' && !retry)return;
        try {
          await update(key,v=>{const o=v.operations.find(x=>x.id===op.id);o.status='sending';o.error='';});
          const result=await direct('/checkout',{method:'POST',body:JSON.stringify(op.body)},key);
          await update(key,v=>{const o=v.operations.find(x=>x.id===op.id);o.status='applied';o.sale=result.sale;});
        }catch(e){
          await update(key,v=>{const o=v.operations.find(x=>x.id===op.id);o.status=e.status>=400&&e.status<500?'blocked':'queued';o.error=e.status===401?'Sign in again, then return to Retail to sync this saved sale.':e.message;});
          return;
        }
      }
      value=await read(key);
      if(value.operations.some(x=>x.status!=='applied'))return;
      try {
        const snapshot=await direct('/overview?offline_device_id='+encodeURIComponent(device()),{},key);
        const ids=new Set(value.operations.map(x=>x.id));
        await update(key,v=>{v.snapshot=snapshot;v.saved_at=Date.now();v.operations=v.operations.filter(x=>!ids.has(x.id));});
      }catch{} // Confirmed sales stay durable until a fresh server snapshot is obtained.
    });
  }
  async function shell() {
    if(!('serviceWorker' in navigator))return false;
    const dashboard=location.pathname.includes('/retail/dashboard/');const script=dashboard?'retail/dashboard/sw.js':'retail/sw.js',scope=dashboard?'retail/dashboard/':'retail/';
    await navigator.serviceWorker.register(new URL(script,document.baseURI),{scope:new URL(scope,document.baseURI).pathname});
    await navigator.serviceWorker.ready;
    return true;
  }
  async function backup(key) {
    const value=await read(key), url=URL.createObjectURL(new Blob([JSON.stringify({version:1,scope:JSON.parse(key),...value},null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='InventoryOS-saved-retail-sales-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  window.InventoryRetailOffline={read,save,device,canSell,enqueue,project,sync,shell,backup,lock:(key,reason,details={})=>update(key,value=>{value.locked_reason=reason;value.access_denied=details.access_denied===true;})};
})();
