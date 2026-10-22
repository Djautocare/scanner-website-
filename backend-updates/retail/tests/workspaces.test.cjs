'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const fixture=require('./till-fixture.cjs'),{createService,id,text,fail}=require('../files/utils/retail');
(async()=>{
 const f=await fixture(),{db,pool,owner,workspace,inventory,other,water,P}=f;
 await db.exec('CREATE TABLE workspace_settings(workspace_id uuid PRIMARY KEY REFERENCES workspaces(id));');
 // Existing Retail data and ordinary stock deliberately share the old inventory ID.
 await db.exec('CREATE TABLE inventory(id uuid PRIMARY KEY,workspace_id uuid,inventory_id uuid,qty integer);');
 await db.query('INSERT INTO inventory VALUES($1,$2,$3,27)',[crypto.randomUUID(),workspace,inventory]);
 const token=await f.login();
 const tx=crypto.randomUUID();await P.drawers.transaction(f.pos('/transaction',{action:'save',transaction_id:tx,kind:'sale',version:0,items:[{product_id:water.id,qty:1,unit_price_pence:300}]},token));
 await db.query("UPDATE workspaces SET workspace_kind='inventory' WHERE id=$1",[workspace]);
 const migrate=()=>createService({pool,calculateAccess:()=>({allowed:false})}).ensureSchema();
 await assert.rejects(migrate,/Finish or cancel/);assert.equal((await db.query('SELECT * FROM retail_workspace_moves')).rows.length,0);
 await P.drawers.transaction(f.pos('/transaction',{action:'cancel',transaction_id:tx,version:1},token));
 await migrate();
 const moves=(await db.query('SELECT * FROM retail_store_moves ORDER BY source_inventory_id')).rows;assert.equal(moves.length,2);
 const moved=moves.find(x=>x.source_inventory_id===inventory),wid=moved.workspace_id,iid=moved.inventory_id;
 assert.notEqual(wid,workspace);assert.notEqual(iid,inventory);
 assert.equal((await db.query('SELECT workspace_id FROM inventories WHERE id=$1',[inventory])).rows[0].workspace_id,workspace);
 assert.equal((await db.query('SELECT qty FROM inventory WHERE inventory_id=$1',[inventory])).rows[0].qty,27);
 assert.equal((await db.query('SELECT workspace_kind FROM workspaces WHERE id=$1',[wid])).rows[0].workspace_kind,'retail');
 assert.equal((await db.query('SELECT workspace_id,inventory_id,stock_qty FROM retail_products WHERE id=$1',[water.id])).rows[0].inventory_id,iid);
 assert.equal((await db.query('SELECT workspace_id FROM retail_products WHERE id=$1',[water.id])).rows[0].workspace_id,wid);
 const fresh=createService({pool,calculateAccess:()=>({allowed:false})});await fresh.ensureSchema();assert.equal((await db.query('SELECT * FROM retail_store_moves')).rows.length,2);
 const sreq={...f.req(''),workspace:{id:wid},headers:{'x-workspace-id':wid,'x-inventory-ids':iid}};
 assert.equal((await fresh.overview(sreq)).products.find(p=>p.id===water.id).stock_qty,20);
 await assert.rejects(()=>fresh.overview(f.req('')),/separate Retail/);
 // Paired devices and staff identities survive the shop move without reprinting QR.
 assert.equal((await fresh.platform.state(f.pos('',{},token))).store.id,iid);
 const workspaces=require('../files/utils/retailWorkspaces').create({pool,ensureSchema:fresh.ensureSchema,id,text,fail});
 const directory=await workspaces.directory({user:{id:owner}});assert.equal(directory.workspaces.length,1);assert.equal(directory.stores.length,2);assert(!directory.workspaces.some(w=>w.id===workspace));
 const newBusiness=await workspaces.createBusiness({user:{id:owner},body:{name:'Another retail business'}});assert(newBusiness.inventory_id);assert.notEqual(newBusiness.workspace.id,wid);assert.equal((await workspaces.directory({user:{id:owner}})).stores.length,3);
 const access=fresh.platform.entitlement({enabled:true,stripe_status:'active',paid_plan:'retail',paid_pairs:0,settings:{}});assert.equal(access.allowed,true);assert.equal(access.unlimited_tills,true);assert.equal(access.till_allowance,null);assert(Object.values(access.features).every(Boolean));
 const tills=[];for(let n=0;n<5;n++)tills.push((await fresh.platform.ownerChange({...sreq,body:{action:'register-till',inventory_id:iid,name:'Extra '+n}})).till_id);assert.equal(tills.length,5);
 await fresh.transaction({...sreq,originalUrl:'/retail/settings',body:{request_id:crypto.randomUUID(),enabled:true,report_time:'18:00',timezone:'Europe/London',receipt_business_name:'Only this shop',vat_receipts:false}},fresh.settings,{admin:true});
 assert.equal((await fresh.overview(sreq)).settings.receipt_business_name,'Only this shop');
 const otherNew=moves.find(x=>x.source_inventory_id===other);assert.notEqual((await fresh.overview({...sreq,headers:{'x-workspace-id':wid,'x-inventory-ids':otherNew.inventory_id}})).settings.receipt_business_name,'Only this shop');
 await db.query('DELETE FROM inventories WHERE id=$1',[other]);assert((await db.query('SELECT inventory_id FROM retail_stores WHERE inventory_id=$1',[otherNew.inventory_id])).rows.length);
 process.env.STRIPE_PRICE_RETAIL_MONTHLY='price_flat_mock';const sub={id:'sub_legacy_scope',customer:'cus_legacy_scope',status:'active',metadata:{product_type:'inventoryos_retail',workspace_id:workspace,inventory_id:inventory},items:{data:[{id:'si_flat',quantity:1,price:{id:'price_flat_mock'}}]}};
 await fresh.platform.webhook({type:'customer.subscription.updated',data:{object:sub}},{subscriptions:{retrieve:async()=>sub}});assert.equal((await db.query('SELECT paid_plan FROM retail_stores WHERE inventory_id=$1',[iid])).rows[0].paid_plan,'retail');
 // Explicit override expiry/blocking still wins over an unlimited-till licence.
 const blocked=fresh.platform.entitlement({enabled:true,stripe_status:'active',paid_plan:'retail',override_plan:'blocked',feature_overrides:{loyalty:true},settings:{}});assert.equal(blocked.allowed,false);assert.equal(blocked.features.loyalty,false);
 const stranger=crypto.randomUUID();await db.query('INSERT INTO users(id) VALUES($1)',[stranger]);assert.equal((await workspaces.directory({user:{id:stranger}})).stores.length,0);
 // Ordinary API guard rejects both Retail workspace headers and shop IDs.
 const Module=require('node:module'),filename=require.resolve('../files/middleware/inventoryWorkspaceOnly'),old=Module._load;let guard;try{Module._load=function(name,...args){if(name==='../database')return pool;return old.call(this,name,...args);};guard=require(filename);}finally{Module._load=old;}
 assert.equal(await guard.check({headers:{'x-workspace-id':wid}}),false);assert.equal(await guard.check({headers:{'x-inventory-ids':iid}}),false);assert.equal(await guard.check({headers:{'x-workspace-id':workspace,'x-inventory-ids':inventory}}),true);assert.equal(await guard.check({headers:{},path:'/inventories/'+iid}),false);
 console.log('PASS: transactional Retail workspace migration, unfinished-basket refusal, normal-stock preservation, composite-ledger FKs, repeat migration, paired-device/PIN continuity, dedicated onboarding, cross-product API denial and unlimited tills.');await db.close();
})().catch(e=>{console.error(e);process.exit(1);});
