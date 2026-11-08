(function(){
'use strict';
const $=id=>document.getElementById(id), esc=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const money=n=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(Number(n)/100);
const apiBase=InventoryAPI.API_BASE;
const endpoint=path=>apiBase+'/platform'+path;
async function api(path,{body,publicOnly=false,manualStripeRedirect=false}={}){
 const options=body===undefined?{}:{method:'POST',body:JSON.stringify(body),headers:{'Content-Type':'application/json'}};
 let r;
 if(publicOnly&&!InventoryAPI.isLoggedIn()){
  const response=await fetch(endpoint(path),{...options,credentials:'omit'});
  r=await response.json().catch(()=>({success:false,error:'Unable to load this page'}));
 }else r=await InventoryAPI.request('/platform'+path,{...options,...(manualStripeRedirect?{manualStripeRedirect:true}:{})});
 if(!r?.success)throw Object.assign(Error(r?.error||'Could not complete this request'),{code:r?.code,mfa_required:r?.mfa_required});
 return r;
}
function status(s='',error=false){
 const el=$('pf-status');if(!el)return;el.textContent=s;el.classList.toggle('pf-error',error);
}
function showAccessGate(host,error,retry){
 if(!host||!(error?.mfa_required||String(error?.code||'').startsWith('MFA_')))return false;
 host.hidden=false;
 host.innerHTML='<section class="pf-card"><h2>Protect your account</h2><p>'+esc(error.message||error.error||'Two-factor authentication is required.')+'</p><div class="pf-actions"><button type="button" data-mfa-retry>Check access again</button><a class="pf-button" href="/settings.html#account-settings-security">Security settings</a></div></section>';
 const actions=host.querySelector('.pf-actions');
 if(error.code==='MFA_SETUP_REQUIRED'&&window.InventorySecurity?.setup){
  const b=document.createElement('button');b.type='button';b.className='primary';b.textContent='Set up two-factor authentication';
  b.onclick=()=>window.InventorySecurity.setup();actions.prepend(b);
 }
 if(error.code==='MFA_LOGIN_REQUIRED'){
  const a=document.createElement('a');a.className='pf-button primary';a.textContent='Sign in with your authenticator';
  const target=location.pathname==='/admin.html'?'/admin.html':location.pathname+location.search;
  a.href='/login.html?returnTo='+encodeURIComponent(target);actions.prepend(a);
 }
 host.querySelector('[data-mfa-retry]').onclick=async()=>{try{await retry();}catch(e){showAccessGate(host,e,retry);}};
 return true;
}
function task(button,fn){
 return async e=>{
  e?.preventDefault();if(button?.dataset.running==='1')return;
  if(button){button.dataset.running='1';button.disabled=true;}
  status('');
  try{await fn(e);}catch(err){status(err.message,true);}
  finally{if(button){delete button.dataset.running;button.disabled=false;}}
 };
}
function bindForm(form,fn){
 const button=form.querySelector('[type=submit]');
 form.onsubmit=task(button,()=>fn(Object.fromEntries(new FormData(form)),form));
}
function input(label,name,value='',opts=''){
 return '<label>'+esc(label)+'<input name="'+esc(name)+'" value="'+esc(value)+'" '+opts+'></label>';
}
function select(label,name,options,selected=''){
 return '<label>'+esc(label)+'<select name="'+esc(name)+'">'+options.map(([v,t])=>'<option value="'+esc(v)+'" '+(String(v)===String(selected)?'selected':'')+'>'+esc(t)+'</option>').join('')+'</select></label>';
}
function check(label,name,on=false){
 return '<label class="pf-check"><input name="'+esc(name)+'" type="checkbox" '+(on?'checked':'')+'> '+esc(label)+'</label>';
}
function table(rows){
 if(!rows.length)return '<p class="pf-muted">No records for this selection.</p>';
 const cols=Object.keys(rows[0]);
 return '<div class="pf-table"><table><thead><tr>'+cols.map(x=>'<th scope="col">'+esc(x.replaceAll('_',' '))+'</th>').join('')+
  '</tr></thead><tbody>'+rows.map(r=>'<tr>'+cols.map(k=>'<td>'+esc(r[k]==null?'—':typeof r[k]==='object'?JSON.stringify(r[k]):r[k])+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
}
function download(name,data,type='application/json'){
 const url=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function imageData(file){
 if(!file||!file.size||file.size>16*1024*1024)throw Error('Choose a photo under 16 MB');
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Choose a JPEG, PNG or WebP photo');
 const bitmap=await createImageBitmap(file);
 try{
  const canvas=document.createElement('canvas'),scale=Math.min(1,1200/Math.max(bitmap.width,bitmap.height));canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
  return canvas.toDataURL('image/jpeg',.84).split(',')[1];
 }finally{bitmap.close();}
}
window.PlatformUI={$,esc,money,endpoint,api,status,task,bindForm,input,select,check,table,download,imageData,showAccessGate};
})();
