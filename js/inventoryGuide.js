(function(){
    const root = document.getElementById("inventoryTour");
    if(!root) return;

    // These images are already public assets used by the in-app guide. Never render
    // the old Corrections image (an activity row includes a real name) or the old
    // Dispatch image (it shows a control that has since been removed).
    const image = name => "tutorial-assets/" + name + ".jpg";
    const point = (x,y,title,detail) => ({x,y,title,detail});
    const stages = [
        {id:"free",name:"Free",subtitle:"Get your first item in and out",color:"#20c997",steps:[
            {title:"Start on the dashboard",description:"See what is in stock and check the workspace you are working in.",image:image("dashboard"),url:"index.html",points:[point(68,7,"Check your workspace","The top bar shows the workspace and inventory you are viewing."),point(43,24,"Read the stock total","Active stock is the number of units currently held."),point(62,54,"Spot recent activity","Use the summary and recent activity to check what changed.")]},
            {title:"Set up a location",description:"Give your first box, shelf or rack a place to live in InventoryOS.",image:image("boxes"),url:"boxes.html",points:[point(54,23,"Create a location","Use the create-next-available control to choose a free location number."),point(57,65,"Open its contents","Select View Contents to see what is stored there."),point(50,88,"Check empty locations","The empty-locations view shows space available for future stock.")]},
            {title:"Add your first item",description:"Save a clear name, the number of units and where they are stored.",image:image("add-stock"),url:"add.html",points:[point(68,27,"Name the product","Start typing to reuse a matching product, or create a new name."),point(68,37,"Set quantity and location","Use the quantity and location fields to say what arrived and where it went."),point(70,53,"Save Product","Saving stock updates your inventory. Label options are available on eligible paid plans.")]},
            {title:"Find and move stock",description:"Search before you pick, and record a move when the physical location changes.",image:image("search-stock"),url:"search.html",points:[point(69,29,"Search by name or barcode","Scan a barcode or type part of the name, then press Search."),point(8,46,"Open Move Stock","Choose a source, destination and quantity before confirming a move.")]},
            {title:"Remove or discard stock",description:"Record a sale through Remove Stock. Use Discard Stock for damaged or lost items.",image:image("remove-stock"),url:"remove.html",points:[point(70,28,"Find the sold item","Search, choose the right result and add it to the bundle."),point(65,45,"Review the bundle","Set quantities and check the suggested pick locations before confirming."),point(9,31,"Discard is separate","Broken, lost or donated stock belongs in Discard Stock, not a sale.")]},
            {title:"Review slow-moving items",description:"The Stale Stock report flags items that have been sitting without a sale.",image:image("stale-stock"),url:"stale.html",points:[point(62,23,"Refresh the report","See the latest items that meet the stale-stock threshold."),point(58,52,"Review each card","Check the item, barcode, location, quantity and age before acting.")]}
        ]},
        {id:"starter",name:"Starter",subtitle:"Selling, costs, labels and dispatch",color:"#4da3ff",steps:[
            {title:"See full sales history",description:"Compare income, expenses and profit, then review recent sales.",image:image("sales-tracker"),url:"salestracker.html",points:[point(46,37,"All-time figures","See total income, expenses and profit in one place."),point(62,60,"This month's figures","Review the current period before opening recent sales below.")]},
            {title:"Record expenses and refunds",description:"Keep costs and returned sales in the right inventory.",image:image("expenses"),url:"expenses.html",points:[point(67,34,"Describe the cost","Choose a category, date and optional payment method."),point(65,77,"Attach a receipt","Upload an image or PDF if you need to keep the receipt with the expense.")]},
            {title:"Make barcode labels",description:"Print product or location labels, or generate a numbered range.",image:image("barcode-printing"),url:"barcodeprinting.html",points:[point(57,23,"Choose a label tab","Product Labels, Box Labels and Bulk Range each serve a different job."),point(81,37,"Open Print Jobs","Saved jobs hold batches you want to load and print again.")]},
            {title:"Reuse a print job",description:"Load the saved batch, check it, print it, or delete it when you no longer need it.",image:image("barcode-printing"),url:"barcodeprinting.html",points:[point(60,38,"Select a saved job","Choose its name from the Print Job list."),point(67,45,"Load and check","Load Print Job, then review the loaded labels before printing."),point(66,66,"Print or delete","Print Loaded Labels makes the batch. Delete Print Job removes the saved job, not the stock.")]},
            {title:"Pack and print shipping labels",description:"Upload a label, check its crop, then use the Packing Queue controls.",demo:"dispatch",url:"dispatch-centre.html",points:[point(51,37,"Upload and review","Drop a PDF or image, check the 4×6 crop, then upload it to the Packing Queue."),point(33,73,"Choose a picking order","Search Locations and Location Order help make a shorter pick run."),point(74,73,"Print from your phone","Mobile print cropped shipping labels shares the prepared label files.")]}
        ]},
        {id:"pro",name:"Pro",subtitle:"Multiple inventories and automated workflows",color:"#b56cff",steps:[
            {title:"Choose the right inventory",description:"Keep separate stock holdings in the same workspace and switch at the top.",image:image("dashboard"),url:"index.html",points:[point(78,7,"Inventory selector","Confirm the inventory before adding, moving, removing or assigning stock."),point(60,7,"Workspace selector","A workspace is the surrounding account or team context.")]},
            {title:"Choose location wording",description:"Use shelves or racks instead of boxes wherever a number is displayed.",image:image("workspace-settings"),url:"workspace-settings.html",points:[point(67,29,"Choose a preset","Pick Boxes, Shelves, Racks or custom wording."),point(63,46,"Check singular and plural","Numeric locations display using the preferred wording."),point(54,97,"Save Settings","A specifically saved name such as Box 1 keeps its own wording.")]},
            {title:"Email shipping labels to your workspace",description:"Forward shipping-label attachments to your shared InventoryOS email address. Available with Pro and Business.",image:image("email-import"),url:"dispatch-centre.html",points:[point(89,20,"Copy the shared address","Create the address in Settings or Dispatch Centre. Everyone in the workspace uses the same one."),point(40,54,"Forward label attachments","Send PDF, PNG or JPEG attachments from any email provider. Use a shipping-label filter for automatic forwarding."),point(40,72,"Review and print","The backend crops labels into the Packing Queue. Confirm the item and location, then print on mobile or with QZ Tray.")]},
            {title:"Create a reorder rule",description:"Tell InventoryOS when stock is low, where to buy it and how much to top up.",demo:"rule",url:"reorder-rule.html",points:[point(42,25,"Name the item","Start typing to reuse an existing product, or enter a new product name."),point(66,45,"Add a buying link","Enter a product link or supplier website link. One of the two is required; contact details are optional."),point(51,69,"Set the stock thresholds","The minimum triggers the reminder. Reorder up to sets the target quantity."),point(65,87,"Save the rule","InventoryOS calculates how many units to order when stock reaches the minimum.")]},
            {title:"Order, receive and assign",description:"Move a needed item through Ordered, receipt and final locations.",demo:"reorders",url:"reorders.html",points:[point(31,36,"Needs reordering","Items at or below their saved minimum appear here with a calculated order quantity."),point(56,65,"Mark as ordered","The item moves to Ordered so it no longer appears as needing an order."),point(74,83,"Receive and assign","Confirm receipt, then assign quantities to locations; unassigned units stay in Holding.")]},
            {title:"Choose email reminder timing",description:"The optional email add-on can send immediately or as one daily summary.",demo:"reminders",url:"reorders.html",points:[point(28,48,"Turn reminders on","The email add-on sends alerts to your InventoryOS login address, not the supplier contact."),point(72,57,"Choose when to send","Pick Instant when stock reaches minimum or a daily summary time."),point(40,80,"Save and test","Save preferences, then Send test email or Check alerts now to verify the setup.")]}
        ]},
        {id:"business",name:"Business",subtitle:"Shared stock and manufacturing",color:"#ffc857",steps:[
            {title:"Share a workspace",description:"Invite a colleague and choose the role needed for their work.",demo:"members",url:"workspace-members.html",points:[point(36,41,"Invite a member","Create an invitation from the workspace member controls."),point(70,65,"Check permissions","Review access before someone starts changing shared stock.")]},
            {title:"Work from the same inventory",description:"Have everyone check the selected workspace and inventory before a stock change.",image:image("dashboard"),url:"index.html",points:[point(67,7,"Choose the shared workspace","The top selector decides which workspace is active."),point(80,7,"Confirm inventory","Check the inventory beside it before updating quantities.")]} ,
            {title:"Enable Manufacturing mode",description:"Business includes optional manufacturing tools. An owner or admin enables them per workspace.",demo:"mfgSettings",url:"settings.html",points:[point(40,25,"Find Manufacturing mode","Open Settings and find the Business manufacturing card."),point(31,48,"Enable this workspace","The switch is off by default. Turning it on adds Manufacturing to the sidebar."),point(40,77,"Choose one inventory","Manufacturing works in one selected inventory at a time.")]},
            {title:"Receive measured materials",description:"Keep ingredients and packaging separate from whole-item saleable stock.",demo:"mfgMaterials",url:"manufacturing.html#materials",points:[point(27,24,"Add a material","Choose each, grams, litres or metres. Matching units can be converted in recipes."),point(62,47,"Receive a batch","Enter the material, batch number, quantity and physical storage area."),point(39,73,"Check expiry","Expired, held or recalled batches cannot be consumed in production.")]},
            {title:"Create a product recipe",description:"A bill of materials records what makes one finished item.",demo:"mfgRecipe",url:"manufacturing.html#recipes",points:[point(38,26,"Choose a finished product","Reuse an inventory item and its barcode or create one without adding stock."),point(38,49,"Quantities are per item","For a 20-item run, 25 grams per item becomes 500 grams."),point(39,77,"Link equipment","Record uses or operating hours per batch or per finished item.")]},
            {title:"Preview and complete production",description:"Review the actual source batches before committing a finished run.",demo:"mfgProduction",url:"manufacturing.html#production",points:[point(38,25,"Name the finished batch","Choose its quantity, destination and optional expiry date."),point(40,49,"Follow the material picks","The preview lists source batch numbers, locations and quantities."),point(46,78,"Confirm when finished","Materials are deducted and finished stock added together. A changed preview must be reviewed again.")]},
            {title:"Trace, hold or recall batches",description:"Follow a raw-material batch into finished products and their recorded stock movements.",demo:"mfgBatches",url:"manufacturing.html#batches",points:[point(38,26,"Open a batch trace","See material consumption, completed runs and finished-stock history."),point(39,50,"Hold or recall","An owner or admin can change batch status with a reason. Source holds and recalls block affected outputs."),point(39,78,"Confirm batch picks","When removing or moving tracked stock, confirm the exact batch numbers shown.")]},
            {title:"Maintain tools and set timers",description:"Track uses and operating hours, then set reminders that survive logout.",demo:"mfgTimers",url:"manufacturing.html#timers",points:[point(31,24,"Set a timer duration","Use minutes, hours or days for cleaning or product-ready deadlines."),point(32,48,"Choose optional email","The reminder goes to the creating account's verified email. The backend must stay running."),point(40,78,"Confirm the work yourself","Acknowledge a timer, then separately record cleaning or complete production. Elapsed timer time does not count as operating hours.")]}

        ]}
    ];

    const enhanced = window.InventoryGuideContent.enhance(stages);
    const demoMarkup = {
        mfgBatches:"<div class=\"tour-demo\"><div class=\"tour-demo-title\">Manufacturing / Batches &amp; traceability</div><div class=\"tour-demo-panel\"><strong>Workshop candle \u00b7 CANDLE-020</strong><div class=\"tour-demo-row\"><span>Source material batch</span><strong>WAX-014</strong></div><div class=\"tour-demo-row\"><span>Remaining at Shelf 4</span><strong>18 items</strong></div><div class=\"tour-demo-row\"><span>Recorded dispatch</span><strong>2 items</strong></div><div class=\"tour-demo-actions\"><span class=\"on\">Trace batch</span><span>Change status</span></div><small>A source-material recall blocks the affected finished batch.</small></div></div>",
        dispatch:'<div class="tour-demo"><div class="tour-demo-title">Dispatch Centre</div><div class="tour-demo-drop">Drop shipping labels here<small>PDF, PNG, JPG or JPEG · backend auto-crop to 4×6</small></div><div class="tour-demo-actions"><span class="on">Browse Files</span><span>Backend Crop Preview</span><span>Upload To Packing Queue</span></div><div class="tour-demo-panel"><strong>Packing Queue</strong><small>Search locations first. Nothing is removed from stock from this page.</small><div class="tour-demo-actions"><span>Refresh Queue</span><span class="on">Search Locations</span><span>Print Pick List</span><span>Mobile print cropped shipping labels</span><span>Let’s Pack</span></div><div class="tour-demo-actions"><span class="on">Location Order</span><span>Label Print Order</span></div></div></div>',
        reminders:'<div class="tour-demo"><div class="tour-demo-title">Reordering</div><div class="tour-demo-actions"><span>Create item reorder rule</span><span>Adjustments</span><span class="on">Email reminders</span><span>Refresh</span></div><div class="tour-demo-panel"><strong>Email reminders</strong><small>Optional £1.99/month add-on. Alerts go to your account email address.</small><div class="tour-demo-grid"><div class="tour-demo-row"><span>Send reorder reminders by email</span><strong>On</strong></div><div class="tour-demo-row"><span>When to send</span><strong>Instant when stock reaches minimum</strong></div></div><div class="tour-demo-actions"><span class="on">Save reminder preferences</span><span>Send test email</span><span>Check alerts now</span></div></div><div class="tour-demo-nav"><span>Needs reordering</span><span>Ordered</span><span>Destination assigning</span></div></div>',
        destinations:'<div class="tour-demo"><div class="tour-demo-title">Reordering / Destination assigning</div><div class="tour-demo-nav"><span>Needs reordering</span><span>Ordered</span><span class="on">Destination assigning</span></div><div class="tour-demo-panel"><strong>Sample product · 10 units in Holding</strong><div class="tour-demo-row"><span>Quantity 6</span><strong>Shelf 4</strong></div><div class="tour-demo-row"><span>Quantity 4 remaining</span><strong>Choose a location</strong></div><small>Unassigned quantities stay in Holding.</small><div class="tour-demo-actions"><span class="on">Confirm destinations</span><span>Mobile print</span><span>QZ Tray print</span></div></div></div>',
        equipment:'<div class="tour-demo"><div class="tour-demo-title">Manufacturing / Equipment</div><div class="tour-demo-actions"><span class="on">Add equipment</span></div><div class="tour-demo-panel"><strong>Workshop mould · sample tool</strong><div class="tour-demo-row"><span>Replace after</span><strong>30 uses</strong></div><div class="tour-demo-row"><span>Recipe usage</span><strong>1 use per finished item</strong></div><div class="tour-demo-row"><span>Clean after</span><strong>10 operating hours</strong></div><div class="tour-demo-actions"><span>Record cleaning</span><span>Record replacement</span></div><small>Elapsed timer time is separate from operating hours.</small></div></div>'
    };
    const allSteps = stages.flatMap((stage,stageIndex)=>stage.steps.map((step,stepIndex)=>({stage,stageIndex,step,stepIndex})));
    const key = 'inventoryos_guide_progress_v3';
    const indexFor = id => allSteps.findIndex(entry=>entry.step.id===id||entry.step.legacyId===id);
    let saved = {};
    try{
        const current=localStorage.getItem(key);
        if(current) saved=JSON.parse(current)||{};
        else{
            const old=JSON.parse(localStorage.getItem('inventoryos_guide_progress_v2')||'{}')||{};
            saved={current:enhanced.legacy[old.index],visited:(Array.isArray(old.visited)?old.visited:[]).map(i=>enhanced.legacy[i])};
        }
    }catch(_error){}
    const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
    const state={index:Math.max(0,indexFor(saved.current)),point:0,playing:!motion.matches,
        visited:new Set((Array.isArray(saved.visited)?saved.visited:[]).map(indexFor).filter(i=>i>=0).map(i=>allSteps[i].step.id)),query:'',audience:'all'};
    let timer;
    root.innerHTML = '<div class="tour-hero"><div><span class="tour-eyebrow">Inside InventoryOS · interactive walkthrough</span><h2>Learn one task at a time</h2><p>Follow the real screens, tap numbered highlights and try each task in your own inventory. Start with Free, then explore Starter, Pro and Business. Paid tools need the appropriate plan; this guide is open to everyone.</p></div><div class="tour-hero-status"><strong id="tourDone"></strong>steps explored</div></div><div class="tour-progress" aria-label="Guide progress"><span id="tourProgress"></span></div><div class="tour-find"><label>Find a task<input type="search" id="tourSearch" placeholder="Try receipts, picking or recipes"></label><label>Workflows<select id="tourAudience"><option value="all">All workflows</option><option value="stock">Stock and reselling</option><option value="manufacturing">Manufacturing</option></select></label><span id="tourSearchStatus" role="status"></span></div><div class="tour-tiers" aria-label="Guide plans"></div><div class="tour-shell"><nav class="tour-steps" aria-label="Guide tasks"></nav><article class="tour-card"><header class="tour-card-head"><div><span class="tour-eyebrow" id="tourStage"></span><h3 id="tourTitle"></h3><p id="tourDescription"></p></div><span class="tour-step-count" id="tourCount"></span></header><div class="tour-layout"><div class="tour-picture"><div class="tour-browser"><div class="tour-browser-bar"><i class="tour-browser-dot"></i><i class="tour-browser-dot"></i><i class="tour-browser-dot"></i><span class="tour-browser-url" id="tourUrl"></span></div><div class="tour-shot" id="tourShot"></div></div><div class="tour-picture-foot"><span>Tap a number to explore the page</span><div class="tour-picture-actions"><button type="button" class="tour-expand" id="tourExpand">Enlarge ↗</button><button type="button" class="tour-animate-toggle" id="tourAuto"></button></div></div></div><div class="tour-notes"><div class="tour-caption" aria-live="polite"><span class="tour-caption-label" id="tourCaptionCount"></span><strong id="tourCaptionTitle"></strong><p id="tourCaptionText"></p></div><div class="tour-point-list" id="tourPointList"></div><p class="tour-tip" id="tourTip"></p><a class="tour-open" id="tourOpen">Open this page ↗</a></div></div><footer class="tour-footer"><span id="tourFooterText"></span><div class="tour-controls"><button type="button" id="tourPrevious">← Previous</button><button type="button" class="tour-next" id="tourNext">Next step →</button></div></footer></article></div><dialog class="tour-dialog" id="tourDialog" aria-labelledby="tourDialogTitle"><div class="tour-dialog-head"><strong id="tourDialogTitle">Page preview</strong><button type="button" id="tourClose">Close ✕</button></div><div id="tourDialogContent"></div><div class="tour-caption" id="tourDialogCaption" aria-live="polite"></div><div class="tour-point-list" id="tourDialogPoints"></div></dialog>';
    const $=id=>root.querySelector('#'+id);
    function save(){try{localStorage.setItem(key,JSON.stringify({current:allSteps[state.index].step.id,visited:[...state.visited]}));}catch(_error){}}
    function matches(entry){
        const {step}=entry;
        const audience=state.audience==='all'||(state.audience==='manufacturing'?step.audience==='manufacturing':step.audience!=='manufacturing');
        const text=[entry.stage.name,step.title,step.description,...step.points.map(p=>p.title+' '+p.detail)].join(' ').toLowerCase();
        return audience&&text.includes(state.query.trim().toLowerCase());
    }
    function filtered(){return allSteps.map((entry,index)=>({entry,index})).filter(({entry})=>matches(entry));}
    function select(index){
        if(index<0||index>=allSteps.length)return;
        state.index=index;state.point=0;state.visited.add(allSteps[index].step.id);save();render();
    }
    function pickPoint(index){state.point=index;renderPoint();restartTimer();}
    function drawShot(shot){
        const {step}=allSteps[state.index], selected=step.points[state.point], frame=selected.frame||step.capture;
        // A point may show a different crop or a later recorded screenshot.
        // Rebuild only on frame changes so keyboard focus stays on its highlight.
        const shotKey=frame?frame.id:step.id;
        if(shot.dataset.frame!==shotKey){
            shot.dataset.frame=shotKey;shot.replaceChildren();
            shot.classList.toggle('is-capture',Boolean(frame));
            shot.classList.toggle('is-illustration',Boolean(step.demo));
            shot.style.aspectRatio=frame?frame.crop[2]+'/'+frame.crop[3]:'';
            if(step.image){
                const img=document.createElement('img');img.src=frame?frame.src:step.image;
                img.alt=frame?frame.label+' — recorded InventoryOS test screen':'InventoryOS '+step.title+' screen with demo data';
                img.loading='lazy';
                if(frame){const [x,y,w,h]=frame.crop;Object.assign(img.style,{width:frame.width/w*100+'%',height:frame.height/h*100+'%',left:-x/w*100+'%',top:-y/h*100+'%'});}
                img.addEventListener('error',()=>{
                    const message=document.createElement('p');message.className='tour-image-error';message.textContent='The preview could not load. The numbered written steps are available beside it.';shot.replaceChildren(message);
                });shot.append(img);
            }else shot.innerHTML=demoMarkup[step.demo]||'';
            const box=document.createElement('span');box.className='tour-focus-box';box.setAttribute('aria-hidden','true');shot.append(box);
            step.points.forEach((p,i)=>{
                if(frame&&p.frame&&p.frame.id!==frame.id)return;
                const b=document.createElement('button');b.type='button';b.className='tour-hotspot';b.dataset.point=String(i);
                b.style.setProperty('--x',p.x+'%');b.style.setProperty('--y',p.y+'%');b.textContent=String(i+1);
                b.setAttribute('aria-label','Highlight '+(i+1)+': '+p.title);b.addEventListener('click',()=>pickPoint(i));shot.append(b);
            });
        }
        const box=shot.querySelector('.tour-focus-box');
        if(box){box.hidden=!selected.rect;if(selected.rect)Object.assign(box.style,{left:selected.rect.x+'%',top:selected.rect.y+'%',width:selected.rect.width+'%',height:selected.rect.height+'%'});}
        shot.querySelectorAll('.tour-hotspot').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.point)===state.point)));
    }
    function makePoints(container){
        container.replaceChildren(...allSteps[state.index].step.points.map((p,i)=>{
            const b=document.createElement('button');b.type='button';b.dataset.point=String(i);b.textContent=(i+1)+'. '+p.title;
            b.addEventListener('click',()=>pickPoint(i));return b;
        }));
    }
    function renderPoint(){
        const {step}=allSteps[state.index],p=step.points[state.point];
        $('tourCaptionCount').textContent='Highlight '+(state.point+1)+' of '+step.points.length;
        $('tourCaptionTitle').textContent=p.title;$('tourCaptionText').textContent=p.detail;drawShot($('tourShot'));
        if($('tourDialog').open){
            let shot=$('tourDialogContent').querySelector('.tour-shot');
            if(!shot){shot=document.createElement('div');shot.className='tour-shot';$('tourDialogContent').append(shot);}
            drawShot(shot);$('tourDialogCaption').textContent=(state.point+1)+'. '+p.title+' — '+p.detail;
        }
        root.querySelectorAll('.tour-point-list button').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.point)===state.point)));
    }
    function restartTimer(){
        clearInterval(timer);root.classList.toggle('is-paused',!state.playing);
        $('tourAuto').textContent=state.playing?'Pause highlights ❚❚':'Play highlights ▶';$('tourAuto').setAttribute('aria-pressed',String(state.playing));
        if(state.playing&&!document.hidden&&!root.closest('[hidden]'))timer=setInterval(()=>{
            const n=allSteps[state.index].step.points.length;if(n>1){state.point=(state.point+1)%n;renderPoint();}
        },5500);
    }
    function renderNavigation(){
        const current=allSteps[state.index],results=filtered(),query=state.query.trim();
        $('tourSearchStatus').textContent=query?results.length+' matching tasks across all plans':'';
        root.querySelector('.tour-tiers').replaceChildren(...stages.map((stage,i)=>{
            const first=results.find(({entry})=>entry.stageIndex===i);
            const b=document.createElement('button');b.type='button';b.className='tour-tier';b.setAttribute('aria-pressed',String(i===current.stageIndex));b.disabled=!first;
            const strong=document.createElement('strong');strong.textContent=(i+1)+'. '+stage.name;
            const small=document.createElement('small');small.textContent=stage.subtitle;b.append(strong,small);
            b.addEventListener('click',()=>select(first.index));return b;
        }));
        const nav=root.querySelector('.tour-steps');nav.replaceChildren();
        const title=document.createElement('div');title.className='tour-steps-title';title.textContent=query?'Search results':current.stage.name+' steps';nav.append(title);
        const shown=query?results:results.filter(({entry})=>entry.stageIndex===current.stageIndex);
        if(!shown.length){const message=document.createElement('p');message.className='tour-no-results';message.textContent='No matching tasks. Try another word or choose All workflows.';nav.append(message);}
        shown.forEach(({entry,index})=>{
            const b=document.createElement('button');b.type='button';b.className='tour-step-button'+(state.visited.has(entry.step.id)?' is-visited':'');b.setAttribute('aria-current',index===state.index?'step':'false');
            const dot=document.createElement('span');dot.className='tour-step-dot';dot.textContent=state.visited.has(entry.step.id)&&index!==state.index?'✓':String(entry.stepIndex+1);
            const label=document.createElement('span');label.textContent=(query?entry.stage.name+' · ':'')+entry.step.title;
            b.append(dot,label);b.addEventListener('click',()=>select(index));nav.append(b);
        });
    }
    function render(){
        const {stage,step,stepIndex}=allSteps[state.index];
        $('tourDone').textContent=state.visited.size+' / '+allSteps.length;$('tourProgress').style.width=state.visited.size/allSteps.length*100+'%';
        renderNavigation();$('tourStage').textContent=stage.name+' · '+stage.subtitle;
        $('tourTitle').textContent=step.title;$('tourDescription').textContent=step.description;$('tourCount').textContent='Step '+(state.index+1)+' of '+allSteps.length;
        $('tourUrl').textContent='app.inventoryos.co.uk/'+step.url;makePoints($('tourPointList'));
        $('tourTip').textContent=step.demo?'Illustrated example: sample controls and data. Open the actual page to work in your account.':'Real InventoryOS screen: recorded with demo data. Your data and theme may differ.';
        $('tourOpen').href=step.url;$('tourFooterText').textContent=(stepIndex+1)+' of '+stage.steps.length+' in '+stage.name+' · progress stays on this device';
        const results=filtered(),position=results.findIndex(({index})=>index===state.index);
        $('tourPrevious').disabled=position<=0;$('tourNext').disabled=!results.length;
        $('tourNext').textContent=position===results.length-1?'Back to the start ↺':'Next step →';renderPoint();restartTimer();
    }
    function navigate(direction){const results=filtered(),at=results.findIndex(({index})=>index===state.index);if(results.length)select(results[(Math.max(0,at)+direction+results.length)%results.length].index);}
    $('tourExpand').addEventListener('click',()=>{
        $('tourDialogTitle').textContent=allSteps[state.index].step.title+' · page preview';$('tourDialogContent').replaceChildren();makePoints($('tourDialogPoints'));
        $('tourDialog').showModal();renderPoint();
    });
    $('tourClose').addEventListener('click',()=>$('tourDialog').close());
    $('tourPrevious').addEventListener('click',()=>navigate(-1));$('tourNext').addEventListener('click',()=>navigate(1));
    $('tourAuto').addEventListener('click',()=>{state.playing=!state.playing;restartTimer();});
    function filterChanged(){state.query=$('tourSearch').value;state.audience=$('tourAudience').value;const first=filtered()[0];if(first&&!matches(allSteps[state.index]))select(first.index);else render();}
    $('tourSearch').addEventListener('input',filterChanged);$('tourAudience').addEventListener('change',filterChanged);
    root.addEventListener('keydown',event=>{
        if(event.target.closest('input,textarea,select')||$('tourDialog').open)return;
        if(event.key==='ArrowRight'){event.preventDefault();navigate(1);}
        if(event.key==='ArrowLeft'&&!$('tourPrevious').disabled){event.preventDefault();navigate(-1);}
    });
    document.addEventListener('visibilitychange',restartTimer);
    const panel=root.closest('.settings-view');if(panel)new MutationObserver(restartTimer).observe(panel,{attributes:true,attributeFilter:['hidden']});
    motion.addEventListener('change',event=>{if(event.matches){state.playing=false;restartTimer();}});
    state.visited.add(allSteps[state.index].step.id);save();render();
})();
