
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

async function addExpense(){
    const description = document.getElementById("description").value.trim();
    const category = document.getElementById("category").value;
    const amount = Number(document.getElementById("amount").value || 0);
    const expense_date = document.getElementById("expenseDate").value;
    const supplier = document.getElementById("supplier").value.trim();
    const notes = document.getElementById("notes").value.trim();
    const payment_method = document.getElementById("paymentMethod").value;
    const reference_number = document.getElementById("referenceNumber").value.trim();
    const receipt = document.getElementById("receipt").files[0];

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

    try{
        const response = await fetch(InventoryAPI.API_BASE + "/expenses", {
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
            setResult(data.error || "Could not add expense", "error");
            return;
        }

        document.getElementById("description").value = "";
        document.getElementById("amount").value = "";
        document.getElementById("supplier").value = "";
        document.getElementById("notes").value = "";
        document.getElementById("paymentMethod").value = "";
        document.getElementById("referenceNumber").value = "";
        document.getElementById("receipt").value = "";
        document.getElementById("expenseDate").value = todayInput();

        setResult("Expense added ✅", "success");
        loadExpenses();

    }catch(error){
        hideLoading();
        console.error(error);
        setResult("Error adding expense: " + error.message, "error");
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
