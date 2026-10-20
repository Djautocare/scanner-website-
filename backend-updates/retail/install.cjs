'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const root = process.cwd();
const names = ['routes/retailRoutes.js', 'utils/retail.js', 'utils/retailCatalogue.js', 'utils/retailBusiness.js', 'utils/retailPricing.js', 'utils/retailOperations.js', 'utils/retailTransfer.js', 'sql/retail-operations.sql', 'sql/retail.sql', 'sql/retail-business.sql', 'check-retail.cjs'];
function checked(relative) {
  const p = path.join(root, relative);
  if (fs.existsSync(p) && fs.lstatSync(p).isSymbolicLink()) throw new Error('Refusing a symbolic link: ' + relative);
  return p;
}
try {
  for (const p of ['server.js', 'database.js', 'package.json', 'middleware/authMiddleware.js', 'middleware/workspaceMiddleware.js', 'utils/billing.js']) {
    if (!fs.existsSync(checked(p))) throw new Error('Open PowerShell in your current backend folder. Required file missing: ' + p);
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));
  const stateFile = checked('.retail-installed.json');
  const previous = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : {};
  const writes = [];
  for (const name of names) {
    const source = path.join(__dirname, 'files', name), target = checked(name);
    const bytes = fs.readFileSync(source);
    if (hash(bytes) !== manifest[name]) throw new Error('Update file is damaged: ' + name + '. Extract the ZIP again.');
    const old = fs.existsSync(target) ? fs.readFileSync(target) : null;
    if (old && hash(old) !== hash(bytes) && previous.files?.[name] !== hash(old)) throw new Error('Existing Retail file differs: ' + name + '. Nothing was changed. Keep your version and send it for review.');
    if (!old || hash(old) !== hash(bytes)) writes.push({ name, bytes, old });
    if (/\.(js|cjs)$/.test(name)) {
      const result = spawnSync(process.execPath, ['--check', source], { encoding: 'utf8', shell: false, windowsHide: true });
      if (result.status !== 0) throw new Error('Syntax check failed for ' + name);
    }
  }
  let server = fs.readFileSync(checked('server.js'), 'utf8');
  const before = server;
  const mount = 'app.use("/retail", require("./routes/retailRoutes"));';
  const start = "    require('./utils/retail').service().start();";
  if (!server.includes(mount)) {
    if (/app\.use\(\s*["']\/retail["']/.test(server)) throw new Error('A different Retail mount already exists. Nothing was changed.');
    const anchor = /app\.use\("\/manufacturing", manufacturingRoutes\);/g;
    if ([...server.matchAll(anchor)].length !== 1) throw new Error('Could not identify the safe route insertion point in server.js. Nothing was changed.');
    server = server.replace(anchor, mount + '\n$&');
  }
  if (!server.includes(start.trim())) {
    const anchor = /^[ \t]*manufacturingService\.start\(\);/gm;
    if ([...server.matchAll(anchor)].length !== 1) throw new Error('Could not identify the backend startup point. Nothing was changed.');
    server = server.replace(anchor, '$&\n' + start);
  }
  // The deployed API uses an explicit CORS allowlist. Staff credentials remain
  // in headers, never URL query strings or the pending-action body store.
  if (!server.includes('"X-Retail-Staff-Token"') || !server.includes('"X-Retail-Device-Id"')) {
    const blocks = [...server.matchAll(/allowedHeaders\s*:\s*\[[\s\S]*?\]/g)];
    if (blocks.length !== 1 || !blocks[0][0].includes('"Authorization"') || !blocks[0][0].includes('"X-Workspace-Id"')) throw new Error('Could not safely update the API header allowlist. Nothing was changed.');
    const block=blocks[0][0], extras=['X-Retail-Staff-Token','X-Retail-Device-Id'].filter(name=>!block.includes('"'+name+'"'));
    const updated=block.replace(/,?\s*\]$/,',\n'+extras.map(name=>'        "'+name+'"').join(',\n')+'\n    ]');
    server=server.replace(block,updated);
  }
  if (server !== before) writes.push({ name: 'server.js', bytes: Buffer.from(server), old: Buffer.from(before) });
  const stateBytes = Buffer.from(JSON.stringify({ version: 5, files: manifest }, null, 2));
  const stateOld = fs.existsSync(stateFile) ? fs.readFileSync(stateFile) : null;
  if (!stateOld || hash(stateOld) !== hash(stateBytes)) writes.push({ name: '.retail-installed.json', bytes: stateBytes, old: stateOld });
  if (!writes.length) { console.log('Retail update is already installed. Next: node .\\check-retail.cjs'); process.exit(0); }
  const backup = path.join(root, 'retail-backup-' + new Date().toISOString().replace(/[:.]/g, '-'));
  fs.mkdirSync(backup);
  const record = { version: 1, files: writes.map(w => ({ path: w.name, existed: w.old !== null, installed_hash: hash(w.bytes) })) };
  for (const w of writes) if (w.old) { const dest = path.join(backup, 'original', w.name); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, w.old); }
  fs.writeFileSync(path.join(backup, 'restore.json'), JSON.stringify(record, null, 2));
  const changed = [];
  try {
    for (const w of writes) { fs.mkdirSync(path.dirname(checked(w.name)), { recursive: true }); fs.writeFileSync(checked(w.name), w.bytes); changed.push(w); }
    const check = spawnSync(process.execPath, ['--check', checked('server.js')], { shell: false, windowsHide: true });
    if (check.status !== 0) throw new Error('Patched server.js did not pass syntax validation');
  } catch (e) {
    for (const w of changed.reverse()) { if (w.old) fs.writeFileSync(checked(w.name), w.old); else fs.rmSync(checked(w.name)); }
    throw e;
  }
  console.log('Installed Retail update. Existing server mount/start lines were kept or added as needed.');
  console.log('Backup: ' + backup);
  console.log('Next: node .\\check-retail.cjs. If it passes, restart InventoryOS Backend.');
  console.log('No .env changes or new npm packages are required.');
} catch (e) { console.error('Retail installation stopped: ' + e.message); process.exitCode = 1; }
