(function(){
'use strict';
const {esc}=PlatformUI;
function banner(tiles,url,editable=false){
 return '<div class="ms-banner'+(tiles.length?'':' ms-empty')+'" style="--tiles:'+Math.max(1,tiles.length)+'">'+
 (tiles.length?tiles.map((t,i)=>'<div class="ms-tile" data-tile="'+i+'"><img draggable="false" alt="Shop banner image '+(i+1)+'" src="'+esc(url(t))+'" style="object-position:'+Number(t.x??50)+'% '+Number(t.y??50)+'%;transform:scale('+Number(t.zoom||1)+');transform-origin:'+Number(t.x??50)+'% '+Number(t.y??50)+'%">'+(editable?'<button type="button" class="ms-edit-tile" data-edit-tile="'+i+'" aria-label="Edit banner image '+(i+1)+'">Edit image '+(i+1)+'</button>':'')+'</div>').join(''):
 '<div class="ms-banner-placeholder"><span>YOUR SHOP, YOUR STORY</span><strong>A little space to make your own.</strong><p>Add a banner here. One image or a collection of your favourites.</p></div>')+'</div>';
}
function filters(labels,current=''){
 return '<nav class="ms-filters" aria-label="Shop categories"><div class="ms-filter-row">'+['',...labels].map(x=>'<button type="button" data-quick-filter="'+esc(x)+'" aria-pressed="'+(x===current)+'">'+esc(x||'All items')+'</button>').join('')+'</div><details class="ms-more" hidden><summary>More categories <span aria-hidden="true">⌄</span></summary><div class="ms-filter-menu"></div></details></nav>';
}
function bindFilters(root,change){
 const nav=root.querySelector('.ms-filters');if(!nav)return;
 const row=nav.querySelector('.ms-filter-row'),more=nav.querySelector('.ms-more'),menu=nav.querySelector('.ms-filter-menu');
 const buttons=[...row.children];
 const fit=()=>{
  if(!nav.isConnected){observer?.disconnect();return;}
  more.hidden=false;menu.replaceChildren();buttons.forEach(b=>b.hidden=false);
  let used=0,cut=buttons.length;
  const room=nav.clientWidth-more.offsetWidth-16;
  buttons.forEach((b,i)=>{used+=b.offsetWidth+8;if(used>room&&cut===buttons.length)cut=Math.max(1,i);});
  // Keep the complete row when it fits without an overflow control.
  if(used<=nav.clientWidth)cut=buttons.length;
  buttons.forEach((b,i)=>{b.hidden=i>=cut;if(b.hidden)menu.append(b.cloneNode(true));});
  menu.querySelectorAll('button').forEach(b=>b.hidden=false);more.hidden=cut===buttons.length;
 };
 nav.onclick=e=>{const b=e.target.closest('[data-quick-filter]');if(!b)return;more.open=false;change(b.dataset.quickFilter);};
 nav.onkeydown=e=>{if(e.key==='Escape'){more.open=false;more.querySelector('summary').focus();}};
 const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(fit);observer?.observe(nav);fit();
 return ()=>observer?.disconnect();
}
window.MarcheDisplay={banner,filters,bindFilters};
})();
