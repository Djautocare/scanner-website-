'use strict';
// Called INSIDE the original admin router, after authMiddleware and requireAdmin.
// Never mount this registration helper as an independent public router.
module.exports=function register(router){
 const platform=require('./retail').service().platform;
 const handle=fn=>async(req,res)=>{res.set('Cache-Control','no-store');try{res.json(await fn(req));}catch(e){res.status(e.statusCode||500).json({success:false,error:e.statusCode?e.message:'Retail admin action failed'});}};
 router.get('/users/:id/retail',handle(platform.adminStores));
 router.post('/users/:id/retail',handle(platform.adminOverride));
};
