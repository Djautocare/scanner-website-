'use strict';
const crypto=require('node:crypto');
const Pricing=require('./retailPricing');
const FEATURES=['services','appointments','staff','packs','offers','preorders','loyalty','reductions','profit','display'];
const PRESETS={
 general:['packs','offers','preorders','loyalty','profit','display'],
 corner_shop:['packs','offers','preorders','loyalty','reductions','profit','display'],
 barber:['services','appointments','staff','preorders','loyalty','profit','display'],
 bakery:['packs','offers','preorders','loyalty','reductions','profit','display']
};
const defaults=()=>({business_type:'general',features:Object.fromEntries(FEATURES.map(k=>[k,false])),loyalty_target:9,loyalty_minimum_pence:100,loyalty_reward_product_id:null,reminder_hours:24,version:0});
const escape=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function createBusiness(H){
 const {pool,now,args,id,fail,text,integer,money,timestamp,product,stock,till,cash,audit,vatSnapshot}=H;
 const uuid=()=>crypto.randomUUID();
 const admin=s=>{if(!['owner','admin'].includes(s.role))throw fail('The workspace owner or an admin must do this',403);};
 const feature=(s,k)=>{if(!s.business?.features[k])throw fail('Enable '+k+' in Retail settings for this inventory first',409);};
 const email=v=>{const e=text(v,'Email address',254,true);if(e&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))throw fail('Enter a valid email address');return e;};
 const contact=b=>({name:text(b.customer_name,'Customer name'),email:email(b.email),phone:text(b.phone,'Phone',80,true)});
 const version=(b,old)=>{if(integer(b.version,'Record version',0,2147483647)!==old.version)throw fail('This record changed. Refresh and review it before saving',409);};
 async function record(c,s,table,recordId){
  if(!['retail_team','retail_customers','retail_bookings','retail_offers','retail_reductions','retail_preorders','retail_deposits'].includes(table))throw fail('Invalid record');
  const r=(await c.query(`SELECT * FROM ${table} WHERE workspace_id=$1 AND inventory_id=$2 AND id=$3 FOR UPDATE`,[...args(s),id(recordId)])).rows[0];
  if(!r)throw fail('Record not found in this inventory',404);return r;
 }
 async function config(c,s){const r=(await c.query('SELECT * FROM retail_business_settings WHERE workspace_id=$1 AND inventory_id=$2',args(s))).rows[0];return {...defaults(),...r,features:{...defaults().features,...r?.features}};}
 async function saveSettings(c,s,b){
  admin(s);const old=await config(c,s);version(b,old);
  if(!Object.hasOwn(PRESETS,b.business_type))throw fail('Choose a valid business type');
  if(!b.features||typeof b.features!=='object'||Array.isArray(b.features)||Object.keys(b.features).some(k=>!FEATURES.includes(k))||FEATURES.some(k=>typeof b.features[k]!=='boolean'))throw fail('Choose whether each Retail tool is enabled');
  if(b.features.appointments&&!b.features.services)throw fail('Appointments need Services enabled');
  if(s.retail_access)for(const k of ['offers','loyalty','appointments','preorders','display','reminders','staff'])if(b.features[k]&&!s.retail_access.features[k])throw fail('Retail Pro is required for '+k,402);
  const reward=b.loyalty_reward_product_id?id(b.loyalty_reward_product_id):null;
  if(reward){const p=await product(c,s,reward);if(p.archived)throw fail('Choose an active loyalty reward product or service');if(p.item_kind==='service'&&!b.features.services)throw fail('Enable Services before choosing a service reward');}
  const target=integer(b.loyalty_target,'Stamps for a reward',1,100),minimum=money(b.loyalty_minimum,'Minimum loyalty spend'),hours=integer(b.reminder_hours,'Reminder hours',1,72);
  const r=(await c.query('INSERT INTO retail_business_settings(workspace_id,inventory_id,business_type,features,loyalty_target,loyalty_minimum_pence,loyalty_reward_product_id,reminder_hours,version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,1) ON CONFLICT(workspace_id,inventory_id) DO UPDATE SET business_type=EXCLUDED.business_type,features=EXCLUDED.features,loyalty_target=EXCLUDED.loyalty_target,loyalty_minimum_pence=EXCLUDED.loyalty_minimum_pence,loyalty_reward_product_id=EXCLUDED.loyalty_reward_product_id,reminder_hours=EXCLUDED.reminder_hours,version=retail_business_settings.version+1,updated_at=now() RETURNING *',[...args(s),b.business_type,JSON.stringify(b.features),target,minimum,reward,hours])).rows[0];
  await audit(c,s,'business_settings_changed',{business_type:b.business_type,features:b.features});return {business_settings:r};
 }
 async function manufacturingAllowed(c,s){
  const schema=(await c.query("SELECT to_regclass('manufacturing_recipes') AS recipes,to_regclass('manufacturing_settings') AS settings")).rows[0];if(!schema?.recipes||!schema?.settings)return false;
  const w=(await c.query('SELECT w.*,u.admin_plan_override FROM workspaces w JOIN users u ON u.id=w.owner_user_id WHERE w.id=$1',[s.workspace_id])).rows[0];
  return H.calculateAccess(w,'business').allowed&&Boolean((await c.query('SELECT enabled FROM manufacturing_settings WHERE workspace_id=$1',[s.workspace_id])).rows[0]?.enabled);
 }
 async function productMeta(c,s,b,p){
  const kind=b.item_kind??p.item_kind??'product';if(!['product','service'].includes(kind))throw fail('Choose Product or Service');
  if(kind!==p.item_kind&&p.item_kind)throw fail('Product/service type cannot be changed after creation. Archive it and create the other type instead',409);
  if(kind==='service'&&!s.business.features.services)throw fail('Enable Services in Retail settings first',409);
  if(kind==='service'&&(p.stock_qty||Number(b.opening_qty||0)))throw fail('Services do not hold stock');
  const duration=integer(b.duration_minutes??p.duration_minutes??30,'Service duration',1,1440),pack=integer(b.pack_size??p.pack_size??1,'Units per case',1);
  if(pack!==1&&!s.business.features.packs&&pack!==p.pack_size)throw fail('Enable case-to-unit stock first');
  const recipe=b.manufacturing_recipe_id===undefined?p.manufacturing_recipe_id:b.manufacturing_recipe_id||null;
  if(recipe&&recipe!==p.manufacturing_recipe_id){if(!await manufacturingAllowed(c,s))throw fail('A linked recipe requires active Business Manufacturing in this inventory',402);const r=(await c.query('SELECT id FROM manufacturing_recipes WHERE workspace_id=$1 AND inventory_id=$2 AND id=$3 AND NOT archived',[...args(s),id(recipe)])).rows[0];if(!r)throw fail('Choose an active recipe from this inventory');}
  return (await c.query('UPDATE retail_products SET item_kind=$4,duration_minutes=$5,pack_size=$6,manufacturing_recipe_id=$7,minimum_qty=CASE WHEN $4=\'service\' THEN 0 ELSE minimum_qty END,target_qty=CASE WHEN $4=\'service\' THEN 0 ELSE target_qty END WHERE workspace_id=$1 AND inventory_id=$2 AND id=$3 RETURNING *',[...args(s),p.id,kind,duration,kind==='service'?1:pack,kind==='product'?recipe:null])).rows[0];
 }
 async function archiveCheck(c,s,p){
  const bookings=(await c.query("SELECT id FROM retail_bookings WHERE workspace_id=$1 AND inventory_id=$2 AND product_id=$3 AND status IN('booked','waiting','in_progress') LIMIT 1",[...args(s),p.id])).rows;
  const orders=(await c.query("SELECT li.id FROM retail_preorder_items li JOIN retail_preorders o ON o.id=li.preorder_id WHERE o.workspace_id=$1 AND o.inventory_id=$2 AND li.product_id=$3 AND o.status NOT IN('collected','cancelled') LIMIT 1",[...args(s),p.id])).rows;
  if(bookings.length||orders.length)throw fail('Complete or cancel the active bookings/preorders for this item before archiving',409);
 }
 function receiveQuantity(s,p,b){
  if(p.item_kind==='service')throw fail('Services do not receive stock');
  let qty=integer(b.qty,'Quantity received',1),cost=null;
  if(b.received_as==='cases'){feature(s,'packs');qty=integer(qty*p.pack_size,'Units received',1);if(b.case_cost!==undefined&&b.case_cost!=='')cost=Math.round(money(b.case_cost,'Cost per case')/p.pack_size);}
  return {qty,cost,description:b.received_as==='cases'?`${b.qty} case(s) × ${p.pack_size} units; `:''};
 }
 async function saveStaff(c,s,b,staffId){
  feature(s,'staff');admin(s);const name=text(b.name,'Staff name'),bps=integer(Math.round(Number(b.commission_percent)*100),'Commission percentage',0,10000);if(!/^\d{1,3}(\.\d{1,2})?$/.test(String(b.commission_percent)))throw fail('Commission must be a percentage with at most 2 decimal places');
  if(staffId){const old=await record(c,s,'retail_team',staffId);version(b,old);if(typeof b.active!=='boolean')throw fail('Choose whether this staff member is active');return {staff:(await c.query('UPDATE retail_team SET name=$4,commission_bps=$5,active=$6,version=version+1 WHERE workspace_id=$1 AND inventory_id=$2 AND id=$3 RETURNING *',[...args(s),old.id,name,bps,b.active])).rows[0]};}
  const staff=(await c.query('INSERT INTO retail_team(id,workspace_id,inventory_id,name,commission_bps) VALUES($1,$2,$3,$4,$5) RETURNING *',[uuid(),...args(s),name,bps])).rows[0];await audit(c,s,'staff_created',{staff_id:staff.id});return {staff};
 }
 async function saveCustomer(c,s,b,customerId){
  if(!['loyalty','appointments','preorders'].some(k=>s.business.features[k]))throw fail('Enable Loyalty, Appointments or Preorders first',409);
  if(customerId){const old=await record(c,s,'retail_customers',customerId);version(b,old);if(b.anonymise){admin(s);await c.query("UPDATE retail_customers SET name='Removed customer',email='',phone='',active=false,card_token=$4,version=version+1 WHERE workspace_id=$1 AND inventory_id=$2 AND id=$3",[...args(s),old.id,uuid()]);return {};}
   return {customer:(await c.query('UPDATE retail_customers SET name=$4,email=$5,phone=$6,version=version+1 WHERE workspace_id=$1 AND inventory_id=$2 AND id=$3 RETURNING *',[...args(s),old.id,text(b.name,'Customer name'),email(b.email),text(b.phone,'Phone',80,true)])).rows[0]};}
  const customer=(await c.query('INSERT INTO retail_customers(id,workspace_id,inventory_id,name,email,phone,card_token) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[uuid(),...args(s),text(b.name,'Customer name'),email(b.email),text(b.phone,'Phone',80,true),uuid()])).rows[0];return {customer};
 }
 async function customerSearch(req){await H.ensureSchema();const s=await H.scope(pool,req);if(s.role==='viewer')throw fail('A cashier account is required',403);if(!['loyalty','appointments','preorders'].some(k=>s.business.features[k]))throw fail('Enable a customer tool first',409);const q=text(req.query.query,'Customer search',160,true);return {success:true,customers:(await pool.query('SELECT * FROM retail_customers WHERE workspace_id=$1 AND inventory_id=$2 AND (name ILIKE $3 OR email ILIKE $3 OR phone ILIKE $3) ORDER BY active DESC,name LIMIT 200',[...args(s),'%'+q+'%'])).rows};}
 async function customerCard(req){await H.ensureSchema();const s=await H.scope(pool,req);feature(s,'loyalty');if(s.role==='viewer')throw fail('A cashier account is required',403);const token=String(req.params.token||'').replace(/^IO-LC-/i,'');const customer=(await pool.query('SELECT * FROM retail_customers WHERE workspace_id=$1 AND inventory_id=$2 AND card_token=$3 AND active',[...args(s),id(token)])).rows[0];if(!customer)throw fail('This loyalty card is not active in this inventory',404);return {success:true,customer};}
 async function parentCustomer(c,s,b){if(b.customer_id){const p=await record(c,s,'retail_customers',b.customer_id);if(!p.active)throw fail('This customer is archived');return p.id;}return null;}
 async function staffAvailable(c,s,staffId,start,end,exclude=null){
  if(staffId){feature(s,'staff');const p=await record(c,s,'retail_team',staffId);if(!p.active)throw fail('Choose an active staff member');}
  const clash=(await c.query("SELECT id FROM retail_bookings WHERE workspace_id=$1 AND inventory_id=$2 AND staff_id IS NOT DISTINCT FROM $3::uuid AND id IS DISTINCT FROM $6::uuid AND status IN('booked','in_progress') AND starts_at<$5 AND ends_at>$4 LIMIT 1",[...args(s),staffId,start,end,exclude])).rows[0];
  if(clash)throw fail('This staff member already has a booking in that time. Choose another time or staff member',409);
 }
 async function saveBooking(c,s,b,bookingId){
  feature(s,'appointments');const old=bookingId?await record(c,s,'retail_bookings',bookingId):null;if(old){version(b,old);if(['completed','cancelled','no_show'].includes(old.status))throw fail('This booking is closed');}
  const p=await product(c,s,b.product_id);if(p.archived||p.item_kind!=='service')throw fail('Choose an active service');
  const walk=b.walk_in===true,starts=walk?null:timestamp(b.starts_at);if(!walk&&!starts)throw fail('Choose the appointment time');
  const ends=starts?new Date(Date.parse(starts)+p.duration_minutes*60000).toISOString():null,staffId=b.staff_id?id(b.staff_id):null;
  if(starts)await staffAvailable(c,s,staffId,starts,ends,old?.id);else if(staffId){const st=await record(c,s,'retail_team',staffId);if(!st.active)throw fail('Choose active staff');}
  const x=contact(b),customer=await parentCustomer(c,s,b);if(typeof b.email_reminder!=='boolean')throw fail('Choose whether the customer requested an email reminder');if(b.email_reminder&&s.retail_access?.features.reminders===false)throw fail('Appointment email reminders are disabled for this store',402);if(b.email_reminder&&(!x.email||walk))throw fail('Appointment email reminders need an email address and a booked time');
  const due=b.email_reminder?new Date(Date.parse(starts)-s.business.reminder_hours*3600000).toISOString():null,recordId=old?.id||uuid();
  if(old){await c.query('UPDATE retail_bookings SET product_id=$4,staff_id=$5,customer_id=$6,customer_name=$7,email=$8,phone=$9,starts_at=$10,ends_at=$11,duration_minutes=$12,status=$13,email_reminder=$14,reminder_due_at=$15,note=$16,unit_price_pence=$17,version=version+1 WHERE workspace_id=$1 AND inventory_id=$2 AND id=$3',[...args(s),recordId,p.id,staffId,customer,x.name,x.email,x.phone,starts,ends,p.duration_minutes,walk?'waiting':'booked',b.email_reminder,due,text(b.note,'Booking note',500,true),old.product_id===p.id?old.unit_price_pence:p.price_pence]);}
  else await c.query('INSERT INTO retail_bookings(id,workspace_id,inventory_id,product_id,staff_id,customer_id,customer_name,email,phone,starts_at,ends_at,duration_minutes,status,email_reminder,reminder_due_at,note,actor_id,unit_price_pence) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)',[recordId,...args(s),p.id,staffId,customer,x.name,x.email,x.phone,starts,ends,p.duration_minutes,walk?'waiting':'booked',b.email_reminder,due,text(b.note,'Booking note',500,true),s.actor_id,p.price_pence]);
  await audit(c,s,'booking_saved',{booking_id:recordId});return {booking:await record(c,s,'retail_bookings',recordId)};
 }
 async function bookingStatus(c,s,b,bookingId){
  feature(s,'appointments');const old=await record(c,s,'retail_bookings',bookingId);version(b,old);if(!['booked','waiting','in_progress'].includes(old.status)||!['in_progress','cancelled','no_show'].includes(b.status))throw fail('This booking status cannot be changed. Complete it through checkout',409);
  let start=old.starts_at,end=old.ends_at;if(b.status==='in_progress'){start=now().toISOString();end=new Date(now().getTime()+old.duration_minutes*60000).toISOString();await staffAvailable(c,s,old.staff_id,start,end,old.id);}
  await c.query('UPDATE retail_bookings SET status=$4,starts_at=$5,ends_at=$6,version=version+1 WHERE workspace_id=$1 AND inventory_id=$2 AND id=$3',[...args(s),old.id,b.status,start,end]);await audit(c,s,'booking_status',{booking_id:old.id,status:b.status});return {};
 }
 async function saveOffer(c,s,b,offerId){
  feature(s,'offers');admin(s);if(!['percent','multi_buy','meal_deal'].includes(b.kind))throw fail('Choose an offer type');
  const old=offerId?await record(c,s,'retail_offers',offerId):null;if(old)version(b,old);if(b.active&&(!old||!old.active)){const n=Number((await c.query('SELECT COUNT(*)::text AS n FROM retail_offers WHERE workspace_id=$1 AND inventory_id=$2 AND active',args(s))).rows[0].n);if(n>=100)throw fail('Disable an existing offer before adding more than 100 active offers');}
  let rule;const r=b.rule||{};
  if(b.kind==='percent'){if(!Array.isArray(r.product_ids)||!r.product_ids.length||r.product_ids.length>100)throw fail('Choose 1 to 100 products');rule={product_ids:[...new Set(r.product_ids.map(id))],percent:integer(r.percent,'Discount percentage',1,100)};}
  if(b.kind==='multi_buy')rule={product_id:id(r.product_id),buy_qty:integer(r.buy_qty,'Units in offer',2,1000),bundle_price_pence:money(r.bundle_price,'Bundle price')};
  if(b.kind==='meal_deal'){if(!Array.isArray(r.groups)||r.groups.length<2||r.groups.length>5||r.groups.some(g=>!Array.isArray(g)||!g.length||g.length>100))throw fail('Add 2 to 5 non-empty choice groups');const ids=r.groups.flat().map(id);if(ids.length>100)throw fail('Choose at most 100 products across the meal deal groups');if(new Set(ids).size!==ids.length)throw fail('A product may appear in only one choice group in this meal deal');rule={groups:r.groups.map(g=>g.map(id)),bundle_price_pence:money(r.bundle_price,'Meal deal price')};}
  for(const pid of rule.product_ids||rule.groups?.flat()||[rule.product_id]){const p=await product(c,s,pid);if(p.archived)throw fail('Choose active items for the offer');}
  const start=timestamp(b.starts_at),end=timestamp(b.ends_at);if(start&&end&&Date.parse(end)<=Date.parse(start))throw fail('Offer end must be after its start');if(typeof b.active!=='boolean')throw fail('Choose whether the offer is active');const priority=integer(b.priority??0,'Offer priority',0,1000),recordId=old?.id||uuid();
  if(old)await c.query('UPDATE retail_offers SET name=$4,kind=$5,rule=$6,starts_at=$7,ends_at=$8,active=$9,priority=$10,version=version+1 WHERE workspace_id=$1 AND inventory_id=$2 AND id=$3',[...args(s),recordId,text(b.name,'Offer name'),b.kind,JSON.stringify(rule),start,end,b.active,priority]);
  else await c.query('INSERT INTO retail_offers(id,workspace_id,inventory_id,name,kind,rule,starts_at,ends_at,active,priority) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[recordId,...args(s),text(b.name,'Offer name'),b.kind,JSON.stringify(rule),start,end,b.active,priority]);
  await audit(c,s,'offer_saved',{offer_id:recordId});return {};
 }
 async function saveReduction(c,s,b,reductionId){
  feature(s,'reductions');admin(s);const old=reductionId?await record(c,s,'retail_reductions',reductionId):null;if(old)version(b,old);const p=await product(c,s,b.product_id);if(p.archived||p.item_kind==='service')throw fail('Choose an active stock product');const price=money(b.price,'Reduced selling price');if(price>=p.price_pence)throw fail('Reduced price must be below the normal selling price');const start=timestamp(b.starts_at),end=timestamp(b.ends_at);if(!start||!end||Date.parse(end)<=Date.parse(start))throw fail('Choose a start and a later end time');if(typeof b.active!=='boolean')throw fail('Choose whether the reduction is active');
  if(old)await c.query('UPDATE retail_reductions SET product_id=$4,reduced_price_pence=$5,starts_at=$6,ends_at=$7,active=$8,version=version+1 WHERE workspace_id=$1 AND inventory_id=$2 AND id=$3',[...args(s),old.id,p.id,price,start,end,b.active]);
  else await c.query('INSERT INTO retail_reductions(id,workspace_id,inventory_id,product_id,reduced_price_pence,starts_at,ends_at,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[uuid(),...args(s),p.id,price,start,end,b.active]);return {};
 }
 async function waste(c,s,b){if(!s.waste_approver)feature(s,'reductions');const p=await product(c,s,b.product_id);if(p.item_kind==='service'||p.archived)throw fail('Choose an active stock product');const qty=integer(b.qty,'Wasted quantity',1,Math.max(0,p.stock_qty));if(!['expired','damaged','unsold','other'].includes(b.reason))throw fail('Choose a waste reason');const note=text(b.note,'Waste note',500,true),recordId=uuid();await c.query('INSERT INTO retail_waste(id,workspace_id,inventory_id,product_id,name,qty,unit_cost_pence,reason,note,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[recordId,...args(s),p.id,p.name,qty,p.cost_pence,b.reason,note,s.actor_id]);await c.query('UPDATE retail_waste SET staff_snapshot=$2,approved_by=$3,registered_till_id=$4 WHERE id=$1',[recordId,s.pos_staff?JSON.stringify({id:s.pos_staff.id,name:s.pos_staff.name,number:s.pos_staff.number}):null,s.waste_approver?JSON.stringify(s.waste_approver):null,s.registered_till_id||null]);return {product:await stock(c,s,p,-qty,'waste',recordId,b.reason+(note?': '+note:''))};}
 async function preorder(c,s,b,orderId){
  feature(s,'preorders');const old=orderId?await record(c,s,'retail_preorders',orderId):null;if(old){version(b,old);if(old.status!=='ordered')throw fail('Only an unstarted preorder can be edited',409);if((await held(c,s,'preorder',old.id)).length)throw fail('Refund held deposits before changing an order',409);}
  const x=contact(b),customer=await parentCustomer(c,s,b),at=timestamp(b.collection_at);if(!at)throw fail('Choose a collection date and time');if(!['stock','make'].includes(b.fulfilment))throw fail('Choose stock reservation or production');
  if(!Array.isArray(b.items)||!b.items.length||b.items.length>100)throw fail('Choose 1 to 100 products');const lines=[],seen=new Set();let total=0;
  for(const input of b.items){const p=await product(c,s,input.product_id);if(p.archived||p.item_kind==='service'||seen.has(p.id))throw fail('Choose each active stock product once');seen.add(p.id);const qty=integer(input.qty,'Order quantity',1);total+=qty*p.price_pence;integer(total,'Order total',0,100000000);lines.push({p,qty});}
  if(b.fulfilment==='stock'){const reserved=await reservations(c,s);for(const {p,qty} of lines){const own=old?(await c.query('SELECT qty FROM retail_preorder_items WHERE preorder_id=$1 AND product_id=$2',[old.id,p.id])).rows[0]?.qty||0:0;const used=Number(reserved.find(r=>r.product_id===p.id)?.reserved_qty||0)-own;if(p.stock_qty-used<qty)throw fail('Not enough unreserved stock for '+p.name+'. Choose Make to order or reduce the quantity',409);}}
  const recordId=old?.id||uuid();
  if(old){await c.query('UPDATE retail_preorders SET customer_id=$4,customer_name=$5,email=$6,phone=$7,collection_at=$8,fulfilment=$9,note=$10,version=version+1 WHERE workspace_id=$1 AND inventory_id=$2 AND id=$3',[...args(s),recordId,customer,x.name,x.email,x.phone,at,b.fulfilment,text(b.note,'Order note',500,true)]);await c.query('DELETE FROM retail_preorder_items WHERE preorder_id=$1',[recordId]);}
  else await c.query('INSERT INTO retail_preorders(id,workspace_id,inventory_id,customer_id,customer_name,email,phone,collection_at,fulfilment,note,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[recordId,...args(s),customer,x.name,x.email,x.phone,at,b.fulfilment,text(b.note,'Order note',500,true),s.actor_id]);
  for(const {p,qty} of lines)await c.query('INSERT INTO retail_preorder_items(id,workspace_id,inventory_id,preorder_id,product_id,name,qty,unit_price_pence,recipe_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[uuid(),...args(s),recordId,p.id,p.name,qty,p.price_pence,p.manufacturing_recipe_id]);
  await audit(c,s,'preorder_saved',{preorder_id:recordId});return {preorder_id:recordId};
 }
 async function preorderStatus(c,s,b,orderId){feature(s,'preorders');const old=await record(c,s,'retail_preorders',orderId);version(b,old);const next={ordered:['in_production','ready','cancelled'],in_production:['ready','cancelled'],ready:['cancelled']}[old.status]||[];if(!next.includes(b.status))throw fail('This preorder status cannot be changed. Collect it through checkout',409);if(b.status==='in_production'&&old.fulfilment!=='make')throw fail('This order reserves existing stock');if(b.status==='ready'&&old.fulfilment==='make'){const rs=await reservations(c,s);for(const li of (await c.query('SELECT * FROM retail_preorder_items WHERE preorder_id=$1',[old.id])).rows){const p=await product(c,s,li.product_id),used=Number(rs.find(r=>r.product_id===p.id)?.reserved_qty||0);if(p.stock_qty-used<li.qty)throw fail('Receive enough finished Retail stock before marking '+p.name+' ready',409);}}await c.query('UPDATE retail_preorders SET status=$4,version=version+1 WHERE workspace_id=$1 AND inventory_id=$2 AND id=$3',[...args(s),old.id,b.status]);await audit(c,s,'preorder_status',{preorder_id:old.id,status:b.status});return {};}
 async function held(c,s,type,parentId){return (await c.query("SELECT * FROM retail_deposits WHERE workspace_id=$1 AND inventory_id=$2 AND origin_type=$3 AND origin_id=$4 AND status='held' ORDER BY created_at,id FOR UPDATE",[...args(s),type,parentId])).rows;}
 async function parent(c,s,type,parentId){if(!['booking','preorder'].includes(type))throw fail('Choose a booking or preorder');feature(s,type==='booking'?'appointments':'preorders');return record(c,s,type==='booking'?'retail_bookings':'retail_preorders',parentId);}
 async function deposit(c,s,b){
  const origin=await parent(c,s,b.origin_type,b.origin_id);if(['completed','collected','cancelled','no_show'].includes(origin.status))throw fail('This booking/order is closed');
  const t=await till(c,s,true),amount=money(b.amount,'Deposit');if(!amount)throw fail('Enter a deposit greater than zero');const previous=await held(c,s,b.origin_type,origin.id);
  const items=b.origin_type==='booking'?[{product:await product(c,s,origin.product_id),qty:1}]:await Promise.all((await c.query('SELECT * FROM retail_preorder_items WHERE preorder_id=$1',[origin.id])).rows.map(async l=>({product:{...await product(c,s,l.product_id),price_pence:l.unit_price_pence},qty:l.qty})));
  if(b.origin_type==='booking')items[0].product.price_pence=origin.unit_price_pence;
  const total=items.reduce((n,i)=>n+i.product.price_pence*i.qty,0);
  if(amount+previous.reduce((n,d)=>n+d.amount_pence,0)>total)throw fail('Deposit exceeds the remaining order/service price');
  if(t.expected_pence+amount>100000000)throw fail('Till cash limit reached');
  const allocated=Pricing.allocate(amount,items,i=>i.product.price_pence*i.qty),vat=vatSnapshot(s.settings,items.map((i,n)=>({...i,gross_pence:allocated[n]})));
  const recordId=uuid(),reference='DEP-'+recordId.slice(0,8).toUpperCase(),business={name:s.settings.receipt_business_name||s.workspace_name,address:s.settings.receipt_business_address||''};
  const result=(await c.query('INSERT INTO retail_deposits(id,workspace_id,inventory_id,origin_type,origin_id,amount_pence,session_id,vat_receipt,receipt_business,actor_id,reference) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',[recordId,...args(s),b.origin_type,origin.id,amount,t.id,vat?JSON.stringify(vat):null,JSON.stringify(business),s.actor_id,reference])).rows[0];
  await cash(c,s,t,'deposit',amount,{note:reference});return {deposit:result};
 }
 async function refundDeposit(c,s,b,depositId){admin(s);const d=await record(c,s,'retail_deposits',depositId);if(d.status!=='held')throw fail('Only a held deposit can be refunded',409);const t=await till(c,s,true);if(t.expected_pence<d.amount_pence)throw fail('Not enough expected cash in this till');await c.query("UPDATE retail_deposits SET status='refunded',refunded_at=now() WHERE id=$1",[d.id]);await cash(c,s,t,'deposit_refund',-d.amount_pence,{note:d.reference+' · '+text(b.reason,'Refund reason',300)});return {deposit:{...d,status:'refunded'}};}
 async function pricing(c,s){return {offers:s.business.features.offers?(await c.query('SELECT * FROM retail_offers WHERE workspace_id=$1 AND inventory_id=$2 AND active',args(s))).rows:[],reductions:s.business.features.reductions?(await c.query('SELECT * FROM retail_reductions WHERE workspace_id=$1 AND inventory_id=$2 AND active',args(s))).rows:[]};}
 async function checkoutContext(c,s,b,offline){
  const cfg=offline?(offline.business||defaults()):s.business,ctx={config:cfg,pricing:offline?(offline.pricing||{offers:[],reductions:[]}):await pricing(c,s),deposits:[],customer:null,booking:null,preorder:null,staff:null};
  if(offline&&(b.booking_id||b.preorder_id||b.customer_id||b.redeem_reward))throw fail('Bookings, preorders and loyalty need online checkout',409);
  if(b.booking_id&&b.preorder_id)throw fail('Complete a booking or a preorder in one checkout');
  if(b.booking_id){feature(s,'appointments');ctx.booking=await record(c,s,'retail_bookings',b.booking_id);if(!['booked','waiting','in_progress'].includes(ctx.booking.status))throw fail('This appointment is already closed',409);if(b.booking_version!==ctx.booking.version)throw fail('The booking changed. Load it into checkout again',409);ctx.deposits=await held(c,s,'booking',ctx.booking.id);}
  if(b.preorder_id){feature(s,'preorders');ctx.preorder=await record(c,s,'retail_preorders',b.preorder_id);if(!['ordered','ready','in_production'].includes(ctx.preorder.status))throw fail('This preorder is already closed',409);if(b.preorder_version!==ctx.preorder.version)throw fail('The preorder changed. Load it into checkout again',409);ctx.preorder.items=(await c.query('SELECT * FROM retail_preorder_items WHERE preorder_id=$1',[ctx.preorder.id])).rows;ctx.deposits=await held(c,s,'preorder',ctx.preorder.id);ctx.pricing={offers:[],reductions:[]};}
  const customerId=b.customer_id||ctx.booking?.customer_id||ctx.preorder?.customer_id;
  if(customerId){const linked=ctx.booking||ctx.preorder;if(linked?.customer_id&&b.customer_id&&b.customer_id!==linked.customer_id)throw fail('Keep the linked booking/order customer unchanged');if(!cfg.features.loyalty&&!ctx.booking&&!ctx.preorder)throw fail('Enable Loyalty before adding a customer to a walk-in sale');ctx.customer=await record(c,s,'retail_customers',customerId);if(!ctx.customer.active)throw fail('This customer is archived');}
  const staffId=b.staff_id||ctx.booking?.staff_id;
  if(staffId){if(!cfg.features.staff)throw fail('Staff tracking is switched off');if(offline)throw fail('Staff attribution and tips require online checkout',409);ctx.staff=s.pos_staff?.id===staffId?s.pos_staff:await record(c,s,'retail_team',staffId);if(!ctx.staff||ctx.staff.active===false)throw fail('Choose an active staff member');}
  ctx.tip=money(b.tip??'0','Tip');if(ctx.tip&&!cfg.features.staff)throw fail('Enable staff/tips in Retail settings first');
  if(ctx.tip&&!ctx.staff)throw fail('Select the staff member receiving the tip');
  if(b.redeem_reward){if(!cfg.features.loyalty||!ctx.customer||!cfg.loyalty_reward_product_id||ctx.customer.stamps<cfg.loyalty_target)throw fail('This customer does not have an available loyalty reward');ctx.reward={product_id:cfg.loyalty_reward_product_id};}
  return ctx;
 }
 function reviewedProduct(ctx,p,input){
  if(p.item_kind==='service'&&!ctx.config.features.services)throw fail('Services are switched off in Retail settings',409);
  if(ctx.booking&&p.id===ctx.booking.product_id){if(input.qty!==1&&String(input.qty)!=='1')throw fail('The booked service must have quantity one');return {...p,price_pence:ctx.booking.unit_price_pence};}
  if(ctx.preorder){const line=ctx.preorder.items.find(x=>x.product_id===p.id);if(!line||Number(input.qty)!==line.qty)throw fail('Keep the preorder’s products and quantities unchanged, or edit it before checkout');return {...p,price_pence:line.unit_price_pence};}
  return p;
 }
 function priced(ctx,items,b,at){
  if(ctx.booking&&!items.some(i=>i.product.id===ctx.booking.product_id&&i.qty===1))throw fail('Include the booked service before completing this appointment');
  if(ctx.preorder&&items.length!==ctx.preorder.items.length)throw fail('Include every preorder item exactly once');
  if(ctx.reward&&!items.some(i=>i.product.id===ctx.reward.product_id))throw fail('Add the configured loyalty reward product/service to the basket first');
  const result=Pricing.price(items.map(i=>({product_id:i.product.id,qty:i.qty,unit_price_pence:i.product.price_pence})),ctx.pricing,at,ctx.reward);
  if((b.reviewed_total_pence!==undefined&&b.reviewed_total_pence!==result.total_pence)||(b.reviewed_total_pence===undefined&&result.discount_pence))throw fail('The price or offer changed. Review the updated basket before taking payment',409);
  result.lines.forEach((l,n)=>{items[n].gross_pence=l.line_total_pence;items[n].discount_pence=l.line_discount_pence;});
  return result;
 }
 async function finaliseSale(c,s,b,ctx,sale,items,priced,vat){
  const depositTotal=ctx.deposits.reduce((n,d)=>n+d.amount_pence,0),depositVat=ctx.deposits.reduce((n,d)=>n+(d.vat_receipt?.vat_pence||0),0);
  let loyalty=null;
  if(ctx.customer&&ctx.config.features.loyalty){const earn=priced.total_pence>=ctx.config.loyalty_minimum_pence&&priced.total_pence>0?1:0,used=ctx.reward?ctx.config.loyalty_target:0,delta=earn-used;
   await c.query('UPDATE retail_customers SET stamps=stamps+$4,version=version+1 WHERE workspace_id=$1 AND inventory_id=$2 AND id=$3',[...args(s),ctx.customer.id,delta]);
   await c.query("INSERT INTO retail_loyalty_events(id,workspace_id,inventory_id,customer_id,sale_id,delta,kind) VALUES($1,$2,$3,$4,$5,$6,'sale')",[uuid(),...args(s),ctx.customer.id,sale.id,delta]);loyalty={earned:earn,used,balance:ctx.customer.stamps+delta,target:ctx.config.loyalty_target};
  }
  const commissionBase=vat?vat.net_pence:priced.total_pence,staff=ctx.staff?{id:ctx.staff.id,name:ctx.staff.name,commission_bps:ctx.staff.commission_bps,commission_base_pence:commissionBase,commission_pence:Math.floor((commissionBase*ctx.staff.commission_bps+5000)/10000),tip_pence:ctx.tip}:null;
  await c.query('UPDATE retail_sales SET goods_total_pence=$2,tip_pence=$3,discount_pence=$4,deposit_applied_pence=$5,cash_tendered_pence=$6,staff_snapshot=$7,customer_id=$8,booking_id=$9,preorder_id=$10,loyalty_snapshot=$11,promotion_snapshot=$12,deposit_vat_pence=$13 WHERE id=$1',[sale.id,priced.total_pence,ctx.tip,priced.discount_pence,depositTotal,money(b.tendered),staff?JSON.stringify(staff):null,ctx.customer?.id||null,ctx.booking?.id||null,ctx.preorder?.id||null,loyalty?JSON.stringify(loyalty):null,JSON.stringify(priced.applications),depositVat]);
  for(let n=0;n<items.length;n++){const i=items[n];await c.query('UPDATE retail_sale_items SET line_total_pence=$3,line_discount_pence=$4,item_kind=$5,vat_treatment=$6,vat_rate=$7 WHERE sale_id=$1 AND product_id=$2',[sale.id,i.product.id,i.gross_pence,i.discount_pence,i.product.item_kind||'product',i.product.vat_treatment,i.product.vat_rate]);}
  for(const d of ctx.deposits)await c.query("UPDATE retail_deposits SET status='applied',sale_id=$2 WHERE id=$1",[d.id,sale.id]);
  if(ctx.booking)await c.query("UPDATE retail_bookings SET status='completed',sale_id=$2,version=version+1 WHERE id=$1",[ctx.booking.id,sale.id]);
  if(ctx.preorder)await c.query("UPDATE retail_preorders SET status='collected',sale_id=$2,version=version+1 WHERE id=$1",[ctx.preorder.id,sale.id]);
  return {goods_total_pence:priced.total_pence,tip_pence:ctx.tip,discount_pence:priced.discount_pence,deposit_applied_pence:depositTotal,cash_tendered_pence:money(b.tendered),staff_snapshot:staff,loyalty_snapshot:loyalty,promotion_snapshot:priced.applications,deposit_vat_pence:depositVat,booking_id:ctx.booking?.id||null,preorder_id:ctx.preorder?.id||null};
 }
 async function refundLoyalty(c,s,sale){if(!sale.customer_id||!sale.loyalty_snapshot)return;const delta=sale.loyalty_snapshot.used-sale.loyalty_snapshot.earned;await c.query('UPDATE retail_customers SET stamps=stamps+$4,version=version+1 WHERE workspace_id=$1 AND inventory_id=$2 AND id=$3',[...args(s),sale.customer_id,delta]);await c.query("INSERT INTO retail_loyalty_events(id,workspace_id,inventory_id,customer_id,sale_id,delta,kind) VALUES($1,$2,$3,$4,$5,$6,'refund')",[uuid(),...args(s),sale.customer_id,sale.id,delta]);}
 async function reservations(c,s){return (await c.query("SELECT li.product_id,SUM(li.qty)::text AS reserved_qty FROM retail_preorder_items li JOIN retail_preorders o ON o.id=li.preorder_id WHERE o.workspace_id=$1 AND o.inventory_id=$2 AND o.status NOT IN('collected','cancelled') AND (o.fulfilment='stock' OR o.status='ready') GROUP BY li.product_id",args(s))).rows;}
 async function overview(c,s){
  const cfg=s.business,isAdmin=['owner','admin'].includes(s.role),readContacts=s.role!=='viewer';
  const staff=(await c.query('SELECT * FROM retail_team WHERE workspace_id=$1 AND inventory_id=$2 ORDER BY active DESC,name',args(s))).rows;
  const offers=(await c.query('SELECT * FROM retail_offers WHERE workspace_id=$1 AND inventory_id=$2 ORDER BY active DESC,priority DESC,name LIMIT 500',args(s))).rows;
  const reductions=(await c.query('SELECT * FROM retail_reductions WHERE workspace_id=$1 AND inventory_id=$2 ORDER BY ends_at DESC LIMIT 500',args(s))).rows;
  const customers=readContacts?(await c.query('SELECT * FROM retail_customers WHERE workspace_id=$1 AND inventory_id=$2 ORDER BY active DESC,name LIMIT 2000',args(s))).rows:[];
  const bookings=readContacts?(await c.query("SELECT b.*,p.name AS service_name,st.name AS staff_name,(SELECT jsonb_build_object('status',r.status,'error',r.error) FROM retail_reminders r WHERE r.booking_id=b.id AND r.booking_version=b.version ORDER BY r.created_at DESC LIMIT 1) AS reminder FROM retail_bookings b JOIN retail_products p ON p.id=b.product_id LEFT JOIN retail_team st ON st.id=b.staff_id WHERE b.workspace_id=$1 AND b.inventory_id=$2 ORDER BY (b.status IN('booked','waiting','in_progress')) DESC,b.starts_at NULLS FIRST,b.created_at DESC LIMIT 1000",args(s))).rows:[];
  const preorders=readContacts?(await c.query("SELECT o.*,COALESCE((SELECT jsonb_agg(to_jsonb(li) ORDER BY li.name) FROM retail_preorder_items li WHERE li.preorder_id=o.id),'[]') AS items FROM retail_preorders o WHERE o.workspace_id=$1 AND o.inventory_id=$2 ORDER BY (o.status NOT IN('collected','cancelled')) DESC,o.collection_at DESC LIMIT 1000",args(s))).rows:[];
  const deposits=readContacts?(await c.query('SELECT * FROM retail_deposits WHERE workspace_id=$1 AND inventory_id=$2 ORDER BY created_at DESC LIMIT 2000',args(s))).rows:[];
  const wastes=(await c.query("SELECT * FROM retail_waste WHERE workspace_id=$1 AND inventory_id=$2 AND created_at>=now()-interval '90 days' ORDER BY created_at DESC LIMIT 2000",args(s))).rows;
  const allowed=await manufacturingAllowed(c,s),recipes=allowed?(await c.query('SELECT id,name FROM manufacturing_recipes WHERE workspace_id=$1 AND inventory_id=$2 AND NOT archived ORDER BY name',args(s))).rows:[];
  return {config:cfg,staff:isAdmin?staff:staff.map(({id,name,active})=>({id,name,active})),offers,reductions,customers,bookings,preorders,deposits,waste:wastes,reservations:await reservations(c,s),recipes,manufacturing_allowed:allowed,email_ready:Boolean(process.env.RESEND_API_KEY&&process.env.EMAIL_FROM),pricing:{offers:cfg.features.offers?offers.filter(o=>o.active):[],reductions:cfg.features.reductions?reductions.filter(r=>r.active):[]}};
 }
 async function profit(req){
  await H.ensureSchema();const s=await H.scope(pool,req,{admin:true});if(!s.business.features.profit&&!s.business.features.staff)throw fail('Enable Gross profit or Staff reporting first',409);
  const start=timestamp(req.query.start)||new Date(now().getTime()-30*86400000).toISOString(),end=timestamp(req.query.end)||now().toISOString();if(Date.parse(start)>=Date.parse(end)||Date.parse(end)-Date.parse(start)>366*86400000)throw fail('Choose a report range of up to 366 days');
  const rows=(await pool.query(`SELECT s.id,s.created_at,CASE WHEN NOT EXISTS(SELECT 1 FROM retail_returns rr WHERE rr.sale_id=s.id) THEN s.refunded_at ELSE NULL END AS refunded_at,s.refund_restocked,s.staff_snapshot,s.tip_pence,s.vat_receipt,li.* FROM retail_sales s JOIN retail_sale_items li ON li.sale_id=s.id WHERE s.workspace_id=$1 AND s.inventory_id=$2 AND ((s.created_at>=$3 AND s.created_at<$4) OR (s.refunded_at>=$3 AND s.refunded_at<$4))`,[...args(s),start,end])).rows;
  const products=new Map(),staff=new Map();let revenue=0,cost=0,tips=0,commission=0;
  const sales=new Map();for(const r of rows){const tax=r.vat_receipt?.lines.find(x=>x.product_id===r.product_id),net=tax?tax.net_pence:(r.line_total_pence??r.qty*r.unit_price_pence),c=r.qty*r.unit_cost_pence;let factor=0,costFactor=0;if(Date.parse(r.created_at)>=Date.parse(start)&&Date.parse(r.created_at)<Date.parse(end)){factor++;costFactor++;}if(r.refunded_at&&Date.parse(r.refunded_at)>=Date.parse(start)&&Date.parse(r.refunded_at)<Date.parse(end)){factor--;if(r.refund_restocked)costFactor--;}
   const p=products.get(r.product_id)||{id:r.product_id,name:r.name,qty:0,revenue_pence:0,cost_pence:0};p.qty+=factor*r.qty;p.revenue_pence+=factor*net;p.cost_pence+=costFactor*c;products.set(r.product_id,p);revenue+=factor*net;cost+=costFactor*c;sales.set(r.sale_id,{r,factor});}
  for(const {r,factor} of sales.values()){tips+=factor*r.tip_pence;const ss=r.staff_snapshot;if(ss){const st=staff.get(ss.id)||{id:ss.id,name:ss.name,sales_pence:0,commission_pence:0,tips_pence:0};st.sales_pence+=factor*ss.commission_base_pence;st.commission_pence+=factor*ss.commission_pence;st.tips_pence+=factor*ss.tip_pence;commission+=factor*ss.commission_pence;staff.set(ss.id,st);}}
  const returns=(await pool.query(`SELECT rr.id AS return_id,rr.tip_pence,rr.commission_pence,s.staff_snapshot,ri.* FROM retail_returns rr JOIN retail_return_items ri ON ri.return_id=rr.id JOIN retail_sales s ON s.id=rr.sale_id WHERE rr.workspace_id=$1 AND rr.inventory_id=$2 AND rr.created_at>=$3 AND rr.created_at<$4`,[...args(s),start,end])).rows;
  const seenReturns=new Set();for(const r of returns){const p=products.get(r.product_id)||{id:r.product_id,name:r.name,qty:0,revenue_pence:0,cost_pence:0};p.qty-=r.qty;p.revenue_pence-=r.net_pence;p.cost_pence-=r.cost_reversed_pence;products.set(r.product_id,p);revenue-=r.net_pence;cost-=r.cost_reversed_pence;if(!seenReturns.has(r.return_id)){seenReturns.add(r.return_id);tips-=r.tip_pence;commission-=r.commission_pence;const ss=r.staff_snapshot;if(ss){const st=staff.get(ss.id)||{id:ss.id,name:ss.name,sales_pence:0,commission_pence:0,tips_pence:0};const returnNet=returns.filter(x=>x.return_id===r.return_id).reduce((n,x)=>n+x.net_pence,0);st.sales_pence-=returnNet;st.commission_pence-=r.commission_pence;st.tips_pence-=r.tip_pence;staff.set(ss.id,st);}}}
  // Tip-only refunds have no product rows.
  const tipOnly=(await pool.query(`SELECT rr.tip_pence,s.staff_snapshot FROM retail_returns rr JOIN retail_sales s ON s.id=rr.sale_id WHERE rr.workspace_id=$1 AND rr.inventory_id=$2 AND rr.created_at>=$3 AND rr.created_at<$4 AND NOT EXISTS(SELECT 1 FROM retail_return_items ri WHERE ri.return_id=rr.id)`,[...args(s),start,end])).rows;
  for(const r of tipOnly){tips-=r.tip_pence;if(r.staff_snapshot){const ss=r.staff_snapshot,st=staff.get(ss.id)||{id:ss.id,name:ss.name,sales_pence:0,commission_pence:0,tips_pence:0};st.tips_pence-=r.tip_pence;staff.set(ss.id,st);}}
  return {success:true,start,end,revenue_pence:revenue,cost_pence:cost,gross_profit_pence:revenue-cost,commission_pence:commission,tips_pence:tips,products:[...products.values()].map(p=>({...p,gross_profit_pence:p.revenue_pence-p.cost_pence})),staff:[...staff.values()]};
 }
 async function reminderTick(){
  if(!process.env.RESEND_API_KEY&&!H.sendEmail)return;
  const candidates=(await pool.query("SELECT b.*,w.owner_user_id FROM retail_bookings b JOIN workspaces w ON w.id=b.workspace_id WHERE b.email_reminder AND b.status='booked' AND b.reminder_due_at<=$1 AND b.starts_at>$1 ORDER BY b.starts_at LIMIT 50",[now().toISOString()])).rows;
  for(const b of candidates){const c=await pool.connect();let job;
   try{await c.query('BEGIN');await c.query("SELECT pg_advisory_xact_lock(hashtextextended('retail-workspace:'||$1,0))",[b.workspace_id]);const req={workspace:{id:b.workspace_id},user:{id:b.owner_user_id},headers:{'x-workspace-id':b.workspace_id,'x-inventory-ids':b.inventory_id}};const s=await H.scope(c,req);if(s.retail_access?.features.reminders===false){await c.query('COMMIT');continue;}feature(s,'appointments');const live=await record(c,s,'retail_bookings',b.id);if(live.status!=='booked'||!live.email_reminder||live.version!==b.version){await c.query('COMMIT');continue;}
    const owner=(await c.query('SELECT email_verified,is_suspended FROM users WHERE id=$1',[b.owner_user_id])).rows[0];if(!owner?.email_verified||owner.is_suspended){await c.query('COMMIT');continue;}
    job=(await c.query('SELECT * FROM retail_reminders WHERE booking_id=$1 AND booking_version=$2 FOR UPDATE',[b.id,b.version])).rows[0];
    if(job&&(job.status!=='queued'||job.attempts>=8||job.lease_until&&Date.parse(job.lease_until)>now().getTime()||job.next_attempt_at&&Date.parse(job.next_attempt_at)>now().getTime())){await c.query('COMMIT');continue;}
    if(job?.first_attempt_at&&now().getTime()-Date.parse(job.first_attempt_at)>23*3600000){await c.query("UPDATE retail_reminders SET status='failed',error='Delivery could not be confirmed. Review Resend before resending.' WHERE id=$1",[job.id]);await c.query('COMMIT');continue;}
    if(!job){const business=s.settings.receipt_business_name||s.workspace_name,p=await product(c,s,b.product_id),time=new Date(b.starts_at).toLocaleString('en-GB',{timeZone:s.settings.timezone,dateStyle:'full',timeStyle:'short'}),payload={to:b.email,subject:'Your appointment reminder · '+business,html:'<!doctype html><html><body style="margin:0;background:#f4f5f7;font:16px Arial;color:#172033"><div style="max-width:560px;margin:24px auto;background:white;padding:32px;border-top:6px solid #218a50"><h1>'+escape(business)+'</h1><h2>Your appointment reminder</h2><p>Hello '+escape(b.customer_name)+',</p><p>Your '+escape(p.name)+' appointment is booked for <strong>'+escape(time)+'</strong> ('+escape(s.settings.timezone)+').</p><p>Please contact '+escape(business)+' directly if you need to change your appointment.</p><p style="font-size:12px;color:#526070">Sent by InventoryOS for your booked appointment. This is a service reminder.</p></div></body></html>'};job={id:uuid(),payload};await c.query('INSERT INTO retail_reminders(id,workspace_id,inventory_id,booking_id,booking_version,payload) VALUES($1,$2,$3,$4,$5,$6)',[job.id,b.workspace_id,b.inventory_id,b.id,b.version,JSON.stringify(payload)]);}
    await c.query("UPDATE retail_reminders SET attempts=attempts+1,first_attempt_at=COALESCE(first_attempt_at,$2),lease_until=$2::timestamptz+interval '2 minutes' WHERE id=$1",[job.id,now().toISOString()]);await c.query('COMMIT');
   }catch(e){await c.query('ROLLBACK');continue;}finally{c.release();}
   if(!job)continue;
   try{let timeout;try{await Promise.race([(H.sendEmail||require('./email').sendEmail)({...job.payload,idempotencyKey:'retail-appointment/'+job.id}),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('Email send timed out')),20000);})]);}finally{clearTimeout(timeout);}await pool.query("UPDATE retail_reminders SET status='sent',sent_at=$2,lease_until=NULL,error=NULL WHERE id=$1",[job.id,now().toISOString()]);}
   catch{await pool.query("UPDATE retail_reminders SET lease_until=NULL,next_attempt_at=$2::timestamptz+interval '5 minutes',error='Email delivery failed; check the backend email settings' WHERE id=$1",[job.id,now().toISOString()]);}
  }
 }
 return {config,saveSettings,productMeta,archiveCheck,receiveQuantity,saveStaff,saveCustomer,customerSearch,customerCard,saveBooking,bookingStatus,saveOffer,saveReduction,waste,preorder,preorderStatus,deposit,refundDeposit,pricing,checkoutContext,reviewedProduct,priced,finaliseSale,refundLoyalty,reservations,overview,profit,reminderTick,record,features:FEATURES,presets:PRESETS};
}
module.exports={createBusiness,FEATURES,PRESETS,defaults};
