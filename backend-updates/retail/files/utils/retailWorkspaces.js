'use strict';
// Retail businesses have dedicated workspaces and inventory IDs. Normal stock,
// subscriptions and current_workspace_id are never moved or selected here.
const {randomUUID:uuid}=require('node:crypto');
const quote=s=>'"'+String(s).replaceAll('"','""')+'"';
async function schema(c){
 await c.query(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS workspace_kind text NOT NULL DEFAULT 'inventory';
 CREATE TABLE IF NOT EXISTS retail_workspace_moves(source_workspace_id uuid PRIMARY KEY,retail_workspace_id uuid NOT NULL UNIQUE REFERENCES workspaces(id),created_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE IF NOT EXISTS retail_store_moves(source_inventory_id uuid PRIMARY KEY,source_workspace_id uuid NOT NULL,inventory_id uuid NOT NULL UNIQUE REFERENCES inventories(id),workspace_id uuid NOT NULL REFERENCES workspaces(id),created_at timestamptz NOT NULL DEFAULT now());`);
 // Only existing Retail rows move. Legacy stock and its original inventory stay.
 const sources=(await c.query("SELECT DISTINCT w.id,w.name,w.owner_user_id FROM workspaces w JOIN retail_stores s ON s.workspace_id=w.id WHERE w.workspace_kind='inventory' ORDER BY w.id")).rows;
 if(!sources.length)return;
 if((await c.query('SELECT till_id FROM retail_drawer_assignments WHERE transaction_id IS NOT NULL LIMIT 1')).rows.length)throw Error('Finish or cancel all till transactions and sync saved sales before separating Retail workspaces. Nothing was migrated.');
 // Composite ledger FKs must remain valid at commit, across a whole shop move.
 const constraints=(await c.query("SELECT rel.relname AS table_name,con.conname FROM pg_constraint con JOIN pg_class rel ON rel.oid=con.conrelid JOIN pg_namespace ns ON ns.oid=rel.relnamespace WHERE con.contype='f' AND ns.nspname=current_schema() AND rel.relname LIKE 'retail_%' AND NOT con.condeferrable")).rows;
 for(const r of constraints)await c.query(`ALTER TABLE ${quote(r.table_name)} ALTER CONSTRAINT ${quote(r.conname)} DEFERRABLE INITIALLY IMMEDIATE`);
 await c.query('SET CONSTRAINTS ALL DEFERRED');
 const columns=(await c.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name LIKE 'retail_%'")).rows;
 const tables=[...new Set(columns.filter(r=>r.column_name==='workspace_id').map(r=>r.table_name))].filter(t=>!['retail_settings','retail_stores','retail_workspace_moves','retail_store_moves'].includes(t));
 for(const w of sources){
  const wid=uuid();await createWorkspace(c,wid,w.owner_user_id,w.name+' — Retail');
  await c.query('INSERT INTO retail_workspace_moves(source_workspace_id,retail_workspace_id) VALUES($1,$2)',[w.id,wid]);
  // Preserve access for the existing business team. Future memberships are separate.
  const members=(await c.query("SELECT user_id,role,status FROM workspace_members WHERE workspace_id=$1 AND status='active'",[w.id])).rows;
  for(const m of members)if(m.user_id!==w.owner_user_id)await c.query('INSERT INTO workspace_members(workspace_id,user_id,role,status) VALUES($1,$2,$3,$4)',[wid,m.user_id,m.role,m.status]);
  const settings=(await c.query('SELECT * FROM retail_settings WHERE workspace_id=$1',[w.id])).rows[0];
  if(settings){await c.query('DELETE FROM retail_settings WHERE workspace_id=$1',[wid]);const keys=Object.keys(settings);await c.query(`INSERT INTO retail_settings(${keys.map(quote).join(',')}) VALUES(${keys.map((_,i)=>'$'+(i+1)).join(',')})`,keys.map(k=>k==='workspace_id'?wid:settings[k]));await c.query('UPDATE retail_settings SET enabled=true WHERE workspace_id=$1',[wid]);}
  const stores=(await c.query('SELECT * FROM retail_stores WHERE workspace_id=$1',[w.id])).rows;
  for(const store of stores){
   const iid=uuid();await c.query('INSERT INTO inventories(id,workspace_id,name,is_default) VALUES($1,$2,$3,$4)',[iid,wid,store.name,stores[0].inventory_id===store.inventory_id]);
   await c.query('INSERT INTO retail_store_moves(source_inventory_id,source_workspace_id,inventory_id,workspace_id) VALUES($1,$2,$3,$4)',[store.inventory_id,w.id,iid,wid]);
   await c.query('UPDATE retail_stores SET workspace_id=$2,inventory_id=$3 WHERE inventory_id=$1',[store.inventory_id,wid,iid]);
   await c.query('UPDATE retail_reorder_emails SET inventory_id=$2 WHERE inventory_id=$1',[store.inventory_id,iid]);
   for(const table of tables){if(columns.some(x=>x.table_name===table&&x.column_name==='inventory_id'))await c.query(`UPDATE ${quote(table)} SET workspace_id=$3,inventory_id=$4 WHERE workspace_id=$1 AND inventory_id=$2`,[w.id,store.inventory_id,wid,iid]);}
  }
  for(const table of tables)if(!columns.some(x=>x.table_name===table&&x.column_name==='inventory_id'))await c.query(`UPDATE ${quote(table)} SET workspace_id=$2 WHERE workspace_id=$1`,[w.id,wid]);
  // Audit entries without a store still belong to the migrated Retail business.
  await c.query('UPDATE retail_audit SET workspace_id=$2 WHERE workspace_id=$1 AND inventory_id IS NULL',[w.id,wid]);
  await c.query('UPDATE retail_platform_events SET workspace_id=$2 WHERE workspace_id=$1 AND inventory_id IS NULL',[w.id,wid]);
  await c.query('UPDATE retail_settings SET enabled=false WHERE workspace_id=$1',[w.id]);
 }
 await c.query('SET CONSTRAINTS ALL IMMEDIATE');
}
async function createWorkspace(c,wid,owner,name){
 await c.query("INSERT INTO workspaces(id,owner_user_id,name,workspace_kind) VALUES($1,$2,$3,'retail')",[wid,owner,name]);
 await c.query("INSERT INTO workspace_members(workspace_id,user_id,role,status) VALUES($1,$2,'owner','active')",[wid,owner]);
 await c.query('INSERT INTO workspace_settings(workspace_id) VALUES($1)',[wid]);
 await c.query('INSERT INTO retail_settings(workspace_id,enabled) VALUES($1,true)',[wid]);
}
function create(H){
 const {pool,ensureSchema,id,text,fail}=H;
 async function directory(req){await ensureSchema();const user=id(req.user.id);const workspaces=(await pool.query(`SELECT w.id,w.name,CASE WHEN w.owner_user_id=$1 THEN 'owner' ELSE wm.role END AS role FROM workspaces w LEFT JOIN workspace_members wm ON wm.workspace_id=w.id AND wm.user_id=$1 AND wm.status='active' WHERE w.workspace_kind='retail' AND (w.owner_user_id=$1 OR wm.user_id=$1) ORDER BY w.name,w.id`,[user])).rows;
  const stores=(await pool.query(`SELECT i.id,i.workspace_id,w.name AS workspace_name,i.name,r.name AS display_name,CASE WHEN w.owner_user_id=$1 THEN 'owner' ELSE wm.role END AS workspace_role FROM retail_stores r JOIN inventories i ON i.id=r.inventory_id AND i.workspace_id=r.workspace_id JOIN workspaces w ON w.id=r.workspace_id LEFT JOIN workspace_members wm ON wm.workspace_id=w.id AND wm.user_id=$1 AND wm.status='active' WHERE w.workspace_kind='retail' AND (w.owner_user_id=$1 OR wm.user_id=$1) ORDER BY r.name,i.id`,[user])).rows;
  return {success:true,separate_workspaces:true,workspaces,stores};
 }
 async function resolve(req,res,next){try{await ensureSchema();const d=await directory(req),requested=String(req.headers['x-workspace-id']||'');const w=d.workspaces.find(w=>w.id===requested)||(!requested?d.workspaces[0]:null);if(!w)return res.status(409).json({success:false,error:'Choose or create a Retail business. InventoryOS workspaces cannot be used as Retail shops.',retail_setup_required:true});req.workspace={id:w.id,name:w.name,role:w.role};next();}catch(e){next(e);}}
 async function createBusiness(req){await ensureSchema();const name=text(req.body.name,'Retail business name'),owner=id(req.user.id),wid=uuid(),iid=uuid(),c=await pool.connect();try{await c.query('BEGIN');await c.query("SELECT pg_advisory_xact_lock(hashtextextended('retail-create:'||$1,0))",[owner]);const count=Number((await c.query("SELECT COUNT(*)::int n FROM workspaces WHERE owner_user_id=$1 AND workspace_kind='retail'",[owner])).rows[0].n);if(count>=100)throw fail('Contact support to create more than 100 Retail businesses');await createWorkspace(c,wid,owner,name);await c.query('INSERT INTO inventories(id,workspace_id,name,is_default) VALUES($1,$2,$3,true)',[iid,wid,name]);await c.query('INSERT INTO retail_stores(inventory_id,workspace_id,name,customer_number) VALUES($1,$2,$3,$4)',[iid,wid,name,'S'+uuid().replaceAll('-','')]);await c.query('COMMIT');return {success:true,workspace:{id:wid,name,role:'owner'},inventory_id:iid};}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 return {directory,resolve,createBusiness};
}
module.exports={schema,create,createWorkspace};
