
if(!InventoryAPI.requireLogin()){
    throw new Error("Login required");
}


let bundleItems = [];
let suggestedItems = [];
let suggestSearchTimer = null;
let pendingBundleQueue = [];
let pendingBundleItem = null;
let completedBundleRemovals = [];
let selectedSuggestedItem = null;
let pickingPlan = null;
let pickingPlanSignature = "";
let bundleBusy = false;
let bundleRetryBlocked = false;
let bundleInventoryId = "";
let bundleMessage = "Choose quantities, then consolidate to see where to pick.";
// Store choices by product barcode so adding/removing another item cannot shift a lock.
let pickingSourceLocks = Object.create(null);
let pickingSourcePickerIndex = null;
let pickingSourcePickerSignature = "";

function focusBarcodeInput(){
    setTimeout(function(){
        const barcodeInput = document.getElementById("barcode");
        if(barcodeInput && pickingSourcePickerIndex === null){
            barcodeInput.focus();
            barcodeInput.select();
        }
    }, 120);
}

function showLoading(){
    document.getElementById("loadingOverlay").style.display = "flex";
}

function hideLoading(){
    document.getElementById("loadingOverlay").style.display = "none";
}

function normaliseBarcode(value){
    let barcode = String(value || "").trim().toUpperCase().replace(/\s+/g, "");
    if(!barcode) return "";
    if(/^\d+$/.test(barcode)) return "ITEM-" + barcode;
    if(/^ITEM\d+$/.test(barcode)) return barcode.replace("ITEM", "ITEM-");
    return barcode;
}

function poundsToMills(value){
    const raw = String(value ?? "0").replace(/\u00a3/g, "").replace(/,/g, "").trim();
    if(!/^\d+(?:\.\d{1,3})?$/.test(raw)) return null;
    const parts = raw.split(".");
    const whole = Number(parts[0] || 0);
    const decimals = String(parts[1] || "").padEnd(3, "0");
    return whole * 1000 + Number(decimals);
}

function millsToPounds(mills){
    return (Number(mills || 0) / 1000).toFixed(3);
}

function allocateBundleAmounts(totalMills, count){
    const safeCount = Math.max(1, Number(count || 1));
    const base = Math.floor(totalMills / safeCount);
    let remainder = totalMills % safeCount;
    return Array.from({length:safeCount}, function(){
        const amount = base + (remainder > 0 ? 1 : 0);
        if(remainder > 0) remainder--;
        return amount;
    });
}

function escapeHtml(value){
    return String(value || "")
        .replace(/&/g,"&amp;").replace(/</g,"&lt;")
        .replace(/>/g,"&gt;").replace(/"/g,"&quot;")
        .replace(/'/g,"&#039;");
}

function escapeJs(value){
    return String(value || "")
        .replace(/\\/g, "\\\\")
        .replace(/'/g, "\\'")
        .replace(/"/g, '\\"');
}

function activeLocations(item){
    return (item && Array.isArray(item.locations) ? item.locations : [])
        .filter(function(loc){ return Number(loc.qty || 0) > 0; })
        .map(function(loc){
            return {location:String(loc.location || ""), qty:Number(loc.qty || 0)};
        });
}

function locationSummary(item){
    const locations = activeLocations(item);
    if(locations.length === 0) return "Location unavailable";
    return locations.map(function(loc){
        return InventoryWorkspace.formatLocationName(loc.location || "Unknown location") + " \u2014 Qty " + loc.qty;
    }).join(" | ");
}

function looksLikeBarcodeInput(value){
    const raw = String(value || "").trim().toUpperCase().replace(/\s+/g, "");
    return /^\d+$/.test(raw) || /^ITEM-?\d+$/.test(raw);
}

function totalBundleUnits(){
    return bundleItems.reduce(function(sum, item){
        return sum + (Number.isSafeInteger(item.qty) && item.qty > 0 ? item.qty : 0);
    }, 0);
}


function resolveItemDetails(barcode){
    return InventoryAPI.request("/search?query=" + encodeURIComponent(barcode) + "&_t=" + Date.now())
        .then(function(data){
            if(!data.success || !Array.isArray(data.results)) return null;
            return data.results.find(function(item){
                return normaliseBarcode(item.barcode || item.itemId || "") === normaliseBarcode(barcode) &&
                    Number(item.totalQty || item.total_qty || 0) > 0;
            }) || null;
        })
        .catch(function(){ return null; });
}

function toggleSuggestions(){
    const panel = document.getElementById("suggestPanel");
    panel.classList.toggle("open");
    updateSuggestToggleText();
}

function updateSuggestToggleText(){
    const input = document.getElementById("barcode").value.trim();
    const panel = document.getElementById("suggestPanel");
    const countText = document.getElementById("suggestCountText");

    if(input.length < 2 || looksLikeBarcodeInput(input)){
        countText.innerText = "Type 2+ letters \u25BC";
        return;
    }
    if(suggestedItems.length === 0){
        countText.innerText = "No matches \u25BC";
        return;
    }
    countText.innerText = suggestedItems.length + " match" +
        (suggestedItems.length === 1 ? "" : "es") +
        (panel.classList.contains("open") ? " \u25B2" : " \u25BC");
}

function searchSuggestedItems(){
    const query = document.getElementById("barcode").value.trim();
    clearTimeout(suggestSearchTimer);

    if(query.length < 2 || looksLikeBarcodeInput(query)){
        suggestedItems = [];
        document.getElementById("suggestPanel").innerHTML =
            "<div class='helper-text' style='padding:13px;margin:0;'>Type item words above, then open this dropdown to choose a matching product.</div>";
        updateSuggestToggleText();
        return;
    }

    suggestSearchTimer = setTimeout(function(){
        InventoryAPI.request("/search?query=" + encodeURIComponent(query) + "&_t=" + Date.now())
        .then(function(data){
            suggestedItems = (data.results || [])
                .filter(function(item){ return Number(item.totalQty || item.total_qty || 0) > 0; })
                .slice(0, 12);

            if(!data.success || suggestedItems.length === 0){
                document.getElementById("suggestPanel").innerHTML =
                    "<div class='helper-text' style='padding:13px;margin:0;'>No matching items currently in stock.</div>";
                updateSuggestToggleText();
                return;
            }

            let html = "";
            suggestedItems.forEach(function(item,index){
                html += `
                    <div class="suggest-item" data-ios-click="h31616f72488c726e" data-ios-click-args="${InventoryEvents.encode([index])}">
                        <div class="suggest-title">${escapeHtml(item.description || "")}</div>
                        <div class="suggest-meta">${escapeHtml(locationSummary(item))}</div>
                        <div class="suggest-meta">Available Qty ${Number(item.totalQty || item.total_qty || 0)}</div>
                    </div>
                `;
            });
            document.getElementById("suggestPanel").innerHTML = html;
            updateSuggestToggleText();
        })
        .catch(function(error){
            console.error(error);
            suggestedItems = [];
            document.getElementById("suggestPanel").innerHTML =
                "<div class='helper-text' style='padding:13px;margin:0;'>Error searching items.</div>";
            updateSuggestToggleText();
        });
    }, 300);
}

function selectSuggestedItem(index){
    const item = suggestedItems[index];
    if(!item) return;

    selectedSuggestedItem = item;
    document.getElementById("barcode").value = normaliseBarcode(item.barcode || item.itemId || "");
    document.getElementById("suggestPanel").classList.remove("open");
    document.getElementById("suggestPanel").innerHTML =
        "<div class='helper-text' style='padding:13px;margin:0;'>Selected: <strong>" +
        escapeHtml(item.description || "") + "</strong></div>";

    document.getElementById("result").innerText =
        "Selected " + (item.description || "Item") + " \u2014 " +
        locationSummary(item) + ". Press Add to Bundle List.";
    updateSuggestToggleText();
}

async function addBundleBarcodeFromInput(){
    if(bundleBusy || bundleRetryBlocked) return;
    if(!hasSelectedInventoryForRemove()) return showNoInventorySelected();
    const inventoryAtStart = getSelectedInventoryHeaderForRemove();
    const barcode = normaliseBarcode(document.getElementById("barcode").value);
    if(!barcode){
        alert("Enter a barcode or choose a suggested item first");
        return;
    }

    let details = selectedSuggestedItem &&
        normaliseBarcode(selectedSuggestedItem.barcode || selectedSuggestedItem.itemId || "") === barcode
            ? selectedSuggestedItem
            : null;

    if(!details) details = await resolveItemDetails(barcode);

    if(!details){
        alert("This item is not currently in stock in the selected inventory");
        return;
    }

    if(inventoryAtStart !== getSelectedInventoryHeaderForRemove() || bundleBusy || bundleRetryBlocked) return;
    addBundleItem(details);
}

function addBundleItem(details){
    if(bundleBusy || bundleRetryBlocked) return;
    const selectedInventory = getSelectedInventoryHeaderForRemove();
    if(bundleInventoryId && bundleInventoryId !== selectedInventory){
        bundleItems = [];
    }
    bundleInventoryId = selectedInventory;
    clearReactiveBackground();

    const barcode = normaliseBarcode(details.barcode || details.itemId || "");
    const locations = activeLocations(details);
    if(!barcode || locations.length === 0) return;

    const existing = bundleItems.find(function(item){ return item.barcode === barcode; });

    if(existing){
        existing.locations = locations;
        const available = locations.reduce(function(sum, loc){ return sum + Number(loc.qty || 0); }, 0);
        if(existing.qty < available){
            existing.qty++;
            document.getElementById("result").innerText =
                existing.description + " quantity increased to " + existing.qty + ".";
        }else{
            document.getElementById("result").innerText =
                existing.description + " is already set to all available stock.";
        }
    }else{
        bundleItems.push({
            barcode:barcode,
            description:String(details.description || barcode),
            locations:locations,
            qty:1
        });

        document.getElementById("result").innerText =
            String(details.description || barcode) + " added to bundle list.";
    }

    selectedSuggestedItem = null;
    document.getElementById("barcode").value = "";
    document.getElementById("locationChoices").innerHTML = "";
    invalidatePickingPlan();
    renderBundleList();
    focusBarcodeInput();
}

function removeBundleItem(index){
    if(bundleBusy || bundleRetryBlocked) return;
    if(bundleItems[index]) delete pickingSourceLocks[bundleItems[index].barcode];
    bundleItems.splice(index, 1);
    invalidatePickingPlan();
    renderBundleList();
}


function changeBundleQuantity(index, quantity){
    if(bundleBusy || bundleRetryBlocked) return;
    const item = bundleItems[index];
    if(!item) return;
    const value = Number(quantity);
    const input = document.getElementById("bundle-qty-"+index);
    if(!Number.isSafeInteger(value) || value < 0){
        document.getElementById("result").textContent = "Quantity must be a whole number of zero or more.";
        if(input) input.value = item.qty;
        return;
    }
    const available = activeLocations(item).reduce(function(sum, location){ return sum + location.qty; }, 0);
    item.qty = Math.min(value, available);
    if(!item.qty) delete pickingSourceLocks[item.barcode];
    if(input) input.value = item.qty;
    invalidatePickingPlan(value > available ? "Quantity limited to available stock. Consolidate to confirm locations." : undefined);
    // Keep the input/button DOM stable while the user types or clicks Consolidate.
    renderBundleTotals();
    renderPickingPlan();
}

function clearBundleList(){
    if(bundleBusy) return;
    if(bundleRetryBlocked && !confirm("A removal result was uncertain. Check stock and sales records first. Have you checked them and want to clear this bundle?")) return;
    bundleItems = [];
    pendingBundleQueue = [];
    pendingBundleItem = null;
    completedBundleRemovals = [];
    selectedSuggestedItem = null;
    bundleRetryBlocked = false;
    bundleInventoryId = "";
    pickingSourceLocks = Object.create(null);
    invalidatePickingPlan();
    document.getElementById("locationChoices").innerHTML = "";
    document.getElementById("result").innerText = "Bundle list cleared.";
    renderBundleList();
}

function renderBundleList(){
    const bundleBox = document.getElementById("bundleBox");
    const splitPreview = document.getElementById("splitPreview");
    if(!bundleItems.length){
        bundleBox.style.display = "none";
        bundleBox.innerHTML = "";
        splitPreview.textContent = "";
        return;
    }
    bundleBox.style.display = "block";
    const count = totalBundleUnits();
    const disabled = bundleBusy || bundleRetryBlocked ? " disabled" : "";
    let html = '<div class="bundle-title"><span>1. Choose quantities</span><span id="bundleUnitCount" class="bundle-pill">'+count+' units</span></div>';
    bundleItems.forEach(function(item,index){
        const available = activeLocations(item).reduce(function(sum,l){return sum+l.qty;},0);
        html += '<div class="bundle-item bundle-product-card"><div class="bundle-item-main"><strong>'+escapeHtml(item.description)+
            '</strong><div class="bundle-item-meta">'+available+' available across '+item.locations.length+' locations</div></div>'+
            '<div class="bundle-item-controls"><label for="bundle-qty-'+index+'">Quantity needed</label>'+
            '<input id="bundle-qty-'+index+'" class="bundle-qty" type="number" min="0" max="'+available+'" step="1" value="'+item.qty+
            '" data-ios-input="h882e4d2289dc5f23" data-ios-input-args="'+InventoryEvents.encode([index])+'"'+disabled+'>'+
            '<button type="button" class="small-remove" data-ios-click="h925677a9f761080c" data-ios-click-args="'+InventoryEvents.encode([index])+'"'+disabled+'>Remove item</button></div></div>';
    });
    html += '<button type="button" class="consolidate-button" data-ios-click="h74639a1cf907dad1"'+disabled+'>'+
        (bundleBusy ? "Checking stock..." : "2. Consolidate picking plan")+'</button>'+
        '<div id="bundlePlan" class="bundle-plan" aria-live="polite"></div>';
    bundleBox.innerHTML = html;
    renderPickingPlan();
    renderBundleTotals();
}

function renderBundleTotals(){
    const count = totalBundleUnits();
    const pill = document.getElementById("bundleUnitCount");
    if(pill) pill.textContent = count+" unit"+(count===1 ? "" : "s");
    const splitPreview = document.getElementById("splitPreview");
    const totalMills = poundsToMills(document.getElementById("saleAmount").value);
    splitPreview.textContent = count && totalMills !== null && totalMills>0
        ? "Exact bundle split: GBP "+millsToPounds(totalMills)+" across "+count+" units."
        : "Enter the total bundle price. It is split equally across the units being removed.";
}

function getSelectedInventoryHeaderForRemove(){
    if(window.InventoryTopbar && typeof InventoryTopbar.getHeaderValue === "function"){
        return InventoryTopbar.getHeaderValue();
    }
    if(window.InventoryAPI && typeof InventoryAPI.getSelectedInventoryHeader === "function"){
        return InventoryAPI.getSelectedInventoryHeader();
    }
    try{
        const parsed = JSON.parse(localStorage.getItem("inventoryos_selected_inventory_ids") || "[]");
        return Array.isArray(parsed) ? parsed.filter(Boolean).map(String).join(",") : "";
    }catch(error){
        return "";
    }
}

function hasSelectedInventoryForRemove(){
    return String(getSelectedInventoryHeaderForRemove()).split(",").filter(Boolean).length === 1;
}

// Minimise locations, then stack access effort, then cleared item/location stocks.
// For very large searches the UI explicitly labels a safe best-found plan.
function calculatePickingPlan(items, nodeLimit = 100000, sourceChoices = {}, accessCosts = {}){
    const names = new Map();
    const demand = items.map(function(item){
        if(!Number.isSafeInteger(item.qty) || item.qty < 0) throw new Error("Enter whole-number quantities.");
        return item.qty;
    });
    items.forEach(function(item, index){
        const seen = new Set();
        activeLocations(item).forEach(function(stock){
            if(!stock.location || !Number.isSafeInteger(stock.qty)) throw new Error("Invalid location stock. Reload this item.");
            if(seen.has(stock.location)) throw new Error("Duplicate location stock for " + item.description + ". Check the inventory before removing.");
            seen.add(stock.location);
            if(!demand[index]) return;
            if(sourceChoices[index] && stock.location !== sourceChoices[index]) return;
            if(!names.has(stock.location)) names.set(stock.location, {name:stock.location, caps:items.map(function(){ return 0; })});
            names.get(stock.location).caps[index] = stock.qty;
        });
    });
    const natural = function(a,b){ return a.localeCompare(b, "en", {numeric:true}); };
    const effort = function(name){const value=accessCosts[name];return Number.isSafeInteger(value)&&value>=0 ? value : 0;};
    const locations = Array.from(names.values()).sort(function(a,b){ return natural(a.name,b.name); });
    if(!demand.some(function(q){ return q > 0; })) return {groups:[], exact:true, emptied:0};
    demand.forEach(function(q,i){
        const available = locations.reduce(function(sum,l){ return sum+l.caps[i]; },0);
        if(q > available) throw new Error(items[i].description + ": requested " + q + ", only " + available + " available"+
            (sourceChoices[i] ? " at the locked location " + sourceChoices[i] + ". Unlock that location or adjust the quantity." : ". Adjust the quantity."));
    });
    function covers(chosen){
        return demand.every(function(q,i){ return chosen.reduce(function(sum,l){ return sum+l.caps[i]; },0) >= q; });
    }
    function allocate(chosen){
        const groups = new Map();
        let emptied = 0;
        let leftover = 0;
        demand.forEach(function(q,i){
            let remaining = q;
            chosen.filter(function(l){return l.caps[i]>0;})
                .sort(function(a,b){return effort(a.name)-effort(b.name) || a.caps[i]-b.caps[i] || natural(a.name,b.name);})
                .forEach(function(l){
                    const qty = Math.min(remaining,l.caps[i]);
                    if(!qty) return;
                    remaining -= qty;
                    if(qty === l.caps[i]) emptied++;
                    else leftover += l.caps[i]-qty;
                    if(!groups.has(l.name)) groups.set(l.name,{location:l.name,items:[]});
                    groups.get(l.name).items.push({
                        index:i, barcode:items[i].barcode, description:items[i].description,
                        qty:qty, available:l.caps[i], remaining:l.caps[i]-qty
                    });
                });
            if(remaining) throw new Error("Could not fulfil all requested quantities.");
        });
        return {groups:Array.from(groups.values()).sort(function(a,b){return effort(a.location)-effort(b.location) || natural(a.location,b.location);}), access: Array.from(groups.keys()).reduce(function(sum,name){return sum+effort(name);},0), emptied:emptied, leftover:leftover};
    }
    // Feasible upper bound before the exact search. Fractional coverage prevents
    // a large quantity of one product hiding a location that serves several.
    let remaining = demand.slice();
    const unused = locations.slice();
    let selected = [];
    while(remaining.some(function(q){return q>0;})){
        unused.sort(function(a,b){
            function score(l){
                return remaining.reduce(function(sum,q,i){return sum+(q ? Math.min(q,l.caps[i])/q : 0);},0);
            }
            return score(b)-score(a) || effort(a.name)-effort(b.name) || natural(a.name,b.name);
        });
        const chosen = unused.shift();
        if(!chosen) throw new Error("Not enough stock to build a plan.");
        selected.push(chosen);
        remaining = remaining.map(function(q,i){return Math.max(0,q-chosen.caps[i]);});
    }
    for(let i=selected.length-1;i>=0;i--){
        const smaller = selected.filter(function(_,j){return i!==j;});
        if(covers(smaller)) selected = smaller;
    }
    let best = allocate(selected);
    let nodes = 0, interrupted = false;
    const suffix = Array.from({length:locations.length+1},function(){return demand.map(function(){return 0;});});
    for(let j=locations.length-1;j>=0;j--){
        suffix[j] = suffix[j+1].map(function(q,i){return q+locations[j].caps[i];});
    }
    // Bound work to keep the page responsive. Allocation is capacity-safe even
    // if the search limit is hit; never label such a plan as a proven minimum.
    if(locations.length > 60) interrupted = true;
    for(let size=1;size<=best.groups.length && !interrupted;size++){
        let found = null;
        function visit(start, chosen, capacity){
            if(++nodes > nodeLimit){interrupted=true;return;}
            const slots = size-chosen.length;
            if(locations.length-start < slots) return;
            if(demand.some(function(q,i){return capacity[i]+suffix[start][i] < q;})) return;
            if(!slots){
                if(!demand.every(function(q,i){return capacity[i]>=q;})) return;
                const candidate = allocate(chosen);
                if(!found || candidate.access<found.access || (candidate.access===found.access &&
                    (candidate.emptied>found.emptied || (candidate.emptied===found.emptied && candidate.leftover<found.leftover)))) found=candidate;
                return;
            }
            for(let j=start;j<=locations.length-slots && !interrupted;j++){
                visit(j+1,chosen.concat(locations[j]),capacity.map(function(q,i){return q+locations[j].caps[i];}));
            }
        }
        visit(0,[],demand.map(function(){return 0;}));
        if(found){best=found;break;}
    }
    best.exact = !interrupted;
    return best;
}

function invalidatePickingPlan(message){
    closePickingSourcePicker(false);
    pickingPlan = null;
    pickingPlanSignature = "";
    bundleMessage = message || "Quantities changed. Consolidate to see the locations before removing stock.";
}

function currentBundleSignature(){
    return JSON.stringify([getSelectedInventoryHeaderForRemove(),bundleItems.map(function(item){return [item.barcode,item.qty];}),
        Object.keys(pickingSourceLocks).sort().map(function(barcode){return [barcode,pickingSourceLocks[barcode]];})]);
}

function locationDisplayName(name){
    return window.InventoryWorkspace && typeof InventoryWorkspace.formatLocationName === "function"
        ? InventoryWorkspace.formatLocationName(name) : String(name);
}

function trackBundleSales(){
    return !window.InventoryOSRemovePreferences || InventoryOSRemovePreferences.get().track_sales_data !== false;
}

function snapshotBundle(){
    return bundleItems.map(function(item){return {barcode:item.barcode,description:item.description,qty:item.qty};});
}

async function refreshBundleStock(snapshot, inventory){
    const refreshed = [];
    for(const item of snapshot){
        if(inventory !== getSelectedInventoryHeaderForRemove()) throw new Error("Inventory changed. Build a new bundle in the selected inventory.");
        const data = await InventoryAPI.request("/search?query="+encodeURIComponent(item.barcode)+"&_t="+Date.now(), {
            headers:{"X-Inventory-Ids":inventory}
        });
        if(!data || !data.success || !Array.isArray(data.results)) throw new Error((data && data.error) || "Could not check current stock. Nothing has been removed.");
        const matches = data.results.filter(function(result){return normaliseBarcode(result.barcode || result.itemId) === item.barcode;});
        if(matches.length>1) throw new Error("More than one product matches " + item.barcode + ". Select only one inventory.");
        const found = matches[0];
        refreshed.push({barcode:item.barcode,description:item.description,qty:item.qty,locations:found ? activeLocations(found) : []});
    }
    if(inventory !== getSelectedInventoryHeaderForRemove()) throw new Error("Inventory changed. Consolidate again.");
    return refreshed;
}

// Group pickups automatically, but allow a manual location choice for every
// product with sufficient stock elsewhere, including products in shared groups.
function initialiseSourceChoices(plan, locks = pickingSourceLocks){
    plan.sourceChoices=Object.fromEntries(bundleItems.map(function(item,index){
        return [index,locks[item.barcode] || ""];
    }).filter(function(entry){return entry[1];}));
    plan.fixedItems=Array.from(new Set(plan.groups.filter(function(g){
        return new Set(g.items.map(function(l){return l.index;})).size>1;
    }).flatMap(function(g){return g.items.map(function(l){return l.index;});})));
}

function sourceAlternatives(plan,index){
    const item=bundleItems[index];
    if(!item || !item.qty) return [];
    return activeLocations(item);
}

async function changePickingSource(index,location){
    if(bundleBusy || bundleRetryBlocked || !pickingPlan || pickingPlanSignature!==currentBundleSignature()) return;
    const item=bundleItems[index];
    if(!item) return;
    if(location && !sourceAlternatives(pickingPlan,index).some(function(s){return s.location===location && s.qty>=item.qty;})) return;
    const locks={...pickingSourceLocks};
    if(location) locks[item.barcode]=location;
    else delete locks[item.barcode];
    closePickingSourcePicker(false);
    await showEfficientPickingPlan(locks);
}

async function unlockPickingSource(barcode){
    if(bundleBusy || bundleRetryBlocked) return;
    const locks={...pickingSourceLocks};
    delete locks[barcode];
    closePickingSourcePicker(false);
    await showEfficientPickingPlan(locks);
}

function closePickingSourcePicker(restoreFocus = true){
    const item=bundleItems[pickingSourcePickerIndex];
    const dialog=document.getElementById("pickingSourceDialog");
    pickingSourcePickerIndex=null;
    pickingSourcePickerSignature="";
    if(dialog && dialog.open){
        if(typeof dialog.close === "function") dialog.close();
        else dialog.removeAttribute("open");
    }
    if(restoreFocus && item){
        const button=Array.from(document.querySelectorAll("[data-picking-source-barcode]")).find(function(node){return node.dataset.pickingSourceBarcode===item.barcode;});
        if(button && !button.disabled) button.focus();
    }
}

function openPickingSourcePicker(index){
    if(bundleBusy || bundleRetryBlocked || !pickingPlan || pickingPlanSignature!==currentBundleSignature()) return;
    const item=bundleItems[index],alternatives=sourceAlternatives(pickingPlan,index);
    if(!item || !alternatives.length) return;
    pickingSourcePickerIndex=index;
    pickingSourcePickerSignature=pickingPlanSignature;
    const dialog=document.getElementById("pickingSourceDialog");
    document.getElementById("pickingSourceTitle").textContent="Pick "+item.description+" from";
    const current=pickingPlan.groups.filter(function(g){return g.items.some(function(line){return line.index===index;});}).map(function(g){return locationDisplayName(g.location);});
    document.getElementById("pickingSourceInfo").textContent="Quantity needed: "+item.qty+". Current plan: "+current.join(", ")+". Choose a location to lock this item there and recalculate the other picks. Locations without enough stock for the full quantity are unavailable."+
        (pickingPlan.fixedItems.includes(index) ? " This item shares a pickup with other items. Choosing another location may add a stop." : "");
    const options=document.getElementById("pickingSourceOptions");
    options.replaceChildren();
    alternatives.sort(function(a,b){return a.location.localeCompare(b.location,"en",{numeric:true});}).forEach(function(stock){
        const button=document.createElement("button");
        button.type="button";
        button.dataset.pickingLocation=stock.location;
        const title=document.createElement("strong");title.textContent=locationDisplayName(stock.location);
        button.disabled=stock.qty<item.qty;
        const detail=document.createElement("small");detail.textContent=button.disabled ? stock.qty+" available • Need "+item.qty+" • Not enough stock" : stock.qty+" available • Take "+item.qty+" • "+(stock.qty-item.qty)+" remaining";
        button.append(title,detail);
        button.addEventListener("click",function(){
            if(pickingSourcePickerSignature!==currentBundleSignature()) return closePickingSourcePicker();
            changePickingSource(index,stock.location);
        });
        options.appendChild(button);
    });
    if(pickingSourceLocks[item.barcode]){
        const automatic=document.createElement("button");automatic.type="button";automatic.textContent="Use automatic picking for this item";
        automatic.addEventListener("click",function(){unlockPickingSource(item.barcode);});options.appendChild(automatic);
    }
    if(typeof dialog.showModal === "function"){if(!dialog.open) dialog.showModal();}
    else dialog.setAttribute("open","");
    options.querySelector("button:not(:disabled)")?.focus();
}

function renderPickingSourceLocks(box){
    const locks=document.createElement("div");locks.className="bundle-source-locks";
    bundleItems.forEach(function(item){
        if(!pickingSourceLocks[item.barcode] || !item.qty) return;
        const row=document.createElement("div");row.className="bundle-source-lock";
        const text=document.createElement("span");text.textContent=item.description+" locked to "+locationDisplayName(pickingSourceLocks[item.barcode]);
        const unlock=document.createElement("button");unlock.type="button";unlock.textContent="Use automatic picking";unlock.disabled=bundleBusy || bundleRetryBlocked;
        unlock.addEventListener("click",function(){unlockPickingSource(item.barcode);});row.append(text,unlock);locks.appendChild(row);
    });
    if(locks.childElementCount) box.appendChild(locks);
}

function renderPickingPlan(){
    const box = document.getElementById("bundlePlan");
    if(!box) return;
    box.innerHTML = "";
    const message = document.createElement("p");
    message.className = "bundle-plan-note";
    message.textContent = bundleMessage;
    box.appendChild(message);
    renderPickingSourceLocks(box);
    if(!pickingPlan || pickingPlanSignature !== currentBundleSignature()) return;
    const heading = document.createElement("h3");
    heading.textContent = "Pick from " + pickingPlan.groups.length + " location" + (pickingPlan.groups.length===1 ? "" : "s");
    box.appendChild(heading);
    const hasChoice=pickingPlan.groups.some(function(group){return group.items.some(function(line){
        const current=pickingPlan.groups.filter(function(g){return g.items.some(function(l){return l.index===line.index;});}).map(function(g){return g.location;});
        return sourceAlternatives(pickingPlan,line.index).some(function(s){return current.length>1 || !current.includes(s.location);});
    });});
    if(hasChoice){
        const hint=document.createElement("p");hint.className="bundle-plan-note";hint.textContent="Yellow items have other picking locations. Select one to choose a location and recalculate the route.";box.appendChild(hint);
    }
    pickingPlan.groups.forEach(function(group){
        const section = document.createElement("section");
        section.className = "bundle-plan-group";
        const title = document.createElement("h4");
        title.textContent = locationDisplayName(group.location);
        if(pickingPlan.accessCosts && Object.prototype.hasOwnProperty.call(pickingPlan.accessCosts,group.location)){
            const above=pickingPlan.accessCosts[group.location];title.textContent += above ? " • "+above+" location"+(above===1?"":"s")+" above" : " • Top of stack";
        }
        section.appendChild(title);
        group.items.forEach(function(line){
            const alternatives=sourceAlternatives(pickingPlan,line.index);
            const current=pickingPlan.groups.filter(function(g){return g.items.some(function(l){return l.index===line.index;});}).map(function(g){return g.location;});
            const hasAlternative=alternatives.some(function(s){return current.length>1 || !current.includes(s.location);});
            const locked=Boolean(pickingPlan.sourceChoices[line.index]);
            const selectable=hasAlternative || locked;
            const row = document.createElement(selectable ? "button" : "div");
            row.className = "bundle-plan-line";
            if(selectable){
                row.type="button";row.classList.add("bundle-source-choice");
                if(!hasAlternative) row.classList.add("bundle-source-locked");
                row.dataset.pickingSourceBarcode=bundleItems[line.index].barcode;
                row.disabled=bundleBusy || bundleRetryBlocked;
                row.setAttribute("aria-label","Choose picking location for "+line.description);
                row.addEventListener("click",function(){openPickingSourcePicker(line.index);});
            }
            const name = document.createElement("span");
            name.textContent = line.description;
            const qty = document.createElement("strong");
            qty.textContent = "Take " + line.qty;
            const after = document.createElement("small");
            after.textContent = line.remaining===0 ? "Empties this item from this location" : line.remaining + " of this item left here";
            row.append(name,qty,after);
            if(locked){
                const lock=document.createElement("small");lock.textContent="Locked to "+locationDisplayName(pickingPlan.sourceChoices[line.index])+" • Select to change";row.appendChild(lock);
            }else if(pickingPlan.fixedItems.includes(line.index)){
                const fixed=document.createElement("small");
                fixed.textContent=hasAlternative ? "Shared pickup • Select this yellow item to choose another location" : "Shared pickup • Grouped for efficiency";
                row.appendChild(fixed);
            }else if(hasAlternative){
                const hint=document.createElement("small");hint.textContent="Select this yellow item to choose another location";row.appendChild(hint);
            }
            section.appendChild(row);
        });
        box.appendChild(section);
    });
    const note = document.createElement("p");
    note.className = "bundle-plan-note";
    note.textContent = "Nothing has been removed yet. Remove Stock will use these exact locations and quantities.";
    box.appendChild(note);
}

async function showEfficientPickingPlan(proposedLocks = pickingSourceLocks){
    if(bundleBusy || bundleRetryBlocked) return;
    if(!hasSelectedInventoryForRemove()) return showNoInventorySelected();
    if(bundleInventoryId !== getSelectedInventoryHeaderForRemove()){
        clearBundleList();
        document.getElementById("result").textContent = "Inventory changed. Add items from the selected inventory.";
        return;
    }
    if(!totalBundleUnits()){
        invalidatePickingPlan("Choose a quantity above zero for at least one item.");
        renderBundleList();
        return;
    }
    const inventory = getSelectedInventoryHeaderForRemove();
    const signature = currentBundleSignature();
    const snapshot = snapshotBundle();
    const locks=Object.fromEntries(snapshot.filter(function(item){return item.qty>0 && proposedLocks[item.barcode];}).map(function(item){return [item.barcode,proposedLocks[item.barcode]];}));
    closePickingSourcePicker(false);
    bundleBusy = true;
    bundleMessage = "Checking current stock and consolidating...";
    renderBundleList();
    showLoading();
    try{
        let accessCosts={},stackWarning="";
        const layoutPromise=window.InventoryStackOrder ? window.InventoryStackOrder.loadForPicking(inventory,localStorage.getItem("inventoryos_selected_workspace_id")||"").catch(function(){stackWarning=" Stack order could not be loaded; this plan uses the normal picking rules.";return {};}) : Promise.resolve({});
        const [refreshed,layoutCosts] = await Promise.all([refreshBundleStock(snapshot,inventory),layoutPromise]);
        accessCosts=layoutCosts;
        if(signature !== currentBundleSignature()) throw new Error("The bundle changed. Consolidate again.");
        bundleItems = refreshed;
        const choices=Object.fromEntries(refreshed.map(function(item,index){return [index,locks[item.barcode]];}).filter(function(entry){return entry[1];}));
        const plan = calculatePickingPlan(refreshed,100000,choices,accessCosts);
        plan.accessCosts=accessCosts;
        pickingSourceLocks=locks;
        initialiseSourceChoices(plan,locks);
        pickingPlan = plan;
        pickingPlanSignature = currentBundleSignature();
        bundleMessage = plan.exact
            ? "Fewest locations for these quantities"+(Object.keys(locks).length ? " with your chosen locations locked" : "")+". "+(Object.keys(accessCosts).length ? "Easier stack access is preferred, then smaller item stocks are emptied first." : "Where possible, smaller item stocks are emptied first.")
            : "Efficient plan found"+(Object.keys(locks).length ? " with your chosen locations locked" : " for this large bundle")+"; the absolute fewest locations could not be confirmed.";
        bundleMessage += stackWarning;
        document.getElementById("result").textContent = "Review the picking plan below, then press Remove Stock.";
    }catch(error){
        invalidatePickingPlan(error.message || "Could not build a picking plan. Nothing has been removed.");
        document.getElementById("result").textContent = bundleMessage;
    }finally{
        bundleBusy = false;
        hideLoading();
        renderBundleList();
    }
}

function showNoInventorySelected(){
    document.getElementById("result").innerText =
        "Please select one inventory first using the selector at the top.";
    flashError();
}

function removeButtonPressed(){
    if(bundleBusy || bundleRetryBlocked) return;
    if(bundleItems.length > 0){
        removeBundleStock();
        return;
    }
    removeSingleStock(window.quickSaleLocation || "");
}

function removeSingleStock(locationOverride = ""){
    if(bundleBusy || bundleRetryBlocked) return;
    if(!hasSelectedInventoryForRemove()){
        showNoInventorySelected();
        return;
    }

    const barcode = normaliseBarcode(document.getElementById("barcode").value);
    const saleAmount = trackBundleSales() ? document.getElementById("saleAmount").value : "0";

    if(!barcode){
        alert("Enter a barcode or choose a suggested item");
        return;
    }

    document.getElementById("locationChoices").innerHTML = "";
    showLoading();

    InventoryAPI.request("/stock/remove", {
        method:"POST",
        body:JSON.stringify({
            barcode:barcode,
            qty:1,
            location:locationOverride,
            saleAmount:String(saleAmount || "0"),
            oneSalesRow:true
        })
    })
    .then(function(data){
        hideLoading();

        if(data.needsLocation){
            let html = "<div class='location-card'><strong>Select location to remove stock from:</strong></div>";
            data.locations.forEach(function(loc){
                html += `
                    <button class="location-button"
                        data-ios-click="h8ff6232ce7feade5" data-ios-click-args="${InventoryEvents.encode([loc.location])}" type="button">
                        ${InventoryWorkspace.locationNameHtml(loc.location)} \u2014 Qty: ${Number(loc.qty || 0)}
                    </button>`;
            });
            document.getElementById("locationChoices").innerHTML = html;
            document.getElementById("result").innerText = "Select a location.";
            return;
        }

        if(!data.success){
            flashError();
            speakText("Remove failed");
            document.getElementById("result").innerText = data.error || "Remove failed";
            return;
        }

        flashSuccess();
        speakText("Sale complete");
        document.getElementById("result").innerText =
            "Removed 1 \u00d7 " + (data.description || barcode) + " at " +
            InventoryWorkspace.formatLocationName(data.location) + ". Remaining there: " + data.remainingQty;

        document.getElementById("barcode").value = "";
        document.getElementById("saleAmount").value = "";
        document.getElementById("locationChoices").innerHTML = "";
        focusBarcodeInput();
    })
    .catch(function(error){
        hideLoading();
        console.error(error);
        flashError();
        speakText("Remove failed");
        alert("Error removing stock");
        focusBarcodeInput();
    });
}

async function removeBundleStock(){
    if(bundleBusy || bundleRetryBlocked) return;
    if(pickingSourcePickerIndex !== null){
        document.getElementById("result").textContent="Choose a picking location or close the location picker before removing stock.";
        return;
    }
    if(!hasSelectedInventoryForRemove()) return showNoInventorySelected();
    if(!bundleItems.length || !totalBundleUnits()){
        alert("Choose at least one item with a quantity above zero.");
        return;
    }
    // Never submit an unseen/recalculated allocation.
    if(!pickingPlan || pickingPlanSignature !== currentBundleSignature()){
        await showEfficientPickingPlan();
        return;
    }
    const salesEnabled = trackBundleSales();
    const totalSaleMills = salesEnabled ? poundsToMills(document.getElementById("saleAmount").value) : 0;
    if(!Number.isSafeInteger(totalSaleMills) || (salesEnabled && totalSaleMills<=0)){
        alert("Enter the total bundle sale amount using up to three decimal places.");
        return;
    }
    const plan = pickingPlan;
    const signature = pickingPlanSignature;
    const inventory = getSelectedInventoryHeaderForRemove();
    const snapshot = snapshotBundle();
    bundleBusy = true;
    completedBundleRemovals = [];
    renderBundleList();
    showLoading();
    let phase = "checking";
    try{
        const refreshed = await refreshBundleStock(snapshot,inventory);
        if(signature !== currentBundleSignature()) throw new Error("The bundle changed. Consolidate again before removing.");
        // Check the exact displayed route. Do not silently switch the boxes.
        bundleItems = refreshed;
        for(const group of plan.groups){
            for(const line of group.items){
                const stocks = refreshed[line.index].locations.filter(function(l){return l.location===group.location;});
                if(stocks.length!==1 || stocks[0].qty<line.qty){
                    throw new Error("Stock changed for "+line.description+" at "+locationDisplayName(group.location)+
                        ". Nothing has been removed. Consolidate again and review the new plan.");
                }
            }
        }
        const count = plan.groups.reduce(function(sum,g){
            return sum+g.items.reduce(function(n,line){return n+line.qty;},0);
        },0);
        if(count !== totalBundleUnits()) throw new Error("Plan quantities do not match the bundle. Consolidate again.");
        const baseMills = Math.floor(totalSaleMills/count);
        let extraMills = totalSaleMills%count;
        const lines = [];
        plan.groups.forEach(function(group){
            group.items.forEach(function(item){
                const extras = Math.min(extraMills,item.qty);
                extraMills -= extras;
                lines.push({...item,location:group.location,saleAmountMills:baseMills*item.qty+extras});
            });
        });
        phase = "removing";
        for(const line of lines){
            if(inventory !== getSelectedInventoryHeaderForRemove()) throw new Error("Inventory selection changed. Removal stopped.");
            document.getElementById("result").textContent = "Removing "+line.qty+" x "+line.description+" from "+locationDisplayName(line.location)+"...";
            let data;
            try{
                data = await InventoryAPI.request("/stock/remove",{
                    method:"POST",
                    headers:{"X-Inventory-Ids":inventory},
                    body:JSON.stringify({
                        barcode:line.barcode,qty:line.qty,location:line.location,
                        saleAmount:millsToPounds(line.saleAmountMills),oneSalesRow:true
                    })
                });
            }catch(error){
                bundleRetryBlocked = true;
                throw new Error("The removal response was lost. Check stock and sales records before starting another bundle; do not retry blindly.");
            }
            if(!data || !data.success){
                const message = data && data.error || "No removal confirmation was received.";
                // These specific backend paths roll back without changing stock.
                const rejected = !!(data && (data.needsLocation || /not enough stock|no stock available|not in that location|product not found|viewers cannot|select only one inventory|selected inventory is not available/i.test(message)));
                if(!rejected) bundleRetryBlocked = true;
                throw new Error(message+(rejected ? "" : " Check stock and sales records before starting another bundle; the result may be uncertain."));
            }
            if(Number(data.removedQty)!==line.qty){
                bundleRetryBlocked = true;
                throw new Error("The server returned an unexpected removed quantity. Check stock and sales records before continuing.");
            }
            completedBundleRemovals.push({...line});
        }
        const removed = completedBundleRemovals.reduce(function(sum,line){return sum+line.qty;},0);
        // Keep intentionally zero-quantity items in the list rather than counting them as removed.
        bundleItems = bundleItems.filter(function(item){return item.qty===0;});
        document.getElementById("saleAmount").value = "";
        document.getElementById("barcode").value = "";
        document.getElementById("locationChoices").innerHTML = "";
        invalidatePickingPlan("Removal complete. Enter quantities to start another plan.");
        flashSuccess();
        speakText(salesEnabled ? "Sale complete" : "Removal complete");
        setWarehouseStatus("Removal complete. Ready for next bundle.");
        document.getElementById("result").textContent = "Removed "+removed+" units from "+plan.groups.length+" locations"+
            (salesEnabled ? ", recorded for GBP "+millsToPounds(totalSaleMills)+"." : ". Sales tracking is off.");
    }catch(error){
        // Each backend request is its own transaction. Retain only outstanding
        // quantities and sale value after confirmed successes; never resubmit them.
        completedBundleRemovals.forEach(function(line){
            const item = bundleItems.find(function(entry){return entry.barcode===line.barcode;});
            if(!item) return;
            item.qty = Math.max(0,item.qty-line.qty);
            item.locations = item.locations.map(function(l){
                return l.location===line.location ? {...l,qty:Math.max(0,l.qty-line.qty)} : l;
            }).filter(function(l){return l.qty>0;});
        });
        const removed = completedBundleRemovals.reduce(function(sum,line){return sum+line.qty;},0);
        const recordedMills = completedBundleRemovals.reduce(function(sum,line){return sum+line.saleAmountMills;},0);
        if(salesEnabled && removed) document.getElementById("saleAmount").value = millsToPounds(totalSaleMills-recordedMills);
        invalidatePickingPlan((phase==="checking" ? "Nothing has been removed. " : "Removal stopped. ")+(error.message || "Please check stock."));
        const result = document.getElementById("result");
        result.textContent = bundleMessage+(removed ? " Already confirmed: "+removed+" units"+(salesEnabled ? " for GBP "+millsToPounds(recordedMills) : "")+". These will not be submitted again." : "");
        if(completedBundleRemovals.length){
            const details = document.createElement("div");
            details.className = "bundle-item-meta";
            details.textContent = completedBundleRemovals.map(function(line){return line.qty+" x "+line.description+" from "+locationDisplayName(line.location);}).join("; ");
            result.appendChild(details);
        }
        flashError();
        setWarehouseStatus("Removal stopped. Review the message.");
    }finally{
        bundleBusy = false;
        hideLoading();
        renderBundleList();
        focusBarcodeInput();
    }
}
// The settings wrapper must not replace this plan-aware queue when sales are off.
removeBundleStock.usesPickingPlan = true;


let speechRecognition = null;
let voiceListening = false;
let refocusTimer = null;


function flashSuccess(){
    document.body.classList.remove("error-flash");
    document.body.classList.add("success-flash");
    setTimeout(function(){ document.body.classList.remove("success-flash"); }, 4000);
}
function flashError(){
    document.body.classList.remove("success-flash");
    document.body.classList.add("error-flash");
}
function clearReactiveBackground(){ document.body.classList.remove("error-flash"); }
function speakText(text){
    try{ if(!window.speechSynthesis) return; const u=new SpeechSynthesisUtterance(text); u.lang="en-GB"; u.rate=1.05; window.speechSynthesis.cancel(); window.speechSynthesis.speak(u); }catch(e){}
}
function setWarehouseStatus(message){ const el=document.getElementById("warehouseStatus"); if(el) el.innerHTML=message; }
function isConfirmSaleCommand(text){
    const p=String(text||"").toLowerCase();
    return p.includes("complete sale") || p.includes("confirm sale") || p.includes("complete the sale") || p.includes("confirm the sale");
}
function completeSaleByVoice(){
    const saleAmount=Number(document.getElementById("saleAmount").value||0);
    if(bundleItems.length===0){ setVoiceStatus("No items in bundle. Scan items first.", true); setWarehouseStatus("No items in bundle. Scan items first."); speakText("No items in bundle"); return; }
    if(saleAmount<=0){ setVoiceStatus("No sale price set. Say the price first.", true); setWarehouseStatus("No sale price set. Say the price first."); speakText("No sale price set"); return; }
    setVoiceStatus("Confirm command heard. Removing stock...", true);
    setWarehouseStatus("Confirm command heard. Removing stock...");
    speakText("Removing stock");
    removeButtonPressed();
}
function toggleUsbScannerMode(){
    const checked=document.getElementById("usbScannerMode").checked;
    if(checked){
        document.body.classList.add("warehouse-mode");
        setWarehouseStatus("Listening is on. Say a price, then say confirm sale.");
        startVoicePrice();
        setTimeout(function(){ const b=document.getElementById("barcode"); if(b) b.focus(); },100);
    }else{
        document.body.classList.remove("warehouse-mode");
        stopVoicePrice();
    }
}

function keepBarcodeFocused(){
    const scannerMode = document.getElementById("usbScannerMode");
    const barcodeInput = document.getElementById("barcode");
    if(!scannerMode || !scannerMode.checked || !barcodeInput) return;
    if(pickingSourcePickerIndex !== null) return;

    const active = document.activeElement;
    const activeId = active ? active.id : "";
    if(active && active.closest(".bundle-source-choice, .bundle-source-locks")) return;

    if(activeId !== "saleAmount" && !(active && active.classList.contains("bundle-qty")) && !String(active && active.tagName || "").toLowerCase().includes("select")){
        barcodeInput.focus();
    }
}

function scheduleBarcodeRefocus(){
    clearTimeout(refocusTimer);
    refocusTimer = setTimeout(keepBarcodeFocused, 150);
}

function wordsToNumber(words){
    const small = {
        zero:0, oh:0, one:1, won:1, two:2, too:2, to:2, three:3,
        four:4, for:4, five:5, six:6, seven:7, eight:8, ate:8,
        nine:9, ten:10, eleven:11, twelve:12, thirteen:13, fourteen:14,
        fifteen:15, sixteen:16, seventeen:17, eighteen:18, nineteen:19
    };

    const tens = {
        twenty:20, thirty:30, forty:40, fourty:40, fifty:50,
        sixty:60, seventy:70, eighty:80, ninety:90
    };

    let total = 0;

    words.forEach(function(word){
        if(small.hasOwnProperty(word)){
            total += small[word];
        }else if(tens.hasOwnProperty(word)){
            total += tens[word];
        }
    });

    return total;
}

function parseSpokenPrice(text){
    let original = String(text || "").toLowerCase();

    // Remove common speech-recognition filler words but DO NOT remove "to", because it can mean "two".
    let phrase = original
        .replace(/price/g,"")
        .replace(/set/g,"")
        .replace(/amount/g,"")
        .replace(/sale/g,"")
        .replace(/pounds?/g,"")
        .replace(/quid/g,"")
        .replace(/gbp/g,"")
        .replace(/\u00a3/g,"")
        .replace(/,/g,"")
        .trim();

    if(!phrase){
        return null;
    }

    // \u00a33.50 / 3.50 / 3:50 / 3 point 50
    let decimal = phrase.match(/(\d+)\s*(?:\.|:|point)\s*(\d{1,2})/);
    if(decimal){
        let pounds = Number(decimal[1]);
        let pence = decimal[2];
        if(pence.length === 1) pence += "0";
        return (pounds + Number(pence) / 100).toFixed(2);
    }

    // 3 50 / 7 99
    let twoDigits = phrase.match(/\b(\d+)\s+(\d{1,2})\b/);
    if(twoDigits){
        let pounds = Number(twoDigits[1]);
        let pence = twoDigits[2];
        if(pence.length === 1) pence += "0";
        return (pounds + Number(pence) / 100).toFixed(2);
    }

    // Just 12 = \u00a312.00
    let whole = phrase.match(/\b(\d+)\b/);
    if(whole){
        return Number(whole[1]).toFixed(2);
    }

    const validWords = [
        "zero","oh","one","won","two","too","to","three","four","for","five","six",
        "seven","eight","ate","nine","ten","eleven","twelve","thirteen","fourteen",
        "fifteen","sixteen","seventeen","eighteen","nineteen","twenty","thirty",
        "forty","fourty","fifty","sixty","seventy","eighty","ninety"
    ];

    const words = phrase.split(/\s+/).filter(function(word){
        return validWords.includes(word);
    });

    if(words.length === 0){
        return null;
    }

    // one word: "twelve" = \u00a312.00
    if(words.length === 1){
        return wordsToNumber(words).toFixed(2);
    }

    // two/three words: "three fifty" = \u00a33.50, "seven ninety nine" = \u00a37.99
    const poundWords = [words[0]];
    const penceWords = words.slice(1);

    let pounds = wordsToNumber(poundWords);
    let pence = wordsToNumber(penceWords);

    if(pence < 10){
        pence = pence * 10;
    }

    return (pounds + pence / 100).toFixed(2);
}

function setVoiceStatus(message, on){
    const el = document.getElementById("voiceStatus");
    if(!el) return;
    el.innerHTML = on ? "<span class='voice-on'>" + message + "</span>" : message;
}

function speakPriceSet(price){
    try{
        if(!window.speechSynthesis) return;
        const utterance = new SpeechSynthesisUtterance("Price set to " + price + " pounds");
        utterance.lang = "en-GB";
        utterance.rate = 1.05;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
    }catch(error){}
}

function fillSalePriceFromSpeech(transcript){
    if(isConfirmSaleCommand(transcript)){ completeSaleByVoice(); return true; }
    const price = parseSpokenPrice(transcript);

    if(price !== null){
        const saleInput = document.getElementById("saleAmount");
        saleInput.value = price;

        // Fire an input event so your bundle split preview updates properly.
        saleInput.dispatchEvent(new Event("input", { bubbles:true }));

        renderBundleList();
        setVoiceStatus("Heard: '" + transcript + "' \u2192 Price set to \u00a3" + price, true);
        setWarehouseStatus("Price set to \u00a3" + price + ". Say confirm sale or complete sale.");
        speakPriceSet(price);
        scheduleBarcodeRefocus();
        return true;
    }

    setVoiceStatus("Heard: '" + transcript + "' but could not read a price. Try 'three fifty' or 'twelve pounds'.", true);
    return false;
}

function toggleVoicePriceMode(){
    if(document.getElementById("voicePriceMode").checked){
        startVoicePrice();
    }else{
        stopVoicePrice();
    }
}

function startVoicePrice(){
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if(!SpeechRecognition){
        document.getElementById("voicePriceMode").checked = false;
        setVoiceStatus("Voice recognition is not supported here. Use Chrome on Windows for best results.", false);
        return;
    }

    if(speechRecognition && voiceListening){
        setVoiceStatus("Already listening. Say three fifty or twelve pounds.", true);
        return;
    }

    speechRecognition = new SpeechRecognition();
    speechRecognition.continuous = true;
    speechRecognition.interimResults = true;
    speechRecognition.lang = "en-GB";
    speechRecognition.maxAlternatives = 3;

    speechRecognition.onstart = function(){
        voiceListening = true;
        document.getElementById("voicePriceMode").checked = true;
        setVoiceStatus("Listening... say three fifty, seven ninety nine, or twelve pounds.", true);
    };

    speechRecognition.onresult = function(event){
        let finalTranscript = "";
        let interimTranscript = "";

        for(let i = event.resultIndex; i < event.results.length; i++){
            const transcript = event.results[i][0].transcript.trim();

            if(event.results[i].isFinal){
                finalTranscript += transcript;
            }else{
                interimTranscript += transcript;
            }
        }

        if(interimTranscript){
            setVoiceStatus("Hearing: '" + interimTranscript + "'", true);
        }

        if(finalTranscript){
            fillSalePriceFromSpeech(finalTranscript);
        }
    };

    speechRecognition.onerror = function(event){
        setVoiceStatus("Voice error: " + event.error + ". Press Activate Listening Mode again.", false);
    };

    speechRecognition.onend = function(){
        voiceListening = false;

        if(document.getElementById("voicePriceMode").checked){
            setVoiceStatus("Restarting listening mode...", true);
            setTimeout(function(){
                try{
                    speechRecognition.start();
                }catch(error){}
            }, 500);
        }else{
            setVoiceStatus("Listening mode is off.", false);
        }
    };

    try{
        speechRecognition.start();
    }catch(error){
        setVoiceStatus("Could not start listening mode. Refresh the page and try again.", false);
    }
}

function stopVoicePrice(){
    document.getElementById("voicePriceMode").checked = false;

    if(speechRecognition){
        try{
            speechRecognition.stop();
        }catch(error){}
    }

    voiceListening = false;
    setVoiceStatus("Listening mode is off.", false);
    scheduleBarcodeRefocus();
}

function testFillPrice(){
    fillSalePriceFromSpeech("three fifty");
}

document.addEventListener("click", scheduleBarcodeRefocus);
document.getElementById("pickingSourceClose").addEventListener("click",function(){closePickingSourcePicker();});
document.getElementById("pickingSourceDialog").addEventListener("cancel",function(event){event.preventDefault();closePickingSourcePicker();});
window.addEventListener("inventoryos-stack-order-changed",function(){invalidatePickingPlan("Stack order changed. Consolidate again to refresh the route.");renderPickingPlan();});
window.addEventListener("inventory-selection-changed", function(){
    if(!bundleInventoryId || bundleInventoryId === getSelectedInventoryHeaderForRemove()) return;
    pickingSourceLocks=Object.create(null);
    selectedSuggestedItem = null;
    suggestedItems = [];
    if(bundleBusy){
        invalidatePickingPlan("Inventory changed. The current operation will stop before sending any more requests.");
        return;
    }
    if(!bundleRetryBlocked){
        clearBundleList();
        document.getElementById("result").textContent = "Inventory changed. Bundle cleared; add items from this inventory.";
    }
});
setInterval(keepBarcodeFocused, 1200);


document.getElementById("barcode").addEventListener("input", function(){
    const current = normaliseBarcode(this.value);
    const selectedBarcode = selectedSuggestedItem
        ? normaliseBarcode(selectedSuggestedItem.barcode || selectedSuggestedItem.itemId || "")
        : "";

    if(selectedSuggestedItem && current !== selectedBarcode){
        selectedSuggestedItem = null;
    }

    searchSuggestedItems();
});

document.getElementById("barcode").addEventListener("keydown", function(e){
    if(e.key === "Enter"){
        e.preventDefault();

        if(this.value.trim()){
            addBundleBarcodeFromInput();
            scheduleBarcodeRefocus();
        }
    }
});

window.addEventListener("load", function(){
    const params = new URLSearchParams(window.location.search);

    const barcode = params.get("barcode");
    const location = params.get("location");

    if(barcode){
        document.getElementById("barcode").value = normaliseBarcode(barcode);
        document.getElementById("result").innerText =
        "Quick sale loaded. Enter sale amount, then press Remove Stock.";
    }

    if(location){
        window.quickSaleLocation = location;
    }

    setTimeout(function(){
        const barcodeInput = document.getElementById("barcode");
        if(barcodeInput) barcodeInput.focus();
        const usbMode=document.getElementById("usbScannerMode");
        if(usbMode && usbMode.checked){ toggleUsbScannerMode(); }
    }, 250);
});
