'use strict';
require('dotenv').config({quiet:true});
const pool=require('./database');
(async()=>{
 const h=require('./utils/helpRequests');for(const name of ['ensureSchema','publicRequest','createRequest','wake'])if(typeof h[name]!=='function')throw Error('Existing Help backend is missing '+name);
 const R=require('./utils/retail').service();await R.ensureSchema();await h.ensureSchema();
 const create=require('./utils/retailHelp').create;if(typeof create!=='function')throw Error('Retail Help connection is missing');
 console.log('PASS: Retail Help connects to the existing Help records, admin list and notification worker.');
 console.log('No help requests or emails were sent. Restart InventoryOS Backend, then open Help in the Retail sidebar.');
})().catch(e=>{console.error('Retail Help check failed: '+e.message);process.exitCode=1;}).finally(()=>pool.end());
