
/*
    Inventory totals come from /dashboard.
    Sales, profit, chart and latest-sale data come from /sales/tracker,
    matching the figures shown on the Sales Tracker page.
*/
const DashboardPage = (function(){
    let loadingDashboard = false;

    function byId(id){
        return document.getElementById(id);
    }

    function firstDefined(){
        for(
            let index = 0;
            index < arguments.length;
            index++
        ){
            const value = arguments[index];

            if(
                value !== undefined &&
                value !== null &&
                value !== ""
            ){
                return value;
            }
        }

        return null;
    }

    function numberValue(){
        const value =
            firstDefined.apply(
                null,
                arguments
            );

        const number =
            Number(value);

        return Number.isFinite(number)
            ? number
            : 0;
    }

    function money(value){
        return new Intl.NumberFormat(
            "en-GB",
            {
                style:"currency",
                currency:"GBP"
            }
        ).format(
            numberValue(value)
        );
    }

    function wholeNumber(value){
        return new Intl.NumberFormat(
            "en-GB",
            {
                maximumFractionDigits:0
            }
        ).format(
            numberValue(value)
        );
    }

    function safeText(value){
        return String(
            value === undefined ||
            value === null
                ? ""
                : value
        );
    }

    function getUser(){
        return (
            InventoryAPI.getUser() ||
            {}
        );
    }

    function userName(user){
        return (
            user.name ||
            user.full_name ||
            user.display_name ||
            user.email ||
            "InventoryOS User"
        );
    }

    function initials(value){
        const clean =
            safeText(value)
                .trim();

        if(!clean){
            return "OS";
        }

        const parts =
            clean
                .split(/\s+/)
                .filter(Boolean);

        if(parts.length >= 2){
            return (
                parts[0][0] +
                parts[parts.length - 1][0]
            ).toUpperCase();
        }

        return clean
            .slice(0,2)
            .toUpperCase();
    }

    function greeting(){
        const hour =
            new Date().getHours();

        if(hour < 12){
            return "Good morning";
        }

        if(hour < 18){
            return "Good afternoon";
        }

        return "Good evening";
    }

    function applyUserDetails(user){
        const safeUser = user || {};
        const name = userName(safeUser);
        const avatar = initials(name);

        byId("dashboardGreeting")
            .textContent =
            greeting() +
            (
                safeUser.name
                    ? ", " +
                      safeText(safeUser.name)
                          .split(/\s+/)[0]
                    : ""
            );

        byId("sidebarUserName")
            .textContent =
            name;

        byId("sidebarUserEmail")
            .textContent =
            safeUser.email ||
            "Signed in";

        byId("sidebarAvatar")
            .textContent =
            avatar;

        byId("dashboardAvatar")
            .textContent =
            avatar;
    }

    function setUserDetails(){
        applyUserDetails(
            getUser()
        );
    }

    async function refreshUserDetails(){
        try{
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

                applyUserDetails(
                    {
                        ...(InventoryAPI.getUser ? InventoryAPI.getUser() || {} : {}),
                        ...data.user
                    }
                );
            }
        }catch(error){
            console.warn(
                "Could not refresh dashboard user details",
                error
            );
        }
    }

    function setStatus(message, type){
        const status =
            byId("dashboardStatus");

        status.className =
            "dashboard-status" +
            (
                type
                    ? " " + type
                    : ""
            );

        status.textContent =
            message || "";
    }

    function hideLoading(){
        byId("loadingOverlay")
            .style.display =
            "none";
    }

    function monthData(data){
        return (
            data.thisMonth ||
            data.currentMonth ||
            data.month ||
            {}
        );
    }

    function latestMonthlyRow(salesData){
        const rows =
            Array.isArray(
                salesData?.monthlyBreakdown
            )
                ? salesData.monthlyBreakdown
                : [];

        if(!rows.length){
            return {};
        }

        return rows[rows.length - 1] || {};
    }

    function setStats(
        dashboardData,
        salesData
    ){
        const month =
            salesData?.thisMonth ||
            {};

        const monthRow =
            latestMonthlyRow(
                salesData
            );

        const activeStock =
            numberValue(
                dashboardData.totalStock,
                dashboardData.total_stock,
                dashboardData.activeStock,
                dashboardData.active_stock
            );

        const activeProducts =
            numberValue(
                dashboardData.totalProducts,
                dashboardData.total_products,
                dashboardData.activeProducts,
                dashboardData.active_products
            );

        const activeLocations =
            numberValue(
                dashboardData.totalBoxes,
                dashboardData.total_boxes,
                dashboardData.activeBoxes,
                dashboardData.active_locations
            );

        const monthIncome =
            numberValue(
                month.income,
                month.revenue,
                monthRow.income
            );

        const monthProfit =
            numberValue(
                month.profit,
                monthRow.profit
            );

        const monthSales =
            numberValue(
                month.salesCount,
                month.sales_count,
                monthRow.salesCount,
                monthRow.sales_count
            );

        const todayIncome =
            numberValue(
                dashboardData.todayIncome,
                dashboardData.today_income
            );

        const todaySales =
            numberValue(
                dashboardData.todaySalesCount,
                dashboardData.today_sales_count,
                dashboardData.todaySales
            );

        const trend =
            numberValue(
                dashboardData.rolling3Trend,
                dashboardData.rolling_3_trend,
                dashboardData.threeDayTrend
            );

        byId("activeStockValue")
            .textContent =
            wholeNumber(activeStock);

        byId("productCountValue")
            .textContent =
            wholeNumber(activeProducts);

        byId("monthIncomeValue")
            .textContent =
            money(monthIncome);

        byId("monthProfitValue")
            .textContent =
            money(monthProfit);

        byId("monthSalesValue")
            .textContent =
            wholeNumber(monthSales);

        byId("todayIncomeValue")
            .textContent =
            money(todayIncome);

        byId("todaySalesValue")
            .textContent =
            wholeNumber(todaySales);

        byId("locationsValue")
            .textContent =
            wholeNumber(activeLocations);

        const trendElement =
            byId("trendValue");

        trendElement.textContent =
            (
                trend > 0
                    ? "+"
                    : ""
            ) +
            Number(
                trend.toFixed(1)
            ) +
            "%";

        trendElement.classList.remove(
            "trend-positive",
            "trend-negative"
        );

        if(trend > 0){
            trendElement.classList.add(
                "trend-positive"
            );
        }else if(trend < 0){
            trendElement.classList.add(
                "trend-negative"
            );
        }
    }

    function extractChartArray(data){
        const candidates = [
            {
                values:data.dailyBreakdown,
                heading:"Last 30 days",
                period:"Daily"
            },
            {
                values:data.last30Days,
                heading:"Last 30 days",
                period:"Daily"
            },
            {
                values:data.salesByDay,
                heading:"Last 30 days",
                period:"Daily"
            },
            {
                values:data.chartData,
                heading:"Sales performance",
                period:"Recent"
            },
            {
                values:data.monthlyBreakdown,
                heading:"Recent months",
                period:"Monthly"
            }
        ];

        return (
            candidates.find(
                candidate =>
                    Array.isArray(
                        candidate.values
                    ) &&
                    candidate.values.length
            ) ||
            null
        );
    }

    function labelForChartItem(item, index){
        const raw =
            firstDefined(
                item.label,
                item.day,
                item.date,
                item.month,
                item.period,
                item.name
            );

        if(raw === null){
            return String(index + 1);
        }

        const value = safeText(raw);

        const date =
            new Date(value);

        if(
            !Number.isNaN(
                date.getTime()
            ) &&
            (
                value.includes("-") ||
                value.includes("/") ||
                value.includes("T")
            )
        ){
            return date.toLocaleDateString(
                "en-GB",
                {
                    day:"numeric",
                    month:"short"
                }
            );
        }

        return value;
    }

    function valueForChartItem(item){
        if(
            typeof item === "number" ||
            typeof item === "string"
        ){
            return numberValue(item);
        }

        return numberValue(
            item.income,
            item.revenue,
            item.sales,
            item.total,
            item.amount,
            item.value,
            item.profit
        );
    }

    function fallbackChart(data){
        const periods = [
            {
                label:"Last month",
                value:numberValue(
                    data.lastMonth?.income,
                    data.lastMonthIncome
                )
            },
            {
                label:"Last week",
                value:numberValue(
                    data.lastWeek?.income,
                    data.lastWeekIncome
                )
            },
            {
                label:"This week",
                value:numberValue(
                    data.thisWeek?.income,
                    data.thisWeekIncome
                )
            },
            {
                label:"This month",
                value:numberValue(
                    data.thisMonth?.income,
                    data.thisMonthIncome
                )
            }
        ];

        return {
            heading:"Performance summary",
            period:"Overview",
            values:periods
        };
    }

    function renderChart(data){
        const source =
            extractChartArray(data) ||
            fallbackChart(data);

        let rows =
            source.values
                .map(
                    function(item,index){
                        return {
                            label:
                                labelForChartItem(
                                    item,
                                    index
                                ),

                            value:
                                valueForChartItem(
                                    item
                                )
                        };
                    }
                )
                .filter(
                    item =>
                        Number.isFinite(
                            item.value
                        )
                );

        if(rows.length > 12){
            rows =
                rows.slice(-12);
        }

        if(rows.length === 0){
            rows = [{
                label:"No data",
                value:0
            }];
        }

        const maximum =
            Math.max(
                1,
                ...rows.map(
                    row =>
                        Math.max(
                            0,
                            row.value
                        )
                )
            );

        const total =
            rows.reduce(
                (sum,row) =>
                    sum + row.value,
                0
            );

        byId("chartHeading")
            .textContent =
            source.heading;

        byId("chartPeriod")
            .textContent =
            source.period;

        byId("chartTotal")
            .textContent =
            money(total);

        const container =
            byId("chartBars");

        container.innerHTML = "";

        rows.forEach(
            function(row){
                const column =
                    document.createElement(
                        "div"
                    );

                column.className =
                    "chart-column";

                const bar =
                    document.createElement(
                        "div"
                    );

                bar.className =
                    "chart-bar";

                const percentage =
                    Math.max(
                        row.value > 0
                            ? 4
                            : 1,

                        Math.round(
                            (
                                Math.max(
                                    0,
                                    row.value
                                ) /
                                maximum
                            ) *
                            100
                        )
                    );

                bar.style.height =
                    percentage + "%";

                bar.dataset.value =
                    money(row.value);

                const label =
                    document.createElement(
                        "div"
                    );

                label.className =
                    "chart-label";

                label.textContent =
                    row.label;

                column.append(
                    bar,
                    label
                );

                container.appendChild(
                    column
                );
            }
        );
    }

    function salesArray(data){
        const candidates = [
            data.last10Sales,
            data.recentSales,
            data.latestSales,
            data.recentActivity
        ];

        return (
            candidates.find(
                Array.isArray
            ) ||
            []
        );
    }

    function saleDescription(item){
        return firstDefined(
            item.description,
            item.product_description,
            item.product,
            item.item,
            item.title,
            item.name,
            "Sale recorded"
        );
    }

    function saleAmount(item){
        return numberValue(
            item.sale_amount,
            item.amount,
            item.income,
            item.price,
            item.total
        );
    }

    function saleDate(item){
        return firstDefined(
            item.sale_date,
            item.date,
            item.created_at,
            item.createdAt,
            item.timestamp
        );
    }

    function formatActivityDate(value){
        if(!value){
            return "";
        }

        const date =
            new Date(value);

        if(
            Number.isNaN(
                date.getTime()
            )
        ){
            return safeText(value);
        }

        const now =
            new Date();

        const difference =
            now.getTime() -
            date.getTime();

        const minutes =
            Math.floor(
                difference / 60000
            );

        if(
            minutes >= 0 &&
            minutes < 60
        ){
            return minutes <= 1
                ? "Now"
                : minutes + "m";
        }

        const hours =
            Math.floor(
                difference / 3600000
            );

        if(
            hours >= 0 &&
            hours < 24
        ){
            return hours + "h";
        }

        return date.toLocaleDateString(
            "en-GB",
            {
                day:"numeric",
                month:"short"
            }
        );
    }

    function renderActivity(data){
        const sales =
            salesArray(data)
                .slice(0,5);

        const container =
            byId("activityList");

        container.innerHTML = "";

        if(!sales.length){
            const empty =
                document.createElement(
                    "div"
                );

            empty.className =
                "activity-empty";

            empty.textContent =
                "No recent sales were returned for the selected inventory.";

            container.appendChild(
                empty
            );

            return;
        }

        sales.forEach(
            function(item){
                const row =
                    document.createElement(
                        "div"
                    );

                row.className =
                    "activity-row";

                const icon =
                    document.createElement(
                        "span"
                    );

                icon.className =
                    "activity-icon";

                icon.textContent = "£";

                const copy =
                    document.createElement(
                        "div"
                    );

                copy.className =
                    "activity-copy";

                const title =
                    document.createElement(
                        "strong"
                    );

                title.textContent =
                    safeText(
                        saleDescription(item)
                    );

                const detail =
                    document.createElement(
                        "span"
                    );

                detail.textContent =
                    item.quantity
                        ? wholeNumber(
                            item.quantity
                          ) +
                          " sold"
                        : "Sale recorded";

                copy.append(
                    title,
                    detail
                );

                const meta =
                    document.createElement(
                        "div"
                    );

                meta.className =
                    "activity-meta";

                const amount =
                    document.createElement(
                        "strong"
                    );

                amount.textContent =
                    money(
                        saleAmount(item)
                    );

                const time =
                    document.createElement(
                        "time"
                    );

                time.textContent =
                    formatActivityDate(
                        saleDate(item)
                    );

                meta.append(
                    amount,
                    time
                );

                row.append(
                    icon,
                    copy,
                    meta
                );

                container.appendChild(
                    row
                );
            }
        );
    }

    async function loadDashboard(){
        if(loadingDashboard){
            return;
        }

        loadingDashboard = true;

        setStatus(
            "Refreshing dashboard..."
        );

        try{
            const results =
                await Promise.allSettled([
                    InventoryAPI.request(
                        "/dashboard?_t=" +
                        Date.now()
                    ),

                    InventoryAPI.request(
                        "/sales/tracker?_t=" +
                        Date.now()
                    )
                ]);

            const dashboardResult =
                results[0];

            const salesResult =
                results[1];

            const dashboardData =
                dashboardResult.status ===
                    "fulfilled"
                    ? dashboardResult.value
                    : null;

            const salesData =
                salesResult.status ===
                    "fulfilled"
                    ? salesResult.value
                    : null;

            const dashboardOk =
                Boolean(
                    dashboardData?.success
                );

            const salesOk =
                Boolean(
                    salesData?.success
                );

            if(
                !dashboardOk &&
                !salesOk
            ){
                throw new Error(
                    dashboardData?.error ||
                    salesData?.error ||
                    "Could not load dashboard data"
                );
            }

            setStats(
                dashboardOk
                    ? dashboardData
                    : {},

                salesOk
                    ? salesData
                    : {}
            );

            if(salesOk){
                renderChart(
                    salesData
                );

                renderActivity(
                    salesData
                );
            }else{
                renderChart({});
                renderActivity({});

                console.error(
                    "Sales tracker dashboard data failed:",
                    salesData?.error ||
                    salesResult.reason
                );
            }

            if(!dashboardOk){
                console.error(
                    "Inventory dashboard data failed:",
                    dashboardData?.error ||
                    dashboardResult.reason
                );
            }

            if(
                dashboardOk &&
                salesOk
            ){
                setStatus("");
            }else{
                setStatus(
                    "Some dashboard information could not be refreshed.",
                    "error"
                );
            }
        }catch(error){
            console.error(error);

            setStatus(
                error?.message ||
                "Could not load dashboard",
                "error"
            );
        }finally{
            loadingDashboard = false;
            hideLoading();
        }
    }

    function openSidebar(){
        document.body.classList.add(
            "sidebar-open"
        );

        byId("dashboardOverlay")
            .classList
            .add("show");

        byId("mobileMenuButton")
            .setAttribute(
                "aria-expanded",
                "true"
            );
    }

    function closeSidebar(){
        document.body.classList.remove(
            "sidebar-open"
        );

        byId("dashboardOverlay")
            .classList
            .remove("show");

        byId("mobileMenuButton")
            .setAttribute(
                "aria-expanded",
                "false"
            );
    }

    function bindEvents(){
        byId("logoutButton")
            .addEventListener(
                "click",
                function(){
                    InventoryAPI.logout();
                }
            );

        byId("mobileMenuButton")
            .addEventListener(
                "click",
                function(){
                    if(
                        document.body
                            .classList
                            .contains(
                                "sidebar-open"
                            )
                    ){
                        closeSidebar();
                    }else{
                        openSidebar();
                    }
                }
            );

        byId("dashboardOverlay")
            .addEventListener(
                "click",
                closeSidebar
            );

        document
            .querySelectorAll(
                ".sidebar-link"
            )
            .forEach(
                function(link){
                    link.addEventListener(
                        "click",
                        closeSidebar
                    );
                }
            );

        window.addEventListener(
            "inventory-selection-changed",
            function(){
                loadDashboard();

                if(
                    window.InventoryWorkspace
                ){
                    InventoryWorkspace.init();
                }
            }
        );

        window.addEventListener(
            "resize",
            function(){
                if(
                    window.innerWidth >
                    900
                ){
                    closeSidebar();
                }
            }
        );
    }

    async function start(){
        if(
            !InventoryAPI.isLoggedIn()
        ){
            window.location.replace(
                "login.html"
            );

            return;
        }

        setUserDetails();
        await refreshUserDetails();
        bindEvents();

        try{
            if(
                window.InventoryTheme
            ){
                await InventoryTheme
                    .loadFromAccount();
            }
        }catch(error){
            console.warn(
                "Could not load account theme",
                error
            );
        }

        try{
            if(
                window.InventoryTopbar
            ){
                await InventoryTopbar.init(
                    "inventory-topbar"
                );
            }
        }catch(error){
            console.warn(
                "Could not initialise inventory selector",
                error
            );
        }

        try{
            if(
                window.InventoryWorkspace
            ){
                await InventoryWorkspace.init();
            }
        }catch(error){
            console.warn(
                "Could not initialise workspace wording",
                error
            );
        }

        await loadDashboard();
    }

    return {
        start,
        loadDashboard
    };
})();

if(
    document.readyState ===
    "loading"
){
    document.addEventListener(
        "DOMContentLoaded",
        DashboardPage.start,
        {
            once:true
        }
    );
}else{
    DashboardPage.start();
}
