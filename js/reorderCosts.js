(function () {
    'use strict';
    const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
    const money = value => '£' + Number(value).toFixed(2);
    const perUnit = value => '£' + Number(value).toLocaleString('en-GB', {minimumFractionDigits:2, maximumFractionDigits:4});
    function totalCents(value) {
        if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(String(value).trim())) throw Error('Enter a total order cost with up to 2 decimal places.');
        const [whole, part = ''] = String(value).trim().split('.');
        const cents = BigInt(whole) * 100n + BigInt(part.padEnd(2, '0'));
        if (cents > 9999999999n) throw Error('The order cost is too large.');
        return cents;
    }
    function effectiveUnit(value, quantity) {
        const cents = totalCents(value), q = BigInt(quantity);
        const units = (cents * 100n + q / 2n) / q;
        return perUnit(Number(units) / 10000);
    }
    function estimated(rule) {
        if (rule.unit_cost === null || rule.unit_cost === undefined || rule.unit_cost === '') return '';
        const [whole, part = ''] = String(rule.unit_cost).split('.');
        const units = BigInt(whole) * 10000n + BigInt(part.padEnd(4, '0'));
        const cents = (units * BigInt(rule.quantity_to_order) + 50n) / 100n;
        return '<div class="hint reorder-estimate">Estimated order: <strong>' + money(Number(cents) / 100) + '</strong> · ' + perUnit(rule.unit_cost) + ' per unit</div>';
    }
    function enhanceOrders(orders, reload) {
        document.querySelectorAll('[data-delete-order]').forEach(button => {
            const order = orders.find(o => String(o.id) === button.dataset.deleteOrder);
            if (!order || order.status !== 'ordered') return;
            const box = document.createElement('form');
            box.className = 'reorder-cost-editor';
            const id = 'orderCost-' + order.id;
            box.innerHTML = '<label for="' + id + '">Total order cost (£)</label><div class="reorder-cost-actions"><input id="' + id + '" name="total_cost" type="number" inputmode="decimal" min="0" max="99999999.99" step="0.01" required value="' + esc(order.total_cost ?? '') + '" placeholder="Enter actual cost"><button type="submit" class="secondary">Save cost</button></div><p class="hint" data-unit-cost></p><p class="hint" data-cost-status role="status"></p>';
            const input = box.querySelector('input'), hint = box.querySelector('[data-unit-cost]'), status = box.querySelector('[data-cost-status]');
            function update() {
                try { hint.textContent = input.value === '' ? 'Add the cost before receiving to create its expense.' : effectiveUnit(input.value, order.quantity) + ' per unit · ' + order.quantity + ' units. Include any delivery charges in the total.'; }
                catch { hint.textContent = 'Enter a valid total cost.'; }
            }
            update(); input.oninput = update;
            box.onsubmit = async event => {
                event.preventDefault(); const save = box.querySelector('button');
                try {
                    totalCents(input.value); save.disabled = true; status.textContent = 'Saving cost…';
                    const result = await InventoryAPI.request('/reorder/orders/' + encodeURIComponent(order.id) + '/cost', {method:'PATCH', body:JSON.stringify({total_cost:input.value})});
                    if (!result.success) throw Error(result.error || 'Could not save order cost');
                    await reload();
                } catch (error) { status.textContent = error.message; }
                finally { save.disabled = false; }
            };
            button.closest('article').appendChild(box);
        });
    }
    function receiveList(orders) {
        return orders.map(order => '<div class="reorder-cost-editor"><strong>' + esc(order.item_name) + '</strong><p class="hint">Quantity ordered: ' + Number(order.quantity) + '</p><label for="receiveCost-' + order.id + '">Confirm total paid (£)</label><input id="receiveCost-' + order.id + '" data-receive-cost="' + order.id + '" type="number" inputmode="decimal" min="0" max="99999999.99" step="0.01" required value="' + esc(order.total_cost ?? '') + '" placeholder="Enter total paid"><p class="hint" data-receive-unit="' + order.id + '"></p></div>').join('') + '<p class="hint">Confirming adds stock to Holding and creates one expense per order. Then open Expenses to attach each receipt.</p><p id="receiveCostError" role="alert"></p>';
    }
    function bindReceive(orders) {
        orders.forEach(order => {
            const input = document.getElementById('receiveCost-' + order.id);
            const hint = document.querySelector('[data-receive-unit="' + order.id + '"]');
            const update = () => { try { hint.textContent = effectiveUnit(input.value, order.quantity) + ' per unit'; } catch { hint.textContent = 'Enter the actual cost to create the expense. Use 0 only for a free order.'; } };
            input.oninput = update; update();
        });
    }
    function receiveCosts(orders, ids) {
        return orders.filter(order => ids.includes(Number(order.id))).map(order => {
            const input = document.getElementById('receiveCost-' + order.id);
            try { totalCents(input.value); }
            catch { input.focus(); throw Error('Enter a valid total cost for ' + order.item_name + ' before confirming receipt.'); }
            return {order_id:Number(order.id), total_cost:input.value, expected_total_cost:order.total_cost ?? null};
        });
    }
    function expenseDetail(expense) {
        if (!expense.reorderOrderId) return '';
        return '<div class="expense-meta"><strong>Reorder received</strong> · Quantity ' + Number(expense.quantity) + ' · ' + perUnit(expense.unitCost) + ' per unit</div>';
    }
    const style = document.createElement('style');
    style.textContent = '.reorder-cost-editor{margin-top:14px;padding-top:12px;border-top:1px solid #ffffff24}.reorder-cost-editor label{display:block;font-weight:700;margin-bottom:7px}.reorder-cost-editor input{width:100%;min-width:0;background:var(--input-bg,#111);color:var(--text-color,#fff);border:1px solid #ffffff40;border-radius:9px;padding:11px;font-size:16px}.reorder-cost-actions{display:flex;gap:8px;flex-wrap:wrap}.reorder-cost-actions input{flex:1 1 130px}.reorder-cost-actions button{flex:0 0 auto}#receiveCostError{color:#ffb4ab}.modal{max-height:85dvh;overflow-y:auto}.reorder-estimate{margin-top:10px}';
    document.head.appendChild(style);
    window.ReorderCosts = {estimated, enhanceOrders, receiveList, bindReceive, receiveCosts, expenseDetail, esc};
})();
