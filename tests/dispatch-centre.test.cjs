const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('js/pages/dispatch-centre.1.js','utf8');
const between=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));

test('both mobile print controls share files and restore their own labels',async()=>{
  const buttons=new Map();const shared=[];let prepared=0;
  const button=id=>{if(typeof id!=='string')throw new Error('A click event is not a button ID');if(!buttons.has(id))buttons.set(id,{id,disabled:false,addEventListener(type,callback){this.callback=callback;}});return buttons.get(id);};
  const context={document:{getElementById:button},getQueuedCourierLabels:()=>[{packId:11}],getMobilePrintSignature:()=> '11',preparedMobilePrintFile:null,preparedMobilePrintSignature:'',prepareMobilePrintFile:async()=>{prepared++;return {name:'labels.pdf'};},navigator:{canShare:()=>true,share:async data=>shared.push(data)},setMobileShareStatus(){},openMobilePrintFallback(){throw new Error('Should use available file sharing');},alert:message=>{throw new Error(message);},console};
  vm.createContext(context);
  vm.runInContext(between('async function shareLabelsForMobile(', 'const dropzone ='),context);
  vm.runInContext(between('document.getElementById("mobileShareLabelsBtn").addEventListener(', '/*\n    MANUAL PRINT'),context);
  for(const id of ['mobileShareLabelsBtn','mobileShareQueueLabelsBtn']){
    await button(id).callback({type:'click',target:button(id)});
    assert.equal(button(id).disabled,false);
  }
  assert.equal(prepared,2);assert.equal(shared.length,2);
  assert.equal(button('mobileShareLabelsBtn').textContent,'Mobile print / PDF');
  assert.equal(button('mobileShareQueueLabelsBtn').textContent,'Mobile print labels');
});

function queueEngine(){
  const requests=[];let selected='workspace-1',renders=0;
  const context={dispatchQueueLoadVersion:0,queueCache:[],localStorage:{getItem:key=>key.includes('workspace')?selected:'["inventory-1"]'},apiFetch:()=>new Promise(resolve=>requests.push(data=>resolve({json:async()=>data}))),getMobilePrintSignature:()=>'',getQueuedCourierLabels:()=>[],clearPreparedMobilePrint(){},renderQueue(){renders++;},queueEl:{innerHTML:''},escapeHtml:String};
  vm.createContext(context);vm.runInContext(between('async function loadQueue(){','async function updateItem('),context);
  return {context,requests,select:value=>selected=value,renders:()=>renders};
}
test('a slow old queue response cannot replace the newer queue',async()=>{
  const e=queueEngine();const old=e.context.loadQueue(),fresh=e.context.loadQueue();
  e.requests[1]({success:true,packs:[{id:22}]});await fresh;
  e.requests[0]({success:true,packs:[{id:11}]});await old;
  assert.equal(e.context.queueCache[0].id,22);assert.equal(e.renders(),1);
});
test('a queue response from the previous workspace is discarded',async()=>{
  const e=queueEngine();const pending=e.context.loadQueue();e.select('workspace-2');
  e.requests[0]({success:true,packs:[{id:11}]});await pending;
  assert.equal(e.context.queueCache.length,0);assert.equal(e.renders(),0);
});
test('an imported label with no detected items remains available for review',()=>{
  let labelView=0;const context={queueCache:[{id:11,status:'needs_review',items:[]}],currentView:'location',queueEl:{innerHTML:''},window:{InventoryDispatchLayout:{rememberQueueDetails:()=>new Set(),restoreQueueDetails(){},updateQueue(){}}},buildPickRows:()=>[],renderLocationView(){throw new Error('No pick rows exist');},renderLabelView(){labelView++;},renderPrintPreviewLabels(){}};
  vm.createContext(context);vm.runInContext(between('function renderQueue(){','function renderLocationView('),context);context.renderQueue();
  assert.equal(labelView,1);assert(!context.queueEl.innerHTML.includes('queue is clear'));
});
test('the drop area is keyboard accessible and does not reopen its own input click',()=>{
  let opened=0,prevented=0;const handlers={};const fileInput={click(){opened++;},addEventListener(){}};
  const dropzone={addEventListener:(type,callback)=>handlers[type]=callback,classList:{add(){},remove(){}}};
  const context={dropzone,fileInput,browseBtn:{addEventListener(){}},setFiles(){}};
  vm.createContext(context);vm.runInContext(between('browseBtn.addEventListener("click"','processBtn.addEventListener('),context);
  handlers.click({target:fileInput});assert.equal(opened,0);
  handlers.click({target:dropzone});assert.equal(opened,1);
  handlers.keydown({target:dropzone,key:' ',preventDefault(){prevented++;}});
  assert.equal(opened,2);assert.equal(prevented,1);
});
