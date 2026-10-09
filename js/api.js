const InventoryAPI=(function(){function detectApiBase(){const saved=localStorage.getItem("inventoryos_api_base");if(saved)return saved.replace(/\/$/,"");if(window.location.protocol==="file:"||window.location.hostname==="localhost"||window.location.hostname==="127.0.0.1")return "http://localhost:3000";return "https://api.inventoryos.co.uk";}const API_BASE=detectApiBase(),TOKEN_KEY="inventoryos_token",USER_KEY="inventoryos_user",INVENTORY_SELECTION_KEY="inventoryos_selected_inventory_ids";function getToken(){return localStorage.getItem(TOKEN_KEY)}function getUser(){try{return JSON.parse(localStorage.getItem(USER_KEY)||"null")}catch{return null}}function clearSession(){localStorage.removeItem(TOKEN_KEY);localStorage.removeItem(USER_KEY)}function saveSession(token,user){localStorage.setItem(TOKEN_KEY,token);localStorage.setItem(USER_KEY,JSON.stringify(user||null))}function logout(){clearSession();window.location.href="login.html"}function isLoggedIn(){return!!getToken()}function requireLogin(){if(!getToken()){window.location.href="login.html";return false}return true}function getSelectedInventoryHeader(){try{if(window.InventoryTopbar&&typeof InventoryTopbar.getHeaderValue==="function")return InventoryTopbar.getHeaderValue();const parsed=JSON.parse(localStorage.getItem(INVENTORY_SELECTION_KEY)||"[]");return Array.isArray(parsed)?parsed.filter(Boolean).map(String).join(","):""}catch{return""}}async function request(path,options={}){const token=getToken(),headers={...(options.headers||{})},isFormData=typeof FormData!=="undefined"&&options.body instanceof FormData;if(!isFormData)headers["Content-Type"]=headers["Content-Type"]||"application/json";if(token)headers.Authorization="Bearer "+token;const selected=getSelectedInventoryHeader();if(selected&&!headers["X-Inventory-Ids"])headers["X-Inventory-Ids"]=selected;let response;try{response=await fetch(API_BASE+path,{...options,headers})}catch{return{success:false,error:"Could not connect to InventoryOS"}}const data=await response.json().catch(()=>({success:false,error:"Invalid server response"}));if(response.status===401&&token){clearSession();if(!window.location.pathname.toLowerCase().endsWith("/login.html"))window.location.href="login.html"}return data}function login(email,password){return request("/auth/login",{method:"POST",body:JSON.stringify({email,password})})}function register(name,email,password,marketingEmailsOptIn=false){return request("/auth/register",{method:"POST",body:JSON.stringify({name,email,password,marketingEmailsOptIn:!!marketingEmailsOptIn})})}function me(){return request("/me")}function getProducts(search=""){return request("/products"+(search?"?search="+encodeURIComponent(search):""))}function addStock({barcode="",description,qty=1,box_name}){return request("/stock/add",{method:"POST",body:JSON.stringify({barcode,description,qty:Number(qty||1),box_name})})}function getBoxes(){return request("/boxes")}return{API_BASE,getToken,getUser,clearSession,saveSession,logout,isLoggedIn,requireLogin,getSelectedInventoryHeader,request,login,register,me,getProducts,addStock,getBoxes}})();


/* A failed batch-pick transaction changes no stock. Confirmation retries the same request with the reviewed batch hashes. */
(function(){
 const original=InventoryAPI.request.bind(InventoryAPI);
 InventoryAPI.request=async function(path,options={}){
  let current={...options},body;
  const eligible=/^\/stock\/remove(?:\?|$)/.test(path)||/^\/move\//.test(path)||/^\/reorder\/orders\/assign(?:\?|$)/.test(path)||/^\/shipping-labels\/[^/]+\/packed(?:\?|$)/.test(path);
  if(!eligible)return original(path,options);
  try{body=JSON.parse(options.body||'{}');}catch{return original(path,options);}
  const confirmed=Array.isArray(body.manufacturing_confirmed_picks)?[...body.manufacturing_confirmed_picks]:[];
  for(let n=0;n<200;n++){
   const result=await original(path,current);
   if(!result?.batch_pick_required||!result.batch_plan)return result;
   const plan=result.batch_plan;if(confirmed.includes(plan.hash))return {success:false,error:'Batch confirmation could not be applied. Refresh and try again.'};
   const accepted=window.InventoryManufacturing?await window.InventoryManufacturing.confirmPick(plan):window.confirm('Pick from '+plan.location+'\n'+plan.picks.map(x=>x.batch_code+': '+x.qty).join('\n')+'\n\nConfirm these batches?');
   if(!accepted)return {success:false,error:'Batch picking cancelled. Stock was not changed.'};
   confirmed.push(plan.hash);current={...options,body:JSON.stringify({...body,manufacturing_confirmed_picks:confirmed})};
  }
  return {success:false,error:'Too many batch picks for one operation. Split this into smaller operations.'};
 };
 function load(){if(!InventoryAPI.isLoggedIn()||window.InventoryManufacturing)return;const s=document.createElement('script');s.src='js/manufacturingShared.js?v=1';s.async=true;document.head.append(s);}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});else load();
})();


(function(){
 function loadBusinessTrial(){
  if(!InventoryAPI.isLoggedIn()||window.InventoryBusinessTrial||document.getElementById('inventoryos-business-trial-script'))return;
  const script=document.createElement('script');script.id='inventoryos-business-trial-script';script.src='js/businessTrial.js?v=2';script.async=true;document.head.append(script);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',loadBusinessTrial,{once:true});else loadBusinessTrial();
})();

