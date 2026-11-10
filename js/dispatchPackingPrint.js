/* global InventoryOSQZ, PDFLib, qz */
(function(){
    'use strict';

    const formats = {
        a4: { width:595.28, height:841.89, units:'mm', size:{width:210,height:297} },
        thermal: { width:288, height:432, units:'in', size:{width:4,height:6} }
    };
    const storageKey = 'inventoryos_dispatch_pick_print_v1';
    const compare = new Intl.Collator('en-GB', { numeric:true, sensitivity:'base' }).compare;

    function isDesktop(){
        return !navigator.userAgentData?.mobile &&
            !/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '') &&
            !(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    }

    function consolidate(rows){
        const groups = new Map();
        for(const row of rows){
            const qty = Number(row.qty);
            if(!Number.isFinite(qty) || qty <= 0) continue;
            const location = String(row.location || 'Location not selected');
            const name = String(row.description || 'Item');
            const barcode = String(row.barcode || '');
            const key = JSON.stringify([location, row.inventoryId || '', row.productId || '', barcode || name]);
            if(!groups.has(key)){
                groups.set(key, {location, name, barcode, qty:0, labels:new Map(), available:null});
            }
            const group = groups.get(key);
            group.qty += qty;
            if(Array.isArray(row.locations)){
                const available = row.locations.filter(stock => String(stock.location) === location &&
                    (!row.inventoryId || String(stock.inventory_id) === String(row.inventoryId)))
                    .reduce((sum,stock) => sum + (Number(stock.qty) || 0),0);
                group.available = Math.max(group.available ?? 0,available);
            }
            const label = String(row.labelOrder || row.packId);
            group.labels.set(label, (group.labels.get(label) || 0) + qty);
        }
        return [...groups.values()].sort((a,b) =>
            compare(a.location,b.location) || compare(a.name,b.name) || compare(a.barcode,b.barcode));
    }

    function lines(ctx, text, width){
        const result = [];
        let line = '';
        for(const word of String(text).replace(/[\r\n\t]/g,' ').split(/\s+/)){
            if(line && ctx.measureText(line + ' ' + word).width > width){
                result.push(line);
                line = '';
            }
            if(ctx.measureText(word).width <= width){
                line += (line ? ' ' : '') + word;
                continue;
            }
            for(const character of word){
                if(line && ctx.measureText(line + character).width > width){
                    result.push(line);
                    line = '';
                }
                line += character;
            }
        }
        if(line) result.push(line);
        return result;
    }

    async function makePdf(groups, format, packCount){
        if(!window.PDFLib) throw new Error('The PDF tools did not load. Refresh and try again.');
        const {width,height} = formats[format];
        const pdf = await PDFLib.PDFDocument.create();
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(width * 2.5);
        canvas.height = Math.ceil(height * 2.5);
        const ctx = canvas.getContext('2d');
        ctx.scale(2.5,2.5);
        const margin = format === 'a4' ? 28 : 13;
        const contentWidth = width - margin * 2;
        const total = groups.reduce((sum, group) => sum + group.qty, 0);
        let page = 0;
        let y;

        function startPage(){
            page++;
            ctx.fillStyle = '#fff';
            ctx.fillRect(0,0,width,height);
            ctx.fillStyle = '#111';
            ctx.font = 'bold 16px Arial, sans-serif';
            ctx.fillText('Consolidated pick list',margin,margin+16);
            ctx.font = '10px Arial, sans-serif';
            ctx.fillText(`${packCount} parcels · ${total} units · Page ${page}`,margin,margin+32);
            y = margin+51;
        }

        async function finishPage(){
            const image = await pdf.embedPng(canvas.toDataURL('image/png'));
            pdf.addPage([width,height]).drawImage(image,{x:0,y:0,width,height});
        }

        async function write(text, options = {}){
            const {bold = false, size = 10} = options;
            const font = `${bold ? 'bold ' : ''}${size}px Arial, sans-serif`;
            ctx.font = font;
            const wrapped = lines(ctx,text,contentWidth);
            for(const line of wrapped){
                if(y > height - margin - 9){
                    await finishPage();
                    startPage();
                }
                ctx.font = font;
                ctx.fillText(line,margin,y);
                y += size+4;
            }
        }

        startPage();
        let location;
        for(const group of groups){
            if(y + 48 > height-margin){
                await finishPage();
                startPage();
                location = undefined;
            }
            if(location !== group.location){
                location = group.location;
                await write(location,{bold:true,size:11});
            }
            await write(`${group.qty} × ${group.name}`,{bold:true});
            if(group.available !== null && group.qty > group.available){
                await write(`Check other locations for ${group.qty - group.available} remaining units.`);
            }
            if(group.barcode) await write(`SKU / barcode: ${group.barcode}`);
            const labels = [...group.labels].sort(([a],[b]) => compare(a,b))
                .map(([label,qty]) => `${label} (${qty})`).join(', ');
            await write(`Labels: ${labels}`);
            y += 7;
        }
        await finishPage();
        return new File([await pdf.save()], 'InventoryOS-Pick-List.pdf', {type:'application/pdf'});
    }

    function settings(){
        try{
            return JSON.parse(localStorage.getItem(storageKey) || '{}') || {};
        }catch{
            return {};
        }
    }

    async function printPdf(file, format, printer){
        if(!isDesktop()) throw new Error('Use Mobile print on this device.');
        if(!printer) throw new Error('Choose an A4 printer first.');
        await InventoryOSQZ.connect();
        const match = await qz.printers.find(printer);
        if(!match) throw new Error('The selected printer is unavailable.');
        const reader = new FileReader();
        const encoded = await new Promise((resolve,reject) => {
            reader.onload = () => resolve(String(reader.result).split(',')[1]);
            reader.onerror = () => reject(new Error('Could not prepare the pick-list PDF.'));
            reader.readAsDataURL(file);
        });
        const {units,size} = formats[format];
        await qz.print(qz.configs.create(match,{
            units, size, margins:0, orientation:'portrait', scaleContent:true, jobName:'InventoryOS pick list'
        }),[{type:'pixel',format:'pdf',flavor:'base64',data:encoded}]);
    }

    function mobilePrint(file){
        const data = {title:'InventoryOS pick list',files:[file]};
        if(navigator.share && (!navigator.canShare || navigator.canShare(data))){
            return navigator.share(data);
        }
        const url = URL.createObjectURL(file);
        const link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener';
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url),60000);
    }

    function setup(rows, packCount, shippingCount, autoDefault = false){
        const groups = consolidate(rows);
        const desktop = isDesktop();
        const saved = settings();
        const dialog = document.createElement('dialog');
        dialog.className = 'dispatch-pack-setup';
        dialog.setAttribute('aria-labelledby','dispatchPackSetupTitle');
        dialog.innerHTML = `
            <div class="dispatch-setup-heading">
                <span class="dispatch-setup-eyebrow">Dispatch Centre</span>
                <h2 id="dispatchPackSetupTitle">Let’s Pack</h2>
                <p>${packCount} ${packCount === 1 ? 'parcel' : 'parcels'} ready · ${groups.reduce((sum,g) => sum + g.qty,0)} units to pick</p>
            </div>
            <section class="dispatch-setup-section">
                <h3>Consolidated pick list</h3>
                <p>Group matching items by stock location and print the quantities for this session.</p>
                <label>Paper size <select data-format><option value="a4">A4 paper</option><option value="thermal">6×4 thermal paper</option></select></label>
                <label data-a4 hidden>A4 printer <select data-printer><option value="">Choose a printer</option></select></label>
                <button type="button" class="secondary" data-find hidden>Find desktop printers</button>
                <div class="dispatch-setup-actions">
                    <button type="button" data-print>Print</button>
                    <button type="button" class="secondary" data-mobile>Mobile print</button>
                </div>
            </section>
            <section class="dispatch-setup-section">
                <label class="dispatch-setup-checkbox">
                    <input type="checkbox" data-auto> Auto-print each shipping label as I pack
                </label>
                <p data-auto-hint></p>
            </section>
            <p class="dispatch-setup-status" data-status role="status"></p>
            <div class="dispatch-setup-actions dispatch-setup-footer">
                <button type="button" class="secondary" data-cancel>Cancel</button>
                <button type="button" data-start>Start packing</button>
            </div>`;

        const select = key => dialog.querySelector('[data-' + key + ']');
        const format = select('format');
        const printer = select('printer');
        const auto = select('auto');
        const status = select('status');
        const start = select('start');
        const print = select('print');
        const mobile = select('mobile');
        const find = select('find');
        let prepared;
        let busy = false;
        format.value = saved.format === 'thermal' ? 'thermal' : 'a4';
        auto.disabled = !desktop || !shippingCount;
        auto.checked = !auto.disabled && autoDefault;
        select('auto-hint').textContent = desktop
            ? (shippingCount ? 'Desktop QZ Tray sends one label to your configured shipping printer when you reach that parcel.' : 'This session has no shipping labels.')
            : 'Automatic shipping labels are available on a desktop with QZ Tray.';
        if(saved.a4Printer){
            printer.add(new Option(saved.a4Printer,saved.a4Printer));
            printer.value = saved.a4Printer;
        }

        function remember(){
            try{
                localStorage.setItem(storageKey,JSON.stringify({format:format.value,a4Printer:printer.value}));
            }catch{}
        }

        function refresh(){
            const showA4 = desktop && format.value === 'a4';
            select('a4').hidden = !showA4;
            find.hidden = !showA4;
            print.disabled = busy || !desktop || !groups.length;
            mobile.disabled = busy || !groups.length;
            start.disabled = busy;
            find.disabled = busy;
            format.disabled = busy;
            printer.disabled = busy;
        }

        async function doWork(work){
            busy = true;
            refresh();
            status.textContent = '';
            try{
                await work();
            }catch(error){
                status.textContent = error.name === 'AbortError'
                    ? 'Print sharing cancelled.'
                    : (error.message || 'Printing could not start.');
            }finally{
                busy = false;
                refresh();
            }
        }

        function pdf(){
            prepared ||= makePdf(groups,format.value,packCount).catch(error => {
                prepared = null;
                throw error;
            });
            return prepared;
        }

        format.addEventListener('change',() => {
            prepared = null;
            status.textContent = '';
            remember();
            refresh();
        });
        printer.addEventListener('change',remember);
        find.addEventListener('click',() => doWork(async () => {
            const previous = printer.value;
            const printers = await InventoryOSQZ.listPrinters();
            printer.replaceChildren(new Option('Choose a printer',''),...printers.map(name => new Option(name,name)));
            printer.value = printers.includes(previous) ? previous : '';
            status.textContent = printers.length ? 'Choose the printer loaded with A4 paper.' : 'QZ Tray found no printers.';
        }));
        print.addEventListener('click',() => doWork(async () => {
            const selected = format.value === 'a4' ? printer.value : InventoryOSQZ.getShippingPrinterName();
            if(!selected) throw new Error(format.value === 'a4' ? 'Find and choose an A4 printer first.' : 'Choose a 4×6 shipping printer in Printer Setup first.');
            await printPdf(await pdf(),format.value,selected);
            status.textContent = 'Pick list sent to QZ Tray.';
        }));
        mobile.addEventListener('click',() => doWork(async () => {
            const file = await pdf();
            try{
                await mobilePrint(file);
                status.textContent = 'Pick list ready to print or share.';
            }catch(error){
                if(error.name !== 'NotAllowedError') throw error;
                status.textContent = 'PDF ready. Tap Mobile print again to open your print options.';
            }
        }));

        return new Promise(resolve => {
            let selection = null;
            dialog.addEventListener('close',() => { dialog.remove(); resolve(selection); },{once:true});
            select('cancel').addEventListener('click',() => dialog.close());
            start.addEventListener('click',() => {
                remember();
                selection = { autoPrint:desktop && !auto.disabled && auto.checked };
                dialog.close();
            });
            refresh();
            document.body.append(dialog);
            dialog.showModal();
        });
    }

    window.InventoryDispatchPackingPrint = { setup, isDesktop, consolidate, mobilePrint };
})();
