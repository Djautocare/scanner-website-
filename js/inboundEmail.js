(function(){
    "use strict";
    const root=document.querySelector("[data-inbound-labels]");
    if(!root)return;
    let data=null, requestId=0, pending=false, seenImports="", poll, statusBusy=false;
    const escape=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
    const labels={queued:"Waiting to import",processing:"Processing labels",retry:"Retrying automatically",locked:"Import blocked",failed:"Import failed",no_labels:"No label attachments",setup_received:"Forwarding confirmation received",completed:"Imported",completed_with_skips:"Completed with skipped files"};
    const workspace=()=>localStorage.getItem("inventoryos_selected_workspace_id")||"";
    function message(text,error=false){const el=root.querySelector(".inbound-message");if(el){el.textContent=text;el.className="inbound-message "+(error?"error":"success");}}
    function recent(){
        if(!data.recent?.length)return '<p class="inbound-empty">No emails received yet. Send a test or forward a shipping-label email to get started.</p>';
        return '<ul class="inbound-activity">'+data.recent.map(event=>'<li><div><strong>'+(event.replay_of?'Reimport · ':'')+escape(event.subject)+'</strong><small>'+escape(labels[event.status]||event.status)+(event.imported_count?' · '+Number(event.imported_count)+' labels':'')+(event.duplicate_count?' · '+Number(event.duplicate_count)+' duplicates skipped':'')+(event.skipped_count?' · '+Number(event.skipped_count)+' unsupported files skipped':'')+(event.error_code==='PLAN_LOCKED'?' · Pro or Business required':event.error_code==='ADDRESS_REGENERATED'?' · Sent to an old address':'')+'</small>'+(event.setup_text?'<details><summary>Forwarding confirmation (owner/admin only)</summary><p>Use the code or Google URL below to confirm forwarding in your email provider. This message expires here after seven days.</p><pre class="inbound-setup-text">'+escape(event.setup_text)+'</pre></details>':'')+'</div><time>'+escape(new Date(event.created_at).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}))+'</time></li>').join('')+'</ul>';
    }
    function progressPanel(){
        if(!data.progress?.length)return '';
        return '<section class="inbound-progress-panel" aria-label="Email import progress"><h3>Label import progress</h3>'+
            data.progress.map(job=>{
                const total=Number(job.total),finished=Number(job.finished);
                const active=finished<total;
                const title=job.is_reimport?'Reimporting previous emails':job.subject||'Incoming shipping-label email';
                const state=active?(job.retrying?'Retrying automatically':job.processing?'Cropping and importing labels':'Email received — waiting to process')
                    :job.failed?'Finished with errors':job.skipped?'Finished with skipped files':job.confirmations?'Forwarding confirmation received':'Finished';
                const counts=[Number(job.imported)+' label'+(Number(job.imported)===1?'':'s')+' imported'];
                if(job.duplicates)counts.push(Number(job.duplicates)+' duplicate'+(Number(job.duplicates)===1?'':'s')+' skipped');
                if(job.skipped)counts.push(Number(job.skipped)+' file'+(Number(job.skipped)===1?'':'s')+' skipped');
                if(job.failed)counts.push(Number(job.failed)+' email'+(Number(job.failed)===1?' needs':'s need')+' attention');
                const caption=job.is_reimport?finished+' of '+total+' emails finished':state;
                // A single file's download/crop duration is unknown. Show an
                // indeterminate bar until its real completion, not an estimate.
                const value=active&&!job.is_reimport?'':' value="'+finished+'"';
                return '<article class="inbound-progress-card '+(active?'is-working':job.failed?'has-error':'is-finished')+'">'+
                    '<div class="inbound-progress-title"><strong>'+escape(title)+'</strong><span>'+(active?'Working':job.failed?'Check activity':'Done')+'</span></div>'+
                    '<p class="inbound-progress-caption" role="status" aria-live="polite">'+escape(caption)+(job.is_reimport?' · '+escape(state):'')+'</p>'+
                    '<progress max="'+total+'"'+value+' aria-label="'+escape(title)+'">'+finished+' / '+total+'</progress>'+
                    '<p class="inbound-progress-counts">'+escape(counts.join(' · '))+'</p>'+
                    (job.retrying?'<small>A temporary issue is being retried. You do not need to send the email again.</small>':'')+
                    (!active&&(job.failed||job.skipped)?'<small>Open Recent email activity below for the individual results.</small>':'')+
                    '</article>';
            }).join('')+'<p class="inbound-note">Updates every five seconds. Finished results stay here for 30 minutes. Labels are not automatically printed.</p></section>';
    }
    function render(){
        const openDetails=new Set(Array.from(root.querySelectorAll('details[open]'),el=>el.querySelector('summary')?.textContent));
        const replayCount=root.querySelector('#inboundReplayCount')?.value;
        const focusedId=root.contains(document.activeElement)?document.activeElement.id:null;

        const active=data.allowed&&data.address;
        const badge=!data.allowed?'Pro & Business':active?'Active':'Pro & Business';
        root.innerHTML='<div class="inbound-heading"><div><h2>Email Shipping Labels to InventoryOS</h2><p>Forward shipping-label emails and attachments directly into your Dispatch Centre.</p></div><span class="inbound-badge">'+badge+'</span></div>'+
            (!data.allowed?'<div class="inbound-locked"><strong>Available with Pro and Business</strong><p>Your workspace needs an active Pro or Business plan to import labels by email.'+(data.address?' Your address is saved but locked. Upgrading reactivates the same address.':'')+'</p><a class="inbound-upgrade" href="billing.html">View plans</a></div>':
            data.address?'<label class="inbound-note" for="inboundAddress">Shared workspace address</label><div class="inbound-address-row"><input id="inboundAddress" readonly value="'+escape(data.address)+'" aria-label="Workspace shipping-label email address"><button type="button" data-inbound-action="copy" class="inbound-primary">Copy address</button></div><div class="inbound-actions">'+(data.can_manage?'<button type="button" data-inbound-action="test" '+(!data.configured?'disabled':'')+'>Send test</button><button type="button" data-inbound-action="regenerate">Regenerate address</button>':'')+'<button type="button" data-inbound-action="refresh">Refresh activity</button></div><p class="inbound-note">Everyone in this workspace uses the same address. Keep it private and forward shipping labels only.</p>':
            '<div class="inbound-actions">'+(data.can_manage?'<button type="button" data-inbound-action="create" class="inbound-primary">Create workspace address</button>':'<p>Ask your workspace owner or admin to create the shared address.</p>')+'</div>')+
            (data.allowed&&!data.configured?'<p class="inbound-message error">Receiving needs to be configured on the backend before email imports will work.</p>':'<div class="inbound-message" role="status" aria-live="polite"></div>')+
            '<details'+(!data.address&&data.allowed?' open':'')+'><summary>How to set up email imports</summary><ol><li><strong>Create and copy your workspace address.</strong> You can find the same address here and in Settings.</li><li><strong>Forward a shipping-label email with its attachments.</strong> PDF, PNG and JPEG files are supported, up to 25 MB each and 50 PDF pages. Email links alone cannot be imported.</li><li><strong>For automatic forwarding, use a shipping-label filter.</strong> In your email provider, forward only label emails to this address. Some providers require a confirmation email: open Recent email activity below to read a verified Google forwarding confirmation (owner/admin only). Other providers may need setup in their own account.</li><li><strong>Open Dispatch Centre and review the queue.</strong> Labels are cropped using the existing carrier detection. Check the item, quantity and stock location before packing.</li><li><strong>Print when ready.</strong> Use the packing queue\'s mobile print or QZ Tray buttons. Email imports never automatically print or remove stock.</li></ol><p class="inbound-note">Repeated attachments are skipped. A downgrade locks imports; emails received while locked are not imported later. Regenerating the address disables the old one, so update every forwarding rule.</p></details>'+
            (active&&data.can_manage?'<details><summary>Reimport previous label emails</summary><p>Crop the latest completed or failed emails received at this address again. This deliberately creates new queue entries, including labels already imported. Existing jobs are kept.</p><label for="inboundReplayCount">Number of previous emails (1–50)</label><input id="inboundReplayCount" type="number" min="1" max="50" step="1" value="5"><div class="inbound-actions"><button type="button" data-inbound-action="reimport" '+(!data.configured?'disabled':'')+'>Reimport and crop again</button></div><p class="inbound-note">Emails still processing, forwarding confirmations, and emails received while locked are excluded. Older attachments must still be available from the email provider.</p></details>':'')+
            progressPanel()+'<details><summary>Recent email activity</summary>'+recent()+'</details>';
        root.querySelectorAll('details').forEach(el=>{if(openDetails.has(el.querySelector('summary')?.textContent))el.open=true;});
        if(replayCount!==undefined&&root.querySelector('#inboundReplayCount'))root.querySelector('#inboundReplayCount').value=replayCount;
        if(focusedId)root.querySelector('#'+focusedId)?.focus({preventScroll:true});
    }
    async function load(quiet=false){
        if(statusBusy)return;
        statusBusy=true;
        const id=++requestId, current=workspace();
        try{
            const result=await InventoryAPI.request('/inbound-labels/status',{headers:current?{'X-Workspace-Id':current}:{}});
            if(id!==requestId||current!==workspace())return;
            if(!result.success)throw new Error(result.error||'Install the inbound email backend update first.');
            const previous=JSON.stringify(data);data=result;
            if(previous!==JSON.stringify(data))render();
            const imports=data.recent.filter(e=>Number(e.imported_count)>0).map(e=>e.id+':'+e.imported_count).join(',')+'|'+(data.progress||[]).map(e=>e.id+':'+e.imported).join(',');
            if(imports!==seenImports){seenImports=imports;window.dispatchEvent(new CustomEvent('inbound-labels-updated'));}
            if(!quiet)message('Email activity is up to date.');
        }catch(error){
            if(!data)root.innerHTML='<h2>Email Shipping Labels to InventoryOS</h2><p class="inbound-message error" role="alert">'+escape(error.message)+' Install the backend update and configure Resend receiving, then refresh.</p><button type="button" data-inbound-action="refresh">Try again</button>';
            else message(error.message+' Progress may be out of date; reconnect or refresh to check.',true);
        }finally{statusBusy=false;}
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
        let replayCount;
        if(action==='reimport'){
            replayCount=Number(root.querySelector('#inboundReplayCount').value);
            if(!Number.isSafeInteger(replayCount)||replayCount<1||replayCount>50){message('Choose a whole number from 1 to 50.',true);return;}
            if(!confirm('Reimport up to '+replayCount+' previous emails and crop their attachments again? This can create duplicate labels in the queue. Existing jobs will remain.'))return;
        }
        const current=workspace();pending=true;button.disabled=true;
        message(action==='reimport'?'Queuing previous emails…':action==='test'?'Sending test label…':'Updating workspace address…');
        try{
            const result=await InventoryAPI.request('/inbound-labels/'+({create:'address',regenerate:'regenerate',test:'test',reimport:'reimport'}[action]),{method:'POST',body:action==='reimport'?JSON.stringify({count:replayCount,confirmed:true}):'{}',headers:current?{'X-Workspace-Id':current}:{}});
            if(current!==workspace())return;
            if(!result.success)throw new Error(result.error||'Could not update the address.');
            await load(true);message(result.message||(action==='regenerate'?'New address created. Update your forwarding rules.':'Workspace address is ready.'));
        }catch(error){message(error.message,true);}
        finally{pending=false;button.disabled=false;}
    });
    window.addEventListener('inventory-selection-changed',()=>{data=null;seenImports='';root.innerHTML='<p>Loading workspace shipping-label email…</p>';void load(true);});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)void load(true);});
    poll=setInterval(()=>{if(!document.hidden&&!pending)void load(true);},5000);
    window.addEventListener('pagehide',()=>clearInterval(poll),{once:true});
    void load(true);
})();


