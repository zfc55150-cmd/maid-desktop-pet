'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { sha } = require('./app/file-integrity.cjs');

function applyDesktopGrade(stage, candidate, baseline) {
  const reportFile = path.join(stage, 'grade-verification.json');
  const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  const read = file => JSON.parse(fs.readFileSync(path.join(candidate, file), 'utf8').replace(/^\uFEFF/, ''));
  const scenes = read('scenes.json').clips;
  const masks = read('hit-masks.json');
  const verifiedClips = new Map(report.clips.map(row => [row.clip, row]));
  if (report.baseline !== baseline.version || report.frames !== baseline.frames ||
      verifiedClips.size !== baseline.clips || report.clips.length !== baseline.clips) {
    throw Error('DESKTOP_GRADE_BASELINE');
  }
  for (const [clip, scene] of Object.entries(scenes)) {
    const result = verifiedClips.get(clip);
    const mask = masks.entries[clip];
    const expectedFile = 'media/' + clip + '.webm';
    if (!/^[a-z][a-z0-9]*$/.test(clip) || scene.file !== expectedFile ||
        !result?.alphaAndChromaExact || result.frames !== scene.frames || result.fps !== scene.fps ||
        result.oldSha256 !== mask.videoSha256) {
      throw Error('DESKTOP_GRADE_RECEIPT:' + clip);
    }
    const output = path.join(candidate, expectedFile);
    const input = path.join(stage, 'graded-media', clip + '.webm');
    if (sha(output) !== result.oldSha256 || sha(input) !== result.sha256 ||
        fs.statSync(input).size !== result.bytes) {
      throw Error('DESKTOP_GRADE_HASH:' + clip);
    }
    fs.unlinkSync(output);
    fs.copyFileSync(input, output);
    mask.videoSha256 = result.sha256;
  }
  const maskFile = path.join(candidate, 'hit-masks.json');
  fs.unlinkSync(maskFile);
  fs.writeFileSync(maskFile, JSON.stringify(masks, null, 2));
  return {
    clips: verifiedClips.size,
    frames: report.frames,
    receiptSha256: sha(reportFile),
    source: report.baseline,
  };
}

module.exports = { applyDesktopGrade };
