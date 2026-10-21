(function () {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pounds = pence => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(Number(pence || 0) / 100);
  const decimal = pence => (Number(pence || 0) / 100).toFixed(2);
  const when = value => value ? new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : 'No date set';
  const dateOnly = value => value ? new Date(value + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'Date not set';
  const vatLabel = (treatment, rate) => ({ taxable: `VAT ${rate}%`, zero_rated: 'Zero-rated 0%', exempt: 'VAT exempt', outside_scope: 'Outside VAT scope' })[treatment] || 'VAT not set';
  const localDay = (value, zone) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value)).map(x => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}`;
  };
  const nav = [['dashboard', '▦', 'Dashboard'], ['checkout', '▤', 'Checkout'], ['products', '□', 'Products & stock'], ['deliveries', '↓', 'Deliveries'], ['reorders', '↻', 'Reorder report'], ['counts', '✓', 'Stock counts'], ['tasks', '◷', 'Tasks'], ['cash', '£', 'Till & cash'], ['sales', '↗', 'Sales & receipts'], ['settings', '⚙', 'Retail settings'], ['offline', '⇅', 'Offline & sync']];
  let data = null, online = false, ready = false, generation = 0, currentScope = '', basket = [], search = '', checkoutBusy = false;
  let registeredTillSupported=false,platformAdminScope='';
  const platformView=()=>['tills','retail-billing'].includes(view)||(view==='staff-access'&&(registeredTillSupported||data?.platform_supported));
  const platformContent=()=>'<div class="retail-platform-inline"><p id="platformNotice" role="status"></p><div id="platformMain">Loading administration…</div></div>';
  const registeredTillKey=()=> 'inventoryos_retail_selected_till:'+scopeKey();
  const registeredTill=()=>localStorage.getItem(registeredTillKey())||'';
  let tillMode = location.hash.slice(1) === 'till';
  let view = tillMode ? 'checkout' : location.hash.slice(1) || 'dashboard';
  let lastNavKey = '', productBarcodeScan = null, retailClockOffset = 0, checkoutQuote = null, offlineState = { operations: [] }, shellReady = false;
  const offline = window.InventoryRetailOffline;
  const checkoutWriter = () => counterUI.canSell() && (!businessUI.needsOnline() || online) && (writer() || (shellReady && offline.canSell(offlineState) && scopeKey() === currentScope));
  function syncStatus() {
    if(platformView()){$('#retailSyncStatus').hidden=true;return;}
    const count = offlineState.operations.filter(x => x.status !== 'applied').length;
    const blocked = offlineState.operations.some(x => x.status === 'blocked');
    const text = blocked ? 'Sync needs attention' : count ? count + ' sale' + (count === 1 ? '' : 's') + ' awaiting sync' : online ? (shellReady && offline.canSell(offlineState) ? 'Online · offline till ready' : 'Up to date') : 'Offline · saved data';
    $('#retailConnection').textContent = text;
    $('#retailConnection').classList.toggle('connected', online && !count);
    const bar = $('#retailSyncStatus');
    bar.hidden = !offlineState.operations.length && online;
    bar.innerHTML = esc(text) + (offlineState.operations.length ? ' · <button type="button" data-view="offline">View saved sales</button>' : (!online ? ' · Cash checkout uses saved prices. Other changes and barcode name lookup need a connection.' : ''));
    if ($('#retailTillStatus')) $('#retailTillStatus').textContent = text;
  }
  function scanCheckout(code) {
    if (/^IO-LC-/i.test(code)) { businessUI.cardFromScan(code).catch(e => notice(e.message, true)); return; }
    if (!checkoutWriter() || checkoutBusy) return;
    const p = data.products.find(p => !p.archived && p.barcode.toLowerCase() === code.toLowerCase());
    search = '';
    if (p) handleAction({ dataset: { action: 'basket-add', id: p.id } }).catch(e=>notice(e.message,true));
    else { render(); notice('Barcode ' + code + ' is not saved in this inventory. Add the product in Products & stock first.', true); }
    $('#retailSearch')?.focus();
  }
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
    const response = await fetch(InventoryAPI.API_BASE + '/retail' + path, { ...options, cache: 'no-store', signal: AbortSignal.timeout(path.startsWith('/operations/import') ? 90000 : 12000), headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + InventoryAPI.getToken(), 'X-Workspace-Id': selected().workspace, 'X-Inventory-Ids': selected().inventory, ...counterUI.headers(), ...(registeredTillSupported&&registeredTill()?{'X-Retail-Till-Id':registeredTill()}:{}), ...(options.headers || {}) } });
    const result = await response.json().catch(() => ({ success: false, error: 'Invalid server response' }));
    if (!response.ok || !result.success) throw Object.assign(new Error(response.status === 401 ? 'Sign in again to reconnect Retail. Saved sales stay on this device.' : result.error || 'Could not load Retail'), { result, status: response.status });
    if(path==='/status'){counterUI.enableHeaders(result.counter_supported);registeredTillSupported=Boolean(result.platform_supported);}
    return result;
  }
  async function mutate(path, body, method = 'POST', retry = false) {
    if (scopeKey() !== currentScope) throw new Error('Workspace changed. Refresh before continuing.');
    if (offlineState.operations.length) throw new Error('Sync the saved cash sales before making other changes. Open Offline & sync for details.');
    if (!online) throw new Error('Reconnect before making this change. Cash checkout remains available when this device is prepared.');
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
  const header = (title, subtitle = '', action = '') => `<div class="retail-card-head"><div><h2>${esc(title)}</h2></div>${action}</div>`;
  const card = content => `<section class="retail-card">${content}</section>`;
  const row = (title, subtitle, right = '') => `<div class="retail-list-row"><div class="retail-list-copy"><strong>${esc(title)}</strong><small>${esc(subtitle)}</small></div><div class="retail-list-right">${right}</div></div>`;
  const table = (headings, rows, noRows) => `<div class="retail-table-wrap"><table class="retail-table"><thead><tr>${headings.map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.join('') : `<tr><td colspan="${headings.length}">${esc(noRows)}</td></tr>`}</tbody></table></div>`;
  function tillPanel() {
    if(data.platform_supported&&!registeredTill()&&!data.till)return card(header('Till & cash')+'<a href="retail/manage.html">Open, balance or manage registered tills</a>');
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
    const metrics = [['Today’s net sales', pounds(todayNet), 'Cash sales less refunds', '£'], ['Stock on hand', data.products.filter(p => !p.archived && p.item_kind !== 'service').reduce((n, p) => n + p.stock_qty, 0), 'Retail units, including negatives', '□'], ['Needs reordering', data.reorders.filter(x => x.order_qty > 0).length, 'Products after incoming stock', '↻'], ['Stock counts due', pendingCounts.length, 'Check and correct actual stock', '✓']];
    const deliveryRows = list => list.slice(0, 4).map(d => row(d.supplier || 'Delivery', `${d.reference || 'No reference'} · ${dateOnly(d.expected_on)} · ${d.items.reduce((n, i) => n + i.ordered_qty - i.received_qty, 0)} units outstanding`, button('View', 'delivery-view', `data-id="${d.id}"`))).join('');
    return `<div class="retail-metrics">${metrics.map(m => `<section class="retail-metric"><div class="retail-metric-label">${m[0]}<span aria-hidden="true">${m[3]}</span></div><div class="retail-metric-value">${esc(m[1])}</div><div class="retail-muted">${m[2]}</div></section>`).join('')}</div><div class="retail-grid">${card(header('Expected deliveries', `${expected.length} orders awaiting dispatch`, go('All deliveries', 'deliveries')) + (deliveryRows(expected) || empty('No expected deliveries.')))}${tillPanel()}${card(header('Incoming deliveries', 'On their way or partly received') + (deliveryRows(incoming) || empty('No incoming deliveries.')))}${card(header('Tasks to complete', `${due.length} due now or without a date`, button('Add task', 'task-new', '', !writer())) + (due.slice(0, 4).map(t => row(t.title, t.due_at ? when(t.due_at) : 'Ready when you are', button('Complete', 'task-complete', `data-id="${t.id}"`, !writer()))).join('') || empty('You’re up to date.')))}${card(header('Upcoming tasks', 'What’s next', go('View tasks', 'tasks')) + (upcoming.slice(0, 4).map(t => row(t.title, when(t.due_at), badge('Upcoming'))).join('') || empty('No upcoming tasks.')))}${card(header('Stock that needs attention', 'Negative stock stays sellable and is flagged for counting', go('Stock counts', 'counts')) + (pendingCounts.slice(0, 4).map(c => row(c.name, `Recorded stock: ${c.stock_qty}`, button('Count', 'count', `data-id="${c.id}"`, !writer()))).join('') || empty('No outstanding stock counts.')))}</div>${salesChart()}`;
  }
  function salesChart() {
    const zone = data.settings.timezone, days = [];
    for (let i = 6; i >= 0; i--) { const d = new Date(data.server_now); d.setUTCDate(d.getUTCDate() - i); const day = localDay(d, zone); days.push({ day, net: data.daily_sales.find(x => x.day === day)?.net_pence || 0 }); }
    const max = Math.max(1, ...days.map(d => Math.abs(d.net)));
    return `<section class="retail-card retail-sales">${header('Sales performance', `Last 7 days · ${zone} · net of refunds`, go('Sales & receipts', 'sales'))}<div class="retail-bars" role="img" aria-label="${esc(days.map(d => `${dateOnly(d.day)}: ${pounds(d.net)}`).join('; '))}">${days.map(d => `<div class="retail-bar-day" title="${esc(dateOnly(d.day) + ': ' + pounds(d.net))}"><span>${pounds(d.net)}</span><span class="retail-bar" style="height:${Math.max(2, Math.abs(d.net) / max * 85)}px;${d.net < 0 ? 'background:var(--danger)' : ''}"></span><span>${dateOnly(d.day)}</span></div>`).join('')}</div><div class="retail-sales-summary"><div><span class="retail-muted">7-day net sales</span><strong>${pounds(days.reduce((n, d) => n + d.net, 0))}</strong></div><div><span class="retail-muted">Payment method</span><strong>Cash</strong></div></div></section>`;
  }
  function productView(services = false) {
    const filter = search.toLowerCase(), products = data.products.filter(p => (p.item_kind === 'service') === services && (p.name + ' ' + p.barcode).toLowerCase().includes(filter));
    return card(header(services ? 'Services' : 'Products & stock', '', '<div class="retail-action-row" style="margin:0">' + (services ? '' : button('Scan to add product', 'product-scan', '', !admin() || !data.catalogue_supported)) + button(services ? 'Add service' : 'Add product', services ? 'service-new' : 'product-new', '', !admin(), true) + '</div>') + `<div class="retail-toolbar"><input id="retailSearch" type="search" aria-label="Search products or barcodes" placeholder="Search products or scan a barcode" value="${esc(search)}"></div>` + table(['Product', 'Price', 'Stock', 'Minimum / target', 'Actions'], products.map(p => `<tr><td><strong>${esc(p.name)} ${p.archived ? badge('Archived') : ''}</strong><small>${esc(p.barcode)}</small>${data.vat_supported ? `<small>${esc(vatLabel(p.vat_treatment, p.vat_rate))}</small>` : ''}</td><td>${pounds(p.price_pence)}<small>Cost ${pounds(p.cost_pence)}</small></td><td class="${p.stock_qty < 0 ? 'retail-negative' : ''}">${p.item_kind === 'service' ? 'Service · ' + p.duration_minutes + ' min' : p.stock_qty + (p.reserved_qty ? '<small>' + p.reserved_qty + ' reserved</small>' : '')}</td><td>${p.minimum_qty} / ${p.target_qty}</td><td>${button('Edit', 'product-edit', `data-id="${p.id}"`, !admin())} ${button('Stock in', 'stock-in', `data-id="${p.id}"`, !writer() || p.archived || p.item_kind === 'service')} ${button('Count', 'request-count', `data-id="${p.id}"`, !writer() || p.archived || p.item_kind === 'service')} ${button('History', 'stock-history', `data-id="${p.id}"`)}</td></tr>`), 'No matching products. Add your first Retail product to get started.') + '<p class="retail-catalogue-credit">Barcode identification searches Open Food Facts, Open Beauty Facts, Open Products Facts and Open Pet Food Facts (<a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noopener noreferrer">ODbL</a>). Confirm the product and pack size before saving. Your shop sets its own price and VAT treatment.</p>');
  }
  function checkoutView() {
    if(data.platform_supported&&!registeredTill())return card(header('Registered till checkout')+'<p>Cashiers use the dedicated Till app. Owners/admins can select an open registered till here to complete bookings, collections and exchanges.</p><label>Registered till<select id="retailRegisteredTill"><option value="">Choose an open till</option>'+(data.registered_tills||[]).map(t=>'<option value="'+t.id+'">'+esc(t.name)+'</option>').join('')+'</select></label><div class="retail-action-row"><a href="retail/till/index.html">Open Till app</a><a href="retail/manage.html">Manage stores & tills</a></div>');
    const products = counterUI.filter(data.products.filter(p => !p.archived && (p.item_kind !== 'service' || data.business?.config.features.services) && (p.name + ' ' + p.barcode).toLowerCase().includes(search.toLowerCase())));
    const priced = checkoutBusy && checkoutQuote ? checkoutQuote : businessUI.pricing(basket); checkoutQuote = priced;
    const total = priced.total_pence + Math.round(Number(businessUI.extras().tip || 0) * 100), deposit = businessUI.depositTotal();
    return `${data.platform_supported?'<label>Registered till<select id="retailRegisteredTill"><option value="">Choose another till</option>'+(data.registered_tills||[]).map(t=>'<option value="'+t.id+'" '+(t.id===registeredTill()?'selected':'')+'>'+esc(t.name)+'</option>').join('')+'</select></label>':''}${counterUI.toolbar()}${tillMode ? '<div class="retail-till-toolbar"><strong>Till mode</strong><span id="retailTillStatus"></span><button type="button" data-view="dashboard">Exit to dashboard</button></div>' : '<div class="retail-action-row">' + button('Full-screen till', 'till-screen') + '</div>'}<div class="retail-checkout">${card(header('Checkout', 'Scan a barcode with your USB scanner or tap a product') + `<input id="retailSearch" type="search" placeholder="Product name or barcode — press Enter to add" aria-label="Search or scan product" value="${esc(search)}">${counterUI.tabs(data.products.filter(p=>!p.archived))}<div class="retail-product-grid">${products.slice(0, 60).map(p => `<button type="button" class="retail-product-button" data-action="basket-add" data-id="${p.id}" ${!checkoutWriter() || checkoutBusy || businessUI.extras().preorder_id || (businessUI.extras().booking_id && basket.some(i=>i.product_id===p.id) && businessUI.lockedLine(p.id)) ? 'disabled' : ''}><strong>${esc(p.name)}</strong><span>${pounds(p.price_pence)}</span><small class="retail-muted">${p.item_kind === 'service' ? p.duration_minutes + ' minute service' : p.stock_qty + ' in stock'}</small></button>`).join('')}</div>${products.length > 60 ? '<p class="retail-help">Showing the first 60 results. Search to find a specific product.</p>' : ''}`)}<section class="retail-card retail-basket">${header('Current sale', `${basket.reduce((n, x) => n + x.qty, 0)} units`)}${basket.length ? basket.map(line => `<div class="retail-basket-row"><div><strong>${esc(line.name)}</strong><small>${pounds(line.unit_price_pence)} each</small>${priced.lines.find(x => x.product_id === line.product_id)?.line_discount_pence ? '<small class="business-saving">Saving ' + pounds(priced.lines.find(x => x.product_id === line.product_id).line_discount_pence) + '</small>' : ''}</div><strong>${pounds(priced.lines.find(x => x.product_id === line.product_id)?.line_total_pence ?? line.unit_price_pence * line.qty)}</strong><div class="retail-quantity retail-full-width"><button type="button" data-action="basket-minus" data-id="${line.product_id}" aria-label="Remove one ${esc(line.name)}" ${checkoutBusy || businessUI.lockedLine(line.product_id) ? 'disabled' : ''}>−</button><label class="retail-basket-qty-label"><span class="retail-muted">Quantity</span><input type="number" min="1" max="1000000" step="1" data-basket-qty="${line.product_id}" value="${line.qty}" ${checkoutBusy || businessUI.lockedLine(line.product_id) ? 'disabled' : ''}></label><button type="button" data-action="basket-remove" data-id="${line.product_id}" ${checkoutBusy || businessUI.lockedLine(line.product_id) ? 'disabled' : ''}>Remove</button></div></div>`).join('') : empty('Your basket is empty.')}${businessUI.checkoutControls()}<div class="retail-checkout-total"><span>Total</span><span>${pounds(total)}</span></div>${deposit ? '<p>Deposit applied: ' + pounds(deposit) + '<br><strong>Cash due: ' + pounds(total - deposit) + '</strong></p>' : ''}<form id="retailCheckoutForm"><label>Cash received (£)<input name="tendered" inputmode="decimal" type="number" min="0" max="1000000" step="0.01" required ${checkoutBusy ? 'disabled' : ''}></label><div id="retailChange" class="retail-help" aria-live="polite"></div><button type="submit" class="retail-primary" ${!checkoutWriter() || !basket.length || !data.till || checkoutBusy || pending() ? 'disabled' : ''}>${checkoutBusy ? 'Recording sale…' : 'Complete cash sale'}</button></form><p class="retail-help">${data.till ? 'Check the basket and cash before completing. Sales can take stock below zero; those products are flagged for counting.' : 'An owner or admin must open the till before checkout.'}</p><p class="counter-hint">Cash checkout</p></section></div>`;
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
    return card(header('Sales & receipts', 'Latest 100 Retail sales. Refunds keep the original sale record.') + table(['Sale', 'Total', 'Status', 'Actions'], data.sales.map(s => `<tr><td><strong>${esc(s.reference)}</strong><small>${when(s.created_at)}</small><small>${esc(s.items.map(i => `${i.qty} × ${i.name}${i.returned_qty ? ' ('+i.returned_qty+' returned)' : ''}`).join(', '))}</small><small>${esc(s.cashier_snapshot?.name || s.staff_snapshot?.name || '')}</small></td><td>${pounds(s.total_pence)}</td><td>${badge(s.status, s.status === 'refunded' ? 'warning' : '')}</td><td>${button('Receipt', 'receipt', `data-id="${s.id}"`)} ${s.status === 'completed' ? button('Return / exchange', 'refund', `data-id="${s.id}"`, !admin()) : ''}</td></tr>`), 'No Retail sales yet.'));
  }
  function settingsView() {
    const s = data.settings, canEdit = admin() && data.vat_supported;
    if(data.platform_supported)return card(header('Store settings & billing')+'<div class="retail-action-row"><a href="retail/manage.html">Stores, receipt details, tills & Retail billing</a><a href="retail/till/index.html">Open Till app</a></div>');
    return card(header('Retail settings', 'Shared by this workspace') + `<form id="retailSettingsForm" class="retail-form"><label class="retail-check-label"><input type="checkbox" name="enabled" ${s.enabled ? 'checked' : ''} ${!admin() ? 'disabled' : ''}> Enable Retail mode</label><div class="retail-form-grid"><label>Daily reorder report time<input type="time" name="report_time" value="${esc(s.report_time)}" required ${!admin() ? 'disabled' : ''}></label><label>Timezone<input name="timezone" value="${esc(s.timezone)}" required list="retailTimezones" ${!admin() ? 'disabled' : ''}><datalist id="retailTimezones"><option value="Europe/London"><option value="Europe/Dublin"><option value="America/New_York"><option value="UTC"></datalist></label></div><fieldset class="retail-receipt-settings"><legend>Receipt details</legend><label>Business name on receipts<input name="receipt_business_name" value="${esc(s.receipt_business_name)}" maxlength="160" ${!canEdit ? 'disabled' : ''}><small>Printed at the top of new receipts, with or without VAT. For VAT receipts, enter the registered business name.</small></label><label>Business address<textarea name="receipt_business_address" maxlength="500" ${!canEdit ? 'disabled' : ''}>${esc(s.receipt_business_address)}</textarea></label><label class="retail-check-label"><input type="checkbox" name="vat_receipts" id="retailVatReceipts" ${s.vat_receipts ? 'checked' : ''} ${!canEdit ? 'disabled' : ''}> VAT receipt — show VAT breakdown</label><label>VAT registration number<input name="vat_number" value="${esc(s.vat_number)}" maxlength="20" placeholder="GB123456789" ${!canEdit ? 'disabled' : ''}></label><p class="retail-help">Enable VAT only for a VAT-registered business. Selling prices include VAT already; this separates it out without increasing the total. Set each product’s correct VAT treatment before using this option. Your business details and tax breakdown are saved with each sale; older receipts are not changed.</p><p class="retail-help">Adds a UK domestic sales receipt with a VAT breakdown. Full VAT invoices and credit notes are not generated here; provide a full invoice separately when required.</p>${!data.vat_supported ? '<p class="retail-note">Install the latest Retail VAT backend update to edit receipt details and enable VAT.</p>' : ''}</fieldset><p class="retail-help">The closing report is saved once per local calendar day while the backend is running. Retail stock is recorded separately from your reseller and manufacturing stock. Turning Retail off keeps its saved records.</p><p class="retail-help">Cash checkout and browser receipt printing are available. Automatic card-reader payments, cash-drawer hardware and external POS sync require a separate integration.</p><button type="submit" class="retail-primary" ${!admin() ? 'disabled' : ''}>Save Retail settings</button><p class="retail-form-error" role="status"></p></form>`);
  }
  function offlineView() {
    const prepared = offlineState.snapshot?.offline;
    return card(header('Offline cash till', shellReady ? 'Retail screens are saved on this device.' : 'Retail screens are not confirmed ready for offline reopening.', button('Prepare / refresh device', 'offline-prepare')) +
      `<p>Open the till while connected, then prepare this browser. Cash sales use saved products, prices and VAT details for up to 24 hours. Keep this browser and device until every sale has synced. Login, new product lookups, product edits, deliveries, counts, refunds and till opening/balancing require a connection.</p><p>${prepared ? 'Saved checkout authorisation expires ' + esc(when(prepared.expires_at)) + '.' : 'Connect and open a till to prepare cash checkout.'}</p><p class="retail-help">Do not clear browser data or use private browsing for offline trading. Browser storage can be removed by the device; download a backup of unsynced sales before changing devices. Other tills may change stock while this one is offline; syncing applies sale quantities to current stock rather than replacing it.</p><div class="retail-action-row">${button('Sync now', 'offline-sync')}${button('Download saved sales backup', 'offline-backup', '', !offlineState.operations.length)}</div>` +
      table(['Sale', 'Amount', 'Sync status'], offlineState.operations.map(o => `<tr><td>${esc(o.sale.reference)}<small>${when(o.sale.created_at)}</small>${button('Receipt', 'offline-receipt', 'data-id="' + o.id + '"')}</td><td>${pounds(o.sale.total_pence)}</td><td>${esc(o.status === 'applied' ? 'Confirmed; refreshing stock' : o.status)}${o.error ? '<small>' + esc(o.error) + '</small>' : ''}</td></tr>`), 'No cash sales awaiting sync.'));
  }
  function render() {
    $('#retailNotice').hidden=platformView();
    const tenderedBefore = $('#retailCheckoutForm input[name=tendered]')?.value;
    document.body.classList.toggle('retail-till-mode', tillMode);
    if (!tillMode && document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    const names = { ...Object.fromEntries(businessUI.nav().map(n => [n[0],n[2]])), dashboard: 'Retail dashboard', products: 'Products & stock', checkout: 'Checkout', deliveries: 'Deliveries', reorders: 'Reorder report', counts: 'Stock counts', tasks: 'Tasks', cash: 'Till & cash', sales: 'Sales & receipts', settings: 'Retail settings', offline: 'Offline & sync', services:'Services', 'staff-access':'Staff access', tills:'Tills', 'retail-billing':'Stores & billing', transfer:'Import & export', 'shelf-labels':'Shelf labels' };
    if (!names[view]) view = 'dashboard';
    $('#retailTitle').textContent = names[view];
    const navKey=JSON.stringify([view,online,data?.role,data?.business?.config.features,data?.counts?.filter(c=>c.status==='pending').length,platformAdminScope]);
    if(navKey!==lastNavKey){$('#retailNav').innerHTML=counterUI.nav([...nav,...businessUI.nav()],view);lastNavKey=navKey;}
    if(platformView()){
      $('#retailView').innerHTML=platformContent();const context=scopeKey();
      window.InventoryRetailPlatform.mount(view==='staff-access'?'staff':view==='retail-billing'?'billing':'tills',{
       inventory:selected().inventory,
       authorized:()=>{if(context!==scopeKey())return;platformAdminScope=context;$('#retailConnection').textContent='Connected';$('#retailConnection').classList.add('connected');$('#retailNav').innerHTML=counterUI.nav([...nav,...businessUI.nav()],view);},
       storeChanged:async()=>{lastNavKey='';await InventoryTopbar.init();refresh();}
      });$('#retailSyncStatus').hidden=true;return;
    }
    if (!data) return;
    $('#retailRole').textContent = `${data.role} · Retail`;
    $('#retailView').innerHTML = ({ dashboard, products: () => productView(false), services: () => productView(true), checkout: checkoutView, deliveries: deliveryView, reorders: reordersView, counts: countsView, tasks: tasksView, cash: cashView, sales: salesView, settings: () => counterUI.appearance() + settingsView() + (data.business_supported ? businessUI.settings() : ''), offline: offlineView, ...businessUI.views, ...counterUI.views })[view]();
    if (view === 'checkout' && basket.length && tenderedBefore != null) { const cash = $('#retailCheckoutForm input[name=tendered]'); if(cash){cash.value = tenderedBefore; cash.dispatchEvent(new Event('input', { bubbles: true }));} }
    syncStatus(); businessUI.broadcast(); if(counterUI.staff()){const field=document.querySelector('[name="checkout_staff"]');if(field){field.value=counterUI.staff().id;field.disabled=true;}}
  }
  function switchView(next) {
    if (checkoutBusy) return;
    window.InventoryRetailScanner?.stop();
    tillMode = next === 'till'; view = tillMode ? 'checkout' : next; search = ''; history.replaceState(null, '', location.pathname + location.search + '#' + encodeURIComponent(tillMode ? 'till' : view)); render();
    setMenu(false);
    if (view === 'checkout') $('#retailSearch')?.focus(); else $('#main').focus({ preventScroll: true });
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
    if (quiet && view === 'settings' && ($('#retailSettingsForm')?.dataset.dirty === 'true' || $('#retailBusinessSettings')?.dataset.dirty === 'true')) return;
    const context = scopeKey(), g = ++generation;
    if (currentScope !== context) {
      if (basket.length) notice('Basket cleared because the workspace or inventory changed. No sale was recorded.');
      basket = []; data = null; search = ''; currentScope = context; businessUI.reset(); counterUI.reset(); afterDialog=null; $('#retailDialog').close();
      $('#retailView').innerHTML = empty('Loading this Retail inventory…');
    }
    try {
      const selection = selected();
      if (!selection.inventory || selection.inventory.includes(',')) throw new Error('Use the inventory selector above to choose exactly one inventory for Retail.');
      offlineState = await offline.read(context);
      if(navigator.onLine&&offlineState.operations.length)await api('/status');
      if (offlineState.operations.length) {
        if (navigator.onLine) await offline.sync(context);
        if (g !== generation || scopeKey() !== context) return;
        offlineState = await offline.read(context);
        if(navigator.onLine&&offlineState.operations.length)await api('/status');
      if (offlineState.operations.length) { data = offline.project(offlineState); retailClockOffset = Date.parse(data.server_now) - Date.now(); online = false; render(); notice('Saved sales remain on this device until confirmed. Check Offline & sync for progress or errors.'); return; }
      }
      if (!navigator.onLine && offlineState.snapshot) throw new Error('Working from the saved Retail data.');
      const status = await api('/status'); if (g !== generation) return;
      if (!status.active) {
        await offline.lock(context, 'Retail is off or no longer entitled.');
        online = false; data = null; render();
        if(platformView())return;
        $('#retailView').innerHTML = card(header('Retail is switched off', 'Enable it for this workspace in Settings.') + '<a href="settings.html">Open account settings</a>');
        notice(status.allowed ? 'Retail is off for this workspace.' : 'Activate a Retail subscription or trial in Stores & tills.'); return;
      }
      const r = await api('/overview?offline_device_id=' + encodeURIComponent(offline.device())); if (g !== generation || scopeKey() !== context) return;
      if (r.workspace_id !== selected().workspace || r.inventory_id !== selected().inventory) throw new Error('Workspace selection changed. Refresh to load the correct inventory.');
      if(r.platform_supported&&registeredTill()&&!r.registered_tills?.some(t=>t.id===registeredTill())&&!pending()){localStorage.removeItem(registeredTillKey());return refresh();}
      await offline.save(context, r); offlineState = await offline.read(context);
      if (g !== generation || scopeKey() !== context) return;
      data = offline.project(offlineState); retailClockOffset = Date.parse(data.server_now) - Date.now(); online = !offlineState.operations.length;
      for (const p of data.products) p.reserved_qty = data.business?.reservations.find(r => r.product_id === p.id)?.reserved_qty || 0;
      let basketChanged = false;
      basket = basket.filter(line => {
        const p = data.products.find(p => p.id === line.product_id && !p.archived);
        if (!p) { basketChanged = true; return false; }
        if (!businessUI.extras().booking_id && !businessUI.extras().preorder_id && (p.price_pence !== line.unit_price_pence || p.name !== line.name || p.vat_treatment !== line.vat_treatment || p.vat_rate !== line.vat_rate)) { line.unit_price_pence = p.price_pence; line.name = p.name; line.vat_treatment = p.vat_treatment; line.vat_rate = p.vat_rate; basketChanged = true; }
        return true;
      });
      $('#retailConnection').textContent = 'Up to date'; $('#retailConnection').classList.add('connected');
      $('#retailUpdated').textContent = 'Updated ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      if (!quiet || !$('#retailDialog').open) render();
      notice(basketChanged ? 'Product details changed. The basket now uses the current prices, VAT details and active products; please review it before taking payment.' : '');
    } catch (e) {
      if (g !== generation) return;
      online = false; $('#retailConnection').textContent = 'Needs refresh'; $('#retailConnection').classList.remove('connected');
      if (e.status && e.status < 500) { await offline.lock(context, e.message); offlineState = { ...offlineState, snapshot: null }; }
      else if (offlineState.snapshot) data = offline.project(offlineState);
      if (data||platformView()) render(); else $('#retailView').innerHTML = empty('Retail could not be loaded. Install the backend update if you have not done so yet, then refresh.');
      notice(e.message, true); syncStatus();
    }
  }
  const input = (label, name, value = '', extra = '', helper = '') => `<label>${esc(label)}<input name="${name}" value="${esc(value)}" ${extra}>${helper ? `<small>${esc(helper)}</small>` : ''}</label>`;
  const qtyInput = (label, name, value, max = 1000000, min = 0) => input(label, name, value, `type="number" min="${min}" max="${max}" step="1" required inputmode="numeric"`);
  const moneyInput = (label, name, value = '') => input(label, name, value, 'type="number" min="0" max="1000000" step="0.01" required inputmode="decimal"');
  function dialog(title, content) {
    window.InventoryRetailScanner?.stop();
    const d = $('#retailDialog'); d.close(); $('#retailDialogTitle').textContent = title; $('#retailDialogBody').innerHTML = content; d.showModal();
  }
  let afterDialog = null;
  function formDialog(title, content, submitLabel, action) {
    const context = currentScope;
    dialog(title, `<form class="retail-form" id="retailModalForm">${content}<p class="retail-form-error" role="status"></p><div class="retail-form-actions"><button type="submit" class="retail-primary">${esc(submitLabel)}</button></div></form>`);
    const form = $('#retailModalForm');
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (context !== currentScope) return;
      const submits = [...form.querySelectorAll('[type="submit"]')]; if (submits.some(s => s.disabled)) return;
      submits.forEach(s => { s.disabled = true; }); window.InventoryRetailScanner?.stop(); form.querySelector('.retail-form-error').textContent = '';
      try {
        const result = await action(new FormData(form), form, event.submitter);
        if (!result || context !== currentScope) return;
        $('#retailDialog').close(); await refresh();
        if (result.variance_pence != null) notice(result.variance_pence === 0 ? 'Till balanced exactly.' : `${pounds(Math.abs(result.variance_pence))} ${result.variance_pence < 0 ? 'short' : 'over'} recorded. The counted cash is the new baseline.`);
        if (result.deposit) businessUI.depositReceipt(result.deposit);
        if (result.customer) businessUI.savedCustomer(result.customer);
        if (result.scan_next && context === currentScope) productForm(undefined, true);
        if (afterDialog) { const done = afterDialog; afterDialog = null; done(); }
      } catch (e) { form.querySelector('.retail-form-error').textContent = e.message + (pending() ? ' Close this dialog and use Retry pending action above to confirm the result safely.' : ''); }
      finally { submits.forEach(s => { s.disabled = false; }); }
    });
  }
  function productForm(productId, scanAfterOpen = false, serviceOnly = false) {
    const p = data.products.find(p => p.id === productId), supported = data.vat_supported;
    const catalogueSources = { openfoodfacts: {host:'world.openfoodfacts.org',label:'Open Food Facts'}, openbeautyfacts:{host:'world.openbeautyfacts.org',label:'Open Beauty Facts'}, openproductsfacts:{host:'world.openproductsfacts.org',label:'Open Products Facts'}, openpetfoodfacts:{host:'world.openpetfoodfacts.org',label:'Open Pet Food Facts'} };
    let source = p?.catalogue_source || '', sourceCode = p?.catalogue_code || '', lookupGeneration = 0;
    const tax = supported ? `<div class="retail-tax-fields retail-full-width"><label class="retail-check-label"><input type="checkbox" name="vat_applicable" id="retailProductVat" ${p?.vat_treatment === 'taxable' ? 'checked' : ''}> VAT applicable</label><label id="retailVatRateField">VAT rate<select name="vat_rate"><option value="20" ${p?.vat_rate === 20 ? 'selected' : ''}>20% — standard rate</option><option value="5" ${p?.vat_rate === 5 ? 'selected' : ''}>5% — reduced rate</option></select></label><label id="retailVatNoChargeField">When VAT is not charged<select name="vat_no_charge"><option value="">Choose treatment</option><option value="zero_rated" ${p?.vat_treatment === 'zero_rated' ? 'selected' : ''}>Zero-rated — 0% VAT</option><option value="exempt" ${p?.vat_treatment === 'exempt' ? 'selected' : ''}>VAT exempt</option><option value="outside_scope" ${p?.vat_treatment === 'outside_scope' ? 'selected' : ''}>Outside the scope of VAT</option></select></label><small class="retail-muted">Selling prices are VAT-inclusive. Tick for 20% or 5%, or choose the correct no-charge treatment. Barcode lookup does not determine VAT.</small></div>` : '';
    const scan = data.catalogue_supported ? `<div class="retail-action-row" style="margin:0"><button type="button" id="retailScanEan">Scan EAN with camera</button><button type="button" id="retailLookupEan">Look up barcode</button></div><div id="retailCamera" class="retail-camera" hidden><video playsinline muted autoplay></video><p data-camera-status role="status"></p><button type="button" data-stop-camera>Stop camera</button></div><div id="retailLookupResult" role="status"></div>` : '<p class="retail-help">Install the latest Retail backend update to look up product names by barcode.</p>';
    const extraFields = data.business_supported ? `<div class="retail-form-grid">${data.business.config.features.services || p?.item_kind === 'service' ? '<label>Item type<select aria-label="Item type" name="item_kind" ' + (p ? 'disabled' : '') + '><option value="product" ' + (p?.item_kind !== 'service' ? 'selected' : '') + '>Stock product</option><option value="service" ' + (p?.item_kind === 'service' ? 'selected' : '') + '>Service — no stock deduction</option></select></label>' : ''}${data.business.config.features.services ? qtyInput('Service duration (minutes)', 'duration_minutes', p?.duration_minutes || 30, 1440, 1) : ''}${data.business.config.features.packs ? qtyInput('Units in one case / pack', 'pack_size', p?.pack_size || 1, 1000000, 1) : ''}${data.business.manufacturing_allowed ? '<label>Linked Manufacturing recipe (optional)<select name="manufacturing_recipe_id"><option value="">None</option>' + data.business.recipes.map(r => '<option value="' + r.id + '" ' + (p?.manufacturing_recipe_id === r.id ? 'selected' : '') + '>' + esc(r.name) + '</option>').join('') + '</select></label>' : ''}</div>` : '';
    const fields = extraFields + (data.operations?.supported ? `<div class="retail-form-grid">${input('Category','category',p?.category,'maxlength="60" list="counterCategories"')}<datalist id="counterCategories">${[...new Set(data.products.map(x=>x.category).filter(Boolean))].map(c=>'<option value="'+esc(c)+'">').join('')}</datalist><label class="retail-check-label"><input type="checkbox" name="favourite" ${p?.favourite?'checked':''}> Favourite on till</label>${!serviceOnly&&p?.item_kind!=='service'?qtyInput('Minimum age (0 = unrestricted)','minimum_age',p?.minimum_age||0,25,0):''}</div>` : '') + `<div class="retail-form-grid">${input('Product name', 'name', p?.name, 'required maxlength="160"')}${input('Barcode', 'barcode', p?.barcode, 'maxlength="100"', 'Scan or type the retail barcode. Leave blank to generate one for a custom product.')}</div>${scan}<div class="retail-form-grid">${moneyInput('Selling price per unit (£)', 'price', decimal(p?.price_pence))}${moneyInput('Cost per unit (£)', 'cost', decimal(p?.cost_pence))}${tax}${qtyInput('Minimum stock', 'minimum_qty', p?.minimum_qty ?? 0)}${qtyInput('Reorder up to', 'target_qty', p?.target_qty ?? 0)}${!p ? qtyInput('Opening stock', 'opening_qty', 0) : ''}${input('Supplier', 'supplier', p?.supplier, 'maxlength="160"')}${input('Supplier / product link', 'supplier_url', p?.supplier_url, 'type="url" maxlength="1000"')}</div>${p ? `<label class="retail-check-label"><input type="checkbox" name="archived" ${p.archived ? 'checked' : ''}> Archived (stock must be zero and deliveries cleared)</label>` : '<p class="retail-help">Enter actual opening Retail stock. This will not copy or deduct stock from the reseller area.</p>'}<p id="retailProductSource" class="retail-catalogue-credit"></p>`;
    formDialog(p?.item_kind==='service'||serviceOnly ? (p?'Edit service':'New service') : (p ? 'Edit product' : 'New Retail product'), fields, 'Save product', async (f, form, submitter) => {
      const vat = !supported ? {} : { vat_treatment: f.has('vat_applicable') ? 'taxable' : f.get('vat_no_charge') || null, vat_rate: f.has('vat_applicable') ? Number(f.get('vat_rate')) : 0 };
      const barcode = String(f.get('barcode') || '').trim();
      const catalogue = data.catalogue_supported ? { catalogue_source: sourceCode === barcode ? source : '', catalogue_code: sourceCode === barcode ? sourceCode : '' } : {};
      const r = await mutate('/products' + (p ? '/' + p.id : ''), { ...Object.fromEntries(f), ...vat, ...catalogue, ...(data.operations?.supported ? { category:f.get('category'),favourite:f.has('favourite'),minimum_age:f.get('minimum_age')||0 }:{}), ...(p && data.business_supported ? { item_kind: p.item_kind } : {}), ...(p ? { archived: f.has('archived'), edit_version: p.edit_version } : {}) }, p ? 'PATCH' : 'POST');
      return r ? { ...r, scan_next: submitter?.dataset.scanNext === 'true' } : r;
    });
    const form = $('#retailModalForm'), context = currentScope;
    const kind = form.elements.item_kind;
    const updateKind = () => { const service = (p?.item_kind || kind?.value || (serviceOnly?'service':'product')) === 'service'; for (const name of ['minimum_qty','target_qty','opening_qty']) { const el = form.elements[name]; if (el) { el.closest('label').hidden = service; if (service) el.value = 0; } } };
    if (kind) { kind.value = p?.item_kind || (serviceOnly?'service':'product'); kind.closest('label').hidden = true; }
    if (!kind && serviceOnly) form.insertAdjacentHTML('afterbegin','<input type="hidden" name="item_kind" value="service">');
    kind?.addEventListener('change', updateKind); updateKind();
    if (serviceOnly || p?.item_kind==='service') { form.elements.name.closest('label').firstChild.textContent='Service name'; for(const field of ['supplier','supplier_url','pack_size','manufacturing_recipe_id']) form.elements[field]?.closest('label')?.setAttribute('hidden',''); form.querySelector('#retailScanEan')?.closest('.retail-action-row')?.setAttribute('hidden',''); }
    else form.elements.duration_minutes?.closest('label')?.setAttribute('hidden','');
    if (!p && !serviceOnly && data.catalogue_supported) form.querySelector('.retail-form-actions').insertAdjacentHTML('afterbegin', '<button type="submit" data-scan-next="true">Save and scan next</button>');
    function attribution() {
      const el = form.querySelector('#retailProductSource');
      el.innerHTML = source && catalogueSources[source] ? `Product identification from <a href="https://${catalogueSources[source].host}/product/${esc(sourceCode)}" target="_blank" rel="noopener noreferrer">${esc(catalogueSources[source].label)}</a> · <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noopener noreferrer">ODbL</a>. Details are editable; check the product and pack size.` : '';
    }
    attribution();
    form.elements.barcode.addEventListener('input', () => { lookupGeneration++; source = ''; sourceCode = ''; attribution(); if ($('#retailLookupResult')) $('#retailLookupResult').replaceChildren(); });
    if (supported) {
      const toggle = form.elements.vat_applicable;
      const updateTax = () => {
        const checked = toggle.checked;
        form.querySelector('#retailVatRateField').hidden = !checked; form.elements.vat_rate.disabled = !checked;
        form.querySelector('#retailVatNoChargeField').hidden = checked; form.elements.vat_no_charge.disabled = checked;
        form.elements.vat_no_charge.required = !checked && Boolean(data.settings.vat_receipts);
      };
      toggle.addEventListener('change', updateTax); updateTax();
    }
    async function lookup() {
      const barcode = form.elements.barcode.value.trim(), g = ++lookupGeneration;
      const result = form.querySelector('#retailLookupResult');
      if (!barcode) { result.textContent = 'Scan a barcode with your USB scanner, use Scan EAN with camera, or type the number into Barcode first.'; form.elements.barcode.focus(); return; }
      if (!window.InventoryRetailScanner.valid(barcode)) { result.textContent = 'Enter a valid EAN or UPC number (8, 12, 13 or 14 digits). Custom barcodes can still be saved manually.'; form.elements.barcode.focus(); return; }
      if (!navigator.onLine) { result.textContent = 'Product name lookup needs internet access. Keep the scanned barcode and enter the name manually, or reconnect and try again.'; return; }
      const existing = data.products.find(x => x.barcode === barcode && x.id !== p?.id);
      if (existing) { result.textContent = `This barcode is already saved as ${existing.name}. Close this form and edit or stock in that product instead.`; return; }
      result.textContent = 'Looking up food, toiletries, household and pet products…';
      try {
        const r = await api('/catalogue/' + encodeURIComponent(barcode));
        if (g !== lookupGeneration || !form.isConnected || currentScope !== context || !$('#retailDialog').open) return;
        if (!r.found) { result.textContent = 'No named match was found in the public product databases. The barcode is kept; enter its name once and it will be recognised in this shop next time.'; form.elements.name.focus(); return; }
        const x = r.product;
        result.innerHTML = `<div class="retail-catalogue-match"><strong>${esc(x.name)}</strong><p>${esc([x.brand, x.quantity, x.barcode].filter(Boolean).join(' · '))}</p><p class="retail-help">Check the flavour, size and multipack count match the pack in your hand.</p><button type="button" id="retailAcceptMatch">Use these details</button><p class="retail-catalogue-credit"><a href="${esc(x.source_url)}" target="_blank" rel="noopener noreferrer">${esc(x.source_name || catalogueSources[x.source]?.label || 'Product database')}</a> · ODbL</p></div>`;
        result.querySelector('#retailAcceptMatch').onclick = () => {
          const current = form.elements.name.value.trim();
          if (current && current !== p?.name && !window.confirm('Replace the product name with this matched name?')) return;
          const quantity = x.quantity && !x.name.toLowerCase().includes(x.quantity.toLowerCase()) ? ' · ' + x.quantity : '';
          form.elements.name.value = (x.name + quantity).slice(0, 160); source = Object.hasOwn(catalogueSources,x.source) ? x.source : 'openfoodfacts'; sourceCode = x.barcode;
          attribution(); result.textContent = 'Product details filled in. Add the shop’s price, stock and reorder levels before saving.'; form.elements.price.focus();
        };
      } catch (e) { if (g === lookupGeneration && form.isConnected) result.textContent = /invalid server response/i.test(e.message) ? 'Barcode lookup did not receive a valid backend response. Install the latest Retail backend update, restart InventoryOS Backend, and try again. Your barcode is kept for manual entry.' : e.message; }
    }
    productBarcodeScan = code => { if (!form.isConnected) return; window.InventoryRetailScanner?.stop(); form.elements.barcode.value = code; form.elements.barcode.dispatchEvent(new Event('input', { bubbles: true })); if (data.catalogue_supported) lookup(); };
    form.elements.barcode.autocomplete = 'off';
    form.elements.barcode.focus();
    if (data.catalogue_supported) {
      form.querySelector('#retailLookupEan').onclick = lookup;
      const start = () => InventoryRetailScanner.start(form.querySelector('#retailCamera'), (code, error) => {
        if (!form.isConnected || currentScope !== context || !$('#retailDialog').open) return;
        if (error) { form.querySelector('#retailLookupResult').textContent = error; return; }
        form.elements.barcode.value = code; source = ''; sourceCode = ''; attribution(); lookup();
      });
      form.querySelector('#retailScanEan').onclick = start;
      if (scanAfterOpen) start();
    }
  }
  function stockIn(productId) {
    const p = data.products.find(p => p.id === productId);
    const packs = data.business?.config.features.packs;
    formDialog('Stock in: ' + p.name, `<p>Current stock: ${p.stock_qty}. Receive an existing order from Deliveries to avoid adding it twice.</p>${packs ? '<label>Quantity entered as<select name="received_as"><option value="units">Individual units</option><option value="cases">Cases / packs (' + p.pack_size + ' units each)</option></select></label>' : ''}${qtyInput('Quantity received', 'qty', 1, 1000000, 1)}${packs ? input('Cost per case (£, optional)', 'case_cost', '', 'type="number" min="0" step="0.01"', 'Used only when receiving cases. Unit cost is rounded to the nearest penny.') : ''}${input('Reason / reference', 'reason', '', 'required maxlength="300"')}`, 'Add to Retail stock', f => mutate('/stock-in', { ...Object.fromEntries(f), product_id: p.id }));
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
    const products = data.products.filter(p => !p.archived && p.item_kind !== 'service');
    if (!products.length) { notice('Create a product before creating a delivery.'); return; }
    if (initial.length > 100) { notice('A combined delivery supports up to 100 products. Create smaller orders from the individual reorder buttons.'); return; }
    const defaults = initial.length ? initial : [{ id: products[0].id, qty: 1, cost_pence: products[0].cost_pence }];
    const line = x => `<div class="retail-delivery-line"><label>Product<select data-product>${products.map(p => `<option value="${p.id}" ${p.id === x.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label><div class="retail-form-grid"><label>Quantity ordered<input data-qty type="number" min="1" max="1000000" step="1" value="${x.qty}" required></label><label>Cost per selected unit (£)<input data-cost type="number" min="0" max="1000000" step="0.01" value="${decimal(x.cost_pence)}" required></label>${data.business?.config.features.packs ? '<label>Order as<select data-order-unit><option value="units">Individual units</option><option value="cases">Cases / packs</option></select></label>' : ''}</div><button type="button" data-remove-line>Remove line</button></div>`;
    formDialog('Create delivery / order', `${input('Supplier', 'supplier', initial.length === 1 ? products.find(p => p.id === initial[0].id)?.supplier : '', 'maxlength="160"')}${input('Order reference', 'reference', '', 'maxlength="160"')}${input('Expected delivery date', 'expected_on', '', 'type="date"')}<div id="retailDeliveryLines" class="retail-form">${defaults.map(line).join('')}</div><button type="button" id="retailAddDeliveryLine">Add another product</button><p class="retail-help">This records an order you place with your supplier. It does not send the order or make a payment.</p>`, 'Save expected delivery', (f, form) => {
      const items = [...form.querySelectorAll('.retail-delivery-line')].map(el => ({ product_id: el.querySelector('[data-product]').value, qty: el.querySelector('[data-qty]').value, cost: el.querySelector('[data-cost]').value, unit: el.querySelector('[data-order-unit]')?.value || 'units' }));
      return mutate('/deliveries', { ...Object.fromEntries(f), items });
    });
    $('#retailAddDeliveryLine').onclick = () => { if ($$('#retailDeliveryLines .retail-delivery-line').length < 100) $('#retailDeliveryLines').insertAdjacentHTML('beforeend', line({ id: products[0].id, qty: 1, cost_pence: products[0].cost_pence })); };
    $('#retailDeliveryLines').addEventListener('click', e => { if (e.target.closest('[data-remove-line]')) e.target.closest('.retail-delivery-line').remove(); });
    $('#retailDeliveryLines').addEventListener('change', e => { if (e.target.matches('[data-product],[data-order-unit]')) { const line = e.target.closest('.retail-delivery-line'), p = products.find(p => p.id === line.querySelector('[data-product]').value); line.querySelector('[data-cost]').value = decimal(p.cost_pence * (line.querySelector('[data-order-unit]')?.value === 'cases' ? p.pack_size : 1)); } });
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
    businessUI.broadcast(sale);
    const vat = sale.vat_receipt, business = sale.receipt_business || { name: vat?.business_name || 'InventoryOS · Retail', address: vat?.business_address || '' };
    const breakdown = vat ? `<section class="retail-receipt-vat"><hr><h4>VAT breakdown — included in prices</h4><table class="retail-tax-table"><thead><tr><th>Rate / treatment</th><th>Net</th><th>VAT</th><th>Total</th></tr></thead><tbody>${vat.groups.map(g => `<tr><td>${esc(vatLabel(g.vat_treatment, g.vat_rate))}</td><td>${pounds(g.net_pence)}</td><td>${pounds(g.vat_pence)}</td><td>${pounds(g.gross_pence)}</td></tr>`).join('')}</tbody></table><p>Net total: ${pounds(vat.net_pence)}<br>VAT included: ${pounds(vat.vat_pence)}<br><strong>Total paid: ${pounds(vat.gross_pence)}</strong></p>${sale.total_pence > 25000 || vat.groups.some(g => ['exempt', 'outside_scope'].includes(g.vat_treatment)) ? '<p>This is a sales receipt with a VAT breakdown, not a full VAT invoice. Request a full VAT invoice separately if needed.</p>' : ''}</section>` : '';
    dialog('Sale receipt', `${sale.pending_sync ? '<p class="retail-note">Cash sale saved on this device. Awaiting server confirmation; keep this browser data until synced.</p>' : ''}<div class="retail-receipt"> <h3>${esc(business.name)}</h3>${business.address ? `<p class="retail-receipt-address">${esc(business.address).replace(/\n/g, '<br>')}</p>` : ''}${vat ? `<p>VAT registration: ${esc(vat.vat_number)}</p>` : ''}<p>${esc(sale.reference)}<br>${esc(when(sale.created_at))}</p><table>${sale.items.map(i => { const line = vat?.lines.find(x => x.product_id === i.product_id); return `<tr><td>${esc(i.name)}<br>${i.qty} × ${pounds(i.unit_price_pence)}${line ? '<br><small>' + esc(vatLabel(line.vat_treatment, line.vat_rate)) + '</small>' : ''}</td><td>${pounds(i.line_total_pence ?? i.qty * i.unit_price_pence)}${i.line_discount_pence ? '<br><small>Saved ' + pounds(i.line_discount_pence) + '</small>' : ''}</td></tr>`; }).join('')}</table><hr><p><strong>Total ${pounds(sale.total_pence)}</strong>${sale.tip_pence ? '<br>Tip ' + pounds(sale.tip_pence) : ''}${sale.deposit_applied_pence ? '<br>Deposit applied ' + pounds(sale.deposit_applied_pence) : ''}<br>${sale.payment_method==='card'?'Card — manually confirmed':'Cash now '+pounds(sale.cash_tendered_pence ?? sale.tendered_pence)+'<br>Change '+pounds(sale.change_pence)}${sale.status === 'refunded' ? '<br>REFUNDED — original sale receipt' : ''}</p>${breakdown}${sale.deposit_vat_pence ? '<p>VAT already included in deposits: ' + pounds(sale.deposit_vat_pence) + '</p>' : ''}${sale.cashier_snapshot ? '<p>Served by '+esc(sale.cashier_snapshot.name)+' · '+esc(sale.cashier_snapshot.number)+'</p>' : ''}${sale.exchange_credit_pence ? '<p>Exchange credit '+pounds(sale.exchange_credit_pence)+' · New cash '+pounds(sale.cash_tendered_pence)+'</p>' : ''}${sale.loyalty_snapshot ? '<p>Loyalty: ' + sale.loyalty_snapshot.earned + ' earned · ' + Math.max(0, sale.loyalty_snapshot.balance) + ' / ' + sale.loyalty_snapshot.target + ' stamps</p>' : ''}<p>Thank you for shopping with us.</p></div><div class="retail-action-row">${button('Print / save receipt', 'print')}</div><p class="retail-help">Uses your browser’s print menu. A connected printer is required for paper receipts.</p>`);
  }
  function refundForm(saleId) {
    const s = data.sales.find(s => s.id === saleId);
    formDialog('Refund whole cash sale', `<p>${esc(s.reference)} · ${pounds(s.total_pence)}. Confirm you are returning this cash to the customer. The original sale stays in your history.</p><p>${esc(s.items.map(i => `${i.qty} × ${i.name}`).join(', '))}</p>${input('Refund reason', 'reason', '', 'required maxlength="300"')}<label class="retail-check-label"><input type="checkbox" name="restock"> All returned items are saleable and should go back into stock</label>`, 'Record full cash refund', f => mutate('/sales/' + s.id + '/refund', { reason: f.get('reason'), restock: f.has('restock') }));
  }
  async function handleAction(el) {
    if (!data && !['refresh', 'retry'].includes(el.dataset.action)) return;
    const { action, id: recordId, kind } = el.dataset;
    if (action === 'refresh') return refresh();
    if (action === 'offline-sync') { await offline.sync(currentScope, true); await refresh(); return; }
    if (action === 'offline-prepare') { if (!navigator.onLine) throw new Error('Reconnect to prepare this device.'); shellReady = await offline.shell(); await navigator.storage?.persist?.(); await refresh(); return; }
    if (action === 'offline-backup') return offline.backup(currentScope);
    if (action === 'offline-receipt') return receipt(offlineState.operations.find(x => x.id === recordId).sale);
    if (action === 'till-screen') { switchView('till'); if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {}); return; }
    if (action === 'retry') {
      el.disabled = true;
      try { const r = await mutate(null, null, null, true); if (r) { basket = []; businessUI.reset(); $('#retailDialog').close(); await refresh(); notice('Pending action confirmed.'); if (r.items) { basket=r.items;counterUI.reset();switchView('checkout'); } if (r.return_receipt) counterUI.showReturn(r); else if (r.sale) receipt(r.sale); } } finally { el.disabled = false; }
      return;
    }
    if (action.startsWith('counter-')) return counterUI.action(el);
    if (action === 'service-new') return productForm(undefined,false,true);
    if (action === 'product-new') return productForm();
    if (action === 'product-scan') return productForm(undefined, true);
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
    if (action === 'refund') return data.operations?.supported ? counterUI.returns(recordId) : refundForm(recordId);
    if (action === 'print') return window.InventoryRetailPrint.print();
    if (action === 'report-view') { const r = data.reports[Number(el.dataset.index)]; return dialog('Reorder snapshot · ' + dateOnly(r.report_date), `<p>Saved ${when(r.created_at)}. These are historical quantities; use the live report to place new orders.</p>` + reorderTable(r.data.items, false) + button('Print snapshot', 'print')); }
    if (action === 'report-print') return dialog('Current reorder report', reorderTable(data.reorders, false) + `<p>Generated ${when(data.server_now)} · ${esc(data.settings.timezone)}</p>` + button('Print / save report', 'print'));
    if (action.startsWith('basket-')) {
      if (checkoutBusy || !checkoutWriter()) return;
      if (businessUI.lockedLine(recordId)) { notice('This item belongs to the linked booking/preorder. Detach it to start a separate sale.'); return; }
      const p = data.products.find(p => p.id === recordId), item = basket.find(i => i.product_id === recordId);
      if (action === 'basket-add') {
        const context = currentScope; if (!await counterUI.ageGate(p) || context !== currentScope || !checkoutWriter()) return;
        if (item) item.qty = Math.min(1000000, item.qty + 1);
        else if (basket.length < 100) basket.push({ product_id: p.id, name: p.name, qty: 1, unit_price_pence: p.price_pence, vat_treatment: p.vat_treatment, vat_rate: p.vat_rate });
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
    if (event.target.closest('#retailSettingsForm')) event.target.closest('form').dataset.dirty = 'true';
    if (event.target.id === 'retailSearch') {
      const caret = event.target.selectionStart; search = event.target.value; render(); const field = $('#retailSearch'); field?.focus(); if (field?.type === 'search') field.setSelectionRange(caret, caret);
    }
    if (event.target.name === 'tendered' && $('#retailChange')) {
      const raw = event.target.value, total = (checkoutQuote?.total_pence ?? basket.reduce((n, i) => n + i.qty * i.unit_price_pence, 0)) + Math.round(Number(businessUI.extras().tip || 0) * 100) - businessUI.depositTotal();
      const amount = /^\d+(\.\d{0,2})?$/.test(raw) ? Math.round(Number(raw) * 100) : NaN;
      $('#retailChange').textContent = Number.isFinite(amount) ? (amount >= total ? 'Change to give: ' + pounds(amount - total) : 'Still to receive: ' + pounds(total - amount)) : '';
    }
  });
  document.addEventListener('change', event => {
    if(event.target.id==='retailRegisteredTill'){if(checkoutBusy||pending())return;localStorage.setItem(registeredTillKey(),event.target.value);refresh();return;}
    const input = event.target.closest('[data-basket-qty]'); if (!input || checkoutBusy) return;
    const item = basket.find(i => i.product_id === input.dataset.basketQty), value = Number(input.value);
    if (item && Number.isInteger(value) && value >= 1 && value <= 1000000) item.qty = value;
    render();
  });
  window.InventoryRetailKeyboard.attach({
    context: () => $('#retailDialog').open ? ($('#retailModalForm input[name=barcode]') ? 'product' : null) : (view === 'checkout' && data ? 'checkout' : null),
    scan: (code, mode) => { if (mode === 'product') productBarcodeScan?.(code); else scanCheckout(code); }
  });
  document.addEventListener('submit', async event => {
    if (!['retailCheckoutForm', 'retailSettingsForm'].includes(event.target.id)) return;
    event.preventDefault(); const form = event.target;
    if (form.id === 'retailCheckoutForm') {
      if (checkoutBusy || !basket.length || pending()) return;
      const tendered = new FormData(form).get('tendered'); if (!checkoutWriter()) return; checkoutBusy = true;
      try {
        if (!await counterUI.confirmAges()) return; render();
        const body = { ...businessUI.extras(), age_checks: counterUI.ageChecks(), reviewed_total_pence: checkoutQuote?.total_pence, items: basket.map(({ product_id, qty, unit_price_pence, vat_treatment, vat_rate }) => ({ product_id, qty, unit_price_pence, vat_treatment, vat_rate })), payment_method: 'cash', tendered, vat_version: data.settings.vat_version ?? 0 };
        let result;
        if (!businessUI.needsOnline() && !counterUI.needsOnline() && offline.canSell(offlineState) && (online || shellReady)) {
          result = await offline.enqueue(currentScope, body);
          offlineState = await offline.read(currentScope); data = offline.project(offlineState);
          basket = []; businessUI.reset(); counterUI.reset(); checkoutBusy = false; render(); receipt(result.sale);
          // Receipt is already durable. Sync can continue while the next basket is built.
          offline.sync(currentScope).then(async () => { offlineState = await offline.read(currentScope); syncStatus(); if (!$('#retailDialog').open && !basket.length) refresh({ quiet: true }); }).catch(e => notice(e.message, true));
        } else {
          if (!online) throw new Error('Reconnect and prepare this device before taking an offline sale.');
          result = await mutate('/checkout', body);
          if (result) { basket = []; businessUI.reset(); counterUI.reset(); checkoutBusy = false; await refresh(); receipt(result.sale); }
        }
      } catch (e) { notice(e.message, true); }
      finally { checkoutBusy = false; render(); }
    } else {
      const submit = form.querySelector('[type="submit"]'); if (submit.disabled) return; submit.disabled = true;
      const f = new FormData(form);
      try { await mutate('/settings', { enabled: f.has('enabled'), report_time: f.get('report_time'), timezone: f.get('timezone'), ...(data.vat_supported ? { vat_receipts: f.has('vat_receipts'), receipt_business_name: f.get('receipt_business_name'), receipt_business_address: f.get('receipt_business_address'), vat_number: f.get('vat_number') } : {}) }, 'PATCH'); await refresh(); InventoryRetail.refresh(); }
      catch (e) { form.querySelector('.retail-form-error').textContent = e.message; }
      finally { submit.disabled = false; }
    }
  });
  const businessUI = window.InventoryRetailBusiness.create({ getData: () => data, api, mutate, refresh, render, esc, pounds, when, input, moneyInput, qtyInput, button, card, header, row, table, empty, dialog, formDialog, basket: () => basket, setBasket: value => { basket = value; }, switchView, online: () => online, admin, writer, scope: () => currentScope, notice, now: () => Date.now() + retailClockOffset });
  const counterUI = window.InventoryRetailCounter.create({getData:()=>data,scope:()=>currentScope,api,mutate,refresh,render,esc,pounds,when,button,card,header,table,input,moneyInput,qtyInput,formDialog,dialog,admin,platformAdmin:()=>platformAdminScope===scopeKey(),online:()=>online,basket:()=>basket,setBasket:v=>{basket=v;},clear:()=>{basket=[];businessUI.reset();},linked:()=>Boolean(businessUI.extras().booking_id||businessUI.extras().preorder_id||businessUI.extras().customer_id||Number(businessUI.extras().tip||0)),switchView,notice,afterDialog:fn=>{afterDialog=fn;},now:()=>Date.now()+retailClockOffset,labels:window.InventoryRetailLabels.create({esc,pounds,dialog,button})});
  async function boot() {
    if (!InventoryAPI.requireLogin()) return;
    const user = InventoryAPI.getUser();
    $('#retailPersonName').textContent = user?.name || 'Your account';
    $('#retailAvatar').textContent = (user?.name || 'Inventory OS').split(/\s+/).map(x => x[0]).slice(0, 2).join('').toUpperCase();
    $('#retailLogout').onclick = () => { if (offlineState.operations.length && !confirm('There are saved sales awaiting sync on this device. They will remain here, but you must sign in to the same account to sync them. Log out?')) return; InventoryAPI.logout(); };
    $('#retailMenu').onclick = () => setMenu(!$('#retailSidebar').classList.contains('open'));
    setMenu(false);
    $('#retailDialogClose').onclick = () => { window.InventoryRetailScanner?.stop(); $('#retailDialog').close(); };
    $('#retailDialog').addEventListener('close', () => { if (!$('#retailDialog').open) { window.InventoryRetailScanner?.stop(); productBarcodeScan = null; if (view === 'checkout') $('#retailSearch')?.focus(); } });
    render();
    offline.shell().then(ok => { shellReady = ok; syncStatus(); }).catch(() => { shellReady = false; });
    if (navigator.onLine) await Promise.race([InventoryTopbar.init(), new Promise(resolve => setTimeout(resolve, 12000))]);
    ready = true; await refresh();
  }
  window.addEventListener('retail-offline-change', async () => { if (!currentScope) return; offlineState = await offline.read(currentScope); syncStatus(); if (view === 'offline' && !$('#retailDialog').open) render(); });
  window.addEventListener('online', () => { if (ready && !checkoutBusy) refresh({ quiet: true }); });
  window.addEventListener('offline', () => { online = false; syncStatus(); if (ready && !checkoutBusy && !$('#retailDialog').open) render(); });
  window.addEventListener('inventory-selection-changed', () => { if (ready) refresh(); });
  window.addEventListener('hashchange', () => switchView(location.hash.slice(1)));
  window.addEventListener('resize', () => setMenu(false));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && ready && !$('#retailDialog').open && view !== 'checkout') refresh({ quiet: true }); });
  setInterval(() => { if (ready && currentScope && navigator.onLine && offlineState.operations.length) offline.sync(currentScope).then(async () => { offlineState = await offline.read(currentScope); syncStatus(); }).catch(e => notice(e.message, true)); }, 15000);
  setInterval(() => { if (ready && !document.hidden && !$('#retailDialog').open && view !== 'checkout') refresh({ quiet: true }); }, 60000);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})();
