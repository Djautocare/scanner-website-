'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {preview,readCsv,orderRequest,template,orderExport}=require('../workspace/order-import.js');
const columns='channel,order_reference,barcode,quantity,unit_price,order_date\n';
const products=[
  {id:'a07e96d1-8438-4a98-8f61-111111111111',barcode:'TXT-1',description:'Fictional test product'},
  {id:'a07e96d1-8438-4a98-8f61-222222222222',barcode:'0123',description:'Fictional label roll'}
];
test('CSV preview groups items by channel and order, preserves prices and leading zeroes, and writes nothing',()=>{
  const rows=[
    'ebay,"SAMPLE,1",TXT-1,1,14.20,2026-11-15',
    'ebay,"SAMPLE,1",0123,2,,2026-11-15',
    'manual,"SAMPLE,1",TXT-1,1,0,'
  ];
  const orders=preview('\uFEFF'+columns+rows.join('\r\n'),products);
  assert.equal(orders.length,2);
  assert.equal(orders[0].reference,'SAMPLE,1');
  assert.equal(orders[0].ordered_at,'2026-11-15T12:00:00.000Z');
  assert.deepEqual(orders[0].lines.map(({product_id,unit_price_pence})=>[product_id,unit_price_pence]),[[products[0].id,1420],[products[1].id,null]]);
  assert.equal(orders[1].lines[0].unit_price_pence,0);
});
test('CSV preview rejects unknown or ambiguous inventory matches and dates, malformed fields and invalid prices',()=>{
  assert.throws(()=>preview(columns+'ebay,SAMPLE,bad,1,1,',products),/exactly one product/);
  assert.throws(()=>preview(columns+'ebay,SAMPLE,TXT-1,1,1,',[...products,products[0]]),/exactly one product/);
  assert.throws(()=>preview(columns+'ebay,SAMPLE,TXT-1,1,1,2026-02-31',products),/valid order date/);
  assert.throws(()=>preview(columns+'ebay,SAMPLE,TXT-1,0,1,2026-11-15',products),/whole number/);
  assert.throws(()=>preview(columns+'ebay,SAMPLE,TXT-1,1,12.200,',products),/pounds and pence/);
  assert.throws(()=>readCsv('"missing,no newline'),/closing quote/);
  assert.throws(()=>readCsv('"wrong"safe'),/Unexpected text/);
});
test('repeated previews generate the same request ID regardless of item-line order',async()=>{
  const left=preview(columns+'ebay,SAMPLE,TXT-1,1,10,\nebay,SAMPLE,0123,2,5,',products)[0];
  const right=preview(columns+'ebay,SAMPLE,0123,2,5,\nebay,SAMPLE,TXT-1,1,10,',products)[0];
  const request=await orderRequest(left);
  assert.deepEqual(request,await orderRequest(right));
  assert.match(request.request_id,/^[a-f\d-]{36}$/);
  assert.ok(request.lines.every(line=>!Object.hasOwn(line,'description')));
  right.lines[0].qty=4;
  assert.notEqual(request.request_id,(await orderRequest(right)).request_id);
});
test('CSV exports neutralise formula prefixes and preserve quoting',()=>{
  const file=orderExport([{channel:'ebay',reference:'  =SUM(1,2)',lines:[{barcode:'"x"',qty:2,unit_price_pence:50}]}]);
  assert.ok(file.includes('"\'  =SUM(1,2)"'));
  assert.equal(readCsv(file)[1][2],'"x"');
  assert.equal(readCsv(template())[0][0],'channel');
});
