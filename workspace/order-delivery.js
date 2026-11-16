(function () {
    'use strict';

    const escape = value => String(value ?? '').replace(/[&<>"']/g,
        char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    const stages = {
        awaiting_label:'Awaiting label', ready:'Ready to dispatch', dispatched:'Dispatched',
        in_transit:'In transit', delivered:'Delivered', exception:'Delivery issue',
        returned:'Returned', cancelled:'Cancelled'
    };
    const carriers = {'royal-mail':'Royal Mail', evri:'Evri', dpd:'DPD', inpost:'InPost', other:'Other courier'};
    const channels = {ebay:'eBay', vinted:'Vinted', email:'Forwarded email', manual:'Manual', other:'Other'};
    const blocked = new Set(['quote', 'backorder', 'cancelled', 'returned']);
    const ref = order => order.reference || order.id.slice(0, 8);
    const date = value => new Date(value).toLocaleDateString('en-GB');
    const options = entries => Object.entries(entries).map(([key,label]) =>
        `<option value="${escape(key)}">${escape(label)}</option>`).join('');

    function dispatchBlock(order, data) {
        if (blocked.has(order.status)) {
            return {quote:'Confirm the order first',backorder:'Waiting for stock',cancelled:'Cancelled',returned:'Returned'}[order.status];
        }
        if (order.delivery_stage === 'awaiting_label') return 'Add a shipping label';
        if (order.delivery_stage !== 'ready') return stages[order.delivery_stage] || 'Review the delivery stage';
        if (!order.has_label) return 'Add a shipping label';
        if (order.packing_status === 'packed') return '';
        if (!order.matched_items) return 'Review item matches in Dispatch Centre';
        if (data.require_scan) return 'Scan items in Dispatch Centre';
        return '';
    }

    function packingNote(order, data) {
        if (order.packing_status === 'packed') return 'Picked and packed';
        if (order.delivery_stage !== 'ready') return '';
        return dispatchBlock(order,data) || 'Label and items ready';
    }

    function saleAmount(lines) {
        if (!lines?.length || lines.some(line => !Number.isSafeInteger(line.unit_price_pence) || line.unit_price_pence < 0 ||
            !Number.isSafeInteger(line.qty) || line.qty < 1)) return '';
        const pence = lines.reduce((total,line) => total + line.qty * line.unit_price_pence, 0);
        return Number.isSafeInteger(pence) && pence > 0 ? (pence / 100).toFixed(2) : '';
    }

    function renderRow(order, data) {
        const reference = escape(ref(order));
        const id = escape(order.id);
        const title = escape(order.lines?.[0]?.description || order.label_name || '');
        const packing = packingNote(order, data);
        return `<tr data-order-row="${id}">
            <td class="delivery-select-cell">${data.can_confirm ? `<label class="delivery-checkbox" title="Select ${reference}">
                <input type="checkbox" data-select-order="${id}" aria-label="Select ${reference}"></label>` : ''}</td>
            <td class="delivery-order-cell"><button type="button" class="order-row-button" data-action="order" data-id="${id}">
                <strong translate="no">${reference}</strong>${title ? `<small>${title}</small>` : ''}
                <small class="muted">${escape(channels[order.channel] || order.channel)}</small>
            </button></td>
            <td class="delivery-stage-cell"><span class="delivery-stage" data-delivery-stage="${escape(order.delivery_stage)}">${escape(stages[order.delivery_stage] || 'Awaiting label')}</span>
                ${packing ? `<small class="muted">${escape(packing)}</small>` : ''}</td>
            <td class="delivery-tracking-cell"><button type="button" class="order-row-button" data-action="order-delivery" data-id="${id}">
                ${order.tracking_number ? `<strong translate="no">${escape(order.tracking_number)}</strong><small>${escape(carriers[order.carrier] || 'Courier tracking')}</small>` : 'View tracking'}
            </button></td>
            <td class="delivery-date-cell"><time datetime="${escape(order.order_date)}">${escape(date(order.order_date))}</time></td>
        </tr>`;
    }

    function mount(root, {api, dialog, closeDialog, toast, current, onData, filters}) {
        const chosen = new Set();
        let data = null;
        let sequence = 0;
        let searchTimer;
        let waiting = true;
        let confirming = false;
        root.innerHTML = `<div class="delivery-filters">
            <label class="workspace-field">Search orders<input type="search" maxlength="120" placeholder="Order number or tracking number" data-delivery-search></label>
            <label class="workspace-field">Delivery stage<select data-delivery-filter>${options({'':'All stages',not_dispatched:'Not dispatched',sent:'Already dispatched',...stages})}</select></label>
            <label class="workspace-field">Sort by<select data-delivery-sort>${options({oldest:'Oldest first',newest:'Newest first',order:'Order number',tracking:'Tracking number'})}</select></label>
        </div>
        <div class="delivery-bulk" data-delivery-bulk hidden>
            <button type="button" class="btn quiet" data-delivery-select-all>Select all on this page</button>
            <span data-delivery-selected aria-live="polite"></span>
            <button type="button" class="btn primary" data-delivery-confirm disabled>Confirm picked &amp; dispatched</button>
            <p class="muted delivery-selection-note" data-delivery-selection-note hidden></p>
        </div>
        <p class="delivery-count muted" data-delivery-count role="status"></p>
        <div class="table-scroll delivery-table" data-delivery-results></div>
        <div class="delivery-pages" data-delivery-pages hidden>
            <button type="button" class="btn quiet" data-delivery-prev>Previous</button>
            <span class="muted" data-delivery-page></span>
            <button type="button" class="btn quiet" data-delivery-next>Next</button>
        </div>`;
        const find = selector => root.querySelector(`[data-delivery-${selector}]`);
        const tbody = () => find('results').querySelector('tbody');
        find('search').value = filters.q;
        find('filter').value = filters.stage;
        find('sort').value = filters.sort;

        function refreshSelection() {
            const rows = data?.orders || [];
            const ready = rows.filter(order => chosen.has(order.id) && !dispatchBlock(order,data)).length;
            const all = find('select-all');
            all.textContent = rows.length > 0 && rows.every(order => chosen.has(order.id)) ? 'Clear selection' : 'Select all on this page';
            all.disabled = waiting || confirming || !data?.can_confirm || rows.length === 0;
            find('selected').textContent = chosen.size ? `${chosen.size} selected · ${ready} ready to dispatch` : '';
            find('confirm').disabled = waiting || confirming || !ready;
            const note = find('selection-note');
            note.hidden = chosen.size === 0 || ready > 0;
            note.textContent = note.hidden ? '' : 'Check delivery stages, labels and packing notes to see which selected orders need attention.';
            tbody()?.querySelectorAll('[data-select-order]').forEach(input => {
                input.checked = chosen.has(input.dataset.selectOrder);
                input.disabled = waiting || confirming;
                input.closest('tr').classList.toggle('delivery-selected', input.checked);
            });
        }

        async function load({legacy = false} = {}) {
            clearTimeout(searchTimer);
            const request = ++sequence;
            waiting = true;
            refreshSelection();
            find('count').textContent = 'Loading orders…';
            try {
                const params = new URLSearchParams({...filters, ...(legacy ? {include_unlinked:'1'} : {})});
                const response = await api('/workspace-orders/delivery-queue?' + params);
                if (!current() || sequence !== request) return;
                const pages = Math.max(1, Math.ceil(response.total / response.page_size));
                if (response.page > pages) {
                    filters.page = pages;
                    return load({legacy});
                }
                data = response;
                for (const id of chosen) if (!data.can_confirm || !data.orders.some(order => order.id === id)) chosen.delete(id);
                onData(data);
                find('bulk').hidden = !data.can_confirm;
                find('count').textContent = data.total ? `${(data.page - 1) * data.page_size + 1}–${(data.page - 1) * data.page_size + data.orders.length} of ${data.total} orders` : 'No orders match these filters.';
                find('results').innerHTML = !data.orders.length ? '' : `<table>
                    <thead><tr><th scope="col" aria-label="Select"></th><th scope="col">Order</th>
                    <th scope="col">Delivery stage</th><th scope="col">Courier tracking</th><th scope="col">Date</th></tr></thead>
                    <tbody>${data.orders.map(order => renderRow(order,data)).join('')}</tbody></table>`;
                find('pages').hidden = pages === 1;
                find('prev').disabled = data.page <= 1;
                find('next').disabled = data.page >= pages;
                find('page').textContent = `Page ${data.page} of ${pages}`;
                return true;
            } catch (error) {
                if (current() && sequence === request) {
                    find('count').textContent = error.message;
                    find('results').innerHTML = '';
                    find('pages').hidden = true;
                    data = null;
                    chosen.clear();
                }
                return false;
            } finally {
                if (sequence === request) {
                    waiting = false;
                    if (current()) refreshSelection();
                }
            }
        }

        function changeFilter(key,value,debounced = false) {
            filters[key] = value;
            filters.page = 1;
            chosen.clear();
            clearTimeout(searchTimer);
            if (debounced) {
                ++sequence;
                waiting = true;
                refreshSelection();
                searchTimer = setTimeout(load, 220);
            } else void load();
        }

        find('search').addEventListener('input', event => changeFilter('q',event.target.value,true));
        find('filter').addEventListener('change', event => changeFilter('stage',event.target.value));
        find('sort').addEventListener('change', event => changeFilter('sort',event.target.value));
        find('select-all').addEventListener('click', () => {
            if (!data?.can_confirm || waiting || confirming) return;
            const select = data.orders.some(order => !chosen.has(order.id));
            chosen.clear();
            if (select) for (const order of data.orders) chosen.add(order.id);
            refreshSelection();
        });
        find('results').addEventListener('click', event => {
            if (!data?.can_confirm || waiting || confirming || event.target.closest('button,a,input,label')) return;
            const id = event.target.closest('[data-order-row]')?.dataset.orderRow;
            if (!id) return;
            if (chosen.has(id)) chosen.delete(id);
            else chosen.add(id);
            refreshSelection();
        });
        find('results').addEventListener('change', event => {
            const id = event.target.dataset.selectOrder;
            if (!id || waiting || confirming) return;
            if (event.target.checked) chosen.add(id);
            else chosen.delete(id);
            refreshSelection();
        });
        for (const [selector,direction] of [['prev',-1],['next',1]]) find(selector).addEventListener('click', () => {
            if (waiting || confirming) return;
            filters.page += direction;
            chosen.clear();
            void load();
        });

        find('confirm').addEventListener('click', () => {
            if (!data?.can_confirm || waiting || confirming) return;
            const selected = data.orders.filter(order => chosen.has(order.id) && !dispatchBlock(order,data));
            if (!selected.length) return;
            const skipped = data.orders.filter(order => chosen.has(order.id) && dispatchBlock(order,data));
            dialog('Confirm picked and dispatched', `<form id="confirm-order-dispatch">
                <p class="muted">${selected.length} ${selected.length === 1 ? 'order' : 'orders'}. Stock is deducted for newly packed orders.${data.track_sales ? ' Enter the sale total for any new sale.' : ''}</p>
                <div class="delivery-confirm-list">${selected.map(order => `<div class="delivery-confirm-row">
                    <div><strong translate="no">${escape(ref(order))}</strong><small>${escape(order.label_name || 'Shipping label')}</small>
                    ${order.tracking_number ? `<small translate="no">${escape(order.tracking_number)}</small>` : ''}</div>
                    ${order.packing_status === 'packed' ? '<small class="muted">Already packed</small>' : data.track_sales ?
                        `<label class="workspace-field">Sale total £<input name="${escape(order.id)}" aria-label="Sale total for ${escape(ref(order))}" type="number" min="0.001" step="0.001" required value="${escape(saleAmount(order.lines))}"></label>` : ''}
                </div>`).join('')}</div>
                ${skipped.length ? `<details class="delivery-selection-skipped"><summary>Other selected orders (${skipped.length})</summary><ul>${skipped.map(order =>
                    `<li><strong translate="no">${escape(ref(order))}</strong> · ${escape(dispatchBlock(order,data))}</li>`).join('')}</ul></details>` : ''}
                <label class="workspace-check"><input type="checkbox" required> I’ve picked these items and handed the parcels to the courier.</label>
                <div role="status" data-delivery-confirm-result></div>
                <div class="dialog-actions"><button type="submit" class="btn primary">Confirm dispatch</button></div>
            </form>`);
            const form = document.getElementById('confirm-order-dispatch');
            form.addEventListener('submit', async event => {
                event.preventDefault();
                if (confirming || !form.reportValidity()) return;
                confirming = true;
                refreshSelection();
                const submit = event.submitter;
                const results = form.querySelector('[data-delivery-confirm-result]');
                const dialogElement = form.closest('dialog');
                const amounts = new FormData(form);
                submit.disabled = true;
                const failed = [];
                let done = 0;
                for (const order of selected) {
                    if (!current() || !dialogElement.open || !form.isConnected) break;
                    results.textContent = `Confirming ${ref(order)}…`;
                    try {
                        await api('/shipping-labels/' + encodeURIComponent(order.pack_id) + '/packed', {
                            complete_sale:true, confirm_order_dispatch:order.id,
                            sale_amount:amounts.get(order.id) || ''
                        });
                        chosen.delete(order.id);
                        done++;
                    } catch (error) { failed.push({order,error}); }
                }
                confirming = false;
                if (!current()) return;
                await load();
                if (failed.length && dialogElement.open && form.isConnected) {
                    results.innerHTML = `<p>${done} dispatched. Review these orders before trying again.</p><ul>${failed.map(({order,error}) =>
                        `<li><strong translate="no">${escape(ref(order))}</strong> — ${escape(error.message)}</li>`).join('')}</ul>`+
                        '<button type="button" class="btn quiet" data-action="dispatch">Open Dispatch Centre</button>';
                    return;
                }
                if (dialogElement.open && form.isConnected) closeDialog();
                if (done) toast(`${done} ${done === 1 ? 'order' : 'orders'} marked as dispatched.`);
            });
        });
        return {load};
    }

    window.InventoryOrderDelivery = {mount,stages};
})();
