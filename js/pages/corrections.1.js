
if(!InventoryAPI.requireLogin()){
    throw new Error("Login required");
}

let correctionEntries = [];
let correctionLocations = [];
let currentFilter = "ALL";

function safe(value){
    return String(value ?? "")
        .replaceAll("&","&amp;")
        .replaceAll("<","&lt;")
        .replaceAll(">","&gt;")
        .replaceAll('"',"&quot;")
        .replaceAll("'","&#039;");
}

function money(value){
    return Number(value || 0).toFixed(3);
}

function formatTime(value){
    const date = new Date(value);

    if(Number.isNaN(date.getTime())){
        return "";
    }

    return date.toLocaleString("en-GB",{
        day:"2-digit",
        month:"short",
        year:"numeric",
        hour:"2-digit",
        minute:"2-digit"
    });
}

function showResult(message,state){
    const box = document.getElementById("result");
    box.textContent = message || "";
    box.className = "result " + (state || "");
}

function setFilter(filter,button){
    currentFilter = filter;

    document.querySelectorAll(".filter-button")
        .forEach(item=>item.classList.remove("active"));

    button.classList.add("active");
    renderCorrections();
}

function locationsForInventory(inventoryId){
    return correctionLocations.filter(
        location =>
            String(location.inventory_id) ===
            String(inventoryId)
    );
}

function locationOptions(inventoryId,selected){
    const options = locationsForInventory(inventoryId);

    return options.map(location=>{
        const isSelected =
            String(location.box_name) ===
            String(selected || "");

        return `
            <option
                value="${safe(location.box_name)}"
                data-location-name="${safe(location.box_name)}"
                ${isSelected ? "selected" : ""}
            >
                ${safe(InventoryWorkspace.formatLocationName(location.box_name))}
            </option>
        `;
    }).join("");
}

function valueBox(label,value,isLocation = false){
    if(value === null || value === undefined || value === ""){
        return "";
    }

    return `
        <div class="value-box">
            <div class="value-label">${safe(label)}</div>
            <div class="value-text" data-location-wording-ignore>${isLocation ? InventoryWorkspace.locationNameHtml(value) : safe(value)}</div>
        </div>
    `;
}

function canCorrect(entry){
    return (
        entry.source_type === "sale" ||
        ["ADD","REMOVE","MOVE","RETURN"].includes(
            String(entry.action || "").toUpperCase()
        )
    );
}

function renderEditor(entry){
    const action = String(entry.action || "").toUpperCase();
    const id = safe(entry.source_id);
    const inventoryId = safe(entry.inventory_id);

    if(entry.source_type === "sale"){
        return `
            <div class="editor" id="editor-${entry.source_type}-${id}">
                <div class="editor-grid">
                    <label>
                        Correct sale price
                        <input
                            type="number"
                            min="0"
                            step="0.001"
                            id="price-${id}"
                            value="${safe(entry.sale_amount || "0.000")}"
                        >
                    </label>

                    <label>
                        Reason
                        <input
                            type="text"
                            id="reason-${entry.source_type}-${id}"
                            placeholder="Optional correction note"
                        >
                    </label>
                </div>

                <div class="editor-actions">
                    <button class="save-button" data-ios-click="h0b9f0cdf474b77c3" data-ios-click-args="${InventoryEvents.encode([id])}">
                        Save Correction
                    </button>
                    <button class="cancel-button" data-ios-click="h550dac74e3887afd" data-ios-click-args="${InventoryEvents.encode([entry.source_type,id])}">
                        Cancel
                    </button>
                </div>
            </div>
        `;
    }

    const fromField = ["REMOVE","MOVE"].includes(action)
        ? `
            <label>
                From location
                <select id="from-${id}">
                    ${locationOptions(inventoryId,entry.from_location)}
                </select>
            </label>
        `
        : "";

    const toField = ["ADD","RETURN","MOVE"].includes(action)
        ? `
            <label>
                To location
                <select id="to-${id}">
                    ${locationOptions(inventoryId,entry.to_location)}
                </select>
            </label>
        `
        : "";

    return `
        <div class="editor" id="editor-${entry.source_type}-${id}">
            <div class="editor-grid">
                <label>
                    Correct quantity
                    <input
                        type="number"
                        min="1"
                        step="1"
                        id="qty-${id}"
                        value="${Number(entry.qty || 1)}"
                    >
                </label>

                ${fromField}
                ${toField}

                <label>
                    Reason
                    <input
                        type="text"
                        id="reason-${entry.source_type}-${id}"
                        placeholder="Optional correction note"
                    >
                </label>
            </div>

            <div class="editor-actions">
                <button class="save-button" data-ios-click="hfe12afd2b96b3b08" data-ios-click-args="${InventoryEvents.encode([id])}">
                    Save Correction
                </button>
                <button class="cancel-button" data-ios-click="h550dac74e3887afd" data-ios-click-args="${InventoryEvents.encode([entry.source_type,id])}">
                    Cancel
                </button>
            </div>
        </div>
    `;
}

function renderCorrections(){
    const target = document.getElementById("activityList");

    const entries = correctionEntries.filter(entry=>{
        if(currentFilter === "ALL"){
            return true;
        }

        return String(entry.action || "").toUpperCase() === currentFilter;
    });

    if(!entries.length){
        target.innerHTML = `
            <div class="empty-state">
                No matching activity found in the latest 30 entries.
            </div>
        `;
        return;
    }

    target.innerHTML = entries.map(entry=>{
        const action = String(entry.action || "").toUpperCase();
        const title =
            entry.description ||
            entry.barcode ||
            "Unknown item";

        const corrected = entry.has_corrections
            ? `<span class="corrected-badge">Corrected ${Number(entry.correction_count || 1)}×</span>`
            : "";

        return `
            <div class="activity-card">
                <div class="activity-head">
                    <div>
                        <div class="activity-title">${safe(title)}</div>
                        <div class="activity-meta">
                            ${safe(formatTime(entry.event_time))}
                            · ${safe(entry.inventory_name || "Inventory")}
                            · ${safe(entry.entered_by || "User")}
                            ${entry.barcode ? `· ${safe(entry.barcode)}` : ""}
                        </div>
                    </div>

                    <div>
                        <span class="action-badge">${safe(action)}</span>
                        ${corrected}
                    </div>
                </div>

                <div class="activity-values">
                    ${valueBox("Quantity",entry.qty)}
                    ${valueBox("From",entry.from_location,true)}
                    ${valueBox("To",entry.to_location,true)}
                    ${
                        entry.sale_amount !== null
                            ? valueBox("Sale price","£" + money(entry.sale_amount))
                            : ""
                    }
                    ${valueBox("Note",entry.note)}
                </div>

                ${
                    canCorrect(entry)
                        ? `
                            <button
                                class="correct-button"
                                data-ios-click="h550dac74e3887afd" data-ios-click-args="${InventoryEvents.encode([entry.source_type,entry.source_id])}"
                            >
                                Correct Entry
                            </button>

                            ${renderEditor(entry)}
                        `
                        : `
                            <div class="activity-meta" style="margin-top:12px;">
                                This entry is shown for reference and cannot change stock directly.
                            </div>
                        `
                }
            </div>
        `;
    }).join("");
}

function toggleEditor(type,id){
    document
        .getElementById(`editor-${type}-${id}`)
        ?.classList
        .toggle("open");
}

async function loadCorrections(){
    showResult("","");

    document.getElementById("activityList").innerHTML =
        `<div class="empty-state">Loading recent activity...</div>`;

    try{
        const [activityData,locationData] = await Promise.all([
            InventoryAPI.request("/corrections/recent?_t=" + Date.now()),
            InventoryAPI.request("/corrections/locations?_t=" + Date.now())
        ]);

        if(!activityData.success){
            throw new Error(activityData.error || "Could not load activity");
        }

        if(!locationData.success){
            throw new Error(locationData.error || "Could not load locations");
        }

        correctionEntries = activityData.entries || [];
        correctionLocations = locationData.locations || [];
        renderCorrections();
    }catch(error){
        document.getElementById("activityList").innerHTML =
            `<div class="empty-state">${safe(error.message || "Could not load corrections")}</div>`;
    }
}

async function saveSaleCorrection(id){
    const price = document.getElementById("price-" + id).value;
    const reason = document.getElementById("reason-sale-" + id).value;

    try{
        const data = await InventoryAPI.request(
            "/corrections/sale/" + encodeURIComponent(id),
            {
                method:"POST",
                body:JSON.stringify({
                    sale_amount:price,
                    reason
                })
            }
        );

        if(!data.success){
            throw new Error(data.error || "Could not save correction");
        }

        showResult(data.message || "Correction saved","success");
        await loadCorrections();
    }catch(error){
        showResult(error.message || "Could not save correction","error");
    }
}

async function saveMovementCorrection(id){
    const entry = correctionEntries.find(
        item =>
            item.source_type === "movement" &&
            String(item.source_id) === String(id)
    );

    if(!entry){
        return;
    }

    const payload = {
        qty:document.getElementById("qty-" + id).value,
        reason:document.getElementById("reason-movement-" + id).value
    };

    const from = document.getElementById("from-" + id);
    const to = document.getElementById("to-" + id);

    if(from){
        payload.from_location = from.value;
    }

    if(to){
        payload.to_location = to.value;
    }

    try{
        const data = await InventoryAPI.request(
            "/corrections/movement/" + encodeURIComponent(id),
            {
                method:"POST",
                body:JSON.stringify(payload)
            }
        );

        if(!data.success){
            throw new Error(data.error || "Could not save correction");
        }

        showResult(data.message || "Correction saved","success");
        await loadCorrections();
    }catch(error){
        showResult(error.message || "Could not save correction","error");
    }
}


let selectedCurrentProduct = null;
let selectedReplacementProduct = null;
let currentSearchTimer = null;
let replacementSearchTimer = null;

function renderProductChoices(targetId, products, type){
    const target = document.getElementById(targetId);
    if(!products.length){
        target.innerHTML = `<div class="activity-meta">No matching products found.</div>`;
        return;
    }

    target.innerHTML = products.map((product,index)=>`
        <div class="product-choice" data-ios-click="h78f3bceeea638e06" data-ios-click-args="${InventoryEvents.encode([type,index])}">
            <strong>${safe(product.description || product.barcode)}</strong><br>
            <span class="activity-meta">${safe(product.barcode || "")} ${product.box_name ? `· ${InventoryWorkspace.locationNameHtml(product.box_name)} · Qty ${Number(product.qty||0)}` : ""}</span>
        </div>
    `).join("");

    if(type === "current") window.currentProductChoices = products;
    else window.replacementProductChoices = products;
}

function selectProductChoice(type,index){
    if(type === "current"){
        selectedCurrentProduct = (window.currentProductChoices || [])[index] || null;
        document.getElementById("currentProductSearch").value = selectedCurrentProduct ? `${selectedCurrentProduct.description} — ${InventoryWorkspace.formatLocationName(selectedCurrentProduct.box_name)}` : "";
        document.getElementById("changeProductQty").value = selectedCurrentProduct ? Math.min(1,Number(selectedCurrentProduct.qty||1)) : 1;
        document.getElementById("currentProductResults").innerHTML = selectedCurrentProduct ? `<div class="product-choice selected">Selected: ${safe(selectedCurrentProduct.description)} · ${InventoryWorkspace.locationNameHtml(selectedCurrentProduct.box_name)} · Qty ${Number(selectedCurrentProduct.qty||0)}</div>` : "";
    }else{
        selectedReplacementProduct = (window.replacementProductChoices || [])[index] || null;
        document.getElementById("replacementProductSearch").value = selectedReplacementProduct ? selectedReplacementProduct.description : "";
        document.getElementById("replacementProductResults").innerHTML = selectedReplacementProduct ? `<div class="product-choice selected">Selected: ${safe(selectedReplacementProduct.description)} · ${safe(selectedReplacementProduct.barcode||"")}</div>` : "";
    }
}

async function searchCorrectionProducts(type){
    const inputId = type === "current" ? "currentProductSearch" : "replacementProductSearch";
    const targetId = type === "current" ? "currentProductResults" : "replacementProductResults";
    const query = document.getElementById(inputId).value.trim();
    if(query.length < 2){ document.getElementById(targetId).innerHTML=""; return; }

    const endpoint = type === "current" ? "/corrections/products" : "/corrections/replacement-products";
    try{
        const data = await InventoryAPI.request(endpoint + "?query=" + encodeURIComponent(query));
        if(!data.success) throw new Error(data.error || "Search failed");
        renderProductChoices(targetId,data.products || [],type);
    }catch(error){
        document.getElementById(targetId).innerHTML = `<div class="activity-meta">${safe(error.message)}</div>`;
    }
}

async function submitProductChange(){
    if(!selectedCurrentProduct || !selectedReplacementProduct){
        showResult("Choose both the current item/location and the replacement item","error");
        return;
    }
    const qty = Number(document.getElementById("changeProductQty").value || 0);
    if(!Number.isInteger(qty) || qty < 1 || qty > Number(selectedCurrentProduct.qty||0)){
        showResult(`Quantity must be between 1 and ${Number(selectedCurrentProduct.qty||0)}`,"error");
        return;
    }

    try{
        const data = await InventoryAPI.request("/corrections/change-product",{
            method:"POST",
            body:JSON.stringify({
                source_inventory_row_id:selectedCurrentProduct.inventory_row_id,
                target_product_id:selectedReplacementProduct.product_id,
                qty,
                reason:document.getElementById("changeProductReason").value
            })
        });
        if(!data.success) throw new Error(data.error || "Could not change item");
        showResult(data.message || "Item changed","success");
        selectedCurrentProduct=null;
        selectedReplacementProduct=null;
        ["currentProductSearch","replacementProductSearch","changeProductReason"].forEach(id=>document.getElementById(id).value="");
        ["currentProductResults","replacementProductResults"].forEach(id=>document.getElementById(id).innerHTML="");
        document.getElementById("changeProductQty").value="1";
        await loadCorrections();
    }catch(error){
        showResult(error.message || "Could not change item","error");
    }
}

document.getElementById("currentProductSearch").addEventListener("input",()=>{
    clearTimeout(currentSearchTimer); currentSearchTimer=setTimeout(()=>searchCorrectionProducts("current"),250);
});
document.getElementById("replacementProductSearch").addEventListener("input",()=>{
    clearTimeout(replacementSearchTimer); replacementSearchTimer=setTimeout(()=>searchCorrectionProducts("replacement"),250);
});


window.addEventListener(
    "inventory-selection-changed",
    loadCorrections
);

loadCorrections();
