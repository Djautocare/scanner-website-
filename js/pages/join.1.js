
if(!InventoryAPI.isLoggedIn()){
    localStorage.setItem("inventoryos_pending_invite", window.location.href);
    window.location.href = "login.html";
}

function setStatus(message, type){
    const el = document.getElementById("status");
    el.className = "status " + (type || "");
    el.textContent = message;
}

function getCodeFromUrl(){
    const params = new URLSearchParams(window.location.search);
    return String(params.get("code") || "").trim().toUpperCase();
}

async function joinWorkspace(){
    const code = document.getElementById("inviteCode").value.trim().toUpperCase();

    if(!code){
        setStatus("Enter an invite code.", "error");
        return;
    }

    setStatus("Joining workspace...");

    try{
        const data = await InventoryAPI.request("/workspaces/join", {
            method:"POST",
            body:JSON.stringify({ code })
        });

        if(!data.success){
            setStatus(data.error || "Could not join workspace.", "error");
            return;
        }

        localStorage.removeItem("inventoryos_workspace");

        setStatus("Joined " + data.workspace.name + ". Redirecting...", "success");

        setTimeout(function(){
            window.location.href = "index.html";
        }, 900);

    }catch(error){
        console.error(error);
        setStatus("Could not connect to server.", "error");
    }
}

const urlCode = getCodeFromUrl();
if(urlCode){
    document.getElementById("inviteCode").value = urlCode;
    joinWorkspace();
}
