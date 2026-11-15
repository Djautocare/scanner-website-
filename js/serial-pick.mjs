/** Request a pick only after the stock transaction supplies its locked serial list. */
export function pickSerials(plan) {
  return new Promise(resolve => {
    const dialog = document.createElement('dialog');
    dialog.setAttribute('aria-label','Choose serial numbers');
    const title = document.createElement('h2');
    title.textContent = 'Choose serial numbers';
    const summary = document.createElement('p');
    summary.textContent = `${plan.location ? plan.location + ' · ' : ''}${plan.qty} units moving. Select ${plan.minimum === plan.qty ? plan.qty : plan.minimum + ' to ' + plan.qty} serials.`;
    const label = document.createElement('label');
    label.textContent = 'Scan or type a serial number ';
    const scanner = document.createElement('input');
    scanner.type = 'search';
    scanner.autocomplete = 'off';
    label.append(scanner);
    const field = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = 'Tracked units';
    field.append(legend);
    const list = plan.units.map(unit => {
      const row = document.createElement('label');
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.value = unit.id;
      row.append(check, document.createTextNode(' ' + unit.serial));
      field.append(row, document.createElement('br'));
      return { check, serial: unit.serial };
    });
    const form = document.createElement('form');
    const status = document.createElement('p');
    status.setAttribute('role','status');
    const accept = document.createElement('button');
    accept.type = 'submit';
    accept.textContent = 'Confirm serials';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    cancel.onclick = () => dialog.close();
    function selected() { return list.filter(unit => unit.check.checked).map(unit => unit.check.value); }
    function update() {
      const count = selected().length;
      status.textContent = `${count} serial${count===1?'':'s'} selected`;
      accept.disabled = count < plan.minimum || count > plan.qty;
    }
    field.addEventListener('change', update);
    scanner.addEventListener('keydown', event => {
      if(event.key !== 'Enter')return;
      event.preventDefault();
      const unit = list.find(item=>item.serial.toLowerCase()===scanner.value.trim().toLowerCase());
      if(!unit){status.textContent='This serial is outside the units available for this move.';return;}
      if(!unit.check.checked&&selected().length>=plan.qty){status.textContent='The selected serials already cover this quantity.';return;}
      unit.check.checked=true;
      scanner.value='';
      update();
    });
    let result = null;
    form.onsubmit = event => { event.preventDefault(); if(!accept.disabled){result=selected();dialog.close();} };
    dialog.addEventListener('close', () => { dialog.remove(); resolve(result); }, {once:true});
    form.append(label,field,status,accept,cancel);
    dialog.append(title,summary,form);
    document.body.append(dialog);
    update();
    dialog.showModal();
    scanner.focus();
  });
}
