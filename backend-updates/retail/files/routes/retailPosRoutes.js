'use strict';
const express=require('express'),R=require('../utils/retail').service();
const router=express.Router();
const handle=fn=>async(req,res)=>{res.set('Cache-Control','no-store');try{res.json(await fn(req));}catch(e){res.status(e.statusCode||500).json({success:false,error:e.statusCode?e.message:'Could not complete the till request. Retry the same action to recover a completed sale.',retryable:!e.statusCode||e.statusCode>=500});}};
// A device credential is deliberately not a website JWT. No other InventoryOS
// router accepts it. Keep this route list small and deny all other endpoints.
router.use((req,res,next)=>{req.retail_pos=true;next();});
router.post('/pair',handle(R.platform.pair));
router.post('/login',handle(R.platform.login));
router.get('/drawers',handle(R.platform.drawers.drawers));
router.post('/select-drawer',handle(R.platform.drawers.select));
router.post('/confirm-drawer',handle(R.platform.drawers.confirm));
router.post('/transaction',handle(R.platform.drawers.transaction));
router.post('/logout',handle(R.platform.logout));
router.get('/state',handle(R.platform.state));
router.post('/email-receipts',handle(R.platform.receipts.enqueue));
router.get('/email-receipts/status',handle(R.platform.receipts.status));
router.get('/customers',handle(R.platform.customers));
router.get('/refund-sale',handle(R.platform.refundSale));
router.post('/refund',handle(R.platform.posRefund));
router.post('/waste',handle(R.platform.posWaste));
router.post('/waste/start',handle(R.platform.startWaste));
router.post('/reconcile',handle(R.platform.reconcile));
const mutation=(route,fn)=>router.post(route,handle(req=>R.transaction(req,fn)));
mutation('/checkout',R.checkout);
mutation('/customers',async(c,s,b)=>{if(!s.retail_access.features.loyalty||!s.business.features.loyalty)throw Object.assign(new Error('Loyalty requires Retail Pro'),{statusCode:402});return R.business.saveCustomer(c,s,b);});
mutation('/park',R.operations.park);
mutation('/recall',(c,s,b)=>R.operations.recall(c,s,b,b.parked_id));
module.exports=router;
