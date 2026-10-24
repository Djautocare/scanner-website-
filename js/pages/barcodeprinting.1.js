
if(!InventoryAPI.requireLogin()){
    throw new Error("Login required");
}


let liveSearchTimer = null;
let loadedLabels = [];

function readLocationSettings(){
    try{
        if(
            typeof InventoryWorkspace !== "undefined" &&
            InventoryWorkspace &&
            typeof InventoryWorkspace.getSettings === "function"
        ){
            return InventoryWorkspace.getSettings();
        }
    }catch(error){
        console.error(
            "Could not read location settings from InventoryWorkspace:",
            error
        );
    }

    try{
        const workspace = JSON.parse(
            localStorage.getItem("inventoryos_workspace") ||
            "null"
        );

        if(workspace && workspace.settings){
            return workspace.settings;
        }
    }catch(error){
        console.error(
            "Could not read cached workspace settings:",
            error
        );
    }

    return {};
}

function locationWords(){
    const settings = readLocationSettings();

    const singular =
        String(
            settings.location_label_singular ||
            "Box"
        ).trim() ||
        "Box";

    const plural =
        String(
            settings.location_label_plural ||
            "Boxes"
        ).trim() ||
        "Boxes";

    return {
        singular:singular,
        plural:plural,
        singularLower:singular.toLocaleLowerCase(),
        pluralLower:plural.toLocaleLowerCase()
    };
}

function applyBarcodePrintingLocationWording(){
    const words = locationWords();

    document.getElementById(
        "barcodePrintingSubtitle"
    ).textContent =
        "Print product labels, " +
        words.singularLower +
        " labels, barcode ranges and saved print jobs";

    document.getElementById(
        "locationLabelsTab"
    ).textContent =
        words.singular +
        " Labels";

    document.getElementById(
        "selectLocationLabel"
    ).textContent =
        "Select " +
        words.singular;

    document.getElementById(
        "printLocationLabelButton"
    ).textContent =
        "Print " +
        words.singular +
        " Label";

    const select =
        document.getElementById("boxSelect");

    if(select && select.options.length){
        const firstOption =
            select.options[0];

        if(
            !firstOption.value &&
            (
                /loading/i.test(firstOption.textContent) ||
                /select/i.test(firstOption.textContent) ||
                /no .* found/i.test(firstOption.textContent)
            )
        ){
            if(/loading/i.test(firstOption.textContent)){
                firstOption.textContent =
                    "Loading " +
                    words.pluralLower +
                    "...";
            }else if(/no .* found/i.test(firstOption.textContent)){
                firstOption.textContent =
                    "No " +
                    words.pluralLower +
                    " found";
            }else{
                firstOption.textContent =
                    "Select " +
                    words.singular;
            }
        }
    }
}

function showLoading(){
    document.getElementById("loadingOverlay").style.display = "flex";
}

function hideLoading(){
    document.getElementById("loadingOverlay").style.display = "none";
}

function showSection(sectionId, button){
    document.querySelectorAll(".section").forEach(section=>{
        section.classList.remove("active");
    });

    document.querySelectorAll(".tab-button").forEach(btn=>{
        btn.classList.remove("active");
    });

    document.getElementById(sectionId).classList.add("active");
    button.classList.add("active");

    localStorage.setItem("barcodePrintingActiveTab", sectionId);
}

function restoreActiveTab(){
    const saved = localStorage.getItem("barcodePrintingActiveTab");

    if(!saved){
        return;
    }

    const buttons = document.querySelectorAll(".tab-button");
    const sections = {
        productSection:buttons[0],
        boxSection:buttons[1],
        rangeSection:buttons[2],
        jobSection:buttons[3],
        quickSection:buttons[4]
    };

    if(sections[saved]){
        showSection(saved, sections[saved]);
    }
}

function escapeHtml(value){
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function createLabelHtml(barcode, index, isLocation = false){
    return `
        <div class="print-label">
            <svg id="barcode_${index}"></svg>
            <p class="label-text" data-location-wording-ignore>${isLocation ? InventoryWorkspace.locationNameHtml(barcode) : escapeHtml(barcode)}</p>
        </div>
    `;
}

function renderBarcodes(barcodes, isLocation = false){
    const container = document.getElementById("printLabels");

    let html = "";

    barcodes.forEach((barcode,index)=>{
        html += createLabelHtml(barcode,index,isLocation);
    });

    container.innerHTML = html;

    barcodes.forEach((barcode,index)=>{
        JsBarcode("#barcode_" + index, barcode, {
            format:"CODE128",
            displayValue:false,
            width:1.2,
            height:42,
            margin:0
        });
    });

    loadedLabels = barcodes;
}

function printLoadedLabels(){
    if(!loadedLabels || loadedLabels.length === 0){
        alert("Generate or load labels first");
        return;
    }

    setTimeout(function(){
        window.print();
    },200);
}

function clearLoadedLabels(){
    loadedLabels = [];
    document.getElementById("printLabels").innerHTML = "";
    document.getElementById("rangePreview").innerHTML = "No range generated yet.";
    document.getElementById("jobSummary").innerHTML = "";
    document.getElementById("jobPreview").innerHTML = "";
}

function printSingleBarcode(barcode, isLocation = false){
    if(!barcode){
        alert("Missing barcode");
        return;
    }

    renderBarcodes([barcode], isLocation);

    setTimeout(function(){
        window.print();
    },200);
}

/* PRODUCT LIVE SEARCH */

document.getElementById("productSearch").addEventListener("input", function(){
    const query = this.value.trim();

    clearTimeout(liveSearchTimer);

    if(query.length < 2){
        document.getElementById("productResults").innerHTML =
        "<div class='empty-state'>Type at least 2 characters to search.</div>";
        return;
    }

    liveSearchTimer = setTimeout(function(){
        liveSearchProducts(query);
    },350);
});

function liveSearchProducts(query){
    document.getElementById("productResults").innerHTML =
    "<div class='empty-state'>Searching...</div>";

    InventoryAPI.request("/search?query=" + encodeURIComponent(query))
    .then(data=>{
        if(!data.success || !data.results || data.results.length === 0){
            document.getElementById("productResults").innerHTML =
            "<div class='empty-state'>No products found.</div>";
            return;
        }

        let html = "<div class='result-grid'>";

        data.results.forEach(item=>{
            html += `
                <div class="result-card">
                    <div class="result-title">${item.description}</div>
                    <div class="badge barcode-badge">${item.barcode}</div>
                    <div class="badge qty-badge">Qty ${item.totalQty}</div>

                    <button class="print-button" data-ios-click="h8e505adce2abc129" data-ios-click-args="${InventoryEvents.encode([item.barcode])}">
                        Print Product Label
                    </button>
                </div>
            `;
        });

        html += "</div>";

        document.getElementById("productResults").innerHTML = html;
    })
    .catch(error=>{
        console.error(error);

        document.getElementById("productResults").innerHTML =
        "<div class='empty-state'>Error searching products.</div>";
    });
}

/* LOCATION LABELS */

function loadBoxes(){
    const words = locationWords();
    const select =
        document.getElementById("boxSelect");

    select.innerHTML =
        '<option value="">' +
        "Loading " +
        words.pluralLower +
        "..." +
        "</option>";

    InventoryAPI.request(
        "/boxes?_t=" +
        Date.now()
    )
    .then(data=>{
        if(data.success && data.boxes){
            fillBoxes(data.boxes);
            return;
        }

        select.innerHTML =
            '<option value="">' +
            "Could not load " +
            words.pluralLower +
            "</option>";
    })
    .catch(error=>{
        console.error(error);

        select.innerHTML =
            '<option value="">' +
            "Could not load " +
            words.pluralLower +
            "</option>";
    });
}

function fillBoxes(boxes){
    const words = locationWords();
    const select =
        document.getElementById("boxSelect");

    select.innerHTML =
        '<option value="">' +
        "Select " +
        words.singular +
        "</option>";

    if(!boxes || boxes.length === 0){
        select.innerHTML =
            '<option value="">' +
            "No " +
            words.pluralLower +
            " found" +
            "</option>";

        applyBarcodePrintingLocationWording();
        return;
    }

    boxes.forEach(item=>{
        const option =
            document.createElement("option");

        const boxName =
            item.box ||
            item.box_name;

        option.value = boxName;
        InventoryWorkspace.setLocationName(option, boxName);
        select.appendChild(option);
    });

    applyBarcodePrintingLocationWording();
}

function printBoxLabel(){
    const words = locationWords();

    const box =
        document
            .getElementById("boxSelect")
            .value;

    if(!box){
        alert(
            "Select a " +
            words.singularLower +
            " first"
        );
        return;
    }

    printSingleBarcode(box, true);
}

/* RANGE LABELS */

function generateRangeLabels(){
    const prefix =
    document.getElementById("rangePrefix")
    .value
    .trim()
    .toUpperCase() || "ITEM-";

    const start = Number(document.getElementById("rangeStart").value);
    const end = Number(document.getElementById("rangeEnd").value);

    if(!start || !end){
        alert("Enter start and end numbers");
        return;
    }

    if(end < start){
        alert("End number must be higher than start number");
        return;
    }

    const total = end - start + 1;

    if(total > 300){
        alert("Maximum 300 labels at once");
        return;
    }

    let barcodes = [];

    for(let i = start; i <= end; i++){
        barcodes.push(prefix + i);
    }

    renderBarcodes(barcodes);

    document.getElementById("rangePreview").innerHTML =
    "Generated " + total + " labels: " + prefix + start + " to " + prefix + end;
}

/* PRINT JOBS */

let deletingPrintJob = false;
let printJobRequestVersion = 0;

async function deleteSelectedPrintJob(){
    if(deletingPrintJob) return;
    const select = document.getElementById("printJobSelect");
    const jobId = select.value;
    if(!jobId){
        alert("Select a print job first.");
        return;
    }
    const option = select.options[select.selectedIndex];
    const name = option.dataset.jobName || option.textContent;
    if(!confirm('Delete print job "' + name + '" and all its saved labels?\n\nYour products and stock quantities will not change. This cannot be undone.')) return;
    const button = document.getElementById("deletePrintJobButton");
    deletingPrintJob = true;
    ++printJobRequestVersion;
    hideLoading();
    select.disabled = true;
    button.disabled = true;
    button.textContent = "Deleting…";
    try{
        const data = await InventoryAPI.request("/print-jobs/" + encodeURIComponent(jobId), {method:"DELETE"});
        if(!data.success) throw new Error(data.error || "Could not delete print job. Check that the updated printjobs.js is installed and the backend has restarted.");
        clearLoadedLabels();
        localStorage.removeItem("inventoryPrintJobs");
        option.remove();
        select.value = "";
        loadPrintJobs();
        alert('Print job "' + name + '" deleted. Your stock is unchanged.');
    }catch(error){
        alert(error.message || "Could not confirm deletion. Refresh the job list before trying again.");
    }finally{
        deletingPrintJob = false;
        select.disabled = false;
        button.disabled = false;
        button.textContent = "Delete Print Job";
    }
}

function loadPrintJobs(){
    const cached = localStorage.getItem("inventoryPrintJobs");

    if(cached){
        try{
            fillPrintJobs(JSON.parse(cached));
        }catch(e){}
    }

    InventoryAPI.request("/print-jobs")
    .then(data=>{
        if(data.success && data.printJobs){
            localStorage.setItem("inventoryPrintJobs", JSON.stringify(data.printJobs));
            fillPrintJobs(data.printJobs);
        }
    })
    .catch(error=>{
        console.error(error);
    });
}

function fillPrintJobs(jobs){
    const select = document.getElementById("printJobSelect");

    select.innerHTML = '<option value="">Select Print Job</option>';

    if(!jobs || jobs.length === 0){
        select.innerHTML = '<option value="">No print jobs found</option>';
        return;
    }

    jobs.slice().reverse().forEach(job=>{
        const option = document.createElement("option");
        option.value = job.printJobId;
        option.dataset.jobName = job.name || "Unnamed print job";
        option.textContent =
        (job.name || "Unnamed print job") + " (" + job.labelCount + " labels)";
        select.appendChild(option);
    });
}

function loadSelectedPrintJob(){
    if(deletingPrintJob) return;
    const requestVersion = ++printJobRequestVersion;
    const printJobId = document.getElementById("printJobSelect").value;

    if(!printJobId){
        alert("Select a print job first");
        return;
    }

    showLoading();

    InventoryAPI.request("/print-jobs/" + encodeURIComponent(printJobId) + "/labels")
    .then(data=>{
        if(requestVersion !== printJobRequestVersion) return;
        hideLoading();

        if(!data.success){
            document.getElementById("jobSummary").innerHTML =
            "<div class='empty-state'>" + (data.error || "Could not load labels") + "</div>";
            return;
        }

        const labels = data.labels || [];
        renderBarcodes(labels);
        renderJobPreview(data.printJob && data.printJob.name, labels);
    })
    .catch(error=>{
        if(requestVersion !== printJobRequestVersion) return;
        hideLoading();
        console.error(error);

        document.getElementById("jobSummary").innerHTML =
        "<div class='empty-state'>Error loading print job.</div>";
    });
}

function renderJobPreview(jobName, labels){
    const nameElement = document.createElement("span");
    nameElement.textContent = jobName || "Unnamed print job";
    if(labels.length === 0){
        document.getElementById("jobSummary").innerHTML =
        "<div class='empty-state'>This print job has no labels.</div>";
        document.getElementById("jobPreview").innerHTML = "";
        return;
    }

    const uniqueCount = new Set(labels).size;

    document.getElementById("jobSummary").innerHTML = `
        <div class="summary-grid">
            <div class="summary-card">
                <div class="summary-title">Print Job</div>
                <div class="summary-value">${nameElement.innerHTML}</div>
            </div>

            <div class="summary-card">
                <div class="summary-title">Total Labels</div>
                <div class="summary-value">${labels.length}</div>
            </div>

            <div class="summary-card">
                <div class="summary-title">Different Barcodes</div>
                <div class="summary-value">${uniqueCount}</div>
            </div>
        </div>
    `;

    let html = "<div class='preview-grid'>";

    labels.forEach(barcode=>{
        html += `<div class="preview-label">${barcode}</div>`;
    });

    html += "</div>";

    document.getElementById("jobPreview").innerHTML = html;
}

/* QUICK PRINT */

function quickPrint(){
    const barcode =
    document.getElementById("quickBarcode")
    .value
    .trim()
    .toUpperCase();

    if(!barcode){
        alert("Enter a barcode first");
        return;
    }

    printSingleBarcode(barcode);
}

/* ENTER SHORTCUTS */

document.getElementById("quickBarcode").addEventListener("keydown",function(e){
    if(e.key === "Enter"){
        e.preventDefault();
        quickPrint();
    }
});

document.getElementById("rangeEnd").addEventListener("keydown",function(e){
    if(e.key === "Enter"){
        e.preventDefault();
        generateRangeLabels();
    }
});

window.addEventListener(
    "inventory-selection-changed",
    function(){
        loadedLabels = [];
        document.getElementById(
            "printLabels"
        ).innerHTML = "";

        applyBarcodePrintingLocationWording();
        loadBoxes();
        loadPrintJobs();
    }
);

async function initialiseBarcodePrintingPage(){
    try{
        if(
            typeof InventoryWorkspace !== "undefined" &&
            InventoryWorkspace &&
            typeof InventoryWorkspace.init === "function"
        ){
            await InventoryWorkspace.init();
        }
    }catch(error){
        console.error(
            "Could not initialise workspace wording:",
            error
        );
    }

    applyBarcodePrintingLocationWording();
    restoreActiveTab();
    loadBoxes();
    loadPrintJobs();
}

window.addEventListener("inventoryos-location-wording-changed", applyBarcodePrintingLocationWording);

if(document.readyState === "loading"){
    document.addEventListener(
        "DOMContentLoaded",
        initialiseBarcodePrintingPage,
        {
            once:true
        }
    );
}else{
    initialiseBarcodePrintingPage();
}
