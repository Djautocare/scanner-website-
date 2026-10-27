// Deliberately no imports, storage, API, email, printing or billing integrations.
export const coreSteps=['location-create','location-confirm','location-saved','add-name','add-qty','add-location','add-save','add-saved','remove-search','remove-select','remove-qty','remove-consolidate','remove-confirm','remove-approve','remove-saved','dashboard-check','guide-find','guide-open','core-done'];
export const optionalSteps={dispatch:['dispatch-send','dispatch-working','dispatch-preview','dispatch-print','dispatch-done'],expenses:['expenses-name','expenses-amount','expenses-receipt','expenses-save','expenses-done'],barcodes:['barcodes-create','barcodes-preview','barcodes-done'],reorders:['reorders-rule','reorders-order','reorders-receive','reorders-assign','reorders-done'],team:['team-access','team-save','team-done']};
const allSteps=new Set([...coreSteps,...Object.values(optionalSteps).flat(),'explore']);
export function escapeHTML(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export function validStep(value){return allSteps.has(value)?value:'location-create';}
export function positiveInteger(value,max=1000){const n=Number(value);return Number.isSafeInteger(n)&&n>=1&&n<=max?n:null;}
export function createPractice(progress={}){
 const step=validStep(progress.step),index=coreSteps.indexOf(step),advanced=index<0;
 const locationCreated=index>=2||advanced,stockAdded=index>=7||advanced,stockRemoved=index>=14||advanced;
 return {step,coreComplete:progress.coreComplete===true||index>=18||advanced,explored:new Set(progress.explored||[]),location:locationCreated?{name:'BOX-1',notes:''}:null,item:{name:'Thermal label roll',barcode:'DEMO-10001',qty:stockAdded?(stockRemoved?1:2):0},form:{name:'Thermal label roll',qty:2,location:'',search:'',removeQty:1,expenseName:'Packing supplies',expensePence:650,receipt:false,role:'viewer'},bundle:false,consolidated:false,expenses:[],labels:[],printJob:false,order:null,activity:stockRemoved?['Removed 1 × Thermal label roll','Added 2 × Thermal label roll']:stockAdded?['Added 2 × Thermal label roll']:[],importPhase:0};
}
export function addPracticeStock(model,{name,qty,location}){
 const units=positiveInteger(qty);name=String(name||'').trim();
 if(!name||name.length>100||!units||!model.location||location!==model.location.name)throw Error('Enter an item name, a whole-number quantity and the practice location.');
 model.item={...model.item,name,qty:units};model.activity.unshift('Added '+units+' × '+name);return model;
}
export function removePracticeStock(model,qty){
 const units=positiveInteger(qty,model.item.qty);
 if(!units||!model.bundle||!model.consolidated)throw Error('Select the practice item and consolidate a valid quantity first.');
 model.item.qty-=units;model.activity.unshift('Removed '+units+' × '+model.item.name);model.bundle=false;model.consolidated=false;return model;
}
export function reorderQuantity(model,target=10){return Math.max(0,target-model.item.qty);}
export function receivePracticeOrder(model){if(!model.order||model.order.status!=='ordered')throw Error('Mark the practice order as ordered first.');model.order.status='holding';return model;}
export function assignPracticeOrder(model){if(model.order?.status!=='holding'||!model.location)throw Error('Receive the practice order before assigning it.');model.item.qty+=model.order.qty;model.order.status='assigned';model.activity.unshift('Assigned '+model.order.qty+' received units to '+model.location.name);return model;}
