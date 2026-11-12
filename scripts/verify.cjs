'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawnSync} = require('node:child_process');

function childFile(root, relative) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative) || /[:\0]/.test(relative)) {
    throw new Error('Invalid deployment path');
  }
  const base = path.resolve(root);
  const file = path.resolve(base, relative);
  const tail = path.relative(base, file);
  if (!tail || tail === '..' || tail.startsWith('..' + path.sep) || path.isAbsolute(tail)) {
    throw new Error('Deployment path escapes its root');
  }
  let cursor = base;
  for (const component of tail.split(path.sep)) {
    cursor = path.join(cursor, component);
    if (fs.lstatSync(cursor).isSymbolicLink()) throw new Error('Refusing deployment reparse point');
  }
  if (fs.lstatSync(base).isSymbolicLink()) throw new Error('Refusing deployment reparse root');
  if (!fs.statSync(file).isFile()) throw new Error('Deployment entry must be a file');
  return file;
}

function verifyManifest({root, installedRoot = null}) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'deployment.json'), 'utf8'));
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  if (manifest.version !== version || !Array.isArray(manifest.files) || !manifest.files.length) {
    throw new Error('Deployment version or file list is invalid');
  }
  const sources = new Set(), targets = new Set();
  const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  for (const entry of manifest.files) {
    if (typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(entry.sha256)) {
      throw new Error('Invalid deployment SHA-256');
    }
    const source = childFile(root, entry.source);
    const sourceId = path.resolve(source).toLowerCase();
    if (sources.has(sourceId)) throw new Error('Duplicate deployment source');
    sources.add(sourceId);
    // Validate target boundaries even when the installed copy is not being checked.
    if (typeof entry.target !== 'string' || !entry.target || /[:\0]/.test(entry.target) || path.isAbsolute(entry.target)) {
      throw new Error('Invalid deployment target');
    }
    const relativeTarget = path.normalize(entry.target);
    if (relativeTarget === '..' || relativeTarget.startsWith('..' + path.sep) || relativeTarget === '.') {
      throw new Error('Deployment target escapes its root');
    }
    const targetId = relativeTarget.toLowerCase();
    if (targets.has(targetId)) throw new Error('Duplicate deployment target');
    targets.add(targetId);
    if (digest(source) !== entry.sha256.toLowerCase()) throw new Error('Source hash mismatch: ' + entry.source);
    if (installedRoot && digest(childFile(installedRoot, entry.target)) !== entry.sha256.toLowerCase()) {
      throw new Error('Installed hash mismatch: ' + entry.target);
    }
  }
  return {version, sourceFiles: sources.size, installedFiles: installedRoot ? targets.size : null};
}

function writeResult(root, result) {
  const out = path.join(root, 'work/verification');
  fs.mkdirSync(out, {recursive: true});
  const temp = path.join(out, 'latest.' + process.pid + '.tmp');
  fs.writeFileSync(temp, JSON.stringify(result, null, 2) + '\n');
  fs.renameSync(temp, path.join(out, 'latest.json'));
}

function main(args) {
  let installed = false, explicitRoot = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--installed') installed = true;
    else if (args[i] === '--installed-root' && args[i + 1] && !args[i + 1].startsWith('--')) {
      explicitRoot = path.resolve(args[++i]); installed = true;
    } else throw new Error('Usage: node scripts/verify.cjs [--installed] [--installed-root PATH]');
  }
  const root = path.resolve(__dirname, '..');
  console.log('Shared files OK: ' + require('./sync-shared.cjs').syncShared());
  const installedRoot = installed ? (explicitRoot || path.join(process.env.LOCALAPPDATA || path.join(require('node:os').homedir(), 'AppData/Local'), 'Programs/DeepSeekActionPet')) : null;
  const manifest = verifyManifest({root, installedRoot});
  console.log('Manifest OK: ' + manifest.sourceFiles + ' source files' + (installedRoot ? ', ' + manifest.installedFiles + ' installed files' : ''));
  const tests = fs.readdirSync(path.join(root, 'tests')).filter(name => name.endsWith('.test.cjs')).sort().map(name => path.join(root, 'tests', name));
  if (!tests.length) throw new Error('No regression tests found');
  for (const command of [[path.join(root, 'scripts/check.cjs')], ['--test', ...tests]]) {
    const result = spawnSync(process.execPath, command, {cwd: root, stdio: 'inherit', windowsHide: true, timeout: 60000});
    if (result.error) throw new Error('Verification process failed: ' + result.error.code);
    if (result.status !== 0) throw new Error('Verification step failed');
  }
  // Verify again so a source change during the tests cannot be reported as current.
  verifyManifest({root, installedRoot});
  const result = {ok: true, checkedAt: new Date().toISOString(), ...manifest, syntax: true, regression: true, testFiles: tests.length, paidApi: false, restartsPet: false};
  writeResult(root, result);
  console.log('Verification OK; result saved to work/verification/latest.json');
}

if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (error) {
    try { writeResult(path.resolve(__dirname, '..'), {ok: false, checkedAt: new Date().toISOString(), error: error.message, paidApi: false, restartsPet: false}); } catch {}
    console.error(error.message); process.exitCode = 1;
  }
}
module.exports = {verifyManifest};
