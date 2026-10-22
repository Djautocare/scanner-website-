'use strict';
// Surgical additions to the user's existing backend, never full replacements.
function once(source,anchor,replacement,label){if(source.split(anchor).length!==2)throw Error('Could not safely identify '+label+'. Nothing was installed.');return source.replace(anchor,replacement);}
module.exports=function patchPartition(read){
 const changes=[];
 for(const name of ['middleware/workspaceMiddleware.js','routes/workspaces.js','routes/auth.js']){
  const old=read(name),newline=old.includes('\r\n')?'\r\n':'\n';let source=old.replaceAll('\r\n','\n');
  if(name==='middleware/workspaceMiddleware.js'&&!source.includes('inventoryWorkspaceOnly')){
   source=once(source,'WHERE u.id = $1',"WHERE u.id = $1 AND COALESCE(to_jsonb(w)->>'workspace_kind','inventory')='inventory'",name+' workspace query');
   source+="\n// Retail workspaces are selected only through the separate Retail API.\nmodule.exports.workspaceMiddleware = require('./inventoryWorkspaceOnly').wrap(module.exports.workspaceMiddleware);\n";
  }
  if(name==='routes/workspaces.js'&&!source.includes('inventoryWorkspaceOnly')){
   source=once(source,'router.use(authMiddleware);',"router.use(authMiddleware);\nrouter.use(require('../middleware/inventoryWorkspaceOnly'));",name+' authentication');
   const anchor='WHERE wm.user_id = $1';if(source.split(anchor).length!==3)throw Error('Could not identify both normal workspace lists. Nothing was installed.');
   source=source.replaceAll(anchor,"WHERE wm.user_id = $1 AND COALESCE(to_jsonb(w)->>'workspace_kind','inventory')='inventory'");
   source=source.replace('WHERE owner_user_id = $1',"WHERE owner_user_id = $1 AND COALESCE(to_jsonb(workspaces)->>'workspace_kind','inventory')='inventory'");
  }
  if(name==='routes/auth.js'&&!source.includes('Retail workspace partition')){
   source=once(source,'WHERE owner_user_id = $1',"WHERE owner_user_id = $1 AND COALESCE(to_jsonb(workspaces)->>'workspace_kind','inventory')='inventory'",name+' personal workspace lookup');
   source+='\n// Retail workspace partition: login retains the normal InventoryOS workspace.\n';
  }
  const next=source.replaceAll('\n',newline);if(next!==old)changes.push({name,bytes:Buffer.from(next),old:Buffer.from(old)});
 }
 return changes;
};
