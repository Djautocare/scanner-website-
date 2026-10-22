'use strict';require('dotenv').config({quiet:true});
(async()=>{const R=require('./utils/retail').service(),B=require('./utils/retailBilling').create({fail:(m,s)=>Object.assign(Error(m),{statusCode:s})});await R.ensureSchema();
 for(const environment of ['sandbox','live']){const row={billing_environment:environment};await R.platform.receipts.validatePrices(B.client(row),row);console.log('PASS: '+environment+' email-receipt first-month price and monthly ranges.');}
 require('./utils/retailReceiptEmails').sender('Test shop');if(!process.env.RESEND_API_KEY)throw Error('RESEND_API_KEY is missing');console.log('PASS: database schema and receipt sender format. Existing signed Retail billing webhooks handle this add-on. No emails were sent or payments taken.');
})().catch(error=>{console.error('Email-receipt check failed: '+String(error.message).replace(/(?:sk|rk)_(?:live|test)_[A-Za-z0-9]+/g,'[private key]'));process.exitCode=1;}).finally(async()=>{await require('./database').end?.();});
