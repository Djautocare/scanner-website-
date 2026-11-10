
if(!InventoryAPI.requireLogin()){
    throw new Error("Login required");
}

function showLoading(){
    document.getElementById("loadingOverlay").style.display = "flex";
}

function hideLoading(){
    document.getElementById("loadingOverlay").style.display = "none";
}

function money(value){
    return "£" + Number(value || 0).toFixed(2);
}

function setResult(text, type){
    const el = document.getElementById("result");
    el.className = "result " + (type || "");
    el.innerText = text || "";
}

function todayInput(){
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return yyyy + "-" + mm + "-" + dd;
}

document.getElementById("expenseDate").value = todayInput();
const scanReceiptInput = document.getElementById("receipt");
const receiptCamera = document.getElementById("receiptCamera");
const receiptSelectedName = document.getElementById("receiptSelectedName");
const scanReceiptButton = document.getElementById("scanExpenseReceipt");
const scanReceiptStatus = document.getElementById("receiptScanStatus");
const scanReceiptDraft = document.getElementById("receiptScanDraft");
const scanReceiptFields = document.getElementById("receiptScanFields");
const scanReceiptItemTable = document.getElementById("receiptScanItemTable");
const scanReceiptItems = document.getElementById("receiptScanItems");
const receiptScanUnitCost = document.getElementById("receiptScanUnitCost");
const expenseReceiptUnitCost = document.getElementById("expenseReceiptUnitCost");
const expenseAmountInput = document.getElementById("amount");
const scanReceiptPrompt = "Take a photo or choose a file to scan it. PDFs are scanned from the first page.";
const scanFields = [
    ["supplier", "Supplier", "supplier"],
    ["amount", "Total (£)", "amount"],
    ["date", "Date", "expenseDate"],
    ["reference", "Reference", "referenceNumber"]
];
let receiptScanVersion = 0;
let receiptScanSuggestions = [];
let receiptItems = [];
let appliedReceiptQuantity = null;
let selectedReceipt = null;
let receiptScanPending = false;
let expenseDateEdited = false;
let reviewedInboxInvoice = null;
let expenseSavePending = false;
document.getElementById("expenseDate").addEventListener("input", () => { expenseDateEdited = true; });

function invoiceUnitCost(total,quantity){
    const pence = Math.round(Number(total)*100);
    return Number.isSafeInteger(pence) && pence > 0 && quantity
        ? money(Math.round(pence/quantity)/100)
        : "";
}

function showUnitCost(target,total,quantity){
    const cost = invoiceUnitCost(total,quantity);
    target.hidden = !cost;
    target.textContent = cost ? "Cost per unit: " + cost + " (total ÷ " + quantity + ")" : "";
}

function refreshExpenseUnitCost(){
    showUnitCost(expenseReceiptUnitCost,expenseAmountInput.value,appliedReceiptQuantity);
}
expenseAmountInput.addEventListener("input",refreshExpenseUnitCost);

function refreshScannedUnitCost(){
    const total = receiptScanSuggestions.find(field => field.id === "amount")?.value;
    showUnitCost(receiptScanUnitCost,total,receiptItems.length === 1 ? receiptItems[0].quantity : null);
}

function resetReceiptScan(){
    receiptScanVersion++;
    receiptScanSuggestions = [];
    receiptItems = [];
    scanReceiptDraft.hidden = true;
    scanReceiptFields.replaceChildren();
    scanReceiptItems.replaceChildren();
    scanReceiptItemTable.hidden = true;
    receiptScanUnitCost.hidden = true;
    scanReceiptButton.disabled = !selectedReceipt || receiptScanPending;
}

function selectReceipt(file){
    selectedReceipt = file || null;
    appliedReceiptQuantity = null;
    refreshExpenseUnitCost();
    receiptSelectedName.hidden = !file;
    receiptSelectedName.textContent = file ? "Selected file: " + file.name : "";
    resetReceiptScan();
    scanReceiptStatus.textContent = file ? "Reading receipt…" : scanReceiptPrompt;
    if(file) void scanSelectedReceipt();
}

scanReceiptInput.addEventListener("change", () => {
    selectReceipt(scanReceiptInput.files[0]);
});
document.getElementById("takeReceiptPhoto").addEventListener("click", () => receiptCamera.click());
receiptCamera.addEventListener("change", () => {
    const file = receiptCamera.files[0];
    if(!file) return;
    receiptCamera.value = "";
    scanReceiptInput.value = "";
    selectReceipt(file);
});
scanReceiptButton.addEventListener("click", scanSelectedReceipt);

function showReceiptField(label,text){
    const term = document.createElement("dt");
    const value = document.createElement("dd");
    term.textContent = label;
    value.textContent = text;
    scanReceiptFields.append(term,value);
}

function renderReceiptDraft(draft){
    receiptScanSuggestions = scanFields.flatMap(([key,label,id]) => {
        const value = String(draft?.[key] || "").trim();
        return value ? [{label,id,value}] : [];
    });
    receiptItems = (Array.isArray(draft?.items) ? draft.items : []).slice(0,25)
        .filter(item => typeof item?.description === "string" && item.description.trim())
        .map(item => ({
            description:item.description.trim().slice(0,360),
            quantity:Number.isSafeInteger(item.quantity) && item.quantity > 0 ? item.quantity : null
        }));
    if(!receiptScanSuggestions.length && !receiptItems.length){
        scanReceiptStatus.textContent = "No details could be read. Enter the expense manually and keep the receipt attached.";
        return;
    }
    for(const suggestion of receiptScanSuggestions){
        showReceiptField(suggestion.label,suggestion.value);
    }
    for(const [index,item] of receiptItems.entries()){
        const row = scanReceiptItems.insertRow();
        const description = document.createElement("textarea");
        description.rows = 2;
        description.maxLength = 360;
        description.value = item.description;
        description.setAttribute("aria-label","Description for item " + (index+1));
        description.addEventListener("input",() => { item.description = description.value.trim(); });
        row.insertCell().append(description);
        const quantity = document.createElement("input");
        quantity.type = "number";
        quantity.min = "1";
        quantity.max = "999999";
        quantity.step = "1";
        quantity.value = item.quantity ?? "";
        quantity.placeholder = "Check";
        quantity.setAttribute("aria-label","Quantity for item " + (index+1));
        quantity.addEventListener("input",() => {
            const value = quantity.valueAsNumber;
            item.quantity = quantity.validity.valid && Number.isSafeInteger(value) ? value : null;
            refreshScannedUnitCost();
        });
        row.insertCell().append(quantity);
    }
    scanReceiptItemTable.hidden = !receiptItems.length;
    refreshScannedUnitCost();
    scanReceiptDraft.hidden = false;
    scanReceiptStatus.textContent = "Review these suggestions. Your expense is saved when you choose Add Expense.";
}

async function scanSelectedReceipt(){
    if(!selectedReceipt || receiptScanPending) return;
    const file = selectedReceipt;
    resetReceiptScan();
    const version = receiptScanVersion;
    receiptScanPending = true;
    scanReceiptButton.disabled = true;
    scanReceiptStatus.textContent = "Reading receipt…";
    try{
        const body = new FormData();
        body.append("receipt",file);
        const result = await InventoryAPI.request("/expenses/scan-receipt",{method:"POST",body});
        if(version !== receiptScanVersion) return;
        if(!result.success) throw new Error(result.error || "Could not scan the receipt.");

        renderReceiptDraft(result.draft);
    }catch(error){
        if(version === receiptScanVersion) scanReceiptStatus.textContent = error.message || "Could not scan the receipt.";
    }finally{
        receiptScanPending = false;
        if(version === receiptScanVersion) scanReceiptButton.disabled = !selectedReceipt;
        else if(selectedReceipt) void scanSelectedReceipt();
    }
}

document.getElementById("useReceiptScan").addEventListener("click", () => {
    let filled = 0;
    for(const {id,value} of receiptScanSuggestions){
        const input = document.getElementById(id);
        if(!input.value.trim() || (id === "expenseDate" && !expenseDateEdited && input.value === todayInput())){
            input.value = value;
            filled++;
        }
    }
    const reviewedItems = receiptItems.filter(item => item.description);
    if(reviewedItems.length){
        const lines = reviewedItems.map(item =>
            (item.quantity ? item.quantity + " × " : "") + item.description);
        const description = document.getElementById("description");
        const notes = document.getElementById("notes");
        const hadDescription = !!description.value.trim();
        if(!hadDescription){
            description.value = lines.length === 1 ? lines[0] : lines[0] + " + " + (lines.length-1) + " more";
            filled++;
        }
        if(hadDescription || lines.length > 1){
            const scannedNotes = "Invoice items:\n" + lines.join("\n");
            if(!notes.value.includes(scannedNotes)){
                notes.value = [notes.value.trim(),scannedNotes].filter(Boolean).join("\n\n");
                filled++;
            }
        }
    }
    appliedReceiptQuantity = receiptItems.length === 1 && reviewedItems.length === 1
        ? reviewedItems[0].quantity : null;
    refreshExpenseUnitCost();
    scanReceiptDraft.hidden = true;
    scanReceiptStatus.textContent = filled
        ? "Suggestions added to your draft. Check the details and choose Add Expense when ready."
        : "Your existing entries were kept. Use the suggestions to review the details by hand.";
});

function resetExpenseForm(){
    for(const id of ["description","amount","supplier","notes","paymentMethod","referenceNumber"]){
        document.getElementById(id).value = "";
    }
    scanReceiptInput.value = "";
    receiptCamera.value = "";
    selectReceipt(null);
    expenseDateEdited = false;
    document.getElementById("expenseDate").value = todayInput();
    reviewedInboxInvoice = null;
    document.getElementById("invoiceInboxReview").hidden = true;
    document.getElementById("expenseReceiptPicker").hidden = false;
    const original = document.getElementById("invoiceInboxOriginal");
    original.hidden = true;
    original.removeAttribute("href");
}

function reviewInboxInvoice(job,inventoryHeader){
    if(expenseSavePending) return false;
    const title = document.getElementById("addExpenseTitle");
    if(reviewedInboxInvoice?.id === job.id){
        title.focus();
        return true;
    }
    const unsaved = reviewedInboxInvoice || selectedReceipt || expenseDateEdited ||
        ["description","amount","supplier","notes","paymentMethod","referenceNumber"].some(id =>
            document.getElementById(id).value.trim());
    if(unsaved && !window.confirm("Replace the unsaved expense form with this invoice?")) return false;
    resetExpenseForm();
    reviewedInboxInvoice = {id:job.id,inventoryHeader};
    document.getElementById("invoiceInboxReviewName").textContent = "Reviewing " + job.original_name;
    document.getElementById("invoiceInboxReview").hidden = false;
    document.getElementById("expenseReceiptPicker").hidden = true;
    renderReceiptDraft(job.draft);
    if(job.status === "failed"){
        scanReceiptStatus.textContent = "Check the original invoice and enter any missing details. The invoice will be attached when you save.";
    }
    title.focus();
    return true;
}

function setInboxOriginal(id,url){
    if(reviewedInboxInvoice?.id !== id) return;
    try{
        const source = new URL(url);
        if(source.origin !== new URL(InventoryAPI.API_BASE).origin || !source.pathname.startsWith("/protected-files/")) return;
        const link = document.getElementById("invoiceInboxOriginal");
        link.href = source.href;
        link.hidden = false;
    }catch{
        // The draft can still be reviewed if the file link is unavailable.
    }
}

function closeInboxReview(inventoryHeader){
    if(!reviewedInboxInvoice || reviewedInboxInvoice.inventoryHeader === inventoryHeader) return;
    resetExpenseForm();
    setResult("Invoice review closed. Your original draft is still in the inbox.");
}
function closeInboxReviewForJob(id){
    if(reviewedInboxInvoice?.id === id) closeInboxReview();
}
document.getElementById("invoiceInboxCancelReview").addEventListener("click",() => {
    if(!expenseSavePending) closeInboxReview();
});

async function addExpense(){
    if(expenseSavePending) return;
    const description = document.getElementById("description").value.trim();
    const category = document.getElementById("category").value;
    const amount = Number(document.getElementById("amount").value || 0);
    const expense_date = document.getElementById("expenseDate").value;
    const supplier = document.getElementById("supplier").value.trim();
    const unitCost = invoiceUnitCost(amount,appliedReceiptQuantity);
    const notes = [
        document.getElementById("notes").value.trim(),
        unitCost ? "Cost per unit: " + unitCost + " (expense total ÷ " + appliedReceiptQuantity + ")" : ""
    ].filter(Boolean).join("\n\n");
    const payment_method = document.getElementById("paymentMethod").value;
    const reference_number = document.getElementById("referenceNumber").value.trim();
    const receipt = selectedReceipt;
    const inboxInvoice = reviewedInboxInvoice;

    if(!description){
        alert("Enter a description.");
        return;
    }

    if(!amount || amount <= 0){
        alert("Enter a valid amount.");
        return;
    }

    const formData = new FormData();
    formData.append("description", description);
    formData.append("category", category);
    formData.append("amount", amount);
    formData.append("expense_date", expense_date);
    formData.append("supplier", supplier);
    formData.append("notes", notes);
    formData.append("payment_method", payment_method);
    formData.append("reference_number", reference_number);

    if(receipt){
        formData.append("receipt", receipt);
    }

    showLoading();
    setResult("Adding expense...");
    expenseSavePending = true;

    try{
        const data = inboxInvoice
            ? await InventoryAPI.request("/expenses/invoice-inbox/" + inboxInvoice.id + "/save",{
                method:"POST",
                headers:{"X-Inventory-Ids":inboxInvoice.inventoryHeader},
                body:JSON.stringify(Object.fromEntries(formData))
            })
            : await fetch(InventoryAPI.API_BASE + "/expenses",{
                method:"POST",
                headers:{
                    "Authorization":"Bearer " + InventoryAPI.getToken(),
                    "X-Inventory-Ids":(window.InventoryTopbar ? InventoryTopbar.getHeaderValue() : "")
                },
                body:formData
            }).then(response => response.json());

        hideLoading();

        if(!data.success){
            setResult(data.error || "Could not add expense", "error");
            return;
        }

        if(reviewedInboxInvoice === inboxInvoice) resetExpenseForm();

        setResult("Expense added ✅", "success");
        if(inboxInvoice) window.dispatchEvent(new Event("invoice-inbox-changed"));
        loadExpenses();

    }catch(error){
        hideLoading();
        console.error(error);
        setResult("Error adding expense: " + error.message, "error");
    }finally{
        expenseSavePending = false;
    }
}


let pendingReceiptExpenseId = null;

function chooseReceiptForExpense(id){
    pendingReceiptExpenseId = id;
    const input = document.getElementById("receiptUpdateInput");
    input.value = "";
    input.click();
}

document.getElementById("receiptUpdateInput").addEventListener("change", async function(){
    const file = this.files[0];

    if(!file || !pendingReceiptExpenseId){
        return;
    }

    const formData = new FormData();
    formData.append("receipt", file);

    showLoading();

    try{
        const response = await fetch(InventoryAPI.API_BASE + "/expenses/" + encodeURIComponent(pendingReceiptExpenseId) + "/receipt", {
            method:"POST",
            headers:{
                "Authorization":"Bearer " + InventoryAPI.getToken(),
                "X-Inventory-Ids": (window.InventoryTopbar ? InventoryTopbar.getHeaderValue() : "")
            },
            body:formData
        });

        const data = await response.json();

        hideLoading();

        if(!data.success){
            alert(data.error || "Could not upload receipt");
            return;
        }

        pendingReceiptExpenseId = null;
        loadExpenses();

    }catch(error){
        hideLoading();
        console.error(error);
        alert("Error uploading receipt");
    }
});


async function deleteExpense(id){
    if(!confirm("Delete this expense and its receipt file?")){
        return;
    }

    showLoading();

    try{
        const data = await InventoryAPI.request("/expenses/" + encodeURIComponent(id), {
            method:"DELETE"
        });

        hideLoading();

        if(!data.success){
            alert(data.error || "Could not delete expense");
            return;
        }

        loadExpenses();

    }catch(error){
        hideLoading();
        console.error(error);
        alert("Error deleting expense");
    }
}

async function loadExpenses(){
    showLoading();

    try{
        const data = await InventoryAPI.request("/expenses");
        hideLoading();

        if(!data.success){
            document.getElementById("expensesList").innerHTML =
            "<div class='empty-state'>" + (data.error || "Could not load expenses") + "</div>";
            return;
        }

        renderSummary(data.summary || {});
        renderExpenses(data.expenses || []);

    }catch(error){
        hideLoading();
        console.error(error);
        document.getElementById("expensesList").innerHTML =
        "<div class='empty-state'>Error loading expenses.</div>";
    }
}

function renderSummary(summary){
    document.getElementById("summary").innerHTML = `
        <div class="summary-grid">
            <div class="summary-card">
                <div class="summary-title">All Time Expenses</div>
                <div class="summary-value">${money(summary.allTime)}</div>
            </div>

            <div class="summary-card">
                <div class="summary-title">This Month</div>
                <div class="summary-value">${money(summary.thisMonth)}</div>
            </div>

            <div class="summary-card">
                <div class="summary-title">This Week</div>
                <div class="summary-value">${money(summary.thisWeek)}</div>
            </div>

            <div class="summary-card">
                <div class="summary-title">Expenses Count</div>
                <div class="summary-value">${summary.count || 0}</div>
            </div>
        </div>
    `;
}

function receiptHtml(expense){
    if(!expense.receiptUrl){
        return "";
    }

    const isImage = String(expense.receiptMimeType || "").startsWith("image/");

    if(isImage){
        return `
            <a class="receipt-link" href="${expense.receiptUrl}" target="_blank">
                <img class="receipt-thumb" src="${expense.receiptUrl}" alt="Receipt">
                View Receipt
            </a>
        `;
    }

    return `
        <a class="receipt-link" href="${expense.receiptUrl}" target="_blank">
            📄 View Receipt / PDF
        </a>
    `;
}

function renderExpenses(expenses){
    if(!expenses.length){
        document.getElementById("expensesList").innerHTML =
        "<div class='empty-state'>No expenses added yet.</div>";
        return;
    }

    let html = "";

    expenses.forEach(expense=>{
        html += `
            <div class="expense-row">
                <div>
                    <div class="expense-name">${ReorderCosts.esc(expense.description)}</div>
                    ${ReorderCosts.expenseDetail(expense)}
                    <div class="expense-meta">
                        ${expense.supplier ? ReorderCosts.esc(expense.supplier) + " • " : ""}
                        ${expense.paymentMethod ? ReorderCosts.esc(expense.paymentMethod) + " • " : ""}
                        ${expense.referenceNumber ? "Ref: " + ReorderCosts.esc(expense.referenceNumber) + " • " : ""}
                        ${ReorderCosts.esc(expense.notes)}
                    </div>
                    ${receiptHtml(expense)}
                </div>

                <div><span class="badge">${ReorderCosts.esc(expense.category || "Other")}</span></div>

                <div>
                    <div class="money">${money(expense.amount)}</div>
                    <div class="expense-meta">${expense.expenseDate || ""}</div>
                </div>

                <div>
                    <button class="upload-button" data-ios-click="hd2619331cb0da5a2" data-ios-click-args="${InventoryEvents.encode([expense.id])}">${expense.receiptUrl ? "Replace receipt" : "Attach receipt"}</button>
                    <button class="delete-button" data-ios-click="h7b8fdf79b748122a" data-ios-click-args="${InventoryEvents.encode([expense.id])}">Delete</button>
                </div>
            </div>
        `;
    });

    document.getElementById("expensesList").innerHTML = html;
}

window.addEventListener("inventory-selection-changed", function(){
    loadExpenses();
});

loadExpenses();
