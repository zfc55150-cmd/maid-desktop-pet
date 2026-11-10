'use strict';
const fs = require('node:fs');
const path = require('node:path');

// Seed only a genuinely new profile; never mask an existing damaged profile.
function ensureFirstRun(root, home) {
  const dir = path.join(home, 'dsh-pet');
  const target = path.join(dir, 'main-config.jsonc');
  const protectedFiles = [target, target + '.bak', target + '.last-good.json'];
  if (protectedFiles.some(file => fs.existsSync(file))) return false;
  const source = path.join(root, 'node_modules/dsh-pet/assets/config.jsonc');
  const { parseJsonc, validateAppearance } = require(path.join(root,
    'node_modules/dsh-pet/runtime/electron-helper/pet-appearance-store.js'));
  const data = fs.readFileSync(source);
  validateAppearance(parseJsonc(data.toString('utf8').replace(/^\uFEFF/, '')));
  fs.mkdirSync(dir, { recursive: true });
  // Exclusive creation prevents a second launcher from overwriting the first.
  try {
    fs.writeFileSync(target, data, { flag: 'wx' });
    return true;
  } catch (error) {
    if (error.code === 'EEXIST') return false;
    throw error;
  }
}
module.exports = { ensureFirstRun };
