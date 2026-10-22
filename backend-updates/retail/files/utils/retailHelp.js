'use strict';
// Reuse the existing help records, rate limits, audit trail and email worker.
function create({pool,ensureSchema,scope,fail,helpService}){
 function help(){
  if(helpService)return helpService;
  try{return require('./helpRequests');}catch(e){if(e.code==='MODULE_NOT_FOUND')throw fail('The existing Help backend needs installing before Retail requests can be sent',503);throw e;}
 }
 async function context(req){
  await ensureSchema();
  // Support remains available when a shop's paid access has ended, including viewers.
  const s=await scope(pool,{...req,headers:{...req.headers,'x-retail-till-id':''}},{enabled:false,entitled:false});
  const shop=(await pool.query('SELECT name FROM retail_stores WHERE workspace_id=$1 AND inventory_id=$2',[s.workspace_id,s.inventory_id])).rows[0];
  if(!shop)throw fail('Choose an available Retail shop before opening Help',404);
  const account=(await pool.query('SELECT id,name,email FROM users WHERE id=$1',[s.actor_id])).rows[0];if(!account)throw fail('Account unavailable',401);
  return {s,account,workspace:{id:s.workspace_id,name:s.workspace_name},shop:{id:s.inventory_id,name:shop.name}};
 }
 async function handle(fn){try{return await fn();}catch(e){if(e.status&&!e.statusCode)e.statusCode=e.status;throw e;}}
 async function read(req){return handle(async()=>{
  const c=await context(req),h=help();await h.ensureSchema();
  const requests=(await pool.query('SELECT * FROM help_requests WHERE user_id=$1 AND workspace_id=$2 ORDER BY created_at DESC LIMIT 20',[c.account.id,c.workspace.id])).rows.map(h.publicRequest);
  return {success:true,account_email:c.account.email,workspace:c.workspace,shop:c.shop,requests};
 });}
 async function send(req){return handle(async()=>{
  const c=await context(req),h=help();
  const label='InventoryOS Retail · '+c.workspace.name+(c.shop.name===c.workspace.name?'':' · '+c.shop.name);
  const result=await h.createRequest(c.account,{id:c.workspace.id,name:label},req.body);
  h.wake();return {success:true,...result,message:'Your Retail help request is saved. We’ll reply to your account email.'};
 });}
 return {read,send};
}
module.exports={create};
