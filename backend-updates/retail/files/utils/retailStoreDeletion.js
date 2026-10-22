'use strict';
const crypto=require('node:crypto');
// Explicit business datasets. New/unknown store tables fail closed below rather
// than silently disappearing from a backup. Authentication material is excluded.
const TABLES=[
 'retail_products','retail_sales','retail_sale_items','retail_stock_events','retail_counts',
 'retail_till_sessions','retail_cash_events','retail_deliveries','retail_delivery_items',
 'retail_tasks','retail_reports','retail_audit','retail_business_settings','retail_customers',
 'retail_bookings','retail_offers','retail_reductions','retail_preorders','retail_preorder_items',
 'retail_deposits','retail_loyalty_events','retail_waste','retail_reminders','retail_counter_settings',
 'retail_parked_sales','retail_returns','retail_registered_tills','retail_staff_assignments',
 'retail_platform_events','retail_reorder_emails','retail_order_settings','retail_supplier_products',
 'retail_price_reviews','retail_waste_batches','retail_receipt_accounts','retail_receipt_emails'
];
const TECHNICAL=['retail_staff_credentials','retail_staff_attempts','retail_till_devices','retail_staff_sessions','retail_drawer_assignments'];
const SPECIAL=['inventories','retail_stores','retail_team','retail_return_items','retail_pos_sessions','retail_drawer_logins','retail_store_deletions'];
const KNOWN=new Set([...TABLES,...TECHNICAL,...SPECIAL]);
const SECRET=/(?:token|hash|salt|password|secret|authorization|credential|idempotency|checkout_id|checkout_session_id|device_id|selection_|lease_until)/i;
const quote=s=>'"'+String(s).replaceAll('"','""')+'"';
function clean(value){
 if(value instanceof Date)return value.toISOString();
 if(Array.isArray(value))return value.map(clean);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().filter(k=>!SECRET.test(k)&&k!=='deleting_backup_id').map(k=>[k,clean(value[k])]));
 return value;
}
function canonical(v){return JSON.stringify(clean(v));}
function csv(rows,columns){
 columns=columns||[...new Set(rows.flatMap(Object.keys))].sort();
 const cell=v=>{let s=v==null?'':typeof v==='object'?JSON.stringify(v):String(v);if(typeof v==='string'&&/^[\s]*[=+\-@\t\r\n]/.test(s))s="'"+s;return quote(s);};
 return '\uFEFF'+[columns.map(quote).join(','),...rows.map(r=>columns.map(k=>cell(r[k])).join(','))].join('\r\n')+'\r\n';
}
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function create(H){
 const {pool,ensureSchema,scope,id,fail,now}=H,B=require('./retailBilling').create(H),stamp=()=>now().toISOString();
 async function tx(fn,repeatable=false){const c=await pool.connect();try{await c.query('BEGIN'+(repeatable?' ISOLATION LEVEL REPEATABLE READ':''));const result=await fn(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 async function owner(c,req){
  const s=await scope(c,{...req,headers:{...req.headers,'x-retail-till-id':''}},{inventory:false,enabled:false,entitled:false});
  if(s.role!=='owner')throw fail('Only the Retail business owner can delete a store',403);
  const u=(await c.query('SELECT email,email_verified FROM users WHERE id=$1',[s.actor_id])).rows[0];
  if(!u?.email||u.email_verified===false)throw fail('Verify your account email before deleting a store',409);
  return {...s,email:u.email};
 }
 async function lock(c,w){await c.query("SELECT pg_advisory_xact_lock(hashtextextended('retail-workspace:'||$1,0))",[w]);}
 async function shop(c,s,inventory){const r=(await c.query('SELECT * FROM retail_stores WHERE workspace_id=$1 AND inventory_id=$2',[s.workspace_id,inventory])).rows[0];if(!r)throw fail('Store unavailable',404);return r;}
 async function schema(c){
  const cols=(await c.query('SELECT table_name,column_name FROM information_schema.columns WHERE table_schema=current_schema() ORDER BY table_name,ordinal_position')).rows;
  const map=new Map();for(const r of cols){if(!map.has(r.table_name))map.set(r.table_name,[]);map.get(r.table_name).push(r.column_name);}return map;
 }
 async function unsupported(c,inventory,map){
  for(const [table,cols]of map){if(!cols.includes('inventory_id')||KNOWN.has(table))continue;
   if((await c.query('SELECT 1 FROM '+quote(table)+' WHERE inventory_id=$1 LIMIT 1',[inventory])).rows.length)throw fail('This store has additional data in '+table+'. Contact support to include it in the backup before deleting',409);
  }
  // Catch future child tables with no inventory_id, before a cascading delete
  // could remove rows that this version does not know how to export.
  const refs=(await c.query(`SELECT k.oid,child.relname AS child,parent.relname AS parent,ARRAY(SELECT a.attname FROM unnest(k.conkey) WITH ORDINALITY x(n,o) JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=x.n ORDER BY x.o) AS child_columns,ARRAY(SELECT a.attname FROM unnest(k.confkey) WITH ORDINALITY x(n,o) JOIN pg_attribute a ON a.attrelid=k.confrelid AND a.attnum=x.n ORDER BY x.o) AS parent_columns FROM pg_constraint k JOIN pg_class child ON child.oid=k.conrelid JOIN pg_class parent ON parent.oid=k.confrelid JOIN pg_namespace ns ON ns.oid=child.relnamespace WHERE k.contype='f' AND ns.nspname=current_schema()`)).rows;
  for(const r of refs)if((KNOWN.has(r.parent)||r.parent==='inventories')&&!KNOWN.has(r.child)&&r.child!=='retail_store_moves'){
   const join=r.child_columns.map((k,i)=>'ch.'+quote(k)+'=p.'+quote(r.parent_columns[i])).join(' AND ');
   const condition=r.parent==='inventories'?'p.id=$1':map.get(r.parent)?.includes('inventory_id')?'p.inventory_id=$1':null;
   const q='SELECT 1 FROM '+quote(r.child)+' ch JOIN '+quote(r.parent)+' p ON '+join+(condition?' WHERE '+condition:'')+' LIMIT 1';
   if((await c.query(q,condition?[inventory]:[])).rows.length)throw fail('An additional data table ('+r.child+') needs reviewing before this store can be deleted',409);
  }
 }
 async function blockers(c,r){
  const v=[r.inventory_id],messages=[];
  const tests=[
   ['SELECT 1 FROM retail_till_sessions WHERE inventory_id=$1 AND closed_at IS NULL LIMIT 1','Balance and close every till for this store first.'],
   ['SELECT 1 FROM retail_drawer_assignments WHERE inventory_id=$1 OR connection_till_id IN(SELECT id FROM retail_registered_tills WHERE inventory_id=$1) LIMIT 1','Log staff out of all drawers connected to this store. Finish any transaction first.'],
   ["SELECT 1 FROM retail_parked_sales WHERE inventory_id=$1 AND status='parked' LIMIT 1",'Complete or remove parked sales first.'],
   ["SELECT 1 FROM retail_receipt_emails WHERE inventory_id=$1 AND (status='pending' OR (meter_customer_id IS NOT NULL AND sent_at IS NOT NULL AND meter_reported_at IS NULL)) LIMIT 1",'Wait for pending receipt emails and their billing usage to finish.'],
   ["SELECT 1 FROM retail_reminders WHERE inventory_id=$1 AND lease_until>now() LIMIT 1",'A reminder email is being processed. Try again shortly.'],
   ["SELECT 1 FROM retail_supplier_products WHERE inventory_id=$1 AND lease_until>now() LIMIT 1",'A supplier check is running. Try again shortly.']
  ];
  for(const [q,m]of tests)if((await c.query(q,v)).rows.length)messages.push(m);
  const conflicts=(await c.query(`SELECT 1 FROM retail_team t JOIN retail_staff_credentials cr ON cr.staff_id=t.id JOIN retail_staff_assignments a ON a.staff_id=t.id AND a.inventory_id<>$1 JOIN retail_staff_credentials other ON other.inventory_id=a.inventory_id AND other.staff_number=cr.staff_number AND other.staff_id<>cr.staff_id WHERE t.inventory_id=$1 LIMIT 1`,v)).rows;
  if(conflicts.length)messages.push('A shared staff number conflicts at another store. Change that number before deleting.');
  return messages;
 }
 async function snapshot(c,s,r,map){
  await unsupported(c,r.inventory_id,map);const sets=[];
  const add=(name,rows,columns)=>sets.push({name,rows:rows.map(clean).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b),'en')),columns});
  for(const t of TABLES){const cols=map.get(t);if(!cols)throw fail('Install the full Retail database update before deleting stores',503);
   const rows=(await c.query('SELECT * FROM '+quote(t)+' WHERE inventory_id=$1'+(cols.includes('workspace_id')?' AND workspace_id=$2':''),cols.includes('workspace_id')?[r.inventory_id,s.workspace_id]:[r.inventory_id])).rows;
   add(t==='retail_products'?'products':t.slice(7),rows,cols.filter(k=>!SECRET.test(k)));
  }
  add('return_items',(await c.query('SELECT i.* FROM retail_return_items i JOIN retail_returns r ON r.id=i.return_id WHERE r.inventory_id=$1 AND r.workspace_id=$2',[r.inventory_id,s.workspace_id])).rows,map.get('retail_return_items').filter(k=>!SECRET.test(k)));
  add('staff',(await c.query(`SELECT t.*,cr.staff_number FROM retail_team t LEFT JOIN retail_staff_credentials cr ON cr.staff_id=t.id WHERE t.workspace_id=$2 AND (t.inventory_id=$1 OR EXISTS(SELECT 1 FROM retail_staff_assignments a WHERE a.staff_id=t.id AND a.inventory_id=$1))`,[r.inventory_id,s.workspace_id])).rows,[...map.get('retail_team'),'staff_number']);
  add('inventory',(await c.query('SELECT * FROM inventories WHERE id=$1 AND workspace_id=$2',[r.inventory_id,s.workspace_id])).rows,map.get('inventories').filter(k=>!SECRET.test(k)));
  add('store',[r],map.get('retail_stores').filter(k=>!SECRET.test(k)&&k!=='deleting_backup_id'));
  add('workspace_settings',(await c.query('SELECT * FROM retail_settings WHERE workspace_id=$1',[s.workspace_id])).rows,map.get('retail_settings'));
  // Live connection timestamps and Stripe sync/cancellation flags aren't changes
  // to business records. Exclude only these from the final consistency check.
  const stable=sets.map(x=>({name:x.name,rows:x.rows.map(row=>{const v={...row};if(x.name==='registered_tills')delete v.last_seen;if(['store','receipt_accounts'].includes(x.name))for(const k of ['cancel_at_period_end','synced_at','billing_synced_at'])delete v[k];return v;})}));
  return {sets,hash:crypto.createHash('sha256').update(canonical(stable)).digest('hex')};
 }
 function attachments(snap,r,s){
  const manifest=snap.sets.map(x=>({file:x.name+'.csv',rows:x.rows.length}));
  const info=[{setting:'store',value:r.name},{setting:'workspace_id',value:s.workspace_id},{setting:'store_id',value:r.inventory_id},{setting:'exported_at_utc',value:stamp()},{setting:'money',value:'Columns ending _pence are integer GBP pence; divide by 100 for pounds.'},{setting:'format',value:'UTF-8 CSV. Nested settings and receipt snapshots are JSON. Import barcodes as Text to preserve leading zeroes.'},{setting:'security',value:'Passwords, staff PINs, QR/login tokens and temporary session caches are excluded. Shared workspace/account and other-store data are retained.'},{setting:'billing',value:'Deletion stops shop and receipt subscriptions renewing at the end of the current billing period. Existing usage and invoices remain payable.'},...manifest.map(x=>({setting:x.file,value:String(x.rows)+' rows'}))];
  return {manifest,files:[{filename:'backup-index.csv',content:Buffer.from(csv(info,['setting','value'])).toString('base64')},...snap.sets.map(x=>({filename:x.name+'.csv',content:Buffer.from(csv(x.rows,x.columns)).toString('base64')}))]};
 }
 async function subscriptions(c,r){const receipt=(await c.query('SELECT * FROM retail_receipt_accounts WHERE inventory_id=$1',[r.inventory_id])).rows[0];return [{kind:'shop',id:r.stripe_subscription_id,customer:r.stripe_customer_id,checkout:r.checkout_session_id},{kind:'receipts',id:receipt?.stripe_subscription_id,customer:receipt?.stripe_customer_id,checkout:receipt?.checkout_id}].filter(x=>x.id||x.checkout);}
 async function preview(req){await ensureSchema();return tx(async c=>{const s=await owner(c,req),r=await shop(c,s,id(req.query.inventory_id));const map=await schema(c);await unsupported(c,r.inventory_id,map);const latest=(await c.query("SELECT id,status,sent_at,expires_at FROM retail_store_deletions WHERE workspace_id=$1 AND inventory_id=$2 AND owner_id=$3 AND recipient=$4 AND expires_at>$5 ORDER BY created_at DESC LIMIT 1",[s.workspace_id,r.inventory_id,s.actor_id,s.email,stamp()])).rows[0];return {success:true,store:{id:r.inventory_id,name:r.name},email:s.email,blockers:await blockers(c,r),backup:latest||null,deleting:Boolean(r.deleting_backup_id)};});}
 async function backup(req){
  await ensureSchema();const requestId=id(req.body.request_id),inventory=id(req.body.inventory_id);
  const job=await tx(async c=>{
   const s=await owner(c,req);await lock(c,s.workspace_id);const r=await shop(c,s,inventory);
   const old=(await c.query('SELECT * FROM retail_store_deletions WHERE id=$1',[requestId])).rows[0];
   if(old){if(old.owner_id!==s.actor_id||old.workspace_id!==s.workspace_id||old.inventory_id!==inventory||old.recipient!==s.email)throw fail('Backup request belongs to different details',409);return old;}
   if(r.deleting_backup_id)throw fail('Store deletion is already in progress. Resume the confirmed request',409);
   const blocked=await blockers(c,r);if(blocked.length)throw fail(blocked.join(' '),409);
   if(Number((await c.query("SELECT COUNT(*)::int n FROM retail_store_deletions WHERE owner_id=$1 AND created_at>$2::timestamptz-interval '1 hour'",[s.actor_id,stamp()])).rows[0].n)>=5)throw fail('You have requested several backups. Please wait before requesting another',429);
   const snap=await snapshot(c,s,r,await schema(c)),{manifest,files}=attachments(snap,r,s);
   const payload={from:process.env.EMAIL_FROM||process.env.RETAIL_RECEIPT_FROM,to:[s.email],subject:'InventoryOS Retail — '+r.name.replace(/[\r\n]/g,' ')+' store backup',html:'<div style="font-family:Arial,sans-serif;color:#171721;background:#fff;padding:28px"><h1>Inventory<span style="color:#6735b5">OS</span> Retail</h1><h2>Your store backup</h2><p>Store: <strong>'+esc(r.name)+'</strong></p><p>Your CSV files are attached, with product data in products.csv. Keep these files safely before confirming deletion in InventoryOS.</p><p>This email does not delete the store. Start with backup-index.csv for the file list and column notes.</p><p>Backup reference: '+requestId+'</p></div>',attachments:files};
   if(!H.sendEmail&&!payload.from)throw fail('Configure EMAIL_FROM before requesting the backup',503);
   // Stay comfortably below Resend's 40 MB encoded message limit. Never send a
   // truncated export or delete a store whose full backup cannot be emailed.
   if(Buffer.byteLength(JSON.stringify(payload))>28*1024*1024)throw fail('The complete CSV backup is too large for one email. Contact support to arrange a full backup; this store has not been deleted',413);
   return (await c.query(`INSERT INTO retail_store_deletions(id,workspace_id,inventory_id,owner_id,recipient,store_name,snapshot_hash,manifest,email_payload,billing_environment,subscription_ids,created_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,[requestId,s.workspace_id,inventory,s.actor_id,s.email,r.name,snap.hash,JSON.stringify(manifest),JSON.stringify(payload),B.mode(r),JSON.stringify(await subscriptions(c,r)),stamp(),new Date(now().getTime()+23*3600000).toISOString()])).rows[0];
  },true);
  if(['sent','deleting','deleted'].includes(job.status))return {success:true,backup_id:job.id,email:job.recipient,status:job.status};
  if(Date.parse(job.expires_at)<=now().getTime())throw fail('This backup request expired. Request a fresh backup',409);
  const claimed=await pool.query('UPDATE retail_store_deletions SET send_lease_until=$2 WHERE id=$1 AND (send_lease_until IS NULL OR send_lease_until<$3) RETURNING id',[job.id,new Date(now().getTime()+60000).toISOString(),stamp()]);if(!claimed.rows.length)throw fail('Your backup email is being sent. Wait a moment, then check again',409);
  try{
   let result;if(H.sendEmail)result=await H.sendEmail({...job.email_payload,idempotencyKey:'retail-store-backup/'+job.id});else{
    if(!process.env.RESEND_API_KEY)throw fail('Configure the Resend API key before requesting a backup',503);
    const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'retail-store-backup/'+job.id},body:JSON.stringify(job.email_payload),signal:AbortSignal.timeout(25000)});const body=await response.json();if(!response.ok)throw fail('Resend could not accept the backup email. Check email settings and try again; the store is unchanged',503);result=body;
   }
   const provider=result?.data?.id||result?.id;if(result?.error||!provider)throw fail('The email service did not confirm the backup. Try again; the store is unchanged',503);
   await pool.query("UPDATE retail_store_deletions SET status='sent',provider_id=$2,sent_at=$3,send_lease_until=NULL WHERE id=$1 AND status='prepared'",[job.id,provider,stamp()]);
   return {success:true,backup_id:job.id,email:job.recipient,status:'sent',files:job.manifest};
  }catch(e){await pool.query('UPDATE retail_store_deletions SET send_lease_until=NULL WHERE id=$1',[job.id]);throw e;}
 }
 async function cancelBilling(job){
  if(!job.subscription_ids.length)return [];const api=B.client({billing_environment:job.billing_environment}),result=[];
  try{for(const item of job.subscription_ids){
   if(item.checkout){const checkout=await api.checkout.sessions.retrieve(item.checkout);if(checkout.status==='open')await api.checkout.sessions.expire(item.checkout,{},{idempotencyKey:'retail-store-expire/'+job.id+'/'+item.kind});else if(checkout.status==='complete'&&String(checkout.subscription?.id||checkout.subscription||'')!==item.id)throw fail('A payment completed after the backup. Refresh billing and email a new backup before deleting',409);}
   if(!item.id)continue;let sub=await api.subscriptions.retrieve(item.id);
   if(typeof sub.livemode==='boolean'&&sub.livemode!==(job.billing_environment==='live')||String(sub.customer?.id||sub.customer)!==item.customer)throw fail('Store subscription details need reviewing before deletion',409);
   const meta=sub.metadata||{},expectedType=item.kind==='shop'?'inventoryos_retail':'inventoryos_retail_receipts';
   let matching=meta.inventory_id===job.inventory_id&&meta.workspace_id===job.workspace_id;
   if(!matching&&item.kind==='shop'&&meta.inventory_id&&meta.workspace_id)matching=Boolean((await pool.query('SELECT 1 FROM retail_store_moves WHERE source_inventory_id=$1 AND source_workspace_id=$2 AND inventory_id=$3 AND workspace_id=$4',[meta.inventory_id,meta.workspace_id,job.inventory_id,job.workspace_id])).rows.length);
   if(meta.product_type!==expectedType||!matching||meta.billing_environment&&meta.billing_environment!==job.billing_environment)throw fail('The subscription does not match this Retail store',409);
   // Do not remove past usage, create credits or trigger an immediate invoice.
   if(!['canceled','incomplete_expired'].includes(sub.status)&&!sub.cancel_at_period_end)sub=await api.subscriptions.update(sub.id,{cancel_at_period_end:true},{idempotencyKey:'retail-store-delete/'+job.id+'/'+item.kind});
   if(!['canceled','incomplete_expired'].includes(sub.status)&&!sub.cancel_at_period_end)throw fail('Stripe has not confirmed that renewal is stopped. The store has not been deleted',503);
   result.push({kind:item.kind,id:sub.id,status:sub.status,cancel_at_period_end:Boolean(sub.cancel_at_period_end),period_end:sub.current_period_end||sub.items?.data?.[0]?.current_period_end||null});
  }return result;}catch(e){e.retail_billing_result=result;throw e;}
 }
 async function purge(c,s,r){
  const v=[r.inventory_id,s.workspace_id],del=t=>c.query('DELETE FROM '+quote(t)+' WHERE inventory_id=$1 AND workspace_id=$2',v);
  await c.query('DELETE FROM retail_return_items WHERE return_id IN(SELECT id FROM retail_returns WHERE inventory_id=$1 AND workspace_id=$2)',v);
  for(const t of ['retail_receipt_emails','retail_reminders','retail_preorder_items','retail_returns','retail_loyalty_events','retail_bookings','retail_deposits','retail_waste','retail_price_reviews','retail_supplier_products','retail_reductions','retail_offers','retail_preorders','retail_delivery_items','retail_stock_events','retail_counts','retail_cash_events','retail_sale_items'])await del(t);
  await c.query('UPDATE retail_sales SET exchanged_from_id=NULL WHERE inventory_id=$1 AND workspace_id=$2',v);
  for(const t of ['retail_sales','retail_deliveries','retail_tasks','retail_reports','retail_audit','retail_customers','retail_till_sessions','retail_waste_batches','retail_parked_sales'])await del(t);
  await c.query('DELETE FROM retail_drawer_logins WHERE connection_till_id IN(SELECT id FROM retail_registered_tills WHERE inventory_id=$1) OR selected_till_id IN(SELECT id FROM retail_registered_tills WHERE inventory_id=$1)',[r.inventory_id]);
  await c.query('DELETE FROM retail_pos_sessions WHERE till_id IN(SELECT id FROM retail_registered_tills WHERE inventory_id=$1) OR connection_till_id IN(SELECT id FROM retail_registered_tills WHERE inventory_id=$1)',[r.inventory_id]);
  for(const t of ['retail_staff_sessions','retail_staff_attempts','retail_till_devices'])await del(t);
  // Staff shared with other stores survive, including their credentials and QR.
  const shared=(await c.query('SELECT t.id,MIN(a.inventory_id::text)::uuid destination FROM retail_team t JOIN retail_staff_assignments a ON a.staff_id=t.id AND a.inventory_id<>$1 WHERE t.inventory_id=$1 AND t.workspace_id=$2 GROUP BY t.id',v)).rows;
  for(const person of shared){await c.query('UPDATE retail_team SET inventory_id=$2 WHERE id=$1',[person.id,person.destination]);await c.query('UPDATE retail_staff_credentials SET inventory_id=$2 WHERE staff_id=$1',[person.id,person.destination]);}
  await del('retail_staff_assignments');await del('retail_staff_credentials');await del('retail_team');
  for(const t of ['retail_registered_tills','retail_business_settings','retail_counter_settings','retail_order_settings','retail_platform_events','retail_products'])await del(t);
  for(const t of ['retail_receipt_accounts','retail_reorder_emails'])await c.query('DELETE FROM '+quote(t)+' WHERE inventory_id=$1',[r.inventory_id]);
  await del('retail_stores');
  await c.query('DELETE FROM inventories WHERE id=$1 AND workspace_id=$2',v);
 }
 async function remove(req){
  if(req.body.confirmation!=='Confirm delete'||req.body.backup_received!==true)throw fail('Tick that you have received and saved the emailed CSV backup, and type Confirm delete exactly');
  await ensureSchema();const inventory=id(req.body.inventory_id),backupId=id(req.body.backup_id);
  const job=await tx(async c=>{
   const s=await owner(c,req);await lock(c,s.workspace_id);
   const j=(await c.query('SELECT * FROM retail_store_deletions WHERE id=$1 FOR UPDATE',[backupId])).rows[0];
   if(!j||j.workspace_id!==s.workspace_id||j.inventory_id!==inventory||j.owner_id!==s.actor_id||j.recipient!==s.email)throw fail('Request a backup for this store using your current account email first',409);
   if(j.status==='deleted')return j;
   if(!j.provider_id||!['sent','deleting'].includes(j.status)||Date.parse(j.expires_at)<=now().getTime())throw fail('Email a fresh CSV backup and confirm you have received it before deleting',409);
   const r=await shop(c,s,inventory);if(r.deleting_backup_id&&r.deleting_backup_id!==j.id)throw fail('Another deletion request is in progress',409);
   const blocked=await blockers(c,r);if(blocked.length)throw fail(blocked.join(' '),409);
   if((await snapshot(c,s,r,await schema(c))).hash!==j.snapshot_hash)throw fail('Store data changed after your backup. Email a fresh backup before deleting',409);
   await c.query('UPDATE retail_stores SET deleting_backup_id=$2 WHERE inventory_id=$1',[inventory,j.id]);await c.query("UPDATE retail_store_deletions SET status='deleting' WHERE id=$1",[j.id]);return j;
  });
  if(job.status==='deleted')return {success:true,deleted:true,replayed:true,inventory_id:inventory};
  let billing;
  try{
   billing=await cancelBilling(job);
   return await tx(async c=>{
    const s=await owner(c,req);await lock(c,s.workspace_id);
    // Wait for any already-running writers, then prevent a last-second stock,
    // email-worker or staff change between the final comparison and removal.
    const map=await schema(c),tables=[...map].filter(([t,cols])=>(cols.includes('inventory_id')&&t!=='retail_store_deletions')||['inventories','retail_return_items','retail_pos_sessions','retail_drawer_logins'].includes(t)).map(([t])=>t).sort();
    await c.query('LOCK TABLE '+tables.map(quote).join(',')+' IN SHARE ROW EXCLUSIVE MODE');
    const j=(await c.query('SELECT * FROM retail_store_deletions WHERE id=$1 FOR UPDATE',[job.id])).rows[0];if(j.status==='deleted')return {success:true,deleted:true,replayed:true,inventory_id:inventory};
    const r=await shop(c,s,inventory);if(r.deleting_backup_id!==job.id)throw fail('Deletion state changed. Reopen this store before continuing',409);
    const blocked=await blockers(c,r);if(blocked.length)throw fail(blocked.join(' '),409);
    if((await snapshot(c,s,r,map)).hash!==job.snapshot_hash)throw fail('Store data changed after your backup. Email a fresh backup before deleting',409);
    await purge(c,s,r);
    await c.query("UPDATE retail_store_deletions SET status='deleted',email_payload=NULL,billing_result=$2,deleted_at=$3 WHERE id=$1",[job.id,JSON.stringify(billing),stamp()]);
    // Other unused copies of this store's CSV data should not outlive deletion.
    await c.query('UPDATE retail_store_deletions SET email_payload=NULL WHERE inventory_id=$1',[inventory]);
    return {success:true,deleted:true,inventory_id:inventory,billing};
   });
  }catch(e){
   billing=billing||e.retail_billing_result;
   await tx(async c=>{await lock(c,job.workspace_id);await c.query('UPDATE retail_stores SET deleting_backup_id=NULL WHERE inventory_id=$1 AND deleting_backup_id=$2',[inventory,job.id]);await c.query("UPDATE retail_store_deletions SET status='sent',billing_result=$2 WHERE id=$1 AND status='deleting'",[job.id,JSON.stringify(billing||[])]);});
   if(billing?.length)e.message+=' Subscription renewals have already been stopped; store data is still intact.';throw e;
  }
 }
 async function webhook(event,environment){
  await ensureSchema();const object=event.data?.object||{},sub=event.type.startsWith('customer.subscription.')?object.id:object.subscription||object.parent?.subscription_details?.subscription,idValue=String(sub?.id||sub||'');
  if(!idValue)return false;
  const rows=(await pool.query("SELECT billing_environment,subscription_ids FROM retail_store_deletions WHERE status IN('deleting','deleted') AND subscription_ids @> $1::jsonb",[JSON.stringify([{id:idValue}])])).rows;
  if(!rows.length)return false;
  if(typeof event.livemode==='boolean'&&event.livemode!==(environment==='live'))throw fail('Stripe webhook environment mismatch',400);
  const customer=String(object.customer?.id||object.customer||'');
  if(!rows.some(r=>r.billing_environment===environment&&r.subscription_ids.some(x=>x.id===idValue&&x.customer===customer)))throw fail('Deleted store billing details do not match this event',409);
  return true;
 }
 async function cleanup(){await ensureSchema();await pool.query('UPDATE retail_store_deletions SET email_payload=NULL WHERE email_payload IS NOT NULL AND expires_at<$1',[stamp()]);}
 return {preview,backup,remove,webhook,cleanup};
}
module.exports={create,csv,clean};
