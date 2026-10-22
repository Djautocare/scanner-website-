'use strict';
require('dotenv').config({quiet:true});
const pool=require('./database');
(async()=>{
 const R=require('./utils/retail').service();await R.ensureSchema();
 for(const name of ['preview','backup','remove','webhook'])if(typeof R.deletions?.[name]!=='function')throw Error('Store deletion backend is incomplete');
 const rows=(await pool.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name IN('retail_store_deletions','retail_stores')")).rows;
 for(const [table,column]of [['retail_stores','deleting_backup_id'],['retail_store_deletions','snapshot_hash'],['retail_store_deletions','email_payload']])if(!rows.some(r=>r.table_name===table&&r.column_name===column))throw Error('Missing database field: '+table+'.'+column);
 if(!process.env.RESEND_API_KEY||!(process.env.EMAIL_FROM||process.env.RETAIL_RECEIPT_FROM))throw Error('Your existing RESEND_API_KEY and EMAIL_FROM (or RETAIL_RECEIPT_FROM) must be configured. Do not share their values.');
 console.log('PASS: store deletion routes, CSV backup storage and local email settings are ready.');
 console.log('No emails were sent, stores deleted or Stripe subscriptions changed. Restart the backend, then use Admin > Stores & billing > Delete store.');
})().catch(e=>{console.error('Store deletion check failed: '+e.message);process.exitCode=1;}).finally(()=>pool.end());
