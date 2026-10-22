'use strict';
const assert=require('node:assert/strict'),{randomUUID:uuid}=require('node:crypto');
const {create,csv,clean}=require('../files/utils/retailStoreDeletion');
const fixture=require('./till-fixture.cjs');
(async()=>{
 const f=await fixture(),{R,P,db,pool,req,inventory,other,workspace,owner,staff,till,water}=f;
 const sent=[],calls=[];let rejectEmail=false,rejectBilling=false,clock=new Date();
 const api={checkout:{sessions:{retrieve:async id=>({id,status:'expired'}),expire:async()=>{}}},subscriptions:{retrieve:async id=>({id,customer:id==='sub_receipts'?'cus_receipts':'cus_shop',status:'active',livemode:false,metadata:{product_type:id==='sub_receipts'?'inventoryos_retail_receipts':'inventoryos_retail',inventory_id:inventory,workspace_id:workspace,billing_environment:'sandbox'},cancel_at_period_end:false}),update:async(id,body,opts)=>{calls.push({id,body,opts});if(rejectBilling)throw Error('Stripe unavailable');return {id,status:'active',cancel_at_period_end:true};}}};
 const D=create({pool,ensureSchema:R.ensureSchema,scope:R.scope,id:require('../files/utils/retail').id,fail:require('../files/utils/retail').fail,now:()=>clock,stripe:{sandbox:api},sendEmail:async p=>{sent.push(p);if(rejectEmail)throw Error('Email unavailable');return {id:'email_'+sent.length};}});
 const preview=()=>D.preview({...req(''),query:{inventory_id:inventory}}),backup=id=>D.backup(req('',{inventory_id:inventory,request_id:id})),remove=(id,extra={})=>D.remove(req('',{inventory_id:inventory,backup_id:id,confirmation:'Confirm delete',backup_received:true,...extra}));
 assert.match((await preview()).blockers.join(' '),/close every till/);
 await assert.rejects(backup(uuid()),/close every till/);assert.equal(sent.length,0);
 await P.ownerChange(req('',{inventory_id:inventory,action:'balance-till',till_id:till,amount:'20',close:true}));
 // Assign shared staff to a second shop; those credentials must survive deletion.
 await P.ownerChange(req('',{inventory_id:other,action:'staff-assignment',staff_id:staff.id,active:true,can_refund:true}));
 await db.query("UPDATE retail_stores SET stripe_subscription_id='sub_shop',stripe_customer_id='cus_shop',stripe_status='active',billing_environment='sandbox' WHERE inventory_id=$1",[inventory]);
 await db.query("INSERT INTO retail_receipt_accounts(inventory_id,stripe_subscription_id,stripe_customer_id,status) VALUES($1,'sub_receipts','cus_receipts','active')",[inventory]);
 await require('./fixtures/deletion-records.cjs')(f);
 const productOther=uuid();await db.query("INSERT INTO retail_products(id,workspace_id,inventory_id,name,barcode,price_pence) VALUES($1,$2,$3,'Other private product','00045',199)",[productOther,workspace,other]);
 // Lossless quoted/newline CSV and formula-injection protection.
 await db.query("UPDATE retail_products SET name=$2,barcode='0012345',supplier='=HYPERLINK(\"bad\")' WHERE id=$1",[water.id,'Water, "spring"\nlarge']);
 const admin=uuid();await db.query("INSERT INTO users(id,email) VALUES($1,'admin@example.test')",[admin]);await db.query("INSERT INTO workspace_members(workspace_id,user_id,role,status) VALUES($1,$2,'admin','active')",[workspace,admin]);
 await assert.rejects(D.preview({...req(''),user:{id:admin},query:{inventory_id:inventory}}),/Only the Retail business owner/);
 await assert.rejects(D.backup({...req('',{inventory_id:inventory,request_id:uuid()}),user:{id:admin}}),/Only the Retail business owner/);
 const failureId=uuid();rejectEmail=true;await assert.rejects(backup(failureId),/Email unavailable/);assert.equal((await db.query('SELECT status FROM retail_store_deletions WHERE id=$1',[failureId])).rows[0].status,'prepared');await assert.rejects(remove(failureId),/fresh CSV backup/);rejectEmail=false;
 const email=await backup(failureId);assert.equal(email.email,'owner@example.test');const payload=sent.at(-1);assert.deepEqual(payload.to,['owner@example.test']);const files=Object.fromEntries(payload.attachments.map(x=>[x.filename,Buffer.from(x.content,'base64').toString()]));
 assert(files['sales.csv'].includes('RT-BACKUP'));assert(files['customers.csv'].includes('Test customer'));assert(files['return_items.csv'].includes('Water'));assert(files['delivery_items.csv'].split('\r\n').length>2);
 assert(files['products.csv'].includes('0012345'));assert(files['products.csv'].includes('"Water, ""spring""\nlarge"'));assert(files['products.csv'].includes("'=HYPERLINK"));assert(!JSON.stringify(files).includes('Other private product'));
 for(const key of ['pin_hash','pin_salt','qr_token','token_hash','card_token','device_hash','pair_hash'])assert(!Object.values(files).some(x=>x.split('\r\n')[0].includes(key)),key);
 const sendCount=sent.length;await backup(failureId);assert.equal(sent.length,sendCount);assert.equal(sent.at(-1).idempotencyKey,'retail-store-backup/'+failureId);
 await assert.rejects(remove(failureId,{confirmation:'confirm delete'}),/exactly/);await assert.rejects(remove(failureId,{backup_received:false}),/Tick/);assert.equal(calls.length,0);
 await db.query('UPDATE retail_products SET stock_qty=stock_qty+1 WHERE id=$1',[water.id]);await assert.rejects(remove(failureId),/data changed/);assert.equal(calls.length,0);
 const fresh=uuid();await backup(fresh);rejectBilling=true;await assert.rejects(remove(fresh),/Stripe unavailable/);assert.equal((await db.query('SELECT deleting_backup_id FROM retail_stores WHERE inventory_id=$1',[inventory])).rows[0].deleting_backup_id,null);assert.equal((await db.query('SELECT COUNT(*)::int n FROM retail_products WHERE inventory_id=$1',[inventory])).rows[0].n,2);rejectBilling=false;
 // Unknown extension records block deletion rather than being silently lost.
 await db.exec('CREATE TABLE extra_store_data(id uuid PRIMARY KEY,inventory_id uuid REFERENCES inventories(id),value text)');await db.query("INSERT INTO extra_store_data VALUES($1,$2,'do not lose')",[uuid(),inventory]);await assert.rejects(remove(fresh),/additional data/);await db.query('DELETE FROM extra_store_data');
 const result=await remove(fresh);assert.equal(result.deleted,true);assert.deepEqual(calls.slice(-2).map(x=>x.id),['sub_shop','sub_receipts']);assert(calls.every(x=>x.body.cancel_at_period_end===true));
 assert.equal((await db.query('SELECT COUNT(*)::int n FROM inventories WHERE id=$1',[inventory])).rows[0].n,0);assert.equal((await db.query('SELECT COUNT(*)::int n FROM retail_products WHERE inventory_id=$1',[inventory])).rows[0].n,0);
 assert.equal((await db.query('SELECT COUNT(*)::int n FROM retail_stores WHERE inventory_id=$1',[other])).rows[0].n,1);assert.equal((await db.query('SELECT name FROM retail_products WHERE id=$1',[productOther])).rows[0].name,'Other private product');
 assert.equal((await db.query('SELECT inventory_id FROM retail_team WHERE id=$1',[staff.id])).rows[0].inventory_id,other);assert.equal((await db.query('SELECT inventory_id FROM retail_staff_credentials WHERE staff_id=$1',[staff.id])).rows[0].inventory_id,other);
 assert((await db.query('SELECT * FROM retail_staff_assignments WHERE staff_id=$1 AND inventory_id=$2',[staff.id,other])).rows.length);
 assert.equal((await db.query('SELECT email_payload FROM retail_store_deletions WHERE id=$1',[fresh])).rows[0].email_payload,null);assert.equal((await remove(fresh)).replayed,true);
 assert(await D.webhook({type:'customer.subscription.updated',livemode:false,data:{object:{id:'sub_shop',customer:'cus_shop'}}},'sandbox'));assert(await D.webhook({type:'invoice.paid',livemode:false,data:{object:{subscription:'sub_receipts',customer:'cus_receipts'}}},'sandbox'));
 await assert.rejects(D.webhook({type:'customer.subscription.updated',livemode:true,data:{object:{id:'sub_shop',customer:'cus_shop'}}},'sandbox'),/environment mismatch/);
 assert.equal(await D.webhook({type:'customer.subscription.updated',livemode:false,data:{object:{id:'sub_unrelated',customer:'cus_shop'}}},'sandbox'),false);
 assert.deepEqual(clean({pin_hash:'secret',nested:{token:'secret',name:'Okay'}}),{nested:{name:'Okay'}});assert(csv([{x:-3}],['x']).includes('"-3"'));
 await db.close();console.log('PASS store deletion: owner checks, required acknowledgements, complete scoped CSVs, safe email retries, changed-data protection, billing failure recovery, shared-staff preservation, other-store isolation and delayed webhooks. No real emails or payments.');
})().catch(e=>{console.error(e);process.exitCode=1;});
