const InventoryTheme = (function(){
    const THEME_KEY = "inventoryos_theme";
    const VALID_THEMES = ["green", "purple", "blue", "gold", "red", "cyan"];

    function normaliseTheme(theme){
        theme = String(theme || "").toLowerCase().trim();
        return VALID_THEMES.includes(theme) ? theme : "green";
    }

    function apply(theme){
        const finalTheme = normaliseTheme(theme);
        localStorage.setItem(THEME_KEY, finalTheme);
        document.documentElement.setAttribute("data-theme", finalTheme);
        updateThemeControls(finalTheme);
        return finalTheme;
    }

    function current(){
        return normaliseTheme(localStorage.getItem(THEME_KEY) || "green");
    }

    function loadLocal(){
        apply(current());
    }

    function updateThemeControls(theme){
        document.querySelectorAll("[data-theme-choice]").forEach(button=>{
            button.classList.toggle("active", button.dataset.themeChoice === theme);
        });

        const select = document.getElementById("themeSelect");
        if(select){
            select.value = theme;
        }
    }

    async function loadFromAccount(){
        if(!window.InventoryAPI || !InventoryAPI.isLoggedIn()){
            loadLocal();
            return current();
        }

        try{
            const data = await InventoryAPI.request("/auth/theme");

            if(data && data.success && data.theme){
                return apply(data.theme);
            }
        }catch(error){
            console.warn("Could not load account theme", error);
        }

        loadLocal();
        return current();
    }

    async function save(theme){
        const finalTheme = apply(theme);

        if(window.InventoryAPI && InventoryAPI.isLoggedIn()){
            try{
                await InventoryAPI.request("/auth/theme", {
                    method:"POST",
                    body:JSON.stringify({ theme:finalTheme })
                });
            }catch(error){
                console.warn("Could not save account theme", error);
            }
        }

        return finalTheme;
    }

    function bind(){
        document.querySelectorAll("[data-theme-choice]").forEach(button=>{
            button.addEventListener("click", function(){
                save(button.dataset.themeChoice);
            });
        });

        const select = document.getElementById("themeSelect");
        if(select){
            select.addEventListener("change", function(){
                save(select.value);
            });
        }
    }

    return {
        apply,
        current,
        loadLocal,
        loadFromAccount,
        save,
        bind,
        validThemes:VALID_THEMES
    };
})();

InventoryTheme.loadLocal();

document.addEventListener("DOMContentLoaded", function(){
    InventoryTheme.bind();

    if(window.InventoryAPI && InventoryAPI.isLoggedIn()){
        InventoryTheme.loadFromAccount();
    }
});
