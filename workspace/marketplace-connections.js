(() => {
  'use strict';
  const route='/workspace-orders/integrations';
  const providers={ebay:'eBay',vinted:'Vinted Pro',inpost:'InPost', 'royal-mail':'Royal Mail'};
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const button=(label,attr)=>`<button type="button" class="btn quiet" ${attr}>${label}</button>`;
  const hidden=(name,value)=>`<input type="hidden" name="${name}" value="${escape(value)}">`;
  const field=(name,label,attrs)=>`<label class="workspace-field">${label}<input name="${name}" ${attrs}></label>`;
  const option=(value,label)=>`<option value="${escape(value)}">${escape(label)}</option>`;
  const statusText=state=>state?.active?'Enabled':state?'Paused':'Available';

  async function show({api,dialog,inventories}){
    const scope=()=>[localStorage.getItem('inventoryos_selected_workspace_id'),InventoryAPI.getSelectedInventoryHeader()].join('|');
    const initial=scope();
    const [data,stock]=await Promise.all([api(route),api('/products')]);
    if(initial!==scope())throw Error('The selected inventory changed. Reopen Marketplace & couriers.');
    let current;
    const items=data.connections||[];
    const inventoryOptions=inventories.map(item=>option(item.id,item.name)).join('');
    function accountForm(provider){
      const inventory=['ebay','vinted'].includes(provider)?`<label class="workspace-field">Import orders to
        <select name="inventory_id" required><option value="">Choose a selected inventory</option>${inventoryOptions}</select></label>`:'';
      const credentials={
        ebay:'',
        vinted:field('access_token','Vinted Pro access token','required type="password" maxlength="2048" autocomplete="new-password"'),
        inpost:field('secret','InPost webhook signing secret','required type="password" minlength="16" maxlength="2048" autocomplete="new-password"')+
          '<label><input name="timestamp" type="checkbox"> InPost signed timestamp and body</label>',
        'royal-mail':field('client','Royal Mail client ID','required type="password" autocomplete="new-password"')+
          field('secret','Royal Mail client secret','required type="password" autocomplete="new-password"')
      };
      const options=['vinted','royal-mail'].includes(provider)?'<label><input name="sandbox" type="checkbox"> Use provider sandbox</label>':'';
      const copy=provider==='inpost'?'<p class="muted">Register the endpoint below in your InPost account with HMAC signature verification.</p>'+
        '<p class="connection-url" translate="no">'+escape(InventoryAPI.API_BASE+data.webhook_path)+'</p>':'';
      const label=provider==='ebay'?'Continue to eBay to authorise read-only access':'Save connection';
      return `<form class="business-form" data-connection-form="${provider}">${hidden('provider',provider)}${inventory}${credentials[provider]}${options}${copy}
        <button type="submit" class="btn primary">${label}</button></form>`;
    }
    function account(provider,name){
      const row=items.find(item=>item.provider===provider), disabled=provider==='ebay'&&!data.ebay_ready;
      const connectedActions=row?button(row.active?'Pause':'Enable','data-connection-action="'+(row.active?'pause':'activate')+'" data-provider="'+provider+'"')+
        (row.active&&provider!=='inpost'?button('Check now','data-connection-action="sync" data-provider="'+provider+'"'):'')+
        button('Disconnect','data-connection-action="disconnect" data-provider="'+provider+'"'):'';
      return `<section class="business-section"><h3>${name}</h3><p>${statusText(row)}${row?.last_checked_at?' · Last checked '+escape(new Date(row.last_checked_at).toLocaleString()):''}</p>
        ${row?.last_error?'<p class="muted">'+escape(row.last_error)+'</p>':''}${connectedActions}
        ${disabled?'<p class="muted">The eBay application needs configuring on the backend.</p>':
          `<details><summary>${row?'Replace connection':'Connect '+name}</summary>${accountForm(provider)}</details>`}</section>`;
    }
    function review(issue){
      const products=(stock.products||[]).filter(item=>item.inventory_id===issue.inventory_id);
      const choices=products.map(item=>option(item.id,item.description+' · '+item.barcode)).join('');
      return `<details class="business-section"><summary>${escape(providers[issue.provider])} · ${escape(issue.external_id)}</summary><p>${escape(issue.reason)}</p>
        <form data-connection-review>${hidden('provider',issue.provider)}${hidden('reference',issue.external_id)}
        ${issue.summary.lines.map(line=>`<label class="workspace-field">${escape(line.title||line.sku)} × ${line.qty}
          <select name="product_id"><option value="">Use SKU match</option>${choices}</select></label>`).join('')}
        <button class="btn primary" type="submit">Try import again</button></form></details>`;
    }
    dialog('Marketplace and courier connections', data.enabled?
      '<p class="muted">Connected marketplaces import orders into the packing workflow as drafts. Courier connections update saved tracking numbers.</p>'+
      Object.entries(providers).map(([key,name])=>account(key,name)).join('')+
      ((data.issues||[]).length?'<h3>Marketplace orders to review</h3>'+data.issues.map(review).join(''):'')+
      '<p role="status" data-connection-message></p>':'<p>The server needs its integrations encryption key before connecting an account.</p>');
    const root=document.getElementById('dialog-content');
    function setStatus(message){const node=root.querySelector('[data-connection-message]');if(node)node.textContent=message;}
    async function perform(button, action){
      if(current||initial!==scope())return;
      current=true;button.disabled=true;setStatus('Working…');
      try{await action();}
      catch(error){setStatus(error.message);}
      finally{current=false;if(button.isConnected)button.disabled=false;}
    }
    root.querySelectorAll('[data-connection-form]').forEach(form=>form.onsubmit=event=>{
      event.preventDefault();
      const fields=new FormData(form), body=Object.fromEntries(fields);
      body.sandbox=fields.has('sandbox');body.timestamp=fields.has('timestamp');
      return perform(event.submitter,async()=>{
        if(body.provider==='ebay'){
          const response=await api(route+'/ebay/start',{inventory_id:body.inventory_id});
          const url=new URL(response.url);
          if(url.protocol!=='https:'||!['auth.ebay.com','auth.sandbox.ebay.com'].includes(url.host))throw Error('The eBay sign-in address is invalid.');
          const next=document.createElement('a');
          next.href=url.href;next.target='_blank';next.rel='noopener noreferrer';next.textContent='Open eBay sign-in';
          root.querySelector('[data-connection-message]').replaceChildren(next,
            document.createTextNode(' · Return here after authorising to enable the connection.'));
        }else{
          await api(route+'/settings',{...body,action:'connect'});
          form.reset();
          await show({api,dialog,inventories});
          setStatus('Connection saved. Enable it when you’re ready.');
        }
      });
    });
    root.querySelectorAll('[data-connection-action]').forEach(button=>button.onclick=()=>{
      const action=button.dataset.connectionAction, provider=button.dataset.provider;
      if(action==='disconnect'&&!confirm('Disconnect this provider? Previously imported orders and the tracking history will remain.'))return;
      return perform(button,async()=>{
        const response=await api(route+(action==='sync'?'/sync':'/settings'),{action,provider});
        await show({api,dialog,inventories});
        if(action==='sync')setStatus(response.updated?response.updated+' updates saved.':'No new matching updates were found.');
      });
    });
    root.querySelectorAll('[data-connection-review]').forEach(form=>form.onsubmit=event=>{
      event.preventDefault();
      const fields=new FormData(form), products=fields.getAll('product_id').map(value=>value||null);
      return perform(event.submitter,async()=>{
        const response=await api(route+'/retry',{provider:fields.get('provider'),reference:fields.get('reference'),products});
        await show({api,dialog,inventories});
        setStatus(response.updated?'Draft order saved.':'This order still needs review.');
      });
    });
  }
  window.InventoryMarketplaceConnections={show};
})();
