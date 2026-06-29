const InventorySelector = (function(){
    const STORAGE_KEY = "inventoryos_selected_inventory_ids";

    function getSelectedIds(){
        try{
            const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
            return Array.isArray(parsed) ? parsed : [];
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
        if(!window.InventoryAPI || InventoryAPI.__inventorySelectorPatched) return;

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

        InventoryAPI.__inventorySelectorPatched = true;
    }

    async function loadInventories(){
        const data = await InventoryAPI.request("/workspaces/inventories");

        if(!data.success){
            throw new Error(data.error || "Could not load inventories");
        }

        return data.inventories || [];
    }

    function ensureDefaultSelection(inventories){
        let selected = getSelectedIds();
        const validIds = inventories.map(i => String(i.id));

        selected = selected.filter(id => validIds.includes(id));

        if(selected.length === 0 && inventories.length){
            const defaultInv = inventories.find(i => i.is_default) || inventories[0];
            selected = [String(defaultInv.id)];
        }

        saveSelectedIds(selected);
        return selected;
    }

    function selectedLabel(inventories, selectedIds){
        if(!inventories.length) return "No inventories";
        if(selectedIds.length === 0) return "Select inventory";

        if(selectedIds.length === 1){
            const inv = inventories.find(i => String(i.id) === String(selectedIds[0]));
            return inv ? inv.name : "Inventory";
        }

        return selectedIds.length + " inventories";
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

        await render();
    }

    async function render(containerId = "inventory-selector"){
        patchApiRequests();

        const container = document.getElementById(containerId);
        if(!container) return;

        let inventories = [];

        try{
            inventories = await loadInventories();
        }catch(error){
            console.error(error);
            container.innerHTML = `<div class="inventory-selector-error">Inventory selector unavailable</div>`;
            return;
        }

        let selectedIds = ensureDefaultSelection(inventories);

        const wrapper = document.createElement("div");
        wrapper.className = "inventory-selector";

        wrapper.innerHTML = `
            <button class="inventory-selector-button" type="button">
                <span class="inventory-selector-icon">📦</span>
                <span class="inventory-selector-label"></span>
                <span class="inventory-selector-arrow">▾</span>
            </button>

            <div class="inventory-selector-menu">
                <div class="inventory-selector-title">View Inventories</div>
                <div class="inventory-selector-list"></div>
                <button class="inventory-selector-create" type="button">＋ Create Inventory</button>
            </div>
        `;

        const button = wrapper.querySelector(".inventory-selector-button");
        const label = wrapper.querySelector(".inventory-selector-label");
        const list = wrapper.querySelector(".inventory-selector-list");
        const createBtn = wrapper.querySelector(".inventory-selector-create");

        function escapeHtml(value){
            return String(value || "")
                .replaceAll("&","&amp;")
                .replaceAll("<","&lt;")
                .replaceAll(">","&gt;")
                .replaceAll('"',"&quot;")
                .replaceAll("'","&#039;");
        }

        function refreshLabel(){
            label.textContent = selectedLabel(inventories, selectedIds);
        }

        function refreshList(){
            list.innerHTML = "";

            inventories.forEach(inv => {
                const id = String(inv.id);

                const row = document.createElement("label");
                row.className = "inventory-selector-row";

                row.innerHTML = `
                    <input type="checkbox" value="${id}">
                    <span class="inventory-selector-name">${escapeHtml(inv.name)}</span>
                    <span class="inventory-selector-meta">${Number(inv.total_stock || 0)} stock</span>
                    ${inv.is_default ? `<span class="inventory-selector-default">Default</span>` : ``}
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
                    refreshLabel();

                    window.dispatchEvent(new CustomEvent("inventory-selection-changed", {
                        detail:{ selectedIds }
                    }));
                });

                list.appendChild(row);
            });
        }

        button.addEventListener("click", function(e){
            e.stopPropagation();
            wrapper.classList.toggle("open");
        });

        createBtn.addEventListener("click", createInventory);

        document.addEventListener("click", function(e){
            if(!wrapper.contains(e.target)){
                wrapper.classList.remove("open");
            }
        });

        container.innerHTML = "";
        container.appendChild(wrapper);

        refreshLabel();
        refreshList();
    }

    async function init(containerId = "inventory-selector"){
        patchApiRequests();
        await render(containerId);
    }

    return {
        init,
        render,
        getSelectedIds,
        saveSelectedIds,
        getHeaderValue,
        patchApiRequests
    };
})();

function startInventorySelector(){
    if(window.InventoryAPI && InventoryAPI.isLoggedIn()){
        InventorySelector.patchApiRequests();

        if(document.getElementById("inventory-selector")){
            InventorySelector.init();
        }
    }
}

if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", startInventorySelector);
}else{
    startInventorySelector();
}
