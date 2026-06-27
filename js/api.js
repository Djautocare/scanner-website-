const InventoryAPI = (function(){
    function detectApiBase(){
        const savedApiBase = localStorage.getItem("inventoryos_api_base");

        if(savedApiBase){
            return savedApiBase.replace(/\/$/, "");
        }

        // Local testing from file:// or local GitHub repo 
        if(window.location.protocol === "file:"){
            return "http://localhost:3000";
        }

        // Local browser testing
        if(
            window.location.hostname === "localhost" ||
            window.location.hostname === "127.0.0.1"
        ){
            return "http://localhost:3000";
        }

        // Live website on GitHub/Cloudflare Pages talks to your PC through Cloudflare Tunnel
        return "https://api.inventoryos.co.uk";
    }

    const API_BASE = detectApiBase();
    const TOKEN_KEY = "inventoryos_token";
    const USER_KEY = "inventoryos_user";

    function getToken(){
        return localStorage.getItem(TOKEN_KEY);
    }

    function getUser(){
        try{
            return JSON.parse(localStorage.getItem(USER_KEY) || "null");
        }catch(error){
            return null;
        }
    }

    function saveSession(token, user){
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(USER_KEY, JSON.stringify(user || null));
    }

    function logout(){
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        window.location.href = "login.html";
    }

    function isLoggedIn(){
        return !!getToken();
    }

    function requireLogin(){
        if(!getToken()){
            window.location.href = "login.html";
            return false;
        }
        return true;
    }

    async function request(path, options = {}){
        const token = getToken();

        const headers = {
            ...(options.headers || {})
        };

        const isFormData =
            typeof FormData !== "undefined" &&
            options.body instanceof FormData;

        if(!isFormData){
            headers["Content-Type"] = headers["Content-Type"] || "application/json";
        }

        if(token){
            headers.Authorization = "Bearer " + token;
        }

        const response = await fetch(API_BASE + path, {
            ...options,
            headers
        });

        const data = await response.json().catch(() => ({
            success:false,
            error:"Invalid server response"
        }));

        if(response.status === 401){
            logout();
            return data;
        }

        return data;
    }

    function login(email, password){
        return request("/auth/login", {
            method:"POST",
            body:JSON.stringify({ email, password })
        });
    }

    function register(name, email, password){
        return request("/auth/register", {
            method:"POST",
            body:JSON.stringify({ name, email, password })
        });
    }

    function me(){
        return request("/me");
    }

    function getProducts(search = ""){
        const query = search ? "?search=" + encodeURIComponent(search) : "";
        return request("/products" + query);
    }

    function addStock({ barcode = "", description, qty = 1, box_name }){
        return request("/stock/add", {
            method:"POST",
            body:JSON.stringify({
                barcode,
                description,
                qty:Number(qty || 1),
                box_name
            })
        });
    }

    function getBoxes(){
        return request("/boxes");
    }

    return {
        API_BASE,
        getToken,
        getUser,
        saveSession,
        logout,
        isLoggedIn,
        requireLogin,
        request,
        login,
        register,
        me,
        getProducts,
        addStock,
        getBoxes
    };
})();
