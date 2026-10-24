
const API_BASE = InventoryAPI.API_BASE;

function getAuthToken(){
    return InventoryAPI.getToken();
}

function requireLogin(){
    return InventoryAPI.requireLogin() ? InventoryAPI.getToken() : "";
}

function apiFetch(path, options = {}){
    return InventoryAPI.request(path, options).then(data => ({
        json: () => Promise.resolve(data)
    }));
}

let existingProductResults = [];
let liveSearchTimer = null;
let boxSearchTimer = null;
let allBoxes = [];
let selectedExistingBarcode = "";
let savingProduct = false;
let creatingPrintJob = false;
let printJobsLoadVersion = 0;

const ADD_PRINT_PREFERENCE_KEYS = Object.freeze({
    autoPrint: "inventoryos_add_auto_print_labels",
    printQueue: "inventoryos_add_create_barcode_labels"
});

function currentPreferenceOwner(){
    try{
        const user = InventoryAPI.getUser ? InventoryAPI.getUser() : null;
        return String(user?.id || user?.email || "default").trim().toLowerCase();
    }catch(error){
        return "default";
    }
}

function preferenceKey(name){
    return name + ":" + currentPreferenceOwner();
}

function readBooleanPreference(name, fallback = false){
    try{
        const saved = localStorage.getItem(preferenceKey(name));

        if(saved === null){
            return fallback;
        }

        return saved === "true";
    }catch(error){
        return fallback;
    }
}

function saveBooleanPreference(name, value){
    try{
        localStorage.setItem(
            preferenceKey(name),
            value ? "true" : "false"
        );
    }catch(error){
        console.warn("Could not save Add Stock print preference", error);
    }
}

function initialisePrintPreferences(){
    const printLabels = document.getElementById("printLabels");
    const addToPrintJob = document.getElementById("addToPrintJob");

    /*
        Safe first-use behaviour: both options start OFF when this account
        has never selected a preference. Browser form restoration is
        overridden deliberately so a fresh login cannot inherit a ticked box.
    */
    printLabels.checked = readBooleanPreference(
        ADD_PRINT_PREFERENCE_KEYS.autoPrint,
        false
    );

    addToPrintJob.checked = readBooleanPreference(
        ADD_PRINT_PREFERENCE_KEYS.printQueue,
        false
    );

    printLabels.addEventListener("change", function(){
        saveBooleanPreference(
            ADD_PRINT_PREFERENCE_KEYS.autoPrint,
            printLabels.checked
        );
    });

    addToPrintJob.addEventListener("change", function(){
        saveBooleanPreference(
            ADD_PRINT_PREFERENCE_KEYS.printQueue,
            addToPrintJob.checked
        );
    });
}

function showLoading(){document.getElementById("loadingOverlay").style.display = "flex";}
function hideLoading(){document.getElementById("loadingOverlay").style.display = "none";}

function setQzStatus(message){
    const box = document.getElementById("qzStatus");
    if(box) box.innerText = message;
}

function setSaveStatus(message){
    document.getElementById("saveStatus").innerText = message || "";
}

function flashSuccess(){
    document.body.classList.remove("error-flash");
    document.body.classList.add("success-flash");
    setTimeout(function(){
        document.body.classList.remove("success-flash");
    }, 4000);
}

function flashError(message){
    document.body.classList.remove("success-flash");
    document.body.classList.add("error-flash");
    setSaveStatus(message || "Something went wrong.");
}

function clearErrorOnNewProduct(){
    document.body.classList.remove("error-flash");
    setSaveStatus("");
}

function escapeHtml(value){
    return String(value || "")
        .replace(/&/g,"&amp;")
        .replace(/</g,"&lt;")
        .replace(/>/g,"&gt;")
        .replace(/"/g,"&quot;")
        .replace(/'/g,"&#039;");
}

function connectQz(){
    setQzStatus("Connecting to QZ Tray...");

    return InventoryOSQZ.connect()
        .then(function(){
            const printer =
                InventoryOSQZ
                    .getProductPrinterName();

            setQzStatus(
                printer
                    ? "Connected. 2×1 printer: " +
                      printer
                    : "Connected. Select a 2×1 printer in Printer Setup."
            );
        });
}

function buildQzLabelHtml(barcode, description){
    const safeBarcode = escapeHtml(barcode);
    const safeDescription = escapeHtml(description);

    return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
<style>
@page{size:51mm 25mm;margin:0;}
html,body{margin:0;padding:0;width:51mm;height:25mm;background:white;overflow:hidden;}
*{box-sizing:border-box;}
body{font-family:Arial,sans-serif;}
.label{width:51mm;height:25mm;padding:1.3mm 1.8mm 1mm 1.8mm;overflow:hidden;text-align:center;background:white;}
.desc{color:black;font-weight:bold;font-size:7.5px;line-height:1;height:8px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;margin:0 0 0.5mm 0;}
#qzBarcode{display:block;width:47mm;height:14mm;margin:0 auto;}
.barcodeNumber{color:black;font-size:8px;line-height:1;font-weight:bold;margin-top:0.3mm;}
</style>
</head>
<body>
<div class="label">
    <div class="desc">${safeDescription}</div>
    <svg id="qzBarcode"></svg>
    <div class="barcodeNumber">${safeBarcode}</div>
</div>
<script>
window.onload = function(){
    JsBarcode("#qzBarcode", "${safeBarcode}", {
        format:"CODE128",
        displayValue:false,
        width:1.55,
        height:40,
        margin:0
    });
};
<\/script>
</body>
</html>`;
}

function qzPrintOneImageLabel(barcode, description){
    let selectedPrinter = "";

    return connectQz()
        .then(function(){
            return InventoryOSQZ
                .requirePrinter("product");
        })
        .then(function(printer){
            selectedPrinter = printer;

            const config = qz.configs.create(
                printer,
                {
                    size:{
                        width:2,
                        height:1
                    },
                    units:"in",
                    margins:0,
                    copies:1,
                    scaleContent:false
                }
            );

            const data = [{
                type:"pixel",
                format:"html",
                flavor:"plain",
                data:buildQzLabelHtml(
                    barcode,
                    description
                )
            }];

            setQzStatus(
                "Sending label to " +
                selectedPrinter +
                "..."
            );

            return qz.print(
                config,
                data
            );
        })
        .then(function(){
            setQzStatus(
                "Label sent to " +
                selectedPrinter +
                "."
            );
        });
}

function printBarcodeLabelQz(barcode, description, quantity){
    const qty = Math.max(1, Number(quantity || 1));
    let chain = Promise.resolve();

    for(let i = 0; i < qty; i++){
        chain = chain.then(function(){
            return qzPrintOneImageLabel(barcode, description);
        });
    }

    return chain;
}

function testQzImagePrint(){
    printBarcodeLabelQz(
        "TEST-123",
        "TEST LABEL",
        1
    )
    .then(function(){
        setQzStatus(
            "Test label sent to " +
            InventoryOSQZ
                .getProductPrinterName() +
            "."
        );
    })
    .catch(function(error){
        console.error(error);

        setQzStatus(
            "QZ print error: " +
            (
                error.message ||
                error
            )
        );

        flashError(
            "Auto print test failed."
        );
    });
}

function getBoxNumber(boxName){
    const match = String(boxName || "").match(/(\d+)/);
    return match ? Number(match[1]) : null;
}

function fillBoxDropdown(boxes){
    allBoxes = (boxes || []).map(item => ({
        box: item.box || item.box_name || item.location || "",
        notes: item.notes || ""
    })).filter(item => item.box);

    const select = document.getElementById("location");
    select.innerHTML = '<option value="">Select Box / Location</option>';

    if(!allBoxes.length){
        select.innerHTML = '<option value="">No boxes created yet</option>';
        return;
    }

    allBoxes.sort(function(a,b){
        const an = getBoxNumber(a.box);
        const bn = getBoxNumber(b.box);
        if(an !== null && bn !== null) return an - bn;
        return String(a.box).localeCompare(String(b.box));
    });

    allBoxes.forEach(item=>{
        const option = document.createElement("option");
        option.value = item.box;
        InventoryWorkspace.setLocationName(option, item.box);
        select.appendChild(option);
    });

    const savedLocation = localStorage.getItem("lastAddLocation");
    if(savedLocation){
        select.value = savedLocation;
        const n = getBoxNumber(savedLocation);
        if(n !== null) document.getElementById("boxNumberInput").value = n;
        document.getElementById("boxHint").innerHTML = "Selected " + InventoryWorkspace.locationNameHtml(savedLocation);
    }
}

function loadBoxes(){
    /*
        Do not use localStorage here.
        Boxes/locations are inventory-specific, so cached boxes from another selected inventory
        can make the Add page show the wrong locations.
    */
    apiFetch("/boxes?_t=" + Date.now())
    .then(res=>res.json())
    .then(data=>{
        if(data.success && data.boxes){
            fillBoxDropdown(data.boxes);
        }else{
            fillBoxDropdown([]);
        }
    })
    .catch(error=>{
        console.error(error);
        setSaveStatus("Could not load boxes. Paste login token if asked.");
    });
}

function chooseClosestBox(){
    const raw = document.getElementById("boxNumberInput").value.trim();
    const hint = document.getElementById("boxHint");
    const select = document.getElementById("location");

    if(!raw){
        select.value = "";
        hint.innerText = "Type a box number and the closest available box will be selected.";
        return;
    }

    const wanted = Number(raw);
    if(!allBoxes.length || isNaN(wanted)){
        hint.innerText = "No boxes available yet.";
        return;
    }

    let best = null;
    let bestDistance = Infinity;

    allBoxes.forEach(function(item){
        const n = getBoxNumber(item.box);
        if(n === null) return;

        const distance = Math.abs(n - wanted);
        if(distance < bestDistance){
            best = item;
            bestDistance = distance;
        }
    });

    if(best){
        select.value = best.box;
        localStorage.setItem("lastAddLocation", best.box);
        if(getBoxNumber(best.box) === wanted){
            hint.innerHTML = "Selected " + InventoryWorkspace.locationNameHtml(best.box);
        }else{
            hint.innerHTML = "Closest available: " + InventoryWorkspace.locationNameHtml(best.box);
        }
    }
}

function boxNumberChanged(){
    clearErrorOnNewProduct();
    clearTimeout(boxSearchTimer);
    boxSearchTimer = setTimeout(chooseClosestBox, 500);
}

function fillPrintJobDropdown(jobs){
    const select = document.getElementById("printJob");
    select.innerHTML = '<option value="">Select Print Job</option>';

    if(!jobs || jobs.length === 0){
        select.innerHTML = '<option value="">No print jobs created yet</option>';
        return;
    }

    jobs.forEach(job=>{
        const option = document.createElement("option");
        option.value = job.printJobId;
        option.textContent = job.name || "Unnamed print job";
        select.appendChild(option);
    });
}

async function loadPrintJobs(selectedId){
    const select = document.getElementById("printJob");
    const version = ++printJobsLoadVersion;
    const previous = selectedId === undefined ? select.value : selectedId;
    select.disabled = true;
    select.innerHTML = '<option value="">Loading print jobs...</option>';
    try{
        const data = await InventoryAPI.request("/print-jobs");
        if(version !== printJobsLoadVersion) return;
        if(!data.success) throw new Error(data.error || "Could not load print jobs");
        fillPrintJobDropdown(data.printJobs || []);
        select.value = previous || "";
    }catch(error){
        if(version !== printJobsLoadVersion) return;
        select.innerHTML = '<option value="">Could not load print jobs — reload the page to retry</option>';
    }finally{
        if(version === printJobsLoadVersion) select.disabled = false;
    }
}

async function createPrintJob(){
    if(creatingPrintJob) return;
    const input = document.getElementById("newPrintJobName");
    const name = input.value.trim();
    if(!name){
        flashError("Enter a name for the print job.");
        input.focus();
        return;
    }
    creatingPrintJob = true;
    const inventoryHeader = InventoryAPI.getSelectedInventoryHeader();
    try{
        const data = await InventoryAPI.request("/print-jobs", {
            method:"POST",
            body:JSON.stringify({name})
        });
        if(!data.success) throw new Error(data.error || "Could not create print job");
        if(inventoryHeader !== InventoryAPI.getSelectedInventoryHeader()) return;
        input.value = "";
        await loadPrintJobs(data.printJob.printJobId || data.printJob.id);
        setSaveStatus("Print job created. Select Create barcode labels for these items to add labels when saving stock.");
    }catch(error){
        flashError(error.message || "Could not create print job.");
    }finally{
        creatingPrintJob = false;
    }
}

function searchExistingProductsLive(){
    const query = document.getElementById("description").value.trim();
    const box = document.getElementById("matchesBox");
    const summary = document.getElementById("matchSummary");
    const results = document.getElementById("matchResults");

    selectedExistingBarcode = "";
    clearErrorOnNewProduct();
    clearTimeout(liveSearchTimer);

    if(query.length < 2){
        existingProductResults = [];
        box.classList.remove("show");
        summary.innerText = "Type to search existing products";
        results.innerHTML = "";
        return;
    }

    box.classList.add("show");
    summary.innerText = "Searching...";
    results.innerHTML = "";

    liveSearchTimer = setTimeout(function(){
        apiFetch("/products?search=" + encodeURIComponent(query) + "&_t=" + Date.now())
        .then(res=>res.json())
        .then(data=>{
            const products = data.products || data.results || [];

            if(!data.success || products.length === 0){
                existingProductResults = [];
                summary.innerText = "No existing matches found.";
                results.innerHTML = "";
                return;
            }

            existingProductResults = products;
            summary.innerText = products.length + " existing match" + (products.length === 1 ? "" : "es") + " found";

            let html = "";
            products.slice(0,8).forEach((item,index)=>{
                const barcode = item.barcode || "";
                const qty = Number(     item.total_qty ??     item.current_qty ??     item.currentQty ??     item.stock_qty ??     item.stockQty ??     item.quantity ??     item.qty ??     0 );
                html += `
                    <div class="match-item" data-ios-click="hf14ce2c5180799ee" data-ios-click-args="${InventoryEvents.encode([index])}">
                        <div class="match-title">${escapeHtml(item.description)}</div>
                        <div class="match-meta">${escapeHtml(barcode)} • Current Qty ${qty}</div>
                    </div>
                `;
            });

            results.innerHTML = html;
        })
        .catch(error=>{
            console.error(error);
            existingProductResults = [];
            summary.innerText = "Error searching existing products.";
            results.innerHTML = "";
        });
    }, 250);
}

function selectExistingProduct(index){
    const item = existingProductResults[index];
    if(!item) return;

    document.getElementById("description").value = item.description;
    selectedExistingBarcode = item.barcode || "";
    document.getElementById("matchSummary").innerText = "Selected existing product: " + selectedExistingBarcode;
    document.getElementById("matchResults").innerHTML = "";
    document.getElementById("qty").focus();
}

function clearMatchResults(){
    existingProductResults = [];
    selectedExistingBarcode = "";
    document.getElementById("matchesBox").classList.remove("show");
    document.getElementById("matchSummary").innerText = "Type to search existing products";
    document.getElementById("matchResults").innerHTML = "";
}

function saveProduct(){
    if(savingProduct) return;
    let stockSaved = false;
    const description = document.getElementById("description").value.trim();
    const qty = document.getElementById("qty").value;
    const location = document.getElementById("location").value;
    const printLabels = document.getElementById("printLabels").checked;
    const addToPrintJob = document.getElementById("addToPrintJob").checked;
    const printJobId = document.getElementById("printJob").value;

    if(!description){
        flashError("Enter description.");
        document.getElementById("description").focus();
        return;
    }

    chooseClosestBox();

    if(!document.getElementById("location").value){
        flashError("Enter/select a box number.");
        document.getElementById("boxNumberInput").focus();
        return;
    }

    const finalLocation = document.getElementById("location").value;

    if(addToPrintJob && !printJobId){
        flashError("Select or create a print job first.");
        return;
    }
    if(addToPrintJob && (!Number.isInteger(Number(qty)) || Number(qty) <= 0)){
        flashError("Enter a positive whole-number quantity for the labels.");
        return;
    }

    const inventoryHeader = InventoryAPI.getSelectedInventoryHeader();
    const requestHeaders = inventoryHeader ? {"X-Inventory-Ids":inventoryHeader} : {};
    savingProduct = true;
    showLoading();
    setSaveStatus("Saving...");

    return apiFetch("/stock/add",{
        method:"POST",
        headers:requestHeaders,
        body:JSON.stringify({
            barcode:selectedExistingBarcode || "",
            description:description,
            qty:Number(qty || 1),
            box_name:finalLocation
        })
    })
    .then(res=>res.json())
    .then(async data=>{

        if(!data.success){
            flashError(data.error || "Error saving product.");
            return;
        }

        stockSaved = true;
        let labelError = "";
        if(addToPrintJob){
            try{
                const result = await InventoryAPI.request("/print-jobs/" + encodeURIComponent(printJobId) + "/items", {
                    method:"POST",
                    headers:requestHeaders,
                    body:JSON.stringify({barcode:data.barcode, quantity:Number(qty)})
                });
                if(!result.success) throw new Error(result.error || "Could not confirm labels were saved");
            }catch(error){
                labelError = error.message || "Could not confirm labels were saved";
            }
        }
        // Clear saved inputs even when the separate label request fails.
        document.getElementById("description").value = "";
        document.getElementById("qty").value = "1";
        clearMatchResults();
        document.getElementById("barcodeText").innerText = data.barcode;

        JsBarcode("#barcode", data.barcode, {
            format:"CODE128",
            displayValue:false,
            width:1.8,
            height:38,
            margin:2
        });

        loadBoxes();
        if(labelError){
            const message = "Stock saved: " + data.barcode + ". Print-job labels could not be confirmed: " + labelError + ". Do not add the stock again. Check the job in Barcode Printing before printing missing labels separately.";
            flashError(message);
            setSaveStatus(message);
        }else{
            flashSuccess();
            setSaveStatus("Saved: " + data.barcode + (addToPrintJob ? " — " + qty + " labels added to the print job." : ""));
        }

        if(printLabels){
            printBarcodeLabelQz(data.barcode, description, qty)
                .catch(function(error){
                    console.error(error);
                    setQzStatus("QZ print error: " + error);
                    flashError("Saved, but auto print failed.");
                });
        }

        document.getElementById("description").value = "";
        document.getElementById("qty").value = "1";
        clearMatchResults();

        setTimeout(function(){
            document.getElementById("description").focus();
        }, 100);
    })
    .catch(error=>{
        hideLoading();
        console.error(error);
        flashError(stockSaved ? "Stock was saved, but a follow-up step failed. Do not add the stock again; check the saved item and print job." : "Could not confirm stock was saved. Check your inventory before trying again.");
    })
    .finally(()=>{
        savingProduct = false;
        hideLoading();
    });
}

function adjustQty(direction){
    const qtyInput = document.getElementById("qty");
    let qty = Number(qtyInput.value || 1);

    if(direction === "up") qty++;
    if(direction === "down") qty = Math.max(1, qty - 1);

    qtyInput.value = qty;
}

document.addEventListener("keydown",function(e){
    if(e.key === "ArrowUp"){
        e.preventDefault();
        adjustQty("up");
    }

    if(e.key === "ArrowDown"){
        e.preventDefault();
        adjustQty("down");
    }

    if(e.key === "Enter" && !e.shiftKey){
        const active = document.activeElement;
        const activeId = active ? active.id : "";

        if(activeId !== "newPrintJobName"){
            e.preventDefault();
            saveProduct();
        }
    }
});

document.getElementById("description").addEventListener("input",searchExistingProductsLive);
document.getElementById("boxNumberInput").addEventListener("input",boxNumberChanged);
document.getElementById("qty").addEventListener("input",clearErrorOnNewProduct);

document.getElementById("newPrintJobName").addEventListener("keydown",function(e){
    if(e.key === "Enter"){
        e.preventDefault();
        createPrintJob();
    }
});

InventoryAPI.requireLogin();
initialisePrintPreferences();

window.addEventListener("inventory-selection-changed", function(){
    clearMatchResults();
    loadBoxes();
    loadPrintJobs("");
});

loadBoxes();
loadPrintJobs();

setTimeout(function(){
    document.getElementById("description").focus();
}, 300);
