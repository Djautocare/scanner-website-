'use strict';
// Point RETAIL_HELP_TEST_BACKEND at the existing backend to exercise its shared Help service.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),{randomUUID:uuid}=require('node:crypto');
(async()=>{
 const source=process.env.RETAIL_HELP_TEST_BACKEND;if(!source)throw Error('Set RETAIL_HELP_TEST_BACKEND to the existing backend containing utils/helpRequests.js and sql/help-requests.sql');
 const f=await require('./till-fixture.cjs')(),{db,pool,R,owner,workspace,inventory,other,req}=f;
 // Load the real existing Help implementation against the isolated fixture database.
 const file=path.join(source,'utils/helpRequests.js'),m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));m.require=name=>name==='../database'?pool:require(name);m._compile(fs.readFileSync(file,'utf8'),file);
 let wakes=0;const shared={...m.exports,wake:()=>wakes++};
 const H=require('../files/utils/retailHelp').create({pool,ensureSchema:R.ensureSchema,scope:R.scope,fail:require('../files/utils/retail').fail,helpService:shared});
 await db.query("UPDATE retail_stores SET name='Eccles shop',override_plan='blocked' WHERE inventory_id=$1",[inventory]);
 let view=await H.read(req('/help'));assert.equal(view.shop.name,'Eccles shop');assert.equal(view.account_email,'owner@example.test');assert.equal(view.workspace.id,workspace);
 const send=req('/help',{topic:'Receipt printer',message:'Please help with the receipt preview',client_request_id:uuid(),account_email:'spoof@example.test',workspace_name:'Spoof shop'});send.headers['x-retail-till-id']=uuid();
 const created=await H.send(send);assert.equal(created.request.status,'new');assert.match(created.request.workspace_name,/InventoryOS Retail.*Test shop.*Eccles shop/);assert.equal((await H.send(send)).duplicate,true);
 const row=(await db.query('SELECT * FROM help_requests WHERE id=$1',[created.request.id])).rows[0];assert.equal(row.account_email,'owner@example.test');assert.equal(row.workspace_id,workspace);assert.equal(row.notification_status,'pending');assert.equal(row.topic,'Receipt printer');assert.equal(wakes,2);
 assert.equal((await db.query('SELECT COUNT(*)::int n FROM help_requests')).rows[0].n,1);assert.equal((await db.query('SELECT COUNT(*)::int n FROM help_request_events')).rows[0].n,1);
 await shared.setStatus(row.id,'ongoing',owner);view=await H.read(req('/help'));assert.equal(view.requests[0].status,'ongoing');await shared.setStatus(row.id,'completed',owner);assert.equal((await H.read(req('/help'))).requests[0].status,'completed');
 // Workspace viewers can ask for help; histories stay private to each account.
 const viewer=uuid();await db.query("INSERT INTO users(id,name,email)VALUES($1,'Viewer','viewer@example.test')",[viewer]);await db.query("INSERT INTO workspace_members VALUES($1,$2,'viewer','active')",[workspace,viewer]);
 const viewerReq={...req('/help',{topic:'Shop help',message:'Help as a viewer',client_request_id:uuid()}),user:{id:viewer}};assert.equal((await H.read(viewerReq)).requests.length,0);await H.send(viewerReq);assert.equal((await H.read(viewerReq)).requests.length,1);assert.equal((await H.read(req('/help'))).requests.length,1);
 const outsider=uuid();await db.query("INSERT INTO users(id,name,email)VALUES($1,'Other','other@example.test')",[outsider]);await assert.rejects(()=>H.read({...req('/help'),user:{id:outsider}}),e=>e.statusCode===403);
 const foreignW=uuid(),foreignI=uuid();await db.query("INSERT INTO workspaces(id,owner_user_id,name,workspace_kind)VALUES($1,$2,'Other business','retail')",[foreignW,outsider]);await db.query("INSERT INTO inventories(id,workspace_id,name)VALUES($1,$2,'Other shop')",[foreignI,foreignW]);await assert.rejects(()=>H.read(req('/help',{},foreignI)),e=>e.statusCode===403);
 await assert.rejects(()=>H.send({...send,body:{...send.body,message:'Changed retry'}}),e=>e.statusCode===409);
 await assert.rejects(()=>H.send(req('/help',{topic:'',message:'Missing topic',client_request_id:uuid()})),e=>e.statusCode===400);
 // Rate limits are shared with normal InventoryOS help, without creating another queue.
 for(let i=0;i<4;i++)await H.send(req('/help',{topic:'Question '+i,message:'A new question',client_request_id:uuid()}));await assert.rejects(()=>H.send(req('/help',{topic:'Too many',message:'Limit',client_request_id:uuid()})),e=>e.statusCode===429);
 assert.equal((await db.query('SELECT COUNT(*)::int n FROM retail_sales')).rows[0].n,0);assert.equal((await db.query('SELECT stock_qty FROM retail_products WHERE id=$1',[f.water.id])).rows[0].stock_qty,20);
 assert.equal((await db.query("SELECT COUNT(*)::int n FROM information_schema.tables WHERE table_name LIKE 'retail_help%'")).rows[0].n,0);
 console.log('PASS Retail Help: real shared Help records/admin statuses, queued notification, authoritative account/shop, idempotent retries, viewer support without paid access, account/workspace isolation, shared rate limits and no stock/sale changes. No emails sent.');await db.close();
})().catch(e=>{console.error(e);process.exit(1);});
