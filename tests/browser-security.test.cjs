'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
function files(dir=root){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?(['backend-updates','tests','vendor'].includes(e.name)?[]:files(path.join(dir,e.name))):[path.join(dir,e.name)]);}
test('all application pages use external executable scripts and no inline event attributes',()=>{
 for(const file of files().filter(f=>f.endsWith('.html'))){const text=fs.readFileSync(file,'utf8');assert(text.includes('/js/security-events.js?v=1'),file);assert(!/\bon(?:click|change|input)\s*=/.test(text),file);for(const m of text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)){if(/type=["']application\/(?:ld\+)?json/.test(m[1]))continue;assert(/\bsrc=/.test(m[1])||!m[2].trim(),file+' inline script');}}
});
test('CSP blocks executable inline code, framing and object plugins while retaining camera/printing connections',()=>{
 const text=fs.readFileSync(path.join(root,'_headers'),'utf8');const policy=text.match(/Content-Security-Policy: ([^\n]+)/)[1];assert(policy.includes("script-src-attr 'none'"));assert(!policy.split(';').find(x=>x.trim().startsWith('script-src ')).includes('unsafe-inline'));assert(!policy.includes('unsafe-eval'));assert(policy.includes("object-src 'none'"));assert(policy.includes("frame-ancestors 'self'"));assert(policy.includes('https://api.inventoryos.co.uk'));assert(policy.includes('wss://localhost:*'));assert(text.includes('camera=(self), microphone=(self)'));for(const line of text.split('\n'))assert(line.length<=2000,'Cloudflare header size limit');
});
test('compiled legacy events preserve this, arguments, bubbling and cancellation without evaluating data',()=>{
 const listeners={},calls=[];class Element{constructor(attrs={}){this.attrs=attrs;}getAttribute(k){return this.attrs[k]??null;}}
 const context={Element,Object,JSON,window:null,document:{addEventListener:(type,fn)=>listeners[type]=fn},console};context.window=context;context.showSection=(...args)=>calls.push(args);context.togglePassword=(...args)=>calls.push(args);context.InventoryAPI={logout:()=>calls.push('logout')};vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(root,'js/security-events.js'),'utf8'),context);
 const html=fs.readFileSync(path.join(root,'login.html'),'utf8'),key=html.match(/data-ios-click="([^"]+)"[^>]*>Show<\/button>/)?.[1];assert(key,'Show password action');const node=new Element({'data-ios-click':key});listeners.click({composedPath:()=>[node],preventDefault(){},cancelBubble:false});assert.equal(calls[0][0],'loginPassword');assert.equal(calls[0][1],node);
 const dynamic=fs.readFileSync(path.join(root,'js/pages/remove.1.js'),'utf8').match(/data-ios-input="([^"]+)"/)[1];context.changeBundleQuantity=(...args)=>calls.push(args);const input=new Element({'data-ios-input':dynamic,'data-ios-input-args':'[2]'});input.value='6';listeners.input({composedPath:()=>[input],preventDefault(){},cancelBubble:false});assert.deepEqual(calls[1],[2,'6']);
 const count=calls.length;node.onclick=()=>{};listeners.click({composedPath:()=>[node],preventDefault(){},cancelBubble:false});assert.equal(calls.length,count,'script-assigned handlers must not execute a second compiled action');
 const injection='\" onerror=\"globalThis.stolen=1';const encoded=context.InventoryEvents.encode([injection]);assert(encoded.includes('&quot;'));assert(!encoded.includes('<'));assert.equal(context.stolen,undefined);
});
test('all generated page scripts parse and offline shell retains its security event dependency',()=>{
 for(const file of files().filter(f=>f.endsWith('.js')&&f.includes(path.sep+'pages'+path.sep)))new vm.Script(fs.readFileSync(file,'utf8'),{filename:file});for(const name of ['retail/sw.js','retail/till/sw.js'])assert(fs.readFileSync(path.join(root,name),'utf8').includes('js/security-events.js?v=1'));assert(!fs.readFileSync(path.join(root,'js/pages/dispatch-centre.1.js'),'utf8').includes('<script>window.print()'));
});
