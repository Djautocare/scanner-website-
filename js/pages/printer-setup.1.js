
if(!InventoryAPI.requireLogin()){
    throw new Error("Login required");
}

function setStatus(message,state){
    const box =
        document.getElementById(
            "status"
        );

    box.textContent = message;
    box.className =
        "status" +
        (
            state
                ? " " + state
                : ""
        );
}

function fillSelect(
    select,
    printers,
    selected
){
    select.innerHTML =
        '<option value="">Select printer</option>';

    printers.forEach(function(name){
        const option =
            document.createElement(
                "option"
            );

        option.value = name;
        option.textContent = name;
        select.appendChild(option);
    });

    if(
        selected &&
        printers.includes(selected)
    ){
        select.value = selected;
    }
}

let printerRefreshPromise = null;

function refreshPrinters(){
    if(printerRefreshPromise){
        return printerRefreshPromise;
    }

    const button =
        document.getElementById(
            "refreshPrintersButton"
        );

    printerRefreshPromise =
        (async function(){
            if(button){
                button.disabled = true;
                button.textContent =
                    "Connecting...";
            }

            setStatus(
                "Connecting to QZ Tray...",
                ""
            );

            try{
                const printers =
                    await InventoryOSQZ
                        .listPrinters();

                fillSelect(
                    document.getElementById(
                        "productPrinter"
                    ),
                    printers,
                    InventoryOSQZ
                        .getProductPrinterName()
                );

                fillSelect(
                    document.getElementById(
                        "shippingPrinter"
                    ),
                    printers,
                    InventoryOSQZ
                        .getShippingPrinterName()
                );

                setStatus(
                    printers.length
                        ? printers.length +
                          " printer" +
                          (
                            printers.length === 1
                                ? ""
                                : "s"
                          ) +
                          " found."
                        : "QZ Tray connected, but no printers were found.",
                    printers.length
                        ? "ok"
                        : "error"
                );

                return printers;
            }catch(error){
                console.error(error);

                setStatus(
                    error.message ||
                    String(error),
                    "error"
                );

                throw error;
            }finally{
                if(button){
                    button.disabled = false;
                    button.textContent =
                        "Refresh Printers";
                }
            }
        })()
        .finally(function(){
            printerRefreshPromise = null;
        });

    return printerRefreshPromise;
}

async function checkBackend(){
    setStatus(
        "Checking secure QZ signing...",
        ""
    );

    try{
        const data =
            await InventoryOSQZ.getStatus();

        if(!data.success){
            throw new Error(
                data.error ||
                "QZ signing is not configured"
            );
        }

        setStatus(
            "Secure backend signing is working. Certificate valid until " +
            data.certificate.valid_to +
            ".",
            "ok"
        );
    }catch(error){
        console.error(error);

        setStatus(
            error.message ||
            String(error),
            "error"
        );
    }
}

function saveSettings(requireBoth = true){
    const product =
        document.getElementById(
            "productPrinter"
        ).value;

    const shipping =
        document.getElementById(
            "shippingPrinter"
        ).value;

    if(
        requireBoth &&
        (
            !product ||
            !shipping
        )
    ){
        setStatus(
            "Select both printers before saving.",
            "error"
        );

        return false;
    }

    InventoryOSQZ.savePrinterNames(
        product ||
        InventoryOSQZ
            .getProductPrinterName(),

        shipping ||
        InventoryOSQZ
            .getShippingPrinterName()
    );

    if(requireBoth){
        setStatus(
            "Printer settings saved for this computer.",
            "ok"
        );
    }

    return true;
}

async function makeTestLabelPdfBase64(
    role,
    widthInches,
    heightInches
){
    if(
        typeof PDFLib === "undefined" ||
        !PDFLib
    ){
        throw new Error(
            "PDF library did not load"
        );
    }

    const PDFDocument =
        PDFLib.PDFDocument;

    const StandardFonts =
        PDFLib.StandardFonts;

    const rgb =
        PDFLib.rgb;

    const document =
        await PDFDocument.create();

    const widthPoints =
        widthInches * 72;

    const heightPoints =
        heightInches * 72;

    const page =
        document.addPage([
            widthPoints,
            heightPoints
        ]);

    const boldFont =
        await document.embedFont(
            StandardFonts.HelveticaBold
        );

    const regularFont =
        await document.embedFont(
            StandardFonts.Helvetica
        );

    const isProduct =
        role === "product";

    const border =
        isProduct
            ? 3
            : 5;

    const padding =
        isProduct
            ? 5
            : 14;

    page.drawRectangle({
        x:padding,
        y:padding,
        width:
            widthPoints -
            padding * 2,

        height:
            heightPoints -
            padding * 2,

        borderWidth:border,
        borderColor:rgb(0,0,0)
    });

    function centredText(
        text,
        y,
        size,
        font = boldFont
    ){
        const textWidth =
            font.widthOfTextAtSize(
                text,
                size
            );

        page.drawText(
            text,
            {
                x:
                    (
                        widthPoints -
                        textWidth
                    ) / 2,

                y,
                size,
                font,
                color:rgb(0,0,0)
            }
        );
    }

    centredText(
        "InventoryOS",
        isProduct
            ? heightPoints - 19
            : heightPoints - 45,

        isProduct
            ? 10
            : 24
    );

    centredText(
        isProduct
            ? "2 x 1 TEST"
            : "4 x 6 TEST",

        isProduct
            ? heightPoints - 37
            : heightPoints - 120,

        isProduct
            ? 13
            : 34
    );

    const barcodeLeft =
        widthPoints *
        (
            isProduct
                ? 0.13
                : 0.14
        );

    const barcodeBottom =
        heightPoints *
        (
            isProduct
                ? 0.19
                : 0.36
        );

    const barcodeWidth =
        widthPoints * 0.74;

    const barcodeHeight =
        heightPoints *
        (
            isProduct
                ? 0.23
                : 0.25
        );

    let x = barcodeLeft;
    let index = 0;

    const unit =
        isProduct
            ? 1.1
            : 2.5;

    const barPattern =
        [1,2,1,3,2,1,2,3];

    const gapPattern =
        [1,1,2,1,2,1,1,2];

    while(
        x <
        barcodeLeft +
        barcodeWidth
    ){
        const barWidth =
            unit *
            barPattern[
                index %
                barPattern.length
            ];

        page.drawRectangle({
            x,
            y:barcodeBottom,
            width:barWidth,
            height:barcodeHeight,
            color:rgb(0,0,0)
        });

        x +=
            barWidth +
            unit *
            gapPattern[
                index %
                gapPattern.length
            ];

        index++;
    }

    centredText(
        isProduct
            ? "PRODUCT LABEL PRINTER"
            : "SHIPPING LABEL PRINTER",

        isProduct
            ? 8
            : 70,

        isProduct
            ? 6.2
            : 16
    );

    if(!isProduct){
        centredText(
            "Portrait - Full 4 x 6 page",
            42,
            13,
            regularFont
        );
    }

    return document.saveAsBase64();
}

async function printTest(
    role,
    width,
    height
){
    const selectId =
        role === "product"
            ? "productPrinter"
            : "shippingPrinter";

    const selectedPrinter =
        document.getElementById(
            selectId
        ).value;

    if(!selectedPrinter){
        setStatus(
            role === "product"
                ? "Select a 2×1 printer first."
                : "Select a 4×6 printer first.",
            "error"
        );

        return;
    }

    if(role === "product"){
        InventoryOSQZ.savePrinterNames(
            selectedPrinter,
            InventoryOSQZ
                .getShippingPrinterName()
        );
    }else{
        InventoryOSQZ.savePrinterNames(
            InventoryOSQZ
                .getProductPrinterName(),
            selectedPrinter
        );
    }

    try{
        setStatus(
            "Building test PDF...",
            ""
        );

        const pdfBase64 =
            await makeTestLabelPdfBase64(
                role,
                width,
                height
            );

        setStatus(
            "Connecting to QZ Tray...",
            ""
        );

        const printer =
            await InventoryOSQZ
                .requirePrinter(role);

        const config =
            qz.configs.create(
                printer,
                {
                    size:{
                        width,
                        height
                    },

                    units:"in",
                    margins:0,
                    copies:1,
                    orientation:"portrait",
                    colorType:"grayscale",
                    scaleContent:true,

                    jobName:
                        role === "product"
                            ? "InventoryOS 2x1 Test"
                            : "InventoryOS 4x6 Test"
                }
            );

        setStatus(
            "Sending PDF test label to " +
            printer +
            "...",
            ""
        );

        await qz.print(
            config,
            [{
                type:"pixel",
                format:"pdf",
                flavor:"base64",
                data:pdfBase64,

                options:{
                    ignoreTransparency:true
                }
            }]
        );

        setStatus(
            "QZ Tray accepted the PDF test job for " +
            printer +
            ". Check the printer and Windows print queue.",
            "ok"
        );
    }catch(error){
        console.error(
            "QZ PDF test print failed:",
            error
        );

        setStatus(
            "Test print failed: " +
            (
                error?.message ||
                String(error)
            ),
            "error"
        );
    }
}

function testProductPrinter(){
    return printTest(
        "product",
        2,
        1
    );
}

function testShippingPrinter(){
    return printTest(
        "shipping",
        4,
        6
    );
}

document.addEventListener(
    "DOMContentLoaded",
    async function(){
        await checkBackend();

        try{
            await refreshPrinters();
        }catch(error){
            // The visible status box already explains the connection error.
        }
    },
    {
        once:true
    }
);
