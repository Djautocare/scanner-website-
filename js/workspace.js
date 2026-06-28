document.addEventListener("DOMContentLoaded", function () {
    if (
        window.InventoryAPI &&
        window.InventoryWorkspace &&
        InventoryAPI.isLoggedIn()
    ) {
        InventoryWorkspace.init();
    }
});
