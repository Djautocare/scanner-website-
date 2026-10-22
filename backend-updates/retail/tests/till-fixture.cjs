'use strict';
const path=require('node:path'),{randomUUID:uuid}=require('node:crypto');
module.exports=async function fixture(){
 const {PGlite}=require(path.join(process.env.RETAIL_TEST_MODULES||'..','@electric-sql/pglite'));
 const {createService}=require('../files/utils/retail');const db=new PGlite();await db.waitReady;
 const query=(q,v)=>q.includes('CREATE TABLE IF NOT EXISTS')?db.exec(q).then(x=>x.at(-1)):db.query(q,v),pool={query,connect:async()=>({query,release(){}})};
 await db.exec(`CREATE TABLE users(id uuid PRIMARY KEY,name text,admin_plan_override text,is_suspended boolean DEFAULT false,email text,email_verified boolean DEFAULT true);CREATE TABLE workspaces(id uuid PRIMARY KEY,owner_user_id uuid REFERENCES users(id),name text,stripe_customer_id text);CREATE TABLE inventories(id uuid PRIMARY KEY,workspace_id uuid REFERENCES workspaces(id),name text,is_default boolean DEFAULT false);CREATE TABLE workspace_members(workspace_id uuid,user_id uuid,role text,status text);CREATE TABLE products(id uuid PRIMARY KEY,workspace_id uuid);`);
 const owner=uuid(),workspace=uuid(),inventory=uuid(),other=uuid();await db.query("INSERT INTO users(id,name,email)VALUES($1,'Owner','owner@example.test')",[owner]);await db.query("INSERT INTO workspaces(id,owner_user_id,name)VALUES($1,$2,'Test shop')",[workspace,owner]);for(const inv of [inventory,other])await db.query("INSERT INTO inventories(id,workspace_id,name)VALUES($1,$2,'Test shop')",[inv,workspace]);
 const R=createService({pool,calculateAccess:()=>({allowed:true,plan_key:'business'})}),P=R.platform;
 const req=(route,body={},inv=inventory)=>({user:{id:owner},workspace:{id:workspace},headers:{'x-workspace-id':workspace,'x-inventory-ids':inv},originalUrl:'/retail'+route,query:{},body:{request_id:uuid(),...body}});
 const run=(route,b,fn,options={admin:true})=>R.transaction(req(route,b),fn,options);
 await db.exec("ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS workspace_kind text NOT NULL DEFAULT 'retail'");await R.ensureSchema();for(const inv of [inventory,other]){await P.ownerChange(req('',{action:'create-store',inventory_id:inv,name:'Test shop'}));const store=(await db.query('SELECT * FROM retail_stores WHERE inventory_id=$1',[inv])).rows[0];await P.adminOverride({...req('',{inventory_id:inv,version:store.override_version,plan:'pro',extra_pairs:0,features:{},reason:'Test fixture'}),params:{id:owner}});}
 const product=async(name,barcode,stock)=> (await run('/products',{name,barcode,price:'3',cost:'1',minimum_qty:2,target_qty:10,opening_qty:stock},R.saveProduct)).product;
 const water=await product('Water','WATER',20),cereal=await product('Cereal','CEREAL',20);
 const staff=(await run('/operations/staff',{name:'Alex',commission_percent:'0'},R.operations.saveStaff)).staff;await R.operations.credentials({...req('',{staff_number:'100',pin:'1234'}),params:{id:staff.id}});await P.ownerChange(req('',{action:'staff-assignment',inventory_id:inventory,staff_id:staff.id,active:true,can_refund:true,can_manage:true}));
 const till=(await P.ownerChange(req('',{action:'register-till',inventory_id:inventory,name:'Till 1'}))).till_id,till2=(await P.ownerChange(req('',{action:'register-till',inventory_id:inventory,name:'Till 2'}))).till_id;await P.ownerChange(req('',{action:'open-till',inventory_id:inventory,till_id:till,amount:'20'}));
 const code=await P.ownerChange(req('',{action:'pair-till',inventory_id:inventory,till_id:till})),device=(await P.pair({body:{code:code.pair_code}})).device_token;
 const pos=(route,body={},token='')=>({retail_pos:true,headers:{authorization:'Till '+device,...(token?{'x-retail-staff-token':token}:{})},originalUrl:'/retail-pos'+route,query:{},body:{request_id:uuid(),...body}});
 async function login(){const start=await P.login(pos('/login',{staff_identifier:'100',pin:'1234',drawer_flow:true})),selection=await P.drawers.select(pos('/select-drawer',{till_id:till},start.login_token));return (await P.drawers.confirm(pos('/confirm-drawer',{selection_token:selection.selection_token},start.login_token))).token;}
 return {R,P,db,pool,owner,workspace,inventory,other,water,cereal,staff,till,till2,device,req,run,pos,login};
};
