/* Screen layout and disclosure state. Stock, crop, share and packing actions use
   their existing handlers; this module never writes to the backend. */
(function(){
    'use strict';
    const queue=document.getElementById('queue');
    if(!queue)return;
    function updateQueue(packs){
        const pending=(packs||[]).filter(pack=>pack.status!=='packed');
        const ready=pending.filter(pack=>pack.status==='ready').length;
        const count=pending.length;
        const values={dispatchQueueCount:count,dispatchReadyCount:ready,dispatchReviewCount:count-ready};
        for(const [id,value] of Object.entries(values)){
            const node=document.getElementById(id);if(node)node.textContent=String(value);
        }
        const note=document.getElementById('dispatchQueueCaption');
        if(note)note.textContent=count?`${count} parcel${count===1?'':'s'} waiting · check matches, then start packing.`:'Import your first shipping label to get started.';
        document.querySelectorAll('.view-tabs button').forEach(button=>button.setAttribute('aria-pressed',String(button.classList.contains('active'))));
    }
    function rememberQueueDetails(){return new Set(Array.from(queue.querySelectorAll('details[open][data-dispatch-detail]'),node=>node.dataset.dispatchDetail));}
    function restoreQueueDetails(open){queue.querySelectorAll('details[data-dispatch-detail]').forEach(node=>{if(open.has(node.dataset.dispatchDetail))node.open=true;});}
    document.addEventListener('click',event=>{
        document.querySelectorAll('.dispatch-menu[open]').forEach(menu=>{
            if(!menu.contains(event.target)||event.target.closest('.dispatch-menu-content button'))menu.open=false;
        });
    });
    document.addEventListener('keydown',event=>{
        if(event.key!=='Escape')return;
        document.querySelectorAll('.dispatch-menu[open]').forEach(menu=>{menu.open=false;menu.querySelector('summary')?.focus();});
    });
    const root=document.querySelector('[data-inbound-labels]');
    const emailPanel=document.getElementById('dispatchEmailPanel');
    const emailStatus=document.getElementById('dispatchEmailStatus');
    const seenProgress=new Set();
    function emailUpdated(){
        if(!root||!emailPanel||!emailStatus)return;
        const working=Array.from(root.querySelectorAll('.inbound-progress-card.is-working'));
        const signature=working.map(card=>card.querySelector('strong')?.textContent||'Importing labels').join('|');
        const failed=!!root.querySelector('.inbound-progress-card.has-error,.inbound-message.error:not(:empty)');
        emailStatus.textContent=working.length?'Importing':failed?'Check activity':root.querySelector('.inbound-badge')?.textContent||'Loading';
        emailStatus.classList.toggle('is-working',working.length>0||failed);
        // Import activity remains visible even though setup starts collapsed.
        // A user may close it; the same poll must not force it open again.
        if((signature||failed)&&!seenProgress.has(signature||'error')){
            seenProgress.add(signature||'error');emailPanel.open=true;
        }
        if(!working.length)seenProgress.clear();
    }
    if(root)new MutationObserver(emailUpdated).observe(root,{childList:true,subtree:true,characterData:true});
    window.InventoryDispatchLayout={updateQueue,rememberQueueDetails,restoreQueueDetails};
    updateQueue([]);emailUpdated();
})();
