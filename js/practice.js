import {coreSteps,optionalSteps,createPractice,escapeHTML as esc,positiveInteger,addPracticeStock,removePracticeStock,reorderQuantity,receivePracticeOrder,assignPracticeOrder} from './practice-model.mjs?v=1';

// This page imports no live InventoryAPI, printers, email client or billing code.
const gate=window.InventoryGettingStarted,owner=gate?.owner();
if(!gate?.authenticated()){location.replace('/login.html');}
const saved=gate?.read(),replay=new URLSearchParams(location.search).get('replay')==='1'&&saved?.status!=='pending';
const persist=!!owner&&!replay&&saved?.status==='pending';
const finishLabel=persist?'Continue with Free':'Finish practice';
if(saved?.status==='complete'&&!replay)location.replace('/index.html');
let progress=persist?saved:{},model=createPractice(progress),modal=null,notice='',positionFrame=0,disposed=false,enrolmentClosed=false;
const timers=new Set();
// In-progress optional examples restart their simulated operation after a reload.
for(const steps of Object.values(optionalSteps))if(steps.includes(model.step)){model.step=steps[0];break;}
if(coreSteps.indexOf(model.step)>=6)model.form.location=model.location?.name||'';
if(coreSteps.indexOf(model.step)>=9)model.form.search=model.item.barcode;
if(coreSteps.indexOf(model.step)>=10&&coreSteps.indexOf(model.step)<15)model.bundle=true;
if(coreSteps.indexOf(model.step)>=12&&coreSteps.indexOf(model.step)<15)model.consolidated=true;
if(model.step==='location-confirm')modal='location';
if(model.step==='remove-approve')modal='remove';
const root=document.getElementById('practice-root');
const money=pence=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(pence/100);
const screenFor=step=>step.startsWith('location')?'boxes':step.startsWith('add-')?'add':step.startsWith('remove-')?'remove':step.startsWith('dispatch-')?'dispatch':step.startsWith('expenses-')?'expenses':step.startsWith('barcodes-')?'barcodes':step.startsWith('reorders-')?'reorders':step.startsWith('team-')?'team':step.startsWith('guide-')?'settings':step==='dashboard-check'?'dashboard':'explore';
const chapterFor=step=>step.startsWith('location')?1:step.startsWith('add-')?2:step.startsWith('remove-')?3:4;
const icons={dashboard:'⌂',boxes:'▤',add:'+',remove:'−',expenses:'£',dispatch:'↗',barcodes:'▥',reorders:'↻',team:'◇',settings:'⚙'};
function theme(){
 try{const appearance=localStorage.getItem('inventoryos_appearance')==='light'?'light':'dark',colour=localStorage.getItem('inventoryos_theme');document.documentElement.dataset.appearance=appearance;document.documentElement.dataset.theme=['green','purple','blue','gold','red','cyan'].includes(colour)?colour:'green';document.documentElement.style.colorScheme=appearance;}catch{}
 const colour=getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
 const rgb=/^#([0-9a-f]{6})$/i.exec(colour);if(rgb){const v=[0,2,4].map(i=>parseInt(rgb[1].slice(i,i+2),16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4),l=v[0]*.2126+v[1]*.7152+v[2]*.0722;document.documentElement.style.setProperty('--practice-button-ink',l>.179?'#101215':'#ffffff');}
}
theme();
function remember(){if(persist&&!enrolmentClosed)gate.write({status:'pending',step:model.step,coreComplete:model.coreComplete,explored:[...model.explored]},owner);}
function setStep(step){model.step=step;notice='';remember();render();}
function message(text){notice=text;const el=document.getElementById('practice-notice');if(el)el.textContent=text;}
function clearTimers(){for(const timer of timers)clearTimeout(timer);timers.clear();}
function later(fn,delay){const timer=setTimeout(()=>{timers.delete(timer);if(!disposed)fn();},delay);timers.add(timer);}
function labelArt(number=1){return '<div class="practice-label" data-print-artwork><strong>PRACTICE SHIPPING LABEL</strong><div class="practice-label-rule"></div><p>DEMO PARCEL '+number+'</p><span class="practice-address">Example recipient<br>Sample address</span><div class="practice-code" aria-hidden="true"></div><small>DEMO-'+number+' · NOT VALID FOR POSTAGE</small><b>4 × 6</b></div>';}
function productRow(){return '<div class="practice-product-row"><span class="practice-product-icon" aria-hidden="true">▤</span><div><strong>'+esc(model.item.name)+'</strong><small>'+esc(model.item.barcode)+' · '+esc(model.location?.name||'BOX-1')+'</small></div><b>'+model.item.qty+' units</b></div>';}
function heading(title,sub='',badge='Free basics'){return '<div class="practice-page-heading"><div><span class="practice-eyebrow">PRACTICE WORKSPACE</span><h1>'+title+'</h1>'+(sub?'<p>'+sub+'</p>':'')+'</div><span class="practice-plan">'+badge+'</span></div>';}
function boxes(){return heading('Boxes','Give your stock a place to live.')+'<div class="practice-toolbar"><button id="practice-create-location" class="practice-primary" data-action="create-location">+ Create Box</button><span>'+Number(!!model.location)+' location'+(model.location?'':'s')+'</span></div><div class="practice-panel"><h2>Storage locations</h2>'+(model.location?'<article class="practice-location-card"><span class="practice-eyebrow">READY FOR STOCK</span><h3>'+esc(model.location.name)+'</h3><p>'+esc(model.location.notes||'Your first practice storage location')+'</p><span>0 units</span></article>':'<div class="practice-empty"><strong>A home for every item.</strong><p>Create a box before adding your first stock.</p></div>')+'</div>';}
function add(){return heading('Add Stock','Record what arrived and where you put it.')+'<section class="practice-panel practice-form-panel"><form id="practice-add-form"><label for="practice-name">Item Description</label><input id="practice-name" name="name" value="'+esc(model.form.name)+'" maxlength="100" required autocomplete="off"><p class="practice-hint">Use an example item. This stays in the practice workspace.</p><div class="practice-two-col"><div><label for="practice-qty">Quantity</label><input id="practice-qty" name="qty" type="number" min="1" max="1000" step="1" value="'+model.form.qty+'" required></div><div><label for="practice-location">Storage location</label><select id="practice-location" name="location" required><option value="">Choose a location</option><option value="'+esc(model.location?.name||'BOX-1')+'"'+(model.form.location?' selected':'')+'>'+esc(model.location?.name||'BOX-1')+'</option></select></div></div><button id="practice-save-stock" class="practice-primary" type="submit">+ Save Product</button></form>'+(model.item.qty?'<div class="practice-success">Product saved in practice.</div>'+productRow():'')+'</section>';}
function matches(){const q=model.form.search.trim().toLowerCase();return q&&(model.item.name.toLowerCase().includes(q)||model.item.barcode.toLowerCase().includes(q));}
function matchMarkup(){return matches()?'<button id="practice-match" class="practice-match" data-action="select-item"><strong>'+esc(model.item.name)+'</strong><span>'+esc(model.item.barcode)+' · '+model.item.qty+' available</span><b>Add to Bundle List +</b></button>':'<p class="practice-hint">Type the practice item’s name or barcode to find it.</p>';}
function remove(){return heading('Remove Stock','Choose the item and review where it will come from.')+'<section class="practice-panel practice-form-panel"><label for="practice-search">Barcode or Item Name</label><input id="practice-search" value="'+esc(model.form.search)+'" placeholder="Type a name or barcode" autocomplete="off"><div id="practice-matches">'+matchMarkup()+'</div><div id="practice-bundle" class="practice-bundle">'+(model.bundle?'<h2>Bundle List</h2><div class="practice-bundle-line"><div><strong>'+esc(model.item.name)+'</strong><small>'+esc(model.location?.name)+' · '+model.item.qty+' available</small></div><label for="practice-remove-qty">Qty needed<input id="practice-remove-qty" type="number" min="1" max="'+model.item.qty+'" step="1" value="'+model.form.removeQty+'" required></label></div><button id="practice-consolidate" class="practice-secondary" data-action="consolidate">Consolidate picking plan</button>':'<div class="practice-empty">Your selected item will appear here.</div>')+'</div>'+(model.consolidated?'<div id="practice-pick-plan" class="practice-pick-plan"><span class="practice-eyebrow">YOUR PICKING PLAN</span><h3>'+esc(model.location?.name)+'</h3><p>'+model.form.removeQty+' × '+esc(model.item.name)+'</p></div><button id="practice-remove-stock" class="practice-primary" data-action="remove-stock">Remove Stock</button>':'')+(model.step==='remove-saved'?'<p class="practice-success">Removed in practice. Remaining: '+model.item.qty+' units.</p>':'')+'</section>';}
function dashboard(){return heading('Your business at a glance','Check how the stock movements changed your totals.')+'<section class="practice-stats"><article id="practice-stock-total" class="practice-stat"><span>Active stock</span><strong>'+model.item.qty+'</strong><small>units in this practice workspace</small></article><article class="practice-stat"><span>Storage locations</span><strong>'+Number(!!model.location)+'</strong><small>'+esc(model.location?.name||'No locations yet')+'</small></article><article class="practice-stat"><span>Recorded expenses</span><strong>'+money(model.expenses.reduce((n,e)=>n+e.pence,0))+'</strong><small>practice figures only</small></article></section><section class="practice-panel"><h2>Recent activity</h2>'+model.activity.slice(0,5).map(x=>'<div class="practice-activity"><span aria-hidden="true">✓</span><p>'+esc(x)+'</p><small>Just now</small></div>').join('')+'</section>';}
function settings(){return heading('Settings','Your guide and help are always here.')+'<section class="practice-settings-grid"><article class="practice-panel"><span class="practice-eyebrow">LEARN AT YOUR OWN PACE</span><h2>Inventory Guide</h2><p>The illustrated guide covers Free, Starter, Pro and Business.</p><button id="practice-open-guide" class="practice-primary" data-action="open-guide">Open Inventory Guide</button></article><article class="practice-panel"><h2>Help</h2><p>In your real account, Settings → Help lets you send the team a question linked to your workspace.</p><a class="practice-secondary" href="mailto:hello@inventoryos.co.uk">Email hello@inventoryos.co.uk</a></article></section>';}
function dispatch(){const working=model.step==='dispatch-working',done=model.labels.length>0;return heading('Dispatch Centre','Prepare labels for a packing session.','Pro · email import')+'<section class="practice-panel"><h2>Email shipping labels to InventoryOS</h2><div class="practice-email-row"><div><span class="practice-hint">Example workspace label address</span><code>practice@labels.example.invalid</code></div><button id="practice-send-email" class="practice-primary" data-action="send-test"'+(working?' disabled':'')+'>Send test email</button></div><p class="practice-hint">Simulated email import: no real email is sent or received in this walkthrough.</p></section>'+(working?'<section id="practice-import" class="practice-panel" role="status"><h2>'+['Sending practice test…','Email received','Cropping label attachments','Labels ready'][model.importPhase]+'</h2><progress max="3" value="'+model.importPhase+'" aria-label="Simulated import progress"></progress><p>'+['Creating the sample email.','Three sample PDFs found.','Preparing the 4 × 6 label area.','Review the labels in your packing queue.'][model.importPhase]+'</p></section>':'')+'<section class="practice-panel"><div class="practice-panel-heading"><h2>Packing queue <span class="practice-count">'+model.labels.length+'</span></h2>'+(done?'<button class="practice-secondary" data-action="preview-mobile" id="practice-queue-print">Mobile print cropped shipping labels</button>':'')+'</div>'+(done?'<div class="practice-label-grid">'+model.labels.map((n,i)=>'<article class="practice-label-card"><div class="practice-label-thumb">'+labelArt(n)+'</div><strong>'+esc(i===0?model.item.name:'Sample parcel '+n)+'</strong><span class="practice-success">Cropped · ready to review</span><button '+(i===0?'id="practice-label-review" ':'')+'class="practice-secondary" data-action="review-label">Review label</button></article>').join('')+'</div>':'<div class="practice-empty">The test email’s labels will arrive here.</div>')+'</section>';}
function expenses(){return heading('Expenses','Keep a receipt with the cost it belongs to.','Starter · expenses & receipts')+'<section class="practice-panel practice-form-panel"><form id="practice-expense-form"><label for="practice-expense-name">Expense name</label><input id="practice-expense-name" maxlength="100" value="'+esc(model.form.expenseName)+'" required><label for="practice-expense-amount">Total cost (£)</label><input id="practice-expense-amount" type="number" step="0.01" min="0.01" max="10000" value="'+(model.form.expensePence/100).toFixed(2)+'" required><div id="practice-receipt" class="practice-receipt-box">'+(model.form.receipt?'<strong>Sample receipt attached</strong><p>EXAMPLE SUPPLIES · Packing supplies · '+money(model.form.expensePence)+'</p><small>Demonstration receipt — no file uploaded.</small>':'<button id="practice-attach-receipt" type="button" class="practice-secondary" data-action="attach-receipt">Attach sample receipt</button>')+'</div><button id="practice-save-expense" class="practice-primary" type="submit">Save Expense</button></form>'+(model.step==='expenses-done'?'<p class="practice-success">Expense and sample receipt saved in practice.</p>':'')+'</section>';}
function barcodes(){return heading('Barcode Printing','Group the labels you need into a print job.','Starter · barcode print jobs')+'<section class="practice-panel"><h2>Create print job</h2><p>First batch · '+esc(model.item.name)+'</p><button id="practice-create-job" class="practice-primary" data-action="create-job">Create Print Job</button></section>'+(model.printJob?'<section class="practice-panel"><h2>First batch</h2><div class="practice-product-row"><div><strong>'+esc(model.item.name)+'</strong><small>2 barcode labels</small></div><button id="practice-preview-job" class="practice-secondary" data-action="preview-job">Preview labels</button></div><p class="practice-hint">Your real print jobs let you prepare labels for supported printing routes. This example will not contact a printer.</p></section>':'');}
function reorders(){const order=model.order;return heading('Reordering','Set a minimum, order up to a target and receive stock.','Pro · reordering')+'<section class="practice-panel"><div class="practice-panel-heading"><h2>Item reorder rules</h2><button id="practice-create-rule" class="practice-primary" data-action="create-rule">Create item reorder rule</button></div>'+(order?'<div class="practice-order"><span class="practice-eyebrow">'+(order.status==='needed'?'NEEDS REORDERING':order.status==='ordered'?'ORDERED':order.status==='holding'?'DESTINATION ASSIGNING':'RECEIVED & ASSIGNED')+'</span><h3>'+esc(model.item.name)+'</h3><p>Example supplier · Target: 10 units · '+order.qty+' units to replenish</p><p>Estimated cost: '+money(order.qty*120)+' (example cost: £1.20 per unit)</p>'+(order.status==='needed'?'<button id="practice-mark-ordered" class="practice-primary" data-action="mark-ordered">Ordered</button>':order.status==='ordered'?'<button id="practice-receive" class="practice-primary" data-action="receive-order">Mark as received</button>':order.status==='holding'?'<label for="practice-assign-location">Destination</label><select id="practice-assign-location"><option>'+esc(model.location?.name)+'</option></select><p>'+order.qty+' units in holding</p><button id="practice-assign" class="practice-primary" data-action="assign-order">Confirm location assignment</button>':'<p class="practice-success">Assigned to '+esc(model.location?.name)+'. Practice holding: '+model.item.qty+' units.</p>')+'</div>':'<div class="practice-empty">Current holding: '+model.item.qty+' units. Create an example rule with a minimum of 3 and a target of 10.</div>')+'</section>';}
function team(){return heading('Workspace Members','Give colleagues the access they need.','Business · teams & permissions')+'<section class="practice-panel practice-form-panel"><h2>Example colleague</h2><p>Sample team member. No invitation or email will be sent.</p><label for="practice-role">Workspace role</label><select id="practice-role"><option value="viewer"'+(model.form.role==='viewer'?' selected':'')+'>Viewer — read-only access</option><option value="editor"'+(model.form.role==='editor'?' selected':'')+'>Editor — work with stock</option></select><button id="practice-save-role" class="practice-primary" data-action="save-role">Save practice access</button>'+(model.step==='team-done'?'<p class="practice-success">Example colleague now has '+esc(model.form.role)+' access in practice.</p>':'')+'</section>';}
const features=[['dispatch','Email import & label cropping','Pro & Business','Press Send test email, follow its arrival and review the cropped labels.'],['expenses','Expenses & receipts','Starter and above','Attach a sample receipt to an expense.'],['barcodes','Barcode print jobs','Starter and above','Create a practice print job and preview its labels.'],['reorders','Reordering & receiving','Pro & Business','Order to a target, receive a delivery and assign the units.'],['team','Shared workspaces','Business','Try a colleague’s access settings without sending an invitation.']];
function explore(){return heading(model.coreComplete?'You’ve got the basics.':'Welcome to guided practice','Your real stock and subscription stay unchanged. No practice data will carry over.','Practice complete')+'<section class="practice-complete"><span class="practice-complete-mark" aria-hidden="true">✓</span><div><h2>Location created. Stock in. Stock out.</h2><p>You’ve seen how the dashboard connects it all. Continue to your real inventory, or try a short paid-feature example first.</p><div class="practice-actions"><button class="practice-primary" data-action="finish">'+finishLabel+' →</button><button class="practice-secondary" data-action="compare">Compare plans</button></div></div></section><section><div class="practice-section-title"><h2>See what else could help you.</h2><span>Optional practice · no payment or upgrade</span></div><div class="practice-feature-grid">'+features.map(([key,title,plan,desc])=>'<article class="practice-panel"><span class="practice-eyebrow">'+plan+'</span><h3>'+title+'</h3><p>'+desc+'</p><button class="practice-secondary" data-action="try-'+key+'">'+(model.explored.has(key)?'Try again':'Try it')+' →</button>'+(model.explored.has(key)?'<span class="practice-success">Explored ✓</span>':'')+'</article>').join('')+'</div></section><section class="practice-panel practice-trial"><div><span class="practice-eyebrow">TRY IT WITH YOUR OWN STOCK</span><h2>Ask for one free week of Business.</h2><p>Create your account, then email hello@inventoryos.co.uk to request activation. No automatic paid upgrade. Retail is separate.</p></div><a class="practice-secondary" data-action="trial" href="mailto:hello@inventoryos.co.uk?subject=My%20free%20week%20of%20Business">Request my free week</a></section><p class="practice-hint">For illustrated guides later, open Settings → Inventory Guide. Questions? Use Settings → Help or email hello@inventoryos.co.uk.</p>';}
function modalMarkup(){if(!modal)return '';let body='';
 if(modal==='location')body='<h2>Create storage location</h2><form id="practice-location-form"><label for="practice-location-name">Suggested name</label><input id="practice-location-name" maxlength="100" value="BOX-1" required><label for="practice-location-notes">Notes <span>(optional)</span></label><textarea id="practice-location-notes" rows="2" maxlength="250" placeholder="For example: garage, left wall"></textarea><button id="practice-confirm-location" class="practice-primary" type="submit">Confirm</button></form>';
 if(modal==='remove')body='<h2>Confirm stock removal</h2><p>Remove <strong>'+model.form.removeQty+' × '+esc(model.item.name)+'</strong> from <strong>'+esc(model.location?.name)+'</strong>?</p><p class="practice-hint">Practice stock only. Nothing will be removed from your real account.</p><button id="practice-approve-remove" class="practice-primary" data-action="approve-remove">Confirm removal</button>';
 if(modal==='label')body='<h2>Cropped label preview</h2><p>Illustrative practice crop. This is not a processed real attachment.</p>'+labelArt()+'<button id="practice-mobile-print" class="practice-primary" data-action="preview-mobile">Mobile print cropped shipping labels</button><p class="practice-hint">Practice preview only: nothing will be shared or sent to a printer.</p>';
 if(modal==='job')body='<h2>First batch · label preview</h2><div class="practice-barcode-label"><strong>'+esc(model.item.name)+'</strong><div class="practice-code" aria-hidden="true"></div><small>'+esc(model.item.barcode)+'</small></div><p class="practice-hint">Illustrative practice barcode. No physical labels will print.</p><button id="practice-close-job" class="practice-primary" data-action="close-job">Done</button>';
 if(modal==='receipt')body='<h2>Confirm delivery received</h2><p>'+model.order.qty+' × '+esc(model.item.name)+'</p><p>These practice units will move to holding until you assign a location.</p><button id="practice-confirm-receive" class="practice-primary" data-action="confirm-receive">Confirm received</button>';
 return '<div class="practice-modal-backdrop"></div><section class="practice-modal" role="dialog" aria-modal="true" aria-label="Practice confirmation">'+body+'</section>';
}
const tips={
 'location-create':['#practice-create-location','Give your stock a home','First, press Create Box. In your real account, locations tell you where each item is stored.'],
 'location-confirm':['.practice-modal','Confirm your first location','Keep the suggested name, or edit this practice name. Add an optional note, then press Confirm.'],
 'location-saved':['#practice-nav-add','Your first location is ready','Now press Add stock in the menu. We’ll put an example item into your new location.'],
 'add-name':['#practice-name','Name the item','Use the example name or type another practice item. Press Next when you’re ready.','Next'],
 'add-qty':['#practice-qty','How many arrived?','Try 2 units so you can remove one and see the stock total change.','Next'],
 'add-location':['#practice-location','Choose where it lives','Select the storage location you just created.','Next'],
 'add-save':['#practice-save-stock','Save the stock','Press Save Product. This adds units to the practice workspace only.'],
 'add-saved':['#practice-nav-remove','Stock added','Next, press Remove stock. We’ll find this item and prepare a picking plan.'],
 'remove-search':['#practice-search','Find the item','Type the item’s name or its practice barcode, then press Next.','Next'],
 'remove-select':['#practice-match','Add it to your picking list','Press the matching result to add this practice item to the Bundle List.'],
 'remove-qty':['#practice-remove-qty','Choose the quantity to remove','Leave 1 selected to keep a unit in stock, or choose another available quantity.','Next'],
 'remove-consolidate':['#practice-consolidate','See where to pick from','Press Consolidate picking plan. With several items, consolidation helps reduce the locations you visit.'],
 'remove-confirm':['#practice-remove-stock','Review the plan before removing','The plan shows the quantity and storage location. Press Remove Stock to continue to confirmation.'],
 'remove-approve':['#practice-approve-remove','Confirm the movement','Check the item, quantity and location, then confirm this practice removal.'],
 'remove-saved':['#practice-nav-dashboard','Now check the result','Press Dashboard to see how your stock total changed.'],
 'dashboard-check':['#practice-stock-total','Your totals are connected','The active-stock total now reflects your practice addition and removal. Recent activity records both.','Next'],
 'guide-find':['#practice-nav-settings','Know where to find help later','Press Settings. Your real account has an illustrated guide and a Help form here.'],
 'guide-open':['#practice-open-guide','A guide whenever you need it','Press Open Inventory Guide to finish the basics. You can revisit the real guide after this walkthrough.'],
 'dispatch-send':['#practice-send-email','Try the email-import workflow','Press Send test email. This simulates a label email arriving at your workspace address; no real email is sent.'],
 'dispatch-working':['#practice-import','Your practice email is being processed','Watch the sample email arrive, its attachments be prepared and the cropped labels reach the Packing Queue.'],
 'dispatch-preview':['#practice-label-review','The labels have arrived','Open Review label to inspect the sample crop. In the real workflow, always check the barcode and parcel details.'],
 'dispatch-print':['#practice-mobile-print','Ready for the mobile print route','Press Mobile print cropped shipping labels. Here it completes the practice preview; it won’t open your printer or share menu.'],
 'expenses-name':['#practice-expense-name','Keep costs identifiable','Use the sample expense name or enter a practice description.','Next'],
 'expenses-amount':['#practice-expense-amount','Record the cost','Enter an example amount. This will not become a real expense.','Next'],
 'expenses-receipt':['#practice-attach-receipt','Attach the receipt','Press Attach sample receipt. There’s no need to upload one of your own files.'],
 'expenses-save':['#practice-save-expense','Save them together','Press Save Expense to link the example receipt and cost in practice.'],
 'barcodes-create':['#practice-create-job','Prepare a print job','Press Create Print Job to group two sample barcode labels together.'],
 'barcodes-preview':['#practice-preview-job','Check the labels first','Press Preview labels. In a real job, check the item and label format before printing.'],
 'reorders-rule':['#practice-create-rule','Set a replenishment rule','Create an example rule: minimum 3 units, reorder up to 10. We’ll use a sample supplier cost of £1.20 per unit.'],
 'reorders-order':['#practice-mark-ordered','Track what you ordered','This item is below its sample minimum. Press Ordered to move the replenishment into the ordered stage.'],
 'reorders-receive':['#practice-receive','Receive the delivery','Press Mark as received when the example order arrives. In your real account, only confirm deliveries actually received.'],
 'reorders-assign':['#practice-assign','Give the new stock a destination','The received units are in holding. Confirm the practice storage location to assign them.'],
 'team-access':['#practice-role','Choose a colleague’s access','Try Viewer for read-only access or Editor to work with stock. This does not change a real person’s permissions.','Next'],
 'team-save':['#practice-save-role','Keep access under your control','Save the practice role. Business adds shared inventory, team accounts and permissions.']
};
function completeFeature(key){model.explored.add(key);modal=null;setStep(key+'-done');}
function render(){
 clearTimers();const screen=screenFor(model.step),core=coreSteps.includes(model.step)&&model.step!=='core-done';
 const title={boxes:'Storage locations',add:'Add stock',remove:'Remove stock',dashboard:'Dashboard',settings:'Settings',dispatch:'Dispatch Centre',expenses:'Expenses',barcodes:'Barcode printing',reorders:'Reordering',team:'Workspace members',explore:'Your next step'}[screen];
 const content={boxes,add,remove,dashboard,settings,dispatch,expenses,barcodes,reorders,team,explore}[screen]();
 const featureDone=model.step.endsWith('-done')&&model.step!=='core-done';
 root.innerHTML='<div class="practice-layout"><aside class="practice-sidebar"><a class="practice-brand" href="#" data-action="stay"><span aria-hidden="true">▥</span> Inventory<span>OS</span></a><div class="practice-workspace"><strong>Practice workspace</strong><span>Example data only</span></div><nav aria-label="Practice workspace navigation">'+[['dashboard','Dashboard'],['add','Add stock'],['remove','Remove stock'],['boxes','Boxes'],['dispatch','Dispatch Centre'],['expenses','Expenses'],['barcodes','Barcode printing'],['reorders','Reordering'],['team','Workspace members'],['settings','Settings']].map(([key,label])=>'<button id="practice-nav-'+key+'" data-action="nav-'+key+'"'+(screen===key?' aria-current="page"':'')+'><span aria-hidden="true">'+icons[key]+'</span>'+label+'</button>').join('')+'</nav><p>Your real account<br><strong>Stock &amp; billing unchanged</strong></p></aside><div class="practice-shell"><header class="practice-header"><div><span class="practice-eyebrow">'+(core?'GUIDED SETUP · '+chapterFor(model.step)+' OF 4':'EXPLORE AT YOUR OWN PACE')+'</span><strong>'+title+'</strong></div><a href="mailto:hello@inventoryos.co.uk" class="practice-help">Need help?</a></header><div class="practice-banner"><span class="practice-badge">PRACTICE MODE</span><p>Nothing here changes your real stock, sends email or starts a subscription.</p>'+(model.coreComplete?'<button data-action="finish">'+finishLabel+' →</button>':'')+'</div><main id="practice-main" tabindex="-1">'+content+'<p id="practice-notice" class="practice-notice" role="status" aria-live="polite">'+esc(notice)+'</p>'+(featureDone?'<section class="practice-feature-done"><h2>Example complete.</h2><p>You’ve tried this workflow. All of its data is still practice only.</p><div class="practice-actions"><button class="practice-primary" data-action="explore">Explore more features</button><button class="practice-secondary" data-action="finish">'+finishLabel+'</button></div></section>':'')+'</main><footer class="practice-footer">Practice details stay in this page’s memory and reset when it closes. Only tutorial progress is remembered on this browser.</footer></div></div>'+modalMarkup();
 if(screen!=='explore')history.replaceState(null,'',location.pathname+location.search+'#'+screen);
 else history.replaceState(null,'',location.pathname+location.search);
 renderCoach();
 if(model.step==='dispatch-working')runImport();
}
function renderCoach(){
 document.getElementById('practice-coach-layer')?.remove();
 const tip=getTip();if(!tip){document.documentElement.style.removeProperty('--practice-coach-height');requestAnimationFrame(()=>document.getElementById('practice-main')?.focus({preventScroll:true}));return;}
 const layer=document.createElement('div');layer.id='practice-coach-layer';layer.innerHTML='<div class="practice-shade" data-side="top"></div><div class="practice-shade" data-side="left"></div><div class="practice-shade" data-side="right"></div><div class="practice-shade" data-side="bottom"></div><div class="practice-spotlight" aria-hidden="true"></div><section id="practice-coach" class="practice-coach" role="dialog" aria-modal="false" aria-labelledby="practice-coach-title" aria-describedby="practice-coach-copy"><div class="practice-coach-top"><span>'+(model.coreComplete?'OPTIONAL FEATURE PRACTICE':'YOUR FIRST STOCK WORKFLOW')+'</span><span aria-hidden="true">✦</span></div><h2 id="practice-coach-title">'+tip[1]+'</h2><p id="practice-coach-copy">'+tip[2]+'</p><div class="practice-coach-actions">'+(tip[3]?'<button class="practice-primary" data-action="next">'+tip[3]+' →</button>':'<span class="practice-hint">'+(model.step==='dispatch-working'?'Processing sample files…':'Use the highlighted control')+'</span>')+(model.coreComplete&&model.step!=='dispatch-working'?'<button class="practice-text-button" data-action="explore">Back to features</button>':'')+'<a class="practice-coach-help" href="mailto:hello@inventoryos.co.uk">Need a hand? Email the team</a></div></section>';
 document.body.append(layer);
 requestAnimationFrame(()=>{positionCoach(true);const target=tip[0]&&document.querySelector(tip[0]);const focus=target?.matches('button,input,select,textarea,a[href]')?target:target?.querySelector('input,button,select,textarea,a[href]');focus?.focus({preventScroll:true});});
}
function positionCoach(scroll=false){
 const tip=getTip(),coach=document.getElementById('practice-coach'),layer=document.getElementById('practice-coach-layer');if(!tip||!coach||!layer)return;
 const target=tip[0]&&document.querySelector(tip[0]),mobile=innerWidth<760,pad=12,width=Math.min(mobile?innerWidth-24:360,innerWidth-24);
 coach.style.width=width+'px';
 const visibleBottom=Math.min(innerHeight,(window.visualViewport?.offsetTop||0)+(window.visualViewport?.height||innerHeight));
 const height=coach.getBoundingClientRect().height;document.documentElement.style.setProperty('--practice-coach-height',height+'px');
 if(scroll&&target){target.scrollIntoView({block:'center',behavior:'instant'});const r=target.getBoundingClientRect(),limit=mobile?visibleBottom-height-40:innerHeight-20;if(r.bottom>limit||r.top<20)window.scrollBy({top:r.top-100,behavior:'instant'});}
 let r=target?.getBoundingClientRect();
 if(r){r={left:Math.max(5,r.left-5),top:Math.max(5,r.top-5),right:Math.min(innerWidth-5,r.right+5),bottom:Math.min(innerHeight-5,r.bottom+5)};}
 const spot=layer.querySelector('.practice-spotlight');spot.hidden=!r;
 const rectangles=r?{top:[0,0,innerWidth,r.top],bottom:[0,r.bottom,innerWidth,Math.max(0,innerHeight-r.bottom)],left:[0,r.top,r.left,Math.max(0,r.bottom-r.top)],right:[r.right,r.top,Math.max(0,innerWidth-r.right),Math.max(0,r.bottom-r.top)]}:{top:[0,0,innerWidth,innerHeight],bottom:[0,0,0,0],left:[0,0,0,0],right:[0,0,0,0]};
 for(const [side,[x,y,w,h]]of Object.entries(rectangles)){const el=layer.querySelector('[data-side="'+side+'"]');Object.assign(el.style,{left:x+'px',top:y+'px',width:w+'px',height:h+'px'});}
 if(r)Object.assign(spot.style,{left:r.left+'px',top:r.top+'px',width:Math.max(0,r.right-r.left)+'px',height:Math.max(0,r.bottom-r.top)+'px'});
 let left=(innerWidth-width)/2,top=(innerHeight-height)/2;
 if(mobile)top=visibleBottom-height-pad;
 else if(r){left=r.right+width+24<innerWidth?r.right+20:r.left-width-24>0?r.left-width-20:Math.min(innerWidth-width-pad,Math.max(pad,r.left));top=Math.max(pad,Math.min(innerHeight-height-pad,r.bottom+height+20<innerHeight?r.bottom+16:r.top-height-16>0?r.top-height-16:r.top));}
 Object.assign(coach.style,{left:Math.max(pad,left)+'px',top:Math.max(pad,top)+'px'});
}
function positionSoon(){if(!positionFrame)positionFrame=requestAnimationFrame(()=>{positionFrame=0;positionCoach();});}
addEventListener('resize',positionSoon);addEventListener('scroll',positionSoon,{passive:true,capture:true});window.visualViewport?.addEventListener('resize',positionSoon);
document.addEventListener('keydown',event=>{
 const coach=document.getElementById('practice-coach'),tip=getTip();if(!coach||!tip)return;
 if(event.key==='Escape'){event.preventDefault();return;}
 if(event.key!=='Tab')return;
 const target=tip[0]&&document.querySelector(tip[0]);
 const nodes=[...(target?.matches('button,input,select,textarea,a[href]')?[target]:target?[...target.querySelectorAll('button,input,select,textarea,a[href]')]:[]),...coach.querySelectorAll('button,a[href]')].filter(el=>!el.disabled&&el.getBoundingClientRect().width>0);
 if(!nodes.length){event.preventDefault();return;}
 const current=nodes.indexOf(document.activeElement);event.preventDefault();nodes[(current+(event.shiftKey?-1:1)+nodes.length)%nodes.length].focus();
});
root.addEventListener('input',event=>{
 const {id,value}=event.target;
 if(id==='practice-name')model.form.name=value;if(id==='practice-qty')model.form.qty=value;if(id==='practice-location')model.form.location=value;
 if(id==='practice-search'){model.form.search=value;document.getElementById('practice-matches').innerHTML=matchMarkup();}
 if(id==='practice-remove-qty'){model.form.removeQty=value;model.consolidated=false;}
 if(id==='practice-expense-name')model.form.expenseName=value;if(id==='practice-expense-amount')model.form.expensePence=Math.round(Number(value)*100);
 if(id==='practice-role')model.form.role=value;
});
root.addEventListener('change',event=>{if(event.target.id==='practice-location')model.form.location=event.target.value;if(event.target.id==='practice-role')model.form.role=event.target.value;});
root.addEventListener('submit',event=>{
 event.preventDefault();if(!event.target.reportValidity())return;
 try{
  if(event.target.id==='practice-location-form'){const name=document.getElementById('practice-location-name').value.trim();if(!name){message('Enter a practice location name.');return;}model.location={name,notes:document.getElementById('practice-location-notes').value};modal=null;setStep('location-saved');}
  if(event.target.id==='practice-add-form'){addPracticeStock(model,model.form);setStep('add-saved');}
  if(event.target.id==='practice-expense-form'){if(!model.form.receipt)throw Error('Attach the sample receipt first.');if(!Number.isSafeInteger(model.form.expensePence)||model.form.expensePence<1||model.form.expensePence>1000000)throw Error('Enter a valid practice amount.');model.expenses.push({name:model.form.expenseName,pence:model.form.expensePence});completeFeature('expenses');}
 }catch(error){message(error.message);}
});
function validate(id){const element=document.getElementById(id);return element?.reportValidity();}
function next(){
 switch(model.step){
  case 'add-name':if(validate('practice-name')&&model.form.name.trim())setStep('add-qty');break;
  case 'add-qty':if(validate('practice-qty')&&positiveInteger(model.form.qty))setStep('add-location');break;
  case 'add-location':if(validate('practice-location')&&model.form.location===model.location?.name)setStep('add-save');break;
  case 'remove-search':if(matches())setStep('remove-select');else{message('Type the item name or barcode to find the practice item.');document.getElementById('practice-search').focus();}break;
  case 'remove-qty':if(validate('practice-remove-qty')&&positiveInteger(model.form.removeQty,model.item.qty))setStep('remove-consolidate');break;
  case 'dashboard-check':setStep('guide-find');break;
  case 'expenses-name':if(validate('practice-expense-name')&&model.form.expenseName.trim())setStep('expenses-amount');break;
  case 'expenses-amount':if(validate('practice-expense-amount')&&Number.isSafeInteger(model.form.expensePence)&&model.form.expensePence>0)setStep('expenses-receipt');break;
  case 'team-access':setStep('team-save');break;
 }
}
function runImport(){
 for(let phase=1;phase<=3;phase++)later(()=>{model.importPhase=phase;const progress=document.querySelector('#practice-import progress'),title=document.querySelector('#practice-import h2'),copy=document.querySelector('#practice-import p');if(progress)progress.value=phase;if(title)title.textContent=['','Email received','Cropping label attachments','Labels ready'][phase];if(copy)copy.textContent=['','Three sample PDFs found.','Preparing the 4 × 6 label area.','Review the labels in your packing queue.'][phase];if(phase===3){model.labels=[1,2,3];setStep('dispatch-preview');}},phase*800);
}
function finish(destination='/index.html'){
 if(!model.coreComplete)return;
 if(owner!==gate.owner()){message('The signed-in account changed. Return to login before continuing.');return;}
 // Replay never changes an existing account's mandatory onboarding state.
 if(persist&&!enrolmentClosed&&!gate.finish(owner)){message('Could not confirm your account. Please log in again.');return;}
 enrolmentClosed=true;clearTimers();model=createPractice();location.assign(destination);
}
document.addEventListener('click',event=>{
 const button=event.target.closest('[data-action]');if(!button)return;const action=button.dataset.action;
 if(action==='trial'){if(model.coreComplete&&persist&&gate.finish(owner))enrolmentClosed=true;return;}
 event.preventDefault();
 try{
  if(action==='stay')return;
  if(action==='next')return next();
  if(action==='finish')return finish(replay?'/settings.html':'/index.html');
  if(action==='compare')return finish('/billing.html');
  if(action==='explore'){modal=null;return setStep('explore');}
  if(action.startsWith('try-')){if(!model.coreComplete)return;const feature=action.slice(4);if(optionalSteps[feature]){modal=null;if(feature==='expenses')model.form.receipt=false;if(feature==='barcodes')model.printJob=false;if(feature==='reorders'){model.order=null;model.item.qty=2;}return setStep(optionalSteps[feature][0]);}}
  if(action==='nav-add'&&model.step==='location-saved')return setStep('add-name');
  if(action==='nav-remove'&&model.step==='add-saved')return setStep('remove-search');
  if(action==='nav-dashboard'&&model.step==='remove-saved')return setStep('dashboard-check');
  if(action==='nav-settings'&&model.step==='guide-find')return setStep('guide-open');
  if(action.startsWith('nav-'))return;
  if(action==='create-location'){modal='location';return setStep('location-confirm');}
  if(action==='select-item'&&matches()){model.bundle=true;model.form.removeQty=1;return setStep('remove-qty');}
  if(action==='consolidate'){if(!positiveInteger(model.form.removeQty,model.item.qty))throw Error('Choose an available quantity first.');model.consolidated=true;return setStep('remove-confirm');}
  if(action==='remove-stock'){modal='remove';return setStep('remove-approve');}
  if(action==='approve-remove'){removePracticeStock(model,model.form.removeQty);modal=null;return setStep('remove-saved');}
  if(action==='open-guide'){model.coreComplete=true;return setStep('core-done');}
  if(action==='send-test'&&model.step!=='dispatch-working'){model.labels=[];model.importPhase=0;return setStep('dispatch-working');}
  if(action==='review-label'){modal='label';return setStep('dispatch-print');}
  if(action==='preview-mobile')return completeFeature('dispatch');
  if(action==='attach-receipt'){model.form.receipt=true;return setStep('expenses-save');}
  if(action==='create-job'){model.printJob=true;return setStep('barcodes-preview');}
  if(action==='preview-job'){modal='job';render();requestAnimationFrame(()=>document.getElementById('practice-close-job')?.focus());return;}
  if(action==='close-job')return completeFeature('barcodes');
  if(action==='create-rule'){model.order={qty:reorderQuantity(model),status:'needed'};if(!model.order.qty)throw Error('This example has enough stock. Restart the low-stock example.');return setStep('reorders-order');}
  if(action==='mark-ordered'){model.order.status='ordered';return setStep('reorders-receive');}
  if(action==='receive-order'){modal='receipt';render();requestAnimationFrame(()=>document.getElementById('practice-confirm-receive')?.focus());return;}
  if(action==='confirm-receive'){receivePracticeOrder(model);modal=null;return setStep('reorders-assign');}
  if(action==='assign-order'){assignPracticeOrder(model);return completeFeature('reorders');}
  if(action==='save-role')return completeFeature('team');
 }catch(error){message(error.message);}
});
function getTip(){
 const tip=tips[model.step];
 if(modal==='job')return ['#practice-close-job','Your print job preview','This preview shows the sample item and barcode. Nothing will print during practice. Press Done to finish.'];
 if(modal==='receipt')return ['#practice-confirm-receive','Confirm what arrived','Check the sample item and quantity, then confirm receipt. The practice units will wait in holding.'];
 return tip;
}
addEventListener('pagehide',()=>{disposed=true;clearTimers();model=createPractice();modal=null;});
addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
addEventListener('storage',event=>{if(['inventoryos_token','inventoryos_user'].includes(event.key)&&(!gate.authenticated()||owner!==gate.owner()))location.replace('/login.html');});
remember();render();
