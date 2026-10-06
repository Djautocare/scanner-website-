(function(){
    "use strict";
    const root=document.querySelector("[data-inbound-labels]");
    if(!root)return;
    let data=null, requestId=0, pending=false, seenImports="", poll;
    const escape=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
    const labels={queued:"Waiting to import",processing:"Processing labels",retry:"Retrying automatically",locked:"Import blocked",failed:"Import failed",no_labels:"No label attachments",setup_received:"Forwarding confirmation received",completed:"Imported",completed_with_skips:"Completed with skipped files"};
    const workspace=()=>localStorage.getItem("inventoryos_selected_workspace_id")||"";
    function message(text,error=false){const el=root.querySelector(".inbound-message");if(el){el.textContent=text;el.className="inbound-message "+(error?"error":"success");}}
    function recent(){
        if(!data.recent?.length)return '<p class="inbound-empty">No emails received yet. Send a test or forward a shipping-label email to get started.</p>';
        return '<ul class="inbound-activity">'+data.recent.map(event=>'<li><div><strong>'+escape(event.subject)+'</strong><small>'+escape(labels[event.status]||event.status)+(event.imported_count?' · '+Number(event.imported_count)+' labels':'')+(event.duplicate_count?' · '+Number(event.duplicate_count)+' duplicates skipped':'')+(event.skipped_count?' · '+Number(event.skipped_count)+' unsupported files skipped':'')+(event.error_code==='PLAN_LOCKED'?' · Pro or Business required':event.error_code==='ADDRESS_REGENERATED'?' · Sent to an old address':'')+'</small>'+(event.setup_text?'<details><summary>Forwarding confirmation (owner/admin only)</summary><p>Use the code or Google URL below to confirm forwarding in your email provider. This message expires here after seven days.</p><pre class="inbound-setup-text">'+escape(event.setup_text)+'</pre></details>':'')+'</div><time>'+escape(new Date(event.created_at).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}))+'</time></li>').join('')+'</ul>';
    }
    function render(){
        const active=data.allowed&&data.address;
        const badge=!data.allowed?'Pro & Business':active?'Active':'Pro & Business';
        root.innerHTML='<div class="inbound-heading"><div><h2>Email Shipping Labels to InventoryOS</h2><p>Forward shipping-label emails and attachments directly into your Dispatch Centre.</p></div><span class="inbound-badge">'+badge+'</span></div>'+
            (!data.allowed?'<div class="inbound-locked"><strong>Available with Pro and Business</strong><p>Your workspace needs an active Pro or Business plan to import labels by email.'+(data.address?' Your address is saved but locked. Upgrading reactivates the same address.':'')+'</p><a class="inbound-upgrade" href="billing.html">View plans</a></div>':
            data.address?'<label class="inbound-note" for="inboundAddress">Shared workspace address</label><div class="inbound-address-row"><input id="inboundAddress" readonly value="'+escape(data.address)+'" aria-label="Workspace shipping-label email address"><button type="button" data-inbound-action="copy" class="inbound-primary">Copy address</button></div><div class="inbound-actions">'+(data.can_manage?'<button type="button" data-inbound-action="test" '+(!data.configured?'disabled':'')+'>Send test</button><button type="button" data-inbound-action="regenerate">Regenerate address</button>':'')+'<button type="button" data-inbound-action="refresh">Refresh activity</button></div><p class="inbound-note">Everyone in this workspace uses the same address. Keep it private and forward shipping labels only.</p>':
            '<div class="inbound-actions">'+(data.can_manage?'<button type="button" data-inbound-action="create" class="inbound-primary">Create workspace address</button>':'<p>Ask your workspace owner or admin to create the shared address.</p>')+'</div>')+
            (data.allowed&&!data.configured?'<p class="inbound-message error">Receiving needs to be configured on the backend before email imports will work.</p>':'<div class="inbound-message" role="status" aria-live="polite"></div>')+
            '<details'+(!data.address&&data.allowed?' open':'')+'><summary>How to set up email imports</summary><ol><li><strong>Create and copy your workspace address.</strong> You can find the same address here and in Settings.</li><li><strong>Forward a shipping-label email with its attachments.</strong> PDF, PNG and JPEG files are supported, up to 25 MB each and 50 PDF pages. Email links alone cannot be imported.</li><li><strong>For automatic forwarding, use a shipping-label filter.</strong> In your email provider, forward only label emails to this address. Some providers require a confirmation email: open Recent email activity below to read a verified Google forwarding confirmation (owner/admin only). Other providers may need setup in their own account.</li><li><strong>Open Dispatch Centre and review the queue.</strong> Labels are cropped using the existing carrier detection. Check the item, quantity and stock location before packing.</li><li><strong>Print when ready.</strong> Use the packing queue\'s mobile print or QZ Tray buttons. Email imports never automatically print or remove stock.</li></ol><p class="inbound-note">Repeated attachments are skipped. A downgrade locks imports; emails received while locked are not imported later. Regenerating the address disables the old one, so update every forwarding rule.</p></details>'+
            '<details><summary>Recent email activity</summary>'+recent()+'</details>';
    }
    async function load(quiet=false){
        const id=++requestId, current=workspace();
        try{
            const result=await InventoryAPI.request('/inbound-labels/status',{headers:current?{'X-Workspace-Id':current}:{}});
            if(id!==requestId||current!==workspace())return;
            if(!result.success)throw new Error(result.error||'Install the inbound email backend update first.');
            const previous=JSON.stringify(data);data=result;
            if(previous!==JSON.stringify(data))render();
            const imports=data.recent.filter(e=>Number(e.imported_count)>0).map(e=>e.id+':'+e.imported_count).join(',');
            if(imports!==seenImports){seenImports=imports;window.dispatchEvent(new CustomEvent('inbound-labels-updated'));}
            if(!quiet)message('Email activity is up to date.');
        }catch(error){
            if(!data)root.innerHTML='<h2>Email Shipping Labels to InventoryOS</h2><p class="inbound-message error" role="alert">'+escape(error.message)+' Install the backend update and configure Resend receiving, then refresh.</p><button type="button" data-inbound-action="refresh">Try again</button>';
            else if(!quiet)message(error.message,true);
        }
    }
    root.addEventListener('click',async event=>{
        const button=event.target.closest('[data-inbound-action]');if(!button||pending)return;
        const action=button.dataset.inboundAction;
        if(action==='refresh'){await load();return;}
        if(action==='copy'){
            try{await navigator.clipboard.writeText(data.address);message('Address copied. Paste it into your email provider.');}
            catch{const input=root.querySelector('#inboundAddress');input.focus();input.select();message('Select and copy the address above.');}
            return;
        }
        if(action==='regenerate'&&!confirm('Regenerate your workspace address? The old address will stop importing immediately. Update any email forwarding rules afterwards.'))return;
        const current=workspace();pending=true;button.disabled=true;
        message(action==='test'?'Sending test label…':'Updating workspace address…');
        try{
            const result=await InventoryAPI.request('/inbound-labels/'+({create:'address',regenerate:'regenerate',test:'test'}[action]),{method:'POST',body:'{}',headers:current?{'X-Workspace-Id':current}:{}});
            if(current!==workspace())return;
            if(!result.success)throw new Error(result.error||'Could not update the address.');
            await load(true);message(result.message||(action==='regenerate'?'New address created. Update your forwarding rules.':'Workspace address is ready.'));
        }catch(error){message(error.message,true);}
        finally{pending=false;button.disabled=false;}
    });
    window.addEventListener('inventory-selection-changed',()=>{data=null;seenImports='';root.innerHTML='<p>Loading workspace shipping-label email…</p>';void load(true);});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)void load(true);});
    poll=setInterval(()=>{if(!document.hidden&&!pending)void load(true);},15000);
    window.addEventListener('pagehide',()=>clearInterval(poll),{once:true});
    void load(true);
})();
