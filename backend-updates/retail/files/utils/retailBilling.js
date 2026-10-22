'use strict';
// Live and sandbox shop records never share a Stripe client or customer.
const mode=row=>row?.billing_environment==='sandbox'?'sandbox':'live';
const configuredPrice=row=>mode(row)==='sandbox'?String(process.env.STRIPE_RETAIL_SANDBOX_PRICE_MONTHLY||'').trim():String(process.env.STRIPE_PRICE_RETAIL_MONTHLY||process.env.STRIPE_PRICE_RETAIL_PRO_MONTHLY||'').trim();
const secret=row=>mode(row)==='sandbox'?process.env.STRIPE_RETAIL_SANDBOX_SECRET_KEY:process.env.STRIPE_SECRET_KEY;
const configured=row=>Boolean(secret(row)&&configuredPrice(row)&&(mode(row)!=='sandbox'||process.env.STRIPE_RETAIL_SANDBOX_WEBHOOK_SECRET));
const portalConfiguration=row=>mode(row)==='sandbox'?process.env.STRIPE_RETAIL_SANDBOX_PORTAL_CONFIGURATION:process.env.STRIPE_RETAIL_PORTAL_CONFIGURATION;
function client(row,fail){
 const key=secret(row),test=mode(row)==='sandbox';
 if(!key)throw fail(test?'Retail sandbox API key is not configured':'Stripe billing is not configured',503);
 if(test&&!/^(?:sk|rk)_test_/.test(key)||!test&&!/^(?:sk|rk)_live_/.test(key))throw fail('Stripe API key does not match this shop’s billing environment',503);
 return new(require('stripe'))(key,{apiVersion:'2026-08-26.dahlia'});
}
function publicInfo(row,clock=new Date()){
 const subscribed=Boolean(row.stripe_subscription_id)&&!['none','canceled','incomplete_expired'].includes(row.stripe_status)&&!(row.cancel_at_period_end&&row.period_end&&Date.parse(row.period_end)<=clock.getTime());
 return {environment:mode(row),subscribed,status:row.stripe_status,amount_pence:subscribed?row.billing_amount_pence===null||row.billing_amount_pence===undefined?null:Number(row.billing_amount_pence):0,currency:row.billing_currency||'gbp',interval:row.billing_interval||'month',interval_count:row.billing_interval_count||1,renews:subscribed&&!row.cancel_at_period_end,period_end:row.period_end,cancel_at_period_end:row.cancel_at_period_end,synced_at:row.billing_synced_at,checkout_configured:configured(row)};
}
function totals(rows,environment){
 const matching=rows.filter(r=>r.billing.environment===environment),paid=matching.filter(r=>r.billing.subscribed),known=paid.filter(r=>r.billing.amount_pence!==null&&r.billing.currency==='gbp'&&r.billing.interval==='month'&&r.billing.interval_count===1);
 return {shops:matching.length,subscribed_shops:paid.length,monthly_pence:known.reduce((n,r)=>n+r.billing.amount_pence,0),renewing_monthly_pence:known.filter(r=>r.billing.renews).reduce((n,r)=>n+r.billing.amount_pence,0),unknown_prices:paid.length-known.length};
}
function create(H){
 const {pool,ensureSchema,fail,id,now}=H;
 async function summary(req){
  await ensureSchema();const user=id(req.user.id);
  const rows=(await pool.query("SELECT s.*,w.name AS workspace_name FROM retail_stores s JOIN workspaces w ON w.id=s.workspace_id WHERE w.owner_user_id=$1 AND w.workspace_kind='retail' ORDER BY w.name,s.name,s.inventory_id",[user])).rows;
  const stores=rows.map(r=>({inventory_id:r.inventory_id,workspace_id:r.workspace_id,name:r.name,workspace_name:r.workspace_name,billing:publicInfo(r,now()),checkout_pending:Boolean(r.checkout_session_id),trial_expires_at:r.override_plan&&r.override_expires_at&&Date.parse(r.override_expires_at)>now().getTime()?r.override_expires_at:null,legacy_billing:Boolean(r.stripe_subscription_id&&(r.paid_plan!=='retail'||Number(r.paid_pairs)>0))}));
  return {success:true,stores,live:totals(stores,'live'),sandbox:totals(stores,'sandbox'),unit_price_pence:1999,currency:'gbp',server_now:now().toISOString()};
 }
 async function record(c,row,sub){
  const items=sub.items.data,prices=items.map(i=>i.price);
  const valid=prices.every(p=>p.currency==='gbp'&&p.recurring?.interval==='month'&&p.recurring.interval_count===1&&Number.isSafeInteger(p.unit_amount));
  const amount=valid?items.reduce((n,i)=>n+i.quantity*i.price.unit_amount,0):null;
  await c.query('UPDATE retail_stores SET billing_amount_pence=$2,billing_currency=$3,billing_interval=$4,billing_interval_count=$5,billing_synced_at=$6 WHERE inventory_id=$1',[row.inventory_id,amount,prices[0]?.currency||'gbp',prices[0]?.recurring?.interval||'month',prices[0]?.recurring?.interval_count||1,now().toISOString()]);
 }
 return {summary,record,mode,price:configuredPrice,configured,publicInfo:row=>publicInfo(row,now()),portalConfiguration,client:row=>H.stripe?.[mode(row)]||H.stripe||client(row,fail)};
}
// Mounted with express.raw BEFORE express.json, with a separate signing secret.
async function sandboxWebhook(req,res){
 if(!process.env.STRIPE_RETAIL_SANDBOX_SECRET_KEY||!process.env.STRIPE_RETAIL_SANDBOX_WEBHOOK_SECRET)return res.status(503).json({error:'Retail sandbox webhook is not configured'});
 let event,api;
 try{api=client({billing_environment:'sandbox'},(m,s)=>Object.assign(Error(m),{statusCode:s}));event=api.webhooks.constructEvent(req.body,req.headers['stripe-signature'],process.env.STRIPE_RETAIL_SANDBOX_WEBHOOK_SECRET);}catch{return res.status(400).json({error:'Invalid sandbox webhook signature or configuration'});}
 if(event.livemode!==false)return res.status(400).json({error:'Live events cannot be accepted by the sandbox webhook'});
 try{await require('./retail').service().platform.webhook(event,api,'sandbox');return res.json({received:true});}catch(e){console.error('Retail sandbox webhook failed:',e.code||e.name);return res.status(500).json({error:'Sandbox event could not be processed; Stripe will retry'});}
}
module.exports={create,mode,publicInfo,totals,sandboxWebhook};
