'use strict';
// Runs on the owner's PC. Private keys are read locally and never printed.
require('dotenv').config({quiet:true});
const fs=require('node:fs'),path=require('node:path');
(async()=>{
 const environment=process.argv.includes('--sandbox')?'sandbox':process.argv.includes('--live')?'live':null;
 if(!environment)throw Error('Choose --sandbox or --live. Start with --sandbox.');
 const B=require('./utils/retailBilling').create({fail:(m,s)=>Object.assign(Error(m),{statusCode:s})}),row={billing_environment:environment},api=B.client(row),mod=require('./utils/retailReceiptEmails');
 const productId='inventoryos_retail_receipts_v1';let product;
 try{product=await api.products.retrieve(productId);}catch(error){if(error.code!=='resource_missing')throw error;product=await api.products.create({id:productId,name:'InventoryOS Retail email receipts',description:'Optional per-shop email-receipt add-on. £2.99 for the first 30 days; then billed monthly in arrears: 0–1,000 sends £2.99, 1,001–5,000 £4.99, 5,001–10,000 £9.99, 10,001–25,000 £19.99. A separate Retail subscription is required. Minimum £2.99 per usage month; 25,000 sends maximum.',metadata:{product_type:'inventoryos_retail_receipts',pricing_version:'v1'}});}
 const meters=await api.billing.meters.list({limit:100});let meter=meters.data.find(m=>m.event_name===mod.EVENT&&m.status==='active');
 if(!meter)meter=await api.billing.meters.create({display_name:'InventoryOS Retail emailed receipts',event_name:mod.EVENT,default_aggregation:{formula:'sum'},customer_mapping:{event_payload_key:'stripe_customer_id',type:'by_id'},value_settings:{event_payload_key:'value'}});
 async function price(lookup,params){const rows=await api.prices.list({lookup_keys:[lookup],limit:10});if(rows.data.length)return rows.data[0];return api.prices.create({product:product.id,currency:'gbp',lookup_key:lookup,tax_behavior:'inclusive',...params},{idempotencyKey:'receipt-price/'+lookup});}
 const intro=await price('inventoryos_receipts_intro_v1',{unit_amount:299});
 const usage=await price('inventoryos_receipts_usage_v1',{billing_scheme:'tiered',tiers_mode:'volume',recurring:{interval:'month',interval_count:1,usage_type:'metered',meter:meter.id},tiers:mod.BANDS.map((b,i)=>({up_to:i===3?'inf':b.up_to,flat_amount:b.pence,unit_amount:0}))});
 const E=mod.create({fail:(m,s)=>Object.assign(Error(m),{statusCode:s})}),prefix=environment==='sandbox'?'STRIPE_RETAIL_SANDBOX_RECEIPTS_':'STRIPE_RETAIL_RECEIPTS_',settings={[prefix+'INTRO_PRICE']:intro.id,[prefix+'USAGE_PRICE']:usage.id};
 for(const [k,v]of Object.entries(settings)){if(process.env[k]&&process.env[k]!==v)throw Error(k+' already points to a different price. No .env changes were made.');process.env[k]=v;}
 await E.validatePrices(api,row);
 const file=path.join(process.cwd(),'.env');if(!fs.existsSync(file))throw Error('Run this in the backend folder beside .env.');const before=fs.readFileSync(file,'utf8');let after=before;
 const stored=require('dotenv').parse(before);
 for(const [k,v]of Object.entries(settings)){
  if(stored[k]&&stored[k]!==v)throw Error(k+' in .env points to a different price. No .env changes were made.');
  const re=new RegExp('^[ \\t]*'+k+'[ \\t]*=.*$','m');
  if(re.test(after))after=after.replace(re,k+'='+v);else after+='\n'+k+'='+v;
 }
 if(after!==before)fs.writeFileSync(file,after+'\n');
 console.log('PASS: '+environment+' email-receipt product, meter and prices configured. Public price IDs saved in backend/.env.');
 console.log('No customers were charged and no existing subscriptions were changed. Restart the backend after configuring both environments.');
})().catch(error=>{const message=String(error.message||'Setup failed').replace(/(?:sk|rk)_(?:live|test)_[A-Za-z0-9]+/g,'[private key]');console.error('Email-receipt setup stopped: '+message);if(error.type==='StripePermissionError')console.error('The selected restricted key needs Products Write, Prices Write and Billing Meters Write for setup. Keep the key private.');process.exitCode=1;});
