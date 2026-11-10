/** Retain the topmost band; only an explicit interaction raises above peer pets. */
'use strict';
const TOPMOST_WATCHDOG_TICK_MS = 1000;
const TOPMOST_REASSERT_MS = 5000;
function shouldReassertTopmost(state) {
  const {nowMs, lastAssertMs, destroyed, visible, paused, alwaysOnTop} = state || {};
  if (destroyed || !visible || paused || alwaysOnTop !== false) return false;
  const elapsed = nowMs - lastAssertMs;
  return !(elapsed >= 0 && elapsed < TOPMOST_REASSERT_MS);
}
function raiseOnInteraction(win, wasBusy, busy) {
  if (!busy || wasBusy || !win || win.isDestroyed() || !win.isVisible()) return false;
  if (!win.isAlwaysOnTop()) win.setAlwaysOnTop(true, 'screen-saver');
  win.moveTop();
  return true;
}
module.exports = {TOPMOST_WATCHDOG_TICK_MS, TOPMOST_REASSERT_MS, shouldReassertTopmost, raiseOnInteraction};
