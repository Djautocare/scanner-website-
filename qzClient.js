const InventoryOSQZ = (function(){
    const PRODUCT_PRINTER_KEY =
        "inventoryos_printer_2x1";

    const SHIPPING_PRINTER_KEY =
        "inventoryos_printer_4x6";

    let securityConfigured = false;
    let connectionPromise = null;

    function ensureDependencies(){
        if(
            typeof InventoryAPI === "undefined" ||
            !InventoryAPI
        ){
            throw new Error(
                "InventoryAPI is not available"
            );
        }

        if(
            typeof qz === "undefined" ||
            !qz
        ){
            throw new Error(
                "QZ Tray library did not load"
            );
        }
    }

    function configureSecurity(){
        ensureDependencies();

        if(securityConfigured){
            return;
        }

        qz.security.setCertificatePromise(
            function(resolve,reject){
                InventoryAPI.request(
                    "/qz/certificate?_t=" +
                    Date.now()
                )
                .then(function(data){
                    if(
                        !data ||
                        !data.success ||
                        !data.certificate
                    ){
                        throw new Error(
                            data?.error ||
                            "Could not load the InventoryOS QZ certificate"
                        );
                    }

                    resolve(
                        data.certificate
                    );
                })
                .catch(reject);
            }
        );

        qz.security.setSignatureAlgorithm(
            "SHA512"
        );

        qz.security.setSignaturePromise(
            function(toSign){
                return function(
                    resolve,
                    reject
                ){
                    InventoryAPI.request(
                        "/qz/sign",
                        {
                            method:"POST",
                            body:JSON.stringify({
                                request:toSign
                            })
                        }
                    )
                    .then(function(data){
                        if(
                            !data ||
                            !data.success ||
                            !data.signature
                        ){
                            throw new Error(
                                data?.error ||
                                "Could not sign the QZ request"
                            );
                        }

                        resolve(
                            data.signature
                        );
                    })
                    .catch(reject);
                };
            }
        );

        securityConfigured = true;
    }

    function connect(){
        ensureDependencies();
        configureSecurity();

        /*
            Check the pending promise before isActive().

            QZ can report an active socket while the connection is still
            finishing its setup. A second caller must wait for the original
            connection promise instead of trying to use the socket early.
        */
        if(connectionPromise){
            return connectionPromise;
        }

        if(qz.websocket.isActive()){
            return Promise.resolve();
        }

        connectionPromise =
            qz.websocket.connect({
                retries:3,
                delay:1
            })
            .then(function(){
                if(!qz.websocket.isActive()){
                    throw new Error(
                        "QZ Tray did not finish connecting"
                    );
                }
            })
            .finally(function(){
                connectionPromise = null;
            });

        return connectionPromise;
    }

    function disconnect(){
        if(
            typeof qz === "undefined" ||
            !qz
        ){
            connectionPromise = null;
            return Promise.resolve();
        }

        connectionPromise = null;

        if(!qz.websocket.isActive()){
            return Promise.resolve();
        }

        return qz.websocket.disconnect()
            .catch(function(){
                // A half-open QZ socket can fail while disconnecting.
                // The following reconnect will create a fresh connection.
            });
    }

    function shouldReconnect(error){
        const message = String(
            error?.message ||
            error ||
            ""
        ).toLowerCase();

        return (
            message.includes(
                "senddata is not a function"
            ) ||
            message.includes(
                "socket is not open"
            ) ||
            message.includes(
                "websocket"
            ) ||
            message.includes(
                "connection"
            ) ||
            message.includes(
                "disconnected"
            )
        );
    }

    function reconnect(){
        return disconnect()
            .then(function(){
                return new Promise(
                    function(resolve){
                        setTimeout(
                            resolve,
                            250
                        );
                    }
                );
            })
            .then(connect);
    }

    function runConnected(
        operation,
        hasRetried = false
    ){
        return connect()
            .then(operation)
            .catch(function(error){
                if(
                    hasRetried ||
                    !shouldReconnect(error)
                ){
                    throw error;
                }

                return reconnect()
                    .then(function(){
                        return runConnected(
                            operation,
                            true
                        );
                    });
            });
    }

    function listPrinters(){
        return runConnected(
            function(){
                return qz.printers.find();
            }
        )
        .then(function(printers){
            return Array.isArray(printers)
                ? printers
                : [];
        });
    }

    function getProductPrinterName(){
        return String(
            localStorage.getItem(
                PRODUCT_PRINTER_KEY
            ) || ""
        ).trim();
    }

    function getShippingPrinterName(){
        return String(
            localStorage.getItem(
                SHIPPING_PRINTER_KEY
            ) || ""
        ).trim();
    }

    function savePrinterNames(
        productPrinter,
        shippingPrinter
    ){
        const product =
            String(
                productPrinter || ""
            ).trim();

        const shipping =
            String(
                shippingPrinter || ""
            ).trim();

        if(product){
            localStorage.setItem(
                PRODUCT_PRINTER_KEY,
                product
            );
        }else{
            localStorage.removeItem(
                PRODUCT_PRINTER_KEY
            );
        }

        if(shipping){
            localStorage.setItem(
                SHIPPING_PRINTER_KEY,
                shipping
            );
        }else{
            localStorage.removeItem(
                SHIPPING_PRINTER_KEY
            );
        }

        window.dispatchEvent(
            new CustomEvent(
                "inventoryos-printers-changed",
                {
                    detail:{
                        productPrinter:
                            product,

                        shippingPrinter:
                            shipping
                    }
                }
            )
        );

        return {
            productPrinter:product,
            shippingPrinter:shipping
        };
    }

    function configuredName(role){
        if(role === "product"){
            return getProductPrinterName();
        }

        if(role === "shipping"){
            return getShippingPrinterName();
        }

        throw new Error(
            "Unknown printer role: " +
            role
        );
    }

    function requirePrinter(role){
        const name = configuredName(role);

        if(!name){
            const description =
                role === "product"
                    ? "2×1 product label"
                    : "4×6 shipping label";

            throw new Error(
                "No " +
                description +
                " printer is selected. Open Printer Setup."
            );
        }

        return runConnected(
            function(){
                return qz.printers.find(
                    name
                );
            }
        )
            .then(function(printer){
                if(!printer){
                    throw new Error(
                        "The selected printer is not available: " +
                        name
                    );
                }

                return printer;
            });
    }

    function escapeHtml(value){
        return String(value == null ? "" : value)
            .replace(/&/g,"&amp;").replace(/</g,"&lt;")
            .replace(/>/g,"&gt;").replace(/"/g,"&quot;")
            .replace(/'/g,"&#39;");
    }

    function printProductLabels(labels){
        if(typeof JsBarcode === "undefined"){
            return Promise.reject(new Error("Barcode label library did not load"));
        }
        if(!Array.isArray(labels) || !labels.length){
            return Promise.reject(new Error("There are no product labels to print"));
        }
        return requirePrinter("product").then(function(printer){
            const config=qz.configs.create(printer,{
                size:{width:2,height:1},units:"in",margins:0,
                copies:1,scaleContent:false
            });
            let chain=Promise.resolve();
            labels.forEach(function(label){
                const barcode=String(label.barcode||"").trim();
                const description=String(label.description||"").trim();
                const quantity=Math.max(1,Math.min(1000,Number(label.quantity||1)));
                if(!barcode) throw new Error("A product barcode is missing");
                const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
                JsBarcode(svg,barcode,{format:"CODE128",displayValue:false,width:1.4,height:35,margin:0});
                const labelHtml='<div style="width:2in;height:1in;padding:.04in .07in;overflow:hidden;text-align:center;font-family:Arial;background:white"><div style="color:#000;font-weight:bold;font-size:8px;height:10px;overflow:hidden;white-space:nowrap">'+escapeHtml(description)+'</div>'+svg.outerHTML+'<div style="color:#000;font-size:8px;font-weight:bold">'+escapeHtml(barcode)+'</div></div>';
                for(let i=0;i<quantity;i++){
                    chain=chain.then(function(){
                        return qz.print(config,[{type:"pixel",format:"html",flavor:"plain",data:labelHtml}]);
                    });
                }
            });
            return chain;
        });
    }

    function getStatus(){
        return InventoryAPI.request(
            "/qz/status?_t=" +
            Date.now()
        );
    }

    return {
        configureSecurity,
        connect,
        reconnect,
        disconnect,
        listPrinters,
        requirePrinter,
        getStatus,
        printProductLabels,
        savePrinterNames,
        getProductPrinterName,
        getShippingPrinterName,

        keys:{
            product:
                PRODUCT_PRINTER_KEY,

            shipping:
                SHIPPING_PRINTER_KEY
        }
    };
})();

window.InventoryOSQZ =
    InventoryOSQZ;

