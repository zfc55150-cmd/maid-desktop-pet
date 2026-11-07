'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{apply,metadata}=require('./media-additions.cjs'),{sha}=require('./app/file-integrity.cjs');
test('dedicated frontal media updates independent metadata without writing the linked baseline',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'gpt-frontal-addition-')),base=path.join(temp,'base'),out=path.join(temp,'candidate');fs.mkdirSync(base);fs.mkdirSync(out);
 const {manifest}=require('./performance-fixture.cjs'),legacy=structuredClone(manifest);delete legacy.states.frontlanding;delete legacy.clipEntryPoses.frontlanding;delete legacy.clipExitPoses.frontlanding;delete legacy.menuGroups.frontlanding;delete legacy.returnPoses.frontlanding;delete legacy.transitionClips.frontpose;
 const values=[legacy,{clips:{frontpose:{frames:180,fps:30,file:'media/frontpose.webm'}}},{size:384,threshold:10,entries:{frontpose:{frames:180}}}];
 try{for(const [i,n]of metadata.entries()){fs.writeFileSync(path.join(base,n),JSON.stringify(values[i]));fs.linkSync(path.join(base,n),path.join(out,n));}const before=metadata.map(n=>sha(path.join(base,n))),result=apply(base,out),a=JSON.parse(fs.readFileSync(path.join(out,'animation.json')));assert.deepEqual(metadata.map(n=>sha(path.join(base,n))),before);assert.equal(a.transitionClips.frontpose,'frontlanding');assert.equal(a.states.frontlanding.frames,90);const landing=result.receipts.find(r=>r.id==='frontlanding');assert.equal(landing.userVisualAcceptance,false);assert.equal(result.frames,180+result.receipts.reduce((n,r)=>n+r.frames,0));assert.equal(sha(path.join(out,'media/frontlanding.webm')),landing.videoSha256);assert.equal(sha(path.join(out,'hit-masks/frontlanding.bin')),landing.maskSha256);
  const ids=['csoftbreathblink','ctailtipsettle','cbrushfringe','chandsrest','csmallweightsettle','cnoticeuser','csuppressedyawn'];
  for(const id of ids){assert.equal(a.idleInteractionPool.filter(n=>n===id).length,1);assert(a.states[id].idleCooldownMs>=90000);assert.equal(a.clipEntryPoses[id],'C');assert.equal(a.clipExitPoses[id],'C');assert.equal(a.returnPoses[id],'frontidle');assert.equal(a.states[id].loop,false);}
  assert(!a.idleInteractionPool.includes('frontlanding'));for(const name of ['clistenear','bridgebtoa','bridgeatoc'])assert(!a.states[name]);
  const catalog=require('./app/performance-catalog.js'),clips=Object.fromEntries(Object.entries(a.states).map(([id,s])=>[id,{frames:s.frames,fps:s.fps||30,loop:!!s.loop}]));catalog.configure(a);
  for(const id of ids){assert.deepEqual(catalog.plan('clip:'+id,clips).map(s=>s.clip),[id,'frontidle']);assert(catalog.automatic.some(row=>row.clip===id));}
 }
 finally{assert(path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(temp,{recursive:true,force:true});}
});
