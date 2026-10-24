
const API_BASE = "https://api.inventoryos.co.uk";

const params = new URLSearchParams(window.location.search);
const token = params.get("token");

async function verifyEmail(){
    const message = document.getElementById("message");
    const loginLink = document.getElementById("loginLink");

    if(!token){
        message.className = "message error";
        message.textContent = "Invalid verification link.";
        loginLink.style.display = "inline-block";
        return;
    }

    try{
        const res = await fetch(`${API_BASE}/auth/verify-email`, {
            method:"POST",
            headers:{ "Content-Type":"application/json" },
            body:JSON.stringify({ token })
        });

        const data = await res.json();

        if(data.success){
            localStorage.removeItem("inventoryos_token");
            localStorage.removeItem("inventoryos_user");

            message.className = "message success";
            message.textContent = "Email verified successfully. You can now log in.";
            loginLink.style.display = "inline-block";
        }else{
            message.className = "message error";
            message.textContent = data.error || "Verification failed.";
            loginLink.style.display = "inline-block";
        }

    }catch(error){
        message.className = "message error";
        message.textContent = "Server error. Please try again.";
        loginLink.style.display = "inline-block";
    }
}

verifyEmail();
