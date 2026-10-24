
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

function simpleDate(value){
    if(!value){
        return "";
    }

    const date = new Date(value);

    if(isNaN(date.getTime())){
        return "";
    }

    return date.toLocaleDateString("en-GB");
}

function profitClass(value){
    const number = Number(value || 0);

    if(number > 0){
        return "green";
    }

    if(number < 0){
        return "red";
    }

    return "yellow";
}

function cardClass(value){
    const number = Number(value || 0);

    if(number > 0){
        return "profit";
    }

    if(number < 0){
        return "loss";
    }

    return "break-even";
}

function profitBadge(value){
    const number = Number(value || 0);

    if(number > 0){
        return '<span class="profit-badge profit-positive">In Profit</span>';
    }

    if(number < 0){
        return '<span class="profit-badge profit-negative">Loss</span>';
    }

    return '<span class="profit-badge profit-even">Break Even</span>';
}

function sellThroughClass(value){
    const number = Number(value || 0);

    if(number >= 80){
        return "green";
    }

    if(number >= 50){
        return "yellow";
    }

    return "blue";
}

function mbNumber(value){
    const match = String(value || "").toUpperCase().match(/MB-(\d+)/);
    return match ? Number(match[1]) : 0;
}

function sortByMbNumber(boxes){
    return boxes.slice().sort((a,b) => {
        const aNum = mbNumber(a.mysteryBoxId);
        const bNum = mbNumber(b.mysteryBoxId);

        if(aNum !== bNum){
            return aNum - bNum;
        }

        return String(a.mysteryBoxId || "").localeCompare(String(b.mysteryBoxId || ""));
    });
}

function renderSummary(boxes){
    let activeCount = 0;
    let closedCount = 0;
    let totalCost = 0;
    let totalRevenue = 0;
    let totalProfit = 0;
    let totalOriginal = 0;
    let totalSold = 0;

    boxes.forEach(box=>{
        const status = String(box.status || "Active").toLowerCase();

        if(status === "active"){
            activeCount++;
        }else{
            closedCount++;
        }

        totalCost += Number(box.cost || 0);
        totalRevenue += Number(box.revenue || 0);
        totalProfit += Number(box.profit || 0);
        totalOriginal += Number(box.originalQty || 0);
        totalSold += Number(box.soldQty || 0);
    });

    const overallSellThrough =
    totalOriginal > 0 ? (totalSold / totalOriginal) * 100 : 0;

    document.getElementById("summary").innerHTML =
    `
    <div class="summary-grid">
        <div class="summary-card">
            <div class="summary-title">Total MB Batches</div>
            <div class="summary-value">${boxes.length}</div>
        </div>

        <div class="summary-card">
            <div class="summary-title">Active / Closed</div>
            <div class="summary-value"><span class="green">${activeCount}</span> / <span class="grey">${closedCount}</span></div>
        </div>

        <div class="summary-card">
            <div class="summary-title">Total Cost</div>
            <div class="summary-value">${money(totalCost)}</div>
        </div>

        <div class="summary-card">
            <div class="summary-title">Total Revenue</div>
            <div class="summary-value green">${money(totalRevenue)}</div>
        </div>

        <div class="summary-card">
            <div class="summary-title">Total Profit</div>
            <div class="summary-value ${profitClass(totalProfit)}">${money(totalProfit)}</div>
        </div>

        <div class="summary-card">
            <div class="summary-title">Overall Sell-through</div>
            <div class="summary-value ${sellThroughClass(overallSellThrough)}">${overallSellThrough.toFixed(2)}%</div>
        </div>
    </div>
    `;
}

function loadMysteryBoxes(){
    showLoading();

    InventoryAPI.request("/mystery-boxes/profit")

    .then(data=>{
        hideLoading();

        if(!data.success){
            document.getElementById("mysteryBoxList").innerHTML =
            "<div class='empty-state'>" + (data.error || "Could not load mystery boxes") + "</div>";
            return;
        }

        if(data.mysteryBoxes.length === 0){
            document.getElementById("summary").innerHTML = "";
            document.getElementById("mysteryBoxList").innerHTML =
            "<div class='empty-state'>No mystery boxes created yet.</div>";
            return;
        }

        const sortedBoxes = sortByMbNumber(data.mysteryBoxes);

        renderSummary(sortedBoxes);

        let html = "<div class='grid'>";

        sortedBoxes.forEach(box=>{
            const status = box.status || "Active";
            const statusClass =
            status.toLowerCase() === "active" ? "status-active" : "status-closed";

            const progress = Math.min(100, Number(box.sellThrough || 0));
            const created = simpleDate(box.dateCreated) || "Unknown";

            html += `
                <div class="mb-card ${cardClass(box.profit)}">

                    <div class="mb-header">
                        <div>
                            <div class="mb-name">${box.mysteryBoxId} | ${box.name}</div>
                            <div class="mb-sub">Created ${created}</div>
                            <div class="badge-row">
                                <span class="status ${statusClass}">${status}</span>
                                ${profitBadge(box.profit)}
                            </div>
                        </div>

                        <div class="mb-id">${box.mysteryBoxId}</div>
                    </div>

                    <div class="stat-grid">
                        <div class="stat-box">
                            <div class="stat-title">Cost</div>
                            <div class="stat-value">${money(box.cost)}</div>
                        </div>

                        <div class="stat-box">
                            <div class="stat-title">Revenue</div>
                            <div class="stat-value green">${money(box.revenue)}</div>
                        </div>

                        <div class="stat-box">
                            <div class="stat-title">Profit</div>
                            <div class="stat-value ${profitClass(box.profit)}">${money(box.profit)}</div>
                        </div>

                        <div class="stat-box">
                            <div class="stat-title">Original Items</div>
                            <div class="stat-value blue">${box.originalQty}</div>
                        </div>

                        <div class="stat-box">
                            <div class="stat-title">Sold Items</div>
                            <div class="stat-value green">${box.soldQty}</div>
                        </div>

                        <div class="stat-box">
                            <div class="stat-title">Remaining</div>
                            <div class="stat-value yellow">${box.remainingQty}</div>
                        </div>
                    </div>

                    <div class="progress-wrap">
                        <div class="progress-top">
                            <span>Sell-through</span>
                            <span class="${sellThroughClass(box.sellThrough)}">${Number(box.sellThrough || 0).toFixed(2)}%</span>
                        </div>
                        <div class="progress-bar">
                            <div class="progress-fill" style="width:${progress}%"></div>
                        </div>
                    </div>

                    <div class="info-box">
                        <strong>Notes:</strong> ${box.notes || "No notes added"}
                    </div>

                    <div class="card-actions">
                        <button class="view-button" data-ios-click="h86b0e152cb11e726" data-ios-click-args="${InventoryEvents.encode([box.mysteryBoxId])}">View Item Breakdown</button>
                        <button class="close-button" data-ios-click="h6225a07a37c577e5" data-ios-click-args="${InventoryEvents.encode([box.mysteryBoxId])}">Close / Bulk Sold</button>
                    </div>

                    <div class="items-list" id="items_${box.mysteryBoxId}">
                        ${renderItems(box.items || [])}
                    </div>

                </div>
            `;
        });

        html += "</div>";

        document.getElementById("mysteryBoxList").innerHTML = html;
    })

    .catch(error=>{
        hideLoading();
        console.error(error);

        document.getElementById("mysteryBoxList").innerHTML =
        "<div class='empty-state'>Error loading mystery boxes.</div>";
    });
}

function renderItems(items){
    if(!items || items.length === 0){
        return "<div class='empty-state'>No snapshot items found for this mystery box.</div>";
    }

    let html = "";

    items.forEach(item=>{
        const itemSellThrough =
        Number(item.originalQty || 0) > 0
        ? (Number(item.soldQty || 0) / Number(item.originalQty || 0)) * 100
        : 0;

        html += `
            <div class="item-row">
                <div>
                    <div class="item-name">${item.description || item.barcode}</div>
                    <div class="item-meta">
                        ${item.barcode}<br>
                        Sold ${item.soldQty}/${item.originalQty} • Revenue ${money(item.revenue)} • ${itemSellThrough.toFixed(0)}% sold
                    </div>
                </div>
                <div class="item-left">${item.remainingQty} left</div>
            </div>
        `;
    });

    return html;
}

function toggleItems(mysteryBoxId){
    const el = document.getElementById("items_" + mysteryBoxId);

    if(!el){
        return;
    }

    el.style.display = el.style.display === "block" ? "none" : "block";
}

function closeMysteryBox(mysteryBoxId){
    if(!confirm("Mark " + mysteryBoxId + " as Bulk Sold / Closed? Future removals will not allocate sales to this box.")){
        return;
    }

    showLoading();

    InventoryAPI.request("/mystery-boxes/" + encodeURIComponent(mysteryBoxId) + "/close",{
        method:"POST",
        body:JSON.stringify({
            status:"Bulk Sold"
        })
    })

    .then(data=>{
        hideLoading();

        if(!data.success){
            alert(data.error || "Could not close mystery box");
            return;
        }

        loadMysteryBoxes();
    })

    .catch(error=>{
        hideLoading();
        console.error(error);
        alert("Error closing mystery box");
    });
}

loadMysteryBoxes();
