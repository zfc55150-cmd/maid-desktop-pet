'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DEFAULT_WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_MAX_FAILURES = 3;
const MAX_HISTORY = 5;

function readJsonSafe(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return null;
  }
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
    fs.renameSync(temp, file);
  } finally {
    fs.rmSync(temp, { force: true });
  }
}

/**
 * Record a startup attempt and trigger safe mode after repeated recent failures.
 */
function recordAttempt(file, {
  version = null,
  now = Date.now(),
  windowMs = DEFAULT_WINDOW_MS,
  maxFailures = DEFAULT_MAX_FAILURES
} = {}) {
  const stored = readJsonSafe(file);
  const prior = stored && stored.version === version && Array.isArray(stored.attempts)
    ? stored.attempts.filter(item => item && Number.isFinite(item.at) && now - item.at <= windowMs)
    : [];
  let consecutiveFailures = 0;
  for (let i = prior.length - 1; i >= 0; i--) {
    if (prior[i].ok === true) break;
    consecutiveFailures++;
  }
  const safeMode = consecutiveFailures >= maxFailures;
  const nextAttempts = [...prior, { at: now, ok: false }].slice(-MAX_HISTORY);
  try {
    writeJsonAtomic(file, { version, attempts: nextAttempts });
  } catch {}
  return { safeMode, failures: consecutiveFailures };
}

/**
 * Mark the latest startup attempt as healthy once the character window shows.
 */
function markHealthy(file, { version = null, now = Date.now() } = {}) {
  const stored = readJsonSafe(file);
  const attempts = stored && stored.version === version && Array.isArray(stored.attempts)
    ? [...stored.attempts]
    : [];
  if (attempts.length > 0) {
    attempts[attempts.length - 1] = { ...attempts[attempts.length - 1], ok: true, healthyAt: now };
  } else {
    attempts.push({ at: now, ok: true, healthyAt: now });
  }
  try {
    writeJsonAtomic(file, { version, attempts: attempts.slice(-MAX_HISTORY) });
  } catch {}
}

/**
 * Clear recorded startup failure history (e.g., on manual configuration reload).
 */
function resetAttempts(file) {
  try {
    fs.rmSync(file, { force: true });
  } catch {}
}

/**
 * Persist the last validated character manifest when its content changes.
 */
function saveLastGoodManifest(file, { version, manifest }) {
  if (!manifest || typeof manifest !== 'object') return false;
  const payload = JSON.stringify(manifest);
  const sha256 = crypto.createHash('sha256').update(payload).digest('hex');
  const existing = readJsonSafe(file);
  if (existing && existing.version === version && existing.sha256 === sha256) return false;
  writeJsonAtomic(file, { version, sha256, savedAt: new Date().toISOString(), manifest });
  return true;
}

/**
 * Load the last known good manifest only if its version matches and its clips exist.
 */
function loadLastGoodManifest(file, { version, clips }) {
  const stored = readJsonSafe(file);
  if (!stored || stored.version !== version || !stored.manifest?.states?.frontidle) return null;
  if (clips && typeof clips === 'object') {
    for (const clip of Object.keys(stored.manifest.states)) {
      if (!Object.hasOwn(clips, clip)) return null;
    }
  }
  return stored.manifest;
}

module.exports = {
  DEFAULT_WINDOW_MS,
  DEFAULT_MAX_FAILURES,
  recordAttempt,
  markHealthy,
  resetAttempts,
  saveLastGoodManifest,
  loadLastGoodManifest
};
