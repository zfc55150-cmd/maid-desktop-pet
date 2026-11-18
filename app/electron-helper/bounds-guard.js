'use strict';

const MIN_SIZE = 64;
const MAX_SIZE = 4096;
const MAX_ABS_COORD = 100000;
const MIN_VISIBLE_OVERLAP = 64;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/**
 * Clamp pet window bounds to safe dimensions and keep at least a minimum
 * overlap inside the nearest display workArea so a pet cannot get lost off-screen.
 */
function sanitizeBounds(bounds, workAreas = []) {
  const x = Number(bounds?.x);
  const y = Number(bounds?.y);
  const width = Number(bounds?.width);
  const height = Number(bounds?.height);
  if (![x, y, width, height].every(Number.isFinite)) {
    return { ok: false, reason: 'non-finite', rect: null };
  }

  const clampedW = clamp(Math.round(width), MIN_SIZE, MAX_SIZE);
  const clampedH = clamp(Math.round(height), MIN_SIZE, MAX_SIZE);
  const clampedSize = clampedW !== Math.round(width) || clampedH !== Math.round(height);

  let rx = Math.round(x);
  let ry = Math.round(y);
  let clampedPos = false;

  const areas = Array.isArray(workAreas)
    ? workAreas.filter(a => a && Number.isFinite(a.x) && Number.isFinite(a.y) && a.width > 0 && a.height > 0)
    : [];

  if (areas.length > 0) {
    const overlapX = Math.min(MIN_VISIBLE_OVERLAP, clampedW);
    const overlapY = Math.min(MIN_VISIBLE_OVERLAP, clampedH);
    const hasVisibleOverlap = areas.some(a =>
      Math.min(rx + clampedW, a.x + a.width) - Math.max(rx, a.x) >= overlapX &&
      Math.min(ry + clampedH, a.y + a.height) - Math.max(ry, a.y) >= overlapY
    );
    if (!hasVisibleOverlap) {
      const cx = rx + clampedW / 2;
      const cy = ry + clampedH / 2;
      let nearest = areas[0];
      let bestDist = Infinity;
      for (const area of areas) {
        const ax = clamp(cx, area.x, area.x + area.width);
        const ay = clamp(cy, area.y, area.y + area.height);
        const dist = Math.hypot(cx - ax, cy - ay);
        if (dist < bestDist) {
          bestDist = dist;
          nearest = area;
        }
      }
      const nextX = clamp(rx, nearest.x + overlapX - clampedW, nearest.x + nearest.width - overlapX);
      const nextY = clamp(ry, nearest.y + overlapY - clampedH, nearest.y + nearest.height - overlapY);
      clampedPos = nextX !== rx || nextY !== ry;
      rx = nextX;
      ry = nextY;
    }
  } else {
    const nextX = clamp(rx, -MAX_ABS_COORD, MAX_ABS_COORD);
    const nextY = clamp(ry, -MAX_ABS_COORD, MAX_ABS_COORD);
    clampedPos = nextX !== rx || nextY !== ry;
    rx = nextX;
    ry = nextY;
  }

  const reasons = [];
  if (clampedSize) reasons.push('size-clamped');
  if (clampedPos) reasons.push('position-clamped');
  return {
    ok: true,
    rect: { x: rx, y: ry, width: clampedW, height: clampedH },
    clampedSize,
    clampedPos,
    reasons
  };
}

/**
 * Return a rate-limiting predicate that allows at most one log per reason per intervalMs.
 */
function createLogLimiter(intervalMs = 10_000) {
  const lastLogged = new Map();
  return (reason, now = Date.now()) => {
    const prev = lastLogged.get(reason);
    if (prev !== undefined && now - prev < intervalMs) return false;
    lastLogged.set(reason, now);
    return true;
  };
}

module.exports = {
  MIN_SIZE,
  MAX_SIZE,
  MIN_VISIBLE_OVERLAP,
  sanitizeBounds,
  createLogLimiter
};
