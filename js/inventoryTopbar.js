const InventoryTopbar = (function(){
    const STORAGE_KEY =
        "inventoryos_selected_inventory_ids";

    const WORKSPACE_KEY =
        "inventoryos_selected_workspace_id";

    let apiPatched = false;

    function hasInventoryAPI(){
        return (
            typeof InventoryAPI !== "undefined" &&
            InventoryAPI
        );
    }

    function getSelectedIds(){
        try{
            const parsed = JSON.parse(
                localStorage.getItem(
                    STORAGE_KEY
                ) || "[]"
            );

            return Array.isArray(parsed)
                ? parsed.map(String)
                : [];
        }catch(error){
            return [];
        }
    }

    function saveSelectedIds(ids){
        const clean = [
            ...new Set(
                (ids || [])
                    .filter(Boolean)
                    .map(String)
            )
        ];

        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(clean)
        );

        return clean;
    }

    function getSelectedWorkspaceId(){
        return String(
            localStorage.getItem(
                WORKSPACE_KEY
            ) || ""
        ).trim();
    }

    function saveSelectedWorkspaceId(id){
        if(id){
            localStorage.setItem(
                WORKSPACE_KEY,
                String(id)
            );
        }

        return getSelectedWorkspaceId();
    }

    function getHeaderValue(){
        return getSelectedIds().join(",");
    }

    function patchApiRequests(){
        if(
            !hasInventoryAPI() ||
            apiPatched ||
            InventoryAPI.__inventoryTopbarPatched
        ){
            return;
        }

        const originalRequest =
            InventoryAPI.request.bind(
                InventoryAPI
            );

        InventoryAPI.request =
            function(path, options = {}){
                const selectedInventories =
                    getHeaderValue();

                const selectedWorkspace =
                    getSelectedWorkspaceId();

                options = {
                    ...options,
                    headers:{
                        ...(options.headers || {})
                    }
                };

                if(selectedWorkspace){
                    options.headers[
                        "X-Workspace-Id"
                    ] = selectedWorkspace;
                }

                if(selectedInventories){
                    options.headers[
                        "X-Inventory-Ids"
                    ] = selectedInventories;
                }

                return originalRequest(
                    path,
                    options
                );
            };

        apiPatched = true;
        InventoryAPI.__inventoryTopbarPatched =
            true;
    }

    async function loadWorkspace(){
        const data =
            await InventoryAPI.request(
                "/workspaces/current"
            );

        return data.success
            ? data.workspace
            : null;
    }

    async function loadInventories(){
        const data =
            await InventoryAPI.request(
                "/workspaces/inventories"
            );

        if(!data.success){
            throw new Error(
                data.error ||
                "Could not load inventories"
            );
        }

        return data.inventories || [];
    }

    function groupByWorkspace(inventories){
        const map = new Map();

        inventories.forEach(inv=>{
            const workspaceId =
                String(
                    inv.workspace_id ||
                    ""
                );

            if(!map.has(workspaceId)){
                map.set(
                    workspaceId,
                    {
                        id:workspaceId,
                        name:
                            inv.workspace_name ||
                            "Workspace",

                        role:
                            inv.workspace_role ||
                            "user",

                        owner_user_id:
                            inv.owner_user_id ||
                            "",

                        inventories:[]
                    }
                );
            }

            map.get(workspaceId)
                .inventories
                .push(inv);
        });

        return Array.from(
            map.values()
        );
    }

    function ensureWorkspaceAndSelection(
        inventories,
        currentWorkspace
    ){
        const groups =
            groupByWorkspace(inventories);

        let selectedWorkspaceId =
            getSelectedWorkspaceId();

        if(
            !selectedWorkspaceId ||
            !groups.some(
                group =>
                    String(group.id) ===
                    String(
                        selectedWorkspaceId
                    )
            )
        ){
            const currentGroup =
                groups.find(
                    group =>
                        String(group.id) ===
                        String(
                            currentWorkspace?.id ||
                            ""
                        )
                );

            const personalGroup =
                groups.find(
                    group =>
                        String(
                            group.owner_user_id ||
                            ""
                        ) ===
                        String(
                            currentWorkspace
                                ?.owner_user_id ||
                            ""
                        )
                );

            selectedWorkspaceId =
                String(
                    (
                        currentGroup ||
                        personalGroup ||
                        groups[0] ||
                        {}
                    ).id ||
                    ""
                );

            saveSelectedWorkspaceId(
                selectedWorkspaceId
            );
        }

        const workspaceInventories =
            inventories.filter(
                inv =>
                    String(
                        inv.workspace_id
                    ) ===
                    String(
                        selectedWorkspaceId
                    )
            );

        let selectedIds =
            getSelectedIds().filter(
                id =>
                    workspaceInventories.some(
                        inv =>
                            String(inv.id) ===
                            String(id)
                    )
            );

        if(
            selectedIds.length === 0 &&
            workspaceInventories.length
        ){
            const defaultInv =
                workspaceInventories.find(
                    inv =>
                        inv.is_default
                ) ||
                workspaceInventories[0];

            selectedIds = [
                String(defaultInv.id)
            ];
        }

        selectedIds =
            saveSelectedIds(
                selectedIds
            );

        return {
            groups,
            selectedWorkspaceId,
            workspaceInventories,
            selectedIds
        };
    }

    function escapeHtml(value){
        return String(value || "")
            .replaceAll("&","&amp;")
            .replaceAll("<","&lt;")
            .replaceAll(">","&gt;")
            .replaceAll('"',"&quot;")
            .replaceAll("'","&#039;");
    }

    function selectedInventoryText(
        inventories,
        selectedIds
    ){
        if(!inventories.length){
            return "No inventories";
        }

        if(
            selectedIds.length ===
                inventories.length &&
            inventories.length > 1
        ){
            return "All Inventories";
        }

        if(selectedIds.length === 1){
            const inv =
                inventories.find(
                    item =>
                        String(item.id) ===
                        String(selectedIds[0])
                );

            return inv
                ? inv.name
                : "Inventory";
        }

        return (
            selectedIds.length +
            " selected"
        );
    }

    async function loadBillingStatus(){
        try{
            const data = await InventoryAPI.request(
                "/billing/status"
            );

            if(data && data.success){
                return data.billing || null;
            }
        }catch(error){
            console.warn(
                "Could not load billing status:",
                error
            );
        }

        return null;
    }

    function planKeyClass(value){
        return String(value || "unknown")
            .toLowerCase()
            .replace(/[^a-z0-9_-]/g,"-");
    }

    function planPillText(billing){
        if(!billing){
            return "Plan";
        }

        if(!billing.plan_selected){
            return "Plan Required";
        }

        const planName =
            billing.plan_name ||
            billing.plan_key ||
            "Plan";

        return String(planName).replace(/\s+plan$/i,"") + " Plan";
    }

    function planPillTitle(billing){
        if(!billing){
            return "Open billing and plan settings";
        }

        if(!billing.plan_selected){
            return "Choose an InventoryOS plan";
        }

        return "Current plan: " + planPillText(billing) + ". Click to change plan.";
    }

    async function createWorkspace(){
        const name = prompt(
            "New workspace name, e.g. My Warehouse, Family Stock, Trade Outlet"
        );

        if(!name || !name.trim()){
            return;
        }

        const data =
            await InventoryAPI.request(
                "/workspaces",
                {
                    method:"POST",
                    body:JSON.stringify({
                        name:name.trim()
                    })
                }
            );

        if(!data.success){
            alert(
                data.error ||
                "Could not create workspace"
            );

            return;
        }

        saveSelectedWorkspaceId(
            data.workspace.id
        );

        saveSelectedIds([
            String(data.inventory.id)
        ]);

        await init();

        window.dispatchEvent(
            new CustomEvent(
                "inventory-selection-changed",
                {
                    detail:{
                        selectedIds:
                            getSelectedIds(),

                        workspaceId:
                            getSelectedWorkspaceId()
                    }
                }
            )
        );
    }

    async function createInventory(
        workspaceId
    ){
        const name = prompt(
            "New inventory name, e.g. Main, Van, Returns, Clothing"
        );

        if(!name || !name.trim()){
            return;
        }

        const data =
            await InventoryAPI.request(
                "/workspaces/inventories",
                {
                    method:"POST",
                    body:JSON.stringify({
                        name:name.trim(),

                        workspace_id:
                            workspaceId ||
                            getSelectedWorkspaceId()
                    })
                }
            );

        if(!data.success){
            alert(
                data.error ||
                "Could not create inventory"
            );

            return;
        }

        saveSelectedWorkspaceId(
            data.inventory.workspace_id
        );

        saveSelectedIds([
            String(data.inventory.id)
        ]);

        await init();

        window.dispatchEvent(
            new CustomEvent(
                "inventory-selection-changed",
                {
                    detail:{
                        selectedIds:
                            getSelectedIds(),

                        workspaceId:
                            getSelectedWorkspaceId()
                    }
                }
            )
        );
    }

    async function init(
        containerId =
            "inventory-topbar"
    ){
        patchApiRequests();

        const container =
            document.getElementById(
                containerId
            );

        if(
            !container ||
            !hasInventoryAPI() ||
            !InventoryAPI.isLoggedIn()
        ){
            return false;
        }

        let workspace = null;
        let inventories = [];
        let billingStatus = null;

        try{
            [
                workspace,
                inventories
            ] = await Promise.all([
                loadWorkspace(),
                loadInventories()
            ]);
        }catch(error){
            console.error(error);

            container.innerHTML = `
                <div class="inventory-topbar">
                    <div class="inventory-topbar-left">
                        <div class="inventory-topbar-brand">
                            Inventory<span>OS</span>
                        </div>

                        <div class="inventory-topbar-sub">
                            Could not load inventories
                        </div>
                    </div>
                </div>
            `;

            return false;
        }

        let state =
            ensureWorkspaceAndSelection(
                inventories,
                workspace
            );

        /*
            The first request can use a stale workspace saved by a previous
            login. After validating the user's accessible workspaces above,
            reload the current workspace once with the corrected workspace ID.
        */
        try{
            workspace =
                await loadWorkspace() ||
                workspace;
        }catch(error){
            console.error(error);
        }

        billingStatus =
            await loadBillingStatus();

        const selectedWorkspace =
            state.groups.find(
                group =>
                    String(group.id) ===
                    String(
                        state.selectedWorkspaceId
                    )
            ) ||
            state.groups[0] ||
            null;

        container.innerHTML = `
            <div class="inventory-topbar">
                <div class="inventory-topbar-left">
                    <div class="inventory-topbar-brand">
                        Inventory<span>OS</span>
                    </div>

                    <div class="inventory-topbar-sub">
                        <span>
                            ${escapeHtml(
                                selectedWorkspace?.name ||
                                workspace?.name ||
                                "Workspace"
                            )}
                        </span>

                        <span class="dot">•</span>

                        <span>
                            ${escapeHtml(
                                selectedWorkspace?.role ||
                                workspace?.role ||
                                "user"
                            )}
                        </span>
                    </div>
                </div>

                <div class="inventory-topbar-right">
                    <div
                        class="inventory-switcher"
                        id="workspaceSwitcher"
                    >
                        <button
                            class="inventory-switcher-btn"
                            type="button"
                            id="workspaceSwitcherBtn"
                        >
                            <span class="box">🏢</span>

                            <span id="workspaceSwitcherLabel">
                                ${escapeHtml(
                                    selectedWorkspace?.name ||
                                    "Workspace"
                                )}
                            </span>

                            <span class="chev">▾</span>
                        </button>

                        <div
                            class="inventory-switcher-menu"
                            id="workspaceSwitcherMenu"
                        >
                            <div class="menu-title">
                                Workspace
                            </div>

                            <div
                                class="menu-list"
                                id="workspaceSwitcherList"
                            ></div>

                            <button
                                class="menu-create"
                                type="button"
                                id="workspaceCreateBtn"
                            >
                                ＋ Create Workspace
                            </button>
                        </div>
                    </div>

                    <div
                        class="inventory-switcher"
                        id="inventorySwitcher"
                    >
                        <button
                            class="inventory-switcher-btn"
                            type="button"
                            id="inventorySwitcherBtn"
                        >
                            <span class="box">📦</span>

                            <span id="inventorySwitcherLabel">
                                ${escapeHtml(
                                    selectedInventoryText(
                                        state.workspaceInventories,
                                        state.selectedIds
                                    )
                                )}
                            </span>

                            <span class="chev">▾</span>
                        </button>

                        <div
                            class="inventory-switcher-menu"
                            id="inventorySwitcherMenu"
                        >
                            <div class="menu-title">
                                Inventory
                            </div>

                            <div
                                class="menu-list"
                                id="inventorySwitcherList"
                            ></div>

                            <button
                                class="menu-create"
                                type="button"
                                id="inventoryCreateBtn"
                            >
                                ＋ Create Inventory
                            </button>
                        </div>
                    </div>

                    <button
                        class="inventory-plan-pill inventory-plan-${escapeHtml(planKeyClass(billingStatus?.plan_key))}${billingStatus && !billingStatus.plan_selected ? " inventory-plan-required" : ""}"
                        type="button"
                        id="inventoryPlanButton"
                        title="${escapeHtml(planPillTitle(billingStatus))}"
                    >
                        <span class="plan-dot">●</span>
                        <span id="inventoryPlanLabel">
                            ${escapeHtml(planPillText(billingStatus))}
                        </span>
                    </button>

                    <button
                        class="topbar-settings"
                        type="button"
                        onclick="window.location.href='settings.html'"
                    >
                        ⚙
                    </button>
                </div>
            </div>
        `;

        const workspaceSwitcher =
            document.getElementById(
                "workspaceSwitcher"
            );

        const workspaceBtn =
            document.getElementById(
                "workspaceSwitcherBtn"
            );

        const workspaceList =
            document.getElementById(
                "workspaceSwitcherList"
            );

        const workspaceCreateBtn =
            document.getElementById(
                "workspaceCreateBtn"
            );

        const inventorySwitcher =
            document.getElementById(
                "inventorySwitcher"
            );

        const inventoryBtn =
            document.getElementById(
                "inventorySwitcherBtn"
            );

        const inventoryList =
            document.getElementById(
                "inventorySwitcherList"
            );

        const inventoryLabel =
            document.getElementById(
                "inventorySwitcherLabel"
            );

        const inventoryCreateBtn =
            document.getElementById(
                "inventoryCreateBtn"
            );

        const planButton =
            document.getElementById(
                "inventoryPlanButton"
            );

        function closeMenus(except){
            if(except !== "workspace"){
                workspaceSwitcher
                    .classList
                    .remove("open");
            }

            if(except !== "inventory"){
                inventorySwitcher
                    .classList
                    .remove("open");
            }
        }

        function updateInventoryLabel(){
            inventoryLabel.textContent =
                selectedInventoryText(
                    state.workspaceInventories,
                    state.selectedIds
                );
        }

        function dispatchSelection(){
            window.dispatchEvent(
                new CustomEvent(
                    "inventory-selection-changed",
                    {
                        detail:{
                            selectedIds:
                                state.selectedIds,

                            workspaceId:
                                state.selectedWorkspaceId
                        }
                    }
                )
            );
        }

        function renderWorkspaceList(){
            workspaceList.innerHTML = "";

            state.groups.forEach(group=>{
                const row =
                    document.createElement(
                        "button"
                    );

                row.type = "button";
                row.className =
                    "inventory-menu-row";

                row.innerHTML = `
                    <div>
                        <div class="inv-name">
                            ${escapeHtml(group.name)}
                        </div>

                        <div class="inv-meta">
                            ${escapeHtml(group.role)}
                            •
                            ${group.inventories.length}
                            inventor${group.inventories.length === 1 ? "y" : "ies"}
                        </div>
                    </div>
                `;

                if(
                    String(group.id) ===
                    String(
                        state.selectedWorkspaceId
                    )
                ){
                    row.classList.add(
                        "active"
                    );
                }

                row.addEventListener(
                    "click",
                    async function(){
                        saveSelectedWorkspaceId(
                            group.id
                        );

                        const invs =
                            inventories.filter(
                                inv =>
                                    String(
                                        inv.workspace_id
                                    ) ===
                                    String(group.id)
                            );

                        const defaultInv =
                            invs.find(
                                inv =>
                                    inv.is_default
                            ) ||
                            invs[0];

                        saveSelectedIds(
                            defaultInv
                                ? [
                                    String(
                                        defaultInv.id
                                    )
                                ]
                                : []
                        );

                        closeMenus();

                        await init();
                        dispatchSelection();
                    }
                );

                workspaceList.appendChild(
                    row
                );
            });
        }

        function renderInventoryList(){
            inventoryList.innerHTML = "";

            if(
                state.workspaceInventories
                    .length > 1
            ){
                const allRow =
                    document.createElement(
                        "label"
                    );

                allRow.className =
                    "inventory-menu-row";

                const allChecked =
                    state.selectedIds.length ===
                    state.workspaceInventories
                        .length;

                allRow.innerHTML = `
                    <input
                        type="checkbox"
                        ${allChecked ? "checked" : ""}
                    >

                    <div>
                        <div class="inv-name">
                            All Inventories
                        </div>

                        <div class="inv-meta">
                            View combined data only
                        </div>
                    </div>
                `;

                const allCheckbox =
                    allRow.querySelector(
                        "input"
                    );

                allCheckbox.addEventListener(
                    "change",
                    function(){
                        if(allCheckbox.checked){
                            state.selectedIds =
                                saveSelectedIds(
                                    state
                                        .workspaceInventories
                                        .map(
                                            inv =>
                                                String(
                                                    inv.id
                                                )
                                        )
                                );
                        }else{
                            const defaultInv =
                                state
                                    .workspaceInventories
                                    .find(
                                        inv =>
                                            inv.is_default
                                    ) ||
                                state
                                    .workspaceInventories[0];

                            state.selectedIds =
                                saveSelectedIds(
                                    defaultInv
                                        ? [
                                            String(
                                                defaultInv.id
                                            )
                                        ]
                                        : []
                                );
                        }

                        renderInventoryList();
                        updateInventoryLabel();
                        dispatchSelection();
                    }
                );

                inventoryList.appendChild(
                    allRow
                );
            }

            state.workspaceInventories
                .forEach(inv=>{
                    const id =
                        String(inv.id);

                    const row =
                        document.createElement(
                            "label"
                        );

                    row.className =
                        "inventory-menu-row";

                    row.innerHTML = `
                        <input
                            type="checkbox"
                            value="${escapeHtml(id)}"
                        >

                        <div>
                            <div class="inv-name">
                                ${escapeHtml(inv.name)}
                            </div>

                            <div class="inv-meta">
                                ${Number(inv.total_stock || 0)}
                                stock
                                ${inv.is_default ? " • Default" : ""}
                            </div>
                        </div>
                    `;

                    const checkbox =
                        row.querySelector(
                            "input"
                        );

                    checkbox.checked =
                        state.selectedIds
                            .includes(id);

                    checkbox.addEventListener(
                        "change",
                        function(){
                            if(checkbox.checked){
                                state.selectedIds
                                    .push(id);
                            }else{
                                state.selectedIds =
                                    state.selectedIds
                                        .filter(
                                            item =>
                                                item !== id
                                        );
                            }

                            if(
                                state.selectedIds
                                    .length === 0
                            ){
                                checkbox.checked =
                                    true;

                                state.selectedIds =
                                    [id];
                            }

                            state.selectedIds =
                                saveSelectedIds(
                                    state.selectedIds
                                );

                            renderInventoryList();
                            updateInventoryLabel();
                            dispatchSelection();
                        }
                    );

                    inventoryList.appendChild(
                        row
                    );
                });
        }

        workspaceBtn.addEventListener(
            "click",
            function(event){
                event.stopPropagation();

                const open =
                    workspaceSwitcher
                        .classList
                        .contains("open");

                closeMenus();

                if(!open){
                    workspaceSwitcher
                        .classList
                        .add("open");
                }
            }
        );

        inventoryBtn.addEventListener(
            "click",
            function(event){
                event.stopPropagation();

                const open =
                    inventorySwitcher
                        .classList
                        .contains("open");

                closeMenus();

                if(!open){
                    inventorySwitcher
                        .classList
                        .add("open");
                }
            }
        );

        workspaceCreateBtn
            .addEventListener(
                "click",
                createWorkspace
            );

        inventoryCreateBtn
            .addEventListener(
                "click",
                function(){
                    createInventory(
                        state.selectedWorkspaceId
                    );
                }
            );

        if(planButton){
            planButton.addEventListener(
                "click",
                function(){
                    window.location.href =
                        "billing.html";
                }
            );
        }

        document.addEventListener(
            "click",
            function(event){
                if(
                    !workspaceSwitcher
                        .contains(event.target) &&
                    !inventorySwitcher
                        .contains(event.target)
                ){
                    closeMenus();
                }
            }
        );

        renderWorkspaceList();
        renderInventoryList();
        updateInventoryLabel();

        return true;
    }

    function start(){
        patchApiRequests();

        if(
            document.readyState ===
            "loading"
        ){
            document.addEventListener(
                "DOMContentLoaded",
                function(){
                    init();
                },
                {
                    once:true
                }
            );
        }else{
            init();
        }
    }

    return {
        init,
        start,
        getSelectedIds,
        saveSelectedIds,
        getSelectedWorkspaceId,
        saveSelectedWorkspaceId,
        getHeaderValue,
        patchApiRequests
    };
})();

window.InventoryTopbar =
    InventoryTopbar;

InventoryTopbar.start();
