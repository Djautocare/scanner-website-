const InventoryOSRemovePreferences = (function(){
    const DEFAULTS = {
        track_sales_data:true,
        show_usb_scanner_mode:true,
        show_listening_mode:true
    };

    const CACHE_KEY = "inventoryos_remove_page_preferences";

    let current = {...DEFAULTS};
    let canEdit = false;
    let originalRemoveBundleStock = null;
    let originalToggleUsbScannerMode = null;
    let originalSpeakText = null;
    let originalSetWarehouseStatus = null;
    let resultObserver = null;

    function readCache(){
        try{
            const parsed = JSON.parse(
                localStorage.getItem(CACHE_KEY) ||
                "null"
            );

            if(!parsed || typeof parsed !== "object"){
                return {...DEFAULTS};
            }

            return {
                track_sales_data:
                    parsed.track_sales_data !== false,

                show_usb_scanner_mode:
                    parsed.show_usb_scanner_mode !== false,

                show_listening_mode:
                    parsed.show_listening_mode !== false
            };
        }catch(error){
            return {...DEFAULTS};
        }
    }

    function writeCache(settings){
        try{
            localStorage.setItem(
                CACHE_KEY,
                JSON.stringify(settings)
            );
        }catch(error){}
    }

    function normalise(settings){
        const source =
            settings &&
            typeof settings === "object"
                ? settings
                : {};

        return {
            track_sales_data:
                source.track_sales_data !== false,

            show_usb_scanner_mode:
                source.show_usb_scanner_mode !== false,

            show_listening_mode:
                source.show_listening_mode !== false
        };
    }


    function selectedWorkspaceId(){
        try{
            if(
                window.InventoryTopbar &&
                typeof InventoryTopbar
                    .getSelectedWorkspaceId ===
                    "function"
            ){
                const selected =
                    InventoryTopbar
                        .getSelectedWorkspaceId();

                if(selected){
                    return String(selected);
                }
            }
        }catch(error){}

        return String(
            localStorage.getItem(
                "inventoryos_selected_workspace_id"
            ) || ""
        ).trim();
    }

    function workspaceRequestOptions(
        options = {}
    ){
        const workspaceId =
            selectedWorkspaceId();

        const headers = {
            ...(options.headers || {})
        };

        if(workspaceId){
            headers["X-Workspace-Id"] =
                workspaceId;
        }

        return {
            ...options,
            headers
        };
    }

    async function load(){
        current = readCache();

        if(
            typeof InventoryAPI === "undefined" ||
            !InventoryAPI ||
            !InventoryAPI.isLoggedIn()
        ){
            return {
                settings:current,
                can_edit:false
            };
        }

        try{
            const data = await InventoryAPI.request(
                "/remove-preferences?_t=" +
                Date.now(),
                workspaceRequestOptions()
            );

            if(data && data.success){
                current = normalise(data.settings);
                canEdit = !!data.can_edit;
                writeCache(current);

                return {
                    settings:current,
                    can_edit:canEdit
                };
            }
        }catch(error){
            console.error(
                "Could not load Remove page preferences:",
                error
            );
        }

        return {
            settings:current,
            can_edit:false
        };
    }

    async function save(settings){
        const payload = normalise(settings);

        const data = await InventoryAPI.request(
            "/remove-preferences",
            workspaceRequestOptions({
                method:"POST",
                body:JSON.stringify(payload)
            })
        );

        if(!data || !data.success){
            throw new Error(
                data?.error ||
                "Could not save Remove page preferences"
            );
        }

        current = normalise(data.settings);
        canEdit = true;
        writeCache(current);

        return current;
    }

    function addStyles(){
        if(
            document.getElementById(
                "removePreferencesStyles"
            )
        ){
            return;
        }

        const style =
            document.createElement("style");

        style.id = "removePreferencesStyles";

        style.textContent = `
            .remove-pref-list{
                display:grid;
                gap:12px;
                margin-top:14px;
            }

            .remove-pref-row{
                display:flex;
                align-items:flex-start;
                justify-content:space-between;
                gap:16px;
                background:#111;
                border:1px solid rgba(255,255,255,.08);
                border-radius:14px;
                padding:14px;
            }

            .remove-pref-copy{
                min-width:0;
            }

            .remove-pref-title{
                color:white;
                font-weight:bold;
                margin-bottom:5px;
            }

            .remove-pref-help{
                color:#aaa;
                font-size:13px;
                line-height:1.4;
            }

            .remove-pref-switch{
                width:auto !important;
                min-width:22px;
                min-height:22px;
                margin:3px 0 0 0 !important;
                accent-color:var(--accent,#8e44ff);
                transform:scale(1.15);
                cursor:pointer;
            }

            .remove-pref-save{
                background:linear-gradient(135deg,#8e44ff,#6f42c1);
                border:1px solid rgba(142,68,255,.45);
                margin-top:14px;
            }

            .remove-pref-hidden{
                display:none !important;
            }

            .remove-pref-note{
                background:#111;
                border:1px solid rgba(255,255,255,.08);
                border-radius:14px;
                padding:12px;
                color:#bbb;
                font-size:13px;
                line-height:1.4;
                margin-top:12px;
            }
        `;

        document.head.appendChild(style);
    }

    function settingsPage(){
        return (
            document.title === "Settings" ||
            /(?:^|\/)settings\.html(?:$|\?)/i.test(
                window.location.pathname +
                window.location.search
            )
        );
    }

    function removePage(){
        return (
            document.title === "Remove Stock" ||
            /(?:^|\/)remove\.html(?:$|\?)/i.test(
                window.location.pathname +
                window.location.search
            )
        );
    }

    function injectSettingsCard(){
        if(
            document.getElementById(
                "removePreferencesCard"
            )
        ){
            return;
        }

        const target =
            document.querySelector(".settings-grid") ||
            document.querySelector(".page");

        if(!target){
            return;
        }

        const card =
            document.createElement("div");

        card.className = "card full";
        card.id = "removePreferencesCard";

        card.innerHTML = `
            <div class="card-title">
                <span class="card-icon">➖</span>
                Remove Page
            </div>

            <div class="helper">
                Choose which selling and scanner features appear on the Remove Stock page for this workspace.
            </div>

            <div class="remove-pref-list">
                <label class="remove-pref-row">
                    <span class="remove-pref-copy">
                        <span class="remove-pref-title">
                            Track sales data
                        </span>

                        <span class="remove-pref-help">
                            Show the sale amount and sales-tracker options. When disabled, stock can still be removed but no new sales records are created.
                        </span>
                    </span>

                    <input
                        class="remove-pref-switch"
                        type="checkbox"
                        id="prefTrackSales"
                    >
                </label>

                <label class="remove-pref-row">
                    <span class="remove-pref-copy">
                        <span class="remove-pref-title">
                            Show USB scanner mode
                        </span>

                        <span class="remove-pref-help">
                            Show the USB scanner bundle-mode option on Remove Stock.
                        </span>
                    </span>

                    <input
                        class="remove-pref-switch"
                        type="checkbox"
                        id="prefShowUsbScanner"
                    >
                </label>

                <label class="remove-pref-row">
                    <span class="remove-pref-copy">
                        <span class="remove-pref-title">
                            Show listening mode
                        </span>

                        <span class="remove-pref-help">
                            Show voice price entry and voice sale confirmation. Listening mode is automatically unavailable when sales tracking is disabled.
                        </span>
                    </span>

                    <input
                        class="remove-pref-switch"
                        type="checkbox"
                        id="prefShowListening"
                    >
                </label>
            </div>

            <button
                class="remove-pref-save"
                id="saveRemovePreferencesButton"
                type="button"
            >
                Save Remove Page Settings
            </button>

            <div
                id="removePreferencesResult"
                class="result"
            >
                Loading Remove page settings...
            </div>
        `;

        target.appendChild(card);

        document
            .getElementById(
                "saveRemovePreferencesButton"
            )
            .addEventListener(
                "click",
                saveFromSettingsPage
            );
    }

    function populateSettingsCard(){
        const track =
            document.getElementById("prefTrackSales");

        const usb =
            document.getElementById(
                "prefShowUsbScanner"
            );

        const listening =
            document.getElementById(
                "prefShowListening"
            );

        const button =
            document.getElementById(
                "saveRemovePreferencesButton"
            );

        const result =
            document.getElementById(
                "removePreferencesResult"
            );

        if(!track || !usb || !listening){
            return;
        }

        track.checked =
            current.track_sales_data;

        usb.checked =
            current.show_usb_scanner_mode;

        listening.checked =
            current.show_listening_mode;

        [track,usb,listening].forEach(input=>{
            input.disabled = !canEdit;
        });

        if(button){
            button.disabled = !canEdit;
            button.style.opacity =
                canEdit ? "1" : ".55";
        }

        if(result){
            result.className = "result";

            result.textContent =
                canEdit
                    ? "These settings apply to everyone using this workspace."
                    : "Only workspace owners and admins can change these settings.";
        }
    }

    async function saveFromSettingsPage(){
        const button =
            document.getElementById(
                "saveRemovePreferencesButton"
            );

        const result =
            document.getElementById(
                "removePreferencesResult"
            );

        const settings = {
            track_sales_data:
                document.getElementById(
                    "prefTrackSales"
                ).checked,

            show_usb_scanner_mode:
                document.getElementById(
                    "prefShowUsbScanner"
                ).checked,

            show_listening_mode:
                document.getElementById(
                    "prefShowListening"
                ).checked
        };

        if(button){
            button.disabled = true;
            button.textContent = "Saving...";
        }

        if(result){
            result.className = "result";
            result.textContent =
                "Saving Remove page settings...";
        }

        try{
            await save(settings);

            if(result){
                result.className =
                    "result success";

                result.textContent =
                    "Remove page settings saved.";
            }
        }catch(error){
            console.error(error);

            if(result){
                result.className =
                    "result error";

                result.textContent =
                    error.message ||
                    "Could not save Remove page settings.";
            }
        }finally{
            if(button){
                button.disabled = !canEdit;
                button.textContent =
                    "Save Remove Page Settings";
            }
        }
    }

    function setHidden(element, hidden){
        if(!element){
            return;
        }

        element.classList.toggle(
            "remove-pref-hidden",
            !!hidden
        );
    }

    function usbWrapper(){
        const input =
            document.getElementById(
                "usbScannerMode"
            );

        return input
            ? input.closest(".toggle-box")
            : null;
    }

    function listeningWrapper(){
        return document.querySelector(
            ".voice-card"
        );
    }

    function salesPriceWrapper(){
        return document.querySelector(
            ".warehouse-price-card"
        );
    }

    function oneSalesRowWrapper(){
        const input =
            document.getElementById(
                "oneSalesRow"
            );

        return input
            ? input.closest(".toggle-box")
            : null;
    }

    function patchRemoveFunctions(){
        if(
            typeof window.removeBundleStock ===
            "function" &&
            !originalRemoveBundleStock
        ){
            originalRemoveBundleStock =
                window.removeBundleStock;
        }

        if(
            typeof window.toggleUsbScannerMode ===
            "function" &&
            !originalToggleUsbScannerMode
        ){
            originalToggleUsbScannerMode =
                window.toggleUsbScannerMode;
        }

        if(
            typeof window.speakText ===
            "function" &&
            !originalSpeakText
        ){
            originalSpeakText =
                window.speakText;
        }

        if(
            typeof window.setWarehouseStatus ===
            "function" &&
            !originalSetWarehouseStatus
        ){
            originalSetWarehouseStatus =
                window.setWarehouseStatus;
        }

        if(originalRemoveBundleStock){
            window.removeBundleStock =
                function(){
                    if(current.track_sales_data){
                        return originalRemoveBundleStock();
                    }

                    if(
                        typeof hasSelectedInventoryForRemove ===
                        "function" &&
                        !hasSelectedInventoryForRemove()
                    ){
                        if(
                            typeof showNoInventorySelected ===
                            "function"
                        ){
                            showNoInventorySelected();
                        }

                        return;
                    }

                    if(
                        !Array.isArray(bundleBarcodes) ||
                        bundleBarcodes.length === 0
                    ){
                        alert(
                            "Add at least one barcode to the bundle list"
                        );

                        return;
                    }

                    pendingBundleEachAmount = 0;

                    pendingBundleQueue =
                        bundleBarcodes.map(
                            barcode=>({
                                barcode:
                                    normaliseBarcode(barcode),
                                location:""
                            })
                        );

                    completedBundleRemovals = [];
                    pendingBundleItem = null;

                    const choices =
                        document.getElementById(
                            "locationChoices"
                        );

                    if(choices){
                        choices.innerHTML = "";
                    }

                    processNextBundleItem();
                };
        }

        if(originalToggleUsbScannerMode){
            window.toggleUsbScannerMode =
                function(){
                    const input =
                        document.getElementById(
                            "usbScannerMode"
                        );

                    const checked =
                        !!input?.checked;

                    const fullWarehouseMode =
                        checked &&
                        current.track_sales_data &&
                        current.show_listening_mode;

                    if(fullWarehouseMode){
                        document.body.classList.add(
                            "warehouse-mode"
                        );

                        if(
                            typeof startVoicePrice ===
                            "function"
                        ){
                            startVoicePrice();
                        }

                        if(
                            typeof setWarehouseStatus ===
                            "function"
                        ){
                            setWarehouseStatus(
                                "Listening is on. Say a price, then say confirm sale."
                            );
                        }
                    }else{
                        document.body.classList.remove(
                            "warehouse-mode"
                        );

                        if(
                            typeof stopVoicePrice ===
                            "function"
                        ){
                            stopVoicePrice();
                        }
                    }

                    const status =
                        document.getElementById(
                            "scannerModeStatus"
                        );

                    if(status){
                        status.textContent =
                            checked
                                ? "Scanner mode on — barcode box stays focused."
                                : "Scanner mode off.";
                    }

                    if(checked){
                        setTimeout(function(){
                            document
                                .getElementById("barcode")
                                ?.focus();
                        },100);
                    }
                };
        }

        if(originalSpeakText){
            window.speakText =
                function(text){
                    const message =
                        !current.track_sales_data &&
                        String(text || "") ===
                        "Sale complete"
                            ? "Removal complete"
                            : text;

                    return originalSpeakText(message);
                };
        }

        if(originalSetWarehouseStatus){
            window.setWarehouseStatus =
                function(message){
                    let output =
                        String(message || "");

                    if(!current.track_sales_data){
                        output = output
                            .replace(
                                /sale complete/gi,
                                "removal complete"
                            )
                            .replace(
                                /say a price[^.]*\.?/gi,
                                ""
                            )
                            .trim();

                        if(!output){
                            output =
                                "Scanner mode ready.";
                        }
                    }

                    return originalSetWarehouseStatus(
                        output
                    );
                };
        }
    }

    function watchRemoveResult(){
        const result =
            document.getElementById("result");

        if(!result || resultObserver){
            return;
        }

        resultObserver =
            new MutationObserver(function(){
                if(current.track_sales_data){
                    return;
                }

                const text =
                    String(result.textContent || "");

                if(
                    /sold at £0\.00 each/i.test(text)
                ){
                    result.textContent =
                        text.replace(
                            /sold at £0\.00 each\.?/i,
                            "removed without sales tracking."
                        );
                }
            });

        resultObserver.observe(
            result,
            {
                childList:true,
                subtree:true,
                characterData:true
            }
        );
    }

    function applyToRemovePage(){
        addStyles();
        patchRemoveFunctions();

        const usbInput =
            document.getElementById(
                "usbScannerMode"
            );

        const voiceInput =
            document.getElementById(
                "voicePriceMode"
            );

        const saleAmount =
            document.getElementById(
                "saleAmount"
            );

        const oneSalesRow =
            document.getElementById(
                "oneSalesRow"
            );

        setHidden(
            usbWrapper(),
            !current.show_usb_scanner_mode
        );

        const listeningAvailable =
            current.show_listening_mode &&
            current.track_sales_data;

        setHidden(
            listeningWrapper(),
            !listeningAvailable
        );

        setHidden(
            salesPriceWrapper(),
            !current.track_sales_data
        );

        setHidden(
            oneSalesRowWrapper(),
            !current.track_sales_data
        );

        if(!current.show_usb_scanner_mode){
            if(usbInput){
                usbInput.checked = false;
            }
        }

        if(!listeningAvailable){
            if(voiceInput){
                voiceInput.checked = false;
            }

            if(
                typeof stopVoicePrice ===
                "function"
            ){
                stopVoicePrice();
            }
        }

        if(!current.track_sales_data){
            if(saleAmount){
                saleAmount.value = "";
            }

            if(oneSalesRow){
                oneSalesRow.checked = false;
            }
        }

        if(
            typeof window.toggleUsbScannerMode ===
            "function"
        ){
            window.toggleUsbScannerMode();
        }

        watchRemoveResult();

        const result =
            document.getElementById("result");

        if(
            result &&
            !current.track_sales_data &&
            /ready to remove stock/i.test(
                result.textContent || ""
            )
        ){
            result.textContent =
                "Ready to remove stock. Sales tracking is disabled for this workspace.";
        }
    }

    async function initialiseSettingsPage(){
        addStyles();
        injectSettingsCard();
        await load();
        populateSettingsCard();
    }

    async function initialiseRemovePage(){
        await load();
        applyToRemovePage();
    }

    async function init(){
        if(settingsPage()){
            await initialiseSettingsPage();
        }

        if(removePage()){
            await initialiseRemovePage();
        }
    }

    window.addEventListener(
        "inventory-selection-changed",
        async function(){
            await load();

            if(removePage()){
                applyToRemovePage();
            }

            if(settingsPage()){
                populateSettingsCard();
            }
        }
    );

    return {
        init,
        load,
        save,
        get:function(){
            return {...current};
        },
        applyToRemovePage
    };
})();

window.InventoryOSRemovePreferences =
    InventoryOSRemovePreferences;

if(document.readyState === "loading"){
    document.addEventListener(
        "DOMContentLoaded",
        function(){
            InventoryOSRemovePreferences.init();
        },
        {
            once:true
        }
    );
}else{
    InventoryOSRemovePreferences.init();
}
