(function(){
    const DEFAULT_PREFERENCES = {
        track_sales_data:true,
        dispatch_require_scan:false,
        dispatch_show_voice_mode:true,
        dispatch_voice_prompts:true,
        dispatch_auto_print_on_start:true
    };

    let dispatchPreferences = {...DEFAULT_PREFERENCES};
    let dispatchSuggestionCache = new Map();
    let dispatchSuggestionTimers = new Map();
    let pendingAddMatches = new Map();
    let dispatchSessionPackIds = [];
    let dispatchCurrentPackIndex = 0;
    let dispatchPackingActive = false;
    let dispatchPriceTimers = new Map();
    let dispatchManualPacked = new Set();
    let dispatchSpeechRecognition = null;
    let dispatchVoiceListening = false;
    let dispatchCompletionResults = null;
    const DISPATCH_STATE_KEY = "inventoryos_dispatch_existing_routes_state_v1";
    let dispatchPriceMills = new Map();
    let dispatchVerifiedQty = new Map();

    function escapeDispatchHtml(value){
        return String(value || "")
            .replace(/&/g,"&amp;")
            .replace(/</g,"&lt;")
            .replace(/>/g,"&gt;")
            .replace(/"/g,"&quot;")
            .replace(/'/g,"&#039;");
    }

    function normaliseDispatchBarcode(value){
        let barcode = String(value || "")
            .trim()
            .toUpperCase()
            .replace(/\s+/g, "");

        if(/^\d+$/.test(barcode)){
            return "ITEM-" + barcode;
        }

        if(/^ITEM\d+$/.test(barcode)){
            return barcode.replace("ITEM", "ITEM-");
        }

        return barcode;
    }

    function formatMills(mills){
        return (Number(mills || 0) / 1000).toFixed(3);
    }


    function parseDispatchMills(value){
        const raw = String(value ?? "")
            .replace(/£/g,"")
            .replace(/,/g,"")
            .trim();

        if(!raw){
            return 0;
        }

        if(!/^\d+(?:\.\d{0,3})?$/.test(raw)){
            throw new Error("Sale price can use no more than three decimal places");
        }

        const parts = raw.split(".");
        const whole = Number(parts[0] || 0);
        const decimals = Number(String(parts[1] || "").padEnd(3,"0"));
        const mills = whole * 1000 + decimals;

        if(!Number.isSafeInteger(mills) || mills < 0){
            throw new Error("Sale price is invalid");
        }

        return mills;
    }

    function readDispatchState(){
        try{
            const parsed = JSON.parse(localStorage.getItem(DISPATCH_STATE_KEY) || "{}");
            dispatchSessionPackIds = Array.isArray(parsed.pack_ids)
                ? parsed.pack_ids.map(Number).filter(Number.isInteger)
                : [];
            dispatchCurrentPackIndex = Number(parsed.current_index || 0);
            dispatchPriceMills = new Map(
                Object.entries(parsed.prices || {}).map(([key,value]) => [Number(key),Number(value || 0)])
            );
            dispatchVerifiedQty = new Map(
                Object.entries(parsed.verified || {}).map(([key,value]) => [Number(key),Number(value || 0)])
            );
            dispatchManualPacked = new Set(
                Array.isArray(parsed.manual_packed)
                    ? parsed.manual_packed.map(Number).filter(Number.isInteger)
                    : []
            );
        }catch(error){
            dispatchSessionPackIds = [];
            dispatchCurrentPackIndex = 0;
            dispatchPriceMills = new Map();
            dispatchVerifiedQty = new Map();
            dispatchManualPacked = new Set();
        }
    }

    function writeDispatchState(){
        try{
            localStorage.setItem(
                DISPATCH_STATE_KEY,
                JSON.stringify({
                    pack_ids:dispatchSessionPackIds,
                    current_index:dispatchCurrentPackIndex,
                    prices:Object.fromEntries(dispatchPriceMills),
                    verified:Object.fromEntries(dispatchVerifiedQty),
                    manual_packed:Array.from(dispatchManualPacked)
                })
            );
        }catch(error){}
    }

    function clearDispatchPackState(packId){
        const id = Number(packId);
        dispatchSessionPackIds = dispatchSessionPackIds.filter(value => Number(value) !== id);
        dispatchPriceMills.delete(id);

        const pack = findPack(id);
        (pack?.items || []).forEach(item => {
            dispatchVerifiedQty.delete(Number(item.id));
            dispatchManualPacked.delete(Number(item.id));
        });

        writeDispatchState();
    }

    function dispatchItemLocations(item){
        return Array.isArray(item?.locations)
            ? item.locations.filter(location => Number(location.qty || 0) > 0)
            : [];
    }

    function dispatchBestLocation(item){
        const locations = dispatchItemLocations(item);
        const required = Math.max(1,Number(item?.qty || 1));

        return locations.find(location => {
            return String(location.location || "") === String(item?.picked_location || "") &&
                Number(location.qty || 0) >= required;
        }) || locations.find(location => Number(location.qty || 0) >= required) || locations[0] || {};
    }

    function hydrateDispatchQueueState(){
        const validPackIds = new Set((queueCache || []).map(pack => Number(pack.id)));
        dispatchSessionPackIds = dispatchSessionPackIds.filter(id => validPackIds.has(Number(id)));

        (queueCache || []).forEach(pack => {
            const packId = Number(pack.id);
            pack.sale_total_mills = Number(dispatchPriceMills.get(packId) || 0);

            (pack.items || []).forEach(item => {
                const best = dispatchBestLocation(item);
                item.matched_barcode = best.barcode || item.matched_barcode || "";
                item.matched_inventory_id = best.inventory_id || item.matched_inventory_id || "";
                item.matched_product_id = best.product_id || item.matched_product_id || "";
                item.matched_box_id = best.box_id || item.matched_box_id || "";
                item.picked_location = item.picked_location || best.location || "";
                item.verified_qty = Number(dispatchVerifiedQty.get(Number(item.id)) || 0);
            });
        });

        writeDispatchState();
    }

    function validateDispatchPacks(packIds){
        const errors = [];

        packIds.forEach(packId => {
            const pack = findPack(packId);

            if(!pack){
                errors.push(`Packing job ${packId} was not found.`);
                return;
            }

            if(!(pack.items || []).length){
                errors.push(`Label ${pack.label_order || pack.id} has no items.`);
                return;
            }

            (pack.items || []).forEach(item => {
                const locations = dispatchItemLocations(item);
                const available = locations.reduce((sum,location) => sum + Number(location.qty || 0),0);
                const barcode = dispatchBestLocation(item).barcode || item.matched_barcode || "";

                if(!barcode || !locations.length){
                    errors.push(`Label ${pack.label_order || pack.id}: ${item.description} has no active-stock match.`);
                }else if(available < Number(item.qty || 0)){
                    errors.push(`Label ${pack.label_order || pack.id}: ${item.description} needs ${item.qty}, but only ${available} are active.`);
                }
            });
        });

        return errors;
    }

    async function ensureExistingWorkflowBackend(){
        const data = await InventoryAPI.request(
            "/shipping-labels/queue?_dispatch_workflow_check=1&_t=" + Date.now()
        );

        if(
            !data ||
            !data.success ||
            Number(data.dispatch_sale_workflow_version || 0) < 1
        ){
            throw new Error(
                "The updated shippingLabelsRoutes.js is not running yet. Replace that backend file and restart Node before using Let’s Pack."
            );
        }

        return data;
    }

    function injectDispatchWorkflowStyles(){
        if(document.getElementById("dispatchWorkflowStyles")){
            return;
        }

        const style = document.createElement("style");
        style.id = "dispatchWorkflowStyles";
        style.textContent = `
            .dispatch-match-box{
                margin-top:10px;
                padding:12px;
                border:1px solid rgba(var(--accent-rgb),.2);
                border-radius:14px;
                background:rgba(var(--accent-rgb),.06);
            }

            .dispatch-match-title{
                color:var(--accent);
                font-weight:800;
            }

            .dispatch-match-meta{
                margin-top:5px;
                color:#aaa;
                font-size:12px;
                line-height:1.45;
            }

            .dispatch-search-wrap{
                position:relative;
                margin-top:12px;
            }

            .dispatch-suggestions{
                display:none;
                position:absolute;
                z-index:300;
                left:0;
                right:0;
                top:calc(100% - 6px);
                max-height:310px;
                overflow:auto;
                padding:8px;
                border:1px solid rgba(var(--accent-rgb),.28);
                border-radius:14px;
                background:#121016;
                box-shadow:0 22px 55px rgba(0,0,0,.55);
            }

            .dispatch-suggestions.open{
                display:block;
            }

            .dispatch-suggestion{
                width:100%;
                margin:0 0 7px;
                padding:11px;
                text-align:left;
                border:1px solid rgba(255,255,255,.08) !important;
                border-radius:12px;
                color:white;
                background:#1a171e !important;
                box-shadow:none !important;
            }

            .dispatch-suggestion:last-child{
                margin-bottom:0;
            }

            .dispatch-suggestion:hover{
                border-color:rgba(var(--accent-rgb),.4) !important;
                background:rgba(var(--accent-rgb),.1) !important;
            }

            .dispatch-suggestion strong,
            .dispatch-suggestion span{
                display:block;
            }

            .dispatch-suggestion span{
                margin-top:4px;
                color:#aaa;
                font-size:12px;
                line-height:1.35;
            }

            .dispatch-edit-grid{
                display:grid;
                grid-template-columns:minmax(0,1fr) 92px auto auto;
                gap:8px;
                align-items:start;
                margin-top:10px;
            }

            .dispatch-add-grid{
                display:grid;
                grid-template-columns:minmax(0,1fr) 92px auto;
                gap:8px;
                align-items:start;
                margin-top:14px;
            }

            .dispatch-workflow-actions{
                display:grid;
                grid-template-columns:repeat(2,minmax(0,1fr));
                gap:10px;
                margin-top:14px;
            }

            #dispatchPackingModePanel{
                display:none;
            }

            body.dispatch-packing-active .page > .panel,
            body.dispatch-packing-active .page > .links-grid{
                display:none !important;
            }

            body.dispatch-packing-active #dispatchPackingModePanel{
                display:block !important;
            }

            .dispatch-packing-toolbar{
                display:grid;
                grid-template-columns:minmax(0,1fr) auto;
                gap:12px;
                align-items:start;
                margin-bottom:16px;
            }

            .dispatch-progress{
                color:var(--accent);
                font-size:13px;
                font-weight:800;
                letter-spacing:.04em;
                text-transform:uppercase;
            }

            .dispatch-packing-layout{
                display:grid;
                grid-template-columns:minmax(0,1.25fr) minmax(270px,.75fr);
                gap:16px;
                align-items:start;
            }

            .dispatch-pick-card,
            .dispatch-label-card,
            .dispatch-price-card,
            .dispatch-scan-card,
            .dispatch-result-card{
                border:1px solid rgba(255,255,255,.075);
                border-radius:18px;
                padding:16px;
                background:linear-gradient(145deg,rgba(255,255,255,.032),rgba(255,255,255,.012));
            }

            .dispatch-pick-item{
                display:grid;
                grid-template-columns:44px minmax(0,1fr) auto;
                gap:12px;
                align-items:center;
                margin-top:10px;
                padding:12px;
                border:1px solid rgba(255,255,255,.08);
                border-radius:14px;
                background:#151219;
                transition:.18s ease;
            }

            .dispatch-pick-item.complete{
                border-color:rgba(69,211,106,.45);
                background:rgba(69,211,106,.11);
                box-shadow:0 0 0 2px rgba(69,211,106,.05);
            }

            .dispatch-pick-item.next{
                border-color:rgba(var(--accent-rgb),.5);
                box-shadow:0 0 0 2px rgba(var(--accent-rgb),.08);
            }

            .dispatch-check{
                display:grid;
                place-items:center;
                width:42px;
                height:42px;
                border-radius:13px;
                color:#aaa;
                background:rgba(255,255,255,.05);
                font-weight:900;
            }

            .dispatch-pick-item.complete .dispatch-check{
                color:#8dffb0;
                background:rgba(69,211,106,.16);
            }

            .dispatch-item-name{
                font-size:17px;
                font-weight:850;
            }

            .dispatch-item-location{
                margin-top:5px;
                color:#aaa;
                font-size:13px;
            }

            .dispatch-item-count{
                color:var(--accent);
                font-size:13px;
                font-weight:800;
                white-space:nowrap;
            }

            .dispatch-label-preview{
                width:100%;
                aspect-ratio:4/6;
                overflow:hidden;
                border-radius:14px;
                background:white;
            }

            .dispatch-label-preview img,
            .dispatch-label-preview iframe{
                display:block;
                width:100%;
                height:100%;
                border:0;
                object-fit:contain;
                background:white;
            }

            .dispatch-sale-input{
                margin-bottom:5px !important;
                font-size:28px !important;
                font-weight:850;
                text-align:center;
            }

            .dispatch-scanner-input{
                font-size:20px !important;
                text-align:center;
            }

            .dispatch-scan-status{
                min-height:22px;
                margin-top:7px;
                color:#aaa;
                font-size:13px;
                text-align:center;
            }

            .dispatch-scan-status.ok{
                color:#8dffb0;
            }

            .dispatch-scan-status.error{
                color:#ff9b9b;
            }

            .dispatch-pack-nav{
                display:grid;
                grid-template-columns:1fr 1fr;
                gap:10px;
                margin-top:14px;
            }

            .dispatch-complete-button{
                width:100%;
                margin-top:12px;
                background:linear-gradient(135deg,#28a745,#1f8b3a) !important;
                border-color:rgba(40,167,69,.45) !important;
            }

            .dispatch-complete-button:disabled{
                opacity:.45;
                cursor:not-allowed;
            }

            .dispatch-voice-row{
                display:flex;
                gap:10px;
                align-items:center;
                margin-top:10px;
            }

            .dispatch-voice-row input{
                width:auto !important;
                margin:0 !important;
            }

            .dispatch-voice-status{
                margin-top:8px;
                color:#aaa;
                font-size:12px;
                line-height:1.4;
            }

            .dispatch-failed{
                margin-top:12px;
                padding:12px;
                border:1px solid rgba(255,92,108,.3);
                border-radius:14px;
                color:#ff9b9b;
                background:rgba(255,92,108,.08);
            }

            .dispatch-session-result{
                display:grid;
                gap:8px;
                margin-top:12px;
            }

            @media(max-width:850px){
                .dispatch-packing-layout{
                    grid-template-columns:1fr;
                }

                .dispatch-edit-grid,
                .dispatch-add-grid,
                .dispatch-workflow-actions{
                    grid-template-columns:1fr;
                }
            }
        `;

        document.head.appendChild(style);
    }

    async function loadDispatchPreferences(){
        try{
            const data = await InventoryAPI.request(
                "/remove-preferences?_t=" + Date.now()
            );

            if(data && data.success){
                dispatchPreferences = {
                    ...DEFAULT_PREFERENCES,
                    ...(data.settings || {})
                };
            }
        }catch(error){
            console.warn("Could not load Dispatch preferences:", error);
        }

        return dispatchPreferences;
    }

    function findPackingQueuePanel(){
        return document.getElementById("queue")?.closest(".panel") || null;
    }

    function injectWorkflowControls(){
        const queuePanel = findPackingQueuePanel();

        if(!queuePanel){
            return;
        }

        const actions = document.getElementById("refreshBtn")?.closest(".actions");

        if(actions && !document.getElementById("dispatchLetsPackBtn")){
            const button = document.createElement("button");
            button.id = "dispatchLetsPackBtn";
            button.type = "button";
            button.className = "success";
            button.textContent = "Let’s Pack";
            button.onclick = function(){
                startDispatchPacking();
            };
            actions.appendChild(button);
        }

        if(actions && !document.getElementById("dispatchClearAllBtn")){
            const button = document.createElement("button");
            button.id = "dispatchClearAllBtn";
            button.type = "button";
            button.className = "danger";
            button.textContent = "Clear All";
            button.disabled = true;
            button.title = "Remove every unfinished job from this workspace's packing queue";
            button.onclick = function(){
                window.dispatchClearAllPackingQueue();
            };
            actions.appendChild(button);
        }

        if(!document.getElementById("dispatchWorkflowResult")){
            const result = document.createElement("div");
            result.id = "dispatchWorkflowResult";
            result.className = "dispatch-session-result";
            queuePanel.appendChild(result);
        }

        if(!document.getElementById("dispatchPackingModePanel")){
            const panel = document.createElement("div");
            panel.className = "panel";
            panel.id = "dispatchPackingModePanel";
            panel.innerHTML = `<div id="dispatchPackingModeContent"></div>`;
            queuePanel.insertAdjacentElement("afterend", panel);
        }
    }

    function clearableDispatchPacks(){
        return (queueCache || []).filter(function(pack){
            return String(pack.status || "") !== "packed";
        });
    }

    function refreshClearAllButton(){
        const button = document.getElementById("dispatchClearAllBtn");

        if(!button){
            return;
        }

        const count = clearableDispatchPacks().length;
        button.disabled = count === 0;
        button.textContent = count ? `Clear All (${count})` : "Clear All";
    }

    window.dispatchClearAllPackingQueue = async function(){
        const clearable = clearableDispatchPacks();

        if(!clearable.length){
            alert("There are no unfinished packing jobs to clear.");
            refreshClearAllButton();
            return;
        }

        const confirmed = confirm(
            `Clear all ${clearable.length} unfinished packing job${clearable.length === 1 ? "" : "s"}?\n\n` +
            "This removes their shipping labels and packing items. Stock and completed sales are not changed."
        );

        if(!confirmed){
            return;
        }

        showLoading("Clearing packing queue...");

        const deleted = [];
        const failed = [];

        try{
            for(const pack of clearable){
                try{
                    const data = await InventoryAPI.request(
                        `/shipping-labels/${Number(pack.id)}`,
                        {method:"DELETE"}
                    );

                    if(!data || !data.success){
                        throw new Error(data?.error || "Could not remove packing job");
                    }

                    deleted.push(Number(pack.id));
                    clearDispatchPackState(pack.id);
                }catch(error){
                    failed.push({
                        pack_id:Number(pack.id),
                        label_order:pack.label_order,
                        error:error.message || "Could not remove packing job"
                    });
                }
            }

            stopDispatchVoice();
            dispatchPackingActive = false;
            document.body.classList.remove("dispatch-packing-active");
            await loadQueue();

            const resultBox = document.getElementById("dispatchWorkflowResult");

            if(resultBox){
                resultBox.innerHTML = `
                    <div class="${failed.length ? "dispatch-failed" : "dispatch-complete"}">
                        Cleared ${deleted.length} unfinished packing job${deleted.length === 1 ? "" : "s"}.
                        ${failed.length ? `${failed.length} could not be cleared.` : "Stock and completed sales were not changed."}
                    </div>
                    ${failed.map(item => `
                        <div class="dispatch-failed">
                            Label ${escapeDispatchHtml(item.label_order || item.pack_id)}: ${escapeDispatchHtml(item.error)}
                        </div>
                    `).join("")}
                `;
            }

            if(failed.length){
                alert(`${deleted.length} cleared. ${failed.length} could not be cleared.`);
            }
        }finally{
            hideLoading();
            refreshLetsPackButton();
            refreshClearAllButton();
        }
    };

    function findPack(packId){
        return (queueCache || []).find(pack => Number(pack.id) === Number(packId)) || null;
    }

    function findItem(itemId){
        for(const pack of (queueCache || [])){
            const item = (pack.items || []).find(row => Number(row.id) === Number(itemId));
            if(item){
                return {pack,item};
            }
        }
        return null;
    }

    function selectedMatchHtml(item){
        if(!item.matched_barcode){
            return `
                <div class="dispatch-match-box">
                    <div class="dispatch-match-title">No active-stock match selected</div>
                    <div class="dispatch-match-meta">Type below and choose a suggestion before packing.</div>
                </div>
            `;
        }

        const locations = Array.isArray(item.locations) ? item.locations : [];
        const matchedLocation = locations.find(location => {
            return String(location.box_id || "") === String(item.matched_box_id || "");
        }) || locations.find(location => {
            return String(location.location || "") === String(item.picked_location || "");
        }) || locations[0] || {};

        return `
            <div class="dispatch-match-box">
                <div class="dispatch-match-title">
                    ${escapeDispatchHtml(item.description)}
                </div>
                <div class="dispatch-match-meta">
                    ${escapeDispatchHtml(item.matched_barcode)}
                    · ${escapeDispatchHtml(item.picked_location || matchedLocation.location || "No location")}
                    · ${escapeDispatchHtml(matchedLocation.qty || 0)} currently available
                </div>
            </div>
        `;
    }

    function dispatchRenderPackCard(pack){
        const packItems = pack.items || [];

        const itemHtml = packItems.map(item => {
            return `
                <div class="item-row">
                    <div class="card-head">
                        <div style="width:100%;">
                            <strong>${escapeDispatchHtml(item.description)}</strong>
                            <div class="muted small">Qty needed: ${escapeDispatchHtml(item.qty)}</div>
                            ${selectedMatchHtml(item)}

                            <div class="dispatch-edit-grid">
                                <div class="dispatch-search-wrap">
                                    <input
                                        id="dispatch-item-search-${Number(item.id)}"
                                        type="text"
                                        value="${escapeDispatchHtml(item.description)}"
                                        placeholder="Type to search active stock"
                                        oninput="dispatchSearchSuggestions('item',${Number(item.id)},this.value)"
                                        autocomplete="off"
                                    >
                                    <div
                                        id="dispatch-suggestions-item-${Number(item.id)}"
                                        class="dispatch-suggestions"
                                    ></div>
                                </div>

                                <input
                                    id="dispatch-item-qty-${Number(item.id)}"
                                    type="number"
                                    min="1"
                                    value="${escapeDispatchHtml(item.qty)}"
                                >

                                <button
                                    type="button"
                                    onclick="dispatchUseBestMatch(${Number(item.id)})"
                                >
                                    Best Match
                                </button>

                                <button
                                    class="danger"
                                    type="button"
                                    onclick="deleteItem(${Number(item.id)})"
                                >
                                    Delete
                                </button>
                            </div>
                        </div>

                        <span class="status ${escapeDispatchHtml(item.status || "needs_review")}">
                            ${escapeDispatchHtml(statusLabel(item.status))}
                        </span>
                    </div>
                </div>
            `;
        }).join("");

        const courierPreview = pack.preview_url
            ? `<div class="courier-preview">${courierPreviewMedia(
                InventoryAPI.API_BASE + pack.preview_url,
                pack.preview_type,
                "Courier label preview"
            )}</div>`
            : "";

        const saleStatus = pack.sale_status && pack.sale_status !== "pending"
            ? `<div class="muted small" style="margin-top:6px;">Sale status: ${escapeDispatchHtml(pack.sale_status)}</div>`
            : "";

        return `
            <div class="card">
                <div class="card-head">
                    <div>
                        <div class="card-title">${escapeDispatchHtml(pack.source_name || "Manual pack")}</div>
                        <div class="muted small">Label ${escapeDispatchHtml(pack.label_order || "")}</div>
                        ${saleStatus}
                    </div>

                    <div style="display:flex;gap:10px;align-items:flex-start;">
                        ${courierPreview}
                        <div>
                            <div class="label-number">Label ${escapeDispatchHtml(pack.label_order || "")}</div>
                            <div style="margin-top:8px;text-align:right;">
                                <span class="status ${escapeDispatchHtml(pack.status || "needs_review")}">
                                    ${escapeDispatchHtml(statusLabel(pack.status))}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                ${itemHtml}

                <div class="dispatch-add-grid">
                    <div class="dispatch-search-wrap">
                        <input
                            id="dispatch-add-search-${Number(pack.id)}"
                            type="text"
                            placeholder="Add another active-stock item"
                            oninput="dispatchSearchSuggestions('add',${Number(pack.id)},this.value)"
                            autocomplete="off"
                        >
                        <div
                            id="dispatch-suggestions-add-${Number(pack.id)}"
                            class="dispatch-suggestions"
                        ></div>
                        <div
                            id="dispatch-add-selected-${Number(pack.id)}"
                            class="muted small"
                        ></div>
                    </div>

                    <input
                        id="dispatch-add-qty-${Number(pack.id)}"
                        type="number"
                        min="1"
                        value="1"
                    >

                    <button
                        type="button"
                        onclick="dispatchAddMatchedItem(${Number(pack.id)})"
                    >
                        Add Item
                    </button>
                </div>

                ${pack.sale_error ? `<div class="dispatch-failed">${escapeDispatchHtml(pack.sale_error)}</div>` : ""}

                <div class="dispatch-workflow-actions">
                    <button
                        class="success"
                        type="button"
                        onclick="startDispatchPacking([${Number(pack.id)}])"
                    >
                        Pack This Label
                    </button>

                    <button
                        class="danger"
                        type="button"
                        onclick="removePack(${Number(pack.id)})"
                    >
                        Remove From Queue
                    </button>
                </div>
            </div>
        `;
    }

    function normaliseSuggestionText(value){
        return String(value || "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g," ")
            .trim()
            .replace(/\s+/g," ");
    }

    function dispatchProductMatchPercent(product,query){
        const search = normaliseSuggestionText(query);
        const description = normaliseSuggestionText(product.description);
        const rawBarcode = String(product.barcode || "").trim();
        const wantedBarcode = normaliseDispatchBarcode(query);
        const actualBarcode = normaliseDispatchBarcode(rawBarcode);

        if(wantedBarcode && actualBarcode === wantedBarcode){
            return 100;
        }

        if(search && description === search){
            return 100;
        }

        if(search && description.startsWith(search)){
            return 96;
        }

        if(search && description.includes(search)){
            return 92;
        }

        if(
            wantedBarcode &&
            actualBarcode &&
            actualBarcode.includes(wantedBarcode)
        ){
            return 90;
        }

        const searchTokens = search
            .split(" ")
            .filter(Boolean);

        const descriptionTokens = new Set(
            description
                .split(" ")
                .filter(Boolean)
        );

        if(!searchTokens.length){
            return 0;
        }

        let matchedTokens = 0;

        searchTokens.forEach(function(token){
            if(
                descriptionTokens.has(token) ||
                Array.from(descriptionTokens).some(
                    descriptionToken =>
                        descriptionToken.startsWith(token) ||
                        token.startsWith(descriptionToken)
                )
            ){
                matchedTokens++;
            }
        });

        const ratio =
            matchedTokens /
            searchTokens.length;

        return Math.max(
            0,
            Math.min(
                89,
                Math.round(ratio * 84)
            )
        );
    }

    async function fetchSuggestions(query){
        /*
            Use the same established product-suggestion endpoint as add.html.

            The Add Stock page searches:
                /products?search=...

            Dispatch filters those results down to products that currently
            have active stock, then ranks the closest descriptions locally.
            This removes the separate GET /dispatch-workflow/suggestions
            dependency.
        */
        const data = await InventoryAPI.request(
            "/products?search=" +
            encodeURIComponent(query) +
            "&_t=" +
            Date.now()
        );

        if(!data || !data.success){
            throw new Error(
                data?.error ||
                "Could not search existing products"
            );
        }

        const products = Array.isArray(data.products)
            ? data.products
            : (
                Array.isArray(data.results)
                    ? data.results
                    : []
            );

        return products
            .map(function(product){
                const totalQty = Number(
                    product.total_qty ??
                    product.current_qty ??
                    product.currentQty ??
                    product.stock_qty ??
                    product.stockQty ??
                    product.quantity ??
                    product.qty ??
                    0
                );

                return {
                    product_id:
                        product.id ||
                        product.product_id ||
                        "",

                    inventory_id:
                        product.inventory_id ||
                        "",

                    barcode:
                        product.barcode ||
                        "",

                    description:
                        product.description ||
                        product.barcode ||
                        "Unnamed product",

                    total_qty:
                        totalQty,

                    locations:[],

                    match_percent:
                        dispatchProductMatchPercent(
                            product,
                            query
                        )
                };
            })
            .filter(function(product){
                return (
                    product.product_id &&
                    product.inventory_id &&
                    product.total_qty > 0
                );
            })
            .sort(function(left,right){
                const scoreDifference =
                    Number(right.match_percent || 0) -
                    Number(left.match_percent || 0);

                if(scoreDifference !== 0){
                    return scoreDifference;
                }

                return (
                    Number(right.total_qty || 0) -
                    Number(left.total_qty || 0)
                );
            })
            .slice(0,12);
    }

    function renderSuggestionList(kind,id,suggestions){
        const key = `${kind}-${id}`;
        dispatchSuggestionCache.set(key,suggestions);

        const container = document.getElementById(`dispatch-suggestions-${kind}-${id}`);

        if(!container){
            return;
        }

        if(!suggestions.length){
            container.innerHTML = `<div class="muted small" style="padding:10px;">No active-stock matches found.</div>`;
            container.classList.add("open");
            return;
        }

        container.innerHTML = suggestions.map((item,index) => {
            const firstLocation = Array.isArray(item.locations) && item.locations[0]
                ? item.locations[0]
                : {};

            return `
                <button
                    class="dispatch-suggestion"
                    type="button"
                    onclick="dispatchChooseSuggestion('${kind}',${Number(id)},${index})"
                >
                    <strong>${escapeDispatchHtml(item.description)}</strong>
                    <span>
                        ${escapeDispatchHtml(item.barcode)}
                        · Current Qty ${escapeDispatchHtml(item.total_qty)}
                        · ${escapeDispatchHtml(item.match_percent || 0)}% match
                    </span>
                </button>
            `;
        }).join("");

        container.classList.add("open");
    }

    window.dispatchSearchSuggestions = function(kind,id,query){
        const key = `${kind}-${id}`;
        clearTimeout(dispatchSuggestionTimers.get(key));

        const value = String(query || "").trim();
        const container = document.getElementById(`dispatch-suggestions-${kind}-${id}`);

        if(value.length < 1){
            dispatchSuggestionCache.delete(key);
            container?.classList.remove("open");
            return;
        }

        dispatchSuggestionTimers.set(key,setTimeout(async function(){
            try{
                const suggestions = await fetchSuggestions(value);
                renderSuggestionList(kind,id,suggestions);
            }catch(error){
                if(container){
                    container.innerHTML = `<div class="error small" style="padding:10px;">${escapeDispatchHtml(error.message)}</div>`;
                    container.classList.add("open");
                }
            }
        },250));
    };

    window.dispatchChooseSuggestion = async function(kind,id,index){
        const key = `${kind}-${id}`;
        const suggestions = dispatchSuggestionCache.get(key) || [];
        const suggestion = suggestions[index];

        if(!suggestion){
            return;
        }

        document.getElementById(`dispatch-suggestions-${kind}-${id}`)?.classList.remove("open");

        if(kind === "add"){
            pendingAddMatches.set(Number(id),suggestion);

            const input = document.getElementById(`dispatch-add-search-${id}`);
            const selected = document.getElementById(`dispatch-add-selected-${id}`);

            if(input){
                input.value = suggestion.description;
            }

            if(selected){
                selected.innerHTML =
                    `Selected: <strong>${escapeDispatchHtml(suggestion.description)}</strong>` +
                    ` · ${escapeDispatchHtml(suggestion.barcode)}` +
                    ` · Current Qty ${escapeDispatchHtml(suggestion.total_qty)}`;
            }

            return;
        }

        const qty = Math.max(1,Number(document.getElementById(`dispatch-item-qty-${id}`)?.value || 1));
        showLoading("Selecting active stock...");

        try{
            const data = await InventoryAPI.request(
                `/shipping-labels/item/${Number(id)}/update`,
                {
                    method:"POST",
                    body:JSON.stringify({
                        description:suggestion.description,
                        qty,
                        barcode:suggestion.barcode,
                        product_id:suggestion.product_id,
                        inventory_id:suggestion.inventory_id
                    })
                }
            );

            if(!data || !data.success){
                throw new Error(data?.error || "Could not select item");
            }

            dispatchVerifiedQty.delete(Number(id));
            dispatchManualPacked.delete(Number(id));
            writeDispatchState();
            await loadQueue();
        }catch(error){
            alert(error.message || "Could not select item");
        }finally{
            hideLoading();
        }
    };

    window.dispatchUseBestMatch = async function(itemId){
        const input = document.getElementById(`dispatch-item-search-${itemId}`);
        const query = String(input?.value || "").trim();

        if(!query){
            alert("Type an item name or barcode first.");
            return;
        }

        try{
            const suggestions = await fetchSuggestions(query);

            if(!suggestions.length){
                alert("No active-stock matches were found.");
                return;
            }

            dispatchSuggestionCache.set(`item-${itemId}`,suggestions);
            await window.dispatchChooseSuggestion("item",itemId,0);
        }catch(error){
            alert(error.message || "Could not find a match");
        }
    };

    window.dispatchAddMatchedItem = async function(packId){
        let match = pendingAddMatches.get(Number(packId));
        const searchInput = document.getElementById(`dispatch-add-search-${packId}`);
        const qty = Math.max(1,Number(document.getElementById(`dispatch-add-qty-${packId}`)?.value || 1));

        if(!match){
            const query = String(searchInput?.value || "").trim();

            if(!query){
                alert("Type an item and choose an active-stock suggestion first.");
                return;
            }

            const suggestions = await fetchSuggestions(query);
            match = suggestions[0];
        }

        if(!match){
            alert("No active-stock match was found.");
            return;
        }

        showLoading("Adding item to packing job...");

        try{
            const data = await InventoryAPI.request(
                `/shipping-labels/${Number(packId)}/add-item`,
                {
                    method:"POST",
                    body:JSON.stringify({
                        description:match.description,
                        qty,
                        barcode:match.barcode,
                        product_id:match.product_id,
                        inventory_id:match.inventory_id
                    })
                }
            );

            if(!data || !data.success){
                throw new Error(data?.error || "Could not add item");
            }

            pendingAddMatches.delete(Number(packId));
            await loadQueue();
        }catch(error){
            alert(error.message || "Could not add item");
        }finally{
            hideLoading();
        }
    };

    async function matchAllDispatchItems(){
        const data = await InventoryAPI.request(
            "/shipping-labels/search-locations",
            {method:"POST",body:"{}"}
        );

        if(!data || !data.success){
            throw new Error(data?.error || "Could not match packing items");
        }

        await loadQueue();
    }

    async function printPackingLabels(packIds){
        const printablePackIds = (queueCache || [])
            .filter(pack => {
                return packIds.includes(Number(pack.id)) && !!pack.preview_url;
            })
            .map(pack => Number(pack.id));

        if(!printablePackIds.length){
            return;
        }

        const data = await InventoryAPI.request(
            "/shipping-labels/print-images",
            {
                method:"POST",
                body:JSON.stringify({pack_ids:printablePackIds})
            }
        );

        if(!data.success){
            throw new Error(data.error || "Could not prepare shipping labels");
        }

        const labels = Array.isArray(data.labels) ? data.labels : [];

        if(!labels.length){
            throw new Error("No printable shipping labels were returned");
        }

        await printDispatchImagesWithQz(labels);
    }

    window.startDispatchPacking = async function(requestedPackIds){
        const resultBox = document.getElementById("dispatchWorkflowResult");
        showLoading("Checking active stock matches...");

        try{
            await loadDispatchPreferences();
            await ensureExistingWorkflowBackend();
            await matchAllDispatchItems();
            hydrateDispatchQueueState();

            const packIds = Array.isArray(requestedPackIds) && requestedPackIds.length
                ? requestedPackIds.map(Number)
                : (queueCache || [])
                    .filter(pack => String(pack.status || "") !== "packed")
                    .map(pack => Number(pack.id));

            if(!packIds.length){
                throw new Error("There are no unfinished packing jobs to start.");
            }

            const errors = validateDispatchPacks(packIds);

            if(errors.length){
                throw new Error(errors.join("\n"));
            }

            dispatchSessionPackIds = packIds;
            dispatchCurrentPackIndex = 0;
            dispatchCompletionResults = null;
            writeDispatchState();

            if(dispatchPreferences.dispatch_auto_print_on_start){
                document.getElementById("loadingText").innerText = "Printing 4×6 shipping labels...";

                try{
                    await printPackingLabels(dispatchSessionPackIds);
                }catch(printError){
                    const continuePacking = confirm(
                        "The packing jobs are ready, but label printing failed.\n\n" +
                        (printError.message || "Unknown print error") +
                        "\n\nContinue to the packing screen anyway?"
                    );

                    if(!continuePacking){
                        throw printError;
                    }
                }
            }

            enterDispatchPackingMode();

            if(resultBox){
                resultBox.innerHTML = "";
            }
        }catch(error){
            console.error(error);

            if(resultBox){
                resultBox.innerHTML = `<div class="dispatch-failed">${escapeDispatchHtml(error.message || "Could not start packing")}</div>`;
            }

            alert(error.message || "Could not start packing");
        }finally{
            hideLoading();
        }
    };

    function activeSessionPacks(){
        return dispatchSessionPackIds
            .map(findPack)
            .filter(pack => pack && String(pack.status || "") !== "packed")
            .sort((left,right) => Number(left.label_order || 0) - Number(right.label_order || 0));
    }

    function currentDispatchPack(){
        const packs = activeSessionPacks();

        if(!packs.length){
            return null;
        }

        dispatchCurrentPackIndex = Math.max(0,Math.min(dispatchCurrentPackIndex,packs.length - 1));
        return packs[dispatchCurrentPackIndex];
    }

    function itemIsComplete(item){
        if(dispatchPreferences.dispatch_require_scan){
            return Number(dispatchVerifiedQty.get(Number(item.id)) || 0) >= Number(item.qty || 0);
        }

        return dispatchManualPacked.has(Number(item.id));
    }

    function allScansComplete(){
        if(!dispatchPreferences.dispatch_require_scan){
            return true;
        }

        return activeSessionPacks().every(pack => {
            return (pack.items || []).every(item => {
                return Number(dispatchVerifiedQty.get(Number(item.id)) || 0) >= Number(item.qty || 0);
            });
        });
    }

    function allPricesReady(){
        if(!dispatchPreferences.track_sales_data){
            return true;
        }

        return activeSessionPacks().every(pack => {
            return Number(dispatchPriceMills.get(Number(pack.id)) || 0) > 0;
        });
    }

    function packingItemHtml(item,index){
        const complete = itemIsComplete(item);
        const next = !complete && index === (currentDispatchPack()?.items || []).findIndex(row => !itemIsComplete(row));
        const verified = dispatchPreferences.dispatch_require_scan
            ? Number(dispatchVerifiedQty.get(Number(item.id)) || 0)
            : (complete ? Number(item.qty || 0) : 0);

        return `
            <div class="dispatch-pick-item ${complete ? "complete" : ""} ${next ? "next" : ""}">
                <button
                    class="dispatch-check"
                    type="button"
                    ${dispatchPreferences.dispatch_require_scan ? "disabled" : `onclick="dispatchToggleManualPacked(${Number(item.id)})"`}
                >
                    ${complete ? "✓" : "○"}
                </button>

                <div>
                    <div class="dispatch-item-name">${escapeDispatchHtml(item.description)}</div>
                    <div class="dispatch-item-location">
                        ${escapeDispatchHtml(item.picked_location || "Location not selected")}
                        · ${escapeDispatchHtml(item.matched_barcode || "No barcode")}
                    </div>
                </div>

                <div class="dispatch-item-count">
                    ${verified}/${escapeDispatchHtml(item.qty)} packed
                </div>
            </div>
        `;
    }

    window.dispatchToggleManualPacked = function(itemId){
        const id = Number(itemId);

        if(dispatchManualPacked.has(id)){
            dispatchManualPacked.delete(id);
        }else{
            dispatchManualPacked.add(id);
        }

        writeDispatchState();
        renderDispatchPackingMode();
    };

    function packingResultHtml(){
        if(!dispatchCompletionResults){
            return "";
        }

        const completed = dispatchCompletionResults.completed || [];
        const failed = dispatchCompletionResults.failed || [];

        return `
            <div class="dispatch-result-card" style="margin-top:14px;">
                <strong>Completion result</strong>
                <div class="muted small" style="margin-top:6px;">
                    ${completed.length} completed · ${failed.length} waiting
                </div>
                ${failed.map(item => `
                    <div class="dispatch-failed">
                        Label ${escapeDispatchHtml(findPack(item.pack_id)?.label_order || item.pack_id)}:
                        ${escapeDispatchHtml(item.error)}
                    </div>
                `).join("")}
            </div>
        `;
    }

    function renderDispatchPackingMode(){
        const container = document.getElementById("dispatchPackingModeContent");
        const packs = activeSessionPacks();
        const pack = currentDispatchPack();

        if(!container){
            return;
        }

        if(!pack){
            container.innerHTML = `
                <div class="dispatch-result-card">
                    <h2 style="margin-top:0;">Packing complete</h2>
                    <p class="muted">There are no unfinished packing jobs in this session.</p>
                    <button type="button" onclick="dispatchExitPackingMode()">Return to Dispatch Centre</button>
                </div>
            `;
            return;
        }

        const price = formatMills(dispatchPriceMills.get(Number(pack.id)) || 0);
        const preview = pack.preview_url
            ? courierPreviewMedia(
                InventoryAPI.API_BASE + pack.preview_url,
                pack.preview_type,
                `Shipping label ${pack.label_order}`
            )
            : `<div class="muted" style="padding:20px;text-align:center;">No shipping-label preview</div>`;

        const voiceVisible = dispatchPreferences.track_sales_data && dispatchPreferences.dispatch_show_voice_mode;
        const completionDisabled = !allScansComplete() || !allPricesReady();

        container.innerHTML = `
            <div class="dispatch-packing-toolbar">
                <div>
                    <div class="dispatch-progress">
                        Pick ${dispatchCurrentPackIndex + 1} of ${packs.length}
                    </div>
                    <h2 style="margin:5px 0 4px;">Label ${escapeDispatchHtml(pack.label_order || pack.id)}</h2>
                    <div class="muted small">${escapeDispatchHtml(pack.source_name || "Shipping label")}</div>
                </div>

                <button class="secondary" type="button" onclick="dispatchExitPackingMode()">
                    Exit Packing View
                </button>
            </div>

            <div class="dispatch-packing-layout">
                <div>
                    <div class="dispatch-pick-card">
                        <strong>Items to put in this parcel</strong>
                        <div class="muted small" style="margin-top:5px;">
                            ${dispatchPreferences.dispatch_require_scan
                                ? "Scan every required unit. The sale cannot complete until all scans are green."
                                : "Scanning is optional. Click the circles to mark items packed manually."}
                        </div>

                        ${(pack.items || []).map(packingItemHtml).join("")}
                    </div>

                    <div class="dispatch-scan-card" style="margin-top:14px;">
                        <strong>${dispatchPreferences.dispatch_require_scan ? "Barcode verification" : "Optional barcode check"}</strong>
                        <input
                            id="dispatchScannerInput"
                            class="dispatch-scanner-input"
                            type="text"
                            inputmode="none"
                            autocomplete="off"
                            placeholder="Scan item barcode"
                        >
                        <div id="dispatchScanStatus" class="dispatch-scan-status">
                            Ready for the next scan.
                        </div>
                    </div>

                    ${dispatchPreferences.track_sales_data ? `
                        <div class="dispatch-price-card" style="margin-top:14px;">
                            <strong>Sale price for this label</strong>
                            <div class="muted small" style="margin:5px 0 8px;">
                                Up to three decimal places are stored. Bundle lines always add back to this exact total.
                            </div>
                            <input
                                id="dispatchSalePrice"
                                class="dispatch-sale-input"
                                type="number"
                                min="0"
                                step="0.001"
                                value="${escapeDispatchHtml(price)}"
                                oninput="dispatchPriceChanged(${Number(pack.id)},this.value)"
                            >

                            ${voiceVisible ? `
                                <label class="dispatch-voice-row">
                                    <input
                                        id="dispatchVoiceToggle"
                                        type="checkbox"
                                        onchange="dispatchToggleVoice()"
                                        ${dispatchVoiceListening ? "checked" : ""}
                                    >
                                    <span>Listen for prices and packing commands</span>
                                </label>
                                <div id="dispatchVoiceStatus" class="dispatch-voice-status">
                                    Say “three fifty”, “next pick”, “previous pick”, “repeat item” or “complete sale”.
                                </div>
                            ` : ""}
                        </div>
                    ` : `
                        <div class="dispatch-price-card" style="margin-top:14px;">
                            <strong>Sales tracking is off</strong>
                            <div class="muted small" style="margin-top:5px;">
                                Completing this session removes stock but does not create sales records.
                            </div>
                        </div>
                    `}

                    ${pack.sale_error ? `<div class="dispatch-failed">${escapeDispatchHtml(pack.sale_error)}</div>` : ""}
                    ${packingResultHtml()}

                    <div class="dispatch-pack-nav">
                        <button class="secondary" type="button" onclick="dispatchPreviousPack()" ${dispatchCurrentPackIndex <= 0 ? "disabled" : ""}>
                            Previous Pick
                        </button>
                        <button type="button" onclick="dispatchNextPack()" ${dispatchCurrentPackIndex >= packs.length - 1 ? "disabled" : ""}>
                            Next Pick
                        </button>
                    </div>

                    <button
                        id="dispatchCompleteSalesButton"
                        class="dispatch-complete-button"
                        type="button"
                        onclick="dispatchCompleteSales()"
                        ${completionDisabled ? "disabled" : ""}
                    >
                        Complete ${packs.length === 1 ? "Sale" : "Sales"}
                    </button>

                    ${completionDisabled ? `
                        <div class="muted small" style="margin-top:7px;text-align:center;">
                            ${!allScansComplete()
                                ? "Complete Sale unlocks when every required item has been scanned."
                                : "Enter and save a sale price for every pick before completing the sales."}
                        </div>
                    ` : ""}
                </div>

                <div class="dispatch-label-card">
                    <strong>Shipping label preview</strong>
                    <div class="dispatch-label-preview" style="margin-top:10px;">
                        ${preview}
                    </div>
                </div>
            </div>
        `;

        const scannerInput = document.getElementById("dispatchScannerInput");

        if(scannerInput){
            scannerInput.addEventListener("keydown",function(event){
                if(event.key === "Enter"){
                    event.preventDefault();
                    dispatchProcessScan(scannerInput.value);
                }
            });

            setTimeout(function(){
                scannerInput.focus();
            },100);
        }
    }

    function speakDispatch(text){
        if(!dispatchPreferences.dispatch_voice_prompts || !window.speechSynthesis){
            return;
        }

        try{
            const utterance = new SpeechSynthesisUtterance(String(text || ""));
            utterance.lang = "en-GB";
            utterance.rate = 1.05;
            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(utterance);
        }catch(error){}
    }

    function speakCurrentPack(){
        const pack = currentDispatchPack();

        if(!pack){
            return;
        }

        const firstIncomplete = (pack.items || []).find(item => !itemIsComplete(item)) || (pack.items || [])[0];

        if(firstIncomplete){
            speakDispatch(
                `Label ${pack.label_order}. ${firstIncomplete.description}. Location ${firstIncomplete.picked_location || "not selected"}. Quantity ${firstIncomplete.qty}.`
            );
        }
    }

    function enterDispatchPackingMode(){
        dispatchPackingActive = true;
        document.body.classList.add("dispatch-packing-active");
        renderDispatchPackingMode();
        speakCurrentPack();

        if(dispatchPreferences.track_sales_data && dispatchPreferences.dispatch_show_voice_mode){
            startDispatchVoice();
        }
    }

    window.dispatchExitPackingMode = function(){
        dispatchPackingActive = false;
        document.body.classList.remove("dispatch-packing-active");
        stopDispatchVoice();
        renderQueue();
        window.scrollTo({top:0,behavior:"smooth"});
    };

    window.dispatchProcessScan = async function(rawBarcode){
        const barcode = normaliseDispatchBarcode(rawBarcode);
        const pack = currentDispatchPack();
        const input = document.getElementById("dispatchScannerInput");
        const status = document.getElementById("dispatchScanStatus");

        if(input){
            input.value = "";
        }

        if(!barcode || !pack){
            return;
        }

        const item = (pack.items || []).find(row => {
            return normaliseDispatchBarcode(row.matched_barcode) === barcode &&
                Number(dispatchVerifiedQty.get(Number(row.id)) || 0) < Number(row.qty || 0);
        });

        if(!item){
            document.body.classList.add("error-flash");
            setTimeout(() => document.body.classList.remove("error-flash"),700);

            if(status){
                status.className = "dispatch-scan-status error";
                status.textContent = `Wrong or already completed barcode: ${barcode}`;
            }

            speakDispatch("Wrong item");
            input?.focus();
            return;
        }

        const nextQty = Math.min(
            Number(item.qty || 0),
            Number(dispatchVerifiedQty.get(Number(item.id)) || 0) + 1
        );

        dispatchVerifiedQty.set(Number(item.id),nextQty);
        item.verified_qty = nextQty;
        writeDispatchState();

        document.body.classList.add("success-flash");
        setTimeout(() => document.body.classList.remove("success-flash"),500);

        if(status){
            status.className = "dispatch-scan-status ok";
            status.textContent = `${item.description}: ${nextQty}/${item.qty} verified`;
        }

        renderDispatchPackingMode();

        const packComplete = (pack.items || []).every(row => {
            return Number(dispatchVerifiedQty.get(Number(row.id)) || 0) >= Number(row.qty || 0);
        });

        if(packComplete){
            speakDispatch("Pick verified");
        }

        setTimeout(function(){
            document.getElementById("dispatchScannerInput")?.focus();
        },100);
    };

    async function savePackPrice(packId,value){
        const mills = parseDispatchMills(value || "0.000");
        dispatchPriceMills.set(Number(packId),mills);

        const pack = findPack(packId);
        if(pack){
            pack.sale_total_mills = mills;
        }

        writeDispatchState();

        const completeButton = document.getElementById("dispatchCompleteSalesButton");
        if(completeButton){
            completeButton.disabled = !allScansComplete() || !allPricesReady();
        }

        return {success:true,sale_total_mills:mills};
    }

    window.dispatchPriceChanged = function(packId,value){
        clearTimeout(dispatchPriceTimers.get(Number(packId)));
        dispatchPriceTimers.set(Number(packId),setTimeout(function(){
            savePackPrice(packId,value).catch(function(error){
                const status = document.getElementById("dispatchVoiceStatus");
                if(status){
                    status.textContent = error.message || "Could not save price";
                }
            });
        },350));
    };

    async function saveCurrentPrice(){
        if(!dispatchPreferences.track_sales_data){
            return;
        }

        const pack = currentDispatchPack();
        const input = document.getElementById("dispatchSalePrice");

        if(pack && input){
            await savePackPrice(pack.id,input.value || "0.000");
        }
    }

    window.dispatchNextPack = async function(){
        try{
            await saveCurrentPrice();
            const packs = activeSessionPacks();
            dispatchCurrentPackIndex = Math.min(dispatchCurrentPackIndex + 1,packs.length - 1);
            renderDispatchPackingMode();
            speakCurrentPack();
        }catch(error){
            alert(error.message || "Could not save the current price");
        }
    };

    window.dispatchPreviousPack = async function(){
        try{
            await saveCurrentPrice();
            dispatchCurrentPackIndex = Math.max(0,dispatchCurrentPackIndex - 1);
            renderDispatchPackingMode();
            speakCurrentPack();
        }catch(error){
            alert(error.message || "Could not save the current price");
        }
    };

    window.dispatchCompleteSales = async function(){
        if(!allScansComplete()){
            alert("Every required item must be scanned before completing the sales.");
            return;
        }

        showLoading("Completing dispatch sales...");

        try{
            await saveCurrentPrice();
            await ensureExistingWorkflowBackend();

            const packs = activeSessionPacks();
            const completed = [];
            const failed = [];

            for(const pack of packs){
                const packId = Number(pack.id);

                try{
                    const saleMills = Number(dispatchPriceMills.get(packId) || 0);
                    const data = await InventoryAPI.request(
                        `/shipping-labels/${packId}/packed`,
                        {
                            method:"POST",
                            body:JSON.stringify({
                                complete_sale:true,
                                sale_amount:formatMills(saleMills),
                                verified_items:(pack.items || []).map(item => ({
                                    item_id:Number(item.id),
                                    verified_qty:Number(dispatchVerifiedQty.get(Number(item.id)) || 0)
                                })),
                                items:(pack.items || []).map(item => ({
                                    item_id:Number(item.id),
                                    barcode:item.matched_barcode || dispatchBestLocation(item).barcode || "",
                                    location:item.picked_location || dispatchBestLocation(item).location || ""
                                }))
                            })
                        }
                    );

                    if(!data || !data.success){
                        throw new Error(data?.error || "Could not complete this sale");
                    }

                    completed.push({
                        pack_id:packId,
                        label_order:pack.label_order,
                        sale_amount:data.sale_amount || formatMills(saleMills)
                    });
                    clearDispatchPackState(packId);
                }catch(error){
                    failed.push({
                        pack_id:packId,
                        label_order:pack.label_order,
                        error:error.message || "Could not complete this sale"
                    });
                }
            }

            dispatchCompletionResults = {completed,failed};
            await loadQueue();

            if(failed.length){
                dispatchSessionPackIds = failed.map(item => Number(item.pack_id));
                dispatchCurrentPackIndex = 0;
                writeDispatchState();
                renderDispatchPackingMode();
                speakDispatch(`${completed.length} completed. ${failed.length} need attention.`);
                return;
            }

            speakDispatch("All sales complete");
            alert(`${completed.length} dispatch sale${completed.length === 1 ? "" : "s"} completed successfully.`);
            window.dispatchExitPackingMode();
            await loadQueue();
        }catch(error){
            console.error(error);
            alert(error.message || "Could not complete dispatch sales");
        }finally{
            hideLoading();
        }
    };

    function wordsToDispatchNumber(words){
        const small = {
            zero:0,oh:0,one:1,won:1,two:2,too:2,to:2,three:3,
            four:4,for:4,five:5,six:6,seven:7,eight:8,ate:8,
            nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,
            fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19
        };
        const tens = {
            twenty:20,thirty:30,forty:40,fourty:40,fifty:50,
            sixty:60,seventy:70,eighty:80,ninety:90
        };

        return words.reduce(function(total,word){
            if(Object.prototype.hasOwnProperty.call(small,word)) return total + small[word];
            if(Object.prototype.hasOwnProperty.call(tens,word)) return total + tens[word];
            return total;
        },0);
    }

    function parseDispatchSpokenPrice(text){
        let phrase = String(text || "").toLowerCase()
            .replace(/price|set|amount|pounds?|quid|gbp|£/g,"")
            .replace(/,/g,"")
            .trim();

        let decimal = phrase.match(/(\d+)\s*(?:\.|:|point)\s*(\d{1,3})/);
        if(decimal){
            return `${Number(decimal[1])}.${decimal[2].padEnd(3,"0")}`;
        }

        let twoParts = phrase.match(/\b(\d+)\s+(\d{1,3})\b/);
        if(twoParts){
            return `${Number(twoParts[1])}.${twoParts[2].padEnd(2,"0").slice(0,3)}`;
        }

        let whole = phrase.match(/\b(\d+)\b/);
        if(whole){
            return Number(whole[1]).toFixed(3);
        }

        const validWords = [
            "zero","oh","one","won","two","too","to","three","four","for","five","six",
            "seven","eight","ate","nine","ten","eleven","twelve","thirteen","fourteen",
            "fifteen","sixteen","seventeen","eighteen","nineteen","twenty","thirty",
            "forty","fourty","fifty","sixty","seventy","eighty","ninety"
        ];

        const words = phrase.split(/\s+/).filter(word => validWords.includes(word));

        if(!words.length){
            return null;
        }

        if(words.length === 1){
            return wordsToDispatchNumber(words).toFixed(3);
        }

        const pounds = wordsToDispatchNumber([words[0]]);
        let pence = wordsToDispatchNumber(words.slice(1));
        if(pence < 10) pence *= 10;
        return (pounds + pence / 100).toFixed(3);
    }

    function setDispatchVoiceStatus(message){
        const element = document.getElementById("dispatchVoiceStatus");
        if(element){
            element.textContent = message;
        }
    }

    function handleDispatchVoiceCommand(transcript){
        const phrase = String(transcript || "").toLowerCase().trim();

        if(phrase.includes("next pick")){
            setDispatchVoiceStatus("Next pick command heard.");
            window.dispatchNextPack();
            return;
        }

        if(phrase.includes("previous pick") || phrase.includes("back pick")){
            setDispatchVoiceStatus("Previous pick command heard.");
            window.dispatchPreviousPack();
            return;
        }

        if(phrase.includes("complete sale") || phrase.includes("complete sales") || phrase.includes("confirm sale")){
            setDispatchVoiceStatus("Complete sale command heard.");
            window.dispatchCompleteSales();
            return;
        }

        if(phrase.includes("repeat item")){
            speakCurrentPack();
            return;
        }

        if(phrase.includes("repeat location")){
            const pack = currentDispatchPack();
            const item = (pack?.items || []).find(row => !itemIsComplete(row)) || (pack?.items || [])[0];
            speakDispatch(item ? `Location ${item.picked_location || "not selected"}` : "No item selected");
            return;
        }

        const price = parseDispatchSpokenPrice(phrase);

        if(price !== null){
            const input = document.getElementById("dispatchSalePrice");
            const pack = currentDispatchPack();

            if(input && pack){
                input.value = price;
                window.dispatchPriceChanged(pack.id,price);
                setDispatchVoiceStatus(`Heard “${transcript}”. Price set to £${price}.`);
                speakDispatch(`Price set to ${price} pounds`);
            }
            return;
        }

        setDispatchVoiceStatus(`Heard “${transcript}”, but no command or price was recognised.`);
    }

    function startDispatchVoice(){
        if(!dispatchPreferences.dispatch_show_voice_mode || !dispatchPreferences.track_sales_data){
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if(!SpeechRecognition){
            setDispatchVoiceStatus("Voice recognition is unavailable. Use Chrome on Windows for best results.");
            return;
        }

        if(dispatchSpeechRecognition && dispatchVoiceListening){
            return;
        }

        dispatchSpeechRecognition = new SpeechRecognition();
        dispatchSpeechRecognition.continuous = true;
        dispatchSpeechRecognition.interimResults = true;
        dispatchSpeechRecognition.lang = "en-GB";
        dispatchSpeechRecognition.maxAlternatives = 3;

        dispatchSpeechRecognition.onstart = function(){
            dispatchVoiceListening = true;
            const toggle = document.getElementById("dispatchVoiceToggle");
            if(toggle) toggle.checked = true;
            setDispatchVoiceStatus("Listening for a price or packing command...");
        };

        dispatchSpeechRecognition.onresult = function(event){
            let finalTranscript = "";
            let interimTranscript = "";

            for(let index = event.resultIndex; index < event.results.length; index++){
                const transcript = event.results[index][0].transcript.trim();
                if(event.results[index].isFinal){
                    finalTranscript += transcript;
                }else{
                    interimTranscript += transcript;
                }
            }

            if(interimTranscript){
                setDispatchVoiceStatus(`Hearing “${interimTranscript}”`);
            }

            if(finalTranscript){
                handleDispatchVoiceCommand(finalTranscript);
            }
        };

        dispatchSpeechRecognition.onerror = function(event){
            setDispatchVoiceStatus(`Voice error: ${event.error}`);
        };

        dispatchSpeechRecognition.onend = function(){
            dispatchVoiceListening = false;

            if(dispatchPackingActive && document.getElementById("dispatchVoiceToggle")?.checked){
                setTimeout(function(){
                    try{
                        dispatchSpeechRecognition.start();
                    }catch(error){}
                },450);
            }
        };

        try{
            dispatchSpeechRecognition.start();
        }catch(error){
            setDispatchVoiceStatus("Could not start voice mode. Refresh the page and try again.");
        }
    }

    function stopDispatchVoice(){
        const toggle = document.getElementById("dispatchVoiceToggle");
        if(toggle) toggle.checked = false;

        if(dispatchSpeechRecognition){
            try{
                dispatchSpeechRecognition.stop();
            }catch(error){}
        }

        dispatchVoiceListening = false;
    }

    window.dispatchToggleVoice = function(){
        if(document.getElementById("dispatchVoiceToggle")?.checked){
            startDispatchVoice();
        }else{
            stopDispatchVoice();
        }
    };

    function refreshLetsPackButton(){
        refreshClearAllButton();

        const button = document.getElementById("dispatchLetsPackBtn");
        if(!button) return;

        const resumable = dispatchSessionPackIds
            .map(findPack)
            .filter(pack => pack && String(pack.status || "") !== "packed");

        if(resumable.length){
            button.textContent = `Resume Packing (${resumable.length})`;
            button.onclick = async function(){
                await loadDispatchPreferences();
                dispatchCurrentPackIndex = Math.max(0,Math.min(dispatchCurrentPackIndex,resumable.length - 1));
                enterDispatchPackingMode();
            };
        }else{
            button.textContent = "Let’s Pack";
            button.onclick = function(){
                startDispatchPacking();
            };
        }
    }

    function initialiseDispatchWorkflow(){
        readDispatchState();
        injectDispatchWorkflowStyles();
        injectWorkflowControls();
        loadDispatchPreferences();

        if(typeof renderPackCard === "function"){
            renderPackCard = dispatchRenderPackCard;
        }

        if(typeof addItemToPack === "function"){
            addItemToPack = function(packId){
                window.dispatchAddMatchedItem(packId);
            };
        }

        if(typeof updateItem === "function"){
            updateItem = function(itemId){
                window.dispatchUseBestMatch(itemId);
            };
        }

        if(typeof markPacked === "function"){
            markPacked = function(packId){
                window.startDispatchPacking([packId]);
            };
        }

        if(typeof loadQueue === "function"){
            const originalLoadQueue = loadQueue;
            loadQueue = async function(){
                const result = await originalLoadQueue();
                hydrateDispatchQueueState();
                renderQueue();
                refreshLetsPackButton();

                if(dispatchPackingActive){
                    renderDispatchPackingMode();
                }

                return result;
            };
        }

        document.getElementById("refreshBtn")?.addEventListener("click",function(){
            setTimeout(refreshLetsPackButton,250);
        });

        document.addEventListener("click",function(event){
            if(!event.target.closest(".dispatch-search-wrap")){
                document.querySelectorAll(".dispatch-suggestions.open")
                    .forEach(element => element.classList.remove("open"));
            }
        });

        setTimeout(function(){
            renderQueue();
            refreshLetsPackButton();
        },350);
    }

    window.renderDispatchPackingMode = renderDispatchPackingMode;
    window.startDispatchPacking = window.startDispatchPacking;

    if(document.readyState === "loading"){
        document.addEventListener("DOMContentLoaded",initialiseDispatchWorkflow,{once:true});
    }else{
        initialiseDispatchWorkflow();
    }
})();
