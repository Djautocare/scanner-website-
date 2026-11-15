'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
function prepare(source,expected){
 if(createHash('sha256').update(source).digest('hex')!==expected)
  throw new Error('The reorder route differs from the reviewed backend. Review the mount manually.');
 const anchor='router.use(workspaceMiddleware);';
 const text=source.toString('utf8');
 if(text.split(anchor).length!==2)throw new Error('Cannot identify the authenticated mount point.');
 return text.replace(anchor,anchor+"\nrouter.use('/purchase-orders', require('../utils/supplierPurchasing').routes(pool));");
}
if(require.main===module){
 try{
  const root=process.argv[2];
  if(!root)throw new Error('Pass the backend directory as the first argument.');
  const checksum=fs.readFileSync(path.join(__dirname,'expected-reorder-route.sha256'),'utf8').trim();
  process.stdout.write(prepare(fs.readFileSync(path.join(root,'routes/reorder.js')),checksum));
 }catch(err){console.error(err.message);process.exitCode=1;}
}
module.exports={prepare};
