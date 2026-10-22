(function(){'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const drafts=new Map(),states={new:'New',ongoing:'Ongoing',completed:'Help completed'};
function mount(root,{request,scope,selection}){
 const key=scope();if(!drafts.has(key))drafts.set(key,{topic:'',message:'',pending:false,id:null,fingerprint:'',notice:'',flight:null});const draft=drafts.get(key);
 let context=null,generation=0;
 const alive=()=>root.isConnected&&scope()===key;
 root.innerHTML=`<div class="help-layout"><section class="help-panel"><h2>Send a help request</h2><p class="help-copy">Tell us what you need a hand with. We’ll reply to your account email.</p><div class="help-context"><strong>Account:</strong> <span data-help-account>Loading…</span><br><strong>Retail business:</strong> <span data-help-workspace>Loading…</span><br><strong>Shop:</strong> <span data-help-shop>Loading…</span></div><form class="help-form"><label class="help-label" for="retailHelpTopic">Topic</label><input id="retailHelpTopic" required maxlength="120" placeholder="For example, receipt printing" value="${esc(draft.topic)}"><label class="help-label" for="retailHelpMessage">What do you need help with?</label><textarea id="retailHelpMessage" required maxlength="5000" aria-describedby="retailHelpCharacters" placeholder="What happened, and what were you trying to do?">${esc(draft.message)}</textarea><div id="retailHelpCharacters" class="help-counter">${draft.message.length.toLocaleString('en-GB')} / 5,000</div><p class="help-copy">Please leave out passwords, PINs, card details and API keys.</p><button class="help-button primary" type="submit" disabled>Send help request</button><p class="help-status" data-help-status role="status" aria-live="polite"></p></form></section><section class="help-panel"><h2>Your recent requests</h2><p class="help-copy">Requests from your account in this Retail business, with their current progress.</p><div class="help-actions"><button type="button" class="help-button" data-help-refresh>Refresh requests</button></div><div class="help-list" data-help-history></div></section></div>`;
 const topic=root.querySelector('#retailHelpTopic'),message=root.querySelector('#retailHelpMessage'),send=root.querySelector('[type=submit]'),status=root.querySelector('[data-help-status]');
 const note=t=>{if(alive())status.textContent=t;};
 const controls=()=>{if(alive()){send.disabled=!context||draft.pending;topic.disabled=draft.pending;message.disabled=draft.pending;}};
 function history(rows){root.querySelector('[data-help-history]').innerHTML=rows.map(r=>'<details class="help-request"><summary><span class="help-state">'+esc(states[r.status]||r.status)+'</span>'+esc(r.topic)+'</summary><div class="help-meta">'+esc(new Date(r.created_at).toLocaleString('en-GB'))+' · '+esc(r.workspace_name)+' · #'+esc(r.id.slice(0,8).toUpperCase())+'</div><div class="help-message">'+esc(r.message)+'</div></details>').join('')||'<p class="help-copy">No help requests from your account in this Retail business yet.</p>';}
 async function load(){
  const g=++generation;context=null;controls();
  try{const r=await request('/help');if(!alive()||g!==generation)return;
   if(!r.workspace?.id||!r.shop?.id)throw Error('Help is unavailable. Install the Retail Help backend update and refresh.');
   if(selection&&(selection().workspace!==r.workspace.id||selection().inventory!==r.shop.id))throw Error('Shop changed. Reopen Help before sending.');
   context=r;root.querySelector('[data-help-account]').textContent=r.account_email;root.querySelector('[data-help-workspace]').textContent=r.workspace.name;root.querySelector('[data-help-shop]').textContent=r.shop.name;history(r.requests||[]);
  }catch(error){if(alive()&&g===generation)note(error.status===404?'Install the Retail Help backend update, restart the backend and refresh.':error.message);}
  finally{if(g===generation)controls();}
 }
 root.addEventListener('input',()=>{draft.topic=topic.value;draft.message=message.value;root.querySelector('#retailHelpCharacters').textContent=message.value.length.toLocaleString('en-GB')+' / 5,000';});
 root.querySelector('[data-help-refresh]').onclick=async e=>{e.target.disabled=true;try{await load();}finally{if(e.target.isConnected)e.target.disabled=false;}};
 root.querySelector('form').onsubmit=async e=>{
  e.preventDefault();if(!alive()||!context||draft.pending)return;
  const t=topic.value.trim(),m=message.value.trim();if(!t||t.length>120||!m||m.length>5000)return note('Enter a topic and message of up to 5,000 characters.');
  const fingerprint=JSON.stringify([key,t,m]);if(draft.fingerprint!==fingerprint){draft.fingerprint=fingerprint;draft.id=crypto.randomUUID();}
  draft.pending=true;controls();note('Sending your help request…');
  try{
   draft.flight=request('/help',{method:'POST',body:JSON.stringify({topic:t,message:m,client_request_id:draft.id})});const r=await draft.flight;
   draft.topic='';draft.message='';draft.id=null;draft.fingerprint='';
   draft.notice='Request #'+r.request.id.slice(0,8).toUpperCase()+' sent. We’ll reply to your account email.';
   if(!alive())return;topic.value='';message.value='';root.querySelector('#retailHelpCharacters').textContent='0 / 5,000';await load();note(draft.notice);
  }catch(error){draft.notice=error.message+' Your message is still here; you can try again.';note(draft.notice);}
  finally{draft.pending=false;draft.flight=null;controls();}
 };
 const restore=()=>setTimeout(()=>{if(!alive())return;topic.value=draft.topic;message.value=draft.message;root.querySelector('#retailHelpCharacters').textContent=draft.message.length.toLocaleString('en-GB')+' / 5,000';note(draft.notice);load();},0);
 if(draft.pending&&draft.flight)draft.flight.then(restore,restore);
 controls();note(draft.notice);load();
}
window.InventoryRetailHelp={mount};
})();
