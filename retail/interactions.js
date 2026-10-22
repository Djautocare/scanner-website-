(function(){
 'use strict';
 // A field's blur/change runs between pointer-down and click. Keep the pressed
 // control in the DOM until its native click/submit has been delivered.
 let pressed=null,timer=null;
 const pending=new Set();
 function release(){clearTimeout(timer);pressed=null;const jobs=[...pending];pending.clear();for(const render of jobs)render();}
 document.addEventListener('pointerdown',event=>{
  release();
  pressed=event.target.closest('button,a,input[type="submit"],input[type="button"]');
  if(pressed?.disabled)pressed=null;
 },true);
 document.addEventListener('click',()=>{if(pressed){clearTimeout(timer);timer=setTimeout(release,0);}},true);
 window.addEventListener('pointerup',()=>{if(pressed)timer=setTimeout(release,500);},true);
 window.addEventListener('pointercancel',release,true);
 window.addEventListener('blur',release);
 window.InventoryRetailInteractions={defer(render){if(!pressed?.isConnected)return false;pending.add(render);return true;}};
})();
