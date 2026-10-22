'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync,execFileSync}=require('node:child_process');
const script=path.resolve(__dirname,'../check-printing.cjs');
test('local diagnostic reads existing signing material without exposing paths or credentials or changing files',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'PRIVATE-ACCOUNT-printing-'));
 try{
  // Environment is supplied directly. This stub isolates the diagnostic from dotenv loading.
  fs.mkdirSync(path.join(root,'node_modules/dotenv'),{recursive:true});fs.writeFileSync(path.join(root,'node_modules/dotenv/index.js'),'exports.config=()=>({});');
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-keyout',path.join(root,'key.pem'),'-out',path.join(root,'public.crt'),'-days','2','-nodes','-subj','/CN=TEST ONLY'],{stdio:'ignore'});
  fs.writeFileSync(path.join(root,'server.js'),'app.use("/qz", proAccess, qzSigningRoutes);');
  const original=fs.readFileSync(path.join(root,'key.pem'),'utf8'),publicPem=fs.readFileSync(path.join(root,'public.crt'),'utf8');
  const env={...process.env,QZ_PRIVATE_KEY_PATH:'key.pem',QZ_CERTIFICATE_PATH:'public.crt',QZ_ALLOWED_ORIGINS:'https://app.inventoryos.co.uk'};
  const run=changes=>spawnSync(process.execPath,[script],{cwd:root,env:{...env,...changes},encoding:'utf8'});
  let result=run({});assert.equal(result.status,0,result.stderr+result.stdout);assert.match(result.stdout,/Private key matches/);assert.match(result.stdout,/gated by the reseller Pro plan/);assert(!result.stdout.includes(root));assert(!result.stdout.includes(original));assert(!result.stdout.includes(publicPem));
  result=run({QZ_CERTIFICATE_PATH:''});assert.equal(result.status,1);assert.match(result.stdout,/QZ_CERTIFICATE_PATH is missing/);
  result=run({QZ_PRIVATE_KEY_PATH:'SECRET-NAME/missing.key'});assert.equal(result.status,1);assert.match(result.stdout,/cannot be found/);assert(!result.stdout.includes('SECRET-NAME'));
  result=run({QZ_ALLOWED_ORIGINS:'https://wrong.invalid'});assert.equal(result.status,1);assert.match(result.stdout,/FAIL: QZ allowed origins/);assert(!result.stdout.includes('wrong.invalid'));
  const different=crypto.generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}}).privateKey;
  fs.writeFileSync(path.join(root,'different.pem'),different);result=run({QZ_PRIVATE_KEY_PATH:'different.pem'});assert.equal(result.status,1);assert.match(result.stdout,/FAIL: Private key matches/);assert(!result.stdout.includes(different));
  assert.equal(fs.readFileSync(path.join(root,'key.pem'),'utf8'),original);assert.equal(fs.readFileSync(path.join(root,'public.crt'),'utf8'),publicPem);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
