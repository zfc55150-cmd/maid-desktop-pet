'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const i18n=require('./app/i18n.js'),{ProductHost}=require('./app/product-host.cjs'),catalog=require('./app/performance-catalog.js'),{manifest}=require('./performance-fixture.cjs'),appearance=require('./app/appearance.cjs'),{menuSize}=require('./app/menu-popup.cjs'),releaseNotice=require('./services/release-notice.cjs');

test('i18n resolves explicit, env, and system locales and Japanese font chains',()=>{
 assert.equal(i18n.resolveLanguage('ja',{systemLocale:'zh-CN'}),'ja');
 assert.equal(i18n.resolveLanguage('zh-CN',{systemLocale:'ja-JP'}),'zh-CN');
 assert.equal(i18n.resolveLanguage('auto',{env:{},systemLocale:'ja-JP'}),'ja');
 assert.equal(i18n.resolveLanguage('auto',{env:{LANG:'ja_JP.UTF-8'},systemLocale:'en-US'}),'ja');
 assert.equal(i18n.resolveLanguage('auto',{env:{GPT_NIANG_LANG:'zh-CN'},systemLocale:'ja-JP'}),'zh-CN');
 assert.equal(i18n.intlLocale('ja'),'ja-JP');
 assert.equal(i18n.intlLocale('zh-CN'),'zh-CN');
 const bubbleFonts=i18n.fontStack('ja','bubble');
 assert(bubbleFonts.includes('ShangshouSoftCandy'));
 assert(bubbleFonts.includes('Yu Gothic UI'));
 assert(bubbleFonts.includes('Hiragino Kaku Gothic ProN'));
});

test('ProductHost persists language preference, resolves auto language, and validates allowed values',()=>{
 fs.mkdirSync(path.resolve('work'),{recursive:true});
 const root=fs.mkdtempSync(path.resolve('work/i18n-host-test-'));
 try{
  const host=new ProductHost({root,dataDir:path.join(root,'state'),serviceRoot:root,testOnly:true,systemLocale:'ja-JP'});
  assert.equal(host.prefs().language,'auto');
  assert.equal(host.prefs().resolvedLanguage,'ja');
  assert.equal(host.snapshot().resolvedLanguage,'ja');
  assert.equal(host.defaultCharacterName(),'ChatGPT ツンデレ竜娘');
  host.update({language:'zh-CN'});
  assert.equal(host.prefs().language,'zh-CN');
  assert.equal(host.prefs().resolvedLanguage,'zh-CN');
  assert.equal(host.defaultCharacterName(),'ChatGPT 傲娇龙娘');
  host.update({language:'ja'});
  assert.equal(host.prefs().resolvedLanguage,'ja');
  const quote=host.nextQuote();
  assert(i18n.DEFAULT_QUOTES_JA.includes(quote));
  assert.throws(()=>host.update({language:'en'}),/INVALID_PREFERENCE/);
 }finally{
  assert(root.startsWith(path.resolve('work')+path.sep));
  fs.rmSync(root,{recursive:true,force:true});
 }
});

test('performance catalog preserves clip IDs and Chinese defaults while providing Japanese labels and 32 quotes',()=>{
 const m={...manifest,states:{...manifest.states,dragonflame:{frames:90,fps:30,label:'龙焰失控',loop:false}}};
 catalog.configure(m);
 assert(catalog.actions.some(a=>a.clip==='dragonflame'&&a.label==='龙焰失控'&&a.group==='玩耍'));
 const jaActions=catalog.getActions('ja');
 assert.equal(new Set(jaActions.map(a=>a.group)).size,9);
 assert(jaActions.some(a=>a.clip==='dragonflame'&&a.name==='clip:dragonflame'&&a.label==='竜炎うっかり暴走'&&a.group==='遊び'));
 for(const clip of Object.keys(i18n.ACTION_QUOTES_JA)){
  const jaQuote=catalog.actionQuote('clip:'+clip,'ja');
  const zhQuote=catalog.actionQuote('clip:'+clip,'zh-CN');
  assert.equal(typeof jaQuote,'string');
  assert.notEqual(jaQuote,zhQuote);
 }
 assert.equal(catalog.actionQuote('clip:frontidle','ja'),null);
 catalog.setLanguage('ja');
 assert(catalog.actions.some(a=>a.clip==='dragonflame'&&a.label==='竜炎うっかり暴走'&&a.group==='遊び'));
 assert(catalog.selectable.some(a=>a.clip==='dragonflame'&&a.label==='竜炎うっかり暴走'&&a.group==='その他のアクション'));
 catalog.setLanguage('zh-CN');
 assert(catalog.actions.some(a=>a.clip==='dragonflame'&&a.label==='龙焰失控'&&a.group==='玩耍'));
});

test('appearance palettes match Japanese triggers, menuSize caps at 260, and releaseNotice localizes cleanly',()=>{
 assert.deepEqual(appearance.palette('クロードに記憶圧縮された'),appearance.palette('克劳德压缩'));
 assert.deepEqual(appearance.palette('ジェミニのライバルに浮気？'),appearance.palette('Gemini吃醋'));
 assert.deepEqual(appearance.palette('ディープシークのクジラにご飯'),appearance.palette('DeepSeek鲸白饭'));
 assert.deepEqual(appearance.palette('トークン残高と課金'),appearance.palette('token额度充值'));
 assert.equal(menuSize([{label:'1234567890'}],{width:1280,height:800},1).width,192);
 assert.equal(menuSize([{label:'12345678901234567890'}],{width:1280,height:800},1).width,260);
 const jaStatus=releaseNotice.formatReleaseStatusText({phase:'available',latestTag:'v1.2.0'},'v1.0.0','ja');
 assert(jaStatus.includes('v1.2.0')&&(jaStatus.includes('最新リリース')||jaStatus.includes('新バージョン')));
 const zhStatus=releaseNotice.formatReleaseStatusText({phase:'available',latestTag:'v1.2.0'},'v1.0.0');
 assert(zhStatus.includes('本仓库新版本'));
 assert.deepEqual(appearance.palette('ちょっと待って'),appearance.palette(''));
 assert.deepEqual(appearance.palette('キャッチして'),appearance.palette(''));
});
