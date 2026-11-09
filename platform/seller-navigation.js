(function () {
'use strict';

const { esc } = PlatformUI;
const paths = {
  shop: 'M4 4h16v12H4z M8 20h8 M12 16v4 M7 8h5 M7 11h3 M15 8h2v5h-2z',
  branches: 'M12 21s7-6 7-12a7 7 0 0 0-14 0c0 6 7 12 7 12z M15 9a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  catalogue: 'M4 6l8-4 8 4v12l-8 4-8-4z M4 6l8 4 8-4 M12 10v12 M8 4l8 4',
  orders: 'M7 5h10l2 16H5L7 5z M9 5V3h6v2 M9 12l2 2 4-4',
  cases: 'M8 5H4v4 M4 8a8 8 0 1 1 0 8 M14 8h-3a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4h-3 M12 7v10',
  external: 'M14 3h7v7 M21 3l-11 11 M10 5H4v15h15v-6',
  arrow: 'M5 12h13 M13 7l5 5-5 5',
  active: 'M7 17l10-10 M9 7h8v8'
};

function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]}"/></svg>`;
}

function render(data, active) {
  const { shop, branches = [], listings = [], orders = [] } = data;
  const live = shop?.published && !shop.suspended;
  const waiting = orders.some(order => order.provider !== 'demo' && order.payment_status === 'paid' &&
    order.state === 'pending' && !order.risk_state && !order.refunded_pence);
  const cases = orders.some(order => order.risk_state || order.payment_status === 'review');
  const tabs = [
    ['shop', 'Shop design', 'Make your shop feel like you.', live ? 'Published' : 'Make it yours', 'violet'],
    ['branches', 'Stock & delivery', 'Connect stock and set up collection.', branches.some(branch => branch.enabled) ? 'Connected' : 'Set up your branches', 'teal'],
    ['catalogue', 'Products', 'Photos, prices and your next sale.', listings.some(item => item.state === 'draft') ? 'Drafts to finish' : 'Build your collection', 'amber'],
    ['orders', 'Orders', 'Everything ready for its next home.', waiting ? 'Ready to prepare' : 'Pick, pack & fulfil', 'blue', waiting],
    ['cases', 'Refunds & cases', 'Keep customer payments in order.', cases ? 'Needs attention' : 'Refunds & payment issues', 'rose', cases]
  ];
  const state = shop?.suspended ? 'Shop paused' : live ? 'Storefront live' : 'Storefront draft';
  return `<section class="sn-workspace" aria-label="Shop workspace">
    <div class="sn-toolbar">
      <div class="sn-shop">
        <span class="sn-shop-mark">${icon('shop')}</span>
        <div><p class="sn-eyebrow">YOUR SELLER CENTRE</p><strong>${esc(shop?.name || 'A home for your next idea')}</strong></div>
      </div>
      <div class="sn-store-actions">
        <span class="sn-state ${live ? 'is-live' : ''}"><i></i>${state}</span>
        ${data.storefront_qr_version===1 ? '<button class="sn-storefront" type="button" data-print-storefront-qr>Print QR code</button>' : ''}
        ${live && data.test_purchase_version===1 ? `<a class="sn-storefront" href="/marche/?shop=${encodeURIComponent(shop.slug)}&amp;test-buy=1" target="_blank" rel="noopener">Test a purchase ${icon('external')}</a>` : ''}
        ${live
          ? `<a class="sn-storefront" href="/marche/${encodeURIComponent(shop.slug)}">View storefront ${icon('external')}</a>`
          : '<span class="sn-draft-note">Preview in Shop design</span>'}
      </div>
    </div>
    <div class="sn-tabs" role="tablist" aria-label="Seller sections">
      ${tabs.map(([key, title, detail, hint, tone, needsAction]) => {
        const chosen = key === active;
        const disabled = !shop && key !== 'shop';
        return `<button type="button" id="seller-tab-${key}" class="sn-tab sn-${tone}" role="tab" data-seller-tab="${key}"
          aria-controls="pf-seller-view" aria-selected="${chosen}" aria-labelledby="seller-title-${key}"
          aria-describedby="seller-detail-${key} seller-hint-${key}" tabindex="${chosen ? 0 : -1}" ${disabled ? 'disabled' : ''}>
          <span class="sn-tab-top"><span class="sn-icon">${icon(key)}</span><span class="sn-indicator" aria-hidden="true">${icon(chosen ? 'active' : 'arrow')}</span></span>
          <strong id="seller-title-${key}">${esc(title)}</strong>
          <span class="sn-description" id="seller-detail-${key}">${esc(detail)}</span>
          <span class="sn-hint ${needsAction ? 'has-action' : ''}" id="seller-hint-${key}">${esc(hint)}</span>
        </button>`;
      }).join('')}
    </div>
  </section>`;
}

function bind(host, onSelect) {
  const tabs = [...host.querySelectorAll('[data-seller-tab]:not(:disabled)')];
  const direction = { ArrowRight: 1, ArrowLeft: -1 };
  for (const [index, tab] of tabs.entries()) {
    tab.onclick = () => {
      if (tab.getAttribute('aria-selected') === 'true') return;
      const key = tab.dataset.sellerTab;
      onSelect(key);
      const next = document.getElementById('seller-tab-' + key);
      next?.focus({ preventScroll: true });
      next?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    };
    tab.onkeydown = event => {
      const key = event.key;
      let next;
      if (key === 'Home') next = tabs[0];
      else if (key === 'End') next = tabs.at(-1);
      else if (Object.hasOwn(direction, key)) next = tabs[(index + direction[key] + tabs.length) % tabs.length];
      else return;
      event.preventDefault();
      next.click();
    };
  }
}

window.SellerNavigation = { render, bind };
})();
