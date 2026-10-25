
if(!InventoryAPI.requireLogin()){
    throw new Error("Login required");
}


const BOX_CAPACITY = 50;
let allBoxes = [];
let boxesLoadVersion = 0;

function readLocationSettings(){
    try{
        if(
            typeof InventoryWorkspace !== "undefined" &&
            InventoryWorkspace &&
            typeof InventoryWorkspace.getSettings === "function"
        ){
            return InventoryWorkspace.getSettings();
        }
    }catch(error){
        console.error(
            "Could not read location settings from InventoryWorkspace:",
            error
        );
    }

    try{
        const workspace = JSON.parse(
            localStorage.getItem("inventoryos_workspace") ||
            "null"
        );

        if(workspace && workspace.settings){
            return workspace.settings;
        }
    }catch(error){
        console.error(
            "Could not read cached workspace settings:",
            error
        );
    }

    return {};
}

function locationWords(){
    const settings = readLocationSettings();

    const singular =
        String(
            settings.location_label_singular ||
            "Box"
        ).trim() ||
        "Box";

    const plural =
        String(
            settings.location_label_plural ||
            "Boxes"
        ).trim() ||
        "Boxes";

    return {
        singular:singular,
        plural:plural,
        singularLower:singular.toLocaleLowerCase(),
        pluralLower:plural.toLocaleLowerCase()
    };
}

function applyLocationsPageWording(){
    const words = locationWords();

    document.title =
        words.singular +
        " Locations";

    document.getElementById(
        "locationPageTitle"
    ).textContent =
        words.singular +
        " Locations";

    document.getElementById(
        "locationPageSubtitle"
    ).textContent =
        "Active " +
        words.pluralLower +
        ", empty " +
        words.pluralLower +
        ", contents, sorting and combine suggestions";

    document.getElementById(
        "createNextLocationButton"
    ).textContent =
        "+ Create " +
        words.singular;

    document.getElementById(
        "sortByLocationNumber"
    ).textContent =
        "Sort by " +
        words.singularLower +
        " number";

    document.getElementById(
        "boxSearch"
    ).placeholder =
        "Search " +
        words.singularLower +
        " by name or number, e.g. 14";

    document.getElementById(
        "activeLocationsStatLabel"
    ).textContent =
        "Active " +
        words.plural;

    document.getElementById(
        "emptyLocationsStatLabel"
    ).textContent =
        "Empty " +
        words.plural;

    document.getElementById(
        "activeLocationsHeading"
    ).textContent =
        "Active " +
        words.plural;

    document.getElementById(
        "locationSuggestionsHeading"
    ).textContent =
        words.singular +
        " Suggestions";

    document.getElementById(
        "emptyLocationsHeading"
    ).textContent =
        "Empty " +
        words.plural;

    const largest =
        document.getElementById("largestBox");

    const smallest =
        document.getElementById("smallestBox");

    if(
        largest &&
        /loading/i.test(largest.textContent)
    ){
        largest.textContent =
            "Largest " +
            words.singularLower +
            ": Loading...";
    }

    if(
        smallest &&
        /loading/i.test(smallest.textContent)
    ){
        smallest.textContent =
            "Smallest " +
            words.singularLower +
            ": Loading...";
    }

    const activeList =
        document.getElementById("activeBoxList");

    if(
        activeList &&
        /loading boxes/i.test(activeList.textContent)
    ){
        activeList.innerHTML =
            "<div class='empty-state'>Loading " +
            safeText(words.pluralLower) +
            "...</div>";
    }

    const emptyList =
        document.getElementById("emptyBoxList");

    if(
        emptyList &&
        /loading empty boxes/i.test(emptyList.textContent)
    ){
        emptyList.innerHTML =
            "<div class='empty-state'>Loading empty " +
            safeText(words.pluralLower) +
            "...</div>";
    }
}

function showLoading(){document.getElementById("loadingOverlay").style.display="flex";}
function hideLoading(){document.getElementById("loadingOverlay").style.display="none";}
function safeText(value){return String(value || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");}
function boxNumber(box){const match=String(box||"").match(/\d+/);return match?Number(match[0]):999999;}
function cleanBoxId(box){return Array.from(String(box || ""), c=>c.codePointAt(0).toString(16)).join("_");}

function createNextBox(){
    InventoryLocationEditor.open();
}

function loadBoxes(){
    const words = locationWords();
    const version = ++boxesLoadVersion;
    const selection = InventoryAPI.getSelectedInventoryHeader();

    showLoading();

    return InventoryAPI.request(
        "/boxes/overview?_t=" +
        Date.now()
    )
    .then(data=>{
        if(version !== boxesLoadVersion || selection !== InventoryAPI.getSelectedInventoryHeader()) return;
        hideLoading();

        if(!data.success){
            document.getElementById(
                "activeBoxList"
            ).innerHTML =
                "<div class='empty-state'>Could not load " +
                safeText(words.pluralLower) +
                "</div>";

            return;
        }

        allBoxes = data.boxes || [];
        renderBoxes();
    })
    .catch(error=>{
        hideLoading();
        console.error(error);

        document.getElementById(
            "activeBoxList"
        ).innerHTML =
            "<div class='empty-state'>Error loading " +
            safeText(words.pluralLower) +
            "</div>";
    });
}

function renderBoxes(){
    const sort=document.getElementById("sortOption").value;
    const query=String(document.getElementById("boxSearch").value || "").trim().toUpperCase();

    let active=allBoxes.filter(b=>Number(b.qty || 0)>0);
    let empty=allBoxes.filter(b=>Number(b.qty || 0)===0);

    if(query){
        active=active.filter(b=>InventoryWorkspace.formatLocationName(b.box).toUpperCase().includes(query) || String(boxNumber(b.box)).includes(query) || String(b.notes || "").toUpperCase().includes(query));
        empty=empty.filter(b=>InventoryWorkspace.formatLocationName(b.box).toUpperCase().includes(query) || String(boxNumber(b.box)).includes(query) || String(b.notes || "").toUpperCase().includes(query));
    }

    if(sort==="number"){active.sort((a,b)=>boxNumber(a.box)-boxNumber(b.box));empty.sort((a,b)=>boxNumber(a.box)-boxNumber(b.box));}
    if(sort==="created"){active.sort((a,b)=>new Date(a.createdAt || 0)-new Date(b.createdAt || 0));empty.sort((a,b)=>new Date(a.createdAt || 0)-new Date(b.createdAt || 0));}
    if(sort==="low"){active.sort((a,b)=>Number(a.qty || 0)-Number(b.qty || 0));}
    if(sort==="high"){active.sort((a,b)=>Number(b.qty || 0)-Number(a.qty || 0));}

    document.getElementById("activeCount").textContent=active.length;
    document.getElementById("emptyCount").textContent=empty.length;
    document.getElementById("totalStock").textContent=active.reduce((sum,b)=>sum+Number(b.qty || 0),0);
    document.getElementById("lowCount").textContent=active.filter(b=>Number(b.qty || 0)<15).length;

    renderHighlights(active);
    renderActive(active);
    renderEmpty(empty);
    renderSuggestions(active);
}

function renderHighlights(active){
    const words = locationWords();

    if(active.length === 0){
        document.getElementById(
            "largestBox"
        ).innerHTML =
            "Largest " +
            safeText(words.singularLower) +
            ": <strong>None</strong>";

        document.getElementById(
            "smallestBox"
        ).innerHTML =
            "Smallest " +
            safeText(words.singularLower) +
            ": <strong>None</strong>";

        return;
    }

    const byQty =
        [...active].sort(
            (a,b)=>
                Number(b.qty || 0) -
                Number(a.qty || 0)
        );

    const largest = byQty[0];
    const smallest = byQty[byQty.length - 1];

    document.getElementById(
        "largestBox"
    ).innerHTML =
        "Largest " +
        safeText(words.singularLower) +
        ": <strong>" +
        InventoryWorkspace.locationNameHtml(largest.box) +
        "</strong> (" +
        Number(largest.qty || 0) +
        " items)";

    document.getElementById(
        "smallestBox"
    ).innerHTML =
        "Smallest " +
        safeText(words.singularLower) +
        ": <strong>" +
        InventoryWorkspace.locationNameHtml(smallest.box) +
        "</strong> (" +
        Number(smallest.qty || 0) +
        " items)";
}

function renderActive(active){
    const words = locationWords();

    if(active.length === 0){
        document.getElementById(
            "activeBoxList"
        ).innerHTML =
            "<div class='empty-state'>No active " +
            safeText(words.pluralLower) +
            " with stock.</div>";

        return;
    }

    let html = "<div class='box-grid'>";

    active.forEach(item=>{
        const box = safeText(item.box);
        const id = cleanBoxId(item.box);
        const notes =
            safeText(
                item.notes ||
                "No notes added"
            );

        const qty = Number(item.qty || 0);
        const uniqueItems =
            Number(item.uniqueItems || 0);

        const percent =
            Math.min(
                100,
                Math.round(
                    (qty / BOX_CAPACITY) *
                    100
                )
            );

        html += `
            <div class="box-card">
                <div class="box-title">
                    <div class="box-name">${InventoryWorkspace.locationNameHtml(item.box)}</div>
                    <div class="badge">${qty} items</div>
                </div>

                <div class="box-notes" data-location-wording-ignore>${notes}</div>
                <button type="button" class="location-edit-button small-button" data-location-edit="${safeText(item.id)}">Edit name &amp; notes</button>

                <div class="capacity-wrap">
                    <div class="capacity-bar" style="width:${percent}%"></div>
                </div>

                <div class="capacity-text">
                    ${percent}% full based on ${BOX_CAPACITY} items • ${uniqueItems} unique products
                </div>

                <button class="blue-button small-button" data-ios-click="h9094675931c35796" data-ios-click-args="${InventoryEvents.encode([item.box])}">
                    View Contents
                </button>

                <div class="contents-list" id="contents-${id}">
                    Loading...
                </div>
            </div>
        `;
    });

    html += "</div>";

    document.getElementById(
        "activeBoxList"
    ).innerHTML = html;
}

function renderEmpty(empty){
    const words = locationWords();

    if(empty.length === 0){
        document.getElementById(
            "emptyBoxList"
        ).innerHTML =
            "<div class='empty-state'>No empty " +
            safeText(words.pluralLower) +
            ".</div>";

        return;
    }

    let html = "<div class='box-grid'>";

    empty.forEach(item=>{
        const box = safeText(item.box);

        const notes =
            safeText(
                item.notes ||
                "No notes added"
            );

        html += `
            <div class="box-card">
                <div class="box-title">
                    <div class="box-name">${InventoryWorkspace.locationNameHtml(item.box)}</div>
                    <div class="badge">0 items</div>
                </div>

                <div class="box-notes" data-location-wording-ignore>${notes}</div>
                <button type="button" class="location-edit-button small-button" data-location-edit="${safeText(item.id)}">Edit name &amp; notes</button>

                <button class="delete-button small-button" data-ios-click="h9a5fb7c0aca66c52" data-ios-click-args="${InventoryEvents.encode([item.box])}">
                    Delete Empty ${safeText(words.singular)}
                </button>
            </div>
        `;
    });

    html += "</div>";

    document.getElementById(
        "emptyBoxList"
    ).innerHTML = html;
}

function renderSuggestions(active){
    const lowBoxes=active.filter(b=>Number(b.qty || 0)<15).sort((a,b)=>Number(a.qty || 0)-Number(b.qty || 0));
    if(lowBoxes.length<2){document.getElementById("suggestionList").innerHTML="<div class='empty-state'>No combine suggestions right now.</div>";return;}
    let html="";
    for(let i=0;i<lowBoxes.length-1;i+=2){
        const a=lowBoxes[i];
        const b=lowBoxes[i+1];
        const total=Number(a.qty || 0)+Number(b.qty || 0);
        html+=`
            <div class="suggestion">
                Maybe combine <strong>${InventoryWorkspace.locationNameHtml(a.box)}</strong> (${Number(a.qty || 0)} items)
                with <strong>${InventoryWorkspace.locationNameHtml(b.box)}</strong> (${Number(b.qty || 0)} items).<br>
                Combined total: <strong>${total} items</strong>.
                <button class="green-button small-button" data-ios-click="h06e2eaf5e082f0b6" data-ios-click-args="${InventoryEvents.encode([a.box,b.box])}">
                    Move ${InventoryWorkspace.locationNameHtml(a.box)} into ${InventoryWorkspace.locationNameHtml(b.box)}
                </button>
            </div>`;
    }
    document.getElementById("suggestionList").innerHTML=html;
}

function toggleContents(box){
    const words = locationWords();

    const div =
        document.getElementById(
            "contents-" +
            cleanBoxId(box)
        );

    if(!div){
        return;
    }

    if(div.style.display === "block"){
        div.style.display = "none";
        return;
    }

    div.style.display = "block";
    div.innerHTML = "Loading...";

    InventoryAPI.request(
        "/boxes/" +
        encodeURIComponent(box) +
        "/contents?_t=" +
        Date.now()
    )
    .then(data=>{
        if(!data.success){
            div.innerHTML =
                "Could not load contents";
            return;
        }

        if(
            !data.results ||
            data.results.length === 0
        ){
            div.innerHTML =
                "No stock in this " +
                safeText(words.singularLower) +
                ".";

            return;
        }

        let html =
            `<strong>${data.totalQty || 0} total items • ${data.differentItems || 0} unique products</strong>`;

        data.results.forEach(item=>{
            html += `
                <div class="content-row">
                    <strong>${safeText(item.description)}</strong>
                    <br>Barcode: ${safeText(item.barcode)}
                    <br>Qty: ${Number(item.qty || 0)}
                </div>
            `;
        });

        div.innerHTML = html;
    })
    .catch(error=>{
        console.error(error);
        div.innerHTML =
            "Error loading contents";
    });
}

function mergeBoxes(fromBox,toBox){
    const words = locationWords();

    if(
        !confirm(
            "Move all stock from " +
            InventoryWorkspace.formatLocationName(fromBox) +
            " into " +
            InventoryWorkspace.formatLocationName(toBox) +
            "?"
        )
    ){
        return;
    }

    showLoading();

    InventoryAPI.request(
        "/move/box",
        {
            method:"POST",
            body:JSON.stringify({
                fromLocation:fromBox,
                toLocation:toBox
            })
        }
    )
    .then(data=>{
        hideLoading();

        if(data.success){
            alert(
                "Moved " +
                data.totalMoved +
                " items from " +
                InventoryWorkspace.formatLocationName(data.fromBox) +
                " into " +
                InventoryWorkspace.formatLocationName(data.toBox)
            );

            loadBoxes();
        }else{
            alert(
                data.error ||
                "Could not merge " +
                words.pluralLower
            );
        }
    })
    .catch(error=>{
        hideLoading();
        console.error(error);

        alert(
            "Error merging " +
            words.pluralLower
        );
    });
}

function deleteBox(box){
    const words = locationWords();

    if(
        !confirm(
            "Delete " +
            InventoryWorkspace.formatLocationName(box) +
            "? This only works if the " +
            words.singularLower +
            " has no stock."
        )
    ){
        return;
    }

    showLoading();

    InventoryAPI.request(
        "/boxes/" +
        encodeURIComponent(box),
        {
            method:"DELETE"
        }
    )
    .then(data=>{
        hideLoading();

        if(data.success){
            alert(
                words.singular +
                " deleted: " +
                InventoryWorkspace.formatLocationName(data.box)
            );

            loadBoxes();
        }else{
            alert(
                data.error ||
                "Could not delete " +
                words.singularLower
            );
        }
    })
    .catch(error=>{
        hideLoading();
        console.error(error);

        alert(
            "Error deleting " +
            words.singularLower
        );
    });
}

window.addEventListener(
    "inventory-selection-changed",
    function(){
        allBoxes = [];
        applyLocationsPageWording();
        loadBoxes();
    }
);

async function initialiseLocationsPage(){
    try{
        if(
            typeof InventoryWorkspace !== "undefined" &&
            InventoryWorkspace &&
            typeof InventoryWorkspace.init === "function"
        ){
            await InventoryWorkspace.init();
        }
    }catch(error){
        console.error(
            "Could not initialise workspace wording:",
            error
        );
    }

    applyLocationsPageWording();
    loadBoxes();
}

window.addEventListener("inventoryos-location-wording-changed", function(){
    applyLocationsPageWording();
    renderBoxes();
});

if(document.readyState === "loading"){
    document.addEventListener(
        "DOMContentLoaded",
        initialiseLocationsPage,
        {
            once:true
        }
    );
}else{
    initialiseLocationsPage();
}
