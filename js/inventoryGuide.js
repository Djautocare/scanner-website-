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
            {title:"Set up a location",description:"Give your first box, shelf or rack a place to live in InventoryOS.",image:image("boxes"),url:"boxes.html",points:[point(54,23,"Create a location","Create Next Available Box chooses a free number for you."),point(57,65,"Open its contents","Select View Contents to see what is stored there."),point(50,88,"Check empty locations","Empty Boxes shows locations available for future stock.")]},
            {title:"Add your first item",description:"Save a clear name, the number of units and where they are stored.",image:image("add-stock"),url:"add.html",points:[point(68,27,"Name the product","Start typing to reuse a matching product, or create a new name."),point(68,37,"Set quantity and location","Use the quantity and box number fields to say what arrived and where it went."),point(70,53,"Save Product","Saving stock updates your inventory. Label options are available on eligible paid plans.")]},
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

    const allSteps = stages.flatMap((stage,stageIndex)=>stage.steps.map((step,stepIndex)=>({stage,stageIndex,step,stepIndex})));
    const key = "inventoryos_guide_progress_v2";
    let saved = {};
    try{ saved = JSON.parse(localStorage.getItem(key) || "{}"); }catch(_error){}
    const state = {index:Math.min(Math.max(Number(saved.index)||0,0),allSteps.length-1),point:0,playing:!matchMedia("(prefers-reduced-motion: reduce)").matches,visited:new Set(Array.isArray(saved.visited)?saved.visited:[])};
    let timer;

    root.innerHTML = '<div class="tour-hero"><div><span class="tour-eyebrow">Inside InventoryOS · interactive walkthrough</span><h2>Learn one task at a time</h2><p>Follow the real screens, tap the numbered highlights and try each task in your own inventory. Start with Free, then explore Starter, Pro and Business.</p></div><div class="tour-hero-status"><strong id="tourDone">0 / 0</strong>steps explored</div></div><div class="tour-progress" aria-label="Guide progress"><span id="tourProgress"></span></div><div class="tour-tiers" role="tablist" aria-label="Guide plans"></div><div class="tour-shell"><nav class="tour-steps" aria-label="Steps in this plan"></nav><article class="tour-card"><header class="tour-card-head"><div><span class="tour-eyebrow" id="tourStage"></span><h3 id="tourTitle"></h3><p id="tourDescription"></p></div><span class="tour-step-count" id="tourCount"></span></header><div class="tour-layout"><div class="tour-picture"><div class="tour-browser"><div class="tour-browser-bar"><i class="tour-browser-dot"></i><i class="tour-browser-dot"></i><i class="tour-browser-dot"></i><span class="tour-browser-url" id="tourUrl"></span></div><div class="tour-shot" id="tourShot"></div></div><div class="tour-picture-foot"><span>Tap a number to explore the page</span><div class="tour-picture-actions"><button type="button" class="tour-expand" id="tourExpand">Enlarge ↗</button><button type="button" class="tour-animate-toggle" id="tourAuto"></button></div></div></div><div class="tour-notes"><div class="tour-caption" aria-live="polite"><span class="tour-caption-label" id="tourCaptionCount"></span><strong id="tourCaptionTitle"></strong><p id="tourCaptionText"></p></div><div class="tour-point-list" id="tourPointList"></div><p class="tour-tip" id="tourTip"></p><a class="tour-open" id="tourOpen">Open this page ↗</a></div></div><footer class="tour-footer"><span id="tourFooterText"></span><div class="tour-controls"><button type="button" id="tourPrevious">← Previous</button><button type="button" class="tour-next" id="tourNext">Next step →</button></div></footer></article></div><dialog class="tour-dialog" id="tourDialog" aria-labelledby="tourDialogTitle"><div class="tour-dialog-head"><strong id="tourDialogTitle">Page preview</strong><button type="button" id="tourClose">Close ✕</button></div><div id="tourDialogContent"></div></dialog>';

    const $ = id => root.querySelector("#"+id);
    const save = () => {try{localStorage.setItem(key,JSON.stringify({index:state.index,visited:[...state.visited]}));}catch(_error){}};
    const demoMarkup = {
        mfgSettings:"<div class=\"tour-demo\"><div class=\"tour-demo-title\">Settings / Manufacturing mode \u00b7 Business</div><div class=\"tour-demo-panel\"><strong>Manufacturing mode</strong><small>Materials, product recipes, production batches and equipment maintenance.</small><div class=\"tour-demo-row\"><span>Enable for this workspace</span><strong>On</strong></div><small>Off by default. Owner or admin controls this setting.</small><div class=\"tour-demo-cta\">Open Manufacturing</div></div></div>",
        mfgMaterials:"<div class=\"tour-demo\"><div class=\"tour-demo-title\">Manufacturing / Materials</div><div class=\"tour-demo-actions\"><span class=\"on\">Add material</span><span>Receive a batch</span></div><div class=\"tour-demo-panel\"><strong>Wax \u00b7 raw material</strong><div class=\"tour-demo-row\"><span>Batch WAX-014 \u00b7 Materials shelf</span><strong>1,000 g</strong></div><div class=\"tour-demo-row\"><span>Status</span><strong>Available</strong></div><div class=\"tour-demo-row\"><span>Expiry</span><strong>Optional</strong></div></div></div>",
        mfgRecipe:"<div class=\"tour-demo\"><div class=\"tour-demo-title\">Manufacturing / Product recipes</div><div class=\"tour-demo-panel\"><strong>Workshop candle</strong><div class=\"tour-demo-row\"><span>Finished product \u00b7 existing barcode</span><strong>ITEM-42</strong></div><div class=\"tour-demo-row\"><span>Wax per finished item</span><strong>25 g</strong></div><div class=\"tour-demo-row\"><span>Wicks per finished item</span><strong>1 each</strong></div><div class=\"tour-demo-row\"><span>Mould usage</span><strong>1 use per item</strong></div><div class=\"tour-demo-actions\"><span class=\"on\">Save recipe</span></div></div></div>",
        mfgProduction:"<div class=\"tour-demo\"><div class=\"tour-demo-title\">Manufacturing / Production plan</div><div class=\"tour-demo-panel\"><strong>20 Workshop candles \u2192 Shelf 4</strong><small>Finished batch CANDLE-020</small><div class=\"tour-demo-row\"><span>WAX-014 \u00b7 Materials shelf</span><strong>Pick 500 g</strong></div><div class=\"tour-demo-row\"><span>WICK-008 \u00b7 Components drawer</span><strong>Pick 20 each</strong></div><small>Confirm only once the finished products are ready.</small><div class=\"tour-demo-actions\"><span>Back</span><span class=\"on\">Complete production</span></div></div></div>",
        mfgBatches:"<div class=\"tour-demo\"><div class=\"tour-demo-title\">Manufacturing / Batches &amp; traceability</div><div class=\"tour-demo-panel\"><strong>Workshop candle \u00b7 CANDLE-020</strong><div class=\"tour-demo-row\"><span>Source material batch</span><strong>WAX-014</strong></div><div class=\"tour-demo-row\"><span>Remaining at Shelf 4</span><strong>18 items</strong></div><div class=\"tour-demo-row\"><span>Recorded dispatch</span><strong>2 items</strong></div><div class=\"tour-demo-actions\"><span class=\"on\">Trace batch</span><span>Change status</span></div><small>A source-material recall blocks the affected finished batch.</small></div></div>",
        mfgTimers:"<div class=\"tour-demo\"><div class=\"tour-demo-title\">Manufacturing / Persistent timers</div><div class=\"tour-demo-panel\"><strong>Products ready</strong><div class=\"tour-demo-row\"><span>Ready in</span><strong>10 hours</strong></div><div class=\"tour-demo-row\"><span>Email my account when due</span><strong>Optional</strong></div><small>Deadline saved on the backend. Logging out does not stop it.</small><div class=\"tour-demo-actions\"><span class=\"on\">Start timer</span></div></div><div class=\"tour-demo-panel\"><strong>Equipment</strong><small>Replace after 30 uses \u00b7 Clean every 10 operating hours</small></div></div>",

        dispatch:'<div class="tour-demo"><div class="tour-demo-title">Dispatch Centre</div><div class="tour-demo-drop">Drop shipping labels here<small>PDF, PNG, JPG or JPEG · backend auto-crop to 4×6</small></div><div class="tour-demo-actions"><span class="on">Browse Files</span><span>Backend Crop Preview</span><span>Upload To Packing Queue</span></div><div class="tour-demo-panel"><strong>Packing Queue</strong><small>Search locations first. Nothing is removed from stock from this page.</small><div class="tour-demo-actions"><span>Refresh Queue</span><span class="on">Search Locations</span><span>Print Pick List</span><span>Mobile print cropped shipping labels</span><span>Let’s Pack</span></div><div class="tour-demo-actions"><span class="on">Location Order</span><span>Label Print Order</span></div></div></div>',
        inbound:'<div class="tour-demo"><div class="tour-demo-title">Email Shipping Labels to InventoryOS</div><div class="tour-demo-panel"><div class="tour-demo-status">Shared workspace address · Active</div><div class="tour-demo-row"><span>sample-address@labels.inventoryos.co.uk</span><strong>Copy address</strong></div><div class="tour-demo-actions"><span class="on">Copy address</span><span>Send test</span><span>Regenerate address</span></div></div><div class="tour-demo-panel"><strong>Forward shipping-label emails</strong><small>PDF, PNG and JPEG attachments. Use a label-only forwarding rule in your email provider.</small></div><div class="tour-demo-panel"><strong>Review the Packing Queue</strong><small>Labels are cropped automatically. Check the item and stock location, then print.</small></div></div>',
        rule:'<div class="tour-demo"><div class="tour-demo-title">Create item reorder rule</div><div class="tour-demo-panel tour-demo-form"><label>Item name<span>Start typing a product name</span></label><div class="tour-demo-grid"><label>Product web link<span>https://supplier.example/product</span></label><label>Supplier website link<span>https://supplier.example</span></label></div><div class="tour-demo-grid"><label>Supplier contact number · optional<span>Phone number</span></label><label>Supplier email · optional<span>name@supplier.example</span></label></div><div class="tour-demo-grid"><label>Minimum stock to trigger a reminder<span>2</span></label><label>Reorder up to<span>10</span></label></div><div class="tour-demo-actions"><span class="on">Save reorder rule</span><span>Cancel</span></div></div></div>',
        reorders:'<div class="tour-demo"><div class="tour-demo-title">Reordering</div><div class="tour-demo-actions"><span>Create item reorder rule</span><span>Adjustments</span><span>Email reminders</span><span>Refresh</span></div><div class="tour-demo-status">Sample item has reached its reorder threshold.</div><div class="tour-demo-nav"><span class="on">Needs reordering</span><span>Ordered</span><span>Destination assigning</span><span>All rules</span></div><div class="tour-demo-panel"><div class="tour-demo-row"><span>Sample product · 2 in stock · reorder up to 10</span><strong>Order 8</strong></div><div class="tour-demo-actions"><span>Supplier website</span><span class="on">Ordered</span></div></div></div>',
        reminders:'<div class="tour-demo"><div class="tour-demo-title">Reordering</div><div class="tour-demo-actions"><span>Create item reorder rule</span><span>Adjustments</span><span class="on">Email reminders</span><span>Refresh</span></div><div class="tour-demo-panel"><strong>Email reminders</strong><small>Optional £1.99/month add-on. Alerts go to your account email address.</small><div class="tour-demo-grid"><div class="tour-demo-row"><span>Send reorder reminders by email</span><strong>On</strong></div><div class="tour-demo-row"><span>When to send</span><strong>Instant when stock reaches minimum</strong></div></div><div class="tour-demo-actions"><span class="on">Save reminder preferences</span><span>Send test email</span><span>Check alerts now</span></div></div><div class="tour-demo-nav"><span>Needs reordering</span><span>Ordered</span><span>Destination assigning</span></div></div>',
        members:'<div class="tour-demo"><div class="tour-demo-title">Workspace Members</div><div class="tour-demo-nav"><span class="on">Members</span><span>Invitations</span></div><div class="tour-demo-panel"><div class="tour-demo-cta">Invite member</div><div class="tour-demo-row"><span>Sample teammate</span><strong>Member</strong></div><div class="tour-demo-row"><span>Workspace access</span><strong>Review role</strong></div></div></div>'
    };

    function select(index){
        state.index = Math.min(Math.max(index,0),allSteps.length-1);
        state.point = 0;
        state.visited.add(state.index);
        save();
        render();
    }
    function selectPoint(index){state.point=index;renderPoint();}
    function renderPoint(){
        const {step}=allSteps[state.index];
        const p=step.points[state.point];
        $("tourCaptionCount").textContent="Highlight "+(state.point+1)+" of "+step.points.length;
        $("tourCaptionTitle").textContent=p.title;
        $("tourCaptionText").textContent=p.detail;
        root.querySelectorAll(".tour-hotspot,.tour-point-list button").forEach(button=>button.setAttribute("aria-pressed",String(Number(button.dataset.point)===state.point)));
    }
    function restartTimer(){
        clearInterval(timer);
        $("tourAuto").textContent=state.playing?"Pause highlights ❚❚":"Play highlights ▶";
        $("tourAuto").setAttribute("aria-pressed",String(state.playing));
        if(state.playing) timer=setInterval(()=>{const n=allSteps[state.index].step.points.length;if(n>1)selectPoint((state.point+1)%n);},4300);
    }
    function render(){
        const current=allSteps[state.index];
        const {stage,stageIndex,step,stepIndex}=current;
        $("tourDone").textContent=state.visited.size+" / "+allSteps.length;
        $("tourProgress").style.width=(state.visited.size/allSteps.length*100)+"%";
        const tiers=root.querySelector(".tour-tiers");
        tiers.replaceChildren(...stages.map((item,i)=>{
            const button=document.createElement("button");button.type="button";button.className="tour-tier";button.setAttribute("role","tab");button.setAttribute("aria-selected",String(i===stageIndex));
            button.innerHTML="<strong>"+(i+1)+". "+item.name+"</strong><small>"+item.subtitle+"</small>";
            button.addEventListener("click",()=>select(allSteps.findIndex(entry=>entry.stageIndex===i)));
            return button;
        }));
        const steps=root.querySelector(".tour-steps");
        steps.replaceChildren();
        const title=document.createElement("div");title.className="tour-steps-title";title.textContent=stage.name+" steps";steps.append(title);
        stage.steps.forEach((item,i)=>{
            const idx=allSteps.findIndex(entry=>entry.stageIndex===stageIndex&&entry.stepIndex===i);
            const b=document.createElement("button");b.type="button";b.className="tour-step-button"+(state.visited.has(idx)?" is-visited":"");b.setAttribute("aria-current",idx===state.index?"step":"false");
            const dot=document.createElement("span");dot.className="tour-step-dot";dot.textContent=state.visited.has(idx)&&idx!==state.index?"✓":String(i+1);
            const label=document.createElement("span");label.textContent=item.title;b.append(dot,label);b.addEventListener("click",()=>select(idx));steps.append(b);
        });
        $("tourStage").textContent=stage.name+" · "+stage.subtitle;
        $("tourTitle").textContent=step.title;
        $("tourDescription").textContent=step.description;
        $("tourCount").textContent="Step "+(state.index+1)+" of "+allSteps.length;
        $("tourUrl").textContent="app.inventoryos.co.uk/"+(step.url||"");
        const shot=$("tourShot");shot.replaceChildren();
        if(step.image){const img=document.createElement("img");img.src=step.image;img.alt="InventoryOS "+step.title+" screen with a demo account";img.loading="lazy";shot.append(img);}
        else{shot.innerHTML=demoMarkup[step.demo]||"";}
        step.points.forEach((p,i)=>{
            const b=document.createElement("button");b.type="button";b.className="tour-hotspot";b.dataset.point=String(i);b.style.setProperty("--x",p.x+"%");b.style.setProperty("--y",p.y+"%");b.textContent=String(i+1);b.setAttribute("aria-label","Highlight "+(i+1)+": "+p.title);b.addEventListener("click",()=>{selectPoint(i);restartTimer();});shot.append(b);
        });
        const list=$("tourPointList");list.replaceChildren(...step.points.map((p,i)=>{const b=document.createElement("button");b.type="button";b.dataset.point=String(i);b.textContent=(i+1)+". "+p.title;b.addEventListener("click",()=>{selectPoint(i);restartTimer();});return b;}));
        $("tourTip").innerHTML=step.demo?"<strong>Illustrated preview:</strong> the controls are shown with sample data. Open the page to see your own account.":"<strong>Real InventoryOS screen:</strong> the screenshot uses a demo identity; your data and theme may differ.";
        $("tourOpen").href=step.url;
        $("tourFooterText").textContent=""+(stepIndex+1)+" of "+stage.steps.length+" in "+stage.name+" · progress stays on this device";
        $("tourPrevious").disabled=state.index===0;
        $("tourNext").textContent=state.index===allSteps.length-1?"Back to the start ↺":"Next step →";
        renderPoint();restartTimer();
    }
    $("tourExpand").addEventListener("click",()=>{
        const dialog=$("tourDialog");
        $("tourDialogTitle").textContent=allSteps[state.index].step.title+" · page preview";
        const clone=$("tourShot").cloneNode(true);
        clone.removeAttribute("id");
        clone.querySelectorAll(".tour-hotspot").forEach(button=>button.addEventListener("click",()=>{selectPoint(Number(button.dataset.point));restartTimer();}));
        $("tourDialogContent").replaceChildren(clone);
        dialog.showModal();
    });
    $("tourClose").addEventListener("click",()=>$("tourDialog").close());
    $("tourPrevious").addEventListener("click",()=>select(state.index-1));
    $("tourNext").addEventListener("click",()=>select(state.index===allSteps.length-1?0:state.index+1));
    $("tourAuto").addEventListener("click",()=>{state.playing=!state.playing;restartTimer();});
    root.addEventListener("keydown",event=>{
        if(event.target.tagName==="INPUT"||event.target.tagName==="TEXTAREA")return;
        if(event.key==="ArrowRight"){event.preventDefault();select(Math.min(state.index+1,allSteps.length-1));}
        if(event.key==="ArrowLeft"){event.preventDefault();select(Math.max(state.index-1,0));}
    });
    state.visited.add(state.index);
    save();
    render();
})();

