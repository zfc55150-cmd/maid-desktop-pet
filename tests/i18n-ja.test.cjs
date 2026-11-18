'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { resolveLanguage, ChatConfigStore } = require('../app/electron-helper/chat-config-store.js');
const { classify, forgetAll } = require('../app/electron-helper/auto-memory.js');
const { ChatService, DEFAULT_PROMPT_JA } = require('../app/electron-helper/simple-chat-service.js');
const { formatReleaseStatusText } = require('../app/electron-helper/release-notice.js');
const PetShared = require('../integrations/gpt-niang/product-electron/app/vendor/shared-core.js');

test('resolveLanguage and ChatConfigStore persist language preference', () => {
  assert.equal(resolveLanguage('auto', 'ja-JP'), 'ja');
  assert.equal(resolveLanguage('auto', 'zh-CN'), 'zh-CN');
  assert.equal(resolveLanguage('ja', 'zh-CN'), 'ja');
  assert.equal(resolveLanguage('zh-CN', 'ja-JP'), 'zh-CN');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-i18n-'));
  try {
    const store = new ChatConfigStore({ dir, allowFirstUse: true });
    store.update(data => ({ ...data, language: 'ja' }));
    assert.equal(store.read().data.language, 'ja');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('auto-memory classifies Japanese privacy, remember, forget, correction, and forgetAll commands', () => {
  assert.equal(classify('パスワードは123456です').private, true);
  assert.equal(classify('このことは覚えないで').noAdd, true);
  assert.equal(classify('さっきの記憶を消して').noAdd, true);
  assert.equal(classify('これからはご主人様と呼んで、覚えてね').priority, true);
  assert.equal(forgetAll('すべての長期記憶を消して！'), true);
  assert.equal(forgetAll('長期記憶を全部忘れて'), true);
});

test('shared-core buildMenuTree localizes categories and animations to Japanese while preserving Chinese anim keys', () => {
  const tree = PetShared.buildMenuTree({
    idle: ['待机呼吸休闲'],
    turn: [],
    drag: [],
    clicks: [],
    moves: { actions: [] },
    categories: [{ id: '小动作', weight: 10, actions: ['整理额发'] }],
    events: { workStatus: ['认真工作'], whisper: ['摸鱼中'] }
  }, 'ja');
  assert.equal(tree[0].label, 'アクション');
  const idleGroup = tree[0].children.find(c => c.label === '待機');
  assert(idleGroup);
  assert.equal(idleGroup.children[0].anim, '待机呼吸休闲');
  assert.notEqual(idleGroup.children[0].label, '待机呼吸休闲');
});

test('ChatService switches default prompt and release notice text in Japanese mode', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-chat-ja-'));
  try {
    const svc = new ChatService({ dir, allowFirstUse: true, localeHint: 'ja-JP' });
    const snap = svc.snapshot();
    assert.equal(snap.resolvedLanguage, 'ja');
    assert.equal(snap.prompt, DEFAULT_PROMPT_JA);
    const status = formatReleaseStatusText({ phase: 'available', latestTag: 'v1.1.0' }, 'v1.0.4', 'ja');
    assert(status.includes('v1.1.0'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
