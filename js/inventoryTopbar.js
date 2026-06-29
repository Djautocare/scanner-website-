const InventoryTopbar = (function(){
    const STORAGE_KEY = "inventoryos_selected_inventory_ids";
    let apiPatched = false;

    function hasInventoryAPI(){
        return typeof InventoryAPI !== "undefined" && InventoryAPI;
    }

    function getSelectedIds(){
        try{
            const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
            return Array.isArray(parsed) ? parsed.map(String) : [];
        }catch(error){
            return [];
        }
    }

    function saveSelectedIds(ids){
        const clean = [...new Set((ids || []).filter(Boolean).map(String))];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
        return clean;
    }

    function getHeaderValue(){
        return getSelectedIds().join(",");
    }

    function patchApiRequests(){
        if(!hasInventoryAPI() || apiPatched || InventoryAPI.__inventoryTopbarPatched) return;

        const originalRequest = InventoryAPI.request;

        InventoryAPI.request = function(path, options = {}){
            const selected = getHeaderValue();

            options.headers = {
                ...(options.headers || {})
            };

            if(selected){
                options.headers["X-Inventory-Ids"] = selected;
            }

            return originalRequest(path, options);
        };

        apiPatched = true;
        InventoryAPI.__inventoryTopbarPatched = true;
    }

    async function loadWorkspace(){
        const data = await InventoryAPI.request("/workspaces/current");
        return data.success ? data.workspace : null;
    }

    async function loadInventories(){
        const data = await InventoryAPI.request("/workspaces/inventories");

        if(!data.success){
            throw new Error(data.error || "Could not load inventories");
        }

        return data.inventories || [];
    }

    function ensureSelection(inventories){
        let selected = getSelectedIds();
        const validIds = inventories.map(inv => String(inv.id));

        selected = selected.filter(id => validIds.includes(id));

        if(selected.length === 0 && inventories.length){
            const defaultInv = inventories.find(inv => inv.is_default) || inventories[0];
            selected = [String(defaultInv.id)];
        }

        return saveSelectedIds(selected);
    }

    function selectedText(inventories, selectedIds){
        if(!inventories.length) return "No inventories";

        if(selectedIds.length === 1){
            const inv = inventories.find(i => String(i.id) === String(selectedIds[0]));
            return inv ? inv.name : "Inventory";
        }

        return selectedIds.length + " inventories selected";
    }

    function escapeHtml(value){
        return String(value || "")
            .replaceAll("&","&amp;")
            .replaceAll("<","&lt;")
            .replaceAll(">","&gt;")
            .replaceAll('"',"&quot;")
            .replaceAll("'","&#039;");
    }

    async function createInventory(){
        const name = prompt("New inventory name, e.g. Warehouse, Van 1, Van 2, Returns");

        if(!name || !name.trim()) return;

        const data = await InventoryAPI.request("/workspaces/inventories", {
            method:"POST",
            body:JSON.stringify({ name:name.trim() })
        });

        if(!data.success){
            alert(data.error || "Could not create inventory");
            return;
        }

        const selected = getSelectedIds();
        selected.push(String(data.inventory.id));
        saveSelectedIds(selected);

        await init();
        window.dispatchEvent(new CustomEvent("inventory-selection-changed", {
            detail:{ selectedIds:getSelectedIds() }
        }));
    }

    async function init(containerId = "inventory-topbar"){
        patchApiRequests();

        const container = document.getElementById(containerId);

        if(!container || !hasInventoryAPI() || !InventoryAPI.isLoggedIn()){
            return false;
        }

        let workspace = null;
        let inventories = [];

        try{
            [workspace, inventories] = await Promise.all([
                loadWorkspace(),
                loadInventories()
            ]);
        }catch(error){
            console.error(error);
            container.innerHTML = `
                <div class="inventory-topbar">
                    <div class="inventory-topbar-left">
                        <div class="inventory-topbar-brand">Inventory<span>OS</span></div>
                        <div class="inventory-topbar-sub">Could not load inventories</div>
                    </div>
                </div>
            `;
            return false;
        }

        let selectedIds = ensureSelection(inventories);

        container.innerHTML = `
            <div class="inventory-topbar">
                <div class="inventory-topbar-left">
                    <div class="inventory-topbar-brand">Inventory<span>OS</span></div>
                    <div class="inventory-topbar-sub">
                        <span>${escapeHtml(workspace?.name || "Workspace")}</span>
                        <span class="dot">•</span>
                        <span>${escapeHtml(workspace?.role || "user")}</span>
                    </div>
                </div>

                <div class="inventory-topbar-right">
                    <div class="inventory-switcher" id="inventorySwitcher">
                        <button class="inventory-switcher-btn" type="button" id="inventorySwitcherBtn">
                            <span class="box">📦</span>
                            <span id="inventorySwitcherLabel">${escapeHtml(selectedText(inventories, selectedIds))}</span>
                            <span class="chev">▾</span>
                        </button>

                        <div class="inventory-switcher-menu" id="inventorySwitcherMenu">
                            <div class="menu-title">Viewing Inventories</div>
                            <div class="menu-list" id="inventorySwitcherList"></div>
                            <button class="menu-create" type="button" id="inventoryCreateBtn">＋ Create Inventory</button>
                        </div>
                    </div>

                    <button class="topbar-settings" type="button" onclick="window.location.href='settings.html'">⚙</button>
                </div>
            </div>
        `;

        const switcher = document.getElementById("inventorySwitcher");
        const btn = document.getElementById("inventorySwitcherBtn");
        const list = document.getElementById("inventorySwitcherList");
        const label = document.getElementById("inventorySwitcherLabel");
        const createBtn = document.getElementById("inventoryCreateBtn");

        function updateLabel(){
            label.textContent = selectedText(inventories, selectedIds);
        }

        function renderList(){
            list.innerHTML = "";

            inventories.forEach(inv => {
                const id = String(inv.id);

                const row = document.createElement("label");
                row.className = "inventory-menu-row";

                row.innerHTML = `
                    <input type="checkbox" value="${escapeHtml(id)}">
                    <div>
                        <div class="inv-name">${escapeHtml(inv.name)}</div>
                        <div class="inv-meta">
                            ${Number(inv.total_stock || 0)} stock
                            ${inv.is_default ? " • Default" : ""}
                        </div>
                    </div>
                `;

                const checkbox = row.querySelector("input");
                checkbox.checked = selectedIds.includes(id);

                checkbox.addEventListener("change", function(){
                    if(checkbox.checked){
                        selectedIds.push(id);
                    }else{
                        selectedIds = selectedIds.filter(x => x !== id);
                    }

                    if(selectedIds.length === 0){
                        checkbox.checked = true;
                        selectedIds = [id];
                    }

                    selectedIds = saveSelectedIds(selectedIds);
                    updateLabel();

                    window.dispatchEvent(new CustomEvent("inventory-selection-changed", {
                        detail:{ selectedIds }
                    }));
                });

                list.appendChild(row);
            });
        }

        btn.addEventListener("click", function(e){
            e.stopPropagation();
            switcher.classList.toggle("open");
        });

        createBtn.addEventListener("click", createInventory);

        document.addEventListener("click", function(e){
            if(!switcher.contains(e.target)){
                switcher.classList.remove("open");
            }
        });

        renderList();
        updateLabel();

        return true;
    }

    function start(){
        patchApiRequests();

        if(document.readyState === "loading"){
            document.addEventListener("DOMContentLoaded", function(){
                init();
            });
        }else{
            init();
        }
    }

    return {
        init,
        start,
        getSelectedIds,
        saveSelectedIds,
        getHeaderValue,
        patchApiRequests
    };
})();

InventoryTopbar.start();
