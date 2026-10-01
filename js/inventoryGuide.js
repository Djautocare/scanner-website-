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
            {title:"Pack and print shipping labels",description:"Upload a shipping-label PDF, check the crop and work through the Packing Queue.",demo:"dispatch",url:"dispatch-centre.html",points:[point(28,34,"Upload and review","Check the 4×6 crop before putting labels into the packing queue."),point(69,58,"Pick in location order","Search Locations and Location Order help make a shorter pick run."),point(70,82,"Print from your phone","Mobile print cropped shipping labels shares the prepared label files.")]}
        ]},
        {id:"pro",name:"Pro",subtitle:"Multiple inventories and automated workflows",color:"#b56cff",steps:[
            {title:"Choose the right inventory",description:"Keep separate stock holdings in the same workspace and switch at the top.",image:image("dashboard"),url:"index.html",points:[point(78,7,"Inventory selector","Confirm the inventory before adding, moving, removing or assigning stock."),point(60,7,"Workspace selector","A workspace is the surrounding account or team context.")]},
            {title:"Choose location wording",description:"Use shelves or racks instead of boxes wherever a number is displayed.",image:image("workspace-settings"),url:"workspace-settings.html",points:[point(67,29,"Choose a preset","Pick Boxes, Shelves, Racks or custom wording."),point(63,46,"Check singular and plural","Numeric locations display using the preferred wording."),point(54,97,"Save Settings","A specifically saved name such as Box 1 keeps its own wording.")]},
            {title:"Import labels from Gmail",description:"Connect Gmail in Dispatch Centre and review matching shipping attachments before import.",demo:"gmail",url:"dispatch-centre.html",points:[point(31,38,"Connect Gmail","Authorise the optional label-import connection."),point(70,60,"Review matches","Check relevant attachments before adding them to the packing queue.")]},
            {title:"Reorder before stock runs out",description:"Set a minimum, choose a supplier and work through ordered, received and holding stock.",demo:"reorders",url:"reorders.html",points:[point(35,34,"Create a rule","Set the minimum and the quantity you want to reorder up to."),point(52,58,"Mark as ordered","The item moves from Needs reordering to Ordered."),point(72,81,"Receive and assign","Confirm receipt, then put quantities into locations; unassigned units stay in Holding.")]},
            {title:"Choose email reminder timing",description:"The optional reminder add-on can send immediately or as one daily summary.",demo:"reminders",url:"reorders.html",points:[point(37,40,"Enable reminders","Email alerts are a separate add-on or account-specific testing override."),point(70,67,"Choose a schedule","Pick Instant or a daily UK-time digest, then save preferences.")]}
        ]},
        {id:"business",name:"Business",subtitle:"Shared stock for a team",color:"#ffc857",steps:[
            {title:"Share a workspace",description:"Invite a colleague and choose the role needed for their work.",demo:"members",url:"workspace-members.html",points:[point(36,41,"Invite a member","Create an invitation from the workspace member controls."),point(70,65,"Check permissions","Review access before someone starts changing shared stock.")]},
            {title:"Work from the same inventory",description:"Have everyone check the selected workspace and inventory before a stock change.",image:image("dashboard"),url:"index.html",points:[point(67,7,"Choose the shared workspace","The top selector decides which workspace is active."),point(80,7,"Confirm inventory","Check the inventory beside it before updating quantities.")]}
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
        dispatch:'<div class="tour-demo"><div class="tour-demo-title">Dispatch Centre</div><div class="tour-demo-nav"><span class="on">Packing Queue</span><span>Shipping Labels</span><span>Email Label Import</span></div><div class="tour-demo-panel"><div class="tour-demo-row"><span>Shipping label PDF</span><strong>Choose file</strong></div><div class="tour-demo-row"><span>Crop preview · 4×6</span><strong>Review</strong></div><div class="tour-demo-row"><span>Search Locations</span><strong>Location Order</strong></div><div class="tour-demo-cta">Mobile print cropped shipping labels</div></div></div>',
        gmail:'<div class="tour-demo"><div class="tour-demo-title">Dispatch Centre</div><div class="tour-demo-nav"><span>Packing Queue</span><span class="on">Email Label Import</span></div><div class="tour-demo-panel"><div class="tour-demo-row"><span>Gmail connection</span><strong>Connect Gmail</strong></div><div class="tour-demo-row"><span>Scan relevant emails</span><strong>Check attachments</strong></div><div class="tour-demo-cta">Import selected labels</div></div></div>',
        reorders:'<div class="tour-demo"><div class="tour-demo-title">Reordering</div><div class="tour-demo-nav"><span class="on">Needs reordering</span><span>Ordered</span><span>Destination assigning</span></div><div class="tour-demo-panel"><div class="tour-demo-cta">Create item reorder rule</div><div class="tour-demo-row"><span>Sample product · 2 in stock</span><strong>Order 8</strong></div><div class="tour-demo-row"><span>Supplier website</span><strong>Ordered →</strong></div></div></div>',
        reminders:'<div class="tour-demo"><div class="tour-demo-title">Reordering · Email reminders</div><div class="tour-demo-nav"><span>Needs reordering</span><span class="on">Email reminders</span></div><div class="tour-demo-panel"><div class="tour-demo-row"><span>Send reorder reminders by email</span><strong>On</strong></div><div class="tour-demo-row"><span>Delivery</span><strong>Daily summary · 8:00 pm</strong></div><div class="tour-demo-cta">Save reminder preferences</div></div></div>',
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
