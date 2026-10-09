(function(){
'use strict';
const $=id=>document.getElementById(id),copy=v=>JSON.parse(JSON.stringify(v));
let data=null,layout=null,busy=false,dirty=false,generation=0;
function inventory(){return String(window.InventoryTopbar?.getHeaderValue?.()||window.InventoryAPI?.getSelectedInventoryHeader?.()||'');}
function workspace(){return localStorage.getItem('inventoryos_selected_workspace_id')||'';}
function singular(){return data?.settings?.location_label_singular||window.InventoryWorkspace?.getSettings?.()?.location_label_singular||'Box';}
function plural(){return data?.settings?.location_label_plural||window.InventoryWorkspace?.getSettings?.()?.location_label_plural||'Boxes';}
function name(value){return window.InventoryWorkspace?.formatLocationName?.(value)||value;}
function node(tag,text,className){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
function message(text){const el=$('stackOrderStatus');if(el)el.textContent=text;}
function changed(){dirty=true;message('Unsaved changes. Save stack order before consolidating.');}
function accessCosts(saved,available){
 const costs=Object.create(null),allowed=available?new Set(available):null;
 for(const stack of saved?.stacks||[]){let above=0;for(const location of stack.locations||[]){if(location&&(!allowed||allowed.has(location))){costs[location]=above;above++;}}}
 return costs;
}
async function loadForPicking(ids,ws){
 const result=await InventoryAPI.request('/stack-order',{headers:{'X-Inventory-Ids':ids,...(ws?{'X-Workspace-Id':ws}:{})}});
 if(!result.success||String(result.inventory_id)!==ids||(ws&&String(result.workspace_id)!==ws))throw Error(result.error||'Could not load this inventory’s stack order.');
 return accessCosts(result.layout,result.locations);
}
function render(){
 const host=$('stackOrderEditor');if(!host||!layout)return;host.replaceChildren();
 $('stackOrderIntro').textContent='How high are your '+plural().toLowerCase()+' stacked? Set a default, then arrange each stack from top to bottom. Each stack can have a different height.';
 $('stackDefaultHeightLabel').textContent='Default number of '+plural().toLowerCase()+' high';$('stackDefaultHeight').value=layout.default_height;
 const editable=data.can_edit&&!busy;
 for(const id of ['stackDefaultHeight','stackAdd','stackSave'])$(id).disabled=!editable;
 const used=new Set(layout.stacks.flatMap(s=>s.locations).filter(Boolean));
 layout.stacks.forEach((stack,index)=>{
  const card=node('section',undefined,'stack-order-card'),head=node('div',undefined,'stack-order-head');
  const label=node('label','Stack name'),input=node('input');input.value=stack.name;input.maxLength=80;input.disabled=!editable;input.addEventListener('input',()=>{stack.name=input.value;changed();});label.append(input);
  const heightLabel=node('label',singular()+' positions high'),height=node('input');height.type='number';height.min=1;height.max=100;height.step=1;height.value=stack.height;height.disabled=!editable;
  height.addEventListener('change',()=>{const value=Number(height.value);if(!Number.isInteger(value)||value<1||value>100){height.value=stack.height;return message('Enter a height between 1 and 100.');}if(value<stack.height&&stack.locations.slice(value).some(Boolean)){height.value=stack.height;return message('Clear the lower positions before reducing this stack’s height.');}stack.locations=Array.from({length:value},(_,i)=>stack.locations[i]||null);stack.height=value;changed();render();});heightLabel.append(height);
  const remove=node('button','Remove stack');remove.type='button';remove.disabled=!editable;remove.addEventListener('click',()=>{if(stack.locations.some(Boolean)&&!confirm('Remove '+stack.name+' from the layout? Its stock will stay where it is.'))return;layout.stacks.splice(index,1);changed();render();});head.append(label,heightLabel,remove);card.append(head);
  const positions=node('div',undefined,'stack-order-positions');
  stack.locations.forEach((location,level)=>{
   const row=node('label',undefined,'stack-order-position'),caption=node('span',(level===0?'Top':level===stack.height-1?'Bottom':'Level '+(level+1))+' • '+level+' position'+(level===1?'':'s')+' above'),select=node('select');select.disabled=!editable;select.setAttribute('aria-label',stack.name+', '+singular()+' at position '+(level+1)+' from top');
   const empty=node('option','Choose '+singular().toLowerCase());empty.value='';select.append(empty);
   const all=[...data.locations];if(location&&!all.includes(location))all.unshift(location);
   all.forEach(value=>{const option=node('option',name(value)+(!data.locations.includes(value)?' (no longer available)':''));option.value=value;option.disabled=(used.has(value)&&value!==location)||!data.locations.includes(value);select.append(option);});select.value=location||'';
   select.addEventListener('change',()=>{stack.locations[level]=select.value||null;changed();render();});
   row.append(caption,select);positions.append(row);
  });card.append(positions);host.append(card);
 });
 if(!layout.stacks.length)host.append(node('p','No stacks yet. Add a stack and choose its locations. Unassigned locations keep the normal picking rules.','stack-order-muted'));
 const unassigned=data.locations.filter(l=>!used.has(l));$('stackUnassigned').textContent=unassigned.length?'Unassigned: '+unassigned.map(name).join(', '):'All current locations are assigned.';
 if(!data.can_edit)message('You can view this layout. Your workspace role does not allow changes.');
}
async function load(){
 if(!$('stackOrderEditor')||busy)return;
 if(dirty&&!confirm('Discard unsaved stack order changes and reload?'))return;
 const ids=inventory(),ws=workspace(),g=++generation;data=null;layout=null;$('stackOrderEditor').replaceChildren();
 for(const id of ['stackDefaultHeight','stackAdd','stackSave'])$(id).disabled=true;
 if(ids.split(',').filter(Boolean).length!==1)return message('Select exactly one inventory in the header to arrange its stacks.');
 busy=true;message('Loading stack order…');
 try{const result=await InventoryAPI.request('/stack-order',{headers:{'X-Inventory-Ids':ids,...(ws?{'X-Workspace-Id':ws}:{})}});if(g!==generation||ids!==inventory()||ws!==workspace())return;if(!result.success||String(result.inventory_id)!==ids||(ws&&String(result.workspace_id)!==ws))throw Error(result.error||'Could not load Stack order. Install the backend update first.');data=result;layout=copy(result.layout);dirty=false;message('Layout for '+result.inventory_name+'. Top position is easiest to reach. Saving changes the picking preference, not your stock.');}
 catch(e){if(g===generation)message(e.message||'Could not load Stack order.');}finally{if(g===generation){busy=false;render();}}
}
async function save(){
 if(busy||!data?.can_edit||!layout)return;
 const ids=inventory(),ws=workspace(),g=generation,payload=copy(layout);busy=true;render();message('Saving stack order…');
 try{const result=await InventoryAPI.request('/stack-order',{method:'PUT',headers:{'X-Inventory-Ids':ids,...(ws?{'X-Workspace-Id':ws}:{})},body:JSON.stringify({layout:payload,revision:data.revision})});if(g!==generation||ids!==inventory()||ws!==workspace())return;if(!result.success)throw Error(result.error||'Could not save stack order.');data.layout=result.layout;data.revision=result.revision;layout=copy(result.layout);dirty=false;message(result.message);window.dispatchEvent(new CustomEvent('inventoryos-stack-order-changed'));}
 catch(e){if(g===generation)message(e.message||'Could not save stack order.');}finally{if(g===generation){busy=false;render();}}
}
function init(){
 if(!$('stackOrderEditor'))return;
 $('stackDefaultHeight').addEventListener('change',()=>{if(!layout)return;const value=Number($('stackDefaultHeight').value);if(!Number.isInteger(value)||value<1||value>100){$('stackDefaultHeight').value=layout.default_height;return message('Enter a height between 1 and 100.');}layout.default_height=value;changed();});
 $('stackAdd').addEventListener('click',()=>{if(!layout||busy)return;if(layout.stacks.length>=100)return message('Use at most 100 stacks.');layout.stacks.push({name:'Stack '+(layout.stacks.length+1),height:layout.default_height,locations:Array(layout.default_height).fill(null)});changed();render();});
 $('stackSave').addEventListener('click',save);$('stackReload').addEventListener('click',load);
 document.querySelector('[data-settings-tab="stackPanel"]')?.addEventListener('click',()=>{if(!data&&!busy)load();});
 if(!$('stackPanel').hidden)load();
 window.addEventListener('inventory-selection-changed',()=>{++generation;dirty=false;busy=false;data=null;layout=null;load();});
 window.addEventListener('inventoryos-location-wording-changed',()=>{if(layout)render();});
 window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
}
window.InventoryStackOrder={accessCosts,loadForPicking,load,save};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
