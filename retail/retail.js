(function () {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pounds = pence => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(Number(pence || 0) / 100);
  const decimal = pence => (Number(pence || 0) / 100).toFixed(2);
  const when = value => value ? new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : 'No date set';
  const dateOnly = value => value ? new Date(value + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'Date not set';
  const localDay = (value, zone) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value)).map(x => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}`;
  };
  const nav = [['dashboard', '▦', 'Dashboard'], ['checkout', '▤', 'Checkout'], ['products', '□', 'Products & stock'], ['deliveries', '↓', 'Deliveries'], ['reorders', '↻', 'Reorder report'], ['counts', '✓', 'Stock counts'], ['tasks', '◷', 'Tasks'], ['cash', '£', 'Till & cash'], ['sales', '↗', 'Sales & receipts'], ['settings', '⚙', 'Retail settings']];
  let data = null, online = false, ready = false, generation = 0, currentScope = '', basket = [], search = '', checkoutBusy = false;
  let view = location.hash.slice(1) || 'dashboard';
  const admin = () => online && ['owner', 'admin'].includes(data?.role);
  const writer = () => online && data?.role && data.role !== 'viewer';
  const selected = () => ({ workspace: localStorage.getItem('inventoryos_selected_workspace_id') || '', inventory: InventoryAPI.getSelectedInventoryHeader(), user: InventoryAPI.getUser()?.id || '' });
  const scopeKey = () => JSON.stringify(selected());
  const pendingKey = () => 'inventoryos_retail_pending:' + currentScope;
  function pending() { try { return JSON.parse(localStorage.getItem(pendingKey()) || 'null'); } catch { return null; } }
  function setPending(value) { if (value) localStorage.setItem(pendingKey(), JSON.stringify(value)); else localStorage.removeItem(pendingKey()); }
  function notice(message = '', error = false) {
    const box = $('#retailNotice'); box.classList.toggle('error', error); box.replaceChildren(document.createTextNode(message));
    if (pending()) {
      box.append(document.createTextNode(' A previous action is awaiting confirmation. Retry it safely before making another change. '));
      const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = 'Retry pending action'; retry.dataset.action = 'retry'; box.append(retry);
    }
  }
  async function api(path, options = {}) {
    const result = await InventoryAPI.request('/retail' + path, options);
    if (!result.success) throw Object.assign(new Error(result.error || 'Could not load Retail'), { result });
    return result;
  }
  async function mutate(path, body, method = 'POST', retry = false) {
    if (scopeKey() !== currentScope) throw new Error('Workspace changed. Refresh before continuing.');
    const old = pending();
    if (old && !retry) throw new Error('Retry the pending action using the button above before making another change.');
    const operation = retry ? old : { path, method, body: { ...body, request_id: crypto.randomUUID() } };
    if (!operation) return null;
    const context = currentScope, storageKey = pendingKey();
    setPending(operation);
    try {
      const r = await api(operation.path, { method: operation.method, body: JSON.stringify(operation.body) });
      localStorage.removeItem(storageKey);
      if (context !== currentScope) return null;
      return r;
    } catch (e) {
      if (e.result?.retryable === false) localStorage.removeItem(storageKey);
      if (context === currentScope) notice(e.message, true);
      throw e;
    }
  }
  const button = (label, action, extra = '', disabled = false, primary = false) => `<button type="button" data-action="${action}" ${extra} ${disabled ? 'disabled' : ''} class="${primary ? 'retail-primary' : ''}">${esc(label)}</button>`;
  const go = (label, next) => `<button type="button" data-view="${next}">${esc(label)}</button>`;
  const badge = (label, kind = '') => `<span class="retail-pill ${kind}">${esc(label)}</span>`;
  const empty = message => `<div class="retail-empty">${esc(message)}</div>`;
  const header = (title, subtitle = '', action = '') => `<div class="retail-card-head"><div><h2>${esc(title)}</h2>${subtitle ? `<p class="retail-muted">${esc(subtitle)}</p>` : ''}</div>${action}</div>`;
  const card = content => `<section class="retail-card">${content}</section>`;
  const row = (title, subtitle, right = '') => `<div class="retail-list-row"><div class="retail-list-copy"><strong>${esc(title)}</strong><small>${esc(subtitle)}</small></div><div class="retail-list-right">${right}</div></div>`;
  const table = (headings, rows, noRows) => `<div class="retail-table-wrap"><table class="retail-table"><thead><tr>${headings.map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.join('') : `<tr><td colspan="${headings.length}">${esc(noRows)}</td></tr>`}</tbody></table></div>`;
  function tillPanel() {
    const t = data.till;
    return card(header('Till overview', t ? 'Expected cash currently in the drawer' : 'Count the drawer before your first sale', go('View cash history', 'cash')) + (t ?
      `<div class="retail-till-amount">${pounds(t.expected_pence)}</div><div class="retail-muted">Opened ${when(t.opened_at)}</div><div class="retail-till-summary"><div><span class="retail-muted">Opening float</span><strong>${pounds(t.opening_pence)}</strong></div><div><span class="retail-muted">Since opening</span><strong>${pounds(t.expected_pence - t.opening_pence)}</strong></div></div><div class="retail-action-row">${button('Cash lift', 'cash-move', 'data-kind="lift"', !admin())}${button('Change handout', 'cash-move', 'data-kind="change_in"', !admin())}${button('Adjust float', 'cash-move', 'data-kind="adjustment"', !admin())}${button('Balance till', 'balance', '', !admin(), true)}</div><p class="retail-help">Cash lift removes money. Change handout records change money added to this drawer. Balancing saves the counted amount and any shortage or overage.</p>` :
      empty('The till is closed. An owner or admin can open it with a counted float.') + button('Open till & set float', 'till-open', '', !admin(), true)));
  }
  function dashboard() {
    const pendingCounts = data.counts.filter(x => x.status === 'pending');
    const expected = data.deliveries.filter(x => x.status === 'expected');
    const incoming = data.deliveries.filter(x => ['incoming', 'partial'].includes(x.status));
    const now = Date.now();
    const due = data.tasks.filter(x => x.status === 'pending' && (!x.due_at || Date.parse(x.due_at) <= now));
    const upcoming = data.tasks.filter(x => x.status === 'pending' && x.due_at && Date.parse(x.due_at) > now);
    const today = localDay(data.server_now, data.settings.timezone), todayNet = data.daily_sales.find(x => x.day === today)?.net_pence || 0;
    const metrics = [['Today’s net sales', pounds(todayNet), 'Cash sales less refunds', '£'], ['Stock on hand', data.products.filter(p => !p.archived).reduce((n, p) => n + p.stock_qty, 0), 'Retail units, including negatives', '□'], ['Needs reordering', data.reorders.filter(x => x.order_qty > 0).length, 'Products after incoming stock', '↻'], ['Stock counts due', pendingCounts.length, 'Check and correct actual stock', '✓']];
    const deliveryRows = list => list.slice(0, 4).map(d => row(d.supplier || 'Delivery', `${d.reference || 'No reference'} · ${dateOnly(d.expected_on)} · ${d.items.reduce((n, i) => n + i.ordered_qty - i.received_qty, 0)} units outstanding`, button('View', 'delivery-view', `data-id="${d.id}"`))).join('');
    return `<div class="retail-metrics">${metrics.map(m => `<section class="retail-metric"><div class="retail-metric-label">${m[0]}<span aria-hidden="true">${m[3]}</span></div><div class="retail-metric-value">${esc(m[1])}</div><div class="retail-muted">${m[2]}</div></section>`).join('')}</div><div class="retail-grid">${card(header('Expected deliveries', `${expected.length} orders awaiting dispatch`, go('All deliveries', 'deliveries')) + (deliveryRows(expected) || empty('No expected deliveries.')))}${tillPanel()}${card(header('Incoming deliveries', 'On their way or partly received') + (deliveryRows(incoming) || empty('No incoming deliveries.')))}${card(header('Tasks to complete', `${due.length} due now or without a date`, button('Add task', 'task-new', '', !writer())) + (due.slice(0, 4).map(t => row(t.title, t.due_at ? when(t.due_at) : 'Ready when you are', button('Complete', 'task-complete', `data-id="${t.id}"`, !writer()))).join('') || empty('You’re up to date.')))}${card(header('Upcoming tasks', 'What’s next', go('View tasks', 'tasks')) + (upcoming.slice(0, 4).map(t => row(t.title, when(t.due_at), badge('Upcoming'))).join('') || empty('No upcoming tasks.')))}${card(header('Stock that needs attention', 'Negative stock stays sellable and is flagged for counting', go('Stock counts', 'counts')) + (pendingCounts.slice(0, 4).map(c => row(c.name, `Recorded stock: ${c.stock_qty}`, button('Count', 'count', `data-id="${c.id}"`, !writer()))).join('') || empty('No outstanding stock counts.')))}</div>${salesChart()}`;
  }
  function salesChart() {
    const zone = data.settings.timezone, days = [];
    for (let i = 6; i >= 0; i--) { const d = new Date(data.server_now); d.setUTCDate(d.getUTCDate() - i); const day = localDay(d, zone); days.push({ day, net: data.daily_sales.find(x => x.day === day)?.net_pence || 0 }); }
    const max = Math.max(1, ...days.map(d => Math.abs(d.net)));
    return `<section class="retail-card retail-sales">${header('Sales performance', `Last 7 days · ${zone} · net of refunds`, go('Sales & receipts', 'sales'))}<div class="retail-bars" role="img" aria-label="${esc(days.map(d => `${dateOnly(d.day)}: ${pounds(d.net)}`).join('; '))}">${days.map(d => `<div class="retail-bar-day" title="${esc(dateOnly(d.day) + ': ' + pounds(d.net))}"><span>${pounds(d.net)}</span><span class="retail-bar" style="height:${Math.max(2, Math.abs(d.net) / max * 85)}px;${d.net < 0 ? 'background:var(--danger)' : ''}"></span><span>${dateOnly(d.day)}</span></div>`).join('')}</div><div class="retail-sales-summary"><div><span class="retail-muted">7-day net sales</span><strong>${pounds(days.reduce((n, d) => n + d.net, 0))}</strong></div><div><span class="retail-muted">Payment method</span><strong>Cash</strong></div></div></section>`;
  }
  function productView() {
    const filter = search.toLowerCase(), products = data.products.filter(p => (p.name + ' ' + p.barcode).toLowerCase().includes(filter));
    return card(header('Products & stock', 'Fixed selling prices, minimum quantities and reorder targets', button('Add product', 'product-new', '', !admin(), true)) + `<div class="retail-toolbar"><input id="retailSearch" type="search" aria-label="Search products or barcodes" placeholder="Search products or scan a barcode" value="${esc(search)}"></div>` + table(['Product', 'Price', 'Stock', 'Minimum / target', 'Actions'], products.map(p => `<tr><td><strong>${esc(p.name)} ${p.archived ? badge('Archived') : ''}</strong><small>${esc(p.barcode)}</small></td><td>${pounds(p.price_pence)}<small>Cost ${pounds(p.cost_pence)}</small></td><td class="${p.stock_qty < 0 ? 'retail-negative' : ''}">${p.stock_qty}</td><td>${p.minimum_qty} / ${p.target_qty}</td><td>${button('Edit', 'product-edit', `data-id="${p.id}"`, !admin())} ${button('Stock in', 'stock-in', `data-id="${p.id}"`, !writer() || p.archived)} ${button('Count', 'request-count', `data-id="${p.id}"`, !writer() || p.archived)} ${button('History', 'stock-history', `data-id="${p.id}"`)}</td></tr>`), 'No matching products. Add your first Retail product to get started.'));
  }
  function checkoutView() {
    const products = data.products.filter(p => !p.archived && (p.name + ' ' + p.barcode).toLowerCase().includes(search.toLowerCase()));
    const total = basket.reduce((sum, line) => sum + line.qty * line.unit_price_pence, 0);
    return `<div class="retail-checkout">${card(header('Checkout', 'Scan a barcode or tap a product') + `<input id="retailSearch" type="search" placeholder="Product name or barcode — press Enter to add" aria-label="Search or scan product" value="${esc(search)}"><div class="retail-product-grid">${products.slice(0, 60).map(p => `<button type="button" class="retail-product-button" data-action="basket-add" data-id="${p.id}" ${!writer() || checkoutBusy ? 'disabled' : ''}><strong>${esc(p.name)}</strong><span>${pounds(p.price_pence)}</span><small class="retail-muted">${p.stock_qty} in stock</small></button>`).join('')}</div>${products.length > 60 ? '<p class="retail-help">Showing the first 60 results. Search to find a specific product.</p>' : ''}`)}<section class="retail-card retail-basket">${header('Current sale', `${basket.reduce((n, x) => n + x.qty, 0)} units`)}${basket.length ? basket.map(line => `<div class="retail-basket-row"><div><strong>${esc(line.name)}</strong><small>${pounds(line.unit_price_pence)} each</small></div><strong>${pounds(line.unit_price_pence * line.qty)}</strong><div class="retail-quantity retail-full-width"><button type="button" data-action="basket-minus" data-id="${line.product_id}" aria-label="Remove one ${esc(line.name)}" ${checkoutBusy ? 'disabled' : ''}>−</button><label class="retail-basket-qty-label"><span class="retail-muted">Quantity</span><input type="number" min="1" max="1000000" step="1" data-basket-qty="${line.product_id}" value="${line.qty}" ${checkoutBusy ? 'disabled' : ''}></label><button type="button" data-action="basket-remove" data-id="${line.product_id}" ${checkoutBusy ? 'disabled' : ''}>Remove</button></div></div>`).join('') : empty('Your basket is empty.')}<div class="retail-checkout-total"><span>Total</span><span>${pounds(total)}</span></div><form id="retailCheckoutForm"><label>Cash received (£)<input name="tendered" inputmode="decimal" type="number" min="0" max="1000000" step="0.01" required ${checkoutBusy ? 'disabled' : ''}></label><div id="retailChange" class="retail-help" aria-live="polite"></div><button type="submit" class="retail-primary" ${!writer() || !basket.length || !data.till || checkoutBusy || pending() ? 'disabled' : ''}>${checkoutBusy ? 'Recording sale…' : 'Complete cash sale'}</button></form><p class="retail-help">${data.till ? 'Check the basket and cash before completing. Sales can take stock below zero; those products are flagged for counting.' : 'An owner or admin must open the till before checkout.'}</p><p class="retail-note">Card terminal payments are not connected yet. This checkout records cash payments only.</p></section></div>`;
  }
  function deliveryView() {
    return card(header('Deliveries', 'Expected orders, incoming deliveries and partial receipts', button('Create delivery / order', 'delivery-new', '', !admin(), true)) + data.deliveries.map(d => row(d.supplier || 'Delivery', `${d.reference || 'No reference'} · ${dateOnly(d.expected_on)} · ${d.items.map(i => i.name).join(', ')}`, badge(d.status) + button('View', 'delivery-view', `data-id="${d.id}"`))).join('') + (data.deliveries.length ? '<p class="retail-help">Showing the latest 200 deliveries. Receiving adds only the quantities you confirm to Retail stock.</p>' : empty('No deliveries yet. Create an order here or from the reorder report.')));
  }
  function countsView() {
    return card(header('Stock counts', 'Negative stock automatically creates a count. You can also request one from Products & stock.') + table(['Product', 'Current stock', 'Count', 'Action'], data.counts.map(c => `<tr><td><strong>${esc(c.name)}</strong><small>${esc(c.barcode)}</small></td><td>${c.stock_qty}</td><td>${c.status === 'pending' ? badge('Count needed', 'warning') : `${c.counted_qty} counted · difference ${c.difference > 0 ? '+' : ''}${c.difference}<small>${when(c.completed_at)}</small>`}</td><td>${c.status === 'pending' ? button('Enter physical count', 'count', `data-id="${c.id}"`, !writer()) : esc(c.reason)}</td></tr>`), 'No outstanding or previous stock counts.'));
  }
  function reorderTable(items, canOrder) {
    return table(['Product', 'On hand', 'On order', 'Order', 'Supplier'], items.map(p => `<tr><td><strong>${esc(p.name)}</strong><small>Min ${p.minimum_qty} · target ${p.target_qty}</small></td><td>${p.stock_qty}</td><td>${p.on_order}</td><td>${p.order_qty}${canOrder && p.order_qty > 0 ? '<br>' + button('Create order', 'reorder', `data-id="${p.id || p.product_id}"`, !admin()) : ''}</td><td>${esc(p.supplier || 'Not set')}${p.supplier_url ? `<br><a href="${esc(p.supplier_url)}" target="_blank" rel="noopener noreferrer">Open supplier</a>` : ''}</td></tr>`), 'No products are at or below their minimum stock.');
  }
  function reordersView() {
    return card(header('Live reorder report', `Daily snapshot at ${data.settings.report_time} · ${data.settings.timezone}`, button('Print current report', 'report-print')) + '<p class="retail-help">Order quantities bring stock up to its target after subtracting outstanding deliveries. Existing orders are included, so you can avoid ordering twice.</p>' + reorderTable(data.reorders, true) + '<div class="retail-action-row">' + button('Create combined order', 'reorder-all', '', !admin() || !data.reorders.some(p => p.order_qty > 0), true) + '</div>') + '<div style="height:20px"></div>' + card(header('Daily snapshots', 'Reports are generated while your backend is running. A missed day is not reconstructed.') + (data.reports.map((r, index) => row(dateOnly(r.report_date), `${r.data.items.filter(x => x.order_qty > 0).length} products to order · ${when(r.created_at)}`, button('View', 'report-view', `data-index="${index}"`))).join('') || empty('Your first snapshot will appear at the report time.')));
  }
  function tasksView() {
    return card(header('Tasks', 'Keep shop jobs and deadlines in one place', button('Add task', 'task-new', '', !writer(), true)) + data.tasks.map(t => row(t.title, t.due_at ? when(t.due_at) : 'No deadline', badge(t.status, t.status === 'pending' && t.due_at && Date.parse(t.due_at) < Date.now() ? 'warning' : '') + button(t.status === 'completed' ? 'Reopen' : 'Complete', 'task-complete', `data-id="${t.id}"`, !writer()))).join('') + (data.tasks.length ? '' : empty('No tasks yet.')));
  }
  function cashView() {
    return tillPanel() + '<div style="height:20px"></div>' + card(header('Cash movement & balance history', 'Latest 100 events. Balancing keeps every variance and establishes a new counted baseline.') + table(['Time', 'Type / reason', 'Cash change', 'Balance'], data.cash_history.map(e => `<tr><td>${when(e.created_at)}</td><td><strong>${esc(({ change_in: 'Change handout (in)', adjustment: 'Float adjustment', balance: 'Till balance', close: 'Till closed', lift: 'Cash lift', sale: 'Cash sale', refund: 'Cash refund' })[e.kind] || e.kind)}</strong><small>${esc(e.note)}</small></td><td>${pounds(e.amount_pence)}</td><td>${e.counted_pence == null ? '—' : `Expected ${pounds(e.expected_pence)}<br>Counted ${pounds(e.counted_pence)}<br>${badge(e.variance_pence < 0 ? pounds(-e.variance_pence) + ' short' : e.variance_pence > 0 ? pounds(e.variance_pence) + ' over' : 'Balanced', e.variance_pence === 0 ? '' : 'warning')}`}</td></tr>`), 'No cash movements yet.'));
  }
  function salesView() {
    return card(header('Sales & receipts', 'Latest 100 Retail sales. Refunds keep the original sale record.') + table(['Sale', 'Total', 'Status', 'Actions'], data.sales.map(s => `<tr><td><strong>${esc(s.reference)}</strong><small>${when(s.created_at)}</small><small>${esc(s.items.map(i => `${i.qty} × ${i.name}`).join(', '))}</small></td><td>${pounds(s.total_pence)}</td><td>${badge(s.status, s.status === 'refunded' ? 'warning' : '')}</td><td>${button('Receipt', 'receipt', `data-id="${s.id}"`)} ${s.status === 'completed' ? button('Refund', 'refund', `data-id="${s.id}"`, !admin()) : ''}</td></tr>`), 'No Retail sales yet.'));
  }
  function settingsView() {
    return card(header('Retail settings', 'Shared by this workspace') + `<form id="retailSettingsForm" class="retail-form"><label class="retail-check-label"><input type="checkbox" name="enabled" ${data.settings.enabled ? 'checked' : ''} ${!admin() ? 'disabled' : ''}> Enable Retail mode</label><div class="retail-form-grid"><label>Daily reorder report time<input type="time" name="report_time" value="${esc(data.settings.report_time)}" required ${!admin() ? 'disabled' : ''}></label><label>Timezone<input name="timezone" value="${esc(data.settings.timezone)}" required list="retailTimezones" ${!admin() ? 'disabled' : ''}><datalist id="retailTimezones"><option value="Europe/London"><option value="Europe/Dublin"><option value="America/New_York"><option value="UTC"></datalist></label></div><p class="retail-help">The closing report is saved once per local calendar day while the backend is running. Retail stock is recorded separately from your reseller and manufacturing stock. Turning Retail off keeps its saved records.</p><p class="retail-help">Cash checkout and browser receipt printing are available. Automatic card-reader payments, cash-drawer hardware and external POS sync require a separate integration.</p><button type="submit" class="retail-primary" ${!admin() ? 'disabled' : ''}>Save Retail settings</button><p class="retail-form-error" role="status"></p></form>`);
  }
  function render() {
    const names = { dashboard: 'Retail dashboard', products: 'Products & stock', checkout: 'Checkout', deliveries: 'Deliveries', reorders: 'Reorder report', counts: 'Stock counts', tasks: 'Tasks', cash: 'Till & cash', sales: 'Sales & receipts', settings: 'Retail settings' };
    if (!names[view]) view = 'dashboard';
    $('#retailTitle').textContent = names[view];
    $('#retailNav').innerHTML = '<div class="retail-nav-label">YOUR SHOP</div>' + nav.map(n => `<button type="button" class="retail-nav-button ${view === n[0] ? 'active' : ''}" data-view="${n[0]}" ${view === n[0] ? 'aria-current="page"' : ''}><span aria-hidden="true">${n[1]}</span><span>${n[2]}</span></button>`).join('');
    if (!data) return;
    $('#retailRole').textContent = `${data.role} · Retail`;
    $('#retailView').innerHTML = ({ dashboard, products: productView, checkout: checkoutView, deliveries: deliveryView, reorders: reordersView, counts: countsView, tasks: tasksView, cash: cashView, sales: salesView, settings: settingsView })[view]();
  }
  function switchView(next) {
    if (checkoutBusy) return;
    view = next; search = ''; history.replaceState(null, '', location.pathname + location.search + '#' + encodeURIComponent(view)); render();
    setMenu(false);
    $('#main').focus({ preventScroll: true });
  }
  function setMenu(open) {
    const mobile = matchMedia('(max-width:760px)').matches;
    const sidebar = $('#retailSidebar');
    sidebar.classList.toggle('open', mobile && open);
    sidebar.inert = mobile && !open;
    if (mobile) sidebar.setAttribute('aria-hidden', String(!open)); else sidebar.removeAttribute('aria-hidden');
    $('#retailMenu').setAttribute('aria-expanded', String(mobile && open));
  }
  async function refresh({ quiet = false } = {}) {
    if (!ready || checkoutBusy) return;
    const context = scopeKey(), g = ++generation;
    if (currentScope !== context) {
      if (basket.length) notice('Basket cleared because the workspace or inventory changed. No sale was recorded.');
      basket = []; data = null; search = ''; currentScope = context; $('#retailDialog').close();
      $('#retailView').innerHTML = empty('Loading this Retail inventory…');
    }
    try {
      const selection = selected();
      if (!selection.inventory || selection.inventory.includes(',')) throw new Error('Use the inventory selector above to choose exactly one inventory for Retail.');
      const status = await api('/status'); if (g !== generation) return;
      if (!status.active) {
        online = false; data = null; render();
        $('#retailView').innerHTML = card(header('Retail is switched off', 'Enable it for this workspace in Settings.') + '<a href="settings.html">Open account settings</a>');
        notice(status.allowed ? 'Retail is off for this workspace.' : 'Select an active InventoryOS plan before enabling Retail.'); return;
      }
      const r = await api('/overview'); if (g !== generation || scopeKey() !== context) return;
      if (r.workspace_id !== selected().workspace || r.inventory_id !== selected().inventory) throw new Error('Workspace selection changed. Refresh to load the correct inventory.');
      data = r; online = true;
      let basketChanged = false;
      basket = basket.filter(line => {
        const p = data.products.find(p => p.id === line.product_id && !p.archived);
        if (!p) { basketChanged = true; return false; }
        if (p.price_pence !== line.unit_price_pence || p.name !== line.name) { line.unit_price_pence = p.price_pence; line.name = p.name; basketChanged = true; }
        return true;
      });
      $('#retailConnection').textContent = 'Up to date'; $('#retailConnection').classList.add('connected');
      $('#retailUpdated').textContent = 'Updated ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      if (!quiet || !$('#retailDialog').open) render();
      notice(basketChanged ? 'Product details changed. The basket now uses the current prices and active products; please review it before taking payment.' : '');
    } catch (e) {
      if (g !== generation) return;
      online = false; $('#retailConnection').textContent = 'Needs refresh'; $('#retailConnection').classList.remove('connected');
      if (data) render(); else $('#retailView').innerHTML = empty('Retail could not be loaded. Install the backend update if you have not done so yet, then refresh.');
      notice(e.message, true);
    }
  }
  const input = (label, name, value = '', extra = '', helper = '') => `<label>${esc(label)}<input name="${name}" value="${esc(value)}" ${extra}>${helper ? `<small>${esc(helper)}</small>` : ''}</label>`;
  const qtyInput = (label, name, value, max = 1000000, min = 0) => input(label, name, value, `type="number" min="${min}" max="${max}" step="1" required inputmode="numeric"`);
  const moneyInput = (label, name, value = '') => input(label, name, value, 'type="number" min="0" max="1000000" step="0.01" required inputmode="decimal"');
  function dialog(title, content) {
    const d = $('#retailDialog'); d.close(); $('#retailDialogTitle').textContent = title; $('#retailDialogBody').innerHTML = content; d.showModal();
  }
  function formDialog(title, content, submitLabel, action) {
    const context = currentScope;
    dialog(title, `<form class="retail-form" id="retailModalForm">${content}<p class="retail-form-error" role="status"></p><div class="retail-form-actions"><button type="submit" class="retail-primary">${esc(submitLabel)}</button></div></form>`);
    const form = $('#retailModalForm');
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (context !== currentScope) return;
      const submit = form.querySelector('[type="submit"]'); if (submit.disabled) return;
      submit.disabled = true; form.querySelector('.retail-form-error').textContent = '';
      try {
        const result = await action(new FormData(form), form);
        if (!result || context !== currentScope) return;
        $('#retailDialog').close(); await refresh();
        if (result.variance_pence != null) notice(result.variance_pence === 0 ? 'Till balanced exactly.' : `${pounds(Math.abs(result.variance_pence))} ${result.variance_pence < 0 ? 'short' : 'over'} recorded. The counted cash is the new baseline.`);
      } catch (e) { form.querySelector('.retail-form-error').textContent = e.message + (pending() ? ' Close this dialog and use Retry pending action above to confirm the result safely.' : ''); }
      finally { submit.disabled = false; }
    });
  }
  function productForm(productId) {
    const p = data.products.find(p => p.id === productId);
    formDialog(p ? 'Edit product' : 'New Retail product', `<div class="retail-form-grid">${input('Product name', 'name', p?.name, 'required maxlength="160"')}${input('Barcode', 'barcode', p?.barcode, 'maxlength="100"', 'Leave blank to generate a Retail barcode.')}${moneyInput('Selling price per unit (£)', 'price', decimal(p?.price_pence))}${moneyInput('Cost per unit (£)', 'cost', decimal(p?.cost_pence))}${qtyInput('Minimum stock', 'minimum_qty', p?.minimum_qty ?? 0)}${qtyInput('Reorder up to', 'target_qty', p?.target_qty ?? 0)}${!p ? qtyInput('Opening stock', 'opening_qty', 0) : ''}${input('Supplier', 'supplier', p?.supplier, 'maxlength="160"')}${input('Supplier / product link', 'supplier_url', p?.supplier_url, 'type="url" maxlength="1000"')}</div>${p ? `<label class="retail-check-label"><input type="checkbox" name="archived" ${p.archived ? 'checked' : ''}> Archived (stock must be zero and deliveries cleared)</label>` : '<p class="retail-help">Enter actual opening Retail stock. This will not copy or deduct stock from the reseller area.</p>'}`, 'Save product', (f) => mutate('/products' + (p ? '/' + p.id : ''), { ...Object.fromEntries(f), ...(p ? { archived: f.has('archived'), edit_version: p.edit_version } : {}) }, p ? 'PATCH' : 'POST'));
  }
  function stockIn(productId) {
    const p = data.products.find(p => p.id === productId);
    formDialog('Stock in: ' + p.name, `<p>Current stock: ${p.stock_qty}. For an existing order, receive it from Deliveries so it is not added twice.</p>${qtyInput('Quantity received', 'qty', 1, 1000000, 1)}${input('Reason / reference', 'reason', '', 'required maxlength="300"')}`, 'Add to Retail stock', f => mutate('/stock-in', { product_id: p.id, qty: f.get('qty'), reason: f.get('reason') }));
  }
  function countForm(countId) {
    const c = data.counts.find(c => c.id === countId);
    formDialog('Count: ' + c.name, `<div class="retail-count-preview">Recorded quantity<strong>${c.stock_qty}</strong></div><p>Physically count the units now. A correction is saved with a stock history entry. If another sale changes the quantity before you save, you will be asked to count again.</p>${qtyInput('Actual physical quantity', 'qty', '')}${input('Count note', 'reason', '', 'required maxlength="300"')}`, 'Confirm stock count', f => mutate('/counts/' + c.id, { qty: f.get('qty'), stock_version: c.stock_version, reason: f.get('reason') }));
  }
  function tillOpen() { formDialog('Open till', '<p>Count all money in the drawer. This becomes the opening float for this inventory.</p>' + moneyInput('Counted opening float (£)', 'amount'), 'Open till', f => mutate('/till/open', { amount: f.get('amount') })); }
  function cashMove(kind) {
    const title = { lift: 'Cash lift', change_in: 'Change handout', adjustment: 'Adjust float' }[kind];
    formDialog(title, `<p>${kind === 'lift' ? 'Record money physically removed from this drawer.' : kind === 'change_in' ? 'Record change money physically added to this drawer.' : 'Record a cash-in or cash-out adjustment with its reason. Use Balance till to record a count difference.'}</p>` + (kind === 'adjustment' ? '<label>Direction<select name="direction"><option value="in">Cash into drawer</option><option value="out">Cash out of drawer</option></select></label>' : '') + moneyInput('Amount (£)', 'amount') + input('Reason', 'note', '', 'required maxlength="300"'), 'Record cash movement', f => mutate('/till/movement', { kind, ...Object.fromEntries(f) }));
  }
  function balanceForm() {
    formDialog('Balance the till', `<div class="retail-count-preview">Expected cash<strong>${pounds(data.till.expected_pence)}</strong></div><p>Count the full drawer, including the float. The difference is recorded and retained. A shortage does not prove why money is missing.</p>${moneyInput('Actual counted cash (£)', 'amount')}${input('Balance note', 'note', '', 'maxlength="300"')}<label class="retail-check-label"><input type="checkbox" name="close"> Close the till after balancing</label>`, 'Confirm counted cash', f => mutate('/till/balance', { amount: f.get('amount'), note: f.get('note'), close: f.has('close') }));
  }
  function deliveryForm(initial = []) {
    const products = data.products.filter(p => !p.archived);
    if (!products.length) { notice('Create a product before creating a delivery.'); return; }
    if (initial.length > 100) { notice('A combined delivery supports up to 100 products. Create smaller orders from the individual reorder buttons.'); return; }
    const defaults = initial.length ? initial : [{ id: products[0].id, qty: 1, cost_pence: products[0].cost_pence }];
    const line = x => `<div class="retail-delivery-line"><label>Product<select data-product>${products.map(p => `<option value="${p.id}" ${p.id === x.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label><div class="retail-form-grid"><label>Quantity ordered<input data-qty type="number" min="1" max="1000000" step="1" value="${x.qty}" required></label><label>Cost per unit (£)<input data-cost type="number" min="0" max="1000000" step="0.01" value="${decimal(x.cost_pence)}" required></label></div><button type="button" data-remove-line>Remove line</button></div>`;
    formDialog('Create delivery / order', `${input('Supplier', 'supplier', initial.length === 1 ? products.find(p => p.id === initial[0].id)?.supplier : '', 'maxlength="160"')}${input('Order reference', 'reference', '', 'maxlength="160"')}${input('Expected delivery date', 'expected_on', '', 'type="date"')}<div id="retailDeliveryLines" class="retail-form">${defaults.map(line).join('')}</div><button type="button" id="retailAddDeliveryLine">Add another product</button><p class="retail-help">This records an order you place with your supplier. It does not send the order or make a payment.</p>`, 'Save expected delivery', (f, form) => {
      const items = [...form.querySelectorAll('.retail-delivery-line')].map(el => ({ product_id: el.querySelector('[data-product]').value, qty: el.querySelector('[data-qty]').value, cost: el.querySelector('[data-cost]').value }));
      return mutate('/deliveries', { ...Object.fromEntries(f), items });
    });
    $('#retailAddDeliveryLine').onclick = () => { if ($$('#retailDeliveryLines .retail-delivery-line').length < 100) $('#retailDeliveryLines').insertAdjacentHTML('beforeend', line({ id: products[0].id, qty: 1, cost_pence: products[0].cost_pence })); };
    $('#retailDeliveryLines').addEventListener('click', e => { if (e.target.closest('[data-remove-line]')) e.target.closest('.retail-delivery-line').remove(); });
    $('#retailDeliveryLines').addEventListener('change', e => { if (e.target.matches('[data-product]')) e.target.closest('.retail-delivery-line').querySelector('[data-cost]').value = decimal(products.find(p => p.id === e.target.value).cost_pence); });
  }
  function $$(selector) { return [...document.querySelectorAll(selector)]; }
  function deliveryDetails(deliveryId) {
    const d = data.deliveries.find(d => d.id === deliveryId), active = !['received', 'cancelled'].includes(d.status);
    const content = `<p>${esc(d.supplier || 'No supplier')} · ${esc(d.reference || 'No reference')} · ${esc(dateOnly(d.expected_on))}</p>${badge(d.status)}<div class="retail-form">${d.items.map(i => `<div class="retail-delivery-line"><strong>${esc(i.name)}</strong><p>Ordered ${i.ordered_qty}; received ${i.received_qty}; outstanding ${i.ordered_qty - i.received_qty}. Cost ${pounds(i.unit_cost_pence)} each.</p>${active && writer() && i.ordered_qty > i.received_qty ? qtyInput('Received now', 'receive_' + i.id, 0, i.ordered_qty - i.received_qty) : ''}</div>`).join('')}</div>`;
    if (active && writer()) {
      formDialog('Delivery details', content + '<p>Enter only the units that have arrived now. Earlier receipts have already been added to stock.</p>', 'Confirm quantities received', f => mutate('/deliveries/' + d.id + '/receive', { items: d.items.filter(i => i.ordered_qty > i.received_qty).map(i => ({ id: i.id, qty: f.get('receive_' + i.id) || '0' })) }));
      const actions = document.createElement('div'); actions.className = 'retail-action-row';
      if (admin()) actions.innerHTML = (d.status === 'expected' ? button('Mark incoming', 'delivery-incoming', `data-id="${d.id}"`) : '') + button('Cancel remaining order', 'delivery-cancel', `data-id="${d.id}"`);
      $('#retailDialogBody').append(actions);
    } else dialog('Delivery details', content);
  }
  function taskForm() { formDialog('Add shop task', input('Task', 'title', '', 'required maxlength="240"') + input('Deadline (your device’s local time)', 'due_at', '', 'type="datetime-local"'), 'Add task', f => mutate('/tasks', { title: f.get('title'), due_at: f.get('due_at') ? new Date(f.get('due_at')).toISOString() : null })); }
  function receipt(sale) {
    dialog('Sale receipt', `<div class="retail-receipt"><h3>InventoryOS · Retail</h3><p>${esc(sale.reference)}<br>${esc(when(sale.created_at))}</p><table>${sale.items.map(i => `<tr><td>${esc(i.name)}<br>${i.qty} × ${pounds(i.unit_price_pence)}</td><td>${pounds(i.qty * i.unit_price_pence)}</td></tr>`).join('')}</table><hr><p><strong>Total ${pounds(sale.total_pence)}</strong><br>Cash ${pounds(sale.tendered_pence)}<br>Change ${pounds(sale.change_pence)}${sale.status === 'refunded' ? '<br>REFUNDED' : ''}</p><p>Thank you for shopping with us.</p></div><div class="retail-action-row">${button('Print / save receipt', 'print')}</div><p class="retail-help">Uses your browser’s print menu. A connected printer is required for paper receipts.</p>`);
  }
  function refundForm(saleId) {
    const s = data.sales.find(s => s.id === saleId);
    formDialog('Refund whole cash sale', `<p>${esc(s.reference)} · ${pounds(s.total_pence)}. Confirm you are returning this cash to the customer. The original sale stays in your history.</p><p>${esc(s.items.map(i => `${i.qty} × ${i.name}`).join(', '))}</p>${input('Refund reason', 'reason', '', 'required maxlength="300"')}<label class="retail-check-label"><input type="checkbox" name="restock"> All returned items are saleable and should go back into stock</label>`, 'Record full cash refund', f => mutate('/sales/' + s.id + '/refund', { reason: f.get('reason'), restock: f.has('restock') }));
  }
  async function handleAction(el) {
    if (!data && !['refresh', 'retry'].includes(el.dataset.action)) return;
    const { action, id: recordId, kind } = el.dataset;
    if (action === 'refresh') return refresh();
    if (action === 'retry') {
      el.disabled = true;
      try { const r = await mutate(null, null, null, true); if (r) { basket = []; $('#retailDialog').close(); await refresh(); notice('Pending action confirmed.'); if (r.sale) receipt(r.sale); } } finally { el.disabled = false; }
      return;
    }
    if (action === 'product-new') return productForm();
    if (action === 'product-edit') return productForm(recordId);
    if (action === 'stock-in') return stockIn(recordId);
    if (action === 'count') return countForm(recordId);
    if (action === 'till-open') return tillOpen();
    if (action === 'cash-move') return cashMove(kind);
    if (action === 'balance') return balanceForm();
    if (action === 'delivery-new') return deliveryForm();
    if (action === 'delivery-view') return deliveryDetails(recordId);
    if (action === 'reorder') { const p = data.reorders.find(p => p.id === recordId); return deliveryForm([{ id: p.id, qty: p.order_qty, cost_pence: p.cost_pence }]); }
    if (action === 'reorder-all') return deliveryForm(data.reorders.filter(p => p.order_qty > 0).map(p => ({ id: p.id, qty: p.order_qty, cost_pence: p.cost_pence })));
    if (action === 'task-new') return taskForm();
    if (action === 'receipt') return receipt(data.sales.find(s => s.id === recordId));
    if (action === 'refund') return refundForm(recordId);
    if (action === 'print') return window.print();
    if (action === 'report-view') { const r = data.reports[Number(el.dataset.index)]; return dialog('Reorder snapshot · ' + dateOnly(r.report_date), `<p>Saved ${when(r.created_at)}. These are historical quantities; use the live report to place new orders.</p>` + reorderTable(r.data.items, false) + button('Print snapshot', 'print')); }
    if (action === 'report-print') return dialog('Current reorder report', reorderTable(data.reorders, false) + `<p>Generated ${when(data.server_now)} · ${esc(data.settings.timezone)}</p>` + button('Print / save report', 'print'));
    if (action.startsWith('basket-')) {
      if (checkoutBusy) return;
      const p = data.products.find(p => p.id === recordId), item = basket.find(i => i.product_id === recordId);
      if (action === 'basket-add') {
        if (item) item.qty = Math.min(1000000, item.qty + 1);
        else if (basket.length < 100) basket.push({ product_id: p.id, name: p.name, qty: 1, unit_price_pence: p.price_pence });
      }
      if (action === 'basket-minus' && item) item.qty--;
      if (action === 'basket-remove' && item) item.qty = 0;
      basket = basket.filter(i => i.qty > 0); render(); return;
    }
    if (action === 'stock-history') {
      el.disabled = true; try { const r = await api('/products/' + recordId + '/history'); dialog('Stock history', table(['Time', 'Reason', 'Change', 'Result'], r.events.map(x => `<tr><td>${when(x.created_at)}</td><td>${esc(x.kind)}<small>${esc(x.reason)}</small></td><td>${x.delta > 0 ? '+' : ''}${x.delta}</td><td>${x.resulting_qty}</td></tr>`), 'No stock events.')); } finally { el.disabled = false; } return;
    }
    if (action === 'delivery-cancel') {
      const d = data.deliveries.find(d => d.id === recordId);
      return formDialog('Cancel remaining delivery', `<p>Cancel the outstanding units from ${esc(d.supplier || 'this supplier')}? Previously received stock stays recorded.</p>`, 'Cancel remaining order', () => mutate('/deliveries/' + d.id, { status: 'cancelled' }, 'PATCH'));
    }
    el.disabled = true;
    try {
      if (action === 'request-count') await mutate('/counts', { product_id: recordId });
      if (action === 'task-complete') await mutate('/tasks/' + recordId, { status: data.tasks.find(t => t.id === recordId).status === 'completed' ? 'pending' : 'completed' }, 'PATCH');
      if (action === 'delivery-incoming') { await mutate('/deliveries/' + recordId, { status: 'incoming' }, 'PATCH'); $('#retailDialog').close(); }
      await refresh();
      if (action === 'request-count') { switchView('counts'); notice('Count requested. Enter the physical quantity when ready.'); }
    } finally { el.disabled = false; }
  }
  document.addEventListener('click', event => {
    const next = event.target.closest('[data-view]'); if (next) { event.preventDefault(); switchView(next.dataset.view); return; }
    const action = event.target.closest('[data-action]'); if (action && !action.disabled) { event.preventDefault(); Promise.resolve(handleAction(action)).catch(e => notice(e.message, true)); }
  });
  document.addEventListener('input', event => {
    if (event.target.id === 'retailSearch') {
      const caret = event.target.selectionStart; search = event.target.value; render(); const field = $('#retailSearch'); field?.focus(); if (field?.type === 'search') field.setSelectionRange(caret, caret);
    }
    if (event.target.name === 'tendered' && $('#retailChange')) {
      const raw = event.target.value, total = basket.reduce((n, i) => n + i.qty * i.unit_price_pence, 0);
      const amount = /^\d+(\.\d{0,2})?$/.test(raw) ? Math.round(Number(raw) * 100) : NaN;
      $('#retailChange').textContent = Number.isFinite(amount) ? (amount >= total ? 'Change to give: ' + pounds(amount - total) : 'Still to receive: ' + pounds(total - amount)) : '';
    }
  });
  document.addEventListener('change', event => {
    const input = event.target.closest('[data-basket-qty]'); if (!input || checkoutBusy) return;
    const item = basket.find(i => i.product_id === input.dataset.basketQty), value = Number(input.value);
    if (item && Number.isInteger(value) && value >= 1 && value <= 1000000) item.qty = value;
    render();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Enter' && event.target.id === 'retailSearch' && view === 'checkout') {
      event.preventDefault(); const p = data.products.find(p => !p.archived && p.barcode.toLowerCase() === search.trim().toLowerCase());
      if (!writer()) return;
      if (p) { search = ''; handleAction({ dataset: { action: 'basket-add', id: p.id } }); $('#retailSearch')?.focus(); } else notice('No exact barcode match. Choose a result or add the product first.');
    }
  });
  document.addEventListener('submit', async event => {
    if (!['retailCheckoutForm', 'retailSettingsForm'].includes(event.target.id)) return;
    event.preventDefault(); const form = event.target;
    if (form.id === 'retailCheckoutForm') {
      if (checkoutBusy || !basket.length || pending()) return;
      const tendered = new FormData(form).get('tendered'); checkoutBusy = true; render();
      try {
        const result = await mutate('/checkout', { items: basket.map(({ product_id, qty, unit_price_pence }) => ({ product_id, qty, unit_price_pence })), payment_method: 'cash', tendered });
        if (result) { basket = []; checkoutBusy = false; await refresh(); receipt(result.sale); }
      } catch (e) { notice(e.message, true); }
      finally { checkoutBusy = false; render(); }
    } else {
      const submit = form.querySelector('[type="submit"]'); if (submit.disabled) return; submit.disabled = true;
      const f = new FormData(form);
      try { await mutate('/settings', { enabled: f.has('enabled'), report_time: f.get('report_time'), timezone: f.get('timezone') }, 'PATCH'); await refresh(); InventoryRetail.refresh(); }
      catch (e) { form.querySelector('.retail-form-error').textContent = e.message; }
      finally { submit.disabled = false; }
    }
  });
  async function boot() {
    if (!InventoryAPI.requireLogin()) return;
    const user = InventoryAPI.getUser();
    $('#retailPersonName').textContent = user?.name || 'Your account';
    $('#retailAvatar').textContent = (user?.name || 'Inventory OS').split(/\s+/).map(x => x[0]).slice(0, 2).join('').toUpperCase();
    $('#retailLogout').onclick = () => InventoryAPI.logout();
    $('#retailMenu').onclick = () => setMenu(!$('#retailSidebar').classList.contains('open'));
    setMenu(false);
    $('#retailDialogClose').onclick = () => $('#retailDialog').close();
    render(); await InventoryTopbar.init(); ready = true; await refresh();
  }
  window.addEventListener('inventory-selection-changed', () => { if (ready) refresh(); });
  window.addEventListener('hashchange', () => switchView(location.hash.slice(1)));
  window.addEventListener('resize', () => setMenu(false));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && ready && !$('#retailDialog').open && view !== 'checkout') refresh({ quiet: true }); });
  setInterval(() => { if (ready && !document.hidden && !$('#retailDialog').open && view !== 'checkout') refresh({ quiet: true }); }, 60000);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})();
