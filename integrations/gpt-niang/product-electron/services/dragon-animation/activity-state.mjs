import crypto from 'node:crypto';

export const PHASES = new Set(['idle', 'thinking', 'working', 'waiting', 'happy', 'confused']);
const EVENTS = new Set(['SessionStart','SessionEnd','UserPromptSubmit','PreToolUse','PermissionRequest','PostToolUse','PreCompact','PostCompact','Stop','Interrupt']);
const ACTIVE_TTL = 30 * 60 * 1000;
const id = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value) ? value : null;
const hash = value => crypto.createHash('sha256').update(value).digest('hex').slice(0,32);

// Only these fields may cross the bridge. Never retain prompts, tool arguments,
// responses, transcript paths, working directories, or exception text.
export function normalizeEvent(input, now = Date.now()) {
  if (!input || !EVENTS.has(input.hook_event_name) || !id(input.session_id)) return null;
  const event = input.hook_event_name;
  const turn = id(input.turn_id);
  if (!['SessionStart','SessionEnd'].includes(event) && !turn) return null;
  const response = input.tool_response;
  const failed = event === 'PostToolUse' && Boolean(response && typeof response === 'object' &&
    (response.isError === true || (Number.isInteger(response.exit_code) && response.exit_code !== 0)));
  return {
    event, session: hash(input.session_id), turn: turn ? hash(turn) : null,
    tool: typeof input.tool_use_id === 'string' && input.tool_use_id.length <= 512 ? hash(input.tool_use_id) : null,
    failed, at: now,
  };
}

export function validSnapshot(value) {
  return Boolean(value && value.version === 1 && /^[a-f0-9]{32}$/.test(value.session) &&
    (value.turn === null || /^[a-f0-9]{32}$/.test(value.turn)) && PHASES.has(value.phase) &&
    Number.isFinite(value.at) && Number.isFinite(value.expiresAt) &&
    Array.isArray(value.tools) && value.tools.length <= 64 && value.tools.every(x => /^[a-f0-9]{32}$/.test(x)) &&
    (value.waitingTools === undefined || (Array.isArray(value.waitingTools) && value.waitingTools.length <= 64 && value.waitingTools.every(x => /^[a-f0-9]{32}$/.test(x)))) &&
    Array.isArray(value.pastTurns) && value.pastTurns.length <= 8 && value.pastTurns.every(x => /^[a-f0-9]{32}$/.test(x)));
}

export function reduceEvent(previous, event) {
  if (!event) return previous;
  const old = validSnapshot(previous) && previous.session === event.session ? previous : null;
  if (old && event.at < old.at) return old;
  if (old && event.turn && event.turn !== old.turn && event.event !== 'UserPromptSubmit') return old;
  if (old && event.event === 'UserPromptSubmit' && old.pastTurns.includes(event.turn)) return old;
  if (old && event.event === 'UserPromptSubmit' && event.turn === old.turn) return old;
  if (old?.terminal && event.turn === old.turn && !['UserPromptSubmit','SessionStart','SessionEnd'].includes(event.event)) return old;
  if (old?.terminal && event.event === 'UserPromptSubmit' && event.turn === old.turn) return old;
  const freshTurn = event.event === 'UserPromptSubmit' && old?.turn !== event.turn;
  const state = {
    version: 1, session: event.session, turn: event.turn ?? old?.turn ?? null,
    phase: old?.phase ?? 'idle', at: event.at, expiresAt: event.at + ACTIVE_TTL,
    tools: freshTurn ? [] : [...(old?.tools ?? [])],
    waitingTools: freshTurn ? [] : [...(old?.waitingTools ?? [])],
    pastTurns: freshTurn && old?.turn ? [...old.pastTurns,old.turn].slice(-8) : [...(old?.pastTurns ?? [])],
    terminal: freshTurn ? false : old?.terminal === true,
  };
  switch (event.event) {
    case 'SessionStart':
      // A resumed window is not evidence that a new task has started.
      if (old && old.expiresAt > event.at) return old;
      state.phase='idle'; state.tools=[]; state.waitingTools=[]; state.terminal=true; break;
    case 'UserPromptSubmit': state.phase='thinking'; state.terminal=false; break;
    case 'PreToolUse':
      if (event.tool && !state.tools.includes(event.tool) && state.tools.length < 64) state.tools.push(event.tool);
      state.phase=state.waitingTools.length ? 'waiting' : 'working'; state.terminal=false; break;
    case 'PermissionRequest':
      if(event.tool && !state.waitingTools.includes(event.tool) && state.waitingTools.length<64)state.waitingTools.push(event.tool);
      state.phase='waiting'; state.terminal=false; break;
    case 'PostToolUse':
      state.tools=state.tools.filter(x => x !== event.tool);
      state.waitingTools=state.waitingTools.filter(x=>x!==event.tool);
      state.phase=state.waitingTools.length ? 'waiting' : event.failed ? 'confused' : state.tools.length ? 'working' : 'thinking';
      state.terminal=false;
      // A tool error is temporary; it does not mean the whole task has failed.
      if (event.failed && state.phase==='confused') state.recoverAt=event.at+4000;
      break;
    case 'PreCompact': case 'PostCompact': state.phase=state.waitingTools.length ? 'waiting' : 'thinking'; state.terminal=false; break;
    case 'Stop': state.phase='happy'; state.tools=[]; state.waitingTools=[]; state.terminal=true; state.expiresAt=event.at+6500; break;
    case 'Interrupt': case 'SessionEnd': state.phase='idle'; state.tools=[]; state.waitingTools=[]; state.terminal=true; state.expiresAt=event.at+1000; break;
  }
  return state;
}

export function selectDisplay(snapshots, now = Date.now()) {
  const priority={waiting:6,working:5,thinking:4,confused:3,happy:2,idle:1};
  const current=snapshots.filter(s => validSnapshot(s) && s.at <= now + 5000 && s.expiresAt > now).map(s => {
    const phase=s.phase === 'confused' && Number.isFinite(s.recoverAt) && s.recoverAt <= now ? (s.tools.length ? 'working' : 'thinking') : s.phase;
    return {...s,phase};
  });
  current.sort((a,b) => priority[b.phase]-priority[a.phase] || b.at-a.at);
  const selected=current[0];
  return {phase:selected?.phase ?? 'idle',active:current.filter(x => !x.terminal).length,updatedAt:selected?.at ?? null};
}
