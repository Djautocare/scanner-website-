(function(root){
'use strict';
const fields=['channel','order_reference','barcode','quantity','unit_price','order_date'];
const channels=new Set(['manual','vinted','ebay','other']);
const csvText=(value)=>String(value??'').trim();
const invalid=(text)=>new Error(text);

function readCsv(source){
  const rows=[];
  let row=[],field='',inside=false,closed=false;
  source=source.replace(/^\uFEFF/,'');
  if(source.length>256_000)throw invalid('Choose a CSV file under 256 KB.');
  const finishField=()=>{
    row.push(field);
    field='';
    closed=false;
  };
  const finishRow=()=>{
    finishField();
    if(row.some(value=>value.trim()))rows.push(row);
    row=[];
    if(rows.length>501)throw invalid('Import a maximum of 500 item lines at a time.');
  };
  for(let i=0;i<source.length;i++){
    const char=source[i];
    if(inside){
      if(char==='"'){
        if(source[i+1]==='"'){field+='"';i++;}
        else{inside=false;closed=true;}
      }else field+=char;
      continue;
    }
    if(char===','){finishField();continue;}
    if(char==='\n'||char==='\r'){
      if(char==='\r'&&source[i+1]==='\n')i++;
      finishRow();
      continue;
    }
    if(closed)throw invalid('Unexpected text after a quoted CSV field.');
    if(char==='"'){
      if(field)throw invalid('A CSV quote must start an empty field.');
      inside=true;
    }else field+=char;
  }
  if(inside)throw invalid('A quoted CSV field is missing its closing quote.');
  if(field||row.length||closed)finishRow();
  return rows;
}

function parsePrice(value){
  if(!value)return null;
  if(!/^\d{1,7}(?:\.\d{1,2})?$/.test(value))throw invalid('Unit prices must be pounds and pence, such as 9.95.');
  const [pounds,pence='']=value.split('.');
  const total=Number(pounds)*100+Number(pence.padEnd(2,'0'));
  if(total>100_000_000)throw invalid('A unit price exceeds the accepted limit.');
  return total;
}

function orderDate(value){
  if(!value)return undefined;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw invalid('Use YYYY-MM-DD for order dates.');
  const parsed=new Date(value+'T12:00:00Z');
  if(Number.isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==value)throw invalid('Enter a valid order date.');
  return parsed.toISOString();
}

function preview(source,products){
  const [heading,...rows]=readCsv(source);
  if(!heading||heading.length!==fields.length||fields.some((key,i)=>heading[i].trim().toLowerCase()!==key))throw invalid('Use the InventoryOS CSV template and keep the original column order.');
  if(!rows.length)throw invalid('Add at least one item line to the CSV file.');
  const barcodes=new Map();
  for(const p of products){
    const barcode=csvText(p.barcode);
    if(!barcode)continue;
    const matches=barcodes.get(barcode)||[];
    matches.push(p);
    barcodes.set(barcode,matches);
  }
  const grouped=new Map();
  rows.forEach((row,index)=>{
    try{
      if(row.length!==fields.length)throw invalid('The number of fields does not match the template.');
      const [channel,reference,barcode,quantity,price,date]=row.map(csvText);
      if(!channels.has(channel)||!reference||reference.length>100)throw invalid('Choose a supported sales channel and order reference.');
      if(!/^[1-9]\d{0,6}$/.test(quantity)||Number(quantity)>1_000_000)throw invalid('Quantity must be a whole number from 1 to 1000000.');
      const matches=barcodes.get(barcode);
      if(matches?.length!==1)throw invalid('Match the barcode to exactly one product in the selected inventories.');
      const key=JSON.stringify([channel,reference]);
      const ordered_at=orderDate(date);
      const order=grouped.get(key)||{channel,reference,ordered_at,lines:[]};
      if(order.ordered_at!==ordered_at)throw invalid('Each line for an order must have the same date.');
      const [product]=matches;
      order.lines.push({product_id:product.id,qty:Number(quantity),unit_price_pence:parsePrice(price),description:product.description});
      if(order.lines.length>100)throw invalid('Each order can contain up to 100 item lines.');
      grouped.set(key,order);
      if(grouped.size>50)throw invalid('Import up to 50 orders at a time.');
    }catch(error){throw invalid('Item line '+(index+1)+'. '+error.message);}
  });
  return [...grouped.values()];
}

async function orderRequest(order){
  const lines=order.lines.map(({product_id,qty,unit_price_pence})=>({product_id,qty,unit_price_pence}))
    .sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b),'en'));
  const body={channel:order.channel,reference:order.reference,ordered_at:order.ordered_at,lines};
  const data=await root.crypto.subtle.digest('SHA-256',new TextEncoder().encode('inventoryos-order-csv-v1:'+JSON.stringify(body)));
  const hash=[...new Uint8Array(data)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
  const request_id=hash.slice(0,8)+'-'+hash.slice(8,12)+'-5'+hash.slice(13,16)+'-8'+hash.slice(17,20)+'-'+hash.slice(20,32);
  return {...body,request_id};
}
function csv(rows){
  return rows.map(row=>row.map(value=>{
    let text=String(value??'');
    if(/^[\s\uFEFF]*[=+@-]/.test(text)||/^[\t\r\n]/.test(text))text="'"+text;
    return '"'+text.replaceAll('"','""')+'"';
  }).join(',')).join('\r\n')+'\r\n';
}
const template=()=>csv([fields,['ebay','EXAMPLE-ORDER','EXAMPLE-BARCODE','1','9.95','2026-11-15']]);
const orderExport=orders=>csv([fields,...orders.flatMap(order=>(order.lines||[]).map(line=>[
  order.channel,order.reference||order.id,line.barcode,line.qty,line.unit_price_pence==null?'':(line.unit_price_pence/100).toFixed(2),
  (order.original_order_at||order.ordered_at||'').slice(0,10)
]))]);
const api={readCsv,preview,orderRequest,template,orderExport};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
else root.InventoryOrderImport=api;
})(globalThis);
