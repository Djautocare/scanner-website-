
let pendingVerificationEmail = "";

function setStatus(message, type){
    const status = document.getElementById("status");
    status.className = "status " + (type || "");
    status.innerText = message || "";
}

function hideAll(){
    document.getElementById("loginForm").classList.add("hidden");
    document.getElementById("registerForm").classList.add("hidden");
    document.getElementById("verifyForm").classList.add("hidden");
}

function showLogin(){
    hideAll();
    document.getElementById("loginForm").classList.remove("hidden");
    document.getElementById("subtitle").innerText = "Login to your inventory system";
    setStatus("");
}

function showRegister(){
    hideAll();
    document.getElementById("registerForm").classList.remove("hidden");
    document.getElementById("subtitle").innerText = "Create your InventoryOS account";
    setStatus("");
}

function showVerify(email){
    pendingVerificationEmail = email || "";
    hideAll();
    document.getElementById("verifyForm").classList.remove("hidden");
    document.getElementById("verifyEmailText").innerText = pendingVerificationEmail;
    document.getElementById("subtitle").innerText = "Verify your email address";
    setStatus("Account created. Please verify your email before logging in.", "success");
}

function togglePassword(id, button){
    const input = document.getElementById(id);
    if(input.type === "password"){
        input.type = "text";
        button.innerText = "Hide";
    }else{
        input.type = "password";
        button.innerText = "Show";
    }
}

function updateStrength(){
    const password = document.getElementById("registerPassword").value;
    const fill = document.getElementById("strengthFill");
    const text = document.getElementById("strengthText");

    let score = 0;
    if(password.length >= 10) score++;
    if(/[A-Z]/.test(password)) score++;
    if(/[0-9]/.test(password)) score++;
    if(/[^A-Za-z0-9]/.test(password)) score++;

    if(score <= 1){
        fill.style.width = "25%";
        fill.style.background = "#ff6b6b";
        text.innerText = "Weak password";
    }else if(score === 2 || score === 3){
        fill.style.width = "65%";
        fill.style.background = "#ffb84d";
        text.innerText = "Fair password";
    }else{
        fill.style.width = "100%";
        fill.style.background = "#63d471";
        text.innerText = "Strong password";
    }
}

async function redirectAfterLogin(){
    const requested = new URLSearchParams(window.location.search).get("returnTo");
    if(["/retail/index.html","/retail/dashboard/index.html","/retail/billing.html"].includes(requested)){
        window.location.href=requested;
        return;
    }
    try{
        const data = await InventoryAPI.request("/billing/status");

        if(data && data.success && data.billing){
            const billing = data.billing;

            const accountAllowed = typeof billing.account_access_allowed === "boolean"
                ? billing.account_access_allowed
                : billing.access_allowed;
            if(!billing.plan_selected || !accountAllowed){
                window.location.href = "billing.html";
                return;
            }
        }

        const requested = new URLSearchParams(window.location.search).get("returnTo");
        window.location.href = requested === "/retail/dashboard/index.html" ? requested : "index.html";

    }catch(error){
        console.error(error);
        window.location.href = "billing.html";
    }
}

async function login(){
    try{
        setStatus("Logging in...");

        const email = document.getElementById("loginEmail").value.trim();
        const password = document.getElementById("loginPassword").value;

        const data = await InventoryAPI.login(email, password);

        if(data.mfa_required){
            document.getElementById("loginPassword").value="";
            InventorySecurity.loginChallenge(data.challenge,()=>{setStatus("Login successful.","success");redirectAfterLogin();});
            return;
        }
        if(!data.success){
            if(data.requiresVerification){
                pendingVerificationEmail = email;
                showVerify(email);
                setStatus(data.error || "Please verify your email first.", "error");
                return;
            }

            setStatus(data.error || "Login failed", "error");
            return;
        }

        InventoryAPI.saveSession(data.token, data.user, data.session_mode);
        setStatus("Login successful. Checking plan...", "success");

        setTimeout(function(){
            redirectAfterLogin();
        }, 600);

    }catch(error){
        console.error(error);
        setStatus("Could not connect to server", "error");
    }
}

async function register(){
    const consent = document.getElementById("acceptPolicies");
    if(!consent.checked){
        setStatus("Please agree to the Privacy Policy and confirm you have read the Data & Security information to create an account.", "error");
        consent.focus();
        return;
    }

    try{
        setStatus("Creating account...");

        const name = document.getElementById("registerName").value.trim();
        const email = document.getElementById("registerEmail").value.trim();
        const password = document.getElementById("registerPassword").value;
        const marketingEmailsOptIn = document.getElementById("marketingEmailsOptIn").checked;

        const data = await InventoryAPI.register(name, email, password, marketingEmailsOptIn);

        if(!data.success){
            setStatus(data.error || "Registration failed", "error");
            return;
        }

        if(data.requiresVerification){
            showVerify(data.email || email);
            return;
        }

        setStatus("Account created.", "success");

    }catch(error){
        console.error(error);
        setStatus("Could not connect to server", "error");
    }
}

async function resendVerification(){
    if(!pendingVerificationEmail){
        setStatus("No email address found. Please try registering again.", "error");
        return;
    }

    try{
        setStatus("Sending verification email...");

        const data = await InventoryAPI.request("/auth/resend-verification", {
            method:"POST",
            body:JSON.stringify({ email: pendingVerificationEmail })
        });

        if(!data.success){
            setStatus(data.error || "Could not resend verification email", "error");
            return;
        }

        setStatus(data.message || "Verification email sent.", "success");

    }catch(error){
        console.error(error);
        setStatus("Could not connect to server", "error");
    }
}

document.addEventListener("keydown", function(e){
    if(e.key === "Enter"){
        if(!document.getElementById("loginForm").classList.contains("hidden")){
            login();
        }else if(!document.getElementById("registerForm").classList.contains("hidden")){
            register();
        }
    }
});

if(InventoryAPI.isLoggedIn()){
    redirectAfterLogin();
}else if(new URLSearchParams(location.search).get("view")==="register"){
    showRegister();
}
