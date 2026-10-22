'use strict';
const {randomUUID:uuid}=require('node:crypto');
function createWaste(H){
 const {connect,device,lock,posScope,checkPin,failedAttempt,transaction,pool,args,id,integer,fail,now,business}=H;
 async function approved(c,s,approval){const a=(await c.query('SELECT st.active,cr.version,a.active AS assigned,a.can_manage FROM retail_team st JOIN retail_staff_credentials cr ON cr.staff_id=st.id JOIN retail_staff_assignments a ON a.staff_id=st.id AND a.inventory_id=$2 WHERE st.id=$1 AND st.workspace_id=$3',[approval?.id||null,s.inventory_id,s.workspace_id])).rows[0];if(!a?.active||!a.assigned||!a.can_manage||a.version!==approval.version)throw fail('Management permission changed. Cancel waste mode and ask an authorised manager to start it again',403);}
 async function start(req){
  let denied=false;const approval=await connect(async c=>{const t=await device(c,req);await lock(c,t.workspace_id);await posScope(c,req);const x=await checkPin(c,t,req.body.approval||{});if(x.invalid||!x.cr?.can_manage){await failedAttempt(c,x.buckets);denied=true;return null;}return {id:x.cr.staff_id,name:x.cr.name,number:x.cr.staff_number,version:x.cr.version};});
  if(denied)throw fail('Management approval denied. Check the staff code, PIN and store permission',403);
  const body={...req.body};delete body.approval;
  return transaction({...req,body,retail_pos:true},async(c,s,b)=>{await approved(c,s,approval);if(!['expired','damaged'].includes(b.reason))throw fail('Choose Out of date or Damaged');const a=(await c.query('SELECT * FROM retail_drawer_assignments WHERE till_id=$1 FOR UPDATE',[s.registered_till_id])).rows[0];if(a.transaction_id)throw fail('Finish, park or clear the transaction before starting waste mode',409);if(integer(b.version,'Drawer version')!==a.transaction_version)throw fail('Drawer changed. Refresh before starting waste mode',409);const transactionId=id(b.transaction_id);await c.query("UPDATE retail_drawer_assignments SET transaction_id=$2,transaction_kind='waste',phase='basket',items='[]',transaction_context=$3,transaction_version=transaction_version+1 WHERE till_id=$1",[a.till_id,transactionId,JSON.stringify({reason:b.reason,approved_by:approval,display_lines:[]})]);return {started:true};});
 }
 async function complete(req){
  return transaction(req,async(c,s,b)=>{
   const a=(await c.query('SELECT * FROM retail_drawer_assignments WHERE till_id=$1 FOR UPDATE',[s.registered_till_id])).rows[0];
   if(a?.transaction_kind!=='waste'||a.transaction_id!==b.drawer_transaction_id||a.phase!=='pending'||a.pending_request_id!==b.request_id)throw fail('Recover or confirm the active wastage basket first',409);
   const ctx=a.transaction_context;await approved(c,s,ctx.approved_by);
   if(!Array.isArray(b.items)||!b.items.length||b.items.length>100)throw fail('Scan between 1 and 100 different stock products');
   const clean=b.items.map(x=>({product_id:id(x.product_id),qty:integer(x.qty,'Waste quantity',1)}));
   const canonical=items=>JSON.stringify(items.map(x=>[x.product_id,Number(x.qty)]).sort((x,y)=>x[0].localeCompare(y[0])));
   if(canonical(clean)!==canonical(a.items))throw fail('The waste basket changed. Recover the original recording',409);
   const batch=uuid(),reference='WR-'+batch.slice(0,8).toUpperCase(),rows=[];
   for(const item of clean){const p=await H.product(c,s,item.product_id);rows.push({product_id:p.id,name:p.name,barcode:p.barcode,qty:item.qty});}
   const display=ctx.display_lines?.length?ctx.display_lines.map(line=>({...rows.find(p=>p.product_id===line.product_id),line_id:line.line_id,qty:line.qty})):rows;
   const till=(await c.query('SELECT name FROM retail_registered_tills WHERE id=$1',[s.registered_till_id])).rows[0],store=(await c.query('SELECT name FROM retail_stores WHERE inventory_id=$1',[s.inventory_id])).rows[0];
   // A stock write-off is not a sale. This receipt deliberately has no tax or payment fields.
   const receipt={id:batch,reference,created_at:now().toISOString(),store_name:s.settings.receipt_business_name||store.name,business_address:s.settings.receipt_business_address||'',till_name:till.name,staff:{id:s.pos_staff.id,name:s.pos_staff.name,number:s.pos_staff.number},approved_by:{name:ctx.approved_by.name,number:ctx.approved_by.number},reason:ctx.reason,items:display};
   await c.query('INSERT INTO retail_waste_batches(id,workspace_id,inventory_id,registered_till_id,receipt,actor_id) VALUES($1,$2,$3,$4,$5,$6)',[batch,...args(s),s.registered_till_id,JSON.stringify(receipt),s.actor_id]);
   for(const item of clean)await business.waste(c,{...s,waste_approver:ctx.approved_by,waste_batch_id:batch},{...item,reason:ctx.reason,note:'Wastage receipt '+reference});
   return {recorded:true,waste_receipt:receipt};
  });
 }
 return {start,complete};
}
module.exports={createWaste};
