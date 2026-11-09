(function () {
'use strict';

const { api, esc } = PlatformUI;
const sizes = {
  a4: { label:'A4', width:210, height:297, qr:65, text:[26,13] },
  a5: { label:'A5', width:148, height:210, qr:48, text:[21,11] },
  a6: { label:'A6', width:105, height:148, qr:38, text:[16,10] },
  letter: { label:'Letter', width:215.9, height:279.4, qr:65, text:[26,13] },
  '6x4': { label:'6 × 4 in · landscape', width:152.4, height:101.6, qr:40, text:[18,10], thermal:true },
  '4x6': { label:'4 × 6 in · portrait', width:101.6, height:152.4, qr:40, text:[18,10], thermal:true },
  '3x2': { label:'3 × 2 in', width:76.2, height:50.8, qr:24, text:[11,8], thermal:true },
  '2x1': { label:'2 × 1 in', width:50.8, height:25.4, qr:18, text:[9,7], thermal:true, compact:true }
};
const fonts = ['Arial','Georgia','Verdana','Trebuchet MS','Courier New'];
const alignments = ['center','left','right'];
const clamp = (value,min,max,fallback) => Number.isFinite(Number(value)) ? Math.min(max,Math.max(min,Number(value))) : fallback;
const choices = (values,selected) => values.map(v=>`<option ${v===selected?'selected':''}>${esc(v)}</option>`).join('');
const assetPromises = new Map();

function loadScript(src, loaded) {
  if (loaded()) return Promise.resolve();
  if (assetPromises.has(src)) return assetPromises.get(src);
  const pending = new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src=src;
    script.onload=()=>loaded()?resolve():reject(Error('The printing tools did not load.'));
    script.onerror=()=>reject(Error('The printing tools did not load. Refresh and try again.'));
    document.head.append(script);
  }).catch(error=>{assetPromises.delete(src);throw error;});
  assetPromises.set(src,pending);
  return pending;
}

function initial(shop,key) {
  const defaults = {
    size:'a4', layout:'stack', qr:65, printer:'shipping',
    blocks:[
      { text:shop.name, font:'Georgia', size:26, align:'center', position:'before', bold:true },
      { text:'Scan to shop again', font:'Arial', size:13, align:'center', position:'after', bold:false }
    ]
  };
  try {
    const saved=JSON.parse(localStorage.getItem(key));
    if (!Object.hasOwn(sizes,saved?.size) || !Array.isArray(saved.blocks)) return defaults;
    return {
      size:saved.size, layout:saved.layout==='side'?'side':'stack',
      qr:clamp(saved.qr,16,180,sizes[saved.size].qr), printer:saved.printer==='product'?'product':'shipping',
      blocks:saved.blocks.slice(0,4).filter(b=>b&&typeof b.text==='string').map(b=>({
        text:b.text.slice(0,120), font:fonts.includes(b.font)?b.font:'Arial',
        size:clamp(b.size,6,72,12), align:alignments.includes(b.align)?b.align:'center',
        position:b.position==='before'?'before':'after', bold:b.bold===true
      }))
    };
  } catch { return defaults; }
}

function wrappedLines(context,text,maxWidth) {
  const lines=[];
  let line='';
  for (const word of text.trim().split(/\s+/u).filter(Boolean)) {
    const combined=line?line+' '+word:word;
    if(context.measureText(combined).width<=maxWidth){line=combined;continue;}
    if(line){lines.push(line);line='';}
    for(const char of word) {
      if(line&&context.measureText(line+char).width>maxWidth){lines.push(line);line='';}
      line+=char;
    }
  }
  if(line)lines.push(line);
  return lines;
}

function draw(canvas,code,design,dpi) {
  const page=sizes[design.size], scale=dpi/25.4;
  canvas.width=Math.round(page.width*scale);
  canvas.height=Math.round(page.height*scale);
  const ctx=canvas.getContext('2d');
  ctx.scale(scale,scale);
  ctx.fillStyle='#fff';
  ctx.fillRect(0,0,page.width,page.height);
  const margin=page.thermal?1.5:8;
  const gap=page.thermal?1.5:4;
  const width=page.width-2*margin, height=page.height-2*margin;
  const side=design.layout==='side';
  const qr=Math.min(design.qr,height,side?width-13:width);
  const textWidth=side?width-qr-gap:width;
  const blocks=design.blocks.filter(b=>b.text.trim()).map(b=>{
    const font=(b.bold?'bold ':'')+b.size*25.4/72+'px "'+b.font+'"';
    ctx.font=font;
    const lines=wrappedLines(ctx,b.text,textWidth);
    return {...b,font,lines,lineHeight:b.size*25.4/72*1.24};
  });
  const heightOf=group=>group.reduce((total,b)=>total+b.lines.length*b.lineHeight+gap,0);
  const before=blocks.filter(b=>b.position==='before'), after=blocks.filter(b=>b.position!=='before');
  const textHeight=heightOf([...before,...after]);
  const needed=side?Math.max(qr,textHeight):qr+textHeight;
  let y=(page.height-needed)/2;
  const fits=needed<=height+.05&&qr>=16;
  function textGroup(group,left,top){
    for(const b of group){
      ctx.font=b.font;
      ctx.fillStyle='#151621';
      ctx.textBaseline='top';
      ctx.textAlign=b.align;
      const x=left+(b.align==='left'?0:b.align==='right'?textWidth:textWidth/2);
      for(const line of b.lines){ctx.fillText(line,x,top,textWidth);top+=b.lineHeight;}
      top+=gap;
    }
    return top;
  }
  if(!side)y=textGroup(before,margin,y);
  else textGroup([...before,...after],margin+qr+gap,(page.height-textHeight)/2);
  const x=side?margin:(page.width-qr)/2;
  const originY=side?(page.height-qr)/2:y;
  ctx.fillStyle='#fff';
  ctx.fillRect(x,originY,qr,qr);
  ctx.fillStyle='#000';
  const ratio=qr/256;
  const pixel=v=>Math.round(v*scale)/scale;
  for(const box of code.querySelectorAll('rect')){
    const l=Number(box.getAttribute('x')), t=Number(box.getAttribute('y'));
    const w=Number(box.getAttribute('width')), h=Number(box.getAttribute('height'));
    const left=pixel(x+l*ratio), top=pixel(originY+t*ratio);
    ctx.fillRect(left,top,pixel(x+(l+w)*ratio)-left,pixel(originY+(t+h)*ratio)-top);
  }
  if(!side)textGroup(after,margin,y+qr+(after.length?gap:0));
  return fits;
}

function browserPrint(canvas,page) {
  document.querySelector('#mq-print-page')?.remove();
  document.querySelector('#mq-print-size')?.remove();
  const css=document.createElement('style');
  css.id='mq-print-size';
  css.textContent=`@page{size:${page.width}mm ${page.height}mm;margin:0}
    @media print{html,body{margin:0!important;padding:0!important;background:white!important}
    body>*:not(#mq-print-page){display:none!important}
    #mq-print-page{display:block!important;width:${page.width}mm;height:${page.height}mm;overflow:hidden}
    #mq-print-page img{display:block;width:100%;height:100%;margin:0}}`;
  const sheet=document.createElement('div');
  sheet.id='mq-print-page';
  sheet.hidden=true;
  const image=document.createElement('img');
  image.alt='Mi Marché storefront QR print design';
  image.src=canvas.toDataURL('image/png');
  sheet.append(image);
  document.head.append(css);
  document.body.append(sheet);
  return image.decode().then(()=>{
    const cleanup=()=>{sheet.remove();css.remove();};
    window.addEventListener('afterprint',cleanup,{once:true});
    window.print();
  });
}

async function thermalPrint(canvas,page,role) {
  await loadScript('https://cdn.jsdelivr.net/npm/qz-tray@2.2.4/qz-tray.js',()=>!!window.qz);
  await loadScript('/js/qzClient.js',()=>!!window.InventoryOSQZ);
  const printer=await InventoryOSQZ.requirePrinter(role);
  const config=qz.configs.create(printer,{
    units:'mm',size:{width:page.width,height:page.height},margins:0,
    scaleContent:true,colorType:'grayscale',jobName:'Mi Marché storefront QR'
  });
  await qz.print(config,[{type:'pixel',format:'image',flavor:'base64',data:canvas.toDataURL('image/png').split(',')[1]}]);
}

function open(data) {
  if(document.querySelector('#mq-designer'))return;
  const shop=data.shop, url=InventoryStorefrontQR.link(shop?.id);
  if(!url)throw Error('Save your shop before creating a QR code.');
  const code=InventoryStorefrontQR.svg(url);
  const published=shop.published&&!shop.suspended;
  const key='mi-marche-print-layout-v1:'+shop.id;
  const design=initial(shop,key);
  const dialog=document.createElement('dialog');
  dialog.id='mq-designer';
  dialog.className='mq-designer';
  dialog.setAttribute('aria-labelledby','mq-title');
  dialog.innerHTML=`<header class="mq-header"><div><p class="pf-kicker">MI MARCHÉ · STORE TOOLS</p><h2 id="mq-title">Print your storefront QR code</h2><p class="pf-muted">Make a sign, thank-you card or label that brings shoppers back.</p></div><button type="button" data-close aria-label="Close print designer">Close</button></header>
    <div class="mq-content">
      <div class="mq-controls">
        <div class="mq-media" role="group" aria-label="Print media"><button type="button" data-media="paper">Paper</button><button type="button" data-media="thermal">Thermal paper</button></div>
        <div class="mq-settings pf-form"><label>Paper size<select data-size></select></label>
          <label>Layout<select data-layout><option value="stack">Stacked</option><option value="side">Side by side</option></select></label>
          <label>QR size <output data-qr-size></output><input data-qr type="range" min="16" step="1"></label>
        </div>
        <div class="mq-text-head"><h3>Text on your print</h3><button type="button" data-add-text>Add text</button></div>
        <div class="pf-stack" data-blocks></div>
        <p class="pf-muted">Layout changes are saved on this device.</p>
      </div>
      <div class="mq-preview"><div class="mq-preview-head"><strong>Print preview</strong><span data-dimensions></span></div>
        <div class="mq-stage"><canvas role="img" aria-label="Preview of the storefront QR and text"></canvas></div>
        <div class="pf-stack mq-print-actions"><p data-print-hint class="pf-muted"></p>
          <div class="pf-actions"><button type="button" class="primary" data-print="browser">Print / mobile print</button><button type="button" data-print="thermal">Print with QZ Tray</button></div>
          <label class="mq-printer">Thermal printer <select data-printer><option value="shipping">Shipping label printer</option><option value="product">Product label printer</option></select></label>
          <a class="mq-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Open the QR destination ↗</a>
          <p role="status" aria-live="polite" data-print-status></p>
        </div>
      </div>
    </div>
    <section class="mq-receipts"><div><h3>Print on in-store receipts</h3><p class="pf-muted">Choose the linked Retail stores that should add “Scan to shop again” to new sale receipts.</p></div><div data-receipts></div><p role="status" aria-live="polite" data-receipt-status></p></section>`;
  document.body.append(dialog);
  const $=selector=>dialog.querySelector(selector);
  const preview=$('canvas'), media=$('[data-size]'), layout=$('[data-layout]'), qr=$('[data-qr]');
  const blocks=$('[data-blocks]'), output=$('[data-print-status]');
  let printing=false;

  function drawControls(){
    const page=sizes[design.size];
    dialog.querySelectorAll('[data-media]').forEach(b=>b.setAttribute('aria-pressed',String((b.dataset.media==='thermal')===Boolean(page.thermal))));
    media.innerHTML=Object.entries(sizes).filter(([,x])=>Boolean(x.thermal)===Boolean(page.thermal))
      .map(([value,x])=>`<option value="${value}">${esc(x.label)}</option>`).join('');
    media.value=design.size;
    layout.value=design.layout;
    const maximum=Math.floor(Math.min(page.height-(page.thermal?3:16),page.width-(page.thermal?3:16)-(design.layout==='side'?13:0)));
    qr.max=Math.min(180,maximum);
    design.qr=Math.min(Number(qr.max),design.qr);
    qr.value=design.qr;
    $('[data-printer]').value=design.printer;
    $('[data-printer]').closest('label').hidden=!page.thermal;
    $('[data-print="thermal"]').hidden=!page.thermal;
    $('[data-dimensions]').textContent=page.width+' × '+page.height+' mm';
  }
  function previewPrint(){
    const page=sizes[design.size], fits=draw(preview,code,design,96);
    preview.style.width='min(100%, '+Math.max(240,Math.min(440,page.width*3))+'px)';
    $('[data-qr-size]').textContent=design.qr+' mm';
    $('[data-print-hint]').textContent=!published?'Publish your storefront before printing.':
      !fits?'This layout is too large for the sheet. Reduce text or QR size, or choose a larger sheet.':
      'Select the same paper size in your printer settings and print at actual size.';
    for(const button of dialog.querySelectorAll('[data-print]'))button.disabled=!published||!fits||printing;
    try{localStorage.setItem(key,JSON.stringify(design));}catch{}
  }
  function renderBlocks(){
    blocks.innerHTML=design.blocks.map((block,index)=>`<fieldset class="mq-text pf-form" data-block="${index}">
      <legend>Text ${index+1}</legend><label>Wording<input data-field="text" maxlength="120" value="${esc(block.text)}"></label>
      <div class="mq-settings"><label>Font<select data-field="font">${choices(fonts,block.font)}</select></label>
        <label>Size (pt)<input data-field="size" type="number" min="6" max="72" step="1" value="${block.size}"></label>
        <label>Align<select data-field="align">${choices(alignments,block.align)}</select></label>
        <label>Position<select data-field="position"><option value="before" ${block.position==='before'?'selected':''}>Before QR</option><option value="after" ${block.position==='after'?'selected':''}>After QR</option></select></label></div>
      <div class="mq-block-foot"><label class="pf-check"><input data-field="bold" type="checkbox" ${block.bold?'checked':''}> Bold</label><button type="button" data-remove-text="${index}">Remove text</button></div></fieldset>`).join('');
    $('[data-add-text]').disabled=design.blocks.length>=4;
  }
  function chooseSize(size){
    const old=sizes[design.size], page=sizes[size];
    for(const block of design.blocks){
      const preset=block.position==='before'?0:1;
      const factor=page.text[preset]/old.text[preset];
      block.size=Math.round(clamp(block.size*factor,6,72,page.text[preset]));
    }
    design.size=size;
    design.qr=page.qr;
    design.layout=page.compact?'side':'stack';
    design.printer=page.compact||size==='3x2'?'product':'shipping';
    drawControls();renderBlocks();previewPrint();
  }
  const receipts=(data.branches||[]).filter(b=>b.receipt_qr_available);
  $('[data-receipts]').innerHTML=receipts.length?receipts.map(b=>`<label class="pf-check">
    <input type="checkbox" data-receipt="${esc(b.id)}" ${b.receipt_qr?'checked':''} ${!b.receipt_qr&&(!published||!b.enabled)?'disabled':''}>
    ${esc(b.name)}${!b.enabled?' · branch paused':''}</label>`).join(''):
    '<p class="pf-muted">Link a Retail store in Stock &amp; delivery to add this QR to receipts.</p>';

  dialog.addEventListener('input',event=>{
    const field=event.target, block=design.blocks[Number(field.closest('[data-block]')?.dataset.block)];
    if(block&&field.dataset.field){
      const name=field.dataset.field;
      block[name]=name==='bold'?field.checked:name==='size'?clamp(field.value,6,72,block.size):field.value;
      previewPrint();
    }else if(field===qr){design.qr=Number(qr.value);previewPrint();}
  });
  dialog.addEventListener('change',async event=>{
    const field=event.target;
    if(field===media)chooseSize(media.value);
    else if(field===layout){design.layout=layout.value;drawControls();previewPrint();}
    else if(field.matches('[data-printer]')){design.printer=field.value;previewPrint();}
    else if(field.dataset.receipt){
      const enabled=field.checked;
      field.disabled=true;
      try{
        await api('/seller/receipt-qr',{body:{branch_id:field.dataset.receipt,enabled}});
        receipts.find(b=>b.id===field.dataset.receipt).receipt_qr=enabled;
        $('[data-receipt-status]').textContent=enabled?'QR enabled for new receipts.':'QR turned off for new receipts.';
      }catch(error){field.checked=!enabled;$('[data-receipt-status]').textContent=error.message;}
      finally{field.disabled=!field.checked&&(!published||!receipts.find(b=>b.id===field.dataset.receipt).enabled);}
    }
  });
  dialog.addEventListener('click',async event=>{
    const button=event.target.closest('button');
    if(!button||button.disabled)return;
    if(button.matches('[data-close]'))dialog.close();
    else if(button.dataset.media) {
      const page=sizes[design.size];
      if(Boolean(page.thermal)!==(button.dataset.media==='thermal'))chooseSize(button.dataset.media==='thermal'?'6x4':'a4');
    }else if(button.matches('[data-add-text]')){
      design.blocks.push({text:'',font:'Arial',size:sizes[design.size].text[1],align:'center',position:'after',bold:false});
      renderBlocks();previewPrint();blocks.querySelector('[data-block]:last-child [data-field="text"]').focus();
    }else if(button.dataset.removeText!==undefined){
      design.blocks.splice(Number(button.dataset.removeText),1);renderBlocks();previewPrint();$('[data-add-text]').focus();
    }else if(button.dataset.print){
      if(printing||!published)return;
      printing=true;previewPrint();output.textContent='Preparing print…';
      try{
        const canvas=document.createElement('canvas'),page=sizes[design.size];
        if(!draw(canvas,code,design,300))throw Error('The design does not fit this sheet.');
        if(button.dataset.print==='thermal'){
          if(!page.thermal)throw Error('Choose thermal paper first.');
          await thermalPrint(canvas,page,design.printer);
          output.textContent='Sent to your configured thermal printer.';
        }else{
          await browserPrint(canvas,page);
          output.textContent='Print design ready.';
        }
      }catch(error){output.textContent=error.message;}
      finally{printing=false;previewPrint();}
    }
  });
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  drawControls();renderBlocks();previewPrint();dialog.showModal();
}

window.MarcheQrDesigner={open};
})();
