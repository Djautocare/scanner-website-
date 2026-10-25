function uploadSafeText(value){return String(value ?? "").replace(/[&<>"']/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]));}

if(!InventoryAPI.requireLogin()){
    throw new Error("Login required");
}


let generatedLabelCount = 0;

function showLoading(){
    document.getElementById("loadingOverlay").style.display = "flex";
}

function hideLoading(){
    document.getElementById("loadingOverlay").style.display = "none";
}

function searchProduct(){
    const query = document.getElementById("query").value.trim();

    if(!query){
        alert("Enter product description or barcode");
        return;
    }

    document.getElementById("results").innerHTML = "";

    showLoading();

    InventoryAPI.request("/search?query=" + encodeURIComponent(query))

    .then(data=>{
        hideLoading();

        if(!data.success || data.results.length === 0){
            document.getElementById("results").innerHTML =
            "<div class='empty-state'>No product found.</div>";
            return;
        }

        let html = "<div class='result-grid'>";

        data.results.forEach(item=>{

            let locationsHtml = "";

            if(item.locations && item.locations.length > 0){
                locationsHtml = "<div class='location-box'><strong>Locations:</strong><br>";

                item.locations.forEach(loc=>{
                    locationsHtml += `${InventoryWorkspace.locationNameHtml(loc.location)} — Qty ${loc.qty}<br>`;
                });

                locationsHtml += "</div>";
            }else{
                locationsHtml =
                "<div class='location-box'>No stock locations found</div>";
            }

            html += `
                <div class="result-card">

                    <div class="result-title">${uploadSafeText(item.description)}</div>

                    <div class="badge barcode-badge">
                        ${uploadSafeText(item.barcode)}
                    </div>

                    <div class="badge qty-badge">
                        Qty ${item.totalQty}
                    </div>

                    ${locationsHtml}

                    <button class="print-button" data-ios-click="h6c63c69634f0792a" data-ios-click-args="${InventoryEvents.encode([item.barcode])}">
                        Print Label
                    </button>

                    <button class="copy-button" data-ios-click="h61ba98c5d2b2233d" data-ios-click-args="${InventoryEvents.encode([item.barcode])}">
                        Copy Barcode
                    </button>

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
        "<div class='empty-state'>Error searching product.</div>";
    });
}

function createLabelHtml(barcode, index){
    return `
        <div class="print-label">
            <svg id="barcode_${index}"></svg>
            <p class="label-text">${uploadSafeText(barcode)}</p>
        </div>
    `;
}

function renderBarcodes(barcodes){
    const container = document.getElementById("printLabels");

    let html = "";

    barcodes.forEach((barcode, index)=>{
        html += createLabelHtml(barcode, index);
    });

    container.innerHTML = html;

    barcodes.forEach((barcode, index)=>{
        JsBarcode("#barcode_" + index, barcode, {
            format:"CODE128",
            displayValue:false,
            width:1.2,
            height:42,
            margin:0
        });
    });

    generatedLabelCount = barcodes.length;
}

function printSingleLabel(barcode){
    renderBarcodes([barcode]);

    setTimeout(function(){
        window.print();
    }, 200);
}

function generateRangeLabels(){
    const prefix =
    document.getElementById("rangePrefix")
    .value
    .trim()
    .toUpperCase() || "ITEM-";

    const start =
    Number(document.getElementById("rangeStart").value);

    const end =
    Number(document.getElementById("rangeEnd").value);

    if(!start || !end){
        alert("Enter start and end numbers");
        return;
    }

    if(end < start){
        alert("End number must be higher than start number");
        return;
    }

    const total = end - start + 1;

    if(total > 200){
        alert("Maximum 200 labels at once");
        return;
    }

    let barcodes = [];

    for(let i = start; i <= end; i++){
        barcodes.push(prefix + i);
    }

    renderBarcodes(barcodes);

    document.getElementById("rangePreview").innerText =
    "Generated " +
    total +
    " labels: " +
    prefix +
    start +
    " to " +
    prefix +
    end;
}

function printGeneratedLabels(){
    if(generatedLabelCount <= 0){
        alert("Generate labels first");
        return;
    }

    setTimeout(function(){
        window.print();
    }, 200);
}

function clearGeneratedLabels(){
    document.getElementById("printLabels").innerHTML = "";
    document.getElementById("rangePreview").innerText =
    "No range generated yet.";
    generatedLabelCount = 0;
}

function copyBarcode(barcode){
    navigator.clipboard.writeText(barcode)
    .then(()=>{
        alert("Copied barcode: " + barcode);
    })
    .catch(()=>{
        alert("Could not copy barcode");
    });
}
