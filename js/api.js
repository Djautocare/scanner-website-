const InventoryAPI=(function(){
 function detectApiBase(){const local=['localhost','127.0.0.1'].includes(location.hostname),saved=localStorage.getItem('inventoryos_api_base');if(saved&&(!window.InventorySession||InventorySession.allowedBase(saved)))return saved.replace(/\/$/,'');if(location.protocol==='file:'||local)return 'http://localhost:3000';return 'https://api.inventoryos.co.uk';}
 const API_BASE=detectApiBase(),TOKEN_KEY='inventoryos_token',USER_KEY='inventoryos_user',INVENTORY_SELECTION_KEY='inventoryos_selected_inventory_ids';
 if(window.InventorySession)InventorySession.configure(API_BASE);
 function getToken(){return window.InventorySession?InventorySession.getToken():localStorage.getItem(TOKEN_KEY);}
 function getUser(){try{return JSON.parse(localStorage.getItem(USER_KEY)||'null');}catch{return null;}}
 function clearSession(){if(window.InventorySession)InventorySession.clear();else{localStorage.removeItem(TOKEN_KEY);localStorage.removeItem(USER_KEY);}}
 function saveSession(token,user,mode){if(window.InventorySession)InventorySession.save(token,user,mode);else{localStorage.setItem(TOKEN_KEY,token);localStorage.setItem(USER_KEY,JSON.stringify(user||null));}}
 function loginURL(){return location.pathname.startsWith('/retail/')?'login.html?returnTo=%2Fretail%2Fdashboard%2Findex.html':'login.html';}
 async function logout(){try{if(window.InventorySession)await InventorySession.logout();else clearSession();location.href=loginURL();}catch(e){alert(e.message||'Could not sign out. Reconnect and try again.');}}
 function isLoggedIn(){return !!getToken();}
 function requireLogin(){if(!getToken()){location.href=loginURL();return false;}return true;}
 function getSelectedInventoryHeader(){try{if(window.InventoryTopbar&&typeof InventoryTopbar.getHeaderValue==='function')return InventoryTopbar.getHeaderValue();const parsed=JSON.parse(localStorage.getItem(INVENTORY_SELECTION_KEY)||'[]');return Array.isArray(parsed)?parsed.filter(Boolean).map(String).join(','):'';}catch{return '';}}
 async function request(path,options={}){const token=getToken(),headers={...(options.headers||{})},isFormData=typeof FormData!=='undefined'&&options.body instanceof FormData;if(!isFormData)headers['Content-Type']=headers['Content-Type']||'application/json';if(token)headers.Authorization='Bearer '+token;const selected=getSelectedInventoryHeader();if(selected&&!headers['X-Inventory-Ids'])headers['X-Inventory-Ids']=selected;let response;try{response=await fetch(API_BASE+path,{...options,headers});}catch{return {success:false,error:'Could not connect to InventoryOS'};}const data=await response.json().catch(()=>({success:false,error:'Invalid server response'}));if(response.status===401&&token){clearSession();if(!location.pathname.toLowerCase().endsWith('/login.html'))location.href=loginURL();}return data;}
 function login(email,password){return request('/auth/login',{method:'POST',body:JSON.stringify({email,password})});}
 function register(name,email,password,marketingEmailsOptIn=false){return request('/auth/register',{method:'POST',body:JSON.stringify({name,email,password,marketingEmailsOptIn:!!marketingEmailsOptIn})});}
 function me(){return request('/me');}
 function getProducts(search=''){return request('/products'+(search?'?search='+encodeURIComponent(search):''));}
 function addStock({barcode='',description,qty=1,box_name}){return request('/stock/add',{method:'POST',body:JSON.stringify({barcode,description,qty:Number(qty||1),box_name})});}
 function getBoxes(){return request('/boxes');}
 return {API_BASE,getToken,getUser,clearSession,saveSession,logout,isLoggedIn,requireLogin,getSelectedInventoryHeader,request,login,register,me,getProducts,addStock,getBoxes};
})();



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
  const script=document.createElement('script');script.id='inventoryos-business-trial-script';script.src='js/businessTrial.js?v=3';script.async=true;document.head.append(script);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',loadBusinessTrial,{once:true});else loadBusinessTrial();
})();

// Add Retail navigation/settings only after the existing account is authenticated.
(function(){
 function loadRetail(){
  if(!InventoryAPI.isLoggedIn()||window.InventoryRetail||document.getElementById('inventoryos-retail-script'))return;
  const script=document.createElement('script');script.id='inventoryos-retail-script';script.src='retail/shared.js?v=7';script.async=true;document.head.append(script);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',loadRetail,{once:true});else loadRetail();
})();



