'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const product = 'integrations/gpt-niang/product-electron/';
const read = file => fs.readFileSync(path.join(root, file));
const sha = data => createHash('sha256').update(data).digest('hex');

function replace(text, from, to) {
  if (text.split(from).length !== 2) throw new Error('Shared source anchor changed: ' + from);
  return text.replace(from, to);
}

function syncShared({ write = false } = {}) {
  const app = 'app/electron-helper/';
  const portableReminder = replace(read(app + 'release-reminder.js').toString('utf8'), "require('./release-notice.js').checkReleaseNotice",
    "require('./release-notice.cjs').checkReleaseNotice");
  // The GPT vendor build preserves its legacy zero-weight fallback and supports Node imports.
  const core = replace(read(app + 'shared-core.js').toString('utf8'),
    'c.actions.length > 0 && c.weight > 0', 'c.actions.length > 0');
  const vendorCore = core.trimEnd() + '\nif(typeof module===\'object\'&&module.exports)module.exports=PetShared;\n';
  const outputs = [
    [product + 'services/release-notice.cjs', read(app + 'release-notice.js')],
    ['integrations/deepseek-portable/release-reminder.cjs', Buffer.from(portableReminder)],
    [product + 'services/update.mjs', read('integrations/gpt-niang/maintenance/runtime/update.mjs')],
    [product + 'app/vendor/shared-core.js', Buffer.from(vendorCore)],
    ['integrations/gpt-niang/playback-lab/vendor/shared-core.js', Buffer.from(vendorCore)]
  ];
  for (const [file, data] of outputs) {
    if (write) fs.writeFileSync(path.join(root, file), data);
    else if (sha(read(file)) !== sha(data)) throw new Error('Shared copy drift: ' + file);
  }
  return outputs.length;
}

if (require.main === module) {
  console.log('Shared files OK: ' + syncShared({ write: process.argv.includes('--write') }));
}
module.exports = { syncShared };
