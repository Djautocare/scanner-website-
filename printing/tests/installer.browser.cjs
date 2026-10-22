'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),os=require('node:os'),{execFileSync}=require('node:child_process'),{X509Certificate}=require('node:crypto');
const {chromium}=require(process.env.RETAIL_BROWSER_MODULES),root=path.resolve(__dirname,'../..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'inventoryos-printer-test-'));
(async()=>{
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-keyout',path.join(temp,'TEST-ONLY-PRIVATE.pem'),'-out',path.join(temp,'public.crt'),'-days','2','-nodes','-subj','/CN=InventoryOS Installer Test/O=TEST ONLY'],{stdio:'ignore'});
 const pem=fs.readFileSync(path.join(temp,'public.crt'),'utf8'),cert=new X509Certificate(pem),fingerprint=cert.fingerprint256.replaceAll(':','').toLowerCase();let mode='valid',requests=0;
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/test.html'){res.setHeader('Content-Type','text/html');return res.end('<!doctype html><div id="printingSettingsCard"><button data-printer-installer="windows">Windows</button><button data-printer-installer="mac">Mac</button><p id="printerInstallerStatus"></p></div><script>const InventoryAPI={request:async(p,o)=>{const response=await fetch(p,o);return response.json()},getToken:()=>"NEVER-SERIALISE-TEST-SESSION"};</script><script src="/js/printerInstaller.js"></script>');}
  if(url.pathname.startsWith('/qz/')){
   requests++;res.setHeader('Content-Type','application/json');
   const errors={unconfigured:'QZ_CERTIFICATE_PATH is not configured in .env',keySetting:'QZ_PRIVATE_KEY_PATH is not configured in .env',connection:'Could not connect to InventoryOS',origin:'Origin is not allowed to use QZ signing',missingFile:'ENOENT: no such file, C:/Users/PRIVATE-NAME/private-signing-key.pem',badKey:'QZ private key does not match the QZ certificate',route:'Invalid server response',unknown:'INTERNAL-DETAIL-C:/Users/PRIVATE-NAME/secret',invalidSigningFile:'The configured QZ private key is not a PEM private key'};
   if(errors[mode])return res.end(JSON.stringify({success:false,error:errors[mode]}));
   if(mode==='plan')return res.end(JSON.stringify({success:false,billing_required:true,error:'Upgrade to Pro'}));
   if(url.pathname==='/qz/certificate')return res.end(JSON.stringify({success:true,certificate:mode==='private'?pem+'-----BEGIN PRIVATE KEY-----\nFORBIDDEN\n-----END PRIVATE KEY-----':pem}));
   return res.end(JSON.stringify({success:true,...(mode==='legacy'?{}:{configured:true}),certificate:{fingerprint_sha256:mode==='mismatch'?'00'.repeat(32):cert.fingerprint256,valid_from:cert.validFrom,valid_to:mode==='expired'?'2000-01-01T00:00:00Z':cert.validTo}}));
  }
  if(mode==='missing-template'&&url.pathname.startsWith('/printing/setup/')){res.statusCode=404;return res.end();}
  try{const p=path.resolve(root,'.'+url.pathname);if(!p.startsWith(root+'/'))throw Error('path');res.setHeader('Content-Type',url.pathname.endsWith('.js')?'text/javascript':'text/plain');res.end(fs.readFileSync(p));}catch{res.statusCode=404;res.end();}
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:process.env.RETAIL_CHROMIUM_EXECUTABLE,args:JSON.parse(process.env.RETAIL_CHROMIUM_ARGS||'[]')});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port+'/test.html');
  const win=page.getByRole('button',{name:'Windows',exact:true}),mac=page.getByRole('button',{name:'Mac',exact:true}),status=page.locator('#printerInstallerStatus');
  let event=page.waitForEvent('download');await win.click();let download=await event;assert.equal(download.suggestedFilename(),'InventoryOS-Printer-Setup.cmd');let command=fs.readFileSync(await download.path(),'utf8');
  const payload=JSON.parse(command.split('\r\n:INVENTORYOS_PAYLOAD\r\n')[1]);assert.equal(new X509Certificate(payload.certificate).fingerprint256,cert.fingerprint256);assert(payload.script.includes(fingerprint));assert(!command.includes('__CERT_'));assert(!command.includes('NEVER-SERIALISE-TEST-SESSION'));assert(!command.includes('BEGIN PRIVATE KEY'));assert(payload.script.includes('-Verb RunAs'));assert(payload.script.includes('Get-AuthenticodeSignature'));assert(payload.script.includes('Get-FileHash'));assert(payload.script.includes('7a44a50f679f0a1dab6679e6c22158dd335511074f5fcc1b208b6f9caf711ba7'));assert(payload.script.includes('10e308b91d84b637520eb36096cb6814b33a66f3cabc317ce776253e759babc8'));
  fs.writeFileSync(path.join(temp,'generated.ps1'),payload.script);fs.writeFileSync(path.join(temp,'launcher.cmd'),command);
  // Validate native PowerShell syntax/helpers when a parser runtime is available.
  if(process.env.INVENTORYOS_TEST_PWSH)execFileSync(process.env.INVENTORYOS_TEST_PWSH,['-NoProfile','-File',path.join(__dirname,'parse-windows.ps1'),'-SetupPath',path.join(temp,'generated.ps1'),'-LauncherPath',path.join(temp,'launcher.cmd')],{stdio:'inherit'});
  assert.match(await status.innerText(),/Downloaded/);assert.equal(requests,2);
  event=page.waitForEvent('download');await mac.click();download=await event;assert.equal(download.suggestedFilename(),'InventoryOS-Printer-Setup-Mac.zip');const zip=await download.path();
  execFileSync('python3',['-c',`import sys,zipfile,stat\nz=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; assert z.namelist()==['InventoryOS-Printer-Setup.command']; i=z.infolist()[0]; assert stat.S_IMODE(i.external_attr>>16)==0o755; open(sys.argv[2],'wb').write(z.read(i))`,zip,path.join(temp,'generated.command')]);
  const shell=fs.readFileSync(path.join(temp,'generated.command'),'utf8');assert(shell.includes(fingerprint));assert(shell.includes(pem.trim()));assert(!shell.includes('__CERT_'));assert(!shell.includes('PRIVATE KEY-----'));assert(!shell.includes('NEVER-SERIALISE-TEST-SESSION'));execFileSync('bash',['-n',path.join(temp,'generated.command')]);
  // Exercise the actual awk parser with existing roots, aliases and Java continuations.
  const awk=shell.split("existing=$(/usr/bin/awk '\n")[1].split("' \"$temp_dir/clean.properties\")")[0];assert(awk);
  for(const [content,expected]of [['authcert.override=/first.crt;/second.crt\n','/first.crt;/second.crt'],['trustedRootCert=/alias.crt\n','/alias.crt'],['authcert.override=/first.crt;\\\n  /second.crt\n','/first.crt;/second.crt'],['authcert.override=/primary.crt\ntrustedRootCert=/alias.crt\n','/primary.crt'],['# authcert.override=/ignore\nauthcert.override=/old\nauthcert.override=/new\n','/new']]){fs.writeFileSync(path.join(temp,'props'),content);assert.equal(execFileSync('awk',[awk,path.join(temp,'props')],{encoding:'utf8'}),expected);}
  // Older successful status replies may omit configured; valid certificate checks still apply.
  mode='legacy';event=page.waitForEvent('download');await win.click();await event;assert.match(await status.innerText(),/Downloaded/);
  let downloads=0;page.on('download',()=>downloads++);
  for(const [failure,message]of [['expired',/expired/],['mismatch',/changed during setup/],['private',/invalid public certificate/],['unconfigured',/missing QZ_CERTIFICATE_PATH/],['keySetting',/missing QZ_PRIVATE_KEY_PATH/],['connection',/Could not connect/],['origin',/rejecting this website/],['plan',/subscription/],['missingFile',/cannot find a configured/],['badKey',/do not match/],['route',/expected printing API response/],['invalidSigningFile',/valid PEM/],['unknown',/could not complete its printing check/],['missing-template',/could not be downloaded/]]){
   mode=failure;await win.click();await page.waitForFunction(()=>document.getElementById('printerInstallerStatus').getAttribute('role')==='alert');assert.match(await status.innerText(),message);assert(!/PRIVATE-NAME|INTERNAL-DETAIL|secret|private-signing-key.pem/.test(await status.innerText()));assert.equal(await win.isDisabled(),false);assert.equal(await mac.isDisabled(),false);
  }
  assert.equal(downloads,0);assert.deepEqual(errors,[]);
  console.log('PASS printer setup: self-contained Windows download, Mac executable ZIP, public certificate only, certificate matching/expiry checks, legacy status support, distinct server/connection/plan errors without private paths, failure recovery, official pinned installers and existing QZ trust parsing.');
 }finally{await browser.close();await new Promise(r=>server.close(r));fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);fs.rmSync(temp,{recursive:true,force:true});process.exit(1);});
