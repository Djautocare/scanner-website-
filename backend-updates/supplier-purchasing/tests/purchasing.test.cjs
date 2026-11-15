'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { create } = require('../files/utils/supplierPurchasing.js');
const { prepare } = require('../prepare-reorder.cjs');

const user = randomUUID();
const workspace = randomUUID();
const inventory = randomUUID();
const otherInventory = randomUUID();
const otherWorkspace = randomUUID();

function request({ role = 'owner', workspaceId = workspace, inventories = [inventory], id, invoice, body = {} } = {}) {
  return {
    workspace: { id: workspaceId, role, inventory_ids: inventories },
    user: { id: user },
    params: { id, invoice },
    body
  };
}

const status = code => err => err.statusCode === code;

test('read permissions and date and money validation run before any database work', async () => {
  const service = create({ pool: {} });
  await assert.rejects(service.draft(request({ role: 'viewer' })), status(403));
  await assert.rejects(service.list(request({ inventories: ['invalid'] })), status(403));
  await assert.rejects(service.bill(request({ role: 'member' })), status(403));
  await assert.rejects(service.draft(request({ body: {
    request_id: randomUUID(), order_ids: ['1', '1'], buyer: 'Sample', supplier: 'Sample'
  } })), /select each/i);
  await assert.rejects(service.bill(request({ id: randomUUID(), body: {
    request_id: randomUUID(), reference: 'SAMPLE-01', invoice_date: '2026-02-30',
    due_date: '2026-03-30', amount_pence: 100
  } })), /valid invoice date/);
  await assert.rejects(service.payment(request({ id: randomUUID(), invoice: randomUUID(), body: {
    request_id: randomUUID(), reference: 'SAMPLE-PMT-01', paid_on: '2026-02-28', amount_pence: 1.05
  } })), /enter an amount/i);
});

test('mount is added once after workspace verification and rejects unexpected source', () => {
  const source = Buffer.from("'use strict';\nrouter.use(authMiddleware);\nrouter.use(workspaceMiddleware);\n");
  const fingerprint = createHash('sha256').update(source).digest('hex');
  const prepared = prepare(source, fingerprint);
  assert.match(prepared, /router\.use\(workspaceMiddleware\);\nrouter\.use\('\/purchase-orders', /);
  assert.equal(prepared.match(/purchase-orders/g).length, 1);
  assert.throws(() => prepare(Buffer.from('unexpected change'), fingerprint), /differs/);
});

const loader = process.env.INVENTORYOS_REVIEW_SCHEMA_LOADER;

test('purchase orders and invoice balances on a clean restore of the backend schema', { skip: !loader }, async t => {
  const { loadCurrentSchema } = require(loader);
  const db = await loadCurrentSchema();
  t.after(() => db.close());
  const sql = readFileSync(join(__dirname, '../files/sql/supplier-purchasing.sql'), 'utf8');
  await db.exec(sql);
  await db.exec(sql);

  await db.query('INSERT INTO users(id,email,name,password_hash) VALUES ($1,$2,$3,$4)',
    [user, 'buyer@example.invalid', 'Sample Buyer', 'fictional-test-record']);
  await db.query('INSERT INTO workspaces(id,name,owner_user_id) VALUES ($1,$2,$3),($4,$5,$3)',
    [workspace, 'Example workshop', user, otherWorkspace, 'Another workshop']);
  await db.query('INSERT INTO inventories(id,workspace_id,name) VALUES ($1,$2,$3),($4,$2,$5)',
    [inventory, workspace, 'Stockroom', otherInventory, 'Workshop']);

  async function addReorder(stockroom, sku, quantity, cost, productWorkspace = workspace) {
    const product = (await db.query(`INSERT INTO products(user_id,barcode,description,workspace_id,inventory_id)
      VALUES ($1,$2,$3,$4,$5) RETURNING id`, [user, sku, 'Sample ' + sku, productWorkspace, stockroom])).rows[0].id;
    const rule = (await db.query(`INSERT INTO reorder_rules(workspace_id,inventory_id,product_id,minimum_stock,reorder_to)
      VALUES ($1,$2,$3,0,10) RETURNING id`, [workspace, stockroom, product])).rows[0].id;
    return (await db.query(`INSERT INTO reorder_orders(workspace_id,inventory_id,rule_id,product_id,quantity,total_cost)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING id::text`, [workspace, stockroom, rule, product, quantity, cost])).rows[0].id;
  }

  const orderOne = await addReorder(inventory, 'WIDGET-A', 2, '14.25');
  const orderTwo = await addReorder(inventory, 'WIDGET-B', 3, '25.75', null);
  const staleOrder = await addReorder(inventory, 'WIDGET-C', 6, '12.00');
  const outOfScope = await addReorder(otherInventory, 'WIDGET-D', 5, '5.00');
  const pool = {
    query: (...args) => db.query(...args),
    connect: async () => ({ query: (...args) => db.query(...args), release() {} })
  };
  const service = create({ pool });
  const draftBody = {
    request_id: randomUUID(), order_ids: [orderOne, orderTwo],
    supplier: 'Sample Supplies', buyer: 'Example workshop'
  };
  assert.equal((await service.list(request())).eligible.length, 3);
  assert.deepEqual((await service.list(request({ role: 'viewer' }))).eligible, []);
  await assert.rejects(service.draft(request({ inventories: [inventory, otherInventory], body: {
    ...draftBody, request_id: randomUUID(), order_ids: [orderOne, outOfScope]
  } })), status(409));
  const { id } = await service.draft(request({ role: 'member', body: draftBody }));
  const draft = await service.detail(request({ id }));
  assert.equal(draft.lines.length, 2);
  assert.equal(Number(draft.order.total_pence), 4000);
  assert.equal((await service.draft(request({ body: draftBody }))).unchanged, true);
  assert.equal((await service.list(request())).eligible.length, 1);
  await assert.rejects(service.draft(request({ body: { ...draftBody, request_id: randomUUID() } })), status(409));
  await assert.rejects(service.detail(request({ id, inventories: [otherInventory] })), status(404));
  await assert.rejects(service.detail(request({ id, workspaceId: otherWorkspace })), status(404));
  await assert.rejects(service.change(request({ id, role: 'member', body: { action: 'approve', version: 0 } })), status(403));

  await service.change(request({ id, body: { action: 'approve', version: 0 } }));
  await assert.rejects(service.change(request({ id, body: { action: 'issue', version: 0 } })), status(409));
  await service.change(request({ id, body: { action: 'issue', version: 1 } }));
  assert.equal((await service.change(request({ id, body: { action: 'issue', version: 1 } }))).unchanged, true);
  assert.equal((await service.detail(request({ id }))).order.order_number, 1);
  await db.query("UPDATE reorder_orders SET status='received' WHERE id=$1", [orderOne]);
  const summary = (await service.list(request())).orders.find(order => order.id === id);
  assert.equal(summary.received_count, 1);
  assert.equal(summary.line_count, 2);

  const staleDraft = await service.draft(request({ body: { ...draftBody, request_id: randomUUID(), order_ids: [staleOrder] } }));
  await db.query('UPDATE reorder_orders SET total_cost=16 WHERE id=$1', [staleOrder]);
  await assert.rejects(service.change(request({ id: staleDraft.id, body: { action: 'approve', version: 0 } })), /linked reorder changed/i);
  await service.change(request({ id: staleDraft.id, body: { action: 'cancel', version: 0 } }));
  assert.equal((await service.list(request())).eligible[0].id, staleOrder);

  const invoiceBody = {
    reference: 'EXAMPLE-01', amount_pence: 4000, request_id: randomUUID(),
    invoice_date: '2025-01-01', due_date: '2025-02-01'
  };
  const { id: invoice } = await service.bill(request({ id, body: invoiceBody }));
  assert.equal((await service.bill(request({ id, body: invoiceBody }))).unchanged, true);
  await assert.rejects(service.bill(request({ id, body: {
    ...invoiceBody, reference: ' example-01 ', request_id: randomUUID()
  } })), status(409));
  const payment = { amount_pence: 1500, paid_on: '2025-01-20', reference: 'BANK-01', request_id: randomUUID() };
  await service.payment(request({ id, invoice, body: payment }));
  assert.equal((await service.payment(request({ id, invoice, body: payment }))).unchanged, true);
  await assert.rejects(service.payment(request({ id, invoice, body: { ...payment, request_id: randomUUID() } })), status(409));
  await assert.rejects(service.payment(request({ id, invoice, body: {
    ...payment, request_id: randomUUID(), reference: 'BANK-02', amount_pence: 2501
  } })), /outstanding invoice balance/);
  let [bill] = (await service.detail(request({ id }))).invoices;
  assert.equal(Number(bill.paid_pence), 1500);
  assert.equal(bill.overdue, true);
  assert.deepEqual((await service.detail(request({ id, role: 'member' }))).invoices, []);
  await service.payment(request({ id, invoice, body: {
    ...payment, request_id: randomUUID(), reference: 'BANK-02', amount_pence: 2500
  } }));
  [bill] = (await service.detail(request({ id }))).invoices;
  assert.equal(Number(bill.paid_pence), 4000);
  assert.equal(bill.overdue, false);
  assert.equal(bill.payments.length, 2);
  for (const table of ['inventory', 'expenses']) {
    assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM ' + table)).rows[0].n, 0);
  }
});
