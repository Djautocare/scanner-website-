(function () {
  'use strict';
  let sheet = null;
  function prepare() {
    if (sheet) return;
    const receipt = document.querySelector('#retailDialog[open] .retail-receipt');
    if (!receipt) return;
    // Print a fresh copy outside the scrolling, centred modal. Mobile print
    // previews must not inherit the dialog's viewport height or scroll offset.
    sheet = document.createElement('div');
    sheet.id = 'retailPrintSheet';
    sheet.setAttribute('aria-hidden', 'true');
    sheet.append(receipt.cloneNode(true));
    document.body.append(sheet);
    document.body.classList.add('retail-printing-receipt');
  }
  function cleanup() {
    sheet?.remove();
    sheet = null;
    document.body.classList.remove('retail-printing-receipt');
  }
  window.addEventListener('beforeprint', prepare);
  window.addEventListener('afterprint', cleanup);
  window.InventoryRetailPrint = { print() {
    prepare();
    try { window.print(); } catch (error) { cleanup(); throw error; }
  } };
})();
