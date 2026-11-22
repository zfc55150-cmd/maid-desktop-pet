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

const TAG_RE = /^v(?:0|[1-9]\d{0,8})\.(?:0|[1-9]\d{0,8})\.(?:0|[1-9]\d{0,8})$/;
const PORTABLE_DSH_HOME_SNIPPET = "\nif (process.env.DSH_HOME) app.setPath('userData', require('node:path').join(process.env.DSH_HOME, 'electron-profile'));";
const EXPECTED_GENERATED_FILES = Object.freeze([
  {
    target: 'node_modules/dsh-pet/runtime/electron-helper/release-tag.json',
    description: 'portable release tag metadata emitted at build time by build-deepseek-portable-release.py'
  }
]);

function matchesInstalledOrPortableHash(installedFile, expectedHex, targetRel) {
  const buf = fs.readFileSync(installedFile);
  const actualHex = crypto.createHash('sha256').update(buf).digest('hex');
  if (actualHex === expectedHex) return true;
  if (String(targetRel || '').replaceAll('\\', '/').toLowerCase() === 'node_modules/dsh-pet/runtime/electron-helper/main.js') {
    const text = buf.toString('utf8');
    if (text.includes(PORTABLE_DSH_HOME_SNIPPET)) {
      const stripped = text.replace(PORTABLE_DSH_HOME_SNIPPET, '');
      const strippedHex = crypto.createHash('sha256').update(Buffer.from(stripped, 'utf8')).digest('hex');
      if (strippedHex === expectedHex) return true;
    }
  }
  return false;
}

function loadPreviousManifest(root, ref) {
  if (typeof ref !== 'string' || !TAG_RE.test(ref)) {
    throw new Error('Invalid previousRef format (expected vX.Y.Z): ' + ref);
  }
  const verifyTag = spawnSync('git', ['rev-parse', '--verify', '--quiet', `refs/tags/${ref}`], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true
  });
  if (verifyTag.status !== 0) {
    throw new Error(`Previous manifest ref ${ref} not found locally; fetch tags (git fetch --tags) or use --skip-previous-ref-check in git-less exports`);
  }
  const result = spawnSync('git', ['show', `${ref}:deployment.json`], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true
  });
  if (result.status !== 0) {
    throw new Error('Unable to load previous manifest from git ref: ' + ref);
  }
  const parsed = JSON.parse(result.stdout);
  if (!Array.isArray(parsed?.files)) {
    throw new Error('Invalid previous manifest at git ref: ' + ref);
  }
  return new Map(parsed.files.map(entry => [String(entry.target || '').replaceAll('\\', '/').toLowerCase(), entry]));
}

function listAppFiles(root) {
  const appRoot = path.join(root, 'app');
  if (!fs.existsSync(appRoot)) return [];
  const results = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Refusing deployment reparse point: ' + path.relative(root, full));
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) results.push(full);
    }
  };
  walk(appRoot);
  return results;
}

function verifyManifest({root, installedRoot = null, previousRef = null, skipPreviousRefCheck = false, strictMetadata = false, checkAppCompleteness = false}) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'deployment.json'), 'utf8'));
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const version = pkg.version;
  if (manifest.version !== version || !Array.isArray(manifest.files) || !manifest.files.length) {
    throw new Error('Deployment version or file list is invalid');
  }
  if (strictMetadata) {
    if (typeof pkg.releaseTag !== 'string' || !TAG_RE.test(pkg.releaseTag)) {
      throw new Error('Root package.json releaseTag is missing or invalid');
    }
    const helperPkgPath = path.join(root, 'app/electron-helper/package.json');
    if (!fs.existsSync(helperPkgPath)) throw new Error('Helper package.json is missing');
    const helperPkg = JSON.parse(fs.readFileSync(helperPkgPath, 'utf8'));
    if (helperPkg.version !== version || helperPkg.releaseTag !== pkg.releaseTag) {
      throw new Error('Helper package.json version or releaseTag mismatch');
    }
    const gptPkgPath = path.join(root, 'integrations/gpt-niang/product-electron/package.json');
    const catalogPath = path.join(root, 'integrations/gpt-niang/product-electron/app/performance-catalog.js');
    if (fs.existsSync(gptPkgPath) && fs.existsSync(catalogPath)) {
      const gptPkg = JSON.parse(fs.readFileSync(gptPkgPath, 'utf8'));
      const catalogRevision = require(catalogPath).revision;
      if (gptPkg.version !== catalogRevision) {
        throw new Error('GPT product-electron package.json version and catalog revision mismatch');
      }
    }
    if (fs.existsSync(path.join(root, 'tests/i18n-ja.test.cjs'))) {
      const PetShared = require(path.join(root, 'integrations/gpt-niang/product-electron/app/vendor/shared-core.js'));
      const {resolveLanguage: storeResolve} = require(path.join(root, 'app/electron-helper/chat-config-store.js'));
      const gptI18n = require(path.join(root, 'integrations/gpt-niang/product-electron/app/i18n.js'));
      for (const hint of ['ja', 'ja-JP', 'zh-CN', 'zh-TW', 'en-US']) {
        if (PetShared.resolveLanguage('auto', hint) !== storeResolve('auto', hint) ||
            PetShared.resolveLanguage('auto', hint) !== gptI18n.resolveLanguage('auto', {env: {LANGUAGE: hint}, systemLocale: hint, navigatorObj: null})) {
          throw new Error('resolveLanguage drift across shared-core, chat-config-store, and gpt-niang i18n');
        }
      }
    }
  }
  const rawPreviousRef = previousRef || (strictMetadata && typeof manifest.previousRef === 'string' && manifest.previousRef.trim() ? manifest.previousRef.trim() : null);
  if (rawPreviousRef && !TAG_RE.test(rawPreviousRef)) {
    throw new Error('Invalid previousRef format (expected vX.Y.Z): ' + rawPreviousRef);
  }
  const effectivePreviousRef = skipPreviousRefCheck ? null : rawPreviousRef;
  const previousByTarget = effectivePreviousRef ? loadPreviousManifest(root, effectivePreviousRef) : null;
  const isPortableRoot = Boolean(installedRoot && (
    fs.existsSync(path.join(installedRoot, 'Start-DeepSeek-Niang.cmd')) ||
    fs.existsSync(path.join(installedRoot, 'PORTABLE-README.md'))
  ));
  const sources = new Set(), targets = new Set();
  const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  for (const entry of manifest.files) {
    if (typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(entry.sha256)) {
      throw new Error('Invalid deployment SHA-256');
    }
    if (entry.previousSha256 !== null &&
        (typeof entry.previousSha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(entry.previousSha256))) {
      throw new Error('Invalid deployment previousSha256: ' + entry.source);
    }
    if (previousByTarget) {
      const key = String(entry.target || '').replaceAll('\\', '/').toLowerCase();
      const expectedPrev = previousByTarget.get(key)?.sha256?.toLowerCase() ?? null;
      const actualPrev = entry.previousSha256 === null ? null : entry.previousSha256.toLowerCase();
      if (actualPrev !== expectedPrev) {
        throw new Error('Deployment previousSha256 does not match ' + effectivePreviousRef + ': ' + entry.target);
      }
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
    if (installedRoot) {
      if (entry.restricted === true && isPortableRoot && !fs.existsSync(path.join(installedRoot, entry.target))) {
        continue;
      }
      const installedFile = childFile(installedRoot, entry.target);
      if (!matchesInstalledOrPortableHash(installedFile, entry.sha256.toLowerCase(), entry.target)) {
        throw new Error('Installed hash mismatch: ' + entry.target);
      }
    }
  }
  if (installedRoot && isPortableRoot) {
    for (const gen of EXPECTED_GENERATED_FILES) {
      const genFile = childFile(installedRoot, gen.target);
      if (gen.target.endsWith('release-tag.json')) {
        const meta = JSON.parse(fs.readFileSync(genFile, 'utf8'));
        if (!TAG_RE.test(String(meta?.tag || '')) || (strictMetadata && meta.tag !== pkg.releaseTag)) {
          throw new Error('Invalid or mismatched generated release-tag.json in portable root');
        }
      }
    }
  }
  if (checkAppCompleteness) {
    for (const file of listAppFiles(root)) {
      if (!sources.has(path.resolve(file).toLowerCase())) {
        throw new Error('Unregistered app file missing from deployment.json: ' + path.relative(root, file).replaceAll('\\', '/'));
      }
    }
  }
  return {version, sourceFiles: sources.size, installedFiles: installedRoot ? targets.size : null, previousRef: effectivePreviousRef};
}

function writeResult(root, result) {
  const out = path.join(root, 'work/verification');
  fs.mkdirSync(out, {recursive: true});
  const temp = path.join(out, 'latest.' + process.pid + '.tmp');
  fs.writeFileSync(temp, JSON.stringify(result, null, 2) + '\n');
  fs.renameSync(temp, path.join(out, 'latest.json'));
}

function main(args) {
  let installed = false, explicitRoot = null, previousRef = null, skipPreviousRefCheck = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--installed') installed = true;
    else if (args[i] === '--installed-root' && args[i + 1] && !args[i + 1].startsWith('--')) {
      explicitRoot = path.resolve(args[++i]); installed = true;
    } else if (args[i] === '--previous-ref' && args[i + 1] && !args[i + 1].startsWith('--')) {
      previousRef = args[++i];
    } else if (args[i] === '--skip-previous-ref-check') {
      skipPreviousRefCheck = true;
    } else throw new Error('Usage: node scripts/verify.cjs [--installed] [--installed-root PATH] [--previous-ref GIT_REF] [--skip-previous-ref-check]');
  }
  const root = path.resolve(__dirname, '..');
  console.log('Shared files OK: ' + require('./sync-shared.cjs').syncShared());
  const installedRoot = installed ? (explicitRoot || path.join(process.env.LOCALAPPDATA || path.join(require('node:os').homedir(), 'AppData/Local'), 'Programs/DeepSeekActionPet')) : null;
  const manifest = verifyManifest({root, installedRoot, previousRef, skipPreviousRefCheck, strictMetadata: true, checkAppCompleteness: true});
  console.log('Manifest OK: ' + manifest.sourceFiles + ' source files' + (installedRoot ? ', ' + manifest.installedFiles + ' installed files' : '') + (manifest.previousRef ? ' (previousRef=' + manifest.previousRef + ')' : ''));
  const tests = fs.readdirSync(path.join(root, 'tests')).filter(name => name.endsWith('.test.cjs')).sort().map(name => path.join(root, 'tests', name));
  if (!tests.length) throw new Error('No regression tests found');
  for (const command of [[path.join(root, 'scripts/check.cjs')], ['--test', ...tests]]) {
    const result = spawnSync(process.execPath, command, {cwd: root, stdio: 'inherit', windowsHide: true, timeout: 60000});
    if (result.error) throw new Error('Verification process failed: ' + result.error.code);
    if (result.status !== 0) throw new Error('Verification step failed');
  }
  // Verify again with full strictness so a source/metadata change during tests cannot be reported as current.
  verifyManifest({root, installedRoot, previousRef, skipPreviousRefCheck, strictMetadata: true, checkAppCompleteness: true});
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
module.exports = {verifyManifest, EXPECTED_GENERATED_FILES, PORTABLE_DSH_HOME_SNIPPET};
