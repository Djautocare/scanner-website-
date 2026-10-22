'use strict';
// Read-only local diagnostic. Never prints environment values, paths, or keys.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=process.cwd();let failed=false;
function result(ok,message){console.log((ok?'PASS: ':'FAIL: ')+message);if(!ok)failed=true;}
function readFile(setting,label){
 const value=String(process.env[setting]||'').trim();
 result(!!value,setting+(value?' is set.':' is missing from .env.'));if(!value)return null;
 try{const file=path.isAbsolute(value)?value:path.resolve(root,value);return fs.readFileSync(file,'utf8');}
 catch(e){result(false,label+(e.code==='ENOENT'?' file cannot be found.':e.code==='EACCES'||e.code==='EPERM'?' file cannot be read by this Windows account.':' file could not be read.'));return null;}
}
function main(){
 try{
  // Keep dotenv startup logs out of diagnostic output on newer dotenv versions.
  const log=console.log;try{console.log=()=>{};require(require.resolve('dotenv',{paths:[root]})).config({path:path.join(root,'.env'),quiet:true});}finally{console.log=log;}
 }catch{result(false,'Run this file from your backend folder, where dotenv is installed.');return;}
 const privatePem=readFile('QZ_PRIVATE_KEY_PATH','Private signing key'),publicPem=readFile('QZ_CERTIFICATE_PATH','Public printing certificate');
 let key,certificate;
 if(privatePem){try{key=crypto.createPrivateKey(privatePem);result(true,'Private signing key is readable and valid.');}catch{result(false,'Private signing key could not be decoded. Use the existing unencrypted PEM signing key.');}}
 if(publicPem){try{certificate=new crypto.X509Certificate(publicPem);result(true,'Public printing certificate is readable and valid.');}catch{result(false,'Public printing certificate could not be decoded.');}}
 if(certificate){const now=Date.now();result(now>=Date.parse(certificate.validFrom)&&now<Date.parse(certificate.validTo),'Printing certificate is currently within its validity dates.');}
 if(key&&certificate){
  const message=crypto.randomBytes(32);
  try{result(crypto.verify('RSA-SHA512',message,certificate.publicKey,crypto.sign('RSA-SHA512',message,key)),'Private key matches the public certificate and can sign printing requests.');}
  catch{result(false,'Private key and certificate could not complete a printing signature check.');}
 }
 const origins=String(process.env.QZ_ALLOWED_ORIGINS||process.env.QZ_ALLOWED_ORIGIN||'https://app.inventoryos.co.uk').split(',').map(x=>x.trim());
 result(origins.includes('https://app.inventoryos.co.uk'),'QZ allowed origins include the InventoryOS app.');
 try{const server=fs.readFileSync(path.join(root,'server.js'),'utf8');result(/app\.use\(\s*['"]\/qz['"]/.test(server),'server.js includes a /qz route mount.');if(/app\.use\(\s*['"]\/qz['"]\s*,\s*proAccess/.test(server))console.log('NOTE: /qz is gated by the reseller Pro plan. A separate Retail subscription does not satisfy that gate.');}
 catch{result(false,'server.js could not be checked. Run from your backend folder.');}
 console.log('No signing files, database records or settings were changed.');
}
main();if(failed)process.exitCode=1;
