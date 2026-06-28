const InventoryWorkspace = (function(){
    const CACHE_KEY = "inventoryos_workspace";

    async function load(){
        const data = await InventoryAPI.request("/workspaces/current");

        if(data.success && data.workspace){
            localStorage.setItem(CACHE_KEY, JSON.stringify(data.workspace));
            return data.workspace;
        }

        return getCached();
    }

    function getCached(){
        try{
            return JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
        }catch(error){
            return null;
        }
    }

    function getSettings(){
        const workspace = getCached();
        return workspace?.settings || {
            location_label_singular:"Box",
            location_label_plural:"Boxes",
            location_icon:"📦",
            auto_create_locations:true,
            show_auto_create_location_option:true
        };
    }

    function singular(){
        return getSettings().location_label_singular || "Box";
    }

    function plural(){
        return getSettings().location_label_plural || "Boxes";
    }

    function icon(){
        return getSettings().location_icon || "📦";
    }

    function applyLabels(){
        const settings = getSettings();

        document.querySelectorAll("[data-location-singular]").forEach(el=>{
            el.textContent = settings.location_label_singular || "Box";
        });

        document.querySelectorAll("[data-location-plural]").forEach(el=>{
            el.textContent = settings.location_label_plural || "Boxes";
        });

        document.querySelectorAll("[data-location-icon]").forEach(el=>{
            el.textContent = settings.location_icon || "📦";
        });
    }

    async function init(){
        await load();
        applyLabels();
    }

    return {
        load,
        init,
        getCached,
        getSettings,
        singular,
        plural,
        icon,
        applyLabels
    };
})();
