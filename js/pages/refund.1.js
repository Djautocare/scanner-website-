
if(!InventoryAPI.requireLogin()){
    throw new Error("Login required");
}

let searchTimer = null;
let suggestedSales = [];
let selectedSale = null;
let activeSuggestionIndex = -1;

function showLoading(){
    document.getElementById("loadingOverlay").style.display = "flex";
}

function hideLoading(){
    document.getElementById("loadingOverlay").style.display = "none";
}

function escapeHtml(value){
    return String(value || "")
        .replace(/&/g,"&amp;")
        .replace(/</g,"&lt;")
        .replace(/>/g,"&gt;")
        .replace(/"/g,"&quot;")
        .replace(/'/g,"&#039;");
}

function formatMoney(value){
    return Number(value || 0).toFixed(2);
}

function flashSuccess(){
    document.body.classList.remove("error-flash");
    document.body.classList.add("success-flash");
    setTimeout(function(){ document.body.classList.remove("success-flash"); }, 3500);
}

function flashError(){
    document.body.classList.remove("success-flash");
    document.body.classList.add("error-flash");
}

function setResult(text, type){
    const el = document.getElementById("result");
    el.className = "result " + (type || "");
    el.innerText = text || "";
}

function focusSearch(){
    setTimeout(function(){
        const input = document.getElementById("saleSearch");
        if(input){
            input.focus();
            input.select();
        }
    }, 120);
}

function getSelectedInventoryHeaderForRefund(){
    if(window.InventoryTopbar && typeof InventoryTopbar.getHeaderValue === "function"){
        return InventoryTopbar.getHeaderValue();
    }

    if(window.InventoryAPI && typeof InventoryAPI.getSelectedInventoryHeader === "function"){
        return InventoryAPI.getSelectedInventoryHeader();
    }

    try{
        const parsed = JSON.parse(localStorage.getItem("inventoryos_selected_inventory_ids") || "[]");
        return Array.isArray(parsed) ? parsed.filter(Boolean).map(String).join(",") : "";
    }catch(error){
        return "";
    }
}

function hasOneSelectedInventory(){
    const selected = getSelectedInventoryHeaderForRefund();
    return selected && selected.split(",").filter(Boolean).length === 1;
}

function saleDateTime(sale){
    return sale.soldDateTime || sale.soldDate || "";
}

function renderSuggestions(){
    const panel = document.getElementById("suggestPanel");

    if(!suggestedSales.length){
        activeSuggestionIndex = -1;
        panel.classList.add("open");
        panel.innerHTML = "<div class='helper-text' style='padding:13px;margin:0;'>No matching sales found.</div>";
        return;
    }

    panel.classList.add("open");

    let html = "";

    suggestedSales.forEach((sale, index)=>{
        const activeClass = index === activeSuggestionIndex ? " active" : "";

        html += `
            <div class="suggest-item${activeClass}" data-ios-click="h9a19d4e7955eaaf7" data-ios-click-args="${InventoryEvents.encode([index])}">
                <div class="suggest-title">↩️ ${escapeHtml(sale.description || "Unknown item")}</div>
                <div class="suggest-meta">
                    Sold: ${escapeHtml(saleDateTime(sale))}
                    <br>£${formatMoney(sale.saleAmount)} • Qty ${Number(sale.qty || 0)}
                    <br>${escapeHtml(sale.barcode || "")}
                    ${sale.inventoryName ? "<br>Inventory: " + escapeHtml(sale.inventoryName) : ""}
                </div>
            </div>
        `;
    });

    panel.innerHTML = html;
}

function searchSales(){
    const query = document.getElementById("saleSearch").value.trim();

    clearTimeout(searchTimer);

    if(query.length < 2){
        suggestedSales = [];
        activeSuggestionIndex = -1;
        document.getElementById("suggestPanel").classList.remove("open");
        document.getElementById("suggestPanel").innerHTML =
            "<div class='helper-text' style='padding:13px;margin:0;'>Type at least 2 letters to find previous sales.</div>";
        return;
    }

    if(!hasOneSelectedInventory()){
        setResult("Please select one inventory first using the selector at the top.", "error");
        return;
    }

    searchTimer = setTimeout(async function(){
        try{
            const data = await InventoryAPI.request("/sales/search?query=" + encodeURIComponent(query) + "&_t=" + Date.now());

            if(!data.success){
                suggestedSales = [];
                activeSuggestionIndex = -1;
                setResult(data.error || "Could not search sales", "error");
                renderSuggestions();
                return;
            }

            suggestedSales = data.sales || [];
            activeSuggestionIndex = suggestedSales.length ? 0 : -1;
            renderSuggestions();

        }catch(error){
            console.error(error);
            suggestedSales = [];
            activeSuggestionIndex = -1;
            setResult("Error searching sales", "error");
            renderSuggestions();
        }
    }, 250);
}

function selectSale(index){
    const sale = suggestedSales[index];

    if(!sale) return;

    selectedSale = sale;

    document.getElementById("saleSearch").value = sale.description || "";
    document.getElementById("suggestPanel").classList.remove("open");

    document.getElementById("selectedSaleCard").innerHTML = `
        <div class="sale-title">↩️ ${escapeHtml(sale.description || "Unknown item")}</div>
        <div class="sale-line"><span>Barcode</span><span>${escapeHtml(sale.barcode || "-")}</span></div>
        <div class="sale-line"><span>Sold Date</span><span>${escapeHtml(saleDateTime(sale) || "-")}</span></div>
        <div class="sale-line"><span>Quantity</span><span>${Number(sale.qty || 0)}</span></div>
        <div class="sale-line"><span>Refund Amount</span><span>£${formatMoney(sale.saleAmount)}</span></div>
        <div class="sale-line"><span>Inventory</span><span>${escapeHtml(sale.inventoryName || "-")}</span></div>
    `;

    setResult("Sale selected. Choose refund options, then process refund.");
}

function toggleReturnToStock(){
    const checked = document.getElementById("returnToStock").checked;
    document.getElementById("returnLocationBox").style.display = checked ? "block" : "none";

    if(checked){
        loadLocations();
    }
}

async function loadLocations(){
    const select = document.getElementById("returnLocation");
    select.innerHTML = "<option value=''>Loading locations...</option>";

    try{
        const data = await InventoryAPI.request("/boxes?_t=" + Date.now());

        if(!data.success || !data.boxes || data.boxes.length === 0){
            select.innerHTML = "<option value=''>No locations found</option>";
            return;
        }

        select.innerHTML = "<option value=''>Choose location</option>";

        data.boxes.forEach(item=>{
            const boxName = item.box || item.box_name;
            const option = document.createElement("option");
            option.value = boxName;
            InventoryWorkspace.setLocationName(option, boxName);
            select.appendChild(option);
        });

    }catch(error){
        console.error(error);
        select.innerHTML = "<option value=''>Could not load locations</option>";
    }
}

async function processRefund(){
    if(!selectedSale){
        alert("Choose a sale first.");
        focusSearch();
        return;
    }

    if(!hasOneSelectedInventory()){
        setResult("Please select one inventory first using the selector at the top.", "error");
        flashError();
        focusSearch();
        return;
    }

    const returnToStock = document.getElementById("returnToStock").checked;
    const returnLocation = document.getElementById("returnLocation").value;
    const refundReason = document.getElementById("refundReason").value.trim();

    if(returnToStock && !returnLocation){
        alert("Choose a return location.");
        return;
    }

    if(!confirm("Refund this sale for £" + formatMoney(selectedSale.saleAmount) + "?")){
        focusSearch();
        return;
    }

    showLoading();
    setResult("Processing refund...");

    try{
        const data = await InventoryAPI.request("/sales/refund", {
            method:"POST",
            body:JSON.stringify({
                sale_id:selectedSale.id,
                return_to_stock:returnToStock,
                return_location:returnLocation,
                refund_reason:refundReason
            })
        });

        hideLoading();

        if(!data.success){
            setResult(data.error || "Could not process refund", "error");
            flashError();
            focusSearch();
            return;
        }

        let output = "Refund processed ✅\\n\\n";
        output += data.description + "\\n";
        output += "Refund amount: £" + formatMoney(data.refundAmount) + "\\n";
        output += "Quantity: " + data.qty + "\\n";

        if(data.returnedToStock){
            output += "Returned to: " + InventoryWorkspace.formatLocationName(data.returnedLocation) + "\\n";
        }else{
            output += "Not returned to inventory.\\n";
        }

        setResult(output, "success");
        flashSuccess();
        clearSelection(false);
        document.getElementById("saleSearch").value = "";
        focusSearch();

    }catch(error){
        hideLoading();
        console.error(error);
        setResult("Refund error: " + error.message, "error");
        flashError();
        focusSearch();
    }
}

function clearSelection(clearSearch = true){
    selectedSale = null;
    suggestedSales = [];
    activeSuggestionIndex = -1;

    if(clearSearch){
        document.getElementById("saleSearch").value = "";
    }

    document.getElementById("suggestPanel").classList.remove("open");
    document.getElementById("selectedSaleCard").innerHTML = "<div class='helper-text'>No sale selected yet.</div>";
    document.getElementById("returnToStock").checked = false;
    document.getElementById("returnLocationBox").style.display = "none";
    document.getElementById("returnLocation").innerHTML = "<option value=''>Loading locations...</option>";
    document.getElementById("refundReason").value = "";
}

document.getElementById("saleSearch").addEventListener("input", searchSales);

document.getElementById("saleSearch").addEventListener("keydown", function(e){
    if(!suggestedSales.length){
        return;
    }

    if(e.key === "ArrowDown"){
        e.preventDefault();
        activeSuggestionIndex = Math.min(activeSuggestionIndex + 1, suggestedSales.length - 1);
        renderSuggestions();
    }

    if(e.key === "ArrowUp"){
        e.preventDefault();
        activeSuggestionIndex = Math.max(activeSuggestionIndex - 1, 0);
        renderSuggestions();
    }

    if(e.key === "Enter"){
        e.preventDefault();
        if(activeSuggestionIndex >= 0){
            selectSale(activeSuggestionIndex);
        }
    }
});

window.addEventListener("inventory-selection-changed", function(){
    clearSelection();
    setResult("Inventory changed. Ready.");
    focusSearch();
});

window.addEventListener("load", function(){
    setTimeout(function(){
        document.getElementById("saleSearch").focus();
    }, 250);
});
