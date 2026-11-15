(() => {
  'use strict';
  function activeScope() {
    return [localStorage.getItem('inventoryos_selected_workspace_id'), InventoryAPI.getSelectedInventoryHeader()].join('|');
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-dispatch-invoice]');
    if (!button || button.disabled) return;
    const reference = button.dataset.dispatchInvoice;
    if (!/^[1-9]\d{0,9}$/.test(reference)) return;
    const initialScope = activeScope();
    const request = async (body, suffix = '') => {
      if (activeScope() !== initialScope) throw Error('The active inventory changed. Open the parcel invoice again.');
      const path = '/workspace-orders/packing/' + reference + '/invoice' + suffix;
      const result = await InventoryAPI.request(path, body ? { method: 'POST', body: JSON.stringify(body) } : { cache: 'no-store' });
      if (activeScope() !== initialScope) throw Error('The active inventory changed. Open the parcel invoice again.');
      if (!result?.success || !result.invoice) throw Error(result?.error || 'Could not open the parcel invoice.');
      return result;
    };
    InventorySaleInvoice.open({ reference, load: () => request(), submit: (_, body) => request(body), record: (_, body) => request(body, '/account') });
  });
})();
