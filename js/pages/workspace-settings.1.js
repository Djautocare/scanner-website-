
if(!InventoryAPI.isLoggedIn()){
    window.location.href = "login.html";
}

const presets = {
    box:{
        type:"box",
        singular:"Box",
        plural:"Boxes",
        icon:"📦"
    },
    shelf:{
        type:"shelf",
        singular:"Shelf",
        plural:"Shelves",
        icon:"🗄️"
    },
    rack:{
        type:"rack",
        singular:"Rack",
        plural:"Racks",
        icon:"🏗️"
    },
    pallet:{
        type:"pallet",
        singular:"Pallet",
        plural:"Pallets",
        icon:"🪵"
    },
    room:{
        type:"room",
        singular:"Room",
        plural:"Rooms",
        icon:"🚪"
    },
    store:{
        type:"store",
        singular:"Store",
        plural:"Stores",
        icon:"🏬"
    },
    custom:{
        type:"custom",
        singular:"Location",
        plural:"Locations",
        icon:"📍"
    }
};

function setStatus(message, type){
    const el = document.getElementById("status");
    el.className = "status " + (type || "");
    el.textContent = message || "";
}

function getValue(id){
    return document.getElementById(id).value.trim();
}

function setValue(id, value){
    document.getElementById(id).value = value || "";
}

function setChecked(id, value){
    document.getElementById(id).checked = !!value;
}

function getChecked(id){
    return document.getElementById(id).checked;
}

function applyPreset(){
    const presetKey = document.getElementById("locationPreset").value;
    const preset = presets[presetKey] || presets.box;

    if(presetKey !== "custom"){
        setValue("singularLabel", preset.singular);
        setValue("pluralLabel", preset.plural);
        setValue("locationIcon", preset.icon);
    }

    updatePreview();
}

function updatePreview(){
    const singular = getValue("singularLabel") || "Location";
    const plural = getValue("pluralLabel") || singular + "s";
    const icon = getValue("locationIcon") || "📍";

    document.getElementById("previewCreate").textContent = "Create " + singular;
    document.getElementById("previewMove").textContent = singular;
    document.getElementById("previewPlural").textContent = plural;
    document.getElementById("previewIcon").textContent = icon;
    document.getElementById("previewExample").textContent = singular + " 12";

    document.getElementById("currentLabel").textContent = icon + " " + plural;
    document.getElementById("currentLabelHint").textContent = "InventoryOS will use “" + singular + "” and “" + plural + "” across this workspace.";
}

function matchPreset(settings){
    const type = String(settings.location_type || "").toLowerCase();

    if(presets[type]){
        return type;
    }

    return "custom";
}

async function loadWorkspace(){
    try{
        const data = await InventoryAPI.request("/workspaces/current");

        if(!data.success){
            setStatus(data.error || "Could not load workspace", "error");
            return;
        }

        document.getElementById("workspaceName").textContent = data.workspace.name || "Workspace";
        document.getElementById("workspaceRole").textContent = "Your role: " + (data.workspace.role || "-");

    }catch(error){
        console.error(error);
        setStatus("Could not connect to workspace API", "error");
    }
}

async function loadSettings(){
    try{
        setStatus("Loading settings...");

        const data = await InventoryAPI.request("/workspaces/settings");

        if(!data.success){
            setStatus(data.error || "Could not load settings", "error");
            return;
        }

        const s = data.settings || {};

        document.getElementById("locationPreset").value = matchPreset(s);
        setValue("singularLabel", s.location_label_singular || "Box");
        setValue("pluralLabel", s.location_label_plural || "Boxes");
        setValue("locationIcon", s.location_icon || "📦");
        setChecked("autoCreateLocations", s.auto_create_locations !== false);
        setChecked("showAutoCreateOption", s.show_auto_create_location_option !== false);

        updatePreview();
        setStatus("Settings loaded.", "success");

        setTimeout(function(){
            setStatus("");
        }, 1200);

    }catch(error){
        console.error(error);
        setStatus("Could not connect to server", "error");
    }
}

async function saveSettings(){
    try{
        const singular = getValue("singularLabel");
        const plural = getValue("pluralLabel");
        const icon = getValue("locationIcon") || "📍";

        if(!singular || !plural){
            setStatus("Singular and plural labels are required.", "error");
            return;
        }

        setStatus("Saving settings...");

        const preset = document.getElementById("locationPreset").value;

        const data = await InventoryAPI.request("/workspaces/settings", {
            method:"POST",
            body:JSON.stringify({
                location_type:preset,
                location_label_singular:singular,
                location_label_plural:plural,
                location_icon:icon,
                auto_create_locations:getChecked("autoCreateLocations"),
                show_auto_create_location_option:getChecked("showAutoCreateOption")
            })
        });

        if(!data.success){
            setStatus(data.error || "Could not save settings", "error");
            return;
        }

        updatePreview();
        setStatus("Settings saved successfully.", "success");

    }catch(error){
        console.error(error);
        setStatus("Could not connect to server", "error");
    }
}

["singularLabel","pluralLabel","locationIcon"].forEach(function(id){
    document.getElementById(id).addEventListener("input", function(){
        document.getElementById("locationPreset").value = "custom";
        updatePreview();
    });
});

document.getElementById("autoCreateLocations").addEventListener("change", updatePreview);
document.getElementById("showAutoCreateOption").addEventListener("change", updatePreview);

loadWorkspace();
loadSettings();
