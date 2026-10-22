'use strict';
const crypto=require('node:crypto');
const {promisify}=require('node:util');
const scrypt=promisify(crypto.scrypt),uuid=()=>crypto.randomUUID();
const hash=v=>crypto.createHash('sha256').update(String(v)).digest('hex');
const PLANS={retail:{name:'InventoryOS Retail',pence:1999}};
const LEGACY_PLANS=['starter','pro','enterprise'];
const PRO_FEATURES=['offers','loyalty','appointments','preorders','profit','reminders','reorder_emails','display'];
const BASE_FEATURES=['services','packs','reductions','staff'];
const FEATURES=[...BASE_FEATURES,...PRO_FEATURES];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function createPlatform(H){
 const {pool,now,id,text,integer,money,fail,args}=H;
 const stamp=()=>now().toISOString();
 const app=()=>String(process.env.APP_URL||'https://app.inventoryos.co.uk').replace(/\/$/,'');
 const stripe=()=>{if(!process.env.STRIPE_SECRET_KEY)throw fail('Stripe billing has not been configured yet',503);return new(require('stripe'))(process.env.STRIPE_SECRET_KEY);};
 const price=k=>String(k==='retail'?(process.env.STRIPE_PRICE_RETAIL_MONTHLY||process.env.STRIPE_PRICE_RETAIL_PRO_MONTHLY||''):(process.env['STRIPE_PRICE_RETAIL_'+k.toUpperCase()+'_MONTHLY']||'')).trim();
 async function event(c,s,kind,data){await c.query('INSERT INTO retail_platform_events(id,workspace_id,inventory_id,actor_id,kind,data,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[uuid(),s.workspace_id,s.inventory_id||null,s.actor_id||null,kind,JSON.stringify(data),stamp()]);}
 async function lock(c,w){await c.query("SELECT pg_advisory_xact_lock(hashtextextended('retail-workspace:'||$1,0))",[w]);}
 async function connect(fn){await H.ensureSchema();const c=await pool.connect();try{await c.query('BEGIN');const result=await fn(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 function entitlement(row){
  if(!row)return {allowed:false,plan:'none',paid_plan:'none',till_allowance:0,features:Object.fromEntries(FEATURES.map(k=>[k,false])),settings:{}};
  const active=['active','trialing'].includes(row.stripe_status)&&!(row.cancel_at_period_end&&row.period_end&&Date.parse(row.period_end)<=now().getTime()),overrideActive=!row.override_expires_at||Date.parse(row.override_expires_at)>now().getTime();
  const paid=active?row.paid_plan:'none',plan=overrideActive&&row.override_plan?row.override_plan:paid;
  const allowed=row.enabled&&Boolean(PLANS[plan]||LEGACY_PLANS.includes(plan));
  const features=Object.fromEntries(FEATURES.map(k=>[k,allowed]));
  if(overrideActive)for(const [k,v]of Object.entries(row.feature_overrides||{}))if(FEATURES.includes(k)&&typeof v==='boolean')features[k]=allowed&&v;
  return {display_name:row.name,allowed,plan,plan_name:allowed?'InventoryOS Retail':'Retail inactive',paid_plan:paid,stripe_status:row.stripe_status,unlimited_tills:allowed,till_allowance:allowed?null:0,paid_pairs:Number(row.paid_pairs),override_extra_pairs:overrideActive?row.override_extra_pairs:0,features,settings:row.settings||{},override_active:overrideActive&&Boolean(row.override_plan||row.override_extra_pairs||Object.keys(row.feature_overrides||{}).length),override_plan:row.override_plan,override_expires_at:row.override_expires_at,reverts_to:paid,reason:row.override_reason,period_end:row.period_end,cancel_at_period_end:row.cancel_at_period_end};
 }
 async function access(c,w,inventory){
  if(inventory){const row=(await c.query('SELECT * FROM retail_stores WHERE workspace_id=$1 AND inventory_id=$2',[w,inventory])).rows[0];return entitlement(row);}
  const stores=(await c.query('SELECT * FROM retail_stores WHERE workspace_id=$1',[w])).rows;
  return stores.map(entitlement).find(x=>x.allowed)||entitlement(null);
 }
 function limitBusiness(config,a){return {...config,features:Object.fromEntries(Object.entries(config.features).map(([k,v])=>[k,Boolean(v)&&a.features[k]!==false]))};}
 async function createStore(c,s,b){
  let inventory=b.inventory_id?id(b.inventory_id):null;const name=text(b.name,'Store name');
  if(inventory){if(!(await c.query("SELECT i.id FROM inventories i JOIN workspaces w ON w.id=i.workspace_id WHERE i.workspace_id=$1 AND i.id=$2 AND w.workspace_kind='retail'",[s.workspace_id,inventory])).rows.length)throw fail('Choose a Retail shop inventory; reseller inventory cannot be attached',403);}
  else{if(Number((await c.query('SELECT COUNT(*)::int n FROM inventories WHERE workspace_id=$1',[s.workspace_id])).rows[0].n)>=100)throw fail('Contact support to add more than 100 stores');inventory=uuid();await c.query('INSERT INTO inventories(id,workspace_id,name,is_default) VALUES($1,$2,$3,false)',[inventory,s.workspace_id,name]);}
  const number=String(crypto.randomInt(100000000,999999999));
  const r=(await c.query('INSERT INTO retail_stores(inventory_id,workspace_id,name,customer_number) VALUES($1,$2,$3,$4) RETURNING *',[inventory,s.workspace_id,name,number])).rows[0];
  await c.query('INSERT INTO retail_settings(workspace_id,enabled) VALUES($1,true) ON CONFLICT(workspace_id) DO UPDATE SET enabled=true',[s.workspace_id]);
  await event(c,{...s,inventory_id:inventory},'store_created',{name});return {store:publicStore(r)};
 }
 function publicStore(r){const {stripe_customer_id,stripe_subscription_id,checkout_session_id,...safe}=r;return {...safe,entitlement:entitlement(r),has_subscription:Boolean(stripe_subscription_id),checkout_configured:Boolean(price('retail')&&process.env.STRIPE_SECRET_KEY),legacy_billing:Boolean(r.stripe_subscription_id&&(r.paid_plan!=='retail'||Number(r.paid_pairs)>0))};}
 async function management(req){return connect(async c=>{const s=await H.scope(c,req,{inventory:false,admin:true,enabled:false,entitled:false});
  const stores=(await c.query('SELECT * FROM retail_stores WHERE workspace_id=$1 ORDER BY name',[s.workspace_id])).rows;
  const tills=(await c.query('SELECT id,inventory_id,name,slot,active,hardware,last_seen,device_hash IS NOT NULL AS paired,generation FROM retail_registered_tills WHERE workspace_id=$1 ORDER BY inventory_id,slot',[s.workspace_id])).rows;
  for(const t of tills){t.assignment=await drawers.publicAssignment(c,t.id);const session=(await c.query('SELECT id,opening_pence FROM retail_till_sessions WHERE registered_till_id=$1 AND closed_at IS NULL',[t.id])).rows[0];if(session){const cash=(await c.query('SELECT COALESCE(SUM(amount_pence),0)::bigint n FROM retail_cash_events WHERE session_id=$1',[session.id])).rows[0];const cards=(await c.query("SELECT COALESCE(SUM(total_pence-deposit_applied_pence),0)::bigint n FROM retail_sales WHERE till_session_id=$1 AND payment_method='card'",[session.id])).rows[0];const refunds=(await c.query("SELECT COALESCE(SUM(rr.total_pence),0)::bigint n FROM retail_returns rr WHERE rr.registered_till_id=$1 AND rr.payment_method='card' AND rr.created_at>=(SELECT opened_at FROM retail_till_sessions WHERE id=$2)",[t.id,session.id])).rows[0];t.session={id:session.id,expected_pence:session.opening_pence+Number(cash.n),card_pence:Number(cards.n),card_refunds_pence:Number(refunds.n)};}}
  const staff=(await c.query('SELECT st.id,st.inventory_id,st.name,st.active,cr.staff_number,cr.qr_token,cr.version AS credential_version FROM retail_team st LEFT JOIN retail_staff_credentials cr ON cr.staff_id=st.id WHERE st.workspace_id=$1 ORDER BY st.name',[s.workspace_id])).rows;
  const assignments=(await c.query('SELECT * FROM retail_staff_assignments WHERE workspace_id=$1',[s.workspace_id])).rows;
  const inventories=(await c.query('SELECT id,name FROM inventories WHERE workspace_id=$1 ORDER BY name',[s.workspace_id])).rows;
  return {success:true,stores:stores.map(publicStore),tills,staff,assignments,inventories,plans:PLANS,features:FEATURES,server_now:stamp()};});}
 async function locations(req){return connect(async c=>{const s=await H.scope(c,req,{inventory:false,enabled:false,entitled:false});const rows=(await c.query('SELECT i.id,i.name AS inventory_name,r.name AS display_name,r.customer_number,r.inventory_id AS registered_inventory FROM inventories i LEFT JOIN retail_stores r ON r.inventory_id=i.id AND r.workspace_id=i.workspace_id WHERE i.workspace_id=$1 ORDER BY COALESCE(r.name,i.name),i.id',[s.workspace_id])).rows;const stores=[];for(const r of rows){const a=await access(c,s.workspace_id,r.id);stores.push({...r,display_name:r.display_name||r.inventory_name,registered:Boolean(r.registered_inventory),plan_name:a.plan_name||'Retail inactive',plan:a.plan,allowed:a.allowed,override_active:a.override_active,override_expires_at:a.override_expires_at,reverts_to:a.reverts_to});}return {success:true,locations_supported:true,workspace:{id:s.workspace_id,name:s.workspace_name,role:s.role},stores};});}
 async function ownerChange(req){return connect(async c=>{const s=await H.scope(c,req,{inventory:false,admin:true,enabled:false,entitled:false});await lock(c,s.workspace_id);const b=req.body||{};
  if(b.action==='create-store')return {success:true,...await createStore(c,s,b)};
  const inventory=id(b.inventory_id),store=(await c.query('SELECT * FROM retail_stores WHERE workspace_id=$1 AND inventory_id=$2 FOR UPDATE',[s.workspace_id,inventory])).rows[0];if(!store)throw fail('Store unavailable',404);s.inventory_id=inventory;const a=entitlement(store);
  if(b.action==='store-display-name'){
   if(typeof b.display_name!=='string')throw fail('Enter a Retail display name');if(typeof b.previous_name!=='string'||b.previous_name!==store.name)throw fail('Store details changed. Reload before saving',409);
   const inv=(await c.query('SELECT name FROM inventories WHERE id=$1 AND workspace_id=$2',[inventory,s.workspace_id])).rows[0];if(!inv)throw fail('Inventory unavailable',403);
   const name=text(b.display_name.trim()||inv.name,'Retail display name');await c.query('UPDATE retail_stores SET name=$2 WHERE inventory_id=$1 AND workspace_id=$3',[inventory,name,s.workspace_id]);await event(c,s,'store_display_name_changed',{previous:store.name,name});return {success:true,display_name:name,inventory_name:inv.name};
  }
  if(b.action==='register-till'){
   if(!a.allowed)throw fail('Activate a Retail subscription or trial first',402);
   const used=(await c.query('SELECT slot FROM retail_registered_tills WHERE inventory_id=$1 AND active ORDER BY slot',[inventory])).rows.map(x=>x.slot);let slot=1;while(used.includes(slot))slot++;
   const tillId=uuid();await c.query('INSERT INTO retail_registered_tills(id,workspace_id,inventory_id,name,slot) VALUES($1,$2,$3,$4,$5)',[tillId,s.workspace_id,inventory,text(b.name,'Till name',80),slot]);await event(c,s,'till_registered',{till_id:tillId,slot});return {success:true,till_id:tillId};
  }
  if(b.action==='staff-assignment'){
   const staff=id(b.staff_id);if(!(await c.query('SELECT id FROM retail_team WHERE workspace_id=$1 AND id=$2',[s.workspace_id,staff])).rows.length)throw fail('Staff unavailable',404);if(typeof b.active!=='boolean'||typeof b.can_refund!=='boolean')throw fail('Choose assignment and refund permissions');
   const held=(await c.query('SELECT * FROM retail_drawer_assignments WHERE staff_id=$1 AND inventory_id=$2 FOR UPDATE',[staff,inventory])).rows;if(held.some(x=>x.transaction_id))throw fail('Finish or recover this staff member’s transaction before changing store access',409);for(const drawer of held)await drawers.unassign(c,s,drawer.till_id,drawer.assignment_id);
   if(b.can_manage!==undefined&&typeof b.can_manage!=='boolean')throw fail('Choose a management permission');const previous=(await c.query('SELECT can_manage FROM retail_staff_assignments WHERE staff_id=$1 AND inventory_id=$2',[staff,inventory])).rows[0];const canManage=b.can_manage??previous?.can_manage??false;await c.query('INSERT INTO retail_staff_assignments(staff_id,workspace_id,inventory_id,active,can_refund,can_manage) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(staff_id,inventory_id) DO UPDATE SET active=EXCLUDED.active,can_refund=EXCLUDED.can_refund,can_manage=EXCLUDED.can_manage',[staff,s.workspace_id,inventory,b.active,b.can_refund,canManage]);await c.query('UPDATE retail_pos_sessions SET revoked=true WHERE staff_id=$1 AND till_id IN(SELECT id FROM retail_registered_tills WHERE inventory_id=$2)',[staff,inventory]);await event(c,s,'staff_assignment_changed',{staff_id:staff,active:b.active,can_refund:b.can_refund,can_manage:canManage});return {success:true};
  }
  if(b.action==='store-settings'){
   const time=text(b.report_time||'17:00','Report time',5),zone=text(b.timezone||'Europe/London','Timezone',80);if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw fail('Choose a report time');try{new Intl.DateTimeFormat('en',{timeZone:zone}).format(now());}catch{throw fail('Choose a valid timezone');}
   const destination=text(b.email||'','Reorder email',254,true);if(destination&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destination))throw fail('Enter a valid email');
   if(b.reorder_email_enabled&&!a.features.reorder_emails)throw fail('An active Retail subscription is required for reorder emails',402);
   const receiptName=text(b.receipt_business_name||store.settings.receipt_business_name||store.name,'Receipt business name',160),address=String(b.receipt_business_address??store.settings.receipt_business_address??'').trim().replace(/\r\n?/g,'\n'),vatNumber=String(b.vat_number??store.settings.vat_number??'').toUpperCase().replace(/[\s-]/g,'');
   if(address.length>500||/[\x00-\x09\x0b-\x1f\x7f]/.test(address))throw fail('Enter a valid receipt address');if(vatNumber&&!/^(GB|XI)?(\d{9}|\d{12})$/.test(vatNumber))throw fail('Enter a valid UK VAT registration number');if(b.vat_receipts&&(!vatNumber||!address))throw fail('VAT receipts require the registered business address and VAT number');
   const receipt={receipt_business_name:receiptName,receipt_business_address:address,vat_number:vatNumber,vat_receipts:b.vat_receipts===true};const changed=Object.entries(receipt).some(([k,v])=>store.settings[k]!==v);
   await c.query('UPDATE retail_stores SET name=$2,settings=$3 WHERE inventory_id=$1',[inventory,text(b.name,'Store name'),JSON.stringify({...store.settings,...receipt,vat_version:Number(store.settings.vat_version||0)+(changed?1:0),report_time:time,timezone:zone,reorder_email_enabled:b.reorder_email_enabled===true,reorder_email_to:destination})]);await event(c,s,'store_settings_changed',{});return {success:true};
  }
  const t=(await c.query('SELECT * FROM retail_registered_tills WHERE workspace_id=$1 AND inventory_id=$2 AND id=$3 FOR UPDATE',[s.workspace_id,inventory,id(b.till_id)])).rows[0];if(!t)throw fail('Till unavailable',404);
  if(b.action==='unassign-drawer')return drawers.unassign(c,s,t.id,b.assignment_id);
  if(b.action==='pair-till'){
   if(!t.active||(!a.unlimited_tills&&t.slot>a.till_allowance))throw fail('Till inactive or outside your allowance',402);
   const code=crypto.randomBytes(10).toString('hex').toUpperCase();await c.query('UPDATE retail_registered_tills SET pair_hash=$2,pair_expires_at=$3 WHERE id=$1',[t.id,hash(code),new Date(now().getTime()+600000).toISOString()]);await event(c,s,'till_pair_code_created',{till_id:t.id});return {success:true,pair_code:code,expires_at:new Date(now().getTime()+600000).toISOString(),url:app()+'/retail/till/index.html'};
  }
  if(b.action==='deactivate-till'){
   await drawers.guardConnection(c,t.id,true);
   if((await c.query('SELECT id FROM retail_till_sessions WHERE registered_till_id=$1 AND closed_at IS NULL',[t.id])).rows.length)throw fail('Balance and close this till before deactivating it',409);
   await c.query('UPDATE retail_registered_tills SET active=false,device_hash=NULL,pair_hash=NULL,generation=generation+1 WHERE id=$1',[t.id]);await c.query('UPDATE retail_pos_sessions SET revoked=true WHERE till_id=$1',[t.id]);
  }else if(b.action==='save-till'){
   const hardware={};for(const k of ['printer_name','drawer_name','printing'])hardware[k]=text(b.hardware?.[k]||'',k,160,true);
   await c.query('UPDATE retail_registered_tills SET name=$2,hardware=$3 WHERE id=$1',[t.id,text(b.name,'Till name',80),JSON.stringify(hardware)]);
  }else if(['open-till','balance-till','cash-movement'].includes(b.action)){
   if(!t.active||(!a.unlimited_tills&&t.slot>a.till_allowance))throw fail('Till inactive or outside allowance',402);
   const settings=(await c.query('SELECT * FROM retail_settings WHERE workspace_id=$1',[s.workspace_id])).rows[0]||{};
   const ss={...s,settings:{...settings,...store.settings},registered_till_id:t.id,retail_access:a};
   const result=await ({'open-till':H.openTill,'balance-till':H.balance,'cash-movement':H.movement}[b.action])(c,ss,b);await event(c,s,b.action,{till_id:t.id,...result});return {success:true,...result};
  }else throw fail('Unknown store action');
  await event(c,s,b.action,{till_id:t.id});return {success:true};
 });}
 async function validateTill(c,s){const t=(await c.query('SELECT * FROM retail_registered_tills WHERE workspace_id=$1 AND inventory_id=$2 AND id=$3',[s.workspace_id,s.inventory_id,s.registered_till_id])).rows[0];if(!t||!t.active||!(s.retail_access||await access(c,s.workspace_id,s.inventory_id)).allowed)throw fail('This till is inactive or outside the store allowance',403);return t;}
 async function device(c,req){
  const h=String(req.headers.authorization||'');if(!/^Till [0-9a-f]{64}$/.test(h))throw fail('Pair this till device first',401);
  const t=(await c.query('SELECT t.*,s.enabled AS store_enabled,w.owner_user_id,w.name AS workspace_name,u.is_suspended FROM retail_registered_tills t JOIN retail_stores s ON s.inventory_id=t.inventory_id JOIN workspaces w ON w.id=t.workspace_id JOIN users u ON u.id=w.owner_user_id WHERE t.device_hash=$1',[hash(h.slice(5))])).rows[0];
  if(!t||!t.active||t.is_suspended)throw fail('Till access revoked. Ask the store owner to pair it again',401);if(!(await c.query('SELECT enabled FROM retail_settings WHERE workspace_id=$1',[t.workspace_id])).rows[0]?.enabled)throw fail('Retail mode is switched off for this workspace',403);
  const a=await access(c,t.workspace_id,t.inventory_id);if(!a.allowed||(!a.unlimited_tills&&t.slot>a.till_allowance))throw fail('This store or till is not licensed',402);
  const connection={connection_id:t.id,connection_generation:t.generation};
  const session=(await c.query('SELECT till_id FROM retail_pos_sessions WHERE token_hash=$1 AND connection_till_id=$2 AND connection_generation=$3',[hash(req.headers['x-retail-staff-token']||''),t.id,t.generation])).rows[0];
  if(session){const chosen=(await c.query('SELECT * FROM retail_registered_tills WHERE id=$1 AND inventory_id=$2',[session.till_id,t.inventory_id])).rows[0];if(!chosen?.active||(!a.unlimited_tills&&chosen.slot>a.till_allowance))throw fail('The selected drawer is no longer available',401);return {...t,...chosen,...connection,retail_access:a,drawer_selected:true};}
  return {...t,...connection,retail_access:a,drawer_selected:false};
 }
 async function staff(c,t,token){
  if(!/^[0-9a-f]{64}$/.test(String(token||'')))throw fail('Scan your staff QR or enter your number, then enter your PIN',401);
  const st=(await c.query('SELECT se.*,st.name,st.active,st.commission_bps,cr.staff_number,cr.version AS live_version,a.active AS assigned,a.can_refund,a.can_manage FROM retail_pos_sessions se JOIN retail_team st ON st.id=se.staff_id JOIN retail_staff_credentials cr ON cr.staff_id=se.staff_id JOIN retail_staff_assignments a ON a.staff_id=se.staff_id AND a.inventory_id=$3 AND a.workspace_id=$4 WHERE se.token_hash=$1 AND se.till_id=$2',[hash(token),t.id,t.inventory_id,t.workspace_id])).rows[0];
  if(!st||st.revoked||!st.active||!st.assigned||st.credential_version!==st.live_version||st.till_generation!==t.generation||Date.parse(st.expires_at)<=now().getTime())throw fail('Staff login expired or store access removed',401);
  await drawers.validate(c,t,st);return {id:st.staff_id,name:st.name,number:st.staff_number,commission_bps:st.commission_bps,can_refund:st.can_refund,can_manage:st.can_manage,token_hash:st.token_hash};
 }
 async function posScope(c,req,options={}){
  const t=await device(c,req),st=await staff(c,t,req.headers['x-retail-staff-token']);if(options.admin)throw fail('This till cannot access administration',403);
  const settings=(await c.query('SELECT * FROM retail_settings WHERE workspace_id=$1',[t.workspace_id])).rows[0]||{};
  const s={workspace_id:t.workspace_id,inventory_id:t.inventory_id,workspace_name:t.workspace_name,actor_id:t.owner_user_id,role:'cashier',registered_till_id:t.id,retail_access:t.retail_access,settings:{...settings,...t.retail_access.settings},pos_staff:st,staff_token:null,device_id:t.id};
  s.business=limitBusiness(await H.business.config(c,s),t.retail_access);s.counter=await H.operations.config(c,s);return s;
 }
 async function throttle(c,buckets){for(const key of buckets){const row=(await c.query('SELECT * FROM retail_pos_attempts WHERE bucket=$1',[key])).rows[0];if(row?.locked_until&&Date.parse(row.locked_until)>now().getTime())throw fail('Too many PIN attempts. Try again in 15 minutes',429);}}
 async function failedAttempt(c,buckets){for(const key of buckets){const row=(await c.query('SELECT * FROM retail_pos_attempts WHERE bucket=$1',[key])).rows[0],fresh=!row||now().getTime()-Date.parse(row.window_at)>=900000,n=fresh?1:row.attempts+1;await c.query('INSERT INTO retail_pos_attempts(bucket,attempts,window_at,locked_until) VALUES($1,$2,$3,$4) ON CONFLICT(bucket) DO UPDATE SET attempts=EXCLUDED.attempts,window_at=EXCLUDED.window_at,locked_until=EXCLUDED.locked_until',[key,n,fresh?stamp():row.window_at,n>=5?new Date(now().getTime()+900000).toISOString():null]);}}
 async function checkPin(c,t,b){
  const ident=String(b.staff_identifier||'').trim(),qr=/^IO-ST-[0-9a-f-]{36}$/i.test(ident),number=/^\d{1,10}$/.test(ident);
  const buckets=['device:'+t.id,'staff:'+t.workspace_id+':'+hash(ident)];await throttle(c,buckets);
  const rows=qr||number?(await c.query('SELECT cr.*,st.name,st.active,st.commission_bps,a.active AS assigned,a.can_refund,a.can_manage FROM retail_staff_credentials cr JOIN retail_team st ON st.id=cr.staff_id JOIN retail_staff_assignments a ON a.staff_id=st.id AND a.workspace_id=cr.workspace_id AND a.inventory_id=$2 WHERE cr.workspace_id=$1 AND '+(qr?'cr.qr_token=$3::uuid':'cr.staff_number=$3'),[t.workspace_id,t.inventory_id,qr?id(ident.slice(6)):ident])).rows:[];
  const cr=rows.length===1?rows[0]:null,pin=String(b.pin||''),actual=await scrypt(/^\d{4,8}$/.test(pin)?pin:'invalid',cr?.pin_salt||'inventoryos-pos-dummy-salt',32),expected=Buffer.from(cr?.pin_hash||'00'.repeat(32),'hex');
  if(!cr||!cr.active||!cr.assigned||!crypto.timingSafeEqual(actual,expected))return {invalid:true,buckets};
  return {cr,buckets};
 }
 async function pair(req){return connect(async c=>{
  const code=String(req.body?.code||'').replace(/\s/g,'').toUpperCase();if(!/^[0-9A-F]{20}$/.test(code))throw fail('Enter the pairing code from Till management',400);
  // Pairing uses a 80-bit, ten-minute, one-use secret, not a shop number/PIN.
  const t=(await c.query('SELECT * FROM retail_registered_tills WHERE pair_hash=$1',[hash(code)])).rows[0];if(!t||!t.active||Date.parse(t.pair_expires_at)<=now().getTime())throw fail('Pairing code expired or already used',403);await lock(c,t.workspace_id);
  if(!(await c.query('SELECT id FROM retail_registered_tills WHERE id=$1 AND active AND pair_hash=$2 AND pair_expires_at>$3 FOR UPDATE',[t.id,hash(code),stamp()])).rows.length)throw fail('Pairing code expired or already used',403);
  await drawers.guardConnection(c,t.id);
  const a=await access(c,t.workspace_id,t.inventory_id);if(!a.allowed||(!a.unlimited_tills&&t.slot>a.till_allowance))throw fail('Till is not licensed',402);
  const token=crypto.randomBytes(32).toString('hex');await c.query('UPDATE retail_registered_tills SET device_hash=$2,pair_hash=NULL,pair_expires_at=NULL,generation=generation+1,last_seen=$3 WHERE id=$1',[t.id,hash(token),stamp()]);await c.query('UPDATE retail_pos_sessions SET revoked=true WHERE till_id=$1',[t.id]);await event(c,{...t,actor_id:null},'device_paired',{till_id:t.id});return {success:true,device_token:token,till_id:t.id,till_name:t.name,inventory_id:t.inventory_id,drawer_flow:true};
 });}
 async function login(req){if(req.body?.drawer_flow!==true)throw fail('Refresh the Till app to choose and confirm your drawer',409);let denied=false;const result=await connect(async c=>{const t=await device(c,req);await lock(c,t.workspace_id);const checked=await checkPin(c,t,req.body||{});if(checked.invalid){await failedAttempt(c,checked.buckets);denied=true;return null;}
  const {cr}=checked;for(const key of checked.buckets)await c.query('DELETE FROM retail_pos_attempts WHERE bucket=$1',[key]);
  return drawers.prepare(c,t,cr);
 });if(denied)throw fail('Staff QR/number or PIN is incorrect, or this person is not assigned to this store',403);return result;}
 async function logout(req){return connect(async c=>{const t=await device(c,req);await lock(c,t.workspace_id);await drawers.logout(c,t,req.headers['x-retail-staff-token']);return {success:true};});}
 function authorizeAction(c,s,url){if(!s.pos_staff)throw fail('Staff session required',401);const suffix=String(url).replace(/^.*?\/retail-pos/,'').split('?')[0];if(!['/checkout','/customers','/park','/recall','/refund','/waste','/waste/start'].includes(suffix))throw fail('This till action is not allowed',403);}
 async function state(req){return connect(async c=>{const t=await device(c,req);let s=null;if(req.headers['x-retail-staff-token'])s=await posScope(c,req);
  const base={success:true,till:{id:t.id,name:t.name,hardware:t.hardware},store:{id:t.inventory_id,name:(await c.query('SELECT name FROM retail_stores WHERE inventory_id=$1',[t.inventory_id])).rows[0].name},entitlement:{plan:t.retail_access.plan,features:t.retail_access.features},server_now:stamp(),management_supported:true,waste_mode_supported:true,drawer_flow:true,drawer_selected:t.drawer_selected};if(!s)return {...base,locked:true};
  const products=(await c.query('SELECT id,name,barcode,price_pence,vat_treatment,vat_rate,stock_qty,item_kind,category,favourite,minimum_age FROM retail_products WHERE workspace_id=$1 AND inventory_id=$2 AND NOT archived ORDER BY name',args(s))).rows;
  const parked=(await c.query("SELECT id,label,cashier_name,created_at FROM retail_parked_sales WHERE workspace_id=$1 AND inventory_id=$2 AND status='parked' ORDER BY created_at DESC LIMIT 100",args(s))).rows;
  await c.query('UPDATE retail_registered_tills SET last_seen=$2 WHERE id=$1',[t.id,stamp()]);
  const till=await H.till(c,s),pricing=await H.business.pricing(c,s),cfg=s.business;
  const cardTotals=(await c.query("SELECT COALESCE(SUM(total_pence-deposit_applied_pence),0)::bigint total FROM retail_sales WHERE till_session_id=$1 AND payment_method='card'",[till?.id||null])).rows[0];
  const publicStaff={id:s.pos_staff.id,name:s.pos_staff.name,number:s.pos_staff.number,can_refund:s.pos_staff.can_refund,can_manage:s.pos_staff.can_manage};const receiptSettings=Object.fromEntries(['vat_version','vat_receipts','vat_number','receipt_business_name','receipt_business_address'].map(k=>[k,s.settings[k]]));
  return {...base,...await drawers.state(c,s),locked:false,staff:publicStaff,settings:receiptSettings,products:products.filter(p=>p.item_kind!=='service'||s.business.features.services),parked,pricing,business:{...cfg,features:cfg.features},cash_open:Boolean(till)};
 });}
 async function customers(req){return connect(async c=>{const s=await posScope(c,req);if(!s.retail_access.features.loyalty||!s.business.features.loyalty)throw fail('Customer loyalty requires active Retail access and Loyalty enabled',402);const q=text(req.query.query||'','Search',160,true),card=String(req.query.card||'');let customer=null;
  if(card){if(!/^IO-LC-[0-9a-f-]{36}$/i.test(card))throw fail('Scan an InventoryOS customer loyalty QR');customer=(await c.query('SELECT id,name,email,phone,stamps,card_token,active FROM retail_customers WHERE workspace_id=$1 AND inventory_id=$2 AND card_token=$3 AND active',[...args(s),id(card.slice(6))])).rows[0];if(!customer)throw fail('Loyalty account not found at this store',404);}
  if(req.query.id)customer=(await c.query('SELECT id,name,email,phone,stamps,card_token,active FROM retail_customers WHERE workspace_id=$1 AND inventory_id=$2 AND id=$3 AND active',[...args(s),id(req.query.id)])).rows[0];
  if(customer){const sales=(await c.query('SELECT id,reference,created_at,total_pence,payment_method,status,loyalty_snapshot FROM retail_sales WHERE workspace_id=$1 AND inventory_id=$2 AND customer_id=$3 ORDER BY created_at DESC LIMIT 100',[...args(s),customer.id])).rows;return {success:true,customer,sales};}
  return {success:true,customers:(await c.query('SELECT id,name,email,phone,stamps,card_token FROM retail_customers WHERE workspace_id=$1 AND inventory_id=$2 AND active AND (name ILIKE $3 OR email ILIKE $3 OR phone ILIKE $3 OR id::text=$4) ORDER BY name LIMIT 50',[...args(s),'%'+q+'%',q])).rows};
 });}
 async function refund(c,s,b,saleId){
  if(s.pos_staff&&!s.refund_approver)throw fail('Scan an authorised staff QR and enter that person’s PIN to approve the refund',403);
  const sale=(await c.query('SELECT * FROM retail_sales WHERE workspace_id=$1 AND inventory_id=$2 AND id=$3 FOR UPDATE',[...args(s),id(saleId)])).rows[0];if(!sale)throw fail('Sale not found in this store',404);
  if(!s.registered_till_id&&(b.return_till_id||sale.registered_till_id)){s={...s,registered_till_id:id(b.return_till_id||sale.registered_till_id)};await validateTill(c,s);}
  if(sale.payment_method==='card'){
   if(b.external_card_refund_confirmed!==true)throw fail('Refund the payment on the external reader, then confirm it here',409);
   if(b.exchange?.items?.length)throw fail('For a card return, record the refund and start a separate sale');
  }
  const r=await H.operations.returned(c,{...s,role:'admin',return_payment_method:sale.payment_method},b,saleId);
  await c.query('UPDATE retail_returns SET registered_till_id=$2,approved_by=$3,payment_method=$4 WHERE id=$1',[r.return_receipt.id,s.registered_till_id||null,s.refund_approver?JSON.stringify(s.refund_approver):null,sale.payment_method]);
  await event(c,s,'refund_approved',{sale_id:sale.id,return_id:r.return_receipt.id,processed_by:s.pos_staff?.id||null,approved_by:s.refund_approver?.id||s.actor_id,till_id:s.registered_till_id||null,payment_method:sale.payment_method});return r;
 }
 async function refundSale(req){return connect(async c=>{const s=await posScope(c,req);const byId=Boolean(req.query.id),q=byId?id(req.query.id):text(req.query.reference,'Sale reference',80);const sale=(await c.query('SELECT id,reference,total_pence,payment_method,created_at,status FROM retail_sales WHERE workspace_id=$1 AND inventory_id=$2 AND '+(byId?'id=$3::uuid':'reference=$3'),[...args(s),q])).rows[0];if(!sale)throw fail('Sale not found in this store',404);const items=(await c.query('SELECT product_id,name,qty,returned_qty,unit_price_pence FROM retail_sale_items WHERE sale_id=$1',[sale.id])).rows;return {success:true,sale:{...sale,items}};});}
 async function posRefund(req){
  // PIN validation is committed separately, so wrong PINs cannot disappear in a
  // refund transaction rollback. The plaintext PIN never enters retail_requests.
  let denied=false;const approval=await connect(async c=>{const t=await device(c,req);await lock(c,t.workspace_id);await posScope(c,req);const checked=await checkPin(c,t,req.body.approval||{});if(checked.invalid||!checked.cr?.can_refund){await failedAttempt(c,checked.buckets);denied=true;return null;}return {id:checked.cr.staff_id,name:checked.cr.name,number:checked.cr.staff_number,version:checked.cr.version};});
  if(denied)throw fail('Refund approval denied. Check the staff QR, PIN and store refund permission',403);
  const body={...req.body};delete body.approval;const safe={...req,headers:req.headers,originalUrl:req.originalUrl,query:req.query,body,retail_pos:true};
  return H.transaction(safe,async(c,s,b)=>{const row=(await c.query('SELECT st.active,cr.version,a.active AS assigned,a.can_refund,a.can_manage FROM retail_team st JOIN retail_staff_credentials cr ON cr.staff_id=st.id JOIN retail_staff_assignments a ON a.staff_id=st.id AND a.inventory_id=$2 WHERE st.id=$1 AND st.workspace_id=$3',[approval.id,s.inventory_id,s.workspace_id])).rows[0];if(!row?.active||!row.assigned||!row.can_refund||row.version!==approval.version)throw fail('Refund approval has expired',403);return refund(c,{...s,refund_approver:approval},b,b.sale_id);});
 }
 async function posWaste(req){
  if(Array.isArray(req.body.items))return waste.complete(req);
  let denied=false;const approval=await connect(async c=>{const t=await device(c,req);await lock(c,t.workspace_id);await posScope(c,req);const x=await checkPin(c,t,req.body.approval||{});if(x.invalid||!x.cr?.can_manage){await failedAttempt(c,x.buckets);denied=true;return null;}return {id:x.cr.staff_id,name:x.cr.name,number:x.cr.staff_number,version:x.cr.version};});
  if(denied)throw fail('Management approval denied. Check the staff code, PIN and store permission',403);
  const body={...req.body};delete body.approval;
  return H.transaction({...req,headers:req.headers,body,originalUrl:req.originalUrl,retail_pos:true},async(c,s,b)=>{
   const manager=(await c.query('SELECT st.active,cr.version,a.active AS assigned,a.can_manage FROM retail_team st JOIN retail_staff_credentials cr ON cr.staff_id=st.id JOIN retail_staff_assignments a ON a.staff_id=st.id AND a.inventory_id=$2 WHERE st.id=$1 AND st.workspace_id=$3',[approval.id,s.inventory_id,s.workspace_id])).rows[0];
   if(!manager?.active||!manager.assigned||!manager.can_manage||manager.version!==approval.version)throw fail('Management approval expired',403);
   if((await c.query('SELECT transaction_id FROM retail_drawer_assignments WHERE till_id=$1',[s.registered_till_id])).rows[0]?.transaction_id)throw fail('Finish, park or clear the transaction before writing off stock',409);
   if(!['expired','damaged'].includes(b.reason))throw fail('Choose Out of date or Damaged');
   await H.business.waste(c,{...s,waste_approver:approval},b);return {recorded:true};
  });
 }
 async function reconcile(req){
  if(req.body.payment_checked!==true)throw fail('Confirm that the actual payment was checked and resolved separately',409);
  let denied=false;const approver=await connect(async c=>{const t=await device(c,req);await lock(c,t.workspace_id);await posScope(c,req);const x=await checkPin(c,t,req.body.approval||{});if(x.invalid||!x.cr?.can_refund){await failedAttempt(c,x.buckets);denied=true;return null;}return {id:x.cr.staff_id,version:x.cr.version};});
  if(denied)throw fail('Manager PIN or store permission was not accepted',403);
  return connect(async c=>{const t=await device(c,req);await lock(c,t.workspace_id);const s=await posScope(c,req);const check=(await c.query('SELECT st.active,a.active AS assigned,a.can_refund,a.can_manage,cr.version FROM retail_team st JOIN retail_staff_assignments a ON a.staff_id=st.id AND a.inventory_id=$2 JOIN retail_staff_credentials cr ON cr.staff_id=st.id WHERE st.id=$1 AND st.workspace_id=$3',[approver.id,s.inventory_id,s.workspace_id])).rows[0];if(!check?.active||!check.assigned||!check.can_refund||check.version!==approver.version)throw fail('Manager approval expired',403);
   const request=id(req.body.request_id),old=(await c.query('SELECT * FROM retail_requests WHERE workspace_id=$1 AND request_id=$2',[s.workspace_id,request])).rows[0];
   if(old?.result?.sale){if(old.result.sale.inventory_id!==s.inventory_id||old.result.sale.registered_till_id!==s.registered_till_id)throw fail('Payment belongs to another till',403);await drawers.reconcile(c,s,request);return {success:true,sale:old.result.sale};}
   if(old?.result?.return_receipt){if(!(await c.query('SELECT id FROM retail_returns WHERE id=$1 AND workspace_id=$2 AND inventory_id=$3 AND registered_till_id=$4',[old.result.return_receipt.id,s.workspace_id,s.inventory_id,s.registered_till_id])).rows.length)throw fail('Refund belongs to another drawer',403);await drawers.reconcile(c,s,request);return {...old.result,success:true};}
   if(old&&!old.result?.reconciled)throw fail('That request was used for another action',409);
   if(!old)await c.query('INSERT INTO retail_requests(workspace_id,request_id,body_hash,result) VALUES($1,$2,$3,$4)',[s.workspace_id,request,'reconciled',JSON.stringify({success:true,reconciled:true})]);
   await drawers.reconcile(c,s,request);await event(c,s,'payment_recording_reconciled',{request_id:request,approved_by:approver.id,processed_by:s.pos_staff.id,till_id:s.registered_till_id,reason:text(req.body.reason,'Reconciliation reason',300)});return {success:true,reconciled:true};
  });
 }
 async function adminStores(req){return connect(async c=>{const user=id(req.params.id);if(!(await c.query('SELECT id FROM users WHERE id=$1',[user])).rows.length)throw fail('Account not found',404);const stores=(await c.query('SELECT s.* FROM retail_stores s JOIN workspaces w ON w.id=s.workspace_id WHERE w.owner_user_id=$1 ORDER BY s.name',[user])).rows;const history=(await c.query('SELECT e.* FROM retail_platform_events e JOIN workspaces w ON w.id=e.workspace_id WHERE w.owner_user_id=$1 AND e.kind IN(\'admin_retail_override\',\'admin_till_revoked\') ORDER BY e.created_at DESC LIMIT 50',[user])).rows;return {success:true,stores:stores.map(publicStore),history,features:FEATURES,server_now:stamp()};});}
 async function adminOverride(req){return connect(async c=>{const user=id(req.params.id),inventory=id(req.body.inventory_id);const row=(await c.query('SELECT s.* FROM retail_stores s JOIN workspaces w ON w.id=s.workspace_id WHERE w.owner_user_id=$1 AND s.inventory_id=$2 FOR UPDATE OF s',[user,inventory])).rows[0];if(!row)throw fail('Store not owned by this account',404);await lock(c,row.workspace_id);
  const s={workspace_id:row.workspace_id,inventory_id:inventory,actor_id:req.user.id},b=req.body;
  if(b.action==='revoke-till'){const r=await c.query('UPDATE retail_registered_tills SET device_hash=NULL,pair_hash=NULL,generation=generation+1 WHERE inventory_id=$1 AND id=$2',[inventory,id(b.till_id)]);if(!r.rowCount)throw fail('Till unavailable',404);await event(c,s,'admin_till_revoked',{till_id:b.till_id,reason:text(b.reason,'Reason',500)});return {success:true};}
  if(integer(b.version,'Override version')!==row.override_version)throw fail('Override changed. Reload the account',409);
  const plan=b.plan||null;if(plan&&!['blocked','retail',...LEGACY_PLANS].includes(plan))throw fail('Choose a Retail plan');const pairs=0,features=b.features||{};if(Array.isArray(features)||typeof features!=='object'||Object.entries(features).some(([k,v])=>!FEATURES.includes(k)||typeof v!=='boolean'))throw fail('Choose valid feature overrides');
  let expires=null;if(b.expires_at){if(!/(Z|[+-]\d\d:\d\d)$/.test(b.expires_at)||!Number.isFinite(Date.parse(b.expires_at))||Date.parse(b.expires_at)<=now().getTime())throw fail('Choose a future expiry with timezone');expires=new Date(b.expires_at).toISOString();}
  const reason=text(b.reason,'Override reason',500);await c.query('UPDATE retail_stores SET override_plan=$2,override_extra_pairs=$3,feature_overrides=$4,override_expires_at=$5,override_reason=$6,override_version=override_version+1 WHERE inventory_id=$1',[inventory,plan,pairs,JSON.stringify(features),expires,reason]);await event(c,s,'admin_retail_override',{before:{plan:row.override_plan,pairs:row.override_extra_pairs,features:row.feature_overrides,expires:row.override_expires_at},after:{plan,pairs,features,expires},reason});return {success:true,entitlement:await access(c,row.workspace_id,inventory)};
 });}
 async function billing(req){
  await H.ensureSchema();const c=await pool.connect();try{await c.query('BEGIN');const s=await H.scope(c,req,{inventory:false,admin:true,enabled:false,entitled:false});await lock(c,s.workspace_id);const b=req.body,inventory=id(b.inventory_id),row=(await c.query('SELECT * FROM retail_stores WHERE workspace_id=$1 AND inventory_id=$2 FOR UPDATE',[s.workspace_id,inventory])).rows[0];if(!row)throw fail('Store unavailable',404);const api=H.stripe||stripe();
   if(b.action==='portal'){
    if(!row.stripe_customer_id)throw fail('This store has no paid Retail subscription yet. Admin overrides do not create Stripe billing',409);
    const session=await api.billingPortal.sessions.create({customer:row.stripe_customer_id,...(process.env.STRIPE_RETAIL_PORTAL_CONFIGURATION?{configuration:process.env.STRIPE_RETAIL_PORTAL_CONFIGURATION}:{}),return_url:app()+'/retail/manage.html'});await c.query('COMMIT');return {success:true,url:session.url};
   }
   const plan='retail';if(b.plan&&b.plan!=='retail')throw fail('Choose InventoryOS Retail; the previous tiers are no longer sold');
   if(Number(b.pairs||0)!==0)throw fail('Extra till charges have been removed. All tills are included');
   const baseId=price('retail'),pairId=price('till_pair');if(!baseId)throw fail('Retail Stripe price is not configured. Set STRIPE_PRICE_RETAIL_MONTHLY to the £19.99 monthly GBP price',503);
   for(const [priceId,amount]of [[baseId,1999]]){const p=await api.prices.retrieve(priceId);if(p.currency!=='gbp'||p.unit_amount!==amount||p.recurring?.interval!=='month'||p.recurring?.interval_count!==1||!p.active)throw fail('Retail Stripe price must be active, monthly GBP at the agreed price',503);}
   const key=id(b.request_id);
   if(row.stripe_subscription_id){const previous=await api.subscriptions.retrieve(row.stripe_subscription_id);if(['canceled','incomplete_expired'].includes(previous.status)){await c.query('UPDATE retail_stores SET stripe_subscription_id=NULL WHERE inventory_id=$1',[inventory]);row.stripe_subscription_id=null;}}
   if(row.stripe_subscription_id){
    const sub=await api.subscriptions.retrieve(row.stripe_subscription_id);if(!['active','trialing'].includes(sub.status))throw fail('Resolve or cancel the existing subscription in Manage billing first',409);
    const base=sub.items.data.find(i=>[price('retail'),price('starter'),price('pro')].filter(Boolean).includes(i.price.id)),extra=sub.items.data.find(i=>i.price.id===pairId);if(!base||sub.items.data.length>(extra?2:1))throw fail('Subscription needs support review',409);
    const items=[{id:base.id,price:baseId,quantity:1},...(extra?[{id:extra.id,deleted:true}]:[])];
    await api.subscriptions.update(sub.id,{items,proration_behavior:'always_invoice',payment_behavior:'error_if_incomplete',metadata:{...sub.metadata,plan_key:plan}},{idempotencyKey:'retail-change/'+inventory+'/'+key});
    const fresh=await api.subscriptions.retrieve(sub.id);await syncSubscription(c,fresh);await c.query('COMMIT');return {success:true,updated:true};
   }
   if(row.checkout_session_id&&Date.parse(row.checkout_expires_at)>now().getTime()){const old=await api.checkout.sessions.retrieve(row.checkout_session_id);if(old.status==='open'&&old.metadata?.plan_key==='retail'){await c.query('COMMIT');return {success:true,url:old.url};}if(old.status==='open')await api.checkout.sessions.expire(old.id);if(old.status==='complete')throw fail('Payment is being confirmed. Refresh in a moment',409);}
   let customer=row.stripe_customer_id||(await c.query('SELECT stripe_customer_id FROM workspaces WHERE id=$1',[s.workspace_id])).rows[0]?.stripe_customer_id;
   if(!customer)customer=(await api.customers.create({email:req.user.email,name:req.user.name,metadata:{workspace_id:s.workspace_id}},{idempotencyKey:'retail-customer/'+s.workspace_id})).id;
   const metadata={product_type:'inventoryos_retail',workspace_id:s.workspace_id,inventory_id:inventory,plan_key:plan};
   const session=await api.checkout.sessions.create({mode:'subscription',customer,line_items:[{price:baseId,quantity:1},],metadata,subscription_data:{metadata},success_url:app()+'/retail/manage.html?retail_checkout=success',cancel_url:app()+'/retail/manage.html?retail_checkout=cancelled',automatic_tax:{enabled:false},expires_at:Math.floor(now().getTime()/1000)+1800},{idempotencyKey:'retail-checkout/'+inventory+'/'+key});
   await c.query('UPDATE retail_stores SET stripe_customer_id=$2,checkout_session_id=$3,checkout_expires_at=$4 WHERE inventory_id=$1',[inventory,customer,session.id,new Date(now().getTime()+1800000).toISOString()]);await c.query('COMMIT');return {success:true,url:session.url};
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }
 async function syncSubscription(c,sub){
  if(sub.metadata?.product_type!=='inventoryos_retail')return false;
  let inventory=id(sub.metadata.inventory_id),workspace=id(sub.metadata.workspace_id);
  const moved=(await c.query('SELECT inventory_id,workspace_id FROM retail_store_moves WHERE source_inventory_id=$1 AND source_workspace_id=$2',[inventory,workspace])).rows[0];if(moved){inventory=moved.inventory_id;workspace=moved.workspace_id;}await lock(c,workspace);
  const row=(await c.query('SELECT * FROM retail_stores WHERE inventory_id=$1 AND workspace_id=$2 FOR UPDATE',[inventory,workspace])).rows[0];if(!row)throw fail('Retail subscription has no matching store',409);
  if(row.stripe_subscription_id&&row.stripe_subscription_id!==sub.id){if(['canceled','incomplete_expired'].includes(sub.status))return true;throw fail('Another subscription is attached to this store',409);}
  if(row.stripe_customer_id&&row.stripe_customer_id!==String(sub.customer?.id||sub.customer))throw fail('Retail subscription customer mismatch',409);
  const base=sub.items.data.filter(i=>[price('retail'),price('starter'),price('pro')].filter(Boolean).includes(i.price.id)),extras=sub.items.data.filter(i=>i.price.id===price('till_pair'));
  if(base.length!==1||base[0].quantity!==1||extras.length>1||sub.items.data.length!==base.length+extras.length)throw fail('Retail subscription items do not match configured prices',409);
  const plan=base[0].price.id===price('retail')?'retail':base[0].price.id===price('pro')?'pro':'starter',pairs=integer(extras[0]?.quantity||0,'Till pairs',0,499),period=sub.current_period_end||base[0].current_period_end;
  await c.query('UPDATE retail_stores SET stripe_subscription_id=$2,stripe_customer_id=$3,stripe_status=$4,paid_plan=$5,paid_pairs=$6,period_end=$7,cancel_at_period_end=$8,checkout_session_id=NULL,checkout_expires_at=NULL WHERE inventory_id=$1',[inventory,sub.id,String(sub.customer?.id||sub.customer),sub.status,plan,pairs,period?new Date(period*1000).toISOString():null,Boolean(sub.cancel_at_period_end)]);
  await event(c,{workspace_id:workspace,inventory_id:inventory,actor_id:null},'stripe_retail_synced',{subscription_id:sub.id,status:sub.status,plan,pairs});return true;
 }
 async function webhook(event,api){
  let object=event.data.object,subId=null;
  if(event.type==='checkout.session.completed'){
   if(object.metadata?.product_type!=='inventoryos_retail')return false;subId=object.subscription;
  }else if(event.type.startsWith('customer.subscription.')){
   if(object.metadata?.product_type!=='inventoryos_retail')return false;subId=object.id;
  }else if(event.type.startsWith('invoice.')){
   subId=object.subscription||object.parent?.subscription_details?.subscription;if(!subId)return false;
   const sub=await api.subscriptions.retrieve(String(subId?.id||subId));if(sub.metadata?.product_type!=='inventoryos_retail')return false;object=sub;
  }else return false;
  if(!subId)throw fail('Retail webhook has no subscription',409);
  // Retrieve current Stripe state: delayed events cannot restore a canceled plan.
  const current=await api.subscriptions.retrieve(String(subId?.id||subId));await connect(c=>syncSubscription(c,current));return true;
 }
 async function tick(){
  if(!process.env.RESEND_API_KEY&&!H.sendEmail)return;
  await H.ensureSchema();const rows=(await pool.query('SELECT s.*,w.owner_user_id,u.email FROM retail_stores s JOIN workspaces w ON w.id=s.workspace_id JOIN users u ON u.id=w.owner_user_id JOIN retail_settings mode ON mode.workspace_id=s.workspace_id AND mode.enabled WHERE s.enabled AND NOT u.is_suspended')).rows;
  for(const row of rows){const a=entitlement(row),settings=row.settings||{};if(!a.features.reorder_emails||!settings.reorder_email_enabled)continue;
   const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:settings.timezone||'Europe/London',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now()).map(p=>[p.type,p.value]));const day=parts.year+'-'+parts.month+'-'+parts.day;if(parts.hour+':'+parts.minute<(settings.report_time||'17:00'))continue;
   await connect(async c=>{await lock(c,row.workspace_id);const live=await access(c,row.workspace_id,row.inventory_id);if(!live.features.reorder_emails)return;const items=await H.reorders(c,{workspace_id:row.workspace_id,inventory_id:row.inventory_id});if(items.some(i=>i.order_qty>0))await c.query('INSERT INTO retail_reorder_emails(inventory_id,report_date,items,idempotency_key,queued_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',[row.inventory_id,day,JSON.stringify(items.filter(i=>i.order_qty>0).map(i=>({name:i.name,order_qty:i.order_qty,supplier:i.supplier,supplier_url:i.supplier_url}))), 'retail-reorders/'+row.inventory_id+'/'+day,stamp()]);});
  }
  const jobs=(await pool.query("SELECT j.*,s.workspace_id,s.name,s.settings,w.owner_user_id,u.email FROM retail_reorder_emails j JOIN retail_stores s ON s.inventory_id=j.inventory_id JOIN workspaces w ON w.id=s.workspace_id JOIN users u ON u.id=w.owner_user_id JOIN retail_settings mode ON mode.workspace_id=s.workspace_id AND mode.enabled WHERE j.status='pending' AND j.attempts<8 AND j.queued_at>$1::timestamptz-interval '23 hours' AND NOT u.is_suspended AND j.next_attempt<=$1 ORDER BY j.report_date LIMIT 20",[stamp()])).rows;
  for(const job of jobs){await connect(async c=>{await c.query("SELECT pg_advisory_xact_lock(hashtextextended('retail-email:'||$1,0))",[job.inventory_id]);const live=(await c.query('SELECT * FROM retail_stores WHERE inventory_id=$1',[job.inventory_id])).rows[0],a=entitlement(live),state=(await c.query('SELECT * FROM retail_reorder_emails WHERE inventory_id=$1 AND report_date=$2 FOR UPDATE',[job.inventory_id,job.report_date])).rows[0];if(state.status!=='pending'||!a.features.reorder_emails||!live.settings.reorder_email_enabled)return;
   try{const send=H.sendEmail||require('./email').sendEmail;let timeout;try{await Promise.race([send({to:live.settings.reorder_email_to||job.email,subject:job.name+' — stock to reorder',html:'<h1>'+esc(job.name)+'</h1><p>Items to reorder:</p><ul>'+job.items.map(i=>'<li>'+esc(i.name)+' — '+i.order_qty+' to order'+(i.supplier?' · '+esc(i.supplier):'')+(i.supplier_url?' · <a href="'+esc(i.supplier_url)+'">Order product</a>':'')+'</li>').join('')+'</ul>',idempotencyKey:job.idempotency_key}),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('Email send timed out')),20000);})]);}finally{clearTimeout(timeout);}await c.query("UPDATE retail_reorder_emails SET status='sent' WHERE inventory_id=$1 AND report_date=$2",[job.inventory_id,job.report_date]);}catch(e){await c.query("UPDATE retail_reorder_emails SET attempts=attempts+1,next_attempt=$3 WHERE inventory_id=$1 AND report_date=$2",[job.inventory_id,job.report_date,new Date(now().getTime()+300000).toISOString()]);}
  });}
 }
 const waste=require('./retailWaste').createWaste({...H,connect,device,lock,posScope,checkPin,failedAttempt});
 const drawers=require('./retailDrawers').createDrawers({...H,connect,device,lock,access,event,posScope});
 return {locations,drawers,access,entitlement,limitBusiness,management,ownerChange,validateTill,posScope,pair,login,logout,state,customers,refund,refundSale,posRefund,posWaste,startWaste:waste.start,reconcile,authorizeAction,adminStores,adminOverride,billing,webhook,tick,features:FEATURES};
}
module.exports={createPlatform,PLANS,PRO_FEATURES,BASE_FEATURES};
