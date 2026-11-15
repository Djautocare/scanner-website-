'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {clean,create}=require('../files/utils/orderDelivery.js');
const ids={
  order:'00000000-1111-4000-8000-000000000000',
  workspace:'00000000-2222-4000-8000-000000000000',
  another:'00000000-3333-4000-8000-000000000000',
  user:'00000000-4444-4000-8000-000000000000',
  attempt:'00000000-5555-4000-8000-000000000000',
  update:'00000000-6666-4000-8000-000000000000',
};
const request=(body={},role='owner',workspace=ids.workspace)=>({
  params:{id:ids.order},workspace:{id:workspace,role},user:{id:ids.user},
  body:{request_id:ids.attempt,expected_version:0,carrier:'royal-mail',status:'dispatched',tracking_number:'SAMPLE0123',...body}
});

test('unknown status, custom tracking URL and an unverified delivery are rejected',()=>{
  assert.throws(()=>clean(request({tracking_number:'https://example.com'}).body),/valid tracking/);
  assert.throws(()=>clean(request({status:'made_up'}).body),/status/);
  assert.throws(()=>clean(request({status:'delivered'}).body),/checked the delivery/);
  assert.equal(clean(request({status:'delivered',delivery_confirmed:true}).body).delivery_confirmed,true);
  assert.equal(clean(request({tracking_number:' SAMPLE0123 '}).body).tracking_number,'SAMPLE0123');
});
test('viewer cannot write before any database work',async()=>{
  let touched=false;
  const service=create({pool:{},ensureOrders:async()=>{touched=true;}});
  await assert.rejects(service.save(request({},'viewer')),e=>e.statusCode===403);
  assert.equal(touched,false);
});
const loader=process.env.INVENTORYOS_REVIEW_SCHEMA_LOADER;
test('migrate and test durable, scoped delivery records against local PostgreSQL WASM', {skip:!loader&&!process.env.INVENTORYOS_PGLITE}, async()=>{
  const fs=require('node:fs');
  const path=require('node:path');
  const db=loader ? await require(loader).loadCurrentSchema() : new (require(process.env.INVENTORYOS_PGLITE).PGlite)();
  try{
    if(loader){
      await db.query('INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,$3,$4)',[ids.user,'courier@example.invalid','Sample Courier','fictional-test-record']);
      await db.query('INSERT INTO workspaces(id,name,owner_user_id) VALUES($1,$2,$3)',[ids.workspace,'Example Workshop',ids.user]);
      await db.query('INSERT INTO workspace_orders(id,workspace_id,request_id,request_hash) VALUES($1,$2,$3,$4)',[ids.order,ids.workspace,ids.attempt,'fictional-test-record']);
    }else{
      await db.exec('CREATE TABLE users(id UUID PRIMARY KEY); CREATE TABLE workspace_orders(id UUID PRIMARY KEY,workspace_id UUID NOT NULL);');
      await db.query('INSERT INTO users VALUES($1)',[ids.user]);
      await db.query('INSERT INTO workspace_orders VALUES($1,$2)',[ids.order,ids.workspace]);
    }
    const sql=fs.readFileSync(path.join(__dirname,'../files/sql/workspace-order-delivery.sql'),'utf8');
    await db.exec(sql);
    await db.exec(sql);
    const pool={query:(...args)=>db.query(...args),connect:async()=>({query:(...args)=>db.query(...args),release(){}})};
    const service=create({pool,ensureOrders:async()=>{}});
    const saved=await service.save(request());
    assert.equal(saved.delivery.version,1);
    assert.equal((await service.save(request())).unchanged,true);
    assert.equal((await service.save(request({request_id:ids.update,expected_version:1}))).unchanged,true);
    await assert.rejects(service.save(request({note:'Changed retry'})),e=>e.statusCode===409);
    await assert.rejects(service.save(request({request_id:ids.update,note:'Stale write'})),e=>e.statusCode===409);
    await assert.rejects(service.get(request({},'viewer',ids.another)),e=>e.statusCode===404);
    await assert.rejects(service.save(request({},'owner',ids.another)),e=>e.statusCode===404);
    await assert.rejects(service.save(request({status:'delivered',expected_version:1})),e=>e.statusCode===400);
    const verified=await service.save(request({status:'delivered',expected_version:1,request_id:ids.update,delivery_confirmed:true,note:'Fictional test acknowledgement'}));
    assert.equal(verified.delivery.version,2);
    const history=await service.get(request({},'viewer'));
    assert.equal(history.can_edit,false);
    assert.deepEqual(history.events.map(e=>e.status),['delivered','dispatched']);
    const order=await db.query('SELECT * FROM workspace_orders');
    assert.equal(order.rows.length,1);
  }finally{await db.close();}
});
