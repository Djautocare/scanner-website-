'use strict';
// The marker is public UI state, not a credential. The actual session is an
// opaque HttpOnly, Secure, host-only cookie owned by api.inventoryos.co.uk.
(function(){
 const nativeFetch=window.fetch.bind(window),MARKER='inventoryos-cookie-session-v1',TOKEN='inventoryos_token',USER='inventoryos_user';
 let base='https://api.inventoryos.co.uk',capable=false,started=null;
 function local(){return ['localhost','127.0.0.1'].includes(location.hostname);}
 function allowedBase(value){try{const u=new URL(value,location.href);return u.origin==='https://api.inventoryos.co.uk'||local()&&['localhost','127.0.0.1'].includes(u.hostname)&&['http:','https:'].includes(u.protocol);}catch{return false;}}
 function cookieMode(){return localStorage.getItem(TOKEN)===MARKER;}
 function save(token,user,mode){if(mode==='cookie'||token===MARKER){localStorage.setItem(TOKEN,MARKER);}else if(token){localStorage.setItem(TOKEN,token);}if(user)localStorage.setItem(USER,JSON.stringify(user));}
 function clear(){localStorage.removeItem(TOKEN);localStorage.removeItem(USER);}
 function configure(value){if(!allowedBase(value))throw Error('InventoryOS API address is not trusted');const next=String(value).replace(/\/$/,'');if(next!==base){base=next;started=null;capable=false;}return ready();}
 async function ready(){if(started)return started;started=(async()=>{try{
  const response=await nativeFetch(base+'/auth/security/capabilities',{credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(5000)});if(!response.ok)return;const data=await response.json();capable=data.cookie_sessions===true;
  const legacy=localStorage.getItem(TOKEN);if(!capable||!legacy||legacy===MARKER)return;
  const exchange=await nativeFetch(base+'/auth/security/exchange',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json',Authorization:'Bearer '+legacy},body:'{}',cache:'no-store'});if(!exchange.ok)return;
  // Verify that the browser really retained the cookie before discarding the
  // previous JWT. Older backends keep working until their update is installed.
  const check=await nativeFetch(base+'/auth/security/status',{credentials:'include',cache:'no-store'});if(check.ok&&(await check.json()).session_mode==='cookie'&&localStorage.getItem(TOKEN)===legacy)save(MARKER);
 }catch{/* Network loss/old backend: retain the existing login for now. */}})();return started;}
 window.fetch=async function(input,options={}){
  let url;try{url=new URL(typeof input==='string'||input instanceof URL?input:input.url,location.href);}catch{return nativeFetch(input,options);}
  const api=new URL(base);if(url.origin!==api.origin||!url.pathname.startsWith(api.pathname.replace(/\/$/,'')+'/'))return nativeFetch(input,options);
  await ready();const headers=new Headers(input instanceof Request?input.headers:undefined);new Headers(options.headers||{}).forEach((v,k)=>headers.set(k,v));if(headers.get('Authorization')==='Bearer '+MARKER)headers.delete('Authorization');
  // Till-only device/PIN credentials remain separate from the owner session.
  const till=url.pathname.startsWith(api.pathname.replace(/\/$/,'')+'/retail-pos');
  return nativeFetch(input,{...options,headers,credentials:till?'omit':capable||cookieMode()?'include':options.credentials||'same-origin'});
 };
 async function logout(){await ready();if(capable||cookieMode()){const response=await nativeFetch(base+'/auth/security/logout',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:'{}',cache:'no-store'});if(!response.ok)throw Error('Could not sign out securely. Reconnect and try again.');}clear();}
 window.InventorySession=Object.freeze({configure,ready,save,clear,logout,allowedBase,getToken:()=>localStorage.getItem(TOKEN),isLoggedIn:()=>Boolean(localStorage.getItem(TOKEN)),isCookieSession:cookieMode,marker:MARKER});
})();
