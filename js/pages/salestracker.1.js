function uploadSafeText(value){return String(value ?? "").replace(/[&<>"']/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]));}

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

function percent(value){
    const number = Number(value || 0);
    const sign = number > 0 ? "+" : "";
    return sign + number.toFixed(2) + "%";
}

function trendArrow(value){
    const number = Number(value || 0);

    if(number > 0){
        return "📈 " + percent(number);
    }

    if(number < 0){
        return "📉 " + percent(number);
    }

    return "➡️ " + percent(number);
}

function setProfitClass(id, value){
    const el = document.getElementById(id);

    el.classList.remove("profit", "loss", "neutral");

    if(Number(value) > 0){
        el.classList.add("profit");
    }else if(Number(value) < 0){
        el.classList.add("loss");
    }else{
        el.classList.add("neutral");
    }
}

function setTrend(id, value){
    const el = document.getElementById(id);
    el.innerText = trendArrow(value);

    el.classList.remove("profit", "loss", "neutral");

    if(Number(value) > 0){
        el.classList.add("profit");
    }else if(Number(value) < 0){
        el.classList.add("loss");
    }else{
        el.classList.add("neutral");
    }
}

function loadSalesTracker(){

    showLoading();

    InventoryAPI.request("/sales/tracker?_t=" + Date.now())

    .then(data => {

        hideLoading();

        if(!data.success){
            document.getElementById("result").innerText =
            data.error || "Could not load sales tracker";
            return;
        }

        document.getElementById("allIncome").innerText = money(data.allTime.income);
        document.getElementById("allExpenses").innerText = money(data.allTime.expenses);
        document.getElementById("allProfit").innerText = money(data.allTime.profit);
        document.getElementById("profitMargin").innerText = data.allTime.profitMargin.toFixed(2) + "%";
        document.getElementById("totalItemsSold").innerText = data.allTime.totalItemsSold || data.allTime.salesCount || 0;

        setProfitClass("allProfit", data.allTime.profit);

        document.getElementById("monthIncome").innerText = money(data.thisMonth.income);
        document.getElementById("monthExpenses").innerText = money(data.thisMonth.expenses);
        document.getElementById("monthProfit").innerText = money(data.thisMonth.profit);

        setProfitClass("monthProfit", data.thisMonth.profit);
        setTrend("monthTrend", data.thisMonth.profitTrend);

        document.getElementById("weekIncome").innerText = money(data.thisWeek.income);
        document.getElementById("weekExpenses").innerText = money(data.thisWeek.expenses);
        document.getElementById("weekProfit").innerText = money(data.thisWeek.profit);

        setProfitClass("weekProfit", data.thisWeek.profit);
        setTrend("weekTrend", data.thisWeek.profitTrend);

        let monthlyHtml = "";

        const months = data.monthlyBreakdown || [];

        if(months.length === 0){
            monthlyHtml = "<tr><td colspan='5'>No monthly data yet</td></tr>";
        }else{
            months.slice().reverse().forEach(row => {
                const profitClass = Number(row.profit) >= 0 ? "profit" : "loss";

                monthlyHtml += `
                    <tr>
                        <td>${uploadSafeText(row.month)}</td>
                        <td>${money(row.income)}</td>
                        <td>${money(row.expenses)}</td>
                        <td class="${profitClass}">${money(row.profit)}</td>
                        <td>${row.salesCount}</td>
                    </tr>
                `;
            });
        }

        document.getElementById("monthlyRows").innerHTML = monthlyHtml;

        let salesHtml = "";

        const lastSales = data.last10Sales || [];

        if(lastSales.length === 0){
            salesHtml = `
                <div class="sale-card">
                    <div>No recent sales found</div>
                </div>
            `;
        }else{
            lastSales.forEach(sale => {
                salesHtml += `
                    <div class="sale-card">
                        <div class="sale-date">${uploadSafeText(sale.date)}</div>
                        <div class="sale-item">${uploadSafeText(sale.item)}</div>
                        <div class="sale-amount">${money(sale.amount)}</div>
                    </div>
                `;
            });
        }

        document.getElementById("lastSales").innerHTML = salesHtml;

        document.getElementById("result").innerText = "";

    })

    .catch(error => {

        hideLoading();

        console.error(error);

        document.getElementById("result").innerText =
        "Error loading sales tracker";

    });

}

window.addEventListener("inventory-selection-changed", function(){
    loadSalesTracker();
});

loadSalesTracker();
