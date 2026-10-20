'use strict';

// Retail has its own stock and cash ledgers. Legacy inventory is never mutated here.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const uuid = () => crypto.randomUUID();
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
function id(value) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value))) throw fail('Invalid record ID');
  return String(value).toLowerCase();
}
function text(value, label, max = 160, optional = false) {
  const s = String(value ?? '').trim();
  if ((!s && !optional) || s.length > max || /[\x00-\x1f\x7f]/.test(s)) throw fail(`${label} must be ${optional ? 'at most' : 'between 1 and'} ${max} characters`);
  return s;
}
function integer(value, label, min = 0, max = 1000000) {
  if (!/^-?\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < min || Number(value) > max) throw fail(`${label} must be a whole number between ${min} and ${max}`);
  return Number(value);
}
function money(value, label = 'Amount') {
  const s = String(value ?? '').trim();
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(s)) throw fail(`${label} must be a pound amount with at most two decimal places`);
  const [pounds, pennies = ''] = s.split('.');
  return integer(Number(pounds) * 100 + Number(pennies.padEnd(2, '0')), label, 0, 100000000);
}
function date(value) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw fail('Enter a valid date');
  return value;
}
function timestamp(value) {
  if (!value) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT/.test(value) || !/(Z|[+-]\d\d:\d\d)$/.test(value) || Number.isNaN(Date.parse(value))) throw fail('Enter a valid time with a timezone');
  return new Date(value).toISOString();
}
function web(value) {
  const s = text(value, 'Supplier link', 1000, true);
  if (!s) return '';
  let u; try { u = new URL(s); } catch { throw fail('Supplier link must start with https:// or http://'); }
  if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) throw fail('Use a public http or https supplier link');
  return u.href;
}
function dayAndTime(now, timezone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

function createService({ pool, calculateAccess, ensureBillingSchema = async () => {}, now = () => new Date() }) {
  let ready, worker;
  async function ensureSchema() {
    if (!ready) ready = (async () => {
      await ensureBillingSchema();
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await c.query("SELECT pg_advisory_xact_lock(hashtextextended('inventoryos-retail-schema-v1',0))");
        await c.query(fs.readFileSync(path.join(__dirname, '../sql/retail.sql'), 'utf8'));
        await c.query('COMMIT');
      } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
    })().catch(e => { ready = null; throw e; });
    return ready;
  }
  async function scope(c, req, { write = false, admin = false, inventory = true, enabled = true, entitled = true } = {}) {
    const workspace = id(req.workspace?.id), actor = id(req.user?.id);
    const requested = String(req.headers['x-workspace-id'] || '').trim().toLowerCase();
    if (requested && requested !== workspace) throw fail('Selected workspace is not available', 403);
    const r = await c.query(`SELECT w.*,u.admin_plan_override FROM workspaces w JOIN users u ON u.id=w.owner_user_id WHERE w.id=$1 ${write ? 'FOR SHARE OF w,u' : ''}`, [workspace]);
    const w = r.rows[0]; if (!w) throw fail('Workspace unavailable', 403);
    const members = await c.query(`SELECT role FROM workspace_members WHERE workspace_id=$1 AND user_id=$2 AND LOWER(TRIM(status))='active' ${write ? 'FOR SHARE' : ''}`, [workspace, actor]);
    const role = w.owner_user_id === actor ? 'owner' : String(members.rows[0]?.role || '').trim().toLowerCase();
    if (!['owner', 'admin', 'member', 'viewer'].includes(role) || (role === 'owner' && w.owner_user_id !== actor)) throw fail('Workspace access required', 403);
    if (write && role === 'viewer') throw fail('Viewers cannot change Retail records', 403);
    if (admin && !['owner', 'admin'].includes(role)) throw fail('The workspace owner or an admin must do this', 403);
    const access = calculateAccess(w, 'free');
    if (entitled && !access.allowed) throw fail('Select an active InventoryOS plan to use Retail', 402);
    const setting = (await c.query('SELECT * FROM retail_settings WHERE workspace_id=$1', [workspace])).rows[0] || { enabled: false, report_time: '17:00', timezone: 'Europe/London' };
    if (enabled && !setting.enabled) throw fail('Enable Retail mode in Settings first', 409);
    let inventoryId = null;
    if (inventory) {
      const selection = String(req.headers['x-inventory-ids'] || '').split(',').map(v => v.trim()).filter(Boolean);
      if (selection.length !== 1) throw fail('Select exactly one inventory for Retail');
      inventoryId = id(selection[0]);
      if (!(await c.query(`SELECT id FROM inventories WHERE id=$1 AND workspace_id=$2 ${write ? 'FOR SHARE' : ''}`, [inventoryId, workspace])).rows.length) throw fail('Inventory unavailable in this workspace', 403);
    }
    return { workspace_id: workspace, inventory_id: inventoryId, actor_id: actor, role, settings: setting, access };
  }
  const args = s => [s.workspace_id, s.inventory_id];
  async function audit(c, s, kind, data) {
    await c.query('INSERT INTO retail_audit(id,workspace_id,inventory_id,actor_id,kind,data) VALUES($1,$2,$3,$4,$5,$6)', [uuid(), s.workspace_id, s.inventory_id, s.actor_id, kind, JSON.stringify(data)]);
  }
  async function transaction(req, fn, options) {
    await ensureSchema();
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended('retail-workspace:'||$1,0))", [id(req.workspace?.id)]);
      const s = await scope(c, req, { ...options, write: true });
      const request = id(req.body?.request_id);
      const hash = crypto.createHash('sha256').update(JSON.stringify({ route: req.originalUrl, actor: s.actor_id, inventory: s.inventory_id, body: req.body })).digest('hex');
      const old = (await c.query('SELECT * FROM retail_requests WHERE workspace_id=$1 AND request_id=$2', [s.workspace_id, request])).rows[0];
      if (old) {
        if (hash !== old.body_hash) throw fail('Request already used with different details', 409);
        await c.query('COMMIT'); return { ...old.result, replayed: true };
      }
      const result = { success: true, ...await fn(c, s, req.body || {}) };
      await c.query('INSERT INTO retail_requests(workspace_id,request_id,body_hash,result) VALUES($1,$2,$3,$4)', [s.workspace_id, request, hash, JSON.stringify(result)]);
      await c.query('COMMIT'); return result;
    } catch (e) {
      await c.query('ROLLBACK');
      if (e.code === '23505') throw fail('This barcode or record already exists in this inventory', 409);
      if (e.code === '23514' || e.code === '22003') throw fail('This change exceeds the supported stock or money limits');
      throw e;
    } finally { c.release(); }
  }
  async function product(c, s, productId) {
    const p = (await c.query('SELECT * FROM retail_products WHERE workspace_id=$1 AND inventory_id=$2 AND id=$3 FOR UPDATE', [...args(s), id(productId)])).rows[0];
    if (!p) throw fail('Product not found in this inventory', 404);
    return p;
  }
  async function stock(c, s, p, delta, kind, reference, reason = '') {
    const next = integer(Number(p.stock_qty) + delta, 'Resulting stock', -1000000);
    const updated = (await c.query('UPDATE retail_products SET stock_qty=$4,stock_version=stock_version+1,updated_at=now() WHERE workspace_id=$1 AND inventory_id=$2 AND id=$3 RETURNING *', [...args(s), p.id, next])).rows[0];
    await c.query('INSERT INTO retail_stock_events(id,workspace_id,inventory_id,product_id,delta,resulting_qty,kind,reference_id,reason,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [uuid(), ...args(s), p.id, delta, next, kind, reference, reason, s.actor_id]);
    if (next < 0) await c.query("INSERT INTO retail_counts(id,workspace_id,inventory_id,product_id) VALUES($1,$2,$3,$4) ON CONFLICT(workspace_id,inventory_id,product_id) WHERE status='pending' DO NOTHING", [uuid(), ...args(s), p.id]);
    return updated;
  }
  async function till(c, s, required = false) {
    const session = (await c.query('SELECT * FROM retail_till_sessions WHERE workspace_id=$1 AND inventory_id=$2 AND closed_at IS NULL', args(s))).rows[0];
    if (!session) { if (required) throw fail('Open the till with its counted opening float first', 409); return null; }
    const events = (await c.query('SELECT COALESCE(SUM(amount_pence),0)::text AS total FROM retail_cash_events WHERE workspace_id=$1 AND inventory_id=$2 AND session_id=$3', [...args(s), session.id])).rows[0];
    return { ...session, expected_pence: Number(session.opening_pence) + Number(events.total) };
  }
  async function cash(c, s, session, kind, amount, { expected = null, counted = null, variance = null, sale = null, note = '' } = {}) {
    const event = uuid();
    await c.query('INSERT INTO retail_cash_events(id,workspace_id,inventory_id,session_id,kind,amount_pence,expected_pence,counted_pence,variance_pence,sale_id,note,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)', [event, ...args(s), session.id, kind, amount, expected, counted, variance, sale, note, s.actor_id]);
    return event;
  }
  async function reorders(c, s) {
    return (await c.query(`SELECT p.*,COALESCE(o.on_order,0)::integer AS on_order,
      GREATEST(p.target_qty-p.stock_qty-COALESCE(o.on_order,0),0)::integer AS order_qty
      FROM retail_products p LEFT JOIN (
        SELECT li.product_id,SUM(li.ordered_qty-li.received_qty) AS on_order FROM retail_delivery_items li
        JOIN retail_deliveries d ON d.id=li.delivery_id AND d.workspace_id=li.workspace_id AND d.inventory_id=li.inventory_id
        WHERE li.workspace_id=$1 AND li.inventory_id=$2 AND d.status IN('expected','incoming','partial') GROUP BY li.product_id
      ) o ON o.product_id=p.id WHERE p.workspace_id=$1 AND p.inventory_id=$2 AND NOT p.archived AND p.stock_qty<=p.minimum_qty
      ORDER BY p.stock_qty,p.name`, args(s))).rows;
  }
  async function report(c, s, manual = false) {
    const local = dayAndTime(now(), s.settings.timezone);
    if (!manual && local.time < s.settings.report_time) return null;
    const existing = (await c.query('SELECT * FROM retail_reports WHERE workspace_id=$1 AND inventory_id=$2 AND report_date=$3', [...args(s), local.day])).rows[0];
    if (existing && !manual) return existing;
    const rows = await reorders(c, s);
    const data = { generated_at: now().toISOString(), timezone: s.settings.timezone, items: rows.map(p => ({ product_id: p.id, name: p.name, barcode: p.barcode, stock_qty: p.stock_qty, minimum_qty: p.minimum_qty, target_qty: p.target_qty, on_order: p.on_order, order_qty: p.order_qty, unit_cost_pence: p.cost_pence, supplier: p.supplier, supplier_url: p.supplier_url })) };
    // A manual run is a live preview; it never overwrites the closing snapshot.
    if (manual) return { report_date: local.day, data, preview: true };
    return (await c.query('INSERT INTO retail_reports(id,workspace_id,inventory_id,report_date,data) VALUES($1,$2,$3,$4,$5) ON CONFLICT(workspace_id,inventory_id,report_date) DO NOTHING RETURNING *', [uuid(), ...args(s), local.day, JSON.stringify(data)])).rows[0] || existing;
  }
  async function status(req) {
    await ensureSchema();
    const s = await scope(pool, req, { inventory: false, entitled: false, enabled: false });
    return { success: true, workspace_id: s.workspace_id, role: s.role, allowed: s.access.allowed, enabled: s.settings.enabled, active: s.access.allowed && s.settings.enabled, settings: s.settings, plan: s.access.plan_key };
  }
  async function settings(c, s, b) {
    if (typeof b.enabled !== 'boolean') throw fail('Choose enabled or disabled');
    if (b.enabled && !s.access.allowed) throw fail('Select an active InventoryOS plan first', 402);
    const time = b.report_time ?? s.settings.report_time;
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw fail('Choose the daily report time');
    const timezone = text(b.timezone ?? s.settings.timezone, 'Timezone', 80);
    try { new Intl.DateTimeFormat('en-GB', { timeZone: timezone }).format(); } catch { throw fail('Choose a valid timezone'); }
    await c.query('INSERT INTO retail_settings(workspace_id,enabled,report_time,timezone) VALUES($1,$2,$3,$4) ON CONFLICT(workspace_id) DO UPDATE SET enabled=EXCLUDED.enabled,report_time=EXCLUDED.report_time,timezone=EXCLUDED.timezone,updated_at=now()', [s.workspace_id, b.enabled, time, timezone]);
    await audit(c, s, 'settings_changed', { enabled: b.enabled, report_time: time, timezone });
    return { enabled: b.enabled };
  }
  async function saveProduct(c, s, b, productId) {
    const name = text(b.name, 'Product name');
    const barcode = text(b.barcode || `RT-${uuid().slice(0, 12).toUpperCase()}`, 'Barcode', 100);
    const price = money(b.price, 'Selling price'), cost = money(b.cost, 'Cost per unit');
    const minimum = integer(b.minimum_qty, 'Minimum stock'), target = integer(b.target_qty, 'Reorder target', minimum);
    const supplier = text(b.supplier, 'Supplier', 160, true), url = web(b.supplier_url);
    let p;
    if (productId) {
      const old = await product(c, s, productId);
      if (integer(b.edit_version, 'Product version', 0, 2147483647) !== old.edit_version) throw fail('Product changed since you opened it. Refresh before saving', 409);
      if (typeof b.archived !== 'boolean') throw fail('Choose whether the product is archived');
      if (old.archived && !b.archived && s.access.active_item_limit != null) {
        const active = Number((await c.query('SELECT COUNT(*)::text AS n FROM retail_products WHERE workspace_id=$1 AND NOT archived', [s.workspace_id])).rows[0].n);
        const legacy = Number((await c.query('SELECT COUNT(*)::text AS n FROM products WHERE workspace_id=$1', [s.workspace_id])).rows[0].n);
        if (active + legacy >= s.access.active_item_limit) throw fail('Your plan’s product limit has been reached', 402);
      }
      if (b.archived && !old.archived) {
        if (old.stock_qty !== 0 || (await c.query("SELECT id FROM retail_counts WHERE workspace_id=$1 AND inventory_id=$2 AND product_id=$3 AND status='pending'", [...args(s), old.id])).rows.length || (await reorders(c, s)).some(x => x.id === old.id && x.on_order > 0)) throw fail('Clear stock, counts and outstanding deliveries before archiving');
        const outstanding = (await c.query("SELECT li.id FROM retail_delivery_items li JOIN retail_deliveries d ON d.id=li.delivery_id WHERE li.workspace_id=$1 AND li.inventory_id=$2 AND li.product_id=$3 AND d.status IN('expected','incoming','partial') AND li.received_qty<li.ordered_qty", [...args(s), old.id])).rows;
        if (outstanding.length) throw fail('Complete or cancel this product’s outstanding deliveries first');
      }
      p = (await c.query('UPDATE retail_products SET name=$4,barcode=$5,price_pence=$6,cost_pence=$7,minimum_qty=$8,target_qty=$9,supplier=$10,supplier_url=$11,archived=$12,edit_version=edit_version+1,updated_at=now() WHERE workspace_id=$1 AND inventory_id=$2 AND id=$3 RETURNING *', [...args(s), old.id, name, barcode, price, cost, minimum, target, supplier, url, b.archived])).rows[0];
    } else {
      const count = Number((await c.query('SELECT COUNT(*)::text AS n FROM retail_products WHERE workspace_id=$1 AND NOT archived', [s.workspace_id])).rows[0].n);
      const legacy = Number((await c.query('SELECT COUNT(*)::text AS n FROM products WHERE workspace_id=$1', [s.workspace_id])).rows[0].n);
      if (s.access.active_item_limit != null && count + legacy >= s.access.active_item_limit) throw fail('Your plan’s product limit has been reached', 402);
      if (Number((await c.query('SELECT COUNT(*)::text AS n FROM retail_products WHERE workspace_id=$1 AND inventory_id=$2', args(s))).rows[0].n) >= 5000) throw fail('This inventory has reached the Retail limit of 5,000 products');
      p = (await c.query('INSERT INTO retail_products(id,workspace_id,inventory_id,name,barcode,price_pence,cost_pence,minimum_qty,target_qty,supplier,supplier_url) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *', [uuid(), ...args(s), name, barcode, price, cost, minimum, target, supplier, url])).rows[0];
      const opening = integer(b.opening_qty ?? 0, 'Opening quantity');
      if (opening) p = await stock(c, s, p, opening, 'opening', null, 'Opening Retail stock');
    }
    await audit(c, s, productId ? 'product_updated' : 'product_created', { product_id: p.id, name, barcode, price_pence: price, cost_pence: cost });
    return { product: p };
  }
  async function receiveStock(c, s, b) {
    const p = await product(c, s, b.product_id); if (p.archived) throw fail('This product is archived');
    const reason = text(b.reason, 'Stock-in reason', 300);
    return { product: await stock(c, s, p, integer(b.qty, 'Quantity received', 1), 'stock_in', null, reason) };
  }
  async function countStock(c, s, b, countId) {
    const row = (await c.query('SELECT * FROM retail_counts WHERE workspace_id=$1 AND inventory_id=$2 AND id=$3 FOR UPDATE', [...args(s), id(countId)])).rows[0];
    if (!row || row.status !== 'pending') throw fail('Count no longer awaiting completion', 409);
    const p = await product(c, s, row.product_id);
    if (integer(b.stock_version, 'Stock version', 0, 2147483647) !== p.stock_version) throw fail('Stock changed while you were counting. Refresh, count again and retry', 409);
    const qty = integer(b.qty, 'Counted quantity'), reason = text(b.reason, 'Count note', 300);
    await stock(c, s, p, qty - p.stock_qty, 'count', row.id, reason);
    await c.query("UPDATE retail_counts SET status='completed',expected_qty=$4,counted_qty=$5,difference=$6,reason=$7,actor_id=$8,completed_at=now() WHERE workspace_id=$1 AND inventory_id=$2 AND id=$3", [...args(s), row.id, p.stock_qty, qty, qty - p.stock_qty, reason, s.actor_id]);
    return { difference: qty - p.stock_qty };
  }
  async function requestCount(c, s, b) {
    const p = await product(c, s, b.product_id);
    if (p.archived) throw fail('This product is archived');
    await c.query("INSERT INTO retail_counts(id,workspace_id,inventory_id,product_id) VALUES($1,$2,$3,$4) ON CONFLICT(workspace_id,inventory_id,product_id) WHERE status='pending' DO NOTHING", [uuid(), ...args(s), p.id]);
    return {};
  }
  async function openTill(c, s, b) {
    if (await till(c, s)) throw fail('The till is already open', 409);
    const opening = money(b.amount, 'Opening float');
    const session = (await c.query('INSERT INTO retail_till_sessions(id,workspace_id,inventory_id,opening_pence,opened_by) VALUES($1,$2,$3,$4,$5) RETURNING *', [uuid(), ...args(s), opening, s.actor_id])).rows[0];
    await audit(c, s, 'till_opened', { session_id: session.id, opening_pence: opening });
    return { till: { ...session, expected_pence: opening } };
  }
  async function movement(c, s, b) {
    const t = await till(c, s, true);
    if (!['lift', 'change_in', 'adjustment'].includes(b.kind)) throw fail('Choose cash lift, change handout or float adjustment');
    const amount = money(b.amount), note = text(b.note, 'Reason', 300);
    if (!amount) throw fail('Enter an amount greater than zero');
    if (b.kind === 'adjustment' && !['in', 'out'].includes(b.direction)) throw fail('Choose cash in or out');
    const delta = b.kind === 'lift' || (b.kind === 'adjustment' && b.direction === 'out') ? -amount : amount;
    if (t.expected_pence + delta < 0 || t.expected_pence + delta > 100000000) throw fail('Cash movement exceeds the expected cash in this till');
    await cash(c, s, t, b.kind, delta, { note });
    return { till: await till(c, s) };
  }
  async function balance(c, s, b) {
    const t = await till(c, s, true), counted = money(b.amount, 'Counted cash');
    if (typeof b.close !== 'boolean') throw fail('Choose whether to close the till');
    const variance = counted - t.expected_pence, note = text(b.note, 'Balance note', 300, true);
    // The adjustment establishes a new counted baseline. Historic variances stay immutable.
    await cash(c, s, t, b.close ? 'close' : 'balance', variance, { expected: t.expected_pence, counted, variance, note });
    if (b.close) await c.query('UPDATE retail_till_sessions SET closed_at=now() WHERE workspace_id=$1 AND inventory_id=$2 AND id=$3', [...args(s), t.id]);
    return { variance_pence: variance, expected_pence: t.expected_pence, counted_pence: counted, till: await till(c, s) };
  }
  async function checkout(c, s, b) {
    const t = await till(c, s, true);
    if (b.payment_method !== 'cash') throw fail('Automatic card payments are not connected. Use cash checkout only');
    if (!Array.isArray(b.items) || !b.items.length || b.items.length > 100) throw fail('Add between 1 and 100 different products');
    const seen = new Set(), items = []; let total = 0;
    for (const item of b.items) {
      const p = await product(c, s, item.product_id);
      if (p.archived || seen.has(p.id)) throw fail('Each active product must appear only once');
      seen.add(p.id);
      if (integer(item.unit_price_pence, 'Reviewed price', 0, 100000000) !== p.price_pence) throw fail(`${p.name} has a new selling price. Refresh and review the basket`, 409);
      const qty = integer(item.qty, 'Sale quantity', 1);
      total += qty * p.price_pence; integer(total, 'Sale total', 0, 100000000);
      items.push({ product: p, qty });
    }
    const tendered = money(b.tendered, 'Cash received');
    if (tendered < total) throw fail('Cash received is less than the sale total');
    if (t.expected_pence + total > 100000000) throw fail('Cash limit reached. Balance and close this till first');
    const saleId = uuid(), reference = `RT-${now().toISOString().slice(0, 10).replace(/-/g, '')}-${saleId.slice(0, 8).toUpperCase()}`;
    const sale = (await c.query('INSERT INTO retail_sales(id,workspace_id,inventory_id,reference,total_pence,tendered_pence,change_pence,payment_method,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *', [saleId, ...args(s), reference, total, tendered, tendered - total, 'cash', s.actor_id])).rows[0];
    for (const { product: p, qty } of items) {
      await c.query('INSERT INTO retail_sale_items(id,workspace_id,inventory_id,sale_id,product_id,name,barcode,qty,unit_price_pence,unit_cost_pence) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [uuid(), ...args(s), saleId, p.id, p.name, p.barcode, qty, p.price_pence, p.cost_pence]);
      await stock(c, s, p, -qty, 'sale', saleId);
    }
    await cash(c, s, t, 'sale', total, { sale: saleId, note: reference });
    return { sale: { ...sale, items: items.map(({ product: p, qty }) => ({ name: p.name, barcode: p.barcode, qty, unit_price_pence: p.price_pence })) } };
  }
  async function refund(c, s, b, saleId) {
    const sale = (await c.query('SELECT * FROM retail_sales WHERE workspace_id=$1 AND inventory_id=$2 AND id=$3 FOR UPDATE', [...args(s), id(saleId)])).rows[0];
    if (!sale || sale.status !== 'completed') throw fail('This sale is not available for refund', 409);
    if (typeof b.restock !== 'boolean') throw fail('Choose whether returned items can go back into stock');
    const t = await till(c, s, true), reason = text(b.reason, 'Refund reason', 300);
    if (t.expected_pence < sale.total_pence) throw fail('Not enough expected cash in the till to record this refund');
    const lines = (await c.query('SELECT * FROM retail_sale_items WHERE workspace_id=$1 AND inventory_id=$2 AND sale_id=$3', [...args(s), sale.id])).rows;
    if (b.restock) for (const line of lines) {
      const p = await product(c, s, line.product_id);
      if (p.archived) throw fail('Unarchive returned products before putting them back into stock');
      await stock(c, s, p, line.qty, 'refund', sale.id, reason);
    }
    await cash(c, s, t, 'refund', -sale.total_pence, { sale: sale.id, note: reason });
    await c.query("UPDATE retail_sales SET status='refunded',refunded_at=now(),refund_reason=$4,refund_restocked=$5,refund_actor_id=$6 WHERE workspace_id=$1 AND inventory_id=$2 AND id=$3", [...args(s), sale.id, reason, b.restock, s.actor_id]);
    await audit(c, s, 'sale_refunded', { sale_id: sale.id, amount_pence: sale.total_pence, restocked: b.restock, reason });
    return { refunded_pence: sale.total_pence };
  }
  async function createDelivery(c, s, b) {
    if (!Array.isArray(b.items) || !b.items.length || b.items.length > 100) throw fail('Add between 1 and 100 products to the delivery');
    const delivery = uuid(), seen = new Set();
    await c.query('INSERT INTO retail_deliveries(id,workspace_id,inventory_id,supplier,reference,expected_on,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7)', [delivery, ...args(s), text(b.supplier, 'Supplier', 160, true), text(b.reference, 'Order reference', 160, true), date(b.expected_on), s.actor_id]);
    for (const line of b.items) {
      const p = await product(c, s, line.product_id);
      if (p.archived || seen.has(p.id)) throw fail('Each active product must appear once per delivery');
      seen.add(p.id);
      await c.query('INSERT INTO retail_delivery_items(id,workspace_id,inventory_id,delivery_id,product_id,ordered_qty,unit_cost_pence) VALUES($1,$2,$3,$4,$5,$6,$7)', [uuid(), ...args(s), delivery, p.id, integer(line.qty, 'Order quantity', 1), money(line.cost, 'Cost per unit')]);
    }
    await audit(c, s, 'delivery_created', { delivery_id: delivery }); return { delivery_id: delivery };
  }
  async function delivery(c, s, deliveryId) {
    const d = (await c.query('SELECT * FROM retail_deliveries WHERE workspace_id=$1 AND inventory_id=$2 AND id=$3 FOR UPDATE', [...args(s), id(deliveryId)])).rows[0];
    if (!d) throw fail('Delivery not found in this inventory', 404);
    if (['cancelled', 'received'].includes(d.status)) throw fail('This delivery is already complete or cancelled', 409);
    return d;
  }
  async function deliveryStatus(c, s, b, deliveryId) {
    const d = await delivery(c, s, deliveryId);
    if (!['incoming', 'cancelled'].includes(b.status)) throw fail('Choose incoming or cancelled');
    if (d.status === 'partial' && b.status !== 'cancelled') throw fail('Continue receiving this partial delivery');
    await c.query('UPDATE retail_deliveries SET status=$4 WHERE workspace_id=$1 AND inventory_id=$2 AND id=$3', [...args(s), d.id, b.status]);
    await audit(c, s, 'delivery_status', { delivery_id: d.id, status: b.status }); return {};
  }
  async function receiveDelivery(c, s, b, deliveryId) {
    const d = await delivery(c, s, deliveryId);
    if (!Array.isArray(b.items) || !b.items.length || b.items.length > 100) throw fail('Choose quantities received');
    const seen = new Set(); let total = 0;
    for (const input of b.items) {
      const line = (await c.query('SELECT * FROM retail_delivery_items WHERE workspace_id=$1 AND inventory_id=$2 AND delivery_id=$3 AND id=$4 FOR UPDATE', [...args(s), d.id, id(input.id)])).rows[0];
      if (!line || seen.has(line.id)) throw fail('Choose each delivery line once');
      seen.add(line.id); const qty = integer(input.qty, 'Received quantity', 0, line.ordered_qty - line.received_qty);
      if (!qty) continue; total += qty;
      const p = await product(c, s, line.product_id);
      if (p.archived) throw fail('Unarchive this product before receiving it');
      await stock(c, s, p, qty, 'delivery', d.id, d.reference);
      await c.query('UPDATE retail_delivery_items SET received_qty=received_qty+$5 WHERE workspace_id=$1 AND inventory_id=$2 AND delivery_id=$3 AND id=$4', [...args(s), d.id, line.id, qty]);
      await c.query('UPDATE retail_products SET cost_pence=$4,edit_version=edit_version+1,updated_at=now() WHERE workspace_id=$1 AND inventory_id=$2 AND id=$3', [...args(s), p.id, line.unit_cost_pence]);
    }
    if (!total) throw fail('Enter at least one unit received');
    const remaining = Number((await c.query('SELECT SUM(ordered_qty-received_qty)::text AS n FROM retail_delivery_items WHERE workspace_id=$1 AND inventory_id=$2 AND delivery_id=$3', [...args(s), d.id])).rows[0].n);
    await c.query("UPDATE retail_deliveries SET status=$4,received_at=CASE WHEN $4='received' THEN now() ELSE NULL END WHERE workspace_id=$1 AND inventory_id=$2 AND id=$3", [...args(s), d.id, remaining === 0 ? 'received' : 'partial']);
    return { received_qty: total, remaining_qty: remaining };
  }
  async function createTask(c, s, b) {
    const task = uuid();
    await c.query('INSERT INTO retail_tasks(id,workspace_id,inventory_id,title,due_at,actor_id) VALUES($1,$2,$3,$4,$5,$6)', [task, ...args(s), text(b.title, 'Task', 240), timestamp(b.due_at), s.actor_id]);
    return { task_id: task };
  }
  async function taskStatus(c, s, b, taskId) {
    if (!['pending', 'completed'].includes(b.status)) throw fail('Choose pending or completed');
    const result = await c.query("UPDATE retail_tasks SET status=$4,completed_at=CASE WHEN $4='completed' THEN now() ELSE NULL END WHERE workspace_id=$1 AND inventory_id=$2 AND id=$3 RETURNING id", [...args(s), id(taskId), b.status]);
    if (!result.rows.length) throw fail('Task not found', 404); return {};
  }
  async function overview(req) {
    await ensureSchema(); const c = await pool.connect();
    try {
      await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
      const s = await scope(c, req);
      const products = (await c.query('SELECT * FROM retail_products WHERE workspace_id=$1 AND inventory_id=$2 ORDER BY archived,name,id', args(s))).rows;
      const deliveries = (await c.query(`SELECT d.*,d.expected_on::text AS expected_on,COALESCE(jsonb_agg(jsonb_build_object('id',li.id,'product_id',li.product_id,'name',p.name,'ordered_qty',li.ordered_qty,'received_qty',li.received_qty,'unit_cost_pence',li.unit_cost_pence) ORDER BY p.name) FILTER(WHERE li.id IS NOT NULL),'[]') AS items FROM retail_deliveries d LEFT JOIN retail_delivery_items li ON li.delivery_id=d.id LEFT JOIN retail_products p ON p.id=li.product_id WHERE d.workspace_id=$1 AND d.inventory_id=$2 GROUP BY d.id ORDER BY d.created_at DESC LIMIT 200`, args(s))).rows;
      const tasks = (await c.query("SELECT * FROM retail_tasks WHERE workspace_id=$1 AND inventory_id=$2 ORDER BY (status='pending') DESC,due_at NULLS LAST,created_at DESC LIMIT 500", args(s))).rows;
      const counts = (await c.query("SELECT c.*,p.name,p.barcode,p.stock_qty,p.stock_version FROM retail_counts c JOIN retail_products p ON p.id=c.product_id WHERE c.workspace_id=$1 AND c.inventory_id=$2 ORDER BY (c.status='pending') DESC,c.created_at DESC LIMIT 500", args(s))).rows;
      const sales = (await c.query(`SELECT s.*,COALESCE((SELECT jsonb_agg(jsonb_build_object('name',li.name,'qty',li.qty,'unit_price_pence',li.unit_price_pence,'barcode',li.barcode) ORDER BY li.name) FROM retail_sale_items li WHERE li.sale_id=s.id),'[]') AS items FROM retail_sales s WHERE s.workspace_id=$1 AND s.inventory_id=$2 ORDER BY s.created_at DESC LIMIT 100`, args(s))).rows;
      const daily = (await c.query(`SELECT (occurred_at AT TIME ZONE $3)::date::text AS day,SUM(amount)::text AS net_pence FROM (
        SELECT created_at AS occurred_at,total_pence AS amount FROM retail_sales WHERE workspace_id=$1 AND inventory_id=$2 AND created_at>=now()-interval '8 days'
        UNION ALL SELECT refunded_at AS occurred_at,-total_pence AS amount FROM retail_sales WHERE workspace_id=$1 AND inventory_id=$2 AND refunded_at>=now()-interval '8 days'
      ) entries GROUP BY (occurred_at AT TIME ZONE $3)::date ORDER BY day`, [...args(s), s.settings.timezone])).rows;
      const cashHistory = (await c.query('SELECT * FROM retail_cash_events WHERE workspace_id=$1 AND inventory_id=$2 ORDER BY created_at DESC LIMIT 100', args(s))).rows;
      const t = await till(c, s), reorder = await reorders(c, s);
      const reports = (await c.query('SELECT *,report_date::text AS report_date FROM retail_reports WHERE workspace_id=$1 AND inventory_id=$2 ORDER BY retail_reports.report_date DESC LIMIT 31', args(s))).rows;
      await c.query('COMMIT');
      return { success: true, workspace_id: s.workspace_id, inventory_id: s.inventory_id, role: s.role, settings: s.settings, products, deliveries, tasks, counts, sales, daily_sales: daily.map(x => ({ ...x, net_pence: Number(x.net_pence) })), till: t, cash_history: cashHistory, reorders: reorder, reports, server_now: now().toISOString() };
    } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
  }
  async function history(req) {
    await ensureSchema(); const s = await scope(pool, req);
    const events = (await pool.query('SELECT * FROM retail_stock_events WHERE workspace_id=$1 AND inventory_id=$2 AND product_id=$3 ORDER BY created_at DESC LIMIT 200', [...args(s), id(req.params.id)])).rows;
    return { success: true, events };
  }
  async function tick() {
    await ensureSchema();
    const targets = (await pool.query('SELECT r.*,i.id AS inventory_id,w.*,u.admin_plan_override,r.workspace_id FROM retail_settings r JOIN workspaces w ON w.id=r.workspace_id JOIN users u ON u.id=w.owner_user_id JOIN inventories i ON i.workspace_id=w.id WHERE r.enabled=true')).rows;
    for (const row of targets) {
      if (!calculateAccess(row, 'free').allowed) continue;
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await c.query("SELECT pg_advisory_xact_lock(hashtextextended('retail-workspace:'||$1,0))", [row.workspace_id]);
        const fresh = (await c.query('SELECT w.*,u.admin_plan_override,r.enabled,r.report_time,r.timezone FROM workspaces w JOIN users u ON u.id=w.owner_user_id JOIN retail_settings r ON r.workspace_id=w.id WHERE w.id=$1 FOR SHARE OF w,u,r', [row.workspace_id])).rows[0];
        if (fresh?.enabled && calculateAccess(fresh, 'free').allowed) await report(c, { workspace_id: row.workspace_id, inventory_id: row.inventory_id, settings: fresh });
        await c.query('COMMIT');
      } catch (e) { await c.query('ROLLBACK'); console.error('Retail daily report failed:', e.code || e.name); } finally { c.release(); }
    }
  }
  function start() {
    if (worker) return;
    let running = false;
    const run = async () => { if (running) return; running = true; try { await tick(); } catch (e) { console.error('Retail report worker:', e.code || e.name); } finally { running = false; } };
    run(); worker = setInterval(run, 60000); worker.unref?.();
  }
  return { ensureSchema, scope, status, transaction, settings, saveProduct, receiveStock, countStock, requestCount, openTill, movement, balance, checkout, refund, createDelivery, deliveryStatus, receiveDelivery, createTask, taskStatus, overview, history, report, reorders, tick, start };
}

let live;
function service() {
  if (!live) { const billing = require('./billing'); live = createService({ pool: require('../database'), calculateAccess: billing.calculateAccess, ensureBillingSchema: billing.ensureBillingSchema }); }
  return live;
}
module.exports = { createService, service, money, integer, dayAndTime, fail };
