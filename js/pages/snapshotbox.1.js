function uploadSafeText(value){return String(value ?? "").replace(/[&<>"']/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]));}

if(!InventoryAPI.requireLogin()){
    throw new Error("Login required");
}


function showLoading(){
    document.getElementById("loadingOverlay").style.display = "flex";
}

function hideLoading(){
    document.getElementById("loadingOverlay").style.display = "none";
}

function todayText(){
    const date = new Date();

    return date.toLocaleDateString("en-GB",{
        day:"2-digit",
        month:"2-digit",
        year:"numeric"
    });
}

function money(value){
    return "£" + Number(value || 0).toFixed(2);
}

function defaultBatchName(box){
    if(!box){
        return "";
    }

    return box + " - " + todayText();
}

function updatePreview(){
    const box =
    document.getElementById("boxSelect").value;

    const nameInput =
    document.getElementById("batchName");

    if(box && !nameInput.dataset.userEdited){
        nameInput.value = defaultBatchName(box);
    }

    const name =
    nameInput.value.trim();

    const cost =
    document.getElementById("batchCost").value;

    document.getElementById("previewBox").innerText =
    InventoryWorkspace.formatLocationName(box || "—");

    document.getElementById("previewName").innerText =
    name || "—";

    document.getElementById("previewCost").innerText =
    money(cost);
}

document.getElementById("batchName").addEventListener("input",function(){
    this.dataset.userEdited = "true";
    updatePreview();
});

function loadStorageBoxes(){
    showLoading();

    InventoryAPI.request("/boxes")
    .then(data=>{
        hideLoading();

        const select =
        document.getElementById("boxSelect");

        select.innerHTML =
        '<option value="">Select Storage Box</option>';

        if(!data.success || data.boxes.length === 0){
            select.innerHTML =
            '<option value="">No storage boxes found</option>';
            updatePreview();
            return;
        }

        data.boxes.forEach(item=>{
            const option =
            document.createElement("option");

            const boxName = item.box || item.box_name;
            option.value = boxName;
            InventoryWorkspace.setLocationName(option, boxName);

            select.appendChild(option);
        });

        updatePreview();
    })
    .catch(error=>{
        hideLoading();
        console.error(error);

        document.getElementById("boxSelect").innerHTML =
        '<option value="">Could not load boxes</option>';
    });
}

function createSnapshotBatch(){
    const box =
    document.getElementById("boxSelect").value;

    const name =
    document.getElementById("batchName").value.trim() ||
    defaultBatchName(box);

    const cost =
    document.getElementById("batchCost").value || 0;

    const notes =
    document.getElementById("batchNotes").value.trim();

    if(!box){
        alert("Select a storage box first");
        return;
    }

    if(!confirm("Create a new MB for " + InventoryWorkspace.formatLocationName(box) + " and snapshot the current contents?")){
        return;
    }

    document.getElementById("result").innerHTML = "";

    showLoading();

    InventoryAPI.request("/mystery-boxes/snapshot",{
        method:"POST",
        body:JSON.stringify({
            box:box,
            name:name,
            cost:Number(cost || 0),
            notes:notes
        })
    })
    .then(result=>{
        hideLoading();

        if(!result.success){
            document.getElementById("result").innerHTML =
            "<div class='error-card'>" + uploadSafeText(result.error || "Snapshot failed") + "</div>";
            return;
        }

        document.getElementById("result").innerHTML =
        `
        <div class="success-card">
            Snapshot batch created<br><br>
            ${uploadSafeText(result.mysteryBoxId)} — ${uploadSafeText(result.name)}<br>
            Cost: ${money(result.cost)}<br><br>
            ${InventoryWorkspace.locationNameHtml(result.box)} copied into ${uploadSafeText(result.mysteryBoxId)}<br>
            Different items: ${result.differentItems}<br>
            Total quantity: ${result.totalQty}
        </div>
        `;

        document.getElementById("batchCost").value = "";
        document.getElementById("batchNotes").value = "";
        document.getElementById("batchName").value = "";
        document.getElementById("batchName").dataset.userEdited = "";
        document.getElementById("boxSelect").value = "";

        updatePreview();
    })
    .catch(error=>{
        hideLoading();
        console.error(error);

        document.getElementById("result").innerHTML =
        "<div class='error-card'>" + error.message + "</div>";
    });
}

document.getElementById("batchCost").addEventListener("keydown",function(e){
    if(e.key === "Enter"){
        e.preventDefault();
        createSnapshotBatch();
    }
});

loadStorageBoxes();
