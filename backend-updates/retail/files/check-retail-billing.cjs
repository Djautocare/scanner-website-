'use strict';
require('dotenv').config({quiet:true});
const billing=require('./utils/retailBilling');
const fail=(message,statusCode=400)=>Object.assign(Error(message),{statusCode});
(async()=>{
 const B=billing.create({fail});
 for(const environment of ['live','sandbox']){
  const row={billing_environment:environment};
  if(!B.configured(row))throw Error(environment+' Retail billing is incomplete. Follow STRIPE-SETUP.txt; keep private keys in backend/.env.');
  const api=B.client(row),price=await api.prices.retrieve(B.price(row));
  if(price.livemode!==(environment==='live')||!price.active||price.currency!=='gbp'||price.unit_amount!==1999||price.recurring?.interval!=='month'||price.recurring.interval_count!==1)throw Error(environment+' Retail price must be active monthly GBP 19.99 in the matching Stripe account.');
  const configuration=B.portalConfiguration(row);if(!configuration)throw Error(environment+' Retail portal configuration is missing. Follow STRIPE-SETUP.txt.');
  const portal=await api.billingPortal.configurations.retrieve(configuration);
  if(!portal.active||!portal.features.subscription_cancel.enabled||portal.features.subscription_cancel.mode!=='at_period_end'||portal.features.subscription_update.enabled)throw Error(environment+' Retail portal must allow end-of-period cancellations and leave quantity/plan switching disabled.');
  console.log('PASS: '+environment+' Retail API key, GBP 19.99 monthly price and billing portal.');
 }
 console.log('No payments were taken and no subscriptions were changed. Next: test a separate sandbox shop and check the sandbox webhook delivery in Stripe.');
})().catch(e=>{const detail=e.type==='StripeAuthenticationError'?'Stripe API key was not accepted. Check the matching live/sandbox key privately in .env.':String(e.message||'Billing check failed').replace(/(?:sk|rk)_(?:live|test)_[A-Za-z0-9]+/g,'[private key]');console.error('Retail billing check failed: '+detail);process.exitCode=1;});
