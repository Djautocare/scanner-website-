'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

test('Dispatch has an A4 invoice action in the queue and packing view',()=>{
  const queue=read('js/dispatchWorkflow.js');
  assert.equal((queue.match(/data-dispatch-invoice=/g)||[]).length,2);
  assert.match(read('dispatch-centre.html'),/dispatchInvoices\.js/);
  assert.match(read('platform/sale-invoice.css'),/@page ioInvoice\{size:A4/);
  const document=read('platform/sale-invoice.js');
  assert.match(document,/Original invoice date/);
  assert.match(document,/VAT breakdown/);
  assert.match(document,/Amount due/);
});

test('the parcel invoice action uses the scoped order API and stops when inventory changes',async()=>{
  let click, invoice, selected='inventory-one';
  const calls=[];
  vm.runInNewContext(read('js/dispatchInvoices.js'),{
    document:{addEventListener(event,callback){assert.equal(event,'click');click=callback;}},
    localStorage:{getItem:()=> 'sample-workspace'},
    InventoryAPI:{getSelectedInventoryHeader:()=>selected,async request(path,options){calls.push({path,options});return {success:true,invoice:{number:'SAMPLE-1'}};}},
    InventorySaleInvoice:{open(options){invoice=options;}},
  });
  const button=ref=>({target:{closest:()=>({dataset:{dispatchInvoice:ref}})}});
  click(button('invalid'));
  assert.equal(invoice,undefined);
  click(button('123'));
  assert.equal(invoice.reference,'123');
  await invoice.load();
  assert.equal(calls[0].path,'/workspace-orders/packing/123/invoice');
  await invoice.record('123',{action:'payment'});
  assert.equal(calls[1].path,'/workspace-orders/packing/123/invoice/account');
  assert.equal(calls[1].options.method,'POST');
  selected='inventory-two';
  await assert.rejects(invoice.submit('123',{action:'issue'}),/inventory changed/);
  assert.equal(calls.length,2);
});
