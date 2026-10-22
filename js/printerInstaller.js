(function(){'use strict';
// Build a self-contained setup script using only the backend's PUBLIC certificate.
// Downloads never contain a session token or a private signing key.
const card=document.getElementById('printingSettingsCard');if(!card)return;
const buttons=[...card.querySelectorAll('[data-printer-installer]')],status=document.getElementById('printerInstallerStatus');
let busy=false;
function serverCheckError(data,endpoint){
 const error=String(data?.error||'');let message,code;
 if(data?.billing_required||data?.upgrade_required){code='PLAN_ACCESS';message='The server is blocking direct printing for the selected workspace’s subscription. Check its plan or account override. A Retail subscription and an InventoryOS subscription are separate.';}
 else if(/could not connect|failed to fetch|networkerror/i.test(error)){code='CONNECTION';message='Could not connect to your InventoryOS backend. Check that the backend is running, then try again.';}
 else if(/origin.*not allowed/i.test(error)){code='ORIGIN';message='The backend is rejecting this website’s address. Its QZ_ALLOWED_ORIGINS setting needs to include https://app.inventoryos.co.uk.';}
 else if(/QZ_PRIVATE_KEY_PATH.*not configured/i.test(error)){code='KEY_SETTING';message='The backend is missing QZ_PRIVATE_KEY_PATH in its .env file. Restore the path to your existing private signing key, then restart the backend.';}
 else if(/QZ_CERTIFICATE_PATH.*not configured/i.test(error)){code='CERTIFICATE_SETTING';message='The backend is missing QZ_CERTIFICATE_PATH in its .env file. Restore the path to your existing public printing certificate, then restart the backend.';}
 else if(/ENOENT|no such file|cannot find.*file/i.test(error)){code='FILE_MISSING';message='The backend cannot find a configured QZ key or certificate file. Check that both files still exist at the paths in .env, then restart the backend.';}
 else if(/EACCES|EPERM|permission denied/i.test(error)){code='FILE_PERMISSION';message='The Windows account running your backend cannot read a QZ signing file. Check its file permissions, then restart the backend.';}
 else if(/does not match|key.*mismatch/i.test(error)){code='KEY_MISMATCH';message='The backend’s QZ private key and public certificate do not match. Restore the matching pair, then restart the backend.';}
 else if(/not.*PEM|configured.*certificate|configured.*private key|DECODER|bad.*(key|certificate)/i.test(error)){code='INVALID_SIGNING_FILE';message='A configured QZ signing file is not a valid PEM key or certificate. Check the existing signing files on the backend.';}
 else if(/invalid server response|cannot (get|post)|not found/i.test(error)){code='ROUTE_RESPONSE';message='The backend did not return the expected printing API response. Check that qzSigningRoutes.js is mounted at /qz in server.js.';}
 else if(/unauthori|token|log.?in|sign.?in|authenticat/i.test(error)){code='SIGN_IN';message='Your printing request could not be authenticated. Sign out and sign back in, then try again.';}
 else if(/billing status/i.test(error)){code='BILLING_CHECK';message='The backend could not check this workspace’s billing access. Check the backend console for the billing error.';}
 else {code='SERVER_CHECK';message='The backend could not complete its printing check. Check the backend console when you try setup, or run the printing diagnostic below.';}
 // Deliberately exclude raw server errors: they can contain local paths or account details.
 return Error(message+' [Printing check: '+endpoint+' / '+code+']');
}
async function publicCertificate(signal){
 const stamp=Date.now();
 const [state,result]=await Promise.all([InventoryAPI.request('/qz/status?_t='+stamp,{signal}),InventoryAPI.request('/qz/certificate?_t='+stamp,{signal})]);
 if(!result?.success)throw serverCheckError(result,'certificate');
 if(!state?.success||state.configured===false)throw serverCheckError(state,'status');
 if(!state.certificate)throw Error('The backend returned incomplete printing certificate details. Check its qzSigningRoutes.js version. [Printing check: status / CERTIFICATE_DETAILS]');
 const pem=String(result.certificate||'');
 if(pem.length>100000||/PRIVATE KEY/.test(pem))throw Error('The server returned an invalid public certificate. Setup was not downloaded.');
 const match=pem.match(/-----BEGIN CERTIFICATE-----\s*([A-Za-z0-9+/=\s]+)-----END CERTIFICATE-----/);
 if(!match)throw Error('The server returned an invalid public certificate. Setup was not downloaded.');
 const base64=match[1].replace(/\s/g,''),der=Uint8Array.from(atob(base64),x=>x.charCodeAt(0));
 const fingerprint=[...new Uint8Array(await crypto.subtle.digest('SHA-256',der))].map(x=>x.toString(16).padStart(2,'0')).join('');
 const expected=String(state.certificate?.fingerprint_sha256||'').replace(/:/g,'').toLowerCase();
 if(!/^[a-f0-9]{64}$/.test(expected)||fingerprint!==expected)throw Error('The server certificate changed during setup. Please try downloading again.');
 const from=Date.parse(state.certificate.valid_from),to=Date.parse(state.certificate.valid_to),now=Date.now();
 if(!Number.isFinite(from)||!Number.isFinite(to)||now<from||now>=to)throw Error('The printing certificate is expired or not yet valid. Contact hello@inventoryos.co.uk.');
 return {pem:'-----BEGIN CERTIFICATE-----\n'+base64.match(/.{1,64}/g).join('\n')+'\n-----END CERTIFICATE-----\n',fingerprint};
}
async function template(name,signal){
 const response=await fetch('printing/setup/'+name+'?v=1',{cache:'no-store',credentials:'omit',signal});
 if(!response.ok)throw Error('The setup file could not be downloaded. Please try again.');
 const content=await response.text();if(!content.includes('__CERT_SHA256__'))throw Error('The setup file is unavailable. Please refresh this page.');return content;
}
function windowsLauncher(script,pem){
 // The small launcher extracts its embedded payload to a temporary folder, runs it,
 // and removes that folder. The customer does not have to extract a ZIP or edit files.
 const bootstrap="$ErrorActionPreference='Stop';$directory=$null;try{$text=[IO.File]::ReadAllText($env:INVENTORYOS_SETUP_FILE);$payload=($text -split ':INVENTORYOS_PAYLOAD\\r?\\n',2)[1]|ConvertFrom-Json;$directory=Join-Path ([IO.Path]::GetTempPath()) ('inventoryos-printing-'+[Guid]::NewGuid().ToString('N'));[IO.Directory]::CreateDirectory($directory)|Out-Null;$script=Join-Path $directory 'install-windows.ps1';[IO.File]::WriteAllText($script,$payload.script);[IO.File]::WriteAllText((Join-Path $directory 'inventoryos-public.crt'),$payload.certificate);& $script}catch{Write-Host ('Setup stopped: '+$_.Exception.Message);exit 1}finally{if($directory){Remove-Item -LiteralPath $directory -Recurse -Force -ErrorAction SilentlyContinue}}";
 return '@echo off\r\nsetlocal\r\ntitle InventoryOS printer setup\r\nset "INVENTORYOS_SETUP_FILE=%~f0"\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -Command "'+bootstrap+'"\r\nif errorlevel 1 (\r\n  pause\r\n  exit /b 1\r\n)\r\nexit /b 0\r\n:INVENTORYOS_PAYLOAD\r\n'+JSON.stringify({script,certificate:pem})+'\r\n';
}
function macZip(command){
 const name=new TextEncoder().encode('InventoryOS-Printer-Setup.command'),data=new TextEncoder().encode(command);
 let crc=0xffffffff;for(const byte of data){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}crc=(crc^0xffffffff)>>>0;
 const local=new Uint8Array(30+name.length),central=new Uint8Array(46+name.length),end=new Uint8Array(22);
 const l=new DataView(local.buffer),c=new DataView(central.buffer),e=new DataView(end.buffer);
 const now=new Date(),date=((Math.max(1980,now.getFullYear())-1980)<<9)|((now.getMonth()+1)<<5)|now.getDate(),time=(now.getHours()<<11)|(now.getMinutes()<<5)|(now.getSeconds()>>1);
 l.setUint32(0,0x04034b50,true);l.setUint16(4,20,true);l.setUint16(10,time,true);l.setUint16(12,date,true);l.setUint32(14,crc,true);l.setUint32(18,data.length,true);l.setUint32(22,data.length,true);l.setUint16(26,name.length,true);local.set(name,30);
 c.setUint32(0,0x02014b50,true);c.setUint16(4,0x0314,true);c.setUint16(6,20,true);c.setUint16(12,time,true);c.setUint16(14,date,true);c.setUint32(16,crc,true);c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);c.setUint16(28,name.length,true);c.setUint32(38,0x81ed0000,true);central.set(name,46);
 e.setUint32(0,0x06054b50,true);e.setUint16(8,1,true);e.setUint16(10,1,true);e.setUint32(12,central.length,true);e.setUint32(16,local.length+data.length,true);
 return new Blob([local,data,central,end],{type:'application/zip'});
}
async function download(platform){
 if(busy)return;busy=true;buttons.forEach(x=>x.disabled=true);status.setAttribute('role','status');status.textContent='Preparing setup and checking the printing certificate…';
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),30000);
 try{
  const [cert,source]=await Promise.all([publicCertificate(controller.signal),template(platform==='windows'?'install-windows.ps1':'install-mac.command',controller.signal)]);
  let output=source.replaceAll('__CERT_SHA256__',cert.fingerprint);
  if(platform==='windows')output=windowsLauncher(output,cert.pem);else output=output.replace('__CERT_PEM__',cert.pem.trim());
  const blob=platform==='mac'?macZip(output):new Blob([output],{type:'application/octet-stream'}),url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=platform==='windows'?'InventoryOS-Printer-Setup.cmd':'InventoryOS-Printer-Setup-Mac.zip';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  status.textContent=platform==='windows'?'Downloaded. Open InventoryOS-Printer-Setup.cmd, approve the Windows prompt, then select your printer on the page that opens.':'Downloaded. Open the ZIP, then open InventoryOS-Printer-Setup.command inside. If macOS asks, approve it in Privacy & Security, then run it again. Enter your Mac password when asked; select your printer on the page that opens.';
 }catch(error){status.setAttribute('role','alert');status.textContent=error.name==='AbortError'?'The server took too long to respond. Check your connection and try again.':error.message||'Setup could not be downloaded. Please try again.';}
 finally{clearTimeout(timeout);busy=false;buttons.forEach(x=>x.disabled=false);}
}
buttons.forEach(button=>button.addEventListener('click',()=>download(button.dataset.printerInstaller)));
})();
