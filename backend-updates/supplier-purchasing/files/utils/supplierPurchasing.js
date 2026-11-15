'use strict';
const {randomUUID,createHash}=require('node:crypto');
const uuid=value=>typeof value==='string'&&/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(value);
const error=(message,statusCode=400)=>Object.assign(new Error(message),{statusCode});
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const roles=['owner','admin','member','viewer'];
const finance=role=>role==='owner'||role==='admin';
const key=value=>value.toLowerCase().replace(/\s+/g,' ').trim();

function text(value,label,max,required=false) {
 const trimmed=typeof value==='string'?value.trim():'';
 if((required&&!trimmed)||trimmed.length>max)throw error('Check '+label+'.');
 return trimmed;
}
function date(value,label) {
 const calendar=typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)?new Date(value+'T00:00:00Z'):null;
 if(!calendar||!Number.isFinite(calendar.getTime())||calendar.toISOString().slice(0,10)!==value)throw error('Enter a valid '+label+'.');
 return value;
}
function money(value) {
 if(!Number.isSafeInteger(value)||value<1||value>9999999999)throw error('Enter an amount from £0.01 to £99,999,999.99.');
 return value;
}
function reorderPence(value) {
 const decimal=String(value??'');
 if(!/^\d{1,8}(?:\.\d{1,2})?$/.test(decimal))throw error('Set each reorder’s total cost before preparing the purchase order.',409);
 const [pounds,fraction='']=decimal.split('.');
 return Number(pounds)*100+Number(fraction.padEnd(2,'0'));
}
function recordId(value) {
 if(!uuid(value))throw error('Record unavailable.',404);
 return value;
}
function retryId(value) {
 if(!uuid(value))throw error('Refresh the page and try again.');
 return value;
}
function scope(req,mode='read') {
 const {id,inventory_ids,role}=req.workspace||{};
 if(!uuid(id)||!roles.includes(role)||!Array.isArray(inventory_ids)||!inventory_ids.every(uuid))throw error('Select an inventory workspace.',403);
 if(mode!=='read'&&(!uuid(req.user?.id)||role==='viewer'||(mode==='finance'&&!finance(role))))throw error('You do not have permission for this change.',403);
 return {id,inventories:inventory_ids,role,user:req.user?.id};
}
function replay(row,fingerprint) {
 if(row.request_hash!==fingerprint)throw error('This request has already been used for different details.',409);
 return {id:row.id,unchanged:true};
}

function create({pool}) {
 async function transaction(work) {
  const client=await pool.connect();
  try {
   await client.query('BEGIN');
   const result=await work(client);
   await client.query('COMMIT');
   return {success:true,...result};
  }catch(err){
   await client.query('ROLLBACK').catch(()=>{});
   if(err.code==='23505')throw error('A reorder, invoice number or payment reference is already recorded.',409);
   throw err;
  }finally{client.release();}
 }
 async function lockedPurchase(client,s,id) {
  const result=await client.query(`SELECT p.* FROM supplier_purchase_orders p
   JOIN inventories i ON i.id=p.inventory_id AND i.workspace_id=p.workspace_id
   WHERE p.id=$1 AND p.workspace_id=$2 AND p.inventory_id=ANY($3::uuid[]) FOR UPDATE OF p`,
   [id,s.id,s.inventories]);
  if(!result.rows.length)throw error('Purchase order unavailable.',404);
  return result.rows[0];
 }
 async function list(req) {
  const s=scope(req);
  const orders=(await pool.query(`SELECT p.id,p.supplier,p.status,p.version,p.order_number,p.inventory_id,
   p.total_pence,p.buyer,p.supplier_details,p.notes,p.created_at,p.issued_at,
   COUNT(l.line_no)::int line_count,
   COUNT(*) FILTER(WHERE r.status IN ('received','complete'))::int received_count,
   COUNT(l.line_no) FILTER(WHERE r.id IS NULL)::int missing_count
   FROM supplier_purchase_orders p JOIN inventories i ON i.id=p.inventory_id AND i.workspace_id=p.workspace_id
   LEFT JOIN supplier_purchase_order_lines l ON l.purchase_order_id=p.id
   LEFT JOIN reorder_orders r ON r.id=l.reorder_order_id AND r.workspace_id=p.workspace_id
   WHERE p.workspace_id=$1 AND p.inventory_id=ANY($2::uuid[])
   GROUP BY p.id ORDER BY p.created_at DESC,p.id DESC LIMIT 100`,[s.id,s.inventories])).rows;
  const canDraft = s.role !== 'viewer';
  const eligible = canDraft ? (await pool.query(`SELECT r.id::text,r.inventory_id,r.quantity,r.total_cost,
   p.description AS item_name,i.name AS inventory_name
   FROM reorder_orders r JOIN inventories i ON i.id=r.inventory_id AND i.workspace_id=r.workspace_id
   JOIN products p ON p.id=r.product_id AND p.inventory_id=r.inventory_id AND (p.workspace_id=r.workspace_id OR p.workspace_id IS NULL)
   WHERE r.workspace_id=$1 AND r.inventory_id=ANY($2::uuid[]) AND r.status='ordered' AND r.total_cost IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM supplier_purchase_order_lines l WHERE l.reorder_order_id=r.id AND NOT l.released)
   ORDER BY r.created_at DESC,r.id DESC`,[s.id,s.inventories])).rows : [];
  return {success:true,orders,eligible,permissions:{draft:canDraft,finance:finance(s.role)}};
 }
 async function detail(req) {
  const s=scope(req);
  const id=recordId(req.params.id);
  const order=(await pool.query(`SELECT p.id,p.supplier,p.status,p.version,p.order_number,p.inventory_id,p.total_pence,
   p.buyer,p.supplier_details,p.notes,p.created_at,p.issued_at
   FROM supplier_purchase_orders p JOIN inventories i ON i.id=p.inventory_id AND i.workspace_id=p.workspace_id
   WHERE p.id=$1 AND p.workspace_id=$2 AND p.inventory_id=ANY($3::uuid[])`,[id,s.id,s.inventories])).rows[0];
  if(!order)throw error('Purchase order unavailable.',404);
  const [lines,bills]=await Promise.all([
   pool.query(`SELECT l.original_reorder_id,l.description,l.barcode,l.quantity,l.total_pence,r.status AS stock_status
    FROM supplier_purchase_order_lines l LEFT JOIN reorder_orders r ON r.id=l.reorder_order_id AND r.workspace_id=$2
    WHERE l.purchase_order_id=$1 ORDER BY l.line_no`,[id,s.id]),
   finance(s.role)?pool.query(`SELECT i.id,i.reference,i.invoice_date::text,i.due_date::text,i.amount_pence,
    COALESCE(SUM(p.amount_pence),0)::bigint paid_pence,
    (i.due_date < (now() AT TIME ZONE 'Europe/London')::date AND COALESCE(SUM(p.amount_pence),0)<i.amount_pence) AS overdue,
    COALESCE(JSONB_AGG(JSONB_BUILD_OBJECT('amount_pence',p.amount_pence,'paid_on',p.paid_on,'reference',p.reference)
     ORDER BY p.recorded_at,p.id) FILTER(WHERE p.id IS NOT NULL),'[]'::jsonb) payments
    FROM supplier_purchase_invoices i LEFT JOIN supplier_purchase_payments p ON p.invoice_id=i.id
    WHERE i.workspace_id=$1 AND i.purchase_order_id=$2 GROUP BY i.id ORDER BY i.invoice_date,i.id`,[s.id,id]):Promise.resolve({rows:[]})
  ]);
  return {success:true,order,lines:lines.rows,invoices:bills.rows,permissions:{finance:finance(s.role)}};
 }
 async function draft(req) {
  const s=scope(req,'write'),body=req.body||{},request=retryId(body.request_id);
  if(!Array.isArray(body.order_ids)||body.order_ids.length===0||body.order_ids.length>50)throw error('Select one to fifty existing reorders.');
  if(!body.order_ids.every(v=>typeof v==='string'&&/^[1-9]\d{0,17}$/.test(v)))throw error('Choose valid reorder rows.');
  const ids=[...new Set(body.order_ids)].sort();
  if(ids.length!==body.order_ids.length)throw error('Select each reorder once.');
  const data={ids,supplier:text(body.supplier,'the supplier name',140,true),supplier_details:text(body.supplier_details,'supplier details',400),
   buyer:text(body.buyer,'your business name',140,true),notes:text(body.notes,'the notes',400)};
  const fingerprint=hash(data);
  return transaction(async client=>{
   await client.query("SELECT pg_advisory_xact_lock(hashtextextended('supplier-purchasing:'||$1,0))",[s.id]);
   const old=(await client.query('SELECT id,inventory_id,create_request_hash AS request_hash FROM supplier_purchase_orders WHERE workspace_id=$1 AND create_request_id=$2',[s.id,request])).rows[0];
   if(old) {
    if(!s.inventories.includes(old.inventory_id))throw error('Purchase order unavailable.',404);
    return replay(old,fingerprint);
   }
   const rows=(await client.query(`SELECT r.id,r.inventory_id,r.quantity,r.total_cost,p.description,p.barcode
    FROM reorder_orders r JOIN inventories i ON i.id=r.inventory_id AND i.workspace_id=r.workspace_id
    JOIN products p ON p.id=r.product_id AND p.inventory_id=r.inventory_id AND (p.workspace_id=r.workspace_id OR p.workspace_id IS NULL)
    WHERE r.workspace_id=$1 AND r.inventory_id=ANY($2::uuid[]) AND r.id=ANY($3::bigint[])
     AND r.status='ordered' ORDER BY r.id FOR UPDATE OF r`,[s.id,s.inventories,ids])).rows;
   if(rows.length!==ids.length||new Set(rows.map(row=>row.inventory_id)).size!==1)throw error('Select pending reorders in one inventory.',409);
   const prices=rows.map(row=>reorderPence(row.total_cost));
   const total=prices.reduce((a,b)=>a+b,0);
   const id=randomUUID();
   await client.query(`INSERT INTO supplier_purchase_orders(id,workspace_id,inventory_id,create_request_id,
    create_request_hash,creator_id,supplier,supplier_key,supplier_details,buyer,notes,total_pence)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,[id,s.id,rows[0].inventory_id,request,fingerprint,s.user,data.supplier,key(data.supplier),data.supplier_details,data.buyer,data.notes,total]);
   for(const [index,row] of rows.entries()){
    await client.query(`INSERT INTO supplier_purchase_order_lines(purchase_order_id,line_no,reorder_order_id,original_reorder_id,description,barcode,quantity,total_pence)
     VALUES($1,$2,$3,$3,$4,$5,$6,$7)`,[id,index+1,row.id,row.description,row.barcode,row.quantity,prices[index]]);
   }
   return {id};
  });
 }
 async function change(req) {
  const s=scope(req,'finance'),body=req.body||{},id=recordId(req.params.id);
  const to={approve:'approved',issue:'issued',cancel:'cancelled'}[body.action];
  if(!['approve','issue','cancel'].includes(body.action)||!Number.isInteger(body.version)||body.version<0)throw error('Choose a valid document action.');
  return transaction(async client=>{
   const row=await lockedPurchase(client,s,id);
   if(row.status===to&&row.version===body.version+1)return {id,unchanged:true};
   if(row.version!==body.version)throw error('The purchase order changed. Refresh it and try again.',409);
   if(body.action==='cancel'){
    if(!['draft','approved'].includes(row.status))throw error('Only draft or approved purchase orders can be cancelled here.',409);
    await client.query("UPDATE supplier_purchase_orders SET status='cancelled',cancelled_at=now(),cancelled_by=$2,version=version+1 WHERE id=$1",[id,s.user]);
    await client.query('UPDATE supplier_purchase_order_lines SET released=true WHERE purchase_order_id=$1',[id]);
    return {id};
   }
   if(row.status!==(body.action==='approve'?'draft':'approved'))throw error('This purchase order is not ready for that action.',409);
   const lines=(await client.query(`SELECT l.quantity AS original_qty,l.total_pence,r.quantity,r.total_cost,r.status
    FROM supplier_purchase_order_lines l JOIN reorder_orders r ON r.id=l.reorder_order_id
    WHERE l.purchase_order_id=$1 AND r.workspace_id=$2 AND r.inventory_id=$3
    ORDER BY r.id FOR UPDATE OF r`,[id,s.id,row.inventory_id])).rows;
   const expected=(await client.query('SELECT COUNT(*)::int n FROM supplier_purchase_order_lines WHERE purchase_order_id=$1',[id])).rows[0].n;
   if(!lines.length||lines.length!==expected||lines.some(item=>item.status!=='ordered'||item.quantity!==item.original_qty||reorderPence(item.total_cost)!==Number(item.total_pence)))throw error('A linked reorder changed. Cancel this document and prepare a fresh draft.',409);
   if(body.action==='approve'){
    await client.query("UPDATE supplier_purchase_orders SET status='approved',approved_at=now(),approved_by=$2,version=version+1 WHERE id=$1",[id,s.user]);
   }else{
    const counter=(await client.query(`INSERT INTO supplier_purchase_order_counters(workspace_id,last_number) VALUES($1,1)
      ON CONFLICT(workspace_id) DO UPDATE SET last_number=supplier_purchase_order_counters.last_number+1 RETURNING last_number`,[s.id])).rows[0].last_number;
    await client.query("UPDATE supplier_purchase_orders SET status='issued',order_number=$2,issued_at=now(),issued_by=$3,version=version+1 WHERE id=$1",[id,counter,s.user]);
   }
   return {id};
  });
 }
 async function bill(req) {
  const s=scope(req,'finance'),body=req.body||{},id=recordId(req.params.id),request=retryId(body.request_id);
  const data={reference:text(body.reference,'supplier invoice number',100,true),invoice_date:date(body.invoice_date,'invoice date'),due_date:date(body.due_date,'due date'),amount_pence:money(body.amount_pence)};
  if(data.due_date<data.invoice_date)throw error('The due date must be on or after the invoice date.');
  const fingerprint=hash(data);
  return transaction(async client=>{
   const purchase=await lockedPurchase(client,s,id);
   if(purchase.status!=='issued')throw error('Issue the purchase order before adding invoices.',409);
   const old=(await client.query('SELECT id,request_hash FROM supplier_purchase_invoices WHERE purchase_order_id=$1 AND request_id=$2',[id,request])).rows[0];
   if(old)return replay(old,fingerprint);
   const invoice=randomUUID();
   await client.query(`INSERT INTO supplier_purchase_invoices(id,workspace_id,purchase_order_id,supplier_key,
    reference,reference_key,request_id,request_hash,invoice_date,due_date,amount_pence,recorded_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,[invoice,s.id,id,purchase.supplier_key,data.reference,key(data.reference),request,fingerprint,data.invoice_date,data.due_date,data.amount_pence,s.user]);
   return {id:invoice};
  });
 }
 async function payment(req) {
  const s=scope(req,'finance'),body=req.body||{},purchaseId=recordId(req.params.id),invoiceId=recordId(req.params.invoice),request=retryId(body.request_id);
  const data={paid_on:date(body.paid_on,'payment date'),reference:text(body.reference,'the unique payment reference',120,true),amount_pence:money(body.amount_pence)};
  const fingerprint=hash(data);
  return transaction(async client=>{
   const purchase=await lockedPurchase(client,s,purchaseId);
   if(purchase.status!=='issued')throw error('Purchase order unavailable.',404);
   const invoice=(await client.query('SELECT id,amount_pence FROM supplier_purchase_invoices WHERE id=$1 AND workspace_id=$2 AND purchase_order_id=$3 FOR UPDATE',[invoiceId,s.id,purchaseId])).rows[0];
   if(!invoice)throw error('Supplier invoice unavailable.',404);
   const old=(await client.query('SELECT id,request_hash FROM supplier_purchase_payments WHERE invoice_id=$1 AND request_id=$2',[invoice.id,request])).rows[0];
   if(old)return replay(old,fingerprint);
   const balance=(await client.query('SELECT COALESCE(SUM(amount_pence),0)::bigint value FROM supplier_purchase_payments WHERE invoice_id=$1',[invoice.id])).rows[0].value;
   if(data.amount_pence>Number(invoice.amount_pence)-Number(balance))throw error('The payment exceeds the outstanding invoice balance.',409);
   const id=randomUUID();
   await client.query(`INSERT INTO supplier_purchase_payments(id,invoice_id,request_id,request_hash,amount_pence,paid_on,reference,reference_key,recorded_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[id,invoice.id,request,fingerprint,data.amount_pence,data.paid_on,data.reference,key(data.reference),s.user]);
   return {id};
  });
 }
 return {list,detail,draft,change,bill,payment};
}

function routes(pool) {
 const router=require('express').Router();
 const service=create({pool});
 const run=fn=>async(req,res)=>{
  try{res.set('Cache-Control','no-store').json(await fn(req));}
  catch(err){res.status(err.statusCode||503).json({success:false,error:err.statusCode?err.message:'Supplier documents are unavailable. Please try again.'});}
 };
 router.get('/',run(service.list));
 router.post('/',run(service.draft));
 router.get('/:id',run(service.detail));
 router.post('/:id/action',run(service.change));
 router.post('/:id/invoices',run(service.bill));
 router.post('/:id/invoices/:invoice/payments',run(service.payment));
 return router;
}
module.exports={create,routes};
