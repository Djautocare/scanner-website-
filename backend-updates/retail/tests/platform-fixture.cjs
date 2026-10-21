'use strict';
// Regression fixtures explicitly grant Retail access and register test tills.
// This is test data only; the production service has no test bypass.
module.exports=async function fixture(R,db){
 await db.exec("INSERT INTO retail_stores(inventory_id,workspace_id,name,customer_number,override_plan,override_reason) SELECT id,workspace_id,COALESCE(name,'Store'),'T'||replace(id::text,'-',''),'pro','Regression fixture' FROM inventories ON CONFLICT(inventory_id) DO NOTHING; INSERT INTO retail_registered_tills(id,workspace_id,inventory_id,name,slot) SELECT id,workspace_id,id,'Test till',1 FROM inventories ON CONFLICT(id) DO NOTHING;");
 const selected=req=>{const value=req.headers?.['x-inventory-ids'];if(value&&!value.includes(','))req.headers['x-retail-till-id']=value;return req;};
 const transaction=R.transaction;R.transaction=(req,...rest)=>transaction(selected(req),...rest);
 for(const key of ['overview','history']){const method=R[key];R[key]=(req,...rest)=>method(selected(req),...rest);}
};
