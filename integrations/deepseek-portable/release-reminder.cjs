'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const TAG = /^v(?:0|[1-9]\d{0,8})\.(?:0|[1-9]\d{0,8})\.(?:0|[1-9]\d{0,8})$/;
const action = 'https://release-reminder.invalid/';
const firstDelay = 30_000;
const tickDelay = 60 * 60_000;
const releaseUrl = tag => `https://github.com/zfc55150-cmd/maid-desktop-pet/releases/tag/${tag}`;

function readState(file) {
  try {
    const state = JSON.parse(fs.readFileSync(file, 'utf8'));
    return state && typeof state === 'object' && !Array.isArray(state) ? state : {};
  } catch { return {}; }
}

function saveState(file, state) {
  const temp = file + '.' + randomUUID() + '.tmp';
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(temp, JSON.stringify(state, null, 2) + '\n', { flag: 'wx' });
    fs.renameSync(temp, file);
  } finally { fs.rmSync(temp, { force: true }); }
}

async function checkOnce({ stateFile, localTag, show, fetchImpl = globalThis.fetch, now = Date.now,
  checkRelease = require('./release-notice.cjs').checkReleaseNotice }) {
  if (!TAG.test(localTag)) return false;
  const state = readState(stateFile);
  if (state.enabled === false) return false;
  const result = await checkRelease({ store: state, localTag, now, fetchImpl, assetKind: 'deepseek' });
  if (result.skipped !== 'throttled' && result.skipped !== 'rate-limited') saveState(stateFile, state);
  const { latestTag } = result.state;
  if (!result.ok || !result.state.hasUpdate || !TAG.test(latestTag) ||
      latestTag !== state.lastNotifiedTag || latestTag === state.lastShownTag) return false;
  if (!await show(latestTag, releaseUrl(latestTag))) return false;
  saveState(stateFile, { ...state, lastShownTag: latestTag });
  return true;
}

async function showNotice({ BrowserWindow, screen, shell }, pet, tag, url) {
  if (!TAG.test(tag) || url !== releaseUrl(tag) || !pet || pet.isDestroyed() || !pet.isVisible()) return false;
  const area = screen.getDisplayMatching(pet.getBounds()).workArea;
  const width = Math.min(350, area.width);
  const height = Math.min(160, area.height);
  const win = new BrowserWindow({
    width, height, x: Math.max(area.x, area.x + area.width - width - 16),
    y: Math.max(area.y, area.y + area.height - height - 16),
    show: false, skipTaskbar: true, frame: false, resizable: false, alwaysOnTop: true,
    backgroundColor: '#ffffff',
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, target) => {
    event.preventDefault();
    if (target === action + 'download') {
      void shell.openExternal(url).then(() => { if (!win.isDestroyed()) win.close(); }).catch(() => {});
    } else if (target === action + 'dismiss') win.close();
  });
  try {
    // The only dynamic HTML is a strictly validated numeric release tag.
    const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>DeepSeek 娘更新提醒</title>
<style>body{font:14px "Segoe UI","Microsoft YaHei",sans-serif;margin:16px;color:#233047}h1{font-size:18px;margin:0 0 8px}p{margin:0 0 14px}a{display:inline-block;padding:6px 12px;margin-right:8px;border:1px solid #b8c5db;border-radius:7px;color:#233047;text-decoration:none}a:first-of-type{background:#2458ab;color:white}</style>
<h1>DeepSeek 娘有新版本 ${tag}</h1><p>可以前往 GitHub 查看新版便携包。</p><a href="${action}download">前往下载</a><a href="${action}dismiss">知道了</a></html>`;
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    if (win.isDestroyed()) return false;
    if (pet.isDestroyed() || !pet.isVisible()) { win.close(); return false; }
    win.showInactive();
    const timer = setTimeout(() => { if (!win.isDestroyed()) win.close(); }, 30_000);
    timer.unref();
    win.once('closed', () => clearTimeout(timer));
    return true;
  } catch {
    if (!win.isDestroyed()) win.close();
    return false;
  }
}

function start({ electron, stateDir, getPetWindow, localTag }) {
  const stateFile = path.join(stateDir, 'release-reminder.json');
  let busy = false, stopped = false;
  const run = async () => {
    if (busy || stopped || !getPetWindow()) return;
    busy = true;
    try {
      await checkOnce({ stateFile, localTag, show: (tag, url) =>
        !stopped && showNotice(electron, getPetWindow(), tag, url) });
    } catch { /* An unavailable check must not affect pet startup or interaction. */ }
    finally { busy = false; }
  };
  const startup = setTimeout(run, firstDelay);
  const repeat = setInterval(run, tickDelay);
  startup.unref();
  repeat.unref();
  electron.app.once('will-quit', () => {
    stopped = true;
    clearTimeout(startup);
    clearInterval(repeat);
  });
}

module.exports = { start, checkOnce, showNotice };
