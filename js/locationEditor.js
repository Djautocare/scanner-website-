/* Location names/notes use the existing inventory-scoped boxes API. */
(function(){
 'use strict';
 let dialog,form,nameInput,notesInput,message,confirmButton,cancelButton,state,opening=false,saving=false;
 function words(){return typeof locationWords==='function'?locationWords():{singular:'Location',singularLower:'location'};}
 function selected(){return InventoryAPI.getSelectedInventoryHeader();}
 function initialise(){
  if(dialog)return;
  dialog=document.createElement('dialog');dialog.className='location-editor';dialog.setAttribute('aria-labelledby','locationEditorTitle');dialog.setAttribute('data-location-wording-ignore','');
  dialog.innerHTML='<form id="locationEditorForm"><h2 id="locationEditorTitle"></h2><label for="locationEditorName">Name</label><input id="locationEditorName" name="name" type="text" maxlength="100" autocomplete="off" aria-describedby="locationEditorHint"><small id="locationEditorHint">Tap box to edit</small><label for="locationEditorNotes">Notes <span>(optional)</span></label><textarea id="locationEditorNotes" name="notes" maxlength="2000" rows="3" placeholder="For example: garage, left wall, top of the stack"></textarea><p id="locationEditorMessage" role="alert" aria-live="polite"></p><div class="location-editor-actions"><button type="button" class="location-editor-cancel">Cancel</button><button type="submit" class="location-editor-confirm">Confirm</button></div></form>';
  document.body.append(dialog);form=dialog.querySelector('form');nameInput=dialog.querySelector('input');notesInput=dialog.querySelector('textarea');message=dialog.querySelector('[role=alert]');confirmButton=dialog.querySelector('[type=submit]');cancelButton=dialog.querySelector('[type=button]');
  form.addEventListener('submit',save);cancelButton.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('cancel',event=>{if(saving)event.preventDefault();});
  dialog.addEventListener('close',()=>{state=null;form.reset();message.textContent='';});
  document.addEventListener('click',event=>{
   const button=event.target.closest('[data-location-edit]');if(!button)return;
   const item=allBoxes.find(box=>String(box.id)===button.dataset.locationEdit&&(!box.inventory_id||String(box.inventory_id)===selected()));
   if(item)open(item);
  });
  window.addEventListener('inventory-selection-changed',()=>{if(dialog.open&&!saving)dialog.close();});
 }
 function busy(value){saving=value;confirmButton.disabled=value;cancelButton.disabled=value;nameInput.disabled=value;notesInput.disabled=value;confirmButton.textContent=value?'Saving…':state?.item?'Save changes':'Confirm';}
 async function open(item=null){
  initialise();if(opening||saving||dialog.open)return;
  const inventory=selected();
  if(!inventory||inventory.split(',').filter(Boolean).length!==1){alert('Select just one inventory to create or edit a location.');return;}
  opening=true;state={item,inventory,suggested:''};form.reset();message.textContent='';nameInput.placeholder='';
  dialog.querySelector('h2').textContent=(item?'Edit ':'Create ')+words().singularLower;
  dialog.querySelector('#locationEditorHint').textContent='Tap box to edit';
  busy(false);dialog.showModal();
  if(item){nameInput.value=item.box;notesInput.value=item.notes||'';nameInput.focus();nameInput.select();opening=false;return;}
  nameInput.disabled=true;confirmButton.disabled=true;message.textContent='Finding the next available name…';cancelButton.focus();
  const current=state;
  try{
   const result=await InventoryAPI.request('/boxes/suggestion?_t='+Date.now(),{headers:{'X-Inventory-Ids':inventory}});
   if(state!==current||selected()!==inventory)return;
   if(!result.success||!result.suggested_name)throw new Error(result.error||'Install the location update on your backend, then reload this page.');
   state.suggested=result.suggested_name;nameInput.placeholder=result.suggested_name;nameInput.disabled=false;confirmButton.disabled=false;message.textContent='';
  }catch(error){if(state===current)message.textContent=error.message||'Could not load a suggested name. Please retry.';}
  finally{opening=false;}
 }
 async function save(event){
  event.preventDefault();if(saving||opening||!state)return;
  const current=state;
  if(selected()!==current.inventory){message.textContent='The selected inventory changed. Close this form and try again.';return;}
  const name=nameInput.value.trim()||current.suggested;
  if(!name){message.textContent='Enter a location name.';nameInput.focus();return;}
  if(name.length>100||/[\x00-\x1f\x7f]/.test(name)){message.textContent='Use a name of at most 100 characters without control characters.';return;}
  const body=current.item?{name,notes:notesInput.value,expected_name:current.item.box,expected_notes:current.item.notes||''}:{box_name:name,notes:notesInput.value};
  busy(true);message.textContent='';
  try{
   const result=await InventoryAPI.request(current.item?'/boxes/'+encodeURIComponent(current.item.id):'/boxes',{method:current.item?'PATCH':'POST',headers:{'X-Inventory-Ids':current.inventory},body:JSON.stringify(body)});
   if(!result.success)throw new Error(result.error||'Could not save the location.');
   if(current.item&&localStorage.getItem('lastAddLocation')===current.item.box)localStorage.setItem('lastAddLocation',result.box.box_name);
   dialog.close();if(selected()===current.inventory)await loadBoxes();
  }catch(error){message.textContent=error.message||'Could not save the location.';}
  finally{busy(false);}
 }
 window.InventoryLocationEditor={open};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialise,{once:true});else initialise();
})();
