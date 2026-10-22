'use strict';
// Restore only this installer’s code changes. Never delete database records.
const fs = require('node:fs'); const path = require('node:path'); const crypto = require('node:crypto');
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
let pool;
(async()=>{try {
  const root = process.cwd(), input = process.argv[2];
  if (!input) throw new Error('Provide the backup folder printed by install.cjs');
  const backup = path.resolve(input);
  if (path.dirname(backup) !== root || !path.basename(backup).startsWith('retail-backup-')) throw new Error('Choose a Retail backup folder inside this backend folder');
  const manifest = JSON.parse(fs.readFileSync(path.join(backup, 'restore.json'), 'utf8'));
  const allowed = ['utils/retailHelp.js','check-retail-help.cjs','utils/retailReceiptEmails.js','sql/retail-email-receipts.sql','setup-retail-email-receipts.cjs','check-retail-email-receipts.cjs','utils/billing.js','check-retail-billing.cjs','utils/retailBilling.js','utils/retailWorkspaces.js','middleware/inventoryWorkspaceOnly.js','middleware/workspaceMiddleware.js','routes/workspaces.js','routes/auth.js','utils/retailWaste.js','utils/supplierProduct.js','utils/retailOrdering.js','utils/retailReports.js','sql/retail-ordering.sql','utils/retailDrawers.js','routes/retailPosRoutes.js','utils/retailPlatform.js','utils/retailPlatformAdmin.js','sql/retail-platform.sql','routes/billing.js','routes/admin.js','server.js', 'routes/retailRoutes.js', 'utils/retail.js', 'utils/retailCatalogue.js', 'utils/retailBusiness.js', 'utils/retailPricing.js', 'utils/retailOperations.js', 'utils/retailTransfer.js', 'sql/retail-operations.sql', 'sql/retail.sql', 'sql/retail-business.sql', 'check-retail.cjs', '.retail-installed.json'];
  for (const entry of manifest.files) {
    if (!allowed.includes(entry.path)) throw new Error('Unexpected backup entry');
    const p = path.join(root, entry.path);
    if (!fs.existsSync(p) || fs.lstatSync(p).isSymbolicLink() || hash(fs.readFileSync(p)) !== entry.installed_hash) throw new Error(entry.path + ' has changed since installation. Nothing was restored.');
    if (entry.existed && !fs.existsSync(path.join(backup, 'original', entry.path))) throw new Error('Original backup missing');
  }
  pool=require(path.join(root,'database.js'));
  if(typeof pool.query!=='function')throw new Error('Could not verify the database before restoring older code. Nothing was restored.');
  const retail=await pool.query("SELECT COUNT(*)::int AS n FROM workspaces w WHERE COALESCE(to_jsonb(w)->>'workspace_kind','inventory')='retail'");
  if(Number(retail.rows[0].n)>0)throw new Error('Separate Retail workspaces already exist. Older code cannot be restored alone. Keep this version or restore your complete pre-update database backup with its matching backend.');
  for (const entry of manifest.files) {
    const p = path.join(root, entry.path);
    if (entry.existed) fs.copyFileSync(path.join(backup, 'original', entry.path), p); else fs.rmSync(p);
  }
  console.log('Retail code changes restored. Saved Retail database records were retained. Restart your backend.');
} catch (e) { console.error('Restore stopped: ' + e.message); process.exitCode = 1; } finally {if(pool?.end)await pool.end();}})();
