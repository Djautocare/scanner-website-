
if(!InventoryAPI.requireLogin()) throw new Error("Login required");
let suggestions=[], timer=null, bundle=[], pending=[], itemDiscarding=false;
function normaliseBarcode(v){let b=String(v||"").trim().toUpperCase().replace(/\s+/g,"");if(/^\d+$/.test(b))b="ITEM-"+b;if(/^ITEM\d+$/.test(b))b=b.replace("ITEM","ITEM-");return b}
function esc(v){return String(v||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}
function renderBundle(){const box=document.getElementById("bundleBox");if(!bundle.length){box.style.display="none";box.innerHTML="";return}box.style.display="block";box.innerHTML="<strong>Discard List ("+bundle.length+")</strong>"+bundle.map((b,i)=>`<div class="bundle-item"><span>${esc(b)}</span><button data-ios-click="h06364a34e69dd388" data-ios-click-args="${InventoryEvents.encode([i])}">Remove</button></div>`).join("")}
function addToBundle(){const b=normaliseBarcode(document.getElementById("barcode").value);if(!b)return alert("Enter or choose an item first");bundle.push(b);document.getElementById("barcode").value="";renderBundle()}
function clearBundle(){bundle=[];pending=[];renderBundle();document.getElementById("locationChoices").innerHTML=""}
function search(){const q=document.getElementById("barcode").value.trim();clearTimeout(timer);if(q.length<2||/^\d+$/.test(q)){document.getElementById("suggestPanel").innerHTML="";return}timer=setTimeout(async()=>{const d=await InventoryAPI.request("/search?query="+encodeURIComponent(q));suggestions=(d.results||[]).slice(0,12);document.getElementById("suggestPanel").innerHTML=suggestions.map((x,i)=>`<div class="suggest-item" data-ios-click="h9534973cb50ddc46" data-ios-click-args="${InventoryEvents.encode([i])}"><div class="suggest-title">${esc(x.description)}</div><div class="suggest-meta">${esc(x.barcode||x.itemId)} · Qty ${Number(x.totalQty||0)}</div></div>`).join("")||"<div class='suggest-item'>No matches</div>"},250)}
function choose(i){const x=suggestions[i];if(!x)return;document.getElementById("barcode").value=normaliseBarcode(x.barcode||x.itemId);document.getElementById("suggestPanel").classList.remove("open")}
function discardDetails() {
    return {
        reason: document.getElementById("reason").value,
        notes: document.getElementById("notes").value,
        estimated_loss: document.getElementById("estimatedLoss").value
    };
}

function requestDiscard({barcode, qty, location}, details = discardDetails()) {
    return InventoryAPI.request("/discard/remove", {
        method: "POST",
        body: JSON.stringify({barcode, qty, location: location || "", ...details})
    });
}

async function discardOne(item, inventory) {
    const data = await requestDiscard(item);
    if (inventory !== InventoryAPI.getSelectedInventoryHeader()) {
        clearBundle();
        document.getElementById("result").textContent = "Inventory changed. Remaining discards were stopped.";
        return false;
    }
    if (data.needsLocation) {
        showLocations(item, data.locations);
        return false;
    }
    if (!data.success) throw new Error(data.error || "Discard failed");
    document.getElementById("result").innerText = `Discarded ${data.discardedQty} × ${data.description} from ${InventoryWorkspace.formatLocationName(data.location)}. Remaining: ${data.remainingQty}`;
    return true;
}
function showLocations(item,locations){pending.unshift(item);document.getElementById("locationChoices").innerHTML="<div class='location-card'><strong>Select location for "+esc(item.barcode)+"</strong></div>"+locations.map(l=>`<button class="location-button" data-ios-click="h18a042dfa7e63926" data-ios-click-args="${InventoryEvents.encode([l.location])}">${InventoryWorkspace.locationNameHtml(l.location)} — Qty ${l.qty}</button>`).join("")}
function continueLocation(location) {
    if (itemDiscarding || !pending.length) return;
    pending[0].location = location;
    document.getElementById("locationChoices").innerHTML = "";
    return processPending();
}
async function processPending() {
    if (itemDiscarding) return;
    itemDiscarding = true;
    const toggle = document.getElementById("discardLocationToggle");
    const submit = document.getElementById("discardSubmit");
    toggle.disabled = submit.disabled = true;
    const inventory = InventoryAPI.getSelectedInventoryHeader();
    try {
        while (pending.length) {
            if (inventory !== InventoryAPI.getSelectedInventoryHeader()) {
                clearBundle();
                document.getElementById("result").textContent = "Inventory changed. Remaining discards were stopped.";
                return;
            }
            if (!await discardOne(pending.shift(), inventory)) return;
        }
        bundle = [];
        renderBundle();
        document.getElementById("barcode").value = "";
        document.getElementById("qty").value = "1";
    } catch (error) {
        pending = [];
        document.getElementById("result").textContent = error.message;
    } finally {
        itemDiscarding = false;
        toggle.disabled = submit.disabled = false;
    }
}

function discardPressed() {
    if (itemDiscarding) return;
    const {reason, notes} = discardDetails();
    if (!reason) return alert("Choose a discard reason");
    if (reason === "Other" && !notes.trim()) return alert("Add notes for Other");
    if (discardByLocation.active()) return discardByLocation.submit();
    if (bundle.length) {
        pending = bundle.map(barcode => ({barcode, qty: 1, location: ""}));
    } else {
        const barcode = normaliseBarcode(document.getElementById("barcode").value);
        if (!barcode) return alert("Enter or choose an item");
        pending = [{barcode, qty: Number(document.getElementById("qty").value || 1), location: ""}];
    }
    return processPending();
}
document.getElementById("barcode").addEventListener("input",search);document.getElementById("barcode").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();addToBundle()}});

const discardByLocation = (() => {
    const $ = id => document.getElementById(id);
    const toggle = $("discardLocationToggle");
    const panel = $("discardLocationPanel");
    const list = $("discardLocationList");
    const summary = $("discardSelectionSummary");
    const clear = $("discardSelectionClear");
    const submitButton = $("discardSubmit");
    const result = $("result");
    const selected = new Set();
    let locationState = "idle";
    let working = false;
    let inventoryVersion = 0;

    function element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text) node.textContent = text;
        return node;
    }

    function showSummary() {
        const units = [...selected].reduce((sum, line) => sum + (line.quantity.validity.valid ? line.quantity.valueAsNumber : 0), 0);
        summary.textContent = selected.size ? `${selected.size} stock ${selected.size === 1 ? "line" : "lines"} selected · ${units} units` : "No stock selected.";
        clear.disabled = working || selected.size === 0;
    }

    function unselect(line) {
        selected.delete(line);
        line.checkbox.checked = false;
        line.quantity.disabled = true;
        line.quantity.value = "1";
    }

    function renderStock(item, location, group) {
        const barcode = String(item.barcode || item.itemId || "");
        const description = String(item.description || barcode);
        const available = Number(item.qty);
        if (!barcode || !Number.isSafeInteger(available) || available < 1) return null;

        const row = element("div", "discard-stock-line");
        const label = element("label", "discard-stock-label");
        const checkbox = element("input", "discard-stock-check");
        checkbox.type = "checkbox";
        const caption = element("span");
        const meta = element("span", "helper-text", `${barcode} · Available: ${available}`);
        caption.append(element("strong", "", description), meta);
        label.append(checkbox, caption);
        const qtyLabel = element("label", "discard-stock-quantity", "Quantity to discard");
        const quantity = element("input");
        Object.assign(quantity, {type: "number", inputMode: "numeric", min: "1", max: String(available), step: "1", value: "1", required: true, disabled: true});
        quantity.setAttribute("aria-label", `Quantity to discard for ${description}`);
        qtyLabel.append(quantity);
        row.append(label, qtyLabel);
        const line = {barcode, location, checkbox, quantity, invalidateLocation: () => group.invalidate()};

        checkbox.addEventListener("change", () => {
            if (checkbox.checked) {
                selected.add(line);
                quantity.disabled = false;
            } else {
                unselect(line);
            }
            showSummary();
        });
        quantity.addEventListener("input", showSummary);

        line.recordDiscard = discarded => {
            group.units = Math.max(0, group.units - discarded);
            const left = Math.max(0, Number(quantity.max) - discarded);
            if (left === 0) {
                group.unique = Math.max(0, group.unique - 1);
                row.remove();
                if (!group.grid.childElementCount) group.grid.replaceChildren(element("p", "helper-text", "No stock in this location."));
            } else {
                quantity.max = String(left);
                meta.textContent = `${barcode} · Available: ${left}`;
            }
            group.updateCounts();
        };
        group.lines.push(line);
        return row;
    }

    function renderLocation(location) {
        const name = String(location.box || location.box_name || "");
        if (!name) return null;
        const group = {
            units: Number(location.qty ?? location.totalQty ?? location.total_qty ?? 0),
            unique: Number(location.uniqueItems ?? location.unique_items ?? location.differentItems ?? 0),
            lines: []
        };
        const details = element("details", "discard-location");
        const heading = element("summary");
        const locationName = element("strong");
        const counts = element("span", "helper-text");
        group.updateCounts = () => { counts.textContent = `${group.unique} unique · ${group.units} total`; };
        group.updateCounts();
        InventoryWorkspace.setLocationName(locationName, name);
        heading.append(locationName, counts);
        const contents = element("div", "discard-location-contents");
        details.append(heading, contents);
        let loading = false;
        let loaded = false;

        details.addEventListener("toggle", async () => {
            if (!details.open || loading || loaded || working) return;
            loading = true;
            contents.replaceChildren(element("p", "helper-text", "Loading stock…"));
            try {
                const data = await InventoryAPI.request("/boxes/" + encodeURIComponent(name) + "/contents?_t=" + Date.now());
                if (!details.isConnected) return;
                if (!data.success) throw new Error(data.error || "Could not load stock");
                group.grid = element("div", "discard-stock-grid");
                for (const item of data.results || []) {
                    const row = renderStock(item, name, group);
                    if (row) group.grid.append(row);
                }
                contents.replaceChildren(group.grid.childElementCount ? group.grid : element("p", "helper-text", "No stock in this location."));
                loaded = true;
            } catch (error) {
                contents.replaceChildren(element("p", "helper-text", error.message + ". Close and reopen to try again."));
            } finally {
                loading = false;
            }
        });
        group.invalidate = () => {
            group.lines.forEach(unselect);
            group.lines = [];
            loaded = false;
            details.open = false;
            contents.replaceChildren();
        };
        return details;
    }

    async function loadLocations() {
        if (locationState !== "idle") return;
        locationState = "loading";
        const version = inventoryVersion;
        list.replaceChildren(element("p", "helper-text", "Loading locations…"));
        try {
            const data = await InventoryAPI.request("/boxes/overview?_t=" + Date.now());
            if (version !== inventoryVersion) return;
            if (!data.success) throw new Error(data.error || "Could not load locations");
            const locations = (data.boxes || []).map(renderLocation).filter(Boolean);
            list.replaceChildren(...locations);
            if (!locations.length) list.append(element("p", "helper-text", "No locations found."));
            locationState = "loaded";
        } catch (error) {
            if (version === inventoryVersion) {
                locationState = "idle";
                list.replaceChildren(element("p", "helper-text", error.message + ". Switch back and try again."));
            }
        }
    }

    toggle.addEventListener("click", () => {
        const open = panel.hidden;
        panel.hidden = !open;
        $("discardItemSearch").hidden = open;
        $("locationChoices").hidden = open;
        $("discardLossScope").hidden = !open;
        toggle.textContent = open ? "Search by item" : "Search via location";
        toggle.setAttribute("aria-expanded", String(open));
        if (open) loadLocations();
    });

    clear.addEventListener("click", () => {
        selected.forEach(unselect);
        showSummary();
    });

    window.addEventListener("inventory-selection-changed", () => {
        inventoryVersion++;
        selected.clear();
        locationState = "idle";
        list.replaceChildren();
        showSummary();
        clearBundle();
        $("barcode").value = "";
        $("suggestPanel").replaceChildren();
        suggestions = [];
        clearTimeout(timer);
        if (!panel.hidden) loadLocations();
    });

    async function submit() {
        if (working) return;
        const lines = [...selected];
        if (!lines.length) return alert("Select stock from a location first.");
        for (const line of lines) {
            if (line.quantity.validity.valid) continue;
            line.quantity.closest("details").open = true;
            line.quantity.reportValidity();
            return;
        }
        if (!$("estimatedLoss").reportValidity()) return;

        const items = lines.map(line => ({line, qty: line.quantity.valueAsNumber}));
        const details = discardDetails();
        const units = items.reduce((sum, item) => sum + item.qty, 0);
        if (!confirm(`Discard ${units} ${units === 1 ? "unit" : "units"} from ${items.length} selected stock ${items.length === 1 ? "line" : "lines"}?\nReason: ${details.reason}`)) return;

        working = true;
        toggle.disabled = submitButton.disabled = true;
        list.inert = true;
        showSummary();
        const version = inventoryVersion;
        const inventory = InventoryAPI.getSelectedInventoryHeader();
        let discarded = 0;
        let completed = 0;
        let issue = "";
        try {
            for (const {line, qty} of items) {
                if (version !== inventoryVersion || inventory !== InventoryAPI.getSelectedInventoryHeader()) {
                    issue = "Inventory changed. Remaining discards were stopped.";
                    break;
                }
                result.textContent = `Discarding line ${completed + 1} of ${items.length}…`;
                let data;
                try {
                    data = await requestDiscard({barcode: line.barcode, location: line.location, qty}, details);
                } catch {
                    data = {success: false, error: "Could not connect to InventoryOS"};
                }
                if (!data.success || data.needsLocation) {
                    const location = InventoryWorkspace.formatLocationName(line.location);
                    const message = data.needsLocation ? "Stock location has changed. Check the current stock before trying again." : data.error || "Discard failed";
                    issue = `${line.barcode} · ${location}: ${message}`;
                    // A lost response can follow a successful write. Refresh this location before allowing another discard there.
                    if (!data.error || ["Could not connect to InventoryOS", "Invalid server response"].includes(data.error) || data.needsLocation) {
                        line.invalidateLocation();
                        issue += " Reopen the location and check the quantity before retrying.";
                    }
                    break;
                }
                const count = Number(data.discardedQty ?? qty);
                discarded += count;
                completed++;
                unselect(line);
                line.recordDiscard(count);
            }
        } finally {
            result.textContent = `Discarded ${discarded} ${discarded === 1 ? "unit" : "units"} across ${completed} of ${items.length} stock ${items.length === 1 ? "line" : "lines"}.${issue ? " " + issue : ""}`;
            working = false;
            toggle.disabled = submitButton.disabled = false;
            list.inert = false;
            showSummary();
        }
    }

    return {active: () => !panel.hidden, submit};
})();
