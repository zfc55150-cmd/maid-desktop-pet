'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{ProductHost,publicQuota}=require('./app/product-host.cjs');
function fixture(){const root=fs.mkdtempSync(path.resolve('work/product-host-test-'));fs.mkdirSync(path.join(root,'assets'));fs.writeFileSync(path.join(root,'assets/quotes.json'),JSON.stringify({quotes:['第一句','第二句']}));const host=new ProductHost({root,dataDir:path.join(root,'state'),serviceRoot:root,testOnly:true});return {root,host,close(){assert(root.startsWith(path.resolve('work')+path.sep));fs.rmSync(root,{recursive:true,force:true});}};}
test('product preferences retain form, readonly snapshots expose no account identifiers and invalid edits are rejected',async()=>{const f=fixture();try{await f.host.start();assert.equal(f.host.snapshot().prefs.form,'full');f.host.setForm('bust');assert.equal(f.host.snapshot().prefs.form,'bust');f.host.update({scale:1.6,followHost:false,soundOn:false});assert.equal(f.host.prefs().scale,1.6);assert.equal(f.host.safeAudio().enabled,false);assert.throws(()=>f.host.update({unknown:'bad'}));assert.throws(()=>f.host.update({scale:20}));const result=publicQuota({ok:true,queryOk:true,accountKey:'FAKE-SENSITIVE',authToken:'FAKE-KEY',windows:[{label:'5小时',remaining:35,resetsAt:1234,secret:'NO'}]});assert(!JSON.stringify(result).includes('FAKE'));assert.equal(result.windows[0].remaining,35);assert.equal((await f.host.refresh()).testOnly,true);}finally{await f.host.close();f.close();}});
test('quotes remain local and consecutive selections do not repeat; observation pause uses existing flag',()=>{const f=fixture();try{const a=f.host.nextQuote(),b=f.host.nextQuote();assert.notEqual(a,b);f.host.saveQuotes(['我的语录']);assert.equal(f.host.nextQuote(),'我的语录');f.host.setObservationPaused(true);assert.equal(f.host.prefs().observationPaused,true);assert.equal(f.host.tick().task.phase,'idle');f.host.setObservationPaused(false);assert.equal(f.host.prefs().observationPaused,false);}finally{f.close();}});
test('publicQuota exposes Codex connection, plan and balance amounts while scrubbing secrets, and followHost stays off',()=>{
 const f=fixture();
 try{
  const q=publicQuota({ok:true,queryOk:true,authType:'chatgpt',planLabel:'Plus',planKnown:true,accountKey:'SECRET-ACCT',error:'should-hide',windows:[{kind:'individual',label:'个人额度',remaining:60,used:40,total:100,amountUsed:40,amountRemaining:60,resetsAt:2000}]});
  assert.equal(q.connected,true);
  assert.equal(q.authType,'chatgpt');
  assert.equal(q.planLabel,'Plus');
  assert.equal(q.windows[0].kind,'individual');
  assert.equal(q.windows[0].total,100);
  assert.equal(q.windows[0].amountUsed,40);
  assert.equal(q.windows[0].amountRemaining,60);
  assert(!JSON.stringify(q).includes('SECRET'));
  const fail=publicQuota({ok:false,queryOk:false,authType:'apiKey',errorCode:'AUTH_MODE_UNSUPPORTED',error:'请在 Codex 中使用 ChatGPT 账号登录 sk-secret1234567890'});
  assert.equal(fail.connected,false);
  assert.equal(fail.errorCode,'AUTH_MODE_UNSUPPORTED');
  assert.equal(fail.errorMessage,'');
  const cleanFail=publicQuota({ok:false,queryOk:false,authType:'apiKey',errorCode:'AUTH_MODE_UNSUPPORTED',error:'请在 Codex 中使用 ChatGPT 账号登录（API Key 不提供订阅额度）'});
  assert.equal(cleanFail.errorMessage,'请在 Codex 中使用 ChatGPT 账号登录（API Key 不提供订阅额度）');
  assert.throws(()=>f.host.update({followHost:true}),/INVALID_PREFERENCE/);
  assert.equal(f.host.prefs().followHost,false);
  const stateDir=path.join(f.root,'state2');
  fs.mkdirSync(stateDir,{recursive:true});
  fs.writeFileSync(path.join(stateDir,'settings.json'),JSON.stringify({followHost:true,scale:1.2}));
  const prod=new ProductHost({root:f.root,dataDir:stateDir,serviceRoot:f.root,testOnly:false});
  assert.equal(prod.prefs().followHost,false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(stateDir,'settings.json'),'utf8')).followHost,false);
  assert.equal(prod.snapshot().codex.connected,false);
 }finally{f.close();}
});
