
if(!InventoryAPI.requireLogin()){
    throw new Error("Login required");
}


function showLoading(){
    document.getElementById("loadingOverlay").style.display="flex";
}

function hideLoading(){
    document.getElementById("loadingOverlay").style.display="none";
}

function loadBoxes(){
    showLoading();

    InventoryAPI.request("/boxes")
    .then(data=>{
        hideLoading();

        const select = document.getElementById("boxSelect");

        select.innerHTML = '<option value="">Select Box</option>';

        if(!data.success || data.boxes.length === 0){
            select.innerHTML = '<option value="">No boxes found</option>';
            return;
        }

        data.boxes.forEach(item=>{
            const option = document.createElement("option");
            const boxName = item.box || item.box_name;
            option.value = boxName;
            InventoryWorkspace.setLocationName(option, boxName);
            select.appendChild(option);
        });
    })
    .catch(error=>{
        hideLoading();
        console.error(error);
        alert(InventoryWorkspace.localiseMessage("Could not load boxes"));
    });
}

function loadBoxContents(){
    const box = document.getElementById("boxSelect").value;

    if(!box){
        alert(InventoryWorkspace.localiseMessage("Select a box first"));
        return;
    }

    document.getElementById("summary").innerHTML = "";
    document.getElementById("results").innerHTML = "";

    showLoading();

    InventoryAPI.request("/boxes/" + encodeURIComponent(box) + "/contents")
    .then(data=>{
        hideLoading();

        if(!data.success){
            document.getElementById("results").innerHTML =
            "<div class='empty-state'>" + (data.error || "Could not load box contents") + "</div>";
            return;
        }

        document.getElementById("summary").innerHTML = `
            <div class="summary-grid">
                <div class="summary-card">
                    <div class="summary-title">Selected Box</div>
                    <div class="summary-value">${InventoryWorkspace.locationNameHtml(data.box)}</div>
                </div>

                <div class="summary-card">
                    <div class="summary-title">Total Items Including Qty</div>
                    <div class="summary-value">${data.totalQty}</div>
                </div>

                <div class="summary-card">
                    <div class="summary-title">Different Items</div>
                    <div class="summary-value">${data.differentItems}</div>
                </div>
            </div>
        `;

        if(data.results.length === 0){
            document.getElementById("results").innerHTML =
            "<div class='empty-state'>This box is currently empty.</div>";
            return;
        }

        let html = "<div class='item-grid'>";

        data.results.forEach(item=>{
            html += `
                <div class="item-card">
                    <div class="item-name">${item.description}</div>

                    <div class="badge qty-badge">
                        Qty ${item.qty}
                    </div>

                    <div class="badge barcode-badge">
                        ${item.barcode}
                    </div>
                </div>
            `;
        });

        html += "</div>";

        document.getElementById("results").innerHTML = html;
    })
    .catch(error=>{
        hideLoading();
        console.error(error);

        document.getElementById("results").innerHTML =
        "<div class='empty-state'>Error loading box contents.</div>";
    });
}

loadBoxes();
