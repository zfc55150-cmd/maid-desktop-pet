'use strict';
const fs = require('node:fs');
const path = require('node:path');
// Only fixed event names/codes cross this boundary. Never persist raw stderr or text.
const EVENTS = new Set(['loading','ready','playing','done','error','timeout','spawn-error','exit','pipe-error']);
const CODES = new Set(['GPU_BUSY','NO_GPU','VOICE_ERROR']);
function createVoiceLogger(home, fsImpl = fs) {
  return (event, code) => {
    if (!home || !EVENTS.has(event)) return;
    try {
      fsImpl.mkdirSync(home, { recursive: true });
      const file = path.join(home, 'voice.log');
      if (fsImpl.existsSync(file) && fsImpl.statSync(file).size > 256 * 1024) {
        try { fsImpl.unlinkSync(file + '.1'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
        fsImpl.renameSync(file, file + '.1');
      }
      fsImpl.appendFileSync(file, JSON.stringify({ time: new Date().toISOString(), event,
        ...(CODES.has(code) ? { code } : {}) }) + '\n', { mode: 0o600 });
    } catch { /* Logging must never break speech or leak an exception payload. */ }
  };
}
module.exports = { createVoiceLogger };
