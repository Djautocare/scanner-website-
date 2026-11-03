const InventoryTheme = (function(){
    const THEME_KEY = "inventoryos_theme";
    const VALID_THEMES = ["green", "purple", "blue", "gold", "red", "cyan"];

    const APPEARANCE_KEY = 'inventoryos_appearance';
    let appliedAppearance=document.documentElement.getAttribute?.('data-appearance')||'';
    let appliedTheme=document.documentElement.getAttribute?.('data-theme')||'';
    function appearance(){ return localStorage.getItem(APPEARANCE_KEY)==='light'?'light':'dark'; }
    function setAppearance(value){
        const mode=value==='light'?'light':'dark';
        const changed=appliedAppearance!==mode;
        if(localStorage.getItem(APPEARANCE_KEY)!==mode)localStorage.setItem(APPEARANCE_KEY,mode);
        if(changed)document.documentElement.setAttribute('data-appearance',mode);
        if(changed)document.documentElement.style.colorScheme=mode;
        appliedAppearance=mode;
        document.querySelectorAll('[data-appearance-choice]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.appearanceChoice===mode)));
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content',mode==='light'?'#ffffff':'#080909');
        if(changed)window.dispatchEvent(new CustomEvent('inventoryos-appearance-changed',{detail:mode}));
        return mode;
    }

    function normaliseTheme(theme){
        theme = String(theme || "").toLowerCase().trim();
        return VALID_THEMES.includes(theme) ? theme : "green";
    }

    function apply(theme){
        const finalTheme = normaliseTheme(theme);
        const changed=appliedTheme!==finalTheme;
        if(localStorage.getItem(THEME_KEY)!==finalTheme)localStorage.setItem(THEME_KEY, finalTheme);
        if(changed)document.documentElement.setAttribute("data-theme", finalTheme);
        appliedTheme=finalTheme;
        updateThemeControls(finalTheme);
        if(changed)window.dispatchEvent(new CustomEvent('inventoryos-theme-changed',{detail:finalTheme}));
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
        updateThemeControls(current());
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

// Older screens use fixed colours. Correct their visible screen surfaces and
// low-contrast text in light mode, including dynamically inserted content.
// Printing, receipt artwork and barcode/QR output are deliberately excluded.
const InventoryThemeContrast = (function(){
 const clamp=x=>Math.max(0,Math.min(255,Number(x)||0));
 function rgba(value){const m=String(value).match(/^rgba?\(([^)]+)\)/);if(!m)return null;const a=m[1].split(/[,\s/]+/).filter(Boolean).map(Number);return a.length>=3?[clamp(a[0]),clamp(a[1]),clamp(a[2]),a[3]??1]:null;}
 function luminance(rgb){const c=rgb.slice(0,3).map(v=>{const x=v/255;return x<=.04045?x/12.92:Math.pow((x+.055)/1.055,2.4);});return c[0]*.2126+c[1]*.7152+c[2]*.0722;}
 function ratio(a,b){const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
 function blend(top,bottom){const a=top[3]??1;return top.slice(0,3).map((v,i)=>v*a+bottom[i]*(1-a));}
 function readable(fg,bg){const solid=blend(fg,bg);if(ratio(solid,bg)>=4.8)return solid;const dark=[18,14,24],light=[255,255,255],target=ratio(dark,bg)>ratio(light,bg)?dark:light;for(let n=1;n<=30;n++){const out=solid.map((v,i)=>Math.round(v+(target[i]-v)*n/30));if(ratio(out,bg)>=4.8)return out;}return target;}
 const skip='svg,canvas,img,video,iframe,.retail-receipt,.pos-qr,.label-preview,.barcode-preview,.print-area,[data-print-artwork],[data-theme-choice],.design-utilitybar,.ios-shell-sidebar,.dashboard-sidebar,.retail-sidebar,.practice-sidebar';
 const queue=new Set();let scheduled=false,observer;
 function clearMarks(root){if(root.nodeType!==1)return;for(const el of [root,...root.querySelectorAll('[data-light-surface],[data-contrast-ink],[data-light-ink]')]){if(el.hasAttribute('data-light-surface'))el.removeAttribute('data-light-surface');if(el.hasAttribute('data-light-ink'))el.removeAttribute('data-light-ink');if(el.hasAttribute('data-contrast-ink'))el.removeAttribute('data-contrast-ink');if(el.style.getPropertyValue('--ios-readable-ink'))el.style.removeProperty('--ios-readable-ink');}}
 function visible(el){if(el.closest('[hidden]'))return false;let parent=el.parentElement;while(parent){if(parent.tagName==='DETAILS'&&!parent.open&&!parent.querySelector('summary')?.contains(el))return false;parent=parent.parentElement;}return true;}
 function adapt(root){
  if(root.nodeType!==1||!root.isConnected||root.closest(skip)||!visible(root))return;
  clearMarks(root);
  const nodes=[root,...root.querySelectorAll('div,section,article,aside,header,footer,nav,main,details,dialog,form,fieldset,table,td,th,label,p,span,strong,small,h1,h2,h3,h4,h5,h6,a,li,button,summary,legend')].filter(el=>!el.closest(skip)&&visible(el));
  // Read styles together, then write surface corrections together. Interleaved
  // reads/writes forced a style recalculation for nearly every element.
  const surfaces=[];
  for(const el of nodes){if(el.matches('button,.button,.btn,.badge,.qty-badge,.retail-pill,.mfg-badge'))continue;const s=getComputedStyle(el),bg=rgba(s.backgroundColor),stops=s.backgroundImage.match(/rgba?\([^)]+\)/g)||[];if((bg&&bg[3]>.7&&luminance(bg)<.16)||stops.some(x=>{const c=rgba(x);return c&&c[3]>.75&&luminance(c)<.12;}))surfaces.push(el);}
  for(const el of surfaces)el.setAttribute('data-light-surface','');
  const styles=new WeakMap(),backgrounds=new WeakMap(),inks=[];
  function style(el){if(!styles.has(el)){const s=getComputedStyle(el);styles.set(el,{color:s.color,backgroundColor:s.backgroundColor,visibility:s.visibility,display:s.display});}return styles.get(el);}
  function background(el){if(backgrounds.has(el))return backgrounds.get(el);const c=rgba(style(el).backgroundColor)||[0,0,0,0],under=el.parentElement?background(el.parentElement):[248,247,244],out=blend(c,under);backgrounds.set(el,out);return out;}
  for(const el of nodes){if(![...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()))continue;const s=style(el),fg=rgba(s.color);if(!fg||s.visibility==='hidden'||s.display==='none')continue;const bg=background(el);if(ratio(blend(fg,bg),bg)>=4.5)continue;inks.push([el,'rgb('+readable(fg,bg).join(',')+')']);}
  for(const [el,ink]of inks){el.style.setProperty('--ios-readable-ink',ink);el.setAttribute('data-contrast-ink','');}
 }
 function observe(){observer?.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','hidden','open']});}
 function flush(){scheduled=false;observer?.disconnect();try{if(InventoryTheme.appearance()==='light'){const roots=[...queue].filter(el=>el.isConnected);for(const root of roots)if(!roots.some(other=>other!==root&&other.contains(root)))adapt(root);}}finally{queue.clear();observe();}}
 function schedule(root=document.body){if(InventoryTheme.appearance()!=='light'||!root)return;queue.add(root.nodeType===1?root:root.parentElement);if(!scheduled){scheduled=true;requestAnimationFrame(flush);}}
 function reset(){observer?.disconnect();if(document.body)clearMarks(document.body);queue.clear();schedule();observe();}
 window.addEventListener('inventoryos-appearance-changed',reset);window.addEventListener('inventoryos-theme-changed',reset);
 document.addEventListener('DOMContentLoaded',()=>{observer=new MutationObserver(records=>{for(const r of records){if(r.type==='attributes'){if(r.target!==document.body&&r.target!==document.documentElement)schedule(r.target);continue;}for(const n of r.addedNodes){if(n.nodeType===1)schedule(n);else if(n.nodeType===3&&n.textContent.trim())schedule(r.target);}}});observe();schedule();});
 return {luminance,ratio,blend,readable,rgba};
})();

;(function(){if(!location.pathname.includes("/retail/till/")){const s=document.createElement("script");s.src=new URL("pwa/install.js?v=1",document.baseURI).href;s.defer=true;document.head.append(s);}})();
