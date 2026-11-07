'use strict';
(function (root) {

// Content identity and semantic eligibility are deliberately independent of names.
// No source here infers timing, pose or artistic approval from a filename.
function create(data) {
  const byName = new Map();
  for (const clip of data.clips || []) {
    if (!clip.clipId || !Array.isArray(clip.aliases)) throw new Error('Invalid clip record');
    for (const name of clip.aliases) {
      if (byName.has(name)) throw new Error('Duplicate action alias: ' + name);
      byName.set(name, clip);
    }
  }
  const recent = [];
  const resolve = name => byName.get(name) || null;
  const unique = names => {
    const seen = new Set();
    return names.filter(name => {
      const clip = resolve(name);
      if (!clip || seen.has(clip.clipId)) return false;
      seen.add(clip.clipId); return true;
    });
  };
  const canEnter = (name, state = {}) => {
    const clip = resolve(name);
    if (!clip || !clip.entryPose || clip.entryPose === 'unknown') return false;
    if (clip.entryPose !== state.pose) return false;
    if (!(clip.requiredProps || []).every(prop => (state.props || []).includes(prop))) return false;
    const trigger = state.trigger || 'manual';
    if (!(clip.allowedTriggers || []).includes(trigger)) return false;
    if (trigger === 'daily' && clip.autoEligible !== true) return false;
    return true;
  };
  return {
    resolve, unique, canEnter,
    record(name) {
      const clip = resolve(name);
      if (!clip) return;
      recent.unshift(clip.clipId); recent.length = Math.min(recent.length, 8);
    },
    choose(names, state = {}) {
      const eligible = unique(names).filter(name => canEnter(name, state));
      const history = state.recent || recent;
      const fresh = eligible.filter(name => !history.includes(resolve(name).clipId));
      // Do not replay the sole alias of the current clip merely to fill a slot.
      const pool = fresh.length ? fresh : eligible.filter(name => resolve(name).clipId !== history[0]);
      if (!pool.length) return null;
      const roll = Math.max(0, Math.min(0.999999999, (state.random || Math.random)()));
      return pool[Math.floor(roll * pool.length)];
    },
  };
}
if (typeof module === 'object' && module.exports) module.exports = { create };
else root.PetActionRegistry = { create };
})(globalThis);
