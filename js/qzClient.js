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

        if(qz.websocket.isActive()){
            return Promise.resolve();
        }

        if(connectionPromise){
            return connectionPromise;
        }

        connectionPromise =
            qz.websocket.connect()
            .finally(function(){
                connectionPromise = null;
            });

        return connectionPromise;
    }

    function disconnect(){
        if(
            typeof qz === "undefined" ||
            !qz ||
            !qz.websocket.isActive()
        ){
            return Promise.resolve();
        }

        return qz.websocket.disconnect();
    }

    function listPrinters(){
        return connect()
            .then(function(){
                return qz.printers.find();
            })
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

        return connect()
            .then(function(){
                return qz.printers.find(
                    name
                );
            })
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

    function getStatus(){
        return InventoryAPI.request(
            "/qz/status?_t=" +
            Date.now()
        );
    }

    return {
        configureSecurity,
        connect,
        disconnect,
        listPrinters,
        requirePrinter,
        getStatus,
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
