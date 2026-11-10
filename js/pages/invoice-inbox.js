(function(){
    "use strict";
    const drop = document.getElementById("invoiceInboxDrop");
    const picker = document.getElementById("invoiceInboxFiles");
    const refresh = document.getElementById("invoiceInboxRefresh");
    const uploadStatus = document.getElementById("invoiceInboxUploadStatus");
    const status = document.getElementById("invoiceInboxStatus");
    const errors = document.getElementById("invoiceInboxErrors");
    const list = document.getElementById("invoiceInboxJobs");
    const base = "/expenses/invoice-inbox";
    const labels = {
        queued:"Queued",scanning:"Scanning",ready:"Ready to review",failed:"Needs attention",saved:"Saved"
    };
    let uploading = false;
    let revision = 0;
    let poll;

    function inventory(){
        return (window.InventoryTopbar?.getHeaderValue?.() || InventoryAPI.getSelectedInventoryHeader?.() || "").trim();
    }

    function isSingle(header){
        return !!header && !header.includes(",");
    }

    function request(header,route = "",options = {}){
        return InventoryAPI.request(base+route,{
            ...options,headers:{"X-Inventory-Ids":header}
        });
    }

    function render(jobs,header){
        const waiting = jobs.filter(job => job.status === "queued" || job.status === "scanning").length;
        const ready = jobs.filter(job => job.status === "ready").length;
        const failed = jobs.filter(job => job.status === "failed").length;
        const pending = jobs.filter(job => job.status !== "saved");
        const saved = jobs.filter(job => job.status === "saved").slice(0,5);
        status.textContent = jobs.length
            ? [waiting && waiting+" in progress",ready && ready+" ready to review",failed && failed+" need attention"].filter(Boolean).join(" · ") || "All caught up."
            : "No invoices in this inbox yet.";
        list.replaceChildren();
        for(const job of [...pending,...saved]){
            const row = document.createElement("li");
            row.className = "invoice-inbox-job";
            const name = document.createElement("strong");
            name.textContent = job.original_name;
            const state = document.createElement("span");
            state.className = "helper";
            state.textContent = labels[job.status] || "";
            if(job.draft?.supplier) state.textContent += " · " + job.draft.supplier;
            if(job.draft?.amount) state.textContent += " · " + money(job.draft.amount);
            if(job.error) state.textContent += " · " + job.error;
            row.append(name,state);
            const actions = document.createElement("div");
            actions.className = "invoice-inbox-actions";
            function addButton(label,action){
                const button = document.createElement("button");
                button.type = "button";
                button.className = "refresh-button";
                button.textContent = label;
                button.setAttribute("aria-label",label+" "+job.original_name);
                button.addEventListener("click",async () => {
                    if(inventory() !== header) return;
                    button.disabled = true;
                    try{ await action(); }
                    finally{ button.disabled = false; }
                });
                actions.append(button);
            }
            if(job.status === "ready" || job.status === "failed"){
                addButton("Review",async () => {
                    if(!reviewInboxInvoice(job,header)) return;
                    const result = await request(header,"/"+encodeURIComponent(job.id)+"/source");
                    if(result.success) setInboxOriginal(job.id,result.url);
                });
            }
            if(job.status === "failed"){
                addButton("Retry scan",() => changeJob(header,job,"/retry","POST"));
            }
            if(job.status !== "saved"){
                addButton("Discard",async () => {
                    if(window.confirm("Discard this invoice from your inbox?")){
                        await changeJob(header,job,"","DELETE");
                    }
                });
            }
            if(actions.children.length) row.append(actions);
            list.append(row);
        }
        return waiting;
    }

    async function load(){
        const serial = ++revision;
        clearTimeout(poll);
        const header = inventory();
        picker.disabled = uploading || !isSingle(header);
        if(!isSingle(header)){
            list.replaceChildren();
            status.textContent = "Select one inventory to open its invoice inbox.";
            return;
        }
        const result = await request(header);
        if(serial !== revision || inventory() !== header) return;
        if(!result.success){
            list.replaceChildren();
            status.textContent = result.error || "Could not load the invoice inbox.";
            return;
        }
        if(render(result.jobs || [],header) && !document.hidden) poll = setTimeout(load,5000);
    }

    async function changeJob(header,job,suffix,method){
        const result = await request(header,"/"+encodeURIComponent(job.id)+suffix,{method});
        if(inventory() !== header) return;
        if(!result.success){
            status.textContent = result.error || "Could not update the invoice.";
            return;
        }
        if(method === "DELETE") closeInboxReviewForJob(job.id);
        await load();
    }

    async function upload(files){
        const header = inventory();
        if(uploading || !isSingle(header) || !files.length) return;
        errors.replaceChildren();
        if(files.length > 10){
            uploadStatus.textContent = "Choose up to 10 files per upload.";
            return;
        }
        uploading = true;
        picker.disabled = true;
        let queued = 0;
        let duplicates = 0;
        let failed = 0;
        try{
            for(const [index,file] of files.entries()){
                uploadStatus.textContent = "Uploading file " + (index+1) + " of " + files.length + "…";
                const body = new FormData();
                body.append("receipt",file);
                const result = file.size > 8388608
                    ? {success:false,error:"File exceeds 8 MB."}
                    : await request(header,"",{method:"POST",body});
                if(result.success){
                    if(result.duplicate) duplicates++;
                    else queued++;
                }else{
                    failed++;
                    const error = document.createElement("li");
                    error.className = "helper";
                    error.textContent = file.name + " · " + (result.error || "Upload failed");
                    errors.append(error);
                }
            }
        }finally{
            uploading = false;
            picker.disabled = !isSingle(inventory());
            const other = inventory() === header ? "" : " Uploaded to the inventory selected when you started.";
            uploadStatus.textContent = [
                queued && queued+" queued",duplicates && duplicates+" already in the inbox",failed && failed+" rejected"
            ].filter(Boolean).join(" · ") + "." + other;
            await load();
        }
    }

    picker.addEventListener("change",() => {
        const files = [...picker.files];
        picker.value = "";
        void upload(files);
    });
    drop.addEventListener("dragover",event => {
        if(![...event.dataTransfer.types].includes("Files")) return;
        event.preventDefault();
        drop.toggleAttribute("data-dragging",!picker.disabled);
    });
    drop.addEventListener("dragleave",event => {
        if(!drop.contains(event.relatedTarget)) drop.removeAttribute("data-dragging");
    });
    drop.addEventListener("drop",event => {
        event.preventDefault();
        drop.removeAttribute("data-dragging");
        void upload([...event.dataTransfer.files]);
    });
    refresh.addEventListener("click",load);
    window.addEventListener("invoice-inbox-changed",load);
    window.addEventListener("inventory-selection-changed",() => {
        closeInboxReview(inventory());
        list.replaceChildren();
        void load();
    });
    document.addEventListener("visibilitychange",() => {
        if(document.hidden) clearTimeout(poll);
        else void load();
    });
    void load();
})();
