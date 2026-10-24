
const API_BASE = window.API_BASE || "http://localhost:3000";

let selectedFiles = [];
let queueCache = [];

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const browseBtn = document.getElementById("browseBtn");
const uploadBtn = document.getElementById("uploadBtn");
const selectedFilesEl = document.getElementById("selectedFiles");
const queueEl = document.getElementById("queue");

function getToken(){
    return localStorage.getItem("token") ||
           localStorage.getItem("inventoryos_token") ||
           localStorage.getItem("authToken") ||
           "";
}

function authHeaders(extra){
    const token = getToken();
    return {
        ...(extra || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
}

function escapeHtml(value){
    return String(value ?? "")
        .replaceAll("&","&amp;")
        .replaceAll("<","&lt;")
        .replaceAll(">","&gt;")
        .replaceAll('"',"&quot;")
        .replaceAll("'","&#039;");
}

async function apiFetch(url, options){
    const opts = options || {};
    opts.headers = authHeaders(opts.headers || {});
    const res = await fetch(`${API_BASE}${url}`, opts);
    const data = await res.json().catch(() => ({}));
    if(!res.ok) throw new Error(data.error || data.message || "Request failed");
    return data;
}

function setFiles(files){
    selectedFiles = Array.from(files || []);
    uploadBtn.disabled = selectedFiles.length === 0;

    if(!selectedFiles.length){
        selectedFilesEl.textContent = "";
        return;
    }

    selectedFilesEl.textContent = selectedFiles.map(f => f.name).join(", ");
}

browseBtn.addEventListener("click", () => fileInput.click());
dropzone.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", e => setFiles(e.target.files));

dropzone.addEventListener("dragover", e => {
    e.preventDefault();
    dropzone.classList.add("dragover");
});

dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("dragover");
});

dropzone.addEventListener("drop", e => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    setFiles(e.dataTransfer.files);
});

uploadBtn.addEventListener("click", async () => {
    if(!selectedFiles.length) return;

    const form = new FormData();
    selectedFiles.forEach(file => form.append("labels", file));

    uploadBtn.disabled = true;
    uploadBtn.textContent = "Uploading...";

    try{
        const token = getToken();
        const res = await fetch(`${API_BASE}/shipping-labels/upload`, {
            method:"POST",
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            body:form
        });

        const data = await res.json().catch(() => ({}));
        if(!res.ok) throw new Error(data.error || "Upload failed");

        selectedFiles = [];
        fileInput.value = "";
        selectedFilesEl.textContent = "Uploaded. Review the packing queue below.";
        await loadQueue();
    }catch(err){
        alert(err.message || "Upload failed");
    }finally{
        uploadBtn.textContent = "Upload To Packing Queue";
        uploadBtn.disabled = selectedFiles.length === 0;
    }
});

document.getElementById("manualAddBtn").addEventListener("click", async () => {
    const description = document.getElementById("manualDescription").value.trim();
    const qty = Number(document.getElementById("manualQty").value || 1);

    if(!description){
        alert("Enter an item description first.");
        return;
    }

    try{
        await apiFetch("/shipping-labels/manual-item", {
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify({description, qty})
        });

        document.getElementById("manualDescription").value = "";
        document.getElementById("manualQty").value = 1;
        await loadQueue();
    }catch(err){
        alert(err.message || "Could not add item");
    }
});

document.getElementById("refreshBtn").addEventListener("click", loadQueue);

document.getElementById("searchBtn").addEventListener("click", async () => {
    try{
        await apiFetch("/shipping-labels/search-locations", { method:"POST" });
        await loadQueue();
    }catch(err){
        alert(err.message || "Search failed");
    }
});

document.getElementById("printBtn").addEventListener("click", () => {
    const rows = [];

    queueCache.forEach(pack => {
        if(pack.status === "packed") return;
        rows.push(`<h2>${escapeHtml(pack.source_name || "Manual pack")}</h2>`);
        (pack.items || []).forEach(item => {
            rows.push(`
                <div style="border-bottom:1px solid #ddd;padding:8px 0;">
                    <strong>${escapeHtml(item.description)}</strong><br>
                    Qty: ${escapeHtml(item.qty)}<br>
                    Location: ${formatLocations(item.locations)}
                </div>
            `);
        });
    });

    const win = window.open("", "_blank");
    win.document.write(`
        <html>
        <head>
            <title>InventoryOS Pick List</title>
            <style>
                body{font-family:Arial;padding:20px;}
                h1{margin-top:0;}
            </style>
        </head>
        <body>
            <h1>Pick List</h1>
            ${rows.join("")}
            <script src="/js/print-ready.js"><\/script>
        </body>
        </html>
    `);
    win.document.close();
});

function formatLocations(locations){
    if(!Array.isArray(locations) || !locations.length) return "Not found";
    return locations.map(loc => {
        const place = InventoryWorkspace.locationNameHtml(loc.location || "Unknown location");
        return `${place || "Unknown location"} - Qty ${escapeHtml(loc.qty)}`;
    }).join("; ");
}

function statusLabel(status){
    return String(status || "needs_review").replaceAll("_"," ");
}

function renderQueue(items){
    queueCache = items || [];

    if(!queueCache.length){
        queueEl.innerHTML = `<div class="muted">No packing items yet.</div>`;
        return;
    }

    queueEl.innerHTML = queueCache.map(pack => {
        const packItems = pack.items || [];

        const itemHtml = packItems.map(item => {
            const locations = Array.isArray(item.locations) ? item.locations : [];
            const locationHtml = locations.length
                ? locations.map(loc => `
                    <div class="location ok">
                        ${InventoryWorkspace.locationNameHtml(loc.location || "Unknown location")}
                        — Qty ${escapeHtml(loc.qty)}
                        ${loc.barcode ? ` — ${escapeHtml(loc.barcode)}` : ""}
                    </div>
                `).join("")
                : `<div class="location ${item.status === "missing" ? "error" : ""}">${item.status === "missing" ? "No stock location found" : "Locations not searched yet"}</div>`;

            return `
                <div class="item-row">
                    <div class="item-main">
                        <div style="width:100%;">
                            <strong>${escapeHtml(item.description)}</strong>
                            <div class="muted small">Qty needed: ${escapeHtml(item.qty)}</div>
                            ${locationHtml}

                            <div class="inline-edit">
                                <input id="desc-${Number(item.id)}" type="text" value="${escapeHtml(item.description)}">
                                <input id="qty-${Number(item.id)}" type="number" min="1" value="${escapeHtml(item.qty)}">
                                <button data-ios-click="h20af178ce09c06df" data-ios-click-args="${InventoryEvents.encode([Number(item.id)])}">Update</button>
                                <button class="danger" data-ios-click="h3cf8d32733f8d41a" data-ios-click-args="${InventoryEvents.encode([Number(item.id)])}">Delete</button>
                            </div>
                        </div>
                        <span class="status ${escapeHtml(item.status || "needs_review")}">${escapeHtml(statusLabel(item.status))}</span>
                    </div>
                </div>
            `;
        }).join("");

        return `
            <div class="card">
                <div class="card-head">
                    <div>
                        <div class="card-title">${escapeHtml(pack.source_name || "Manual pack")}</div>
                        <div class="muted small">${escapeHtml(pack.created_at || "")}</div>
                    </div>
                    <span class="status ${escapeHtml(pack.status || "needs_review")}">${escapeHtml(statusLabel(pack.status))}</span>
                </div>

                <div class="item-list">${itemHtml}</div>

                <div class="manual-add">
                    <input id="add-desc-${Number(pack.id)}" type="text" placeholder="Add another item to this pack">
                    <input id="add-qty-${Number(pack.id)}" type="number" min="1" value="1">
                    <button data-ios-click="h9ea631071d800ff1" data-ios-click-args="${InventoryEvents.encode([Number(pack.id)])}">Add</button>
                </div>

                <div class="actions">
                    <button class="success" data-ios-click="h6eeb65637159cb5e" data-ios-click-args="${InventoryEvents.encode([Number(pack.id)])}">Mark Packed</button>
                    <button class="danger" data-ios-click="h3be62cda316d64e9" data-ios-click-args="${InventoryEvents.encode([Number(pack.id)])}">Remove From Queue</button>
                </div>
            </div>
        `;
    }).join("");
}

async function loadQueue(){
    try{
        const data = await apiFetch("/shipping-labels/queue");
        renderQueue(data.packs || []);
    }catch(err){
        queueEl.innerHTML = `<div class="error">${escapeHtml(err.message || "Could not load queue")}</div>`;
    }
}

async function updateItem(id){
    const description = document.getElementById(`desc-${id}`).value.trim();
    const qty = Number(document.getElementById(`qty-${id}`).value || 1);

    if(!description){
        alert("Enter an item description first.");
        return;
    }

    try{
        await apiFetch(`/shipping-labels/item/${id}/update`, {
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify({description, qty})
        });
        await loadQueue();
    }catch(err){
        alert(err.message || "Could not update item");
    }
}

async function deleteItem(id){
    if(!confirm("Remove this item from the packing queue? Stock will not be changed.")) return;

    try{
        await apiFetch(`/shipping-labels/item/${id}`, { method:"DELETE" });
        await loadQueue();
    }catch(err){
        alert(err.message || "Could not delete item");
    }
}

async function addItemToPack(packId){
    const description = document.getElementById(`add-desc-${packId}`).value.trim();
    const qty = Number(document.getElementById(`add-qty-${packId}`).value || 1);

    if(!description){
        alert("Enter an item description first.");
        return;
    }

    try{
        await apiFetch(`/shipping-labels/${packId}/add-item`, {
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify({description, qty})
        });
        await loadQueue();
    }catch(err){
        alert(err.message || "Could not add item");
    }
}

async function markPacked(id){
    try{
        await apiFetch(`/shipping-labels/${id}/packed`, {method:"POST"});
        await loadQueue();
    }catch(err){
        alert(err.message || "Could not mark packed");
    }
}

async function removePack(id){
    if(!confirm("Remove this pack from the queue? Stock will not be changed.")) return;

    try{
        await apiFetch(`/shipping-labels/${id}`, {method:"DELETE"});
        await loadQueue();
    }catch(err){
        alert(err.message || "Could not remove pack");
    }
}

loadQueue();
