
if(!InventoryAPI.requireLogin()){
    throw new Error("Login required");
}


let loadedLabels = [];

function showLoading(){
    document.getElementById("loadingOverlay").style.display = "flex";
}

function hideLoading(){
    document.getElementById("loadingOverlay").style.display = "none";
}

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
    showLoading();

    InventoryAPI.request("/print-jobs")
    .then(data=>{
        hideLoading();

        const select = document.getElementById("printJobSelect");

        select.innerHTML = '<option value="">Select Print Job</option>';

        if(!data.success || !data.printJobs || data.printJobs.length === 0){
            select.innerHTML = '<option value="">No print jobs found</option>';
            return;
        }

        localStorage.setItem("inventoryPrintJobs", JSON.stringify(data.printJobs));

        data.printJobs.slice().reverse().forEach(job=>{
            const option = document.createElement("option");
            option.value = job.printJobId || job.id;
            option.dataset.jobName = job.name || "Unnamed print job";
            option.textContent =
            (job.name || "Unnamed print job") + " (" + job.labelCount + " labels)";
            select.appendChild(option);
        });
    })
    .catch(error=>{
        hideLoading();
        console.error(error);
        alert("Could not load print jobs");
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
            document.getElementById("summary").innerHTML =
            "<div class='empty-state'>" + (data.error || "Could not load labels") + "</div>";
            return;
        }

        loadedLabels = data.labels || [];

        renderPrintableLabels(loadedLabels);
        renderPreview(data.printJob && data.printJob.name, loadedLabels);
    })
    .catch(error=>{
        if(requestVersion !== printJobRequestVersion) return;
        hideLoading();
        console.error(error);
        document.getElementById("summary").innerHTML =
        "<div class='empty-state'>Error loading print job labels.</div>";
    });
}

function renderPrintableLabels(labels){
    const container = document.getElementById("printLabels");

    let html = "";

    labels.forEach((barcode,index)=>{
        html += `
            <div class="print-label">
                <svg id="job_barcode_${index}"></svg>
                <p class="label-text">${barcode}</p>
            </div>
        `;
    });

    container.innerHTML = html;

    labels.forEach((barcode,index)=>{
        JsBarcode("#job_barcode_" + index, barcode, {
            format:"CODE128",
            displayValue:false,
            width:1.2,
            height:42,
            margin:0
        });
    });
}

function renderPreview(jobName, labels){
    const nameElement = document.createElement("span");
    nameElement.textContent = jobName || "Unnamed print job";
    if(labels.length === 0){
        document.getElementById("summary").innerHTML =
        "<div class='empty-state'>This print job has no labels.</div>";

        document.getElementById("preview").innerHTML = "";
        return;
    }

    const uniqueCount = new Set(labels).size;

    document.getElementById("summary").innerHTML = `
        <div class="form-card">
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
        </div>
    `;

    let previewHtml = "<div class='form-card'><div class='input-label'>Preview</div><div class='preview-grid'>";

    labels.forEach(barcode=>{
        previewHtml += `<div class="preview-label">${barcode}</div>`;
    });

    previewHtml += "</div></div>";

    document.getElementById("preview").innerHTML = previewHtml;
}

function printLoadedLabels(){
    if(!loadedLabels || loadedLabels.length === 0){
        alert("Load a print job first");
        return;
    }

    setTimeout(function(){
        window.print();
    }, 200);
}

function clearLoadedLabels(){
    loadedLabels = [];
    document.getElementById("printLabels").innerHTML = "";
    document.getElementById("summary").innerHTML = "";
    document.getElementById("preview").innerHTML = "";
}

loadPrintJobs();
