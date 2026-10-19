'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function createToken() { return crypto.randomBytes(32).toString('hex'); }
function headers(token = process.env.DSH_PET_CONTROL_TOKEN) {
  if (!/^[a-f0-9]{64}$/.test(token || '')) throw new Error('Local control token unavailable');
  return { 'x-pet-control': token };
}
function validPeer(req) {
  const host = String(req.headers?.host || '').toLowerCase();
  const match = /^(127\.0\.0\.1|localhost|\[::1\]):(\d+)$/.exec(host);
  if (!match || (req.socket?.localPort && Number(match[2]) !== req.socket.localPort)) return false;
  // Desktop IPC and the launcher do not send browser Origin/Fetch metadata.
  return !req.headers?.origin && !req.headers?.['sec-fetch-site'];
}
function authorized(req, token = process.env.DSH_PET_CONTROL_TOKEN) {
  if (!validPeer(req) || !/^[a-f0-9]{64}$/.test(token || '')) return false;
  const provided = req.headers?.['x-pet-control'];
  return typeof provided === 'string' && /^[a-f0-9]{64}$/.test(provided) &&
    crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(token));
}
function publish(home, token, port) {
  const { ChatConfigStore } = require('./chat-config-store');
  fs.mkdirSync(home, { recursive: true });
  new ChatConfigStore({ dir: home }).writeAtomic(path.join(home, 'control-session.json'),
    JSON.stringify({ token, port, pid: process.pid }));
}
function readSession(home) {
  const value = JSON.parse(fs.readFileSync(path.join(home, 'control-session.json'), 'utf8'));
  headers(value.token);
  if (value.port !== 3088 || !Number.isSafeInteger(value.pid)) throw new Error('Invalid control session');
  return value;
}
module.exports = { createToken, headers, validPeer, authorized, publish, readSession };
