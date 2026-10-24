
if(!InventoryAPI.requireLogin()){
    throw new Error("Login required");
}

let lastInviteUrl = "";
let currentWorkspace = null;
let allInventories = [];
let currentInventories = [];

function setStatus(message){
    document.getElementById("status").textContent = message || "";
}

function escapeHtml(value){
    return String(value || "")
        .replaceAll("&","&amp;")
        .replaceAll("<","&lt;")
        .replaceAll(">","&gt;")
        .replaceAll('"',"&quot;")
        .replaceAll("'","&#039;");
}

function fmtDate(value){
    if(!value) return "-";
    return new Date(value).toLocaleString("en-GB");
}

function roleBadge(role){
    role = String(role || "member").toLowerCase();
    return `<span class="badge ${role}">${role}</span>`;
}

function statusBadge(active){
    return active
        ? `<span class="badge good-badge">Active</span>`
        : `<span class="badge bad">Inactive</span>`;
}

function canManage(){
    return currentWorkspace && ["owner","admin"].includes(String(currentWorkspace.role || "").toLowerCase());
}

async function loadPage(){
    await InventoryWorkspace.load();

    const workspace = InventoryWorkspace.getCached();

    const invData = await InventoryAPI.request("/workspaces/inventories?_t=" + Date.now());
    allInventories = invData.inventories || [];

    const selectedWorkspaceId = InventoryTopbar.getSelectedWorkspaceId
        ? InventoryTopbar.getSelectedWorkspaceId()
        : (workspace ? workspace.id : "");

    currentInventories = allInventories.filter(inv => String(inv.workspace_id) === String(selectedWorkspaceId));

    if(currentInventories.length > 0){
        currentWorkspace = {
            id: selectedWorkspaceId,
            name: currentInventories[0].workspace_name,
            role: currentInventories[0].workspace_role
        };
    }else{
        currentWorkspace = workspace;
    }

    if(currentWorkspace){
        document.getElementById("workspaceNameCard").textContent = currentWorkspace.name || "Workspace";
        document.getElementById("workspaceNameInput").value = currentWorkspace.name || "";
        document.getElementById("workspaceRole").textContent = currentWorkspace.role || "-";
    }

    document.getElementById("inventoryCount").textContent = currentInventories.length;

    renderInventories();

    await loadMembers();
    await loadInvites();
}

function renderInventories(){
    const tbody = document.getElementById("inventoriesTable");

    if(!currentInventories.length){
        tbody.innerHTML = `<tr><td colspan="5">No inventories found.</td></tr>`;
        return;
    }

    tbody.innerHTML = "";

    currentInventories.forEach(inv => {
        const tr = document.createElement("tr");

        tr.innerHTML = `
            <td>
                ${escapeHtml(inv.name || "Inventory")}
                ${inv.is_default ? `<span class="badge default">Default</span>` : ""}
            </td>
            <td>${Number(inv.total_stock || 0)}</td>
            <td>${Number(inv.total_products || 0)}</td>
            <td>${Number(inv.total_locations || 0)}</td>
            <td><div class="actions"></div></td>
        `;

        const actions = tr.querySelector(".actions");

        const renameBtn = document.createElement("button");
        renameBtn.className = "small blue";
        renameBtn.textContent = "Rename";
        renameBtn.addEventListener("click", () => renameInventory(inv.id, inv.name));
        actions.appendChild(renameBtn);

        const deleteBtn = document.createElement("button");
        deleteBtn.className = "small danger";
        deleteBtn.textContent = "Delete";
        deleteBtn.addEventListener("click", () => deleteInventory(inv.id, inv.name, inv.total_stock, inv.is_default));
        actions.appendChild(deleteBtn);

        tbody.appendChild(tr);
    });
}

async function renameWorkspace(){
    if(!canManage()){
        document.getElementById("workspaceStatus").textContent = "Only owners/admins can rename this workspace.";
        return;
    }

    const name = document.getElementById("workspaceNameInput").value.trim();

    if(!name){
        document.getElementById("workspaceStatus").textContent = "Enter a workspace name.";
        return;
    }

    const data = await InventoryAPI.request("/workspaces/" + encodeURIComponent(currentWorkspace.id), {
        method:"PUT",
        body:JSON.stringify({ name })
    });

    if(!data.success){
        document.getElementById("workspaceStatus").textContent = data.error || "Could not rename workspace.";
        return;
    }

    document.getElementById("workspaceStatus").textContent = "Workspace renamed.";
    await InventoryTopbar.init();
    await loadPage();
}

async function createInventory(){
    if(!canManage()){
        document.getElementById("inventoryStatus").textContent = "Only owners/admins can create inventories.";
        return;
    }

    const name = document.getElementById("newInventoryName").value.trim();

    if(!name){
        document.getElementById("inventoryStatus").textContent = "Enter an inventory name.";
        return;
    }

    const data = await InventoryAPI.request("/workspaces/inventories", {
        method:"POST",
        body:JSON.stringify({
            name,
            workspace_id:currentWorkspace.id
        })
    });

    if(!data.success){
        document.getElementById("inventoryStatus").textContent = data.error || "Could not create inventory.";
        return;
    }

    document.getElementById("newInventoryName").value = "";
    document.getElementById("inventoryStatus").textContent = "Inventory created.";
    InventoryTopbar.saveSelectedWorkspaceId(currentWorkspace.id);
    InventoryTopbar.saveSelectedIds([String(data.inventory.id)]);
    await InventoryTopbar.init();
    await loadPage();
}

async function renameInventory(id, oldName){
    if(!canManage()){
        alert("Only owners/admins can rename inventories.");
        return;
    }

    const name = prompt("Rename inventory", oldName || "");

    if(!name || !name.trim()) return;

    const data = await InventoryAPI.request("/workspaces/inventories/" + encodeURIComponent(id), {
        method:"PUT",
        body:JSON.stringify({ name:name.trim() })
    });

    if(!data.success){
        alert(data.error || "Could not rename inventory");
        return;
    }

    await InventoryTopbar.init();
    await loadPage();
}

async function deleteInventory(id, name, stock, isDefault){
    if(!canManage()){
        alert("Only owners/admins can delete inventories.");
        return;
    }

    if(isDefault){
        alert("Default inventory cannot be deleted.");
        return;
    }

    if(Number(stock || 0) > 0){
        alert("Inventory still contains stock. Move/remove stock first.");
        return;
    }

    if(!confirm("Delete inventory '" + name + "'?")){
        return;
    }

    const data = await InventoryAPI.request("/workspaces/inventories/" + encodeURIComponent(id), {
        method:"DELETE"
    });

    if(!data.success){
        alert(data.error || "Could not delete inventory");
        return;
    }

    await InventoryTopbar.init();
    await loadPage();
}

async function loadMembers(){
    const data = await InventoryAPI.request("/workspaces/members");

    if(!data.success){
        setStatus(data.error || "Could not load members");
        document.getElementById("membersTable").innerHTML = `<tr><td colspan="6">${escapeHtml(data.error || "Could not load members")}</td></tr>`;
        return;
    }

    const members = data.members || [];

    document.getElementById("memberCount").textContent = members.length;

    const tbody = document.getElementById("membersTable");

    if(!members.length){
        tbody.innerHTML = `<tr><td colspan="6">No members found.</td></tr>`;
        return;
    }

    tbody.innerHTML = "";

    members.forEach(member => {
        const tr = document.createElement("tr");

        tr.innerHTML = `
            <td>${escapeHtml(member.name || "-")}</td>
            <td>${escapeHtml(member.email || "-")}</td>
            <td>${roleBadge(member.role)}</td>
            <td>${escapeHtml(member.status || "-")}</td>
            <td>${fmtDate(member.last_seen)}</td>
            <td><div class="actions"></div></td>
        `;

        const actions = tr.querySelector(".actions");

        if(member.role !== "owner"){
            const select = document.createElement("select");
            select.style.width = "130px";
            select.style.margin = "0";
            select.innerHTML = `
                <option value="admin">Admin</option>
                <option value="member">Member</option>
                <option value="viewer">Viewer</option>
            `;
            select.value = member.role;
            select.addEventListener("change", () => changeRole(member.user_id, select.value));
            actions.appendChild(select);

            const removeBtn = document.createElement("button");
            removeBtn.className = "small danger";
            removeBtn.textContent = "Remove";
            removeBtn.addEventListener("click", () => removeMember(member.user_id, member.email));
            actions.appendChild(removeBtn);
        }else{
            actions.innerHTML = `<span style="color:#aaa;">Owner</span>`;
        }

        tbody.appendChild(tr);
    });
}

async function loadInvites(){
    const data = await InventoryAPI.request("/workspaces/invites");

    const tbody = document.getElementById("invitesTable");

    if(!data.success){
        tbody.innerHTML = `<tr><td colspan="5">${escapeHtml(data.error || "Could not load invites")}</td></tr>`;
        return;
    }

    const invites = data.invites || [];

    if(!invites.length){
        tbody.innerHTML = `<tr><td colspan="5">No invites created yet.</td></tr>`;
        return;
    }

    tbody.innerHTML = "";

    invites.forEach(invite => {
        const tr = document.createElement("tr");

        tr.innerHTML = `
            <td>${escapeHtml(invite.code)}</td>
            <td>${roleBadge(invite.role)}</td>
            <td>${statusBadge(invite.is_active)}</td>
            <td>${fmtDate(invite.created_at)}</td>
            <td><div class="actions"></div></td>
        `;

        const actions = tr.querySelector(".actions");

        const copyBtn = document.createElement("button");
        copyBtn.className = "small";
        copyBtn.textContent = "Copy";
        copyBtn.addEventListener("click", () => {
            const url = window.location.origin + "/join.html?code=" + invite.code;
            navigator.clipboard.writeText(url);
            alert("Invite link copied");
        });
        actions.appendChild(copyBtn);

        const toggleBtn = document.createElement("button");
        toggleBtn.className = invite.is_active ? "small danger" : "small";
        toggleBtn.textContent = invite.is_active ? "Disable" : "Enable";
        toggleBtn.addEventListener("click", () => toggleInvite(invite.id));
        actions.appendChild(toggleBtn);

        tbody.appendChild(tr);
    });
}

async function createInvite(){
    const role = document.getElementById("inviteRole").value;

    const data = await InventoryAPI.request("/workspaces/invites", {
        method:"POST",
        body:JSON.stringify({ role })
    });

    if(!data.success){
        alert(data.error || "Could not create invite");
        return;
    }

    lastInviteUrl = data.join_url || (window.location.origin + "/join.html?code=" + data.invite.code);

    const output = document.getElementById("inviteOutput");
    output.style.display = "block";
    output.textContent = lastInviteUrl;

    document.getElementById("copyInviteBtn").style.display = "block";

    await loadInvites();
}

async function copyInvite(){
    if(!lastInviteUrl) return;
    await navigator.clipboard.writeText(lastInviteUrl);
    alert("Invite link copied");
}

async function changeRole(userId, role){
    if(!confirm("Change this member's role?")) {
        await loadMembers();
        return;
    }

    const data = await InventoryAPI.request("/workspaces/members/" + userId + "/role", {
        method:"POST",
        body:JSON.stringify({ role })
    });

    if(!data.success){
        alert(data.error || "Could not change role");
    }

    await loadMembers();
}

function extractInviteCode(value){
    value = String(value || "").trim();

    if(!value) return "";

    try{
        if(value.includes("http")){
            const url = new URL(value);
            return String(url.searchParams.get("code") || "").trim().toUpperCase();
        }
    }catch(error){}

    return value.trim().toUpperCase();
}

async function joinWorkspaceFromMembersPage(){
    const raw = document.getElementById("joinCodeInput").value;
    const code = extractInviteCode(raw);
    const status = document.getElementById("joinStatus");

    if(!code){
        status.textContent = "Paste an invite code or link.";
        return;
    }

    status.textContent = "Joining workspace...";

    const data = await InventoryAPI.request("/workspaces/join", {
        method:"POST",
        body:JSON.stringify({ code })
    });

    if(!data.success){
        status.textContent = data.error || "Could not join workspace.";
        return;
    }

    localStorage.removeItem("inventoryos_workspace");

    status.textContent = "Joined " + data.workspace.name + ". Reloading...";

    setTimeout(function(){
        window.location.reload();
    }, 800);
}

async function removeMember(userId, email){
    if(!confirm("Remove " + email + " from this workspace?")) return;

    const data = await InventoryAPI.request("/workspaces/members/" + userId, {
        method:"DELETE"
    });

    if(!data.success){
        alert(data.error || "Could not remove member");
        return;
    }

    await loadMembers();
}

async function toggleInvite(inviteId){
    const data = await InventoryAPI.request("/workspaces/invites/" + inviteId + "/toggle", {
        method:"POST"
    });

    if(!data.success){
        alert(data.error || "Could not update invite");
        return;
    }

    await loadInvites();
}

window.addEventListener("inventory-selection-changed", function(){
    loadPage();
});

loadPage();
