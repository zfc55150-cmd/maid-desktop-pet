'use strict';
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const FORMAL_TAG = /^v(?:0|[1-9]\d{0,8})\.(?:0|[1-9]\d{0,8})\.(?:0|[1-9]\d{0,8})$/;

function taggedRelease(expectedTag) {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
  const tags = git('tag', '--points-at', 'HEAD').split(/\r?\n/).filter(tag => FORMAL_TAG.test(tag));
  if (tags.length !== 1 || (expectedTag && tags[0] !== expectedTag)) throw new Error('FORMAL_RELEASE_TAG_MISMATCH');
  if (git('status', '--porcelain', '--untracked-files=normal')) throw new Error('FORMAL_RELEASE_REQUIRES_CLEAN_TREE');
  return tags[0];
}

if (require.main === module) {
  try { console.log(taggedRelease(process.argv[2])); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { taggedRelease };
