'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const {ChatService} = require('../app/electron-helper/simple-chat-service');
const {applyOperations, classify} = require('../app/electron-helper/auto-memory');
const secrets = {decryptString: () => 'sk-' + 'FAKE-MEMORY-TEST-ONLY', isEncryptionAvailable: () => true, encryptString: s => Buffer.from(s)};
const opsResponse = (ops, reason = 'stop') => new Response(JSON.stringify({choices: [{message: {content: JSON.stringify(ops)}, finish_reason: reason}]}));
const empty = () => ({add: [], remove: []});

function fixture(t, {data = {}, memoryFetch} = {}) {
  const dir = fs.mkdtempSync(path.join(root, '.test-data-memory-'));
  const file = path.join(dir, 'chat.json');
  fs.writeFileSync(file, JSON.stringify({key: 'SYNTHETIC', prompt: 'Synthetic persona', memory: '', messages: [], ...data}));
  const timers = new Map(), requests = []; let serial = 0;
  const service = new ChatService({dir, secrets, requireExisting: true,
    memoryOptions: {setTimer(fn, delay) { const id = ++serial; timers.set(id, {fn, delay}); return id; }, clearTimer(id) { timers.delete(id); }},
    fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body); requests.push(body);
      if (body.response_format) return memoryFetch ? memoryFetch(body, options) : opsResponse(empty());
      return new Response('data: ' + JSON.stringify({choices: [{delta: {content: 'Synthetic reply'}, finish_reason: 'stop'}]}) + '\n\ndata: [DONE]\n\n');
    }});
  t.after(async () => {
    service.dispose();
    if(service.memoryWorker.task) await service.memoryWorker.task;
    assert.ok(path.resolve(dir).startsWith(root + path.sep + '.test-data-memory-'));
    fs.rmSync(dir, {recursive: true, force: true});
  });
  const read = () => JSON.parse(fs.readFileSync(file, 'utf8'));
  const save = input => service.save({apiKey: '', prompt: service.state().prompt, revision: service.revision, ...input});
  return {service, file, dir, read, save, timers, requests, memoryRequests: () => requests.filter(r => r.response_format), send: text => service.send(text, () => {}), run: () => service.memoryWorker.run()};
}

test('upgrade enables automatic memory without mining pre-upgrade history', async t => {
  const f = fixture(t, {data: {messages: [{role: 'user', content: 'legacy private preference'}, {role: 'assistant', content: 'legacy claim'}]}});
  assert.equal(f.service.state().autoMemoryEnabled, true);
  assert.equal(await f.run(), false); assert.equal(f.requests.length, 0); assert.equal(f.timers.size, 0);
});

test('four new turns batch in the background without delaying normal replies', async t => {
  const f = fixture(t);
  await f.send('我平时喜欢茶。'); assert.equal([...f.timers.values()][0].delay, 120000);
  for (let i = 0; i < 3; i++) await f.send('普通聊天 ' + i);
  assert.equal(f.requests.length, 4); assert.equal(f.memoryRequests().length, 0);
  assert.equal([...f.timers.values()][0].delay, 15000);
  await f.run(); assert.equal(f.memoryRequests().length, 1); assert.equal(f.read().memoryCursor, 4);
});

test('explicit remember and forget commands get priority', async t => {
  const f = fixture(t); await f.send('记住，我喜欢喝茶。');
  assert.equal([...f.timers.values()][0].delay, 1000);
  await f.send('忘掉我喜欢喝茶这件事。'); assert.equal([...f.timers.values()][0].delay, 1000);
});

test('grounded memory is saved and used in the next conversation', async t => {
  const f = fixture(t, {memoryFetch: () => opsResponse({add: [{text: '用户喜欢喝茶。', evidence: '我喜欢喝茶'}], remove: []})});
  await f.send('记住，我喜欢喝茶。'); await f.run();
  assert.equal(f.read().memory, '用户喜欢喝茶。'); assert.ok(f.read().memoryUpdatedAt);
  await f.send('你好'); assert.match(f.requests.at(-1).messages[0].content, /用户喜欢喝茶/);
});

test('assistant text and old messages cannot serve as evidence', async t => {
  const f = fixture(t, {data: {messages: [{role: 'user', content: '我喜欢咖啡'}, {role: 'assistant', content: '你一定喜欢猫'}]}, memoryFetch: () => opsResponse({add: [{text: '用户喜欢猫。', evidence: '你一定喜欢猫'}, {text: '用户喜欢咖啡。', evidence: '我喜欢咖啡'}], remove: []})});
  await f.send('今天天气很好'); await f.run(); assert.equal(f.read().memory, '');
  const input = JSON.parse(f.memoryRequests()[0].messages[1].content);
  assert.equal(JSON.stringify(input).includes('咖啡'), false); assert.equal(JSON.stringify(input).includes('喜欢猫'), false);
});

test('explicit correction removes exact old fact and adds grounded replacement', async t => {
  const f = fixture(t, {data: {memory: '用户喜欢咖啡。\n用户喜欢安静。'}, memoryFetch: () => opsResponse({remove: [{text: '用户喜欢咖啡。', evidence: '我现在不喜欢咖啡了'}], add: [{text: '用户现在喜欢喝茶。', evidence: '以后改喝茶'}]})});
  await f.send('我现在不喜欢咖啡了，以后改喝茶。'); await f.run();
  assert.equal(f.read().memory, '用户喜欢安静。\n用户现在喜欢喝茶。');
});

test('forget evidence can remove a fact but cannot immediately re-add it', async t => {
  const f = fixture(t, {data: {memory: '用户喜欢喝茶。'}, memoryFetch: () => opsResponse({remove: [{text: '用户喜欢喝茶。', evidence: '别记我喜欢喝茶这件事'}], add: [{text: '用户喜欢喝茶。', evidence: '我喜欢喝茶'}]})});
  await f.send('别记我喜欢喝茶这件事。'); await f.run(); assert.equal(f.read().memory, '');
  await f.send('普通新消息'); await f.run(); assert.equal(f.read().memory, '');
});

test('do not remember this marks the prior turn as ineligible for additions', async t => {
  const f = fixture(t, {memoryFetch: () => opsResponse({remove: [], add: [{text: '用户喜欢动漫。', evidence: '我喜欢动漫'}]})});
  await f.send('我喜欢动漫'); await f.send('别记这个'); await f.run();
  assert.equal(f.read().memory, ''); assert.equal(f.read().messages[0].memoryNoAdd, true);
});

test('pronoun forget requests can use reference-only context without re-learning it', async t => {
  const f = fixture(t, {data: {memory: '用户喜欢喝茶。'}, memoryFetch: body => {
    const input = JSON.parse(body.messages[1].content);
    if(input.new_user_messages[0].text==='忘掉这件事') assert.equal(input.reference_only, '我喜欢喝茶');
    return opsResponse({add: [{text: '用户喜欢喝茶。', evidence: '我喜欢喝茶'}], remove: input.new_user_messages[0].text==='忘掉这件事' ? [{text: '用户喜欢喝茶。', evidence: '忘掉这件事'}] : []});
  }});
  await f.send('我喜欢喝茶'); await f.run(); await f.send('忘掉这件事'); await f.run(); assert.equal(f.read().memory, '');
});

test('obvious secrets are excluded without any extra API request', async t => {
  const f = fixture(t); await f.send('我的验证码是123456，记住它。'); await f.run();
  assert.equal(f.memoryRequests().length, 0); assert.equal(f.read().memoryCursor, 1);
  assert.equal(classify('记住 sk-' + 'this-is-a-synthetic-long-secret').private, true);
});

test('manual edits cancel pending extraction and prevent deleted facts returning', async t => {
  let release; const f = fixture(t, {memoryFetch: () => new Promise(resolve => release = resolve)});
  await f.send('记住，我喜欢喝茶。'); const running = f.run(); await new Promise(r => setImmediate(r));
  f.save({memory: '用户喜欢安静。'}); release(opsResponse({add: [{text: '用户喜欢喝茶。', evidence: '我喜欢喝茶'}], remove: []}));
  assert.equal(await running, false); assert.equal(f.read().memory, '用户喜欢安静。'); assert.equal(f.read().memoryCursor, 1);
});

test('clearing history invalidates in-flight results without restoring old memory', async t => {
  let release; const f = fixture(t, {memoryFetch: () => new Promise(resolve => release = resolve)});
  await f.send('记住，我喜欢喝茶。'); const running = f.run(); await new Promise(r => setImmediate(r));
  f.service.clear({clearMemory: true, includeBackup: true}); release(opsResponse({add: [{text: '用户喜欢喝茶。', evidence: '我喜欢喝茶'}], remove: []}));
  await running; assert.equal(f.read().memory, ''); assert.equal(f.read().messages.length, 0); assert.equal(f.timers.size, 0);
});

test('switching off and back on does not backfill the disabled conversations', async t => {
  const f = fixture(t); await f.send('我喜欢喝茶'); f.save({autoMemoryEnabled: false});
  await f.send('我喜欢咖啡'); f.save({autoMemoryEnabled: true}); await f.run();
  assert.equal(f.memoryRequests().length, 0); assert.equal(f.read().memoryCursor, 2);
});

test('new chat aborts the background task and stale output is rejected', async t => {
  let release, aborted = false; const f = fixture(t, {memoryFetch: (_body, options) => {options.signal.addEventListener('abort', () => aborted = true); return new Promise(resolve => release = resolve);}});
  await f.send('我喜欢喝茶'); const running = f.run(); await new Promise(r => setImmediate(r));
  await f.send('新的对话'); assert.equal(aborted, true);
  release(opsResponse({add: [{text: '用户喜欢喝茶。', evidence: '我喜欢喝茶'}], remove: []})); await running;
  assert.equal(f.read().memory, ''); assert.equal(f.read().messages.length, 4);
});

test('malformed or truncated extraction does not affect chat and waits before retry', async t => {
  const f = fixture(t, {memoryFetch: () => opsResponse(empty(), 'length')});
  await f.send('我喜欢喝茶'); await f.run(); assert.equal(f.read().memory, ''); assert.equal(f.read().messages.length, 2);
  assert.equal(f.service.memoryWorker.status, 'error'); assert.ok([...f.timers.values()][0].delay >= 599000);
  assert.equal(f.service.state().memoryStatus, 'error');
});

test('opening settings pauses automatic jobs and closing resumes them', async t => {
  const f = fixture(t); await f.send('我喜欢喝茶'); f.service.setMemoryPaused(true);
  assert.equal(f.timers.size, 0); assert.equal(await f.run(), false);
  f.service.setMemoryPaused(false); assert.equal(f.timers.size, 1); await f.run(); assert.equal(f.memoryRequests().length, 1);
});

test('blank operations preserve manually formatted memory byte-for-byte', () => {
  const memory = '  用户喜欢茶。\r\n\r\n用户喜欢安静。  ';
  assert.equal(applyOperations(memory, empty(), []), memory);
});

test('memory cap never evicts existing user memory and duplicate facts are skipped', () => {
  const fact = '用户喜欢茶。';
  assert.equal(applyOperations(fact, {remove: [], add: [{text: '- 用户喜欢茶', evidence: '我喜欢茶'}]}, [{text: '我喜欢茶', allowAdd: true}]), fact);
  const memory = 'x'.repeat(5999);
  assert.equal(applyOperations(memory, {remove: [], add: [{text: '用户喜欢茶。', evidence: '我喜欢茶'}]}, [{text: '我喜欢茶', allowAdd: true}]), memory);
});

test('all-memory deletion is local and clears backup memory too', async t => {
  const f = fixture(t, {data: {memory: '用户喜欢茶。'}}); await f.send('忘掉所有长期记忆');
  assert.equal(f.read().memory, ''); assert.equal(JSON.parse(fs.readFileSync(f.file + '.bak', 'utf8')).memory, '');
  await f.run(); assert.equal(f.memoryRequests().length, 0); assert.equal(f.read().memoryCursor, 1);
});

test('disk failure while saving memory preserves normal chat and the old memory', async t => {
  const f = fixture(t, {memoryFetch: () => opsResponse({add: [{text: '用户喜欢茶。', evidence: '我喜欢茶'}], remove: []})});
  await f.send('我喜欢茶'); const original = f.service.store.writeAtomic;
  f.service.store.writeAtomic = () => {throw new Error('Synthetic disk failure');};
  assert.equal(await f.run(), false); f.service.store.writeAtomic = original;
  assert.equal(f.read().messages.length, 2); assert.equal(f.read().memory, '');
});
