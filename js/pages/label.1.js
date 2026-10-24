
if(!InventoryAPI.requireLogin()){
    throw new Error("Login required");
}

const params = new URLSearchParams(window.location.search);

const barcode =
params.get("barcode") || "NO-BARCODE";

const autoPrint =
params.get("autoprint") || "";

document.getElementById("barcodeText")
.innerText = barcode;

document.getElementById("barcodeDisplay")
.innerText = "Barcode: " + barcode;

JsBarcode("#barcode", barcode, {
    format:"CODE128",
    displayValue:false,
    width:1,
    height:35,
    margin:8
});

if(autoPrint === "1"){
    window.addEventListener("load", function(){
        setTimeout(function(){
            window.print();
        }, 250);
    });
}
