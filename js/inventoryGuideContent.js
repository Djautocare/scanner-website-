(function(){
    'use strict';
    const base='tutorial-assets/guide-2026-10/';
    function screen(file,width,height,crop,label){return{src:base+file+'.png',width,height,crop,label,id:file+':'+crop.join(',')};}
    const shots={
        ordered:screen('reorder-ordered',1920,1080,[450,237,870,640],'Ordered items and saved cost'),
        receive:screen('reorder-receive',1920,1020,[723,393,456,386],'Confirm stock received'),
        expense:screen('reorder-expense',1920,1020,[529,419,1048,392],'Automatic expense and receipt upload'),
        rule:screen('reorder-rule',1920,1020,[447,233,1210,787],'Create item reorder rule'),
        stack:screen('stack-order',1920,1020,[524,310,1058,710],'Settings: stack order'),
        picking:screen('consolidated-picking',1920,1020,[659,319,785,701],'Consolidated picking plan'),
        lockedPick:screen('locked-picking',1920,1020,[659,319,785,620],'Picking with a chosen location locked'),
        reimportIdle:screen('email-reimport-ready',1476,430,[57,0,1332,430],'Reimport starting'),
        reimportWorking:screen('email-reimport-progress',1385,422,[15,0,1310,422],'Reimport progress'),
        materials:screen('manufacturing-materials',1920,1020,[460,299,1207,655],'Materials and packaging'),
        recipeTop:screen('manufacturing-recipes',1920,1020,[460,300,1207,273],'Recipe controls'),
        recipeCard:screen('manufacturing-recipes',1920,1020,[461,454,941,327],'Recipe quantities per finished item'),
        calculate:screen('manufacturing-calculator',1920,1020,[450,183,1207,792],'Combined recipe material calculation'),
        production:screen('manufacturing-production',1920,1020,[618,172,683,829],'Production material picks and confirmation'),
        timer:screen('manufacturing-timer',1920,1020,[618,280,683,612],'Persistent timer form'),
        manufacturing:screen('manufacturing-settings',1920,1020,[525,385,1058,248],'Manufacturing mode in Settings'),
        help:screen('settings-help',1920,1020,[523,290,1060,708],'Help request and recent requests'),
        workspace:screen('workspace-inventories',1920,1020,[507,218,889,802],'Shared workspace and inventories'),
        members:screen('workspace-members',1920,1020,[507,190,889,809],'Invitations and member roles')
    };
    function p(frame,x,y,title,detail,rect){
        const [left,top,width,height]=frame.crop;
        return{x:(x-left)/width*100,y:(y-top)/height*100,title,detail,frame,
            rect:rect?{x:(rect[0]-left)/width*100,y:(rect[1]-top)/height*100,width:rect[2]/width*100,height:rect[3]/height*100}:null};
    }
    function step(id,title,description,url,frame,points,audience='all'){
        return{id,title,description,url,image:frame.src,capture:frame,points,audience};
    }
    function replace(stage,title,value){const index=stage.steps.findIndex(s=>s.title===title);if(index<0)throw Error('Guide step missing: '+title);value.legacyId=stage.id+':'+title;stage.steps[index]=value;}
    function enhance(stages){
        const [free,starter,pro,business]=stages;
        const legacy=stages.flatMap(stage=>stage.steps.map(s=>stage.id+':'+s.title));
        free.steps.splice(5,0,
            step('stack-order','Set your stack order','Tell InventoryOS which locations are easiest to reach. The top position has nothing above it.','settings.html',shots.stack,[
                p(shots.stack,842,334,'Open Stack order','Open Settings, choose Stack order, and select one inventory.',[527,314,364,39]),
                p(shots.stack,617,491,'Set the height','Set a default height, add each stack and adjust its own height if needed.',[546,449,167,64]),
                p(shots.stack,1220,672,'Arrange top to bottom','Choose the location at each position. Blank positions are empty space. Use your actual box, shelf or rack order.',[548,562,1006,211]),
                p(shots.stack,1499,500,'Save the layout','Save stack order. Picking minimises locations first, then prefers easier stack access, then empties smaller item stocks.',[1445,482,110,39])
            ]),
            step('consolidate','Consolidate a stock pick','Set every item quantity, then review exactly where the stock will come from before removing anything.','remove.html',shots.picking,[
                p(shots.picking,1050,351,'Consolidate picking plan','Add your items and quantities first, then press Consolidate picking plan.',[674,330,755,43]),
                p(shots.picking,833,492,'Follow the grouped route','This example collects three different items from one location at the top of its stack.',[674,473,755,310]),
                p(shots.picking,833,550,'Yellow means another location is available','Select a yellow item to see the places it can be picked from. Stock has not changed yet.',[687,509,731,85]),
                p(shots.picking,1045,998,'Confirm the removal','Check quantities, locations and any sale amount. Only Remove Stock commits the stock change.',[660,980,784,40])
            ]),
            step('lock-pick','Choose a different picking location','Lock one item to your chosen location, then let InventoryOS recalculate the rest of the route.','remove.html',shots.lockedPick,[
                p(shots.lockedPick,812,438,'Your chosen location is locked','Select a yellow item and choose an available location. This example locks Beer to BOX-3.',[674,414,755,47]),
                p(shots.lockedPick,858,552,'The other items are reconsolidated','The route keeps the chosen pick and groups other items wherever possible. A manual choice can add another location.',[674,529,755,362]),
                p(shots.lockedPick,1354,438,'Return to automatic picking','Use automatic picking removes the manual lock and calculates the suggested route again.',[1291,423,130,31])
            ])
        );
        free.steps.push(step('help','Get help inside Settings','Send a topic and message, then track the request in your recent requests.','settings.html',shots.help,[
            p(shots.help,769,312,'Open Help','Go to Settings and select Help. Replies go to your account email.',[741,291,57,41]),
            p(shots.help,793,650,'Describe the topic','Choose a short topic and explain which page you used, what you tried and what happened.',[549,606,504,253]),
            p(shots.help,619,906,'Send the request','Check the selected workspace, then send. Your account and workspace are attached automatically.',[549,888,133,35]),
            p(shots.help,1318,639,'Follow its progress','Recent requests show their status. Open a request to review its details.',[1103,569,452,138])
        ]));
        replace(pro,'Create a reorder rule',step('reorder-rule','Create a reorder rule','Choose a supplier, stock thresholds and an optional estimated cost per unit.','reorder-rule.html',shots.rule,[
            p(shots.rule,746,340,'Choose the item','Reuse a suggested item or create a new one. It will also appear in Add Stock suggestions.',[458,300,1187,59]),
            p(shots.rule,899,429,'Add a buying link','Enter a product link or supplier website link. At least one is required; supplier contact details are optional.',[458,392,1187,156]),
            p(shots.rule,735,746,'Set minimum and target stock','Stock at or below the minimum triggers a reorder. Reorder up to is the target after replenishment.',[458,708,1187,150]),
            p(shots.rule,734,923,'Cost per unit is optional','Use the expected unit cost to estimate the total. If unknown, leave it blank and enter the actual total before receipt.',[458,886,1187,75]),
            p(shots.rule,519,995,'Save the rule','Save. Use Adjustments on Reordering to edit or delete a rule later.',[458,974,183,44])
        ]));
        const orderIndex=pro.steps.findIndex(s=>s.title==='Order, receive and assign');
        pro.steps.splice(orderIndex,0,
            step('ordered-cost','Edit the cost of an ordered item','Mark a needed item Ordered, then save the total amount you actually paid.','reorders.html',shots.ordered,[
                p(shots.ordered,638,413,'Open Ordered','Mark the low-stock item Ordered. It leaves Needs reordering and appears in this tab.',[599,396,90,35]),
                p(shots.ordered,563,784,'Enter the total paid','You can include delivery costs or discounts. The effective cost per unit is calculated from the total and ordered quantity.',[475,747,256,96]),
                p(shots.ordered,691,784,'Save cost','Save the edited total before receiving. Editing the order does not change the rule for future orders.',[653,766,81,38]),
                p(shots.ordered,727,472,'Select orders to receive','Select the delivered orders and choose Mark selected received.',[477,453,326,38])
            ]),
            step('receive-cost','Confirm receipt and create expenses','Physically check the delivery, then confirm each total paid. Stock and its expense are saved together.','reorders.html',shots.receive,[
                p(shots.receive,917,545,'Check the item and quantity','Confirm the selected item and number of units actually arrived.',[748,518,402,49]),
                p(shots.receive,946,614,'Confirm the final cost','Enter the total paid, including when no estimated cost was set. Use 0 only for an order that was free.',[748,573,402,62]),
                p(shots.receive,932,680,'Holding and expenses','Confirmation adds stock to Holding and creates one expense per order, with quantity, total and cost per unit.',[748,665,402,36]),
                p(shots.receive,808,723,'Confirm received','Confirm once. If the save fails, stock and expense changes are rolled back together; repeating receipt cannot add them twice.',[749,705,117,34])
            ]),
            step('reorder-expense','Attach the reorder receipt','The expense already contains the item name, ordered quantity, total cost and cost per unit.','expenses.html',shots.expense,[
                p(shots.expense,802,741,'Find the automatic expense','Look for Reorder received. The example shows 10 units at £40 each, totalling £400.',[547,707,670,60]),
                p(shots.expense,1396,731,'Check the total','The final confirmed order cost is included in expense totals.',[1364,716,72,53]),
                p(shots.expense,1516,719,'Attach receipt','Choose Attach receipt to add the supplier image or PDF. You do not need to create this expense again.',[1475,695,81,48])
            ])
        );
        // Keep this written example for destination assigning until a screenshot
        // of that tab is supplied. It is labelled as an illustration in the guide.
        const assignment=pro.steps.find(s=>s.title==='Order, receive and assign');
        assignment.legacyId=pro.id+':'+assignment.title;
        assignment.title='Assign received stock from Holding';
        assignment.description='After receipt, split the quantity between final locations. Unassigned units remain in Holding.';
        assignment.demo='destinations';assignment.points=[
            {x:27,y:25,title:'Open Destination assigning',detail:'Received whole-item orders wait here until their stock is placed.'},
            {x:36,y:58,title:'Split the quantity',detail:'Choose each destination and quantity. The combined amount cannot exceed the unassigned quantity. Ten units can be split as six and four.'},
            {x:72,y:87,title:'Confirm locations or print labels',detail:'Only assigned quantities move. The remainder stays in Holding. Mobile and QZ Tray printing are manual actions here.'}
        ];
        const emailIndex=pro.steps.findIndex(s=>s.title==='Email shipping labels to your workspace');
        pro.steps.splice(emailIndex+1,0,step('reimport','Reimport labels and watch progress','Choose how many recent shipping-label emails to process again, then watch their progress in Dispatch Centre.','dispatch-centre.html',shots.reimportIdle,[
            p(shots.reimportIdle,346,103,'Choose the number of recent emails','Use the previous-email count for the label emails you want to reimport. Check the queue first to avoid unnecessary reprints.',[79,82,312,43]),
            p(shots.reimportIdle,170,159,'Reimport and crop again','Start reimporting. This retries label attachments and cropping; it is separate from a stock removal.',[79,140,182,39]),
            p(shots.reimportWorking,634,342,'Watch label import progress','The progress panel records processing and completion. These are recorded test screenshots, not a live import running in this guide.',[37,287,1288,123]),
            p(shots.reimportWorking,1280,249,'Clear completed activity','Completed progress stays visible for five minutes. Clear now dismisses completed activity; it does not delete labels or stock.',[1235,230,90,39])
        ]));
        replace(business,'Share a workspace',step('workspace-members','Share a workspace','Invite people to the workspace and choose the role they need.','workspace-members.html',shots.members,[
            p(shots.members,934,289,'Choose the invited role','Select the access level before creating the invite link. Review what that role is allowed to change.',[527,248,844,67]),
            p(shots.members,950,341,'Create the invitation','Create Invite Link, then send it to the intended teammate. They join using the link or invite code.',[527,319,844,43]),
            p(shots.members,924,773,'Review members','Check the member name, role and status. Owners and admins can manage access according to their permissions.',[527,716,844,91])
        ]));
        replace(business,'Work from the same inventory',step('workspace-inventories','Manage workspace inventories','Keep separate stock holdings organised inside the shared workspace.','workspace-members.html',shots.workspace,[
            p(shots.workspace,910,352,'Check the workspace','Confirm the workspace, your role, member count and inventory count before making changes.',[529,291,845,105]),
            p(shots.workspace,936,549,'Name the workspace','Owners and admins can rename the workspace. This changes its display name.',[529,509,845,63]),
            p(shots.workspace,824,846,'Create or manage inventories','Use a separate inventory for each stock holding. Select the correct one in the top bar before stock actions. Default inventories cannot be deleted.',[529,742,845,275])
        ]));
        replace(business,'Enable Manufacturing mode',step('manufacturing-mode','Enable Manufacturing mode','Business includes manufacturing tools. Enable them per workspace in Settings.','settings.html',shots.manufacturing,[
            p(shots.manufacturing,692,425,'Business manufacturing card','Open Settings and find Manufacturing mode. The tools require Business access.',[529,390,519,241]),
            p(shots.manufacturing,727,509,'Enable for this workspace','The switch is off by default. An owner or admin enables it for everyone in this workspace.',[701,490,332,41]),
            p(shots.manufacturing,612,577,'Open Manufacturing','Open the page from this link or the sidebar. Select one inventory for materials, recipes and production.',[547,564,157,27])
        ],'manufacturing'));
        replace(business,'Receive measured materials',step('materials','Receive measured materials','Create raw materials and packaging, then record their received batches and locations.','manufacturing.html#materials',shots.materials,[
            p(shots.materials,1475,411,'Add a material','Create materials using the appropriate units: each, grams, litres, metres and their compatible units. Whole-item saleable stock is tracked separately.',[1423,390,109,43]),
            p(shots.materials,1595,411,'Receive a batch','Record its quantity, batch number, storage location and optional expiry when receiving stock.',[1533,390,121,43]),
            p(shots.materials,603,548,'Check eligible stock','Cards show what is eligible for production. Expired, held and recalled batches are excluded.',[469,457,288,240]),
            p(shots.materials,622,620,'Keep supplier details','Supplier details support ordering materials. Archive a material only when it is no longer needed.',[560,601,124,41])
        ],'manufacturing'));
        replace(business,'Create a product recipe',step('recipe','Create a product recipe','A bill of materials records the quantities required for one finished item.','manufacturing.html#recipes',shots.recipeTop,[
            p(shots.recipeTop,1442,411,'Create a recipe','Choose Create recipe. Link it to an existing finished product and barcode, or create a new finished product first.',[1387,391,267,40]),
            p(shots.recipeCard,704,619,'Amounts are per finished item','Check every component quantity and unit. Production and the calculator multiply these amounts by the number of finished items.',[483,570,481,107]),
            p(shots.recipeCard,529,737,'Edit or archive a recipe','Edit recipe changes the definition for future work. Archive hides recipes you no longer need.',[483,717,170,43])
        ],'manufacturing'));
        const recipeIndex=business.steps.findIndex(s=>s.id==='recipe');
        business.steps.splice(recipeIndex+1,0,step('recipe-calculator','Calculate and combine material orders','Plan one or several recipes, combine their shared ingredients and send only the shortage to Reordering.','manufacturing.html#calculate',shots.calculate,[
            p(shots.calculate,1002,330,'Choose recipes and finished quantities','Select a recipe and how many finished items you want. Add another recipe to plan several together.',[459,275,1186,91]),
            p(shots.calculate,612,413,'Calculate requirements','The preview combines shared materials and considers eligible available stock and earlier pending plans.',[459,392,325,41]),
            p(shots.calculate,1076,693,'Review the combined order','Compare the required, available and combined-order columns. Calculating does not consume or reserve stock.',[459,576,1186,233]),
            p(shots.calculate,581,899,'Add the combined plan to Reordering','Save the reviewed plan. Pending unplaced material plans are consolidated; placed orders keep their agreed quantities.',[459,880,245,39])
        ],'manufacturing'));
        business.steps.splice(recipeIndex+2,0,step('recipe-reminders','Order the combined recipe materials','The Recipe materials section in Reordering appears only while Manufacturing mode is enabled.','reorders.html',shots.calculate,[
            p(shots.calculate,1589,224,'Open Reordering','Open Reordering to see the saved recipe-material requirements. Mark ordered materials, receive batches, then assign their locations.',[1533,213,112,30]),
            p(shots.calculate,580,899,'One consolidated material plan','Keep shared ingredients together rather than ordering separately for every recipe. Remove pending plans you no longer need.',[459,880,245,39]),
            p(shots.calculate,1077,517,'Daily reminder for recipe materials','With the optional reorder-email add-on enabled, recipe materials are combined into one daily email. The default is 17:00 UK time unless you change the recipe summary time.',[459,462,1186,97])
        ],'manufacturing'));
        replace(business,'Preview and complete production',step('production','Preview and complete production','Create the run with its recipe, finished quantity, batch details and destination, then review the material picks.','manufacturing.html#production',shots.production,[
            p(shots.production,859,325,'Check the source batches','The preview names the eligible material batches that will be consumed.',[659,282,585,66]),
            p(shots.production,1004,488,'Follow locations and quantities','Pick the listed amount from each source location. The example includes Holding as a material source.',[659,439,585,68]),
            p(shots.production,933,878,'Wait until the products are ready','Confirm only when the materials have been used and the finished products are ready. Start a ready timer first if they still need time.',[641,852,620,49]),
            p(shots.production,785,960,'Complete production','Completion deducts the materials and adds finished stock together. If the plan changes, review a fresh preview before confirming.',[701,939,167,40])
        ],'manufacturing'));
        replace(business,'Maintain tools and set timers',step('timer','Set a timer that continues after logout','Use a deadline for product readiness, cleaning or another task. A timer does not automatically complete production.','manufacturing.html#timers',shots.timer,[
            p(shots.timer,951,399,'Name the task and type','Choose a clear name and reminder type, such as Product ready or cleaning.',[641,355,636,142]),
            p(shots.timer,951,546,'Choose a duration','Set the number and time unit. This example is ready in 10 hours.',[641,504,636,65]),
            p(shots.timer,951,666,'Optional email reminder','Choose optional linked equipment and whether to email your verified account when due. The deadline continues while you are logged out.',[641,577,636,106]),
            p(shots.timer,691,847,'Start the timer','Start timer saves the deadline. When it is due, acknowledge it and separately record cleaning or complete production.',[641,827,101,40])
        ],'manufacturing'));
        const trace=business.steps.find(s=>s.title==='Trace, hold or recall batches');trace.audience='manufacturing';
        business.steps.push({id:'equipment',title:'Track equipment uses and maintenance',description:'Record usage and cleaning thresholds separately from elapsed reminder time.',audience:'manufacturing',demo:'equipment',url:'manufacturing.html#equipment',points:[
            {x:27,y:24,title:'Register the equipment',detail:'Set a use limit, an operating-hour limit or a cleaning interval for the tool.'},
            {x:40,y:52,title:'Link usage to recipes',detail:'Recipes can record uses or operating hours per batch or per finished item. Completed production records that usage.'},
            {x:70,y:79,title:'Record maintenance',detail:'Record cleaning or replacement when the work is actually done. Timer duration is not automatically treated as operating hours.'}
        ]});
        stages.forEach(stage=>stage.steps.forEach(s=>{s.id=stage.id+':'+(s.id||s.title);s.audience=s.audience||'all';}));
        return{stages,legacy,shots};
    }
    window.InventoryGuideContent={enhance};
})();
