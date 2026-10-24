
if(!InventoryAPI.requireLogin()){
    throw new Error("Login required");
}

InventoryTheme.loadFromAccount().then(function(theme){
    const result = document.getElementById("themeResult");

    if(result){
        result.innerText = "Current theme: " + theme;
    }
});

document.querySelectorAll("[data-theme-choice]").forEach(button=>{
    button.addEventListener("click", async function(){
        const theme = button.dataset.themeChoice;
        await InventoryTheme.save(theme);

        const result = document.getElementById("themeResult");

        if(result){
            result.className = "result success";
            result.innerText = "Theme updated ✅";
        }
    });
});

function showLoading(){
    document.getElementById("loadingOverlay").style.display = "flex";
}

function hideLoading(){
    document.getElementById("loadingOverlay").style.display = "none";
}

function setResult(text, type){
    const el = document.getElementById("result");
    el.className = "result " + (type || "");
    el.innerText = text || "";
}

function setPasswordResult(text, type){
    const el = document.getElementById("passwordResult");
    el.className = "result " + (type || "");
    el.innerText = text || "";
}

function safeText(value){
    return String(
        value === undefined ||
        value === null
            ? ""
            : value
    );
}

async function openSettingsBilling(){
    const button = document.getElementById("settingsManageBilling");
    const result = document.getElementById("billingSettingsResult");
    button.disabled = true;
    result.className = "result";
    result.innerText = "Opening Stripe billing...";
    try{
        const data = await InventoryAPI.request("/billing/create-portal-session",{method:"POST",body:JSON.stringify({})});
        if(data.success && data.url){
            window.location.href = data.url;
            return;
        }
        if(String(data.error || "").toLowerCase().includes("no stripe customer")){
            window.location.href = "billing.html";
            return;
        }
        result.className = "result error";
        result.innerText = data.error || "Could not open Stripe billing. Try the Billing & Plans page.";
    }catch(error){
        result.className = "result error";
        result.innerText = error.message || "Could not open Stripe billing. Try the Billing & Plans page.";
    }finally{
        button.disabled = false;
    }
}

function userDisplayName(user){
    return (
        user?.name ||
        user?.full_name ||
        user?.display_name ||
        user?.email ||
        "InventoryOS User"
    );
}

function userInitials(value){
    const clean = safeText(value).trim();

    if(!clean){
        return "OS";
    }

    const parts = clean
        .split(/\s+/)
        .filter(Boolean);

    if(parts.length >= 2){
        return (
            parts[0][0] +
            parts[parts.length - 1][0]
        ).toUpperCase();
    }

    return clean.slice(0,2).toUpperCase();
}

function applyProfile(user){
    const safeUser = user || {};
    const name = userDisplayName(safeUser);

    document.getElementById("profileName").innerText =
        name;

    document.getElementById("profileEmail").innerText =
        safeUser.email || "Signed in";

    const icon = document.getElementById("profileIcon");

    if(icon){
        icon.innerText = userInitials(name);
    }
}

async function loadProfile(){
    try{
        const user = InventoryAPI.getUser ? InventoryAPI.getUser() : null;

        if(user){
            applyProfile(user);
        }

        const data = await InventoryAPI.me();

        if(data.success && data.user){
            if(
                typeof InventoryAPI.saveSession === "function" &&
                typeof InventoryAPI.getToken === "function"
            ){
                const mergedUser = {
                    ...(InventoryAPI.getUser ? InventoryAPI.getUser() || {} : {}),
                    ...data.user
                };

                InventoryAPI.saveSession(
                    InventoryAPI.getToken(),
                    mergedUser
                );
            }

            applyProfile(
                {
                    ...(InventoryAPI.getUser ? InventoryAPI.getUser() || {} : {}),
                    ...data.user
                }
            );
        }
    }catch(error){
        console.error(error);
    }
}

function formatStorageBytes(bytes){
    const value = Math.max(0, Number(bytes || 0));
    const mb = 1024 * 1024;
    const gb = 1024 * mb;

    if(value >= gb){
        return (value / gb).toFixed(value >= 10 * gb ? 0 : 1) + " GB";
    }

    if(value >= mb){
        return (value / mb).toFixed(value >= 10 * mb ? 0 : 1) + " MB";
    }

    if(value >= 1024){
        return (value / 1024).toFixed(1) + " KB";
    }

    return value + " bytes";
}

async function loadStorageStatus(){
    const panel = document.getElementById("profileStorage");
    const statusText = document.getElementById("storageStatus");

    try{
        if(statusText){
            statusText.innerText = "Checking your workspace storage...";
        }

        const data = await InventoryAPI.request(
            "/billing/storage-status?_t=" + Date.now()
        );

        if(!data.success || !data.storage){
            throw new Error(data.error || "Could not load storage usage");
        }

        const storage = data.storage;
        const percentage = Math.max(
            0,
            Math.min(100, Number(storage.percentage || 0))
        );

        document.getElementById("storagePlan").innerText =
            (storage.plan_name || "Free") + " Plan";

        document.getElementById("storagePercentage").innerText =
            percentage.toFixed(percentage >= 10 ? 0 : 1) + "% used";

        document.getElementById("storageUsedText").innerText =
            formatStorageBytes(storage.used_bytes) + " used";

        document.getElementById("storageLimitText").innerText =
            formatStorageBytes(storage.limit_bytes) + " included";

        const fill = document.getElementById("storageProgressFill");
        if(fill){
            fill.style.width = percentage + "%";
        }

        const progress = document.getElementById("storageProgress");
        if(progress){
            progress.setAttribute("aria-valuenow", String(Math.round(percentage)));
        }

        if(panel){
            panel.classList.remove(
                "storage-green",
                "storage-amber",
                "storage-red"
            );

            panel.classList.add(
                percentage >= 90
                    ? "storage-red"
                    : percentage >= 70
                        ? "storage-amber"
                        : "storage-green"
            );
        }

        if(statusText){
            statusText.innerText = storage.message ||
                (percentage >= 90
                    ? "Storage almost full — upgrade or remove files"
                    : percentage >= 70
                        ? "You’re approaching your storage limit"
                        : "Plenty of storage available");
        }
    }catch(error){
        console.error("Storage status error:", error);

        if(statusText){
            statusText.innerText = "Storage usage could not be loaded.";
        }
    }
}

async function changePassword(){
    const currentPassword = document.getElementById("currentPassword").value;
    const newPassword = document.getElementById("newPassword").value;
    const confirmPassword = document.getElementById("confirmPassword").value;

    if(!currentPassword || !newPassword || !confirmPassword){
        alert("Fill in all password fields.");
        return;
    }

    if(newPassword.length < 8){
        alert("New password must be at least 8 characters.");
        return;
    }

    if(newPassword !== confirmPassword){
        alert("New passwords do not match.");
        return;
    }

    showLoading();
    setPasswordResult("Changing password...");

    try{
        const data = await InventoryAPI.request("/auth/change-password", {
            method:"POST",
            body:JSON.stringify({
                currentPassword,
                newPassword
            })
        });

        hideLoading();

        if(!data.success){
            setPasswordResult(data.error || "Could not change password", "error");
            return;
        }

        document.getElementById("currentPassword").value = "";
        document.getElementById("newPassword").value = "";
        document.getElementById("confirmPassword").value = "";

        setPasswordResult("Password changed successfully ✅", "success");

    }catch(error){
        hideLoading();
        console.error(error);
        setPasswordResult("Password change error: " + error.message, "error");
    }
}

async function runImport(){
    const inventoryFile = document.getElementById("inventoryFile").files[0];
    const salesFile = document.getElementById("salesFile").files[0];

    if(!inventoryFile && !salesFile){
        alert("Choose at least one Excel file first.");
        return;
    }

    if(!confirm("Import these files into the current InventoryOS account?")){
        return;
    }

    const formData = new FormData();

    if(inventoryFile){
        formData.append("inventoryFile", inventoryFile);
    }

    if(salesFile){
        formData.append("salesFile", salesFile);
    }

    showLoading();
    setResult("Importing...");

    try{
        const data = await InventoryAPI.request(
            "/import/google-sheets",
            {
                method:"POST",
                body:formData
            }
        );

        hideLoading();

        if(!data.success){
            setResult(
                data.error ||
                "Import failed",
                "error"
            );

            return;
        }

        let output =
            "Import complete ✅\n\n";

        Object
            .keys(data.summary || {})
            .forEach(key=>{
                output +=
                    key +
                    ": " +
                    data.summary[key] +
                    "\n";
            });

        if(
            data.warnings &&
            data.warnings.length
        ){
            output += "\nWarnings:\n";

            data.warnings.forEach(warning=>{
                output +=
                    "- " +
                    warning +
                    "\n";
            });
        }

        setResult(
            output,
            "success"
        );

    }catch(error){
        hideLoading();
        console.error(error);

        setResult(
            "Import error: " +
            error.message,
            "error"
        );
    }
}

async function showAdminCard(){
    try{
        const data =
            await InventoryAPI.request(
                "/admin/me"
            );

        if(data.success && data.admin){
            document.getElementById(
                "adminCard"
            ).style.display = "block";
        }
    }catch(error){
        // Not an admin - keep hidden.
    }
}

function showSettingsView(viewId){
    document.querySelectorAll(".settings-view").forEach(view=>{
        view.hidden = view.id !== viewId;
    });

    document.querySelectorAll("[data-settings-tab]").forEach(tab=>{
        const active = tab.dataset.settingsTab === viewId;
        tab.classList.toggle("active", active);
        tab.setAttribute("aria-selected", active ? "true" : "false");
    });

    localStorage.setItem("inventoryos_settings_view", viewId);
}

document.querySelectorAll("[data-settings-tab]").forEach(tab=>{
    tab.addEventListener("click",()=>showSettingsView(tab.dataset.settingsTab));
});

const savedSettingsView = localStorage.getItem("inventoryos_settings_view");
if(["guidePanel","helpPanel","stackPanel"].includes(savedSettingsView)){
    showSettingsView(savedSettingsView);
}

loadProfile();
loadStorageStatus();
showAdminCard();
