(function () {
'use strict';

function link(shopId) {
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(String(shopId || ''))) return '';
  return 'https://app.inventoryos.co.uk/marche/?shop-id=' + shopId.toLowerCase();
}

function svg(url) {
  const writer = window.ZXingBrowser?.BrowserQRCodeSvgWriter;
  if (!writer) throw Error('The QR tools did not load. Refresh the page and try again.');
  const code = new writer().write(url, 256, 256);
  code.setAttribute('viewBox', '0 0 256 256');
  code.setAttribute('role', 'img');
  code.setAttribute('aria-label', 'QR code to this Mi Marché storefront');
  code.style.background = '#fff';
  code.querySelectorAll('rect').forEach(rect => rect.setAttribute('fill', '#000'));
  return code;
}

function appendReceipt(host, shopId) {
  const url = link(shopId);
  if (!host || !url) return;
  try {
    const section = document.createElement('section');
    section.style.cssText = 'margin:12px 0 0;text-align:center;break-inside:avoid;';
    const caption = document.createElement('p');
    caption.textContent = 'Scan to shop again';
    const code = svg(url);
    code.style.cssText = 'display:block;width:25mm;height:25mm;margin:3px auto;background:#fff;';
    section.append(caption, code);
    host.append(section);
  } catch (error) {
    // A receipt is still printable if the optional QR library failed to load.
    console.warn('Storefront receipt QR unavailable:', error.message);
  }
}

window.InventoryStorefrontQR = { link, svg, appendReceipt };
})();
