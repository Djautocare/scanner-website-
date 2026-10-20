'use strict';
require('dotenv').config({ quiet: true });
const pool = require('./database');
(async () => {
  const required = { users: ['id','admin_plan_override'], workspaces: ['id','owner_user_id'], workspace_members: ['workspace_id','user_id','role','status'], inventories: ['id','workspace_id'], products: ['workspace_id'] };
  const result = await pool.query("SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=ANY($1::text[])", [Object.keys(required)]);
  for (const [table, columns] of Object.entries(required)) for (const column of columns) {
    const found = result.rows.find(r => r.table_name === table && r.column_name === column);
    if (!found) throw new Error(`Required existing column missing: ${table}.${column}. No Retail migration was run.`);
    if (column === 'id' && !['workspace_members','products'].includes(table) && found.data_type !== 'uuid') throw new Error(`Expected ${table}.id to be uuid. No Retail migration was run.`);
  }
  const R = require('./utils/retail').service();
  await R.ensureSchema();
  const tables = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_name LIKE 'retail_%'");
  if (tables.rows.length < 14) throw new Error('Retail tables were not all created');
  const columns = (await pool.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name IN('retail_settings','retail_products','retail_sales')")).rows;
  for (const [table, column] of [['retail_settings','vat_receipts'],['retail_settings','receipt_business_name'],['retail_settings','vat_version'],['retail_products','vat_treatment'],['retail_products','catalogue_source'],['retail_sales','vat_receipt'],['retail_sales','receipt_business']]) if (!columns.some(x => x.table_name === table && x.column_name === column)) throw new Error('Retail update column missing: ' + table + '.' + column);
  console.log('PASS: Retail database tables are ready. Retail remains off until enabled in Settings.');
  console.log('Existing stock, billing, admin permissions and .env were not replaced.');
  console.log('Restart InventoryOS Backend, then Settings > Retail mode > Enable > Open Retail.');
  console.log('VAT receipts, editable receipt business details and barcode product lookup are ready. Existing receipts were retained.');
})().catch(e => { console.error('Retail check failed: ' + e.message); process.exitCode = 1; }).finally(() => pool.end());
