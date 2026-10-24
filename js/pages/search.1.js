
if(!InventoryAPI.requireLogin()){
    throw new Error("Login required");
}


let searchResultsCache = [];
let selectedBundleItems = [];
let liveSearchTimer = null;
let latestLiveSearch = 0;

function showLoading(){
    document.getElementById("loadingOverlay").style.display = "flex";
}

function hideLoading(){
    document.getElementById("loadingOverlay").style.display = "none";
}

function escapeHtml(value){
    return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeJs(value){
    return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/"/g, "\\\"");
}

function normaliseBarcodeShortcut(value){
    const text = String(value || "").trim().toUpperCase();

    if(!text){
        return "";
    }

    if(/^ITEM-\d+$/.test(text)){
        return text;
    }

    if(/^\d+$/.test(text)){
        return "ITEM-" + text;
    }

    return text;
}

function getItemNumber(item){
    const match = String(item.barcode || "").match(/\d+/);
    return match ? Number(match[0]) : 0;
}

function filterAndSortInStock(items){
    return (items || [])
        .filter(item => Number(item.totalQty || item.total_qty || 0) > 0)
        .sort((a, b) => {
            const aNum = getItemNumber(a);
            const bNum = getItemNumber(b);

            if(aNum !== bNum){
                return bNum - aNum;
            }

            return String(b.created_at || "").localeCompare(String(a.created_at || ""));
        });
}

function runSearch(query, options = {}){
    const showLoader = options.showLoader === true;

    if(showLoader){
        showLoading();
    }

    return InventoryAPI.request("/search?query=" + encodeURIComponent(query) + "&_t=" + Date.now())
    .finally(() => {
        if(showLoader){
            hideLoading();
        }
    });
}

function setupAutoSearch(){
    const input = document.getElementById("query");

    input.addEventListener("input", function(){
        clearTimeout(liveSearchTimer);
        let query = input.value.trim();
        const liveQuery = normaliseBarcodeShortcut(query);

        if(!query){
            document.getElementById("liveResults").innerHTML = "";
            return;
        }

        liveSearchTimer = setTimeout(function(){
            liveSearch(liveQuery);
        }, 300);
    });

    input.addEventListener("keydown", function(e){
        if(e.key === "Enter"){
            e.preventDefault();
            searchStock();
        }
    });
}

function liveSearch(query){
    const searchNumber = Date.now();
    latestLiveSearch = searchNumber;

    document.getElementById("liveResults").innerHTML =
    "<div class='result-card'>Finding matches...</div>";

    runSearch(query)
    .then(data => {
        if(searchNumber !== latestLiveSearch){
            return;
        }

        if(!data.success){
            document.getElementById("liveResults").innerHTML = "";
            return;
        }

        renderLiveResults(filterAndSortInStock(data.results || []));
    })
    .catch(error => {
        console.error(error);
        document.getElementById("liveResults").innerHTML = "";
    });
}

function formatLocations(locations){
    const active = (locations || []).filter(loc => Number(loc.qty || 0) > 0);

    if(active.length === 0){
        return "No active location";
    }

    return active
        .map(loc => `${InventoryWorkspace.locationNameHtml(loc.location || "Unknown location")} • Qty ${escapeHtml(loc.qty)}`)
        .join(" | ");
}

function renderLiveResults(items){
    if(items.length === 0){
        document.getElementById("liveResults").innerHTML =
        "<div class='result-card'>No live matches found.</div>";
        return;
    }

    let html = "<div class='result-card'><h3>Tap to add to bundle</h3>";

    items.forEach((item, index) => {
        const alreadySelected = selectedBundleItems.some(selected => selected.barcode === item.barcode);

        html += `
            <button class="live-result-button" data-ios-click="hada40637f7a34616" data-ios-click-args="${InventoryEvents.encode([index])}">
                <strong>${escapeHtml(item.description)}</strong>
                <br>
                <small>Barcode: ${escapeHtml(item.barcode)}</small>
                <br>
                <small>Total Qty: ${escapeHtml(item.totalQty)}</small>
                <br>
                <small>${formatLocations(item.locations)}</small>
                ${alreadySelected ? "<br><small>Already selected</small>" : ""}
            </button>
        `;
    });

    html += "</div>";

    searchResultsCache = items;
    document.getElementById("liveResults").innerHTML = html;
}

function addBundleItemFromLive(index){
    const item = searchResultsCache[index];

    if(!item){
        return;
    }

    if(!selectedBundleItems.some(selected => selected.barcode === item.barcode)){
        selectedBundleItems.push(item);
    }

    document.getElementById("query").value = "";
    document.getElementById("liveResults").innerHTML = "";
    renderSelectedBundleItems();
}

function renderSelectedBundleItems(){
    const box = document.getElementById("selectedBundleItems");

    if(selectedBundleItems.length === 0){
        box.innerHTML = "";
        return;
    }

    let html = `
        <div class="selected-bundle-box">
            <div class="selected-bundle-title">Selected bundle items (${selectedBundleItems.length})</div>
    `;

    selectedBundleItems.forEach((item, index) => {
        html += `
            <div class="selected-bundle-item">
                <span>${escapeHtml(item.description)}<br><small>${escapeHtml(item.barcode)}</small></span>
                <button class="remove-selected-button" data-ios-click="h925677a9f761080c" data-ios-click-args="${InventoryEvents.encode([index])}">Remove</button>
            </div>
        `;
    });

    html += `
            <button class="clear-bundle-button" data-ios-click="h2e7558d723739e0c">Clear selected items</button>
        </div>
    `;

    box.innerHTML = html;
}

function removeBundleItem(index){
    selectedBundleItems.splice(index, 1);
    renderSelectedBundleItems();
}

function clearBundleItems(){
    selectedBundleItems = [];
    renderSelectedBundleItems();
    document.getElementById("results").innerHTML = "";
}

function searchStock(){
    let query = document.getElementById("query").value.trim();
    query = normaliseBarcodeShortcut(query);
    document.getElementById("query").value = query;

    document.getElementById("liveResults").innerHTML = "";

    if(selectedBundleItems.length > 0){
        showBundleResults();
        return;
    }

    if(!query){
        alert("Enter an item name or barcode, or select bundle items first");
        return;
    }

    document.getElementById("results").innerHTML = "";

    runSearch(query, {showLoader:true})
    .then(data => {
        if(!data.success){
            document.getElementById("results").innerHTML =
            "<div class='result-card'>" + escapeHtml(data.error || "Search failed") + "</div>";
            return;
        }

        const inStockResults = filterAndSortInStock(data.results || []);

        if(inStockResults.length === 0){
            document.getElementById("results").innerHTML =
            "<div class='result-card'>No matching items currently in stock.</div>";
            return;
        }

        searchResultsCache = inStockResults;
        showItemChoices(inStockResults);
    })
    .catch(error => {
        console.error(error);
        alert("Error searching stock");
    });
}

function quickSale(barcode, location = ""){
    let url = "remove.html?barcode=" + encodeURIComponent(barcode);

    if(location){
        url += "&location=" + encodeURIComponent(location);
    }

    window.location.href = url;
}

function showItemChoices(items){
    let html = "<div class='result-card'><h3>Choose item</h3>";

    items.forEach((item, index) => {
        html += `
            <button class="choice-button" data-ios-click="hf2210850e5c24062" data-ios-click-args="${InventoryEvents.encode([index])}">
                <strong>${escapeHtml(item.description)}</strong>
                <br>
                <small>Barcode: ${escapeHtml(item.barcode)}</small>
                <br>
                <small>Total Qty: ${escapeHtml(item.totalQty)}</small>
                <br>
                <small>${formatLocations(item.locations)}</small>
            </button>
        `;
    });

    html += "</div>";
    document.getElementById("results").innerHTML = html;
}

function showBundleResults(){
    const groupedByBox = {};
    const noLocationItems = [];

    selectedBundleItems.forEach((item, index) => {
        if(!item.locations || item.locations.length === 0){
            noLocationItems.push({item:item, index:index});
            return;
        }

        item.locations.forEach(loc => {
            const boxName = loc.location || "Unknown location";

            if(!groupedByBox[boxName]){
                groupedByBox[boxName] = [];
            }

            groupedByBox[boxName].push({
                item:item,
                index:index,
                location:boxName,
                qty:loc.qty
            });
        });
    });

    const boxNames = Object.keys(groupedByBox).sort((a, b) => {
        const numA = Number(String(a).match(/\d+/)?.[0] || 0);
        const numB = Number(String(b).match(/\d+/)?.[0] || 0);

        if(numA && numB && numA !== numB){
            return numA - numB;
        }

        return String(a).localeCompare(String(b), undefined, {numeric:true});
    });

    let html = `
        <div class="result-card">
            <h3>Bundle items grouped by box</h3>
            <p class="helper-text">Pick from the boxes shown below. Each line shows the barcode, item name, and the quick sale button for that exact box.</p>
        </div>
    `;

    boxNames.forEach(boxName => {
        const entries = groupedByBox[boxName];

        html += `
            <div class="box-group-card">
                <div class="box-group-title">
                    <span>${InventoryWorkspace.locationNameHtml(boxName)}</span>
                    <span class="badge">${entries.length} item${entries.length === 1 ? "" : "s"}</span>
                </div>
        `;

        entries.forEach(entry => {
            html += `
                <div class="box-group-line">
                    <strong>${escapeHtml(entry.item.barcode)}</strong> — ${escapeHtml(entry.item.description)}
                    <br>
                    <small>Qty in this box: ${escapeHtml(entry.qty)}</small>
                    <button class="location-sale-button" data-ios-click="ha247bef217078dd7" data-ios-click-args="${InventoryEvents.encode([entry.item.barcode,entry.location])}">
                        Quick Sale From ${InventoryWorkspace.locationNameHtml(entry.location)}
                    </button>
                </div>
            `;
        });

        html += `</div>`;
    });

    if(noLocationItems.length > 0){
        html += `
            <div class="box-group-card">
                <div class="box-group-title">
                    <span>No stock location found</span>
                    <span class="badge">${noLocationItems.length}</span>
                </div>
        `;

        noLocationItems.forEach(entry => {
            html += `
                <div class="box-group-line">
                    <strong>${escapeHtml(entry.item.barcode)}</strong> — ${escapeHtml(entry.item.description)}
                    <br>
                    <small>No stock currently available.</small>
                    <button class="remove-selected-button" data-ios-click="hfaaaf8722cdad03e" data-ios-click-args="${InventoryEvents.encode([entry.index])}">
                        Remove from bundle
                    </button>
                </div>
            `;
        });

        html += `</div>`;
    }

    html += `
        <button class="back-button" data-ios-click="hfa9ad92c4794fa9c">
            Back to selected bundle list
        </button>
    `;

    document.getElementById("results").innerHTML = html;
}

function buildItemCard(item, index, bundleMode = false){
    let html = `
        <div class="result-card">
            <div class="result-header">
                <h3 class="result-title">${escapeHtml(item.description)}</h3>
                <span class="badge">Qty ${escapeHtml(item.totalQty)}</span>
            </div>

            <div class="info-row"><strong>Barcode:</strong> ${escapeHtml(item.barcode)}</div>

            <button class="quick-sale-button" data-ios-click="h762d2e4d6bd3a3e5" data-ios-click-args="${InventoryEvents.encode([item.barcode])}">
                Quick Sale
            </button>

            <h3>Locations</h3>
    `;

    if(!item.locations || item.locations.length === 0){
        html += `
            <div class="location">
                No stock currently available
            </div>
        `;
    }else{
        item.locations.forEach(loc => {
            html += `
                <div class="location">
                    <div class="location-title">
                        <span>${InventoryWorkspace.locationNameHtml(loc.location)}</span>
                        <span>Qty ${escapeHtml(loc.qty)}</span>
                    </div>

                    <button class="location-sale-button" data-ios-click="ha247bef217078dd7" data-ios-click-args="${InventoryEvents.encode([item.barcode,loc.location])}">
                        Quick Sale From ${InventoryWorkspace.locationNameHtml(loc.location)}
                    </button>
                </div>
            `;
        });
    }

    if(bundleMode){
        html += `
            <button class="remove-selected-button" data-ios-click="hfaaaf8722cdad03e" data-ios-click-args="${InventoryEvents.encode([index])}">
                Remove from bundle
            </button>
        `;
    }

    html += `</div>`;
    return html;
}

function showSelectedItem(index){
    const item = searchResultsCache[index];
    let html = buildItemCard(item, index, false);

    html += `
        <button class="back-button" data-ios-click="h4873d769a93a612b">
            Back to results
        </button>
    `;

    document.getElementById("results").innerHTML = html;
}

window.addEventListener("inventory-selection-changed", function(){
    selectedBundleItems = [];
    searchResultsCache = [];
    document.getElementById("liveResults").innerHTML = "";
    document.getElementById("results").innerHTML = "";
    renderSelectedBundleItems();
    const query = document.getElementById("query").value.trim();
    if(query){
        liveSearch(normaliseBarcodeShortcut(query));
    }
});

setupAutoSearch();
