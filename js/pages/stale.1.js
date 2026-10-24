
if(!InventoryAPI.requireLogin()){
    throw new Error("Login required");
}

function loadStaleStock(){
    document.getElementById("summary").innerHTML = "Loading stale stock...";
    document.getElementById("results").innerHTML = "";

    InventoryAPI.request("/stale")
    .then(data=>{
        if(!data.success){
            document.getElementById("summary").innerHTML = "Could not load stale stock";
            document.getElementById("results").innerHTML =
            `<div class="empty-state">Something went wrong loading the report.</div>`;
            return;
        }

        document.getElementById("summary").innerHTML =
        "⚠️ " + data.results.length + " stale item(s) found";

        if(data.results.length === 0){
            document.getElementById("results").innerHTML =
            `<div class="empty-state">
                <h3>✅ No stale stock found</h3>
                <p>Everything has had a sale/removal recorded recently.</p>
            </div>`;
            return;
        }

        let html = "<div class='grid'>";

        data.results.forEach(item=>{
            html += `
            <div class="item-card">
                <div class="item-name">${item.description || item.barcode}</div>
                <div class="badge location-badge">${InventoryWorkspace.locationNameHtml(item.location)}</div>
                <div class="badge qty-badge">Qty ${item.qty}</div>
                <div class="badge days-badge">${item.daysOld} Days</div>
                <div class="barcode-box">
                    <strong>Barcode:</strong><br>
                    ${item.barcode}
                </div>
                <button
                class="quick-sale"
                data-ios-click="h2ddfb6afbc5951f2" data-ios-click-args="${InventoryEvents.encode([encodeURIComponent(item.barcode),encodeURIComponent(item.location)])}">
                Quick Sale
                </button>
            </div>`;
        });

        html += "</div>";
        document.getElementById("results").innerHTML = html;
    })
    .catch(error=>{
        console.error(error);
        document.getElementById("summary").innerHTML = "Error loading stale stock";
        document.getElementById("results").innerHTML =
        `<div class="empty-state">Error loading stale stock.</div>`;
    });
}

loadStaleStock();
