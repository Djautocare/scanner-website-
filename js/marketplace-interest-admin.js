'use strict';
(()=>{
 if(!document.getElementById('mi-filters'))return;
 const $=id=>document.getElementById(id),labels={buyer:'Buyer','private-seller':'Private seller',reseller:'Reseller',business:'Business',unsure:'Just curious'};
 let page=1,pages=1,busy=false,loaded=false;const status=$('mi-status');
 function controls(value){for(const id of ['mi-refresh','mi-export'])$(id).disabled=value;$('mi-prev').disabled=value||page<=1;$('mi-next').disabled=value||page>=pages;document.querySelector('#mi-filters button[type=submit]').disabled=value}
 function textCell(row,text){const cell=document.createElement('td');cell.textContent=text;row.append(cell);return cell}
 function date(value){return value?new Date(value).toLocaleString('en-GB'):'—'}
 async function request(path,options){const data=await InventoryAPI.request('/admin/marketplace-interest'+path,options);if(data.success!==true)throw Error(data.error||'Could not load the launch-interest list.');return data}
 async function load(){
  if(busy)return;busy=true;controls(true);status.textContent='Loading launch interest…';
  try{
   const query=new URLSearchParams({page:String(page),scope:$('mi-scope').value,audience:$('mi-audience').value,search:$('mi-search').value.trim()}),data=await request('?'+query);
   pages=data.pages;page=data.page;loaded=true;
   for(const key of ['active','withdrawn','total'])$('mi-'+key).textContent=String(data.counts[key]);
   $('mi-rows').replaceChildren();for(const item of data.rows){
    const row=document.createElement('tr');textCell(row,item.email);textCell(row,labels[item.audience]||'Unknown');textCell(row,date(item.created_at));textCell(row,date(item.consented_at));const actions=textCell(row,item.withdrawn_at?'Withdrawn '+date(item.withdrawn_at):'');
    if(!item.withdrawn_at){const button=document.createElement('button');button.className='mi-button';button.textContent='Withdraw';button.addEventListener('click',()=>withdraw(item.id,item.email));actions.append(button)}$('mi-rows').append(row);
   }
   $('mi-page').textContent='Page '+page+' of '+pages;status.textContent=data.total?data.total+' matching '+(data.total===1?'entry':'entries')+'.':'No matching entries yet.';
  }catch(error){loaded=false;$('mi-rows').replaceChildren();for(const key of ['active','withdrawn','total'])$('mi-'+key).textContent='—';status.textContent=error.message+' If the backend update has not been installed, install it and restart the backend first.';}
  finally{busy=false;controls(false);$('mi-export').disabled=!loaded}
 }
 async function withdraw(id,email){
  if(busy||!confirm('Withdraw '+email+' from Mi Marché launch emails? They will be excluded from future exports.'))return;
  busy=true;controls(true);try{await request('/'+encodeURIComponent(id)+'/withdraw',{method:'PATCH',body:'{}'});busy=false;await load()}catch(error){status.textContent=error.message}finally{busy=false;controls(false)}
 }
 function csvCell(value){let text=String(value??'');if(/^[=+@\-\t\r]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"'}
 async function exportCSV(){
  if(busy||!loaded)return;busy=true;controls(true);status.textContent='Preparing active-email export…';
  try{const data=await request('/export'),rows=[['Email','Interested as','Consent version','Consented at'],...data.rows.map(x=>[x.email,labels[x.audience]||x.audience,x.consent_version,x.consented_at])],csv='\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download='MiMarche-active-launch-interest-'+new Date().toISOString().slice(0,10)+'.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent='Exported '+data.rows.length+' active '+(data.rows.length===1?'entry':'entries')+'. No emails were sent.'}catch(error){status.textContent=error.message}finally{busy=false;controls(false)}
 }
 $('mi-filters').addEventListener('submit',event=>{event.preventDefault();if(busy)return;page=1;load()});$('mi-refresh').addEventListener('click',load);$('mi-export').addEventListener('click',exportCSV);$('mi-prev').addEventListener('click',()=>{if(!busy&&page>1){page--;load()}});$('mi-next').addEventListener('click',()=>{if(!busy&&page<pages){page++;load()}});window.InventoryMarketplaceAdmin={load};if(!document.getElementById('adminApp'))load();
})();

