(function(){'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const W='inventoryos_selected_workspace_id',I='inventoryos_selected_inventory_ids';let inventories=[],groups=[],context=null,loading=null,host=null,draft=null,revision=0,lastNotice='';
const workspace=()=>localStorage.getItem(W)||'',ids=()=>{try{const v=JSON.parse(localStorage.getItem(I)||'[]');return Array.isArray(v)?v.map(String):[];}catch{return [];}};
const selection=()=>({workspace:workspace(),inventory:ids().join(',')});
const saveIds=value=>{const v=[...new Set(value.filter(Boolean).map(String))];localStorage.setItem(I,JSON.stringify(v));return v;};
async function request(path,w=workspace(),options={}){return InventoryAPI.request(path,{...options,headers:{'X-Workspace-Id':w,...(options.headers||{})}});}
function patch(){if(InventoryAPI.__retailLocationPatched)return;const original=InventoryAPI.request.bind(InventoryAPI);InventoryAPI.request=(path,options={})=>original(path,{...options,headers:{'X-Workspace-Id':workspace(),...(options.headers||{})}});InventoryAPI.__retailLocationPatched=true;}
async function loadContext(w){
 const [location,billing]=await Promise.all([request('/retail/locations',w),request('/billing/status',w)]);
 const group=groups.find(g=>g.id===w),base=inventories.filter(i=>String(i.workspace_id)===w);
 let stores=location.success?location.stores:null;
 if(!stores){const old=await request('/retail/platform',w);stores=base.map(i=>{const s=old.success?old.stores?.find(s=>s.inventory_id===i.id):null;return {id:i.id,inventory_name:i.name,display_name:s?.name||i.name,registered:Boolean(s),customer_number:s?.customer_number,plan_name:s?.entitlement?.plan_name||'Unavailable',allowed:s?.entitlement?.allowed};});}
 return {workspace:location.success?location.workspace:{id:w,name:group?.name||'Workspace',role:group?.role||'user'},stores,editable:location.locations_supported===true,billing:billing.success?billing.billing:null};
}
function identity(fallback){const chosen=ids()[0],store=context?.stores.find(s=>s.id===chosen),el=document.querySelector('#retailStoreIdentity');if(el){el.textContent=fallback||store?.display_name||'Store location';el.title='Open store location';}}
async function init(){
 patch();if(loading)return loading;
 loading=(async()=>{
  const [all,current]=await Promise.all([request('/workspaces/inventories'),request('/workspaces/current')]);if(!all.success)throw Error(all.error||'Could not load your stores');inventories=all.inventories||[];
  const map=new Map();for(const inv of inventories){const id=String(inv.workspace_id);if(!map.has(id))map.set(id,{id,name:inv.workspace_name||'Workspace',role:inv.workspace_role||'user'});}groups=[...map.values()];
  const w=groups.find(g=>g.id===workspace())?.id||groups.find(g=>g.id===current.workspace?.id)?.id||groups[0]?.id||'';if(w)localStorage.setItem(W,w);
  const available=inventories.filter(i=>String(i.workspace_id)===w),chosen=ids().find(id=>available.some(i=>i.id===id))||(available.find(i=>i.is_default)||available[0])?.id;saveIds(chosen?[chosen]:[]);
  context=await loadContext(w);identity();return true;
 })();try{return await loading;}catch{return false;}finally{loading=null;}
}
function status(message){lastNotice=message;const el=document.querySelector('#retailLocationNotice');if(el)el.textContent=message;else if(!document.querySelector('#retailLocationView'))host?.notice(message,true);}
function render(){
 const c=draft||context,selectedId=draft?.selectedId||ids()[0],store=c?.stores.find(s=>s.id===selectedId),role=c?.workspace.role||'user',editable=c?.editable&&store?.registered&&['owner','admin'].includes(role),billing=c?.billing;
 const select=(label,id,rows,current)=>`<label>${label}<select id="${id}" aria-label="${esc(label)}" required>${rows.map(r=>`<option value="${esc(r.id)}" ${r.id===current?'selected':''}>${esc(r.name)}</option>`).join('')}</select></label>`;
 return `<section class="retail-card"><h2>Choose your store</h2><form id="retailLocationChoose" class="retail-form">${select('Workspace','retailLocationWorkspace',groups,c?.workspace.id)}${select('Retail store','retailLocationStore',(c?.stores||[]).map(s=>({id:s.id,name:s.display_name})),selectedId)}<button class="retail-primary" ${!store?'disabled':''}>Use this store</button></form></section><p id="retailLocationNotice" role="status">${esc(lastNotice)}</p><section class="retail-card"><h2>Store details</h2><dl class="retail-location-details"><div><dt>Workspace</dt><dd>${esc(c?.workspace.name||'Unavailable')}</dd></div><div><dt>Your access</dt><dd>${esc(role)}</dd></div><div><dt>Retail display name</dt><dd>${esc(store?.display_name||'Choose a store')}</dd></div><div><dt>Original inventory name</dt><dd>${esc(store?.inventory_name||'Unavailable')}</dd></div><div><dt>Retail plan</dt><dd>${esc(store?.plan_name||'Retail inactive')}</dd></div><div><dt>InventoryOS account plan</dt><dd>${esc(billing?.plan_name||billing?.plan_key||'Unavailable')}</dd></div>${store?.customer_number?`<div><dt>Store customer number</dt><dd>${esc(store.customer_number)}</dd></div>`:''}${store?.override_active?`<div><dt>Retail access override</dt><dd>${store.override_expires_at?'Ends '+esc(new Date(store.override_expires_at).toLocaleString('en-GB')):'Active'} · returns to ${esc(store.reverts_to||'paid plan')}</dd></div>`:''}</dl></section>${store&&c?.workspace.id===workspace()&&store.id===ids()[0]?`<section class="retail-card"><h2>Retail display name</h2><form id="retailLocationName" class="retail-form" data-workspace="${esc(workspace())}" data-inventory="${esc(store.id)}" data-previous="${esc(store.display_name)}"><label>Store name or address<input name="display_name" maxlength="160" value="${esc(store.display_name)}" placeholder="e.g. Eccles — 12 High Street" ${!editable?'disabled':''}></label><p class="retail-help">Shown in Retail. The original inventory name stays ${esc(store.inventory_name)}. Leave blank to use that name.</p><button class="retail-primary" ${!editable?'disabled':''}>Save display name</button></form>${!c.editable?'<p class="retail-help">Install the Retail dashboard backend update to edit display names here.</p>':!store.registered?'<p class="retail-help">Set up this store in Stores & billing first.</p>':!editable?'<p class="retail-help">Only the workspace owner or an admin can change this name.</p>':''}</section>`:''}`;
}
function paint(){const root=document.querySelector('#retailLocationView');if(root)root.innerHTML=render();}
function mount(options){host=options;draft=null;lastNotice='';const root=document.querySelector('#retailLocationView'),g=++revision;if(root)root.innerHTML='<section class="retail-card"><p>Loading store location…</p></section>';init().then(()=>{if(g===revision&&root?.isConnected&&root===document.querySelector('#retailLocationView'))paint();}).catch(()=>{if(root?.isConnected)paint();});}
document.addEventListener('change',async e=>{
 if(e.target.id==='retailLocationWorkspace'){const w=e.target.value,g=++revision;try{const c=await loadContext(w);if(g!==revision||!document.querySelector('#retailLocationView'))return;draft={...c,selectedId:c.stores[0]?.id};paint();}catch(error){status(error.message);}}
 if(e.target.id==='retailLocationStore'){draft={...(draft||context),selectedId:e.target.value};paint();}
});
document.addEventListener('submit',async e=>{
 const form=e.target;if(!['retailLocationChoose','retailLocationName'].includes(form.id))return;e.preventDefault();const button=e.submitter;button.disabled=true;
 try{
  if(form.id==='retailLocationChoose'){
   const w=form.querySelector('#retailLocationWorkspace').value,id=form.querySelector('#retailLocationStore').value;if(!groups.some(g=>g.id===w)||!inventories.some(i=>String(i.workspace_id)===w&&i.id===id))throw Error('Choose an available workspace and store.');
   const reason=host?.changeBlocked();if(reason)throw Error(reason);
   localStorage.setItem(W,w);saveIds([id]);localStorage.setItem('inventoryos_retail_store',id);await init();draft=null;identity();window.dispatchEvent(new CustomEvent('inventory-selection-changed',{detail:{workspaceId:w,selectedIds:[id]}}));
  }else{
   if(form.dataset.workspace!==workspace()||form.dataset.inventory!==ids()[0])throw Error('Store changed. Reopen Store location before saving.');
   const result=await request('/retail/platform',workspace(),{method:'POST',body:JSON.stringify({action:'store-display-name',inventory_id:form.dataset.inventory,previous_name:form.dataset.previous,display_name:new FormData(form).get('display_name')})});if(!result.success)throw Error(result.error||'Could not save display name');await init();draft=null;await host.refresh();status('Retail display name saved. The original inventory name is unchanged.');
  }
 }catch(error){status(error.message);}finally{button.disabled=false;}
});
window.InventoryRetailLocation={init,mount,render,identity,selection};
// Retail keeps its existing selection API while replacing the banner with this page.
window.InventoryTopbar={init,getSelectedIds:ids,saveSelectedIds:saveIds,getSelectedWorkspaceId:workspace,saveSelectedWorkspaceId:id=>{if(id)localStorage.setItem(W,String(id));return workspace();},getHeaderValue:()=>ids().join(','),patchApiRequests:patch};
})();
