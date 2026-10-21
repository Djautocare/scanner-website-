(function () {
  'use strict';
  if (window.InventoryRetail) return;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let generation = 0;
  function headers() { return { 'X-Workspace-Id': localStorage.getItem('inventoryos_selected_workspace_id') || '' }; }
  function navigation(s) {
    document.querySelectorAll('.ios-shell-nav[aria-label="Workspace"],.sidebar-nav[aria-label="Main navigation"]').forEach(nav => {
      let link = nav.querySelector('[data-retail-nav]');
      if (!link && s.active) {
        link = document.createElement('a'); link.href = 'retail/index.html'; link.dataset.retailNav = '';
        link.className = nav.classList.contains('ios-shell-nav') ? 'ios-shell-nav-link' : 'sidebar-link';
        link.innerHTML = '<span aria-hidden="true">▦</span> <span>Retail</span>'; nav.append(link);
      }
      if (link) { link.hidden = !s.active; link.style.display = s.active ? '' : 'none'; }
    });
  }
  function settings(s) {
    const grid = document.querySelector('.settings-grid'); if (!grid) return;
    let card = document.getElementById('retailSettingsCard');
    if (!card) { card = document.createElement('div'); card.id = 'retailSettingsCard'; card.className = 'card'; card.style.borderLeft = '3px solid var(--accent)'; grid.prepend(card); }
    const admin = ['owner', 'admin'].includes(s.role);
    card.innerHTML = '<div class="card-title">Retail mode</div><p class="helper">A separate shop layout with fixed prices, deliveries, low-stock reports, cash checkout and till balancing. Retail stock is separate from reseller and manufacturing stock.</p>' + (s.success ?
      '<label style="display:flex;gap:12px;align-items:center;margin:16px 0"><input id="retailModeToggle" type="checkbox" role="switch" ' + (s.enabled ? 'checked ' : '') + (!admin || (!s.allowed && !s.enabled) ? 'disabled' : '') + '> Enable for this workspace</label><p class="helper">' + (!s.allowed ? 'Activate a Retail subscription or trial in Stores & tills.' : !admin ? 'The workspace owner or an admin can change this setting.' : 'Off by default. This applies to everyone in this workspace. Your other InventoryOS areas remain available.') + '</p>' + (s.active ? '<a href="retail/index.html">Open Retail</a>' : '') : '<p class="helper">Install the Retail backend update to make this available.</p>') + '<p><a href="retail/manage.html">Stores, tills & Retail billing</a></p><p id="retailSettingsResult" role="status"></p>';
    card.querySelector('#retailModeToggle')?.addEventListener('change', async event => {
      const toggle = event.target; toggle.disabled = true;
      const r = await InventoryAPI.request('/retail/settings', { method: 'PATCH', headers: headers(), body: JSON.stringify({ request_id: crypto.randomUUID(), enabled: toggle.checked }) });
      if (!r.success) { toggle.checked = s.enabled; toggle.disabled = false; card.querySelector('#retailSettingsResult').textContent = r.error || 'Could not change Retail mode'; return; }
      refresh();
    });
  }
  async function refresh() {
    if (typeof InventoryAPI === 'undefined' || !InventoryAPI.isLoggedIn()) return;
    const g = ++generation; const s = await InventoryAPI.request('/retail/status', { headers: headers() });
    if (g !== generation) return;
    navigation(s); settings(s);
    window.dispatchEvent(new CustomEvent('inventoryos-retail-status', { detail: s }));
  }
  window.InventoryRetail = { refresh, headers, escapeHtml: esc };
  window.addEventListener('inventory-selection-changed', refresh);
  window.addEventListener('inventoryos-shell-ready', refresh);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh, { once: true }); else refresh();
})();
