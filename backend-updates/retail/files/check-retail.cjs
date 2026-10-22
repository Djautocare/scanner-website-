'use strict';
require('dotenv').config({ quiet: true });
const pool = require('./database');
(async () => {
  const required = { users: ['id','admin_plan_override','is_suspended','email'], workspaces: ['id','owner_user_id'], workspace_members: ['workspace_id','user_id','role','status'], inventories: ['id','workspace_id','name','is_default'], products: ['workspace_id'] };
  const result = await pool.query("SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=ANY($1::text[])", [Object.keys(required)]);
  for (const [table, columns] of Object.entries(required)) for (const column of columns) {
    const found = result.rows.find(r => r.table_name === table && r.column_name === column);
    if (!found) throw new Error(`Required existing column missing: ${table}.${column}. No Retail migration was run.`);
    if (column === 'id' && !['workspace_members','products'].includes(table) && found.data_type !== 'uuid') throw new Error(`Expected ${table}.id to be uuid. No Retail migration was run.`);
  }
  const R = require('./utils/retail').service();
  await R.ensureSchema();
  if(typeof R.ordering?.configure!=='function'||typeof R.reports?.read!=='function'||typeof R.platform.posWaste!=='function'||typeof R.platform.startWaste!=='function')throw new Error('Retail ordering/reporting update is missing');
  if(typeof R.platform.locations!=="function")throw new Error("Retail store location update is missing");
  const tables = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_name LIKE 'retail_%'");
  if (tables.rows.length < 14) throw new Error('Retail tables were not all created');
  for (const name of ['retail_waste_batches','retail_order_settings','retail_supplier_products','retail_price_reviews','retail_drawer_logins','retail_drawer_assignments','retail_stores','retail_registered_tills','retail_pos_sessions','retail_pos_attempts','retail_staff_assignments','retail_platform_events','retail_reorder_emails','retail_business_settings','retail_team','retail_customers','retail_bookings','retail_offers','retail_reductions','retail_preorders','retail_preorder_items','retail_deposits','retail_loyalty_events','retail_waste','retail_reminders','retail_counter_settings','retail_staff_credentials','retail_staff_attempts','retail_till_devices','retail_staff_sessions','retail_parked_sales','retail_returns','retail_return_items']) if (!tables.rows.some(t=>t.table_name===name)) throw new Error('Retail business table missing: '+name);
  const columns = (await pool.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name IN('retail_settings','retail_products','retail_sales','retail_pos_sessions','retail_drawer_assignments')")).rows;
  for (const [table, column] of [['retail_pos_sessions','connection_till_id'],['retail_pos_sessions','connection_generation'],['retail_drawer_assignments','transaction_context'],['retail_settings','vat_receipts'],['retail_settings','receipt_business_name'],['retail_settings','vat_version'],['retail_products','vat_treatment'],['retail_products','catalogue_source'],['retail_sales','vat_receipt'],['retail_sales','receipt_business'],['retail_sales','recorded_at'],['retail_sales','offline_device_id'],['retail_products','item_kind'],['retail_products','pack_size'],['retail_sales','deposit_applied_pence'],['retail_sales','staff_snapshot'],['retail_products','category'],['retail_products','minimum_age'],['retail_sales','cashier_snapshot']]) if (!columns.some(x => x.table_name === table && x.column_name === column)) throw new Error('Retail update column missing: ' + table + '.' + column);
  if(!process.env.STRIPE_PRICE_RETAIL_MONTHLY&&!process.env.STRIPE_PRICE_RETAIL_PRO_MONTHLY) console.log('Optional billing setup missing: STRIPE_PRICE_RETAIL_MONTHLY (existing £19.99 Pro price can also be reused).');
  console.log('PASS: Retail ordering, price reviews, reports and drawer controls are ready. Retail has permanent navigation and separate shop workspaces.');
  const mixed=(await pool.query("SELECT s.inventory_id FROM retail_stores s JOIN inventories i ON i.id=s.inventory_id JOIN workspaces w ON w.id=s.workspace_id WHERE w.workspace_kind<>'retail' OR i.workspace_id<>s.workspace_id")).rows;if(mixed.length)throw new Error('Retail workspace migration incomplete');
  console.log('Existing stock, billing, admin permissions and .env were not replaced.');
  console.log('For Stripe live/sandbox setup also run: node .\\check-retail-billing.cjs');
  console.log('Restart InventoryOS Backend. Retail Admin > Tills manages inventory connections and drawer assignments. Till staff log in, choose a drawer, and confirm it.');
  console.log('Retail business tools, VAT, barcode lookup and offline cash checkout are ready. Existing records were retained. Business tools start off until selected in Retail settings.');
})().catch(e => { console.error('Retail check failed: ' + e.message); process.exitCode = 1; }).finally(() => pool.end());
