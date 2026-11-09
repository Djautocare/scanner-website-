(function () {
'use strict';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = value => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format((value || 0) / 100);
const datetime = value => value ? new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/London'
}).format(new Date(value)) : '';
const date = value => value ? datetime(value + 'T12:00:00Z').split(',')[0] : '';
const sum = (lines, key) => lines.reduce((n, l) => n + (l[key] || 0), 0);
const formField = (label, name, value = '', attrs = '') =>
  `<label>${label}<input name="${name}" value="${esc(value)}" ${attrs}></label>`;
const textarea = (label, name, value = '', attrs = '') =>
  `<label>${label}<textarea name="${name}" rows="2" ${attrs}>${esc(value)}</textarea></label>`;
const logoPattern = /^data:image\/(?:webp|png|jpeg);base64,[A-Za-z0-9+/]+=*$/;
const taxLabel = item => ({ exempt: 'Exempt', outside_scope: 'Outside scope', zero_rated: '0%' })[item.vat_treatment] ??
  (item.vat_rate == null ? '—' : item.vat_rate + '%');
function totalsRow(label, value) {
  return `<div><dt>${esc(label)}</dt><dd>${money(value)}</dd></div>`;
}
function render(paper, invoice) {
  const { seller, buyer, lines } = invoice;
  const vat = Boolean(seller.vat_number);
  const qr = window.InventoryStorefrontQR?.link(invoice.storefront_id);
  const net = sum(lines, 'net_pence'), vatTotal = sum(lines, 'vat_pence');
  const displayLogo = logoPattern.test(seller.logo || '') ? `<img class="io-invoice-logo" src="${esc(seller.logo)}" alt="Company logo">` : '';
  const meta = [
    ['Invoice no.', invoice.number || (invoice.test ? 'TEST' : 'Assigned on issue')],
    ['Issued', datetime(invoice.issued_at) || 'On issue'],
    ['Order no.', invoice.order], ['Receipt no.', invoice.receipt], ['Sale time', datetime(invoice.sold_at)],
    [vat ? 'Tax point' : 'Supply date', date(invoice.supply_date)]
  ];
  const taxGroups = new Map();
  if (vat) for (const item of lines) {
    const label = taxLabel(item);
    const group = taxGroups.get(label) || { net: 0, vat: 0 };
    group.net += item.net_pence;
    group.vat += item.vat_pence;
    taxGroups.set(label, group);
  }
  paper.innerHTML = `
    <header class="io-invoice-head">
      <div>${displayLogo}<strong class="io-invoice-company">${esc(seller.name || 'Business name')}</strong>
      ${seller.trading_name ? `<div>Trading as ${esc(seller.trading_name)}</div>` : ''}
      <div class="io-invoice-lines">${esc(seller.address || 'Business address')}</div>
      <div class="io-invoice-lines">${esc(seller.contact)}</div>
      ${vat ? `<div>VAT registration ${esc(seller.vat_number)}</div>` : ''}</div>
      <div><h2>${invoice.test ? 'Test invoice' : vat ? 'VAT invoice' : 'Invoice'}</h2>
      <dl class="io-invoice-meta">${meta.filter(([, value]) => value).map(([key, value]) =>
        `<div><dt>${key}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl></div>
    </header>
    ${invoice.test ? '<p class="io-invoice-test">TEST ORDER · SAMPLE DOCUMENT</p>' : ''}
    <section class="io-invoice-buyer"><span>Bill to</span><strong>${esc(buyer.name || 'Customer name')}</strong>
      <div class="io-invoice-lines">${esc(buyer.address || 'Billing address')}</div></section>
    <table class="io-invoice-items"><thead><tr><th scope="col">Description</th><th scope="col">Qty</th>
      <th scope="col">Unit${vat ? ' excl. VAT' : ' price'}</th>${vat ? '<th scope="col">VAT</th>' : ''}
      <th scope="col">${vat ? 'Net amount' : 'Amount'}</th></tr></thead>
    <tbody>${lines.map(item => `<tr><td>${esc(item.title)}${item.discount_pence ? `<small>Discount ${money(item.discount_pence)}
      ${vat ? '(incl. VAT)' : ''} · ${(item.discount_pence / (item.qty * item.unit_pence) * 100).toFixed(2)}%</small>` : ''}</td>
      <td>${item.qty}</td><td>${money(vat ? item.unit_net_pence ?? item.net_pence / item.qty : item.unit_pence)}</td>
      ${vat ? '<td>' + taxLabel(item) + '</td>' : ''}<td>${money(vat ? item.net_pence : item.gross_pence)}</td></tr>`).join('')}</tbody></table>
    <div class="io-invoice-bottom">
      <div>${vat ? `<div class="io-invoice-tax"><strong>VAT breakdown</strong>${[...taxGroups].map(([label, group]) =>
        `<div>${label} · ${money(group.net)} net · ${money(group.vat)} VAT</div>`).join('')}</div>` : ''}
      ${invoice.notes ? `<div class="io-invoice-lines io-invoice-notes">${esc(invoice.notes)}</div>` : ''}
      ${invoice.deposit_vat_pence ? `<small>VAT previously recorded on deposits ${money(invoice.deposit_vat_pence)}</small>` : ''}</div>
      <dl class="io-invoice-totals">
        ${totalsRow(vat ? 'Subtotal excluding VAT' : 'Subtotal', vat ? net : sum(lines, 'gross_pence'))}
        ${vat ? totalsRow('VAT', vatTotal) : ''}
        ${invoice.tip_pence ? totalsRow('Tip', invoice.tip_pence) : ''}
        <div class="io-invoice-total"><dt>Total</dt><dd>${money(invoice.paid_pence)}</dd></div>
        ${invoice.deposit_pence ? totalsRow('Deposit applied', invoice.deposit_pence) : ''}
        ${invoice.exchange_pence ? totalsRow('Exchange credit applied', invoice.exchange_pence) : ''}
        ${totalsRow(invoice.test ? 'Test payment' : 'Paid / settled', invoice.paid_pence)}
        ${totalsRow('Amount due', 0)}
      </dl>
    </div>
    ${qr ? `<footer class="io-invoice-qr"><div data-invoice-qr></div><div><strong>Shop with us again</strong><br>
      <a href="${esc(qr)}">Scan the QR code or open our Mi Marché shop</a></div></footer>` : ''}
  `;
  if (qr) {
    try { paper.querySelector('[data-invoice-qr]').append(window.InventoryStorefrontQR.svg(qr)); }
    catch { /* The storefront link remains available if QR assets are unavailable. */ }
  }
}

let finishPreviousPrint = () => {};
function printInvoice(paper, number) {
  const output = paper.cloneNode(true);
  output.classList.add('io-invoice-paper-output');
  finishPreviousPrint();
  document.body.append(output);
  const title = document.title;
  document.title = number ? 'Invoice ' + number : 'Mi Marché sample invoice';
  const cleanup = () => { window.removeEventListener('afterprint', cleanup); output.remove(); document.title = title; };
  finishPreviousPrint = cleanup;
  window.addEventListener('afterprint', cleanup, { once: true });
  try { window.print(); }
  catch (error) { cleanup(); throw error; }
}

function open({ load, submit, reference = '' }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'io-invoice-dialog';
  dialog.setAttribute('aria-label', 'Invoice creator');
  dialog.innerHTML = `<header><div><span>InventoryOS · Sales documents</span><h2>Invoice creator</h2></div>
    <button type="button" data-close aria-label="Close invoice creator">Close</button></header>
    <div class="io-invoice-content"></div><p class="io-invoice-status" role="status"></p>`;
  document.body.append(dialog);
  dialog.querySelector('[data-close]').onclick = () => dialog.close();
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  const host = dialog.querySelector('.io-invoice-content');
  const status = dialog.querySelector('.io-invoice-status');
  const say = (message, error = false) => { status.textContent = message; status.classList.toggle('error', error); };
  let ref = reference;
  let selectedLogo = '';
  let removeLogo = false;
  let busy = false;
  function mount(result) {
    const { invoice } = result;
    const issued = Boolean(invoice.number);
    host.innerHTML = `<div class="io-invoice-layout ${issued ? 'is-issued' : ''}">
      ${issued ? `<div class="io-invoice-issued"><strong>Issued invoice ${esc(invoice.number)}</strong>
        <p>${result.source_changed ? 'The sale changed after issue. This is the original invoice. Any credit note is issued separately.' : 'Saved with the original sale.'}</p>
        <button type="button" data-print>Print / save PDF</button></div>` : `
      <form class="io-invoice-form">
        <p>${invoice.test ? 'This is a sample. No invoice number is allocated.' : 'Check the billing details and supply date. Issuing saves a numbered copy against this sale.'}</p>
        <fieldset><legend>From your business</legend>
          ${formField('Legal business name', 'seller_name', invoice.seller.name, 'required maxlength="160"')}
          ${formField('Trading name (optional)', 'trading_name', invoice.seller.trading_name, 'maxlength="120"')}
          ${textarea('Business address', 'seller_address', invoice.seller.address, 'required maxlength="500"')}
          ${formField('Business email or phone', 'seller_contact', invoice.seller.contact, 'required maxlength="200"')}
          <label>Company logo <input type="file" name="logo" accept="image/png,image/jpeg,image/webp"></label>
          <button type="button" data-remove-logo>Remove logo</button>
          ${invoice.vat_allowed ? formField('VAT number' + (invoice.vat_required ? '' : ' (if registered)'), 'vat_number', invoice.seller.vat_number,
            (invoice.vat_required ? 'required ' : '') + 'maxlength="16"') : ''}
        </fieldset>
        <fieldset><legend>Bill to</legend>
          ${formField('Customer or company name', 'buyer_name', invoice.buyer.name, 'required maxlength="160"')}
          ${textarea('Customer billing address', 'buyer_address', invoice.buyer.address, 'required maxlength="500"')}
          ${formField('Supply date', 'supply_date', invoice.supply_date, 'type="date" required')}
          ${invoice.shipping_tax_needed ? `<label>Delivery VAT (if VAT registered)<select name="shipping_tax">
             <option value="">Choose treatment</option><option value="standard">20% standard</option><option value="reduced">5% reduced</option>
             <option value="zero">0% zero-rated</option><option value="exempt">Exempt</option><option value="outside">Outside scope</option></select></label>` : ''}
          ${textarea('Invoice notes (optional)', 'notes', '', 'maxlength="600"')}
        </fieldset>
        <div class="io-invoice-actions">
          <button type="submit" value="preview">${invoice.test ? 'Preview and print sample' : 'Check preview'}</button>
          ${invoice.test ? '' : '<button type="submit" value="issue" class="io-invoice-primary">Issue invoice</button>'}
        </div>
      </form>`}
      <div class="io-invoice-stage"><span>${issued ? 'Print layout · A4' : 'Live preview · A4'}</span>
        <article class="io-invoice-paper" aria-label="Invoice preview"></article></div></div>`;
    const paper = host.querySelector('.io-invoice-paper');
    render(paper, invoice);
    if (issued) { host.querySelector('[data-print]').onclick = () => printInvoice(paper, invoice.number); return; }
    const form = host.querySelector('form');
    let effective = invoice;
    const values = () => {
      const { logo, ...fields } = Object.fromEntries(new FormData(form));
      return fields;
    };
    const update = () => {
      const fields = values();
      const seller = { ...effective.seller, name: fields.seller_name, trading_name: fields.trading_name, address: fields.seller_address,
        contact: fields.seller_contact, vat_number: fields.vat_number, logo: removeLogo ? '' : selectedLogo || invoice.seller.logo };
      const buyer = { name: fields.buyer_name, address: fields.buyer_address };
      render(paper, { ...effective, seller, buyer, supply_date: fields.supply_date, notes: fields.notes });
    };
    form.addEventListener('input', event => { if (event.target.type !== 'file') update(); });
    form.elements.logo.onchange = () => {
      const file = form.elements.logo.files[0];
      if (!file) return;
      if (file.size > 4 * 1024 * 1024 || !['image/png','image/jpeg','image/webp'].includes(file.type)) {
        form.elements.logo.value = ''; say('Choose a PNG, JPEG or WebP logo under 4 MB.', true); return;
      }
      const reader = new FileReader();
      reader.onload = () => { selectedLogo = String(reader.result); removeLogo = false; say(''); update(); };
      reader.onerror = () => say('The logo could not be opened.', true);
      reader.readAsDataURL(file);
    };
    form.querySelector('[data-remove-logo]').onclick = () => {
      selectedLogo = ''; form.elements.logo.value = ''; removeLogo = true; update();
    };
    form.onsubmit = async event => {
      event.preventDefault();
      if (busy) return;
      busy = true;
      const buttons = [...form.querySelectorAll('button[type=submit]')];
      buttons.forEach(button => button.disabled = true);
      say('Checking the original sale…');
      try {
        const action = event.submitter?.value || 'preview';
        const saved = await submit(ref, { ...values(), logo: selectedLogo.split(',')[1], remove_logo: removeLogo, action });
        if (!dialog.open) return;
        if (saved.invoice.number) { mount(saved); say('Invoice issued. You can print or save it as a PDF.'); }
        else {
          effective = saved.invoice; render(paper, effective);
          say(effective.test ? 'Sample invoice ready.' : 'Preview checked. Review the details before issuing.');
          if (effective.test) printInvoice(paper);
        }
      } catch (error) { say(error.message, true); }
      finally { busy = false; buttons.forEach(button => button.disabled = false); }
    };
  }
  async function find() {
    say('Finding the original sale…');
    try { const result = await load(ref); if (dialog.open) { mount(result); say(''); } }
    catch (error) { say(error.message, true); }
  }
  if (!reference) {
    host.innerHTML = `<form class="io-invoice-import">
      <p>Enter a receipt number from the selected Retail store. Its saved items, prices and any VAT will be imported.</p>
      ${formField('Receipt number', 'receipt', '', 'required maxlength="40" placeholder="RT-YYYYMMDD-XXXXXXXX"')}
      <button type="submit" class="io-invoice-primary">Import receipt</button></form>`;
    host.querySelector('form').onsubmit = async event => {
      event.preventDefault();
      const button = event.submitter;
      if (button) button.disabled = true;
      ref = event.currentTarget.elements.receipt.value.trim();
      await find();
      if (button) button.disabled = false;
    };
  }
  dialog.showModal();
  if (reference) find();
}

window.InventorySaleInvoice = { open };
})();
