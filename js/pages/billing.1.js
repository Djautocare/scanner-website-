
if(!InventoryAPI.requireLogin()){
    throw new Error("Login required");
}

let currentStatus = null;
let planRequestPending = false;

function billingRequest(path,options={}){
    const workspace = localStorage.getItem("inventoryos_selected_workspace_id");
    return InventoryAPI.request(path,{...options,headers:{...(options.headers || {}),...(workspace ? {"X-Workspace-Id":workspace} : {})}});
}

function money(value){
    return Number(value || 0).toFixed(2).replace(".00","");
}

function setMessage(text){
    document.getElementById("message").innerText = text || "";
}

function canAccessDashboard(){
    return Boolean(
        currentStatus &&
        currentStatus.billing &&
        currentStatus.billing.plan_selected &&
        currentStatus.billing.access_allowed
    );
}

function updateDashboardButtons(){
    const allowed = canAccessDashboard();
    const topButton = document.getElementById("dashboardTopButton");
    const footerButton = document.getElementById("dashboardFooterButton");

    if(topButton){
        topButton.disabled = !allowed;
    }

    if(footerButton){
        footerButton.classList.toggle("disabled", !allowed);
    }
}

function goDashboard(){
    if(planRequestPending) return;
    if(!canAccessDashboard()){
        setMessage("Choose a plan first. Once a plan is selected, your dashboard will unlock.");
        return;
    }

    window.location.href = "index.html";
}

function planDescription(key){
    if(key === "free") return "For trying InventoryOS, tracking stock and seeing your first sales numbers.";
    if(key === "starter") return "For casual sellers ready to add receipts, labels and dispatch workflows.";
    if(key === "pro") return "For serious resellers managing more stock, labels and multiple inventories.";
    if(key === "business") return "For teams and small manufacturers managing shared inventory, materials and production.";
    return "InventoryOS plan.";
}

function buttonLabel(plan){
    if(plan.key === "business" && currentStatus?.billing?.is_business_trial) return "Subscribe to Business";
    if(
        currentStatus &&
        currentStatus.billing &&
        currentStatus.billing.plan_selected &&
        currentStatus.billing.plan_key === plan.key
    ){
        return "Current Plan";
    }

    if(plan.key === "free") return "Start Free";
    return "Choose " + plan.name;
}

function renderStatus(data){
    currentStatus = data;

    const billing = data.billing || {};
    const title = document.getElementById("statusTitle");
    const text = document.getElementById("statusText");
    const badge = document.getElementById("statusBadge");

    title.innerText = (billing.plan_name || "Plan") + " workspace";
    badge.innerText = (billing.billing_status || "unknown").toUpperCase();

    let line = "Current workspace: " + ((data.workspace && data.workspace.name) || "Workspace") + ".";

    if(!billing.is_business_trial && billing.trial_ends_at && billing.billing_status === "trialing"){
        line += " Trial ends: " + new Date(billing.trial_ends_at).toLocaleString() + ".";
    }

    if(billing.subscription_current_period_end){
        line += " Current period ends: " + new Date(billing.subscription_current_period_end).toLocaleString() + ".";
    }

    if(billing.subscription_cancel_at_period_end){
        line += " This subscription is set to cancel at the end of the current period.";
    }

    if(!billing.plan_selected){
        title.innerText = "Choose your InventoryOS plan";
        badge.innerText = "PLAN REQUIRED";
        line = "Select Free, Starter, Pro or Business to unlock your dashboard.";
    }else if(!billing.access_allowed){
        badge.innerText = (billing.billing_status || "locked").toUpperCase();
        line += " Choose or update a plan to continue using InventoryOS.";
    }

    text.innerText = line;
    updateDashboardButtons();
    InventoryBusinessTrial.billing(data,loadBilling);
}

function renderPlans(plans){
    const grid = document.getElementById("plansGrid");
    grid.innerHTML = "";

    plans.forEach(plan=>{
        const card = document.createElement("div");
        card.className = "plan" + (plan.key === "pro" ? " popular" : "");

        const features = (plan.features || []).map(feature=>
            `<div class="feature"><span class="tick">✓</span><span>${feature}</span></div>`
        ).join("");

        card.innerHTML = `
            ${plan.key === "pro" ? '<div class="popular-tag">MOST POPULAR</div>' : ''}
            <h2>${plan.name}</h2>
            <div class="plan-desc">${planDescription(plan.key)}</div>
            <div class="price">£${money(plan.monthly_price)} <span>/month</span></div>
            <div class="rule"></div>
            <div class="features">${features}</div>
            <button class="${plan.key === "pro" ? "primary" : "secondary"}" data-plan="${plan.key}">
                ${buttonLabel(plan)}
            </button>
            ${plan.key === "business" ? InventoryBusinessTrial.requestMarkup(currentStatus) : ""}
        `;

        const button = card.querySelector("button");

        if(
            currentStatus &&
            currentStatus.billing &&
            currentStatus.billing.plan_selected &&
            currentStatus.billing.plan_key === plan.key &&
            !(plan.key === "business" && currentStatus.billing.is_business_trial)
        ){
            button.disabled = true;
        }

        button.addEventListener("click",()=>choosePlan(plan.key));
        grid.appendChild(card);
    });
}

async function loadBilling(){
    setMessage("Loading billing status...");

    try{
        const data = await billingRequest("/billing/status");

        if(!data.success){
            setMessage(data.error || "Could not load billing status.");
            return;
        }

        renderStatus(data);
        renderPlans(data.plans || []);

        if(data.billing && !data.billing.plan_selected){
            setMessage("Choose a plan to unlock your InventoryOS dashboard.");
        }else if(data.billing && !data.billing.access_allowed){
            setMessage("Your current billing status is locked. Choose or update a plan to continue.");
        }else{
            setMessage("Plan active. You can open the dashboard.");
        }

    }catch(error){
        console.error(error);
        setMessage("Could not load billing status: " + error.message);
    }
}

async function choosePlan(plan){
    if(!plan || planRequestPending) return;
    let leavingBilling = false;
    const firstPlanChoice = currentStatus?.billing?.plan_selected === false;

    if(plan === "free" && !firstPlanChoice){
        if(!confirm("Switch this workspace to the Free plan? Paid features may be locked.")){
            return;
        }
    }

    planRequestPending = true;
    document.querySelectorAll("[data-plan]").forEach(button=>{button.disabled=true;});
    setMessage("Starting " + plan + " plan...");

    try{
        const data = await billingRequest("/billing/create-checkout-session",{
            method:"POST",
            body:JSON.stringify({plan})
        });

        if(!data.success){
            setMessage(data.error || "Could not start checkout.");
            return;
        }

        if(data.free_selected){
            if(firstPlanChoice && window.InventoryGettingStarted?.begin()){
                leavingBilling = true;
                setMessage("Free selected. Opening your guided practice workspace...");
                return;
            }
            setMessage("Free plan selected. Unlocking dashboard...");
            await loadBilling();
            return;
        }

        if(data.url){
            leavingBilling = true;
            window.location.href = data.url;
            return;
        }

        setMessage("No checkout URL was returned.");

    }catch(error){
        console.error(error);
        setMessage("Checkout error: " + error.message);
    }finally{
        if(!leavingBilling){
            planRequestPending = false;
            if(currentStatus) renderPlans(currentStatus.plans || []);
        }
    }
}

async function openPortal(){
    setMessage("Opening billing portal...");

    try{
        const data = await billingRequest("/billing/create-portal-session",{
            method:"POST",
            body:JSON.stringify({})
        });

        if(!data.success){
            setMessage(data.error || "Could not open billing portal.");
            return;
        }

        window.location.href = data.url;

    }catch(error){
        console.error(error);
        setMessage("Portal error: " + error.message);
    }
}

loadBilling();
