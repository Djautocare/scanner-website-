'use strict';
// Normal InventoryOS endpoints cannot modify Retail workspaces or shop IDs.
const pool=require('../database');
async function check(req){
 const workspaces=[req.headers?.['x-workspace-id'],req.body?.workspace_id].filter(Boolean).flatMap(x=>String(x).split(','));
 const inventories=[req.headers?.['x-inventory-ids'],req.headers?.['x-inventory-id'],req.body?.inventory_id].filter(Boolean).flatMap(x=>String(x).split(','));
 const path=String(req.path||'').match(/^\/(inventories\/)?([0-9a-f-]{36})\/?$/i);
 if(path)(path[1]?inventories:workspaces).push(path[2]);
 const valid=values=>values.map(x=>x.trim()).filter(x=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x));
 const result=await pool.query(`SELECT w.id FROM workspaces w WHERE COALESCE(to_jsonb(w)->>'workspace_kind','inventory')='retail' AND (w.id=ANY($1::uuid[]) OR EXISTS(SELECT 1 FROM inventories i WHERE i.workspace_id=w.id AND i.id=ANY($2::uuid[]))) LIMIT 1`,[valid(workspaces),valid(inventories)]);
 return !result.rows.length;
}
function wrap(original){return async function inventoryWorkspaceOnly(req,res,next){try{if(!await check(req))return res.status(409).json({success:false,error:'This is a Retail shop. Open InventoryOS Retail to manage it; reseller/manufacturing workspaces are separate.',retail_workspace:true});return original?original(req,res,next):next();}catch(e){next(e);}};}
module.exports=wrap();module.exports.wrap=wrap;module.exports.check=check;
