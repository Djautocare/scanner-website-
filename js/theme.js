const InventoryTheme = (function(){
    const THEME_KEY = "inventoryos_theme";
    const VALID_THEMES = ["green", "purple", "blue", "gold", "red", "cyan"];

    const APPEARANCE_KEY = 'inventoryos_appearance';
    function appearance(){ return localStorage.getItem(APPEARANCE_KEY)==='light'?'light':'dark'; }
    function setAppearance(value){
        const mode=value==='light'?'light':'dark';
        localStorage.setItem(APPEARANCE_KEY,mode);
        document.documentElement.setAttribute('data-appearance',mode);
        document.documentElement.style.colorScheme=mode;
        document.querySelectorAll('[data-appearance-choice]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.appearanceChoice===mode)));
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content',mode==='light'?'#ffffff':'#080909');
        window.dispatchEvent(new CustomEvent('inventoryos-appearance-changed',{detail:mode}));
        return mode;
    }

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
        setAppearance(appearance());
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
        appearance,
        setAppearance,
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


// The appearance choice applies across pages and open tabs on this browser.
document.addEventListener('click',event=>{const button=event.target.closest('[data-appearance-choice]');if(button){event.preventDefault();InventoryTheme.setAppearance(button.dataset.appearanceChoice);}});
window.addEventListener('storage',event=>{if(event.key==='inventoryos_appearance')InventoryTheme.setAppearance(InventoryTheme.appearance());if(event.key==='inventoryos_theme')InventoryTheme.apply(InventoryTheme.current());});

// Older screens contain fixed dark surfaces. Adapt those surfaces without
// changing their layout or their saved accent, image, barcode or print content.
(function(){
 let scheduled=false;
 function adapt(){scheduled=false;if(InventoryTheme.appearance()!=='light')return;
  document.querySelectorAll('body :is(div,section,article,aside,header,footer,nav,main,details,dialog,form,fieldset,table,td,th,label,p,span,strong,small,h1,h2,h3,h4)').forEach(el=>{
   if(el.closest('svg,canvas,.retail-receipt,[data-theme-choice],button,.badge,.qty-badge,.retail-pill,.counter-count'))return;
   const style=getComputedStyle(el),bg=style.backgroundColor.match(/[\d.]+/g),fg=style.color.match(/[\d.]+/g);
   if(bg&&Number(bg[3]??1)>.7&&bg.slice(0,3).every(x=>Number(x)<75))el.setAttribute('data-light-surface','');
   if(fg&&fg.slice(0,3).every(x=>Number(x)>=150))el.setAttribute('data-light-ink','');
  });
 }
 function schedule(){if(!scheduled&&InventoryTheme.appearance()==='light'){scheduled=true;requestAnimationFrame(adapt);}}
 window.addEventListener('inventoryos-appearance-changed',schedule);
 document.addEventListener('DOMContentLoaded',()=>{schedule();new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});});
})();

;(function(){if(!location.pathname.includes("/retail/till/")){const s=document.createElement("script");s.src=new URL("pwa/install.js?v=1",document.baseURI).href;s.defer=true;document.head.append(s);}})();
