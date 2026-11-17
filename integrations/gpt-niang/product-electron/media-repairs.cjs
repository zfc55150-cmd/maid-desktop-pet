'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { sha } = require('./app/file-integrity.cjs');
const { metadata } = require('./media-additions.cjs');

function apply(base, candidate, repairRoot) {
 const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
 const [animation, scenes, masks] = metadata.map(name => read(path.join(base, name)));
 const repairs = [];
 for (const id of fs.readdirSync(repairRoot).sort()) {
  if (!/^[a-z][a-z0-9]*$/.test(id) || !Object.hasOwn(scenes.clips, id)) {
   throw Error('UNKNOWN_REPAIR_CLIP:' + id);
  }
  const directory = path.join(repairRoot, id);
  const entry = read(path.join(directory, 'repair.json'));
  const scene = scenes.clips[id];
  const mask = masks.entries[id];
  const videoFile = id + '.webm';
  const maskFile = id + '.bin';
  const bytes = entry.frames * 384 * 384 / 8;
  if (entry.id !== id || scene.file !== 'media/' + videoFile || mask.file !== 'hit-masks/' + maskFile ||
      entry.baselineSha256 !== mask.videoSha256 || entry.fps !== scene.fps ||
      !Number.isInteger(entry.frames) || entry.frames < 2 || entry.maskBytes !== bytes) {
   throw Error('REPAIR_BASELINE_OR_FORMAT:' + id);
  }
  const video = path.join(directory, videoFile);
  const binary = path.join(directory, maskFile);
  if (sha(video) !== entry.sha256 || sha(binary) !== entry.maskSha256 ||
      fs.statSync(binary).size !== bytes) {
   throw Error('REPAIR_HASH:' + id);
  }
  for (const [from, relative] of [[video, scene.file], [binary, mask.file]]) {
   const destination = path.join(candidate, relative);
   // Unlink the candidate path before replacing it. It may share storage with the baseline.
   fs.unlinkSync(destination);
   fs.copyFileSync(from, destination);
  }
  scene.frames = animation.states[id].frames = mask.frames = entry.frames;
  mask.bytes = bytes;
  mask.videoSha256 = entry.sha256;
  mask.sha256 = entry.maskSha256;
  repairs.push(entry);
 }
 if (!repairs.length) throw Error('NO_REPAIRS');
 for (const [index, data] of [animation, scenes, masks].entries()) {
  fs.writeFileSync(path.join(candidate, metadata[index]), JSON.stringify(data, null, 2));
 }
 return { repairs, clips: Object.keys(scenes.clips).length,
  frames: Object.values(scenes.clips).reduce((total, clip) => total + clip.frames, 0) };
}

module.exports = { apply };
