
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

    InventoryAPI.request("/boxes?_t=" + Date.now())
    .then(data=>{
        hideLoading();

        const select = document.getElementById("boxSelect");
        select.innerHTML = '<option value="">Select Box</option>';

        if(!data.success || !data.boxes || data.boxes.length===0){
            select.innerHTML = '<option value="">No boxes found</option>';
            InventoryWorkspace.setLocationName(document.getElementById("previewBox"), "—");
            return;
        }

        data.boxes.forEach(item=>{
            const boxName = item.box || item.box_name;
            const option = document.createElement("option");
            option.value = boxName;
            InventoryWorkspace.setLocationName(option, boxName);
            select.appendChild(option);
        });

        updatePreview();
    })
    .catch(error=>{
        hideLoading();
        console.error(error);
        alert(InventoryWorkspace.localiseMessage("Could not load boxes"));
    });
}

function updatePreview(){
    const box = document.getElementById("boxSelect").value;
    InventoryWorkspace.setLocationName(document.getElementById("previewBox"), box || "—");
}

function printSelectedBox(){
    const box = document.getElementById("boxSelect").value;

    if(!box){
        alert(InventoryWorkspace.localiseMessage("Select a box first"));
        return;
    }

    InventoryWorkspace.setLocationName(document.getElementById("barcodeText"), box);

    JsBarcode("#barcode", box, {
        format:"CODE128",
        displayValue:false,
        width:1.1,
        height:38,
        margin:0
    });

    setTimeout(function(){
        window.print();
    },200);
}

window.addEventListener("inventory-selection-changed", function(){
    loadBoxes();
});

loadBoxes();
