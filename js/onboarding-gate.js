/* Account-scoped tutorial progress only. Practice stock never enters browser storage. */
(function(){
 'use strict';
 if(window.InventoryGettingStarted)return;
 const prefix='inventoryos_getting_started_v1:',memory=new Map();
 const stockPages=new Set(['','index','add','remove','discard','refund','search','move','boxes','boxcontents','boxlabels','barcodeprinting','dispatch-centre','salestracker','expenses','stale','corrections','reorders','reorder-rule','reprint','printjobs','shipping-labels','snapshotbox','mysteryboxes']);
 function owner(){try{const u=JSON.parse(localStorage.getItem('inventoryos_user')||'null');return u?.id!=null?String(u.id):u?.email?String(u.email).trim().toLowerCase():null;}catch{return null;}}
 function authenticated(){try{return Boolean(localStorage.getItem('inventoryos_token')&&owner());}catch{return false;}}
 function key(id=owner()){return id?prefix+encodeURIComponent(id):null;}
 function read(){const k=key();if(!k)return null;try{const raw=JSON.parse(localStorage.getItem(k)||'null');return raw?.version===1&&['pending','complete'].includes(raw.status)?raw:null;}catch{return memory.get(k)||null;}}
 function write(value,expectedOwner=owner()){
  if(!expectedOwner||expectedOwner!==owner())return false;
  const progress={version:1,status:value.status==='complete'?'complete':'pending',step:typeof value.step==='string'?value.step.slice(0,60):'location-create',coreComplete:value.coreComplete===true,explored:Array.isArray(value.explored)?value.explored.filter(x=>['dispatch','expenses','barcodes','reorders','team'].includes(x)):[]};
  memory.set(key(),progress);try{localStorage.setItem(key(),JSON.stringify(progress));}catch{}return true;
 }
 function begin(){if(!authenticated())return false;if(read()?.status==='complete'){location.assign('/index.html');return true;}write({status:'pending',step:'location-create',coreComplete:false});location.assign('/getting-started.html');return true;}
 function finish(expectedOwner){return write({status:'complete',step:'finished',coreComplete:true,explored:read()?.explored||[]},expectedOwner);}
 function enforce(){
  if(!authenticated()||read()?.status!=='pending')return;
  const path=location.pathname;
  if(path.includes('/retail/')||path.includes('/manufacturing/')||path.split('/').filter(Boolean).length>1)return;
  const page=path.split('/').pop().replace(/\.html$/i,'');
  if(stockPages.has(page))location.replace('/getting-started.html');
 }
 window.InventoryGettingStarted={owner,authenticated,read,write,begin,finish,enforce};
 enforce();
})();
