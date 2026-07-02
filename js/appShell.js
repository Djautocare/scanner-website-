const InventoryOSAppShell = (function(){
    const PAGE_MAP = {
        "index.html":{
            key:"dashboard"
        },
        "":{
            key:"dashboard"
        },
        "add.html":{
            key:"add"
        },
        "remove.html":{
            key:"remove"
        },
        "refund.html":{
            key:"refund"
        },
        "search.html":{
            key:"search"
        },
        "move.html":{
            key:"move"
        },
        "boxes.html":{
            key:"boxes"
        },
        "barcodeprinting.html":{
            key:"barcode"
        },
        "dispatch-centre.html":{
            key:"dispatch"
        },
        "salestracker.html":{
            key:"sales"
        },
        "expenses.html":{
            key:"expenses"
        },
        "stale.html":{
            key:"stale"
        },
        "settings.html":{
            key:"settings"
        }
    };

    const NAV_GROUPS = [
        {
            label:"Workspace",
            items:[
                {
                    key:"dashboard",
                    href:"index.html",
                    icon:"⌂",
                    label:"Dashboard"
                },
                {
                    key:"add",
                    href:"add.html",
                    icon:"＋",
                    label:"Add stock"
                },
                {
                    key:"remove",
                    href:"remove.html",
                    icon:"−",
                    label:"Remove stock"
                },
                {
                    key:"refund",
                    href:"refund.html",
                    icon:"↶",
                    label:"Refunds"
                },
                {
                    key:"search",
                    href:"search.html",
                    icon:"⌕",
                    label:"Search stock"
                },
                {
                    key:"move",
                    href:"move.html",
                    icon:"↔",
                    label:"Move stock"
                },
                {
                    key:"boxes",
                    href:"boxes.html",
                    icon:"▦",
                    label:"Locations",
                    locationPlural:true
                }
            ]
        },
        {
            label:"Operations",
            items:[
                {
                    key:"barcode",
                    href:"barcodeprinting.html",
                    icon:"▥",
                    label:"Barcode printing"
                },
                {
                    key:"dispatch",
                    href:"dispatch-centre.html",
                    icon:"▣",
                    label:"Dispatch Centre"
                }
            ]
        },
        {
            label:"Reports",
            items:[
                {
                    key:"sales",
                    href:"salestracker.html",
                    icon:"⌁",
                    label:"Sales tracker"
                },
                {
                    key:"expenses",
                    href:"expenses.html",
                    icon:"£",
                    label:"Expenses"
                },
                {
                    key:"stale",
                    href:"stale.html",
                    icon:"◷",
                    label:"Stale stock"
                },
                {
                    key:"settings",
                    href:"settings.html",
                    icon:"⚙",
                    label:"Settings"
                }
            ]
        }
    ];

    function currentRouteName(){
        const path =
            decodeURIComponent(
                window.location.pathname ||
                ""
            );

        const part =
            path
                .split("/")
                .filter(Boolean)
                .pop() ||
            "index";

        return part
            .toLowerCase()
            .replace(
                /\.html?$/,
                ""
            );
    }

    function currentPageKey(){
        const route =
            currentRouteName();

        const routeAliases = {
            "index":"dashboard",
            "dashboard":"dashboard",

            "add":"add",
            "add-stock":"add",

            "remove":"remove",
            "remove-stock":"remove",

            "refund":"refund",
            "refunds":"refund",

            "search":"search",
            "scanner-search":"search",
            "search-stock":"search",

            "move":"move",
            "move-stock":"move",

            "boxes":"boxes",
            "box-locations":"boxes",
            "locations":"boxes",

            "barcodeprinting":"barcode",
            "barcode-printing":"barcode",

            "dispatch-centre":"dispatch",
            "dispatch-center":"dispatch",
            "dispatch":"dispatch",

            "salestracker":"sales",
            "sales-tracker":"sales",

            "expenses":"expenses",

            "stale":"stale",
            "stale-stock":"stale",

            "settings":"settings"
        };

        if(routeAliases[route]){
            return routeAliases[route];
        }

        const htmlName =
            route + ".html";

        return (
            PAGE_MAP[htmlName] ||
            PAGE_MAP["index.html"]
        ).key;
    }

    function escapeHtml(value){
        return String(value || "")
            .replaceAll("&","&amp;")
            .replaceAll("<","&lt;")
            .replaceAll(">","&gt;")
            .replaceAll('"',"&quot;")
            .replaceAll("'","&#039;");
    }

    function getUser(){
        try{
            if(
                window.InventoryAPI &&
                typeof InventoryAPI.getUser ===
                    "function"
            ){
                return (
                    InventoryAPI.getUser() ||
                    {}
                );
            }
        }catch(error){
            console.warn(
                "Could not read InventoryOS user:",
                error
            );
        }

        return {};
    }

    function userName(user){
        return (
            user.name ||
            user.full_name ||
            user.display_name ||
            user.email ||
            "InventoryOS User"
        );
    }

    function initials(value){
        const clean =
            String(value || "")
                .trim();

        if(!clean){
            return "OS";
        }

        const parts =
            clean
                .split(/\s+/)
                .filter(Boolean);

        if(parts.length >= 2){
            return (
                parts[0][0] +
                parts[parts.length - 1][0]
            ).toUpperCase();
        }

        return clean
            .slice(0,2)
            .toUpperCase();
    }

    function buildNavigation(activeKey){
        return NAV_GROUPS
            .map(group => {
                const links =
                    group.items
                        .map(item => {
                            const active =
                                item.key ===
                                activeKey;

                            const labelAttributes =
                                item.locationPlural
                                    ? " data-location-plural"
                                    : "";

                            return `
                                <a
                                    class="ios-shell-nav-link${active ? " active" : ""}"
                                    href="${escapeHtml(item.href)}"
                                    ${active ? 'aria-current="page"' : ""}
                                >
                                    <span
                                        class="ios-shell-nav-icon"
                                        aria-hidden="true"
                                    >
                                        ${escapeHtml(item.icon)}
                                    </span>

                                    <span${labelAttributes}>
                                        ${escapeHtml(item.label)}
                                    </span>
                                </a>
                            `;
                        })
                        .join("");

                return `
                    <div class="ios-shell-nav-label">
                        ${escapeHtml(group.label)}
                    </div>

                    <nav
                        class="ios-shell-nav"
                        aria-label="${escapeHtml(group.label)}"
                    >
                        ${links}
                    </nav>
                `;
            })
            .join("");
    }

    function findPage(){
        return (
            document.querySelector(
                "body > .page"
            ) ||
            document.querySelector(
                ".page"
            )
        );
    }

    function findOuterPanel(page){
        if(!page){
            return null;
        }

        for(const child of page.children){
            if(
                child.classList &&
                child.classList.contains(
                    "panel"
                )
            ){
                return child;
            }
        }

        return (
            page.querySelector(".panel") ||
            page
        );
    }

    function directChildBySelector(
        parent,
        selector
    ){
        if(!parent){
            return null;
        }

        for(const child of parent.children){
            if(child.matches(selector)){
                return child;
            }
        }

        return null;
    }

    function findTitleAndSubtitle(panel){
        let title =
            directChildBySelector(
                panel,
                "h1"
            ) ||
            panel.querySelector("h1");

        let subtitle = null;

        if(title){
            let candidate =
                title.nextElementSibling;

            if(
                candidate &&
                candidate.classList
                    .contains("subtitle")
            ){
                subtitle = candidate;
            }
        }

        if(!subtitle){
            subtitle =
                directChildBySelector(
                    panel,
                    ".subtitle"
                ) ||
                panel.querySelector(
                    ".subtitle"
                );
        }

        return {
            title,
            subtitle
        };
    }

    function shellMarkup(
        activeKey,
        user
    ){
        const name =
            userName(user);

        const avatar =
            initials(name);

        return `
            <div
                class="ios-shell-overlay"
                id="iosShellOverlay"
            ></div>

            <div class="ios-shell-app">
                <aside
                    class="ios-shell-sidebar"
                    id="iosShellSidebar"
                >
                    <a
                        class="ios-shell-brand"
                        href="index.html"
                        aria-label="InventoryOS dashboard"
                    >
                        <span
                            class="ios-shell-brand-mark"
                            aria-hidden="true"
                        >
                            <span></span>
                            <span></span>
                            <span></span>
                        </span>

                        <span class="ios-shell-brand-name">
                            Inventory<span>OS</span>
                        </span>
                    </a>

                    <div class="ios-shell-sidebar-scroll">
                        ${buildNavigation(activeKey)}
                    </div>

                    <div class="ios-shell-sidebar-footer">
                        <div class="ios-shell-user">
                            <div class="ios-shell-avatar">
                                ${escapeHtml(avatar)}
                            </div>

                            <div class="ios-shell-user-copy">
                                <strong>
                                    ${escapeHtml(name)}
                                </strong>

                                <span>
                                    ${escapeHtml(user.email || "Signed in")}
                                </span>
                            </div>

                            <button
                                class="ios-shell-logout"
                                id="iosShellLogout"
                                type="button"
                                title="Log out"
                                aria-label="Log out"
                            >
                                ↪
                            </button>
                        </div>
                    </div>
                </aside>

                <main class="ios-shell-main">
                    <div class="ios-shell-frame">
                        <header class="ios-shell-header">
                            <button
                                class="ios-shell-mobile-menu"
                                id="iosShellMenuButton"
                                type="button"
                                aria-label="Open navigation"
                                aria-expanded="false"
                            >
                                ☰
                            </button>

                            <div
                                class="ios-shell-heading"
                                id="iosShellHeading"
                            ></div>

                            <div class="ios-shell-header-tools">
                                <div
                                    class="ios-shell-topbar-host"
                                    id="iosShellTopbarHost"
                                ></div>

                                <div class="ios-shell-header-avatar">
                                    ${escapeHtml(avatar)}
                                </div>
                            </div>
                        </header>

                        <div
                            class="ios-shell-content"
                            id="iosShellContent"
                        ></div>
                    </div>
                </main>
            </div>
        `;
    }

    function openMenu(){
        document.body.classList.add(
            "ios-shell-menu-open"
        );

        document
            .getElementById(
                "iosShellOverlay"
            )
            ?.classList
            .add("show");

        document
            .getElementById(
                "iosShellMenuButton"
            )
            ?.setAttribute(
                "aria-expanded",
                "true"
            );
    }

    function closeMenu(){
        document.body.classList.remove(
            "ios-shell-menu-open"
        );

        document
            .getElementById(
                "iosShellOverlay"
            )
            ?.classList
            .remove("show");

        document
            .getElementById(
                "iosShellMenuButton"
            )
            ?.setAttribute(
                "aria-expanded",
                "false"
            );
    }

    function bindShellEvents(){
        document
            .getElementById(
                "iosShellMenuButton"
            )
            ?.addEventListener(
                "click",
                function(){
                    if(
                        document.body
                            .classList
                            .contains(
                                "ios-shell-menu-open"
                            )
                    ){
                        closeMenu();
                    }else{
                        openMenu();
                    }
                }
            );

        document
            .getElementById(
                "iosShellOverlay"
            )
            ?.addEventListener(
                "click",
                closeMenu
            );

        document
            .querySelectorAll(
                ".ios-shell-nav-link"
            )
            .forEach(link => {
                link.addEventListener(
                    "click",
                    closeMenu
                );
            });

        document
            .getElementById(
                "iosShellLogout"
            )
            ?.addEventListener(
                "click",
                function(){
                    if(
                        window.InventoryAPI &&
                        typeof InventoryAPI.logout ===
                            "function"
                    ){
                        InventoryAPI.logout();
                    }else{
                        window.location.href =
                            "login.html";
                    }
                }
            );

        window.addEventListener(
            "resize",
            function(){
                if(
                    window.innerWidth >
                    900
                ){
                    closeMenu();
                }
            }
        );
    }

    function ensureTopbar(){
        const host =
            document.getElementById(
                "iosShellTopbarHost"
            );

        if(!host){
            return;
        }

        let topbar =
            document.getElementById(
                "inventory-topbar"
            );

        let created = false;

        if(!topbar){
            topbar =
                document.createElement(
                    "div"
                );

            topbar.id =
                "inventory-topbar";

            created = true;
        }

        host.appendChild(topbar);

        const needsInitialise =
            created ||
            !topbar.innerHTML.trim();

        if(
            needsInitialise &&
            window.InventoryTopbar &&
            typeof InventoryTopbar.init ===
                "function"
        ){
            Promise.resolve()
                .then(
                    function(){
                        return InventoryTopbar.init(
                            "inventory-topbar"
                        );
                    }
                )
                .catch(
                    function(error){
                        console.warn(
                            "Could not initialise InventoryOS topbar:",
                            error
                        );
                    }
                );
        }
    }

    function initialise(){
        if(
            document.body.classList
                .contains(
                    "inventoryos-shell-active"
                )
        ){
            return;
        }

        const page =
            findPage();

        if(!page){
            return;
        }

        const panel =
            findOuterPanel(page);

        if(!panel){
            return;
        }

        const activeKey =
            currentPageKey();

        const user =
            getUser();

        const titleParts =
            findTitleAndSubtitle(
                panel
            );

        const mount =
            document.createElement(
                "div"
            );

        mount.id =
            "iosShellMount";

        mount.innerHTML =
            shellMarkup(
                activeKey,
                user
            );

        document.body.insertBefore(
            mount,
            page
        );

        document.body.classList.add(
            "inventoryos-shell-active"
        );

        document.body.dataset.iosPage =
            activeKey;

        const heading =
            document.getElementById(
                "iosShellHeading"
            );

        if(
            titleParts.title &&
            heading
        ){
            heading.appendChild(
                titleParts.title
            );
        }

        if(
            titleParts.subtitle &&
            heading
        ){
            heading.appendChild(
                titleParts.subtitle
            );
        }

        document
            .getElementById(
                "iosShellContent"
            )
            ?.appendChild(page);

        ensureTopbar();
        bindShellEvents();

        if(
            window.InventoryWorkspace &&
            typeof InventoryWorkspace.applyLabels ===
                "function"
        ){
            InventoryWorkspace
                .applyLabels();
        }

        window.dispatchEvent(
            new CustomEvent(
                "inventoryos-shell-ready",
                {
                    detail:{
                        page:activeKey
                    }
                }
            )
        );
    }

    function start(){
        if(
            document.readyState ===
            "loading"
        ){
            document.addEventListener(
                "DOMContentLoaded",
                initialise,
                {
                    once:true
                }
            );
        }else{
            initialise();
        }
    }

    return {
        start,
        initialise,
        openMenu,
        closeMenu,
        currentPageKey
    };
})();

window.InventoryOSAppShell =
    InventoryOSAppShell;

InventoryOSAppShell.start();
