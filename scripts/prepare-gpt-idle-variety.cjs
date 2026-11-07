'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),base=path.join(root,'work/gpt-gentle-takeoff-20261102-01'),out=path.join(root,'work/gpt-idle-variety-20261102-01');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const put=(p,v)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,v)};
const save=(p,v)=>put(p,JSON.stringify(v,null,2)+'\n');
assert(!fs.existsSync(out),'Fresh package required');
const m=read(path.join(base,'deployment.json')),live=m.targetRoot,target='runtime/dragon-animation/animation.json';
const expected=new Map([...m.hostFiles,...m.files].map(e=>[e.target,e.sha256]));
for(const [n,h]of expected)assert.equal(hash(path.join(live,n)),h,'Installed baseline drift: '+n);
for(const e of [...m.stableHostFiles,...m.stableAgent.files])assert.equal(hash(path.join(m.stableAgent.targetRoot,e.target)),e.sha256);
const old=read(path.join(live,target)),motion=structuredClone(old);
motion.releaseVersion='0.7.3-idle-variety.1';
motion.idleInteractionPool=['proudarms','stretching','lookaround','sleeveside','wave','happy','tea','walking','complimentavert','skirtbeat','bow','flutterplay','frontpose','challengeaccept'];
motion.idleRhythmPolicies={quiet:{minGapMs:24000,maxGapMs:40000,chance:0.2},natural:{minGapMs:12000,maxGapMs:24000,chance:0.35}};
const cooldowns={tea:120000,walking:90000,complimentavert:150000,skirtbeat:150000,bow:90000,flutterplay:90000,frontpose:90000,challengeaccept:120000};
for(const [name,ms]of Object.entries(cooldowns)){
 assert.equal(motion.clipEntryPoses[name],'C');assert.equal(motion.clipExitPoses[name],'C');
 assert.equal(motion.returnPoses[name],'frontidle');assert.notEqual(motion.propPolicies[name],'held-prop-fade');
 motion.states[name].idleCooldownMs=ms;
 motion.idleInteractionEntryPoses[name]=['frontidle'];
}
assert.equal(Object.keys(motion.states).length,43);
for(const [name,state]of Object.entries(old.states)){
 const candidate=structuredClone(motion.states[name]);
 if(name in cooldowns){if('idleCooldownMs'in state)candidate.idleCooldownMs=state.idleCooldownMs;else delete candidate.idleCooldownMs;}
 assert.deepEqual(candidate,state,'Media or label changed: '+name);
}
save(path.join(out,'files',target),motion);put(path.join(out,'baseline-animation.json'),fs.readFileSync(path.join(live,target)));
save(path.join(root,'integrations/gpt-niang/idle-variety/animation.json'),motion);
const proof={humanMessage:'好的，你现在把已有的好的素材先用起来吧，就是要像deepseek的一样，可以自己选择播放动作，也可以自己待机时随机播放动作',scope:'Existing approved installed media; manual selection and automatic idle variety; restart for authorized installation',newGeneration:false,baselinePackage:path.relative(root,base),preservedFiles:expected.size-1,poolBefore:old.idleInteractionPool,poolAfter:motion.idleInteractionPool,cooldowns,excluded:['flutter:drag-only','draglanding:landing-only','fanmishap:held-prop-manual','lanterninvite:held-prop-manual','bodybalance:strong-interaction-manual','six-new-Gemini-clips:prior-60fps-decision-pending']};
save(path.join(out,'trial.json'),proof);
m.version=motion.releaseVersion;m.files=[{target,previousSha256:expected.get(target),sha256:hash(path.join(out,'files',target))}];
m.hostFiles=[...expected].filter(([n])=>n!==target).map(([target,sha256])=>({target,sha256}));
save(path.join(out,'deployment.json'),m);
const names=['apply-update.ps1','maintenance-runner.ps1','verify-installed.cjs','merge-hooks.cjs','dragon-hooks.json','agent-files/update-helper.ps1'];
for(const n of names)put(path.join(out,n),fs.readFileSync(path.join(base,n)));
save(path.join(out,'package-integrity.json'),{schema:1,files:[...names,'deployment.json','trial.json','files/'+target].map(n=>({path:n,sha256:hash(path.join(out,n))}))});
const template=fs.readFileSync(path.join(root,'integrations/gpt-niang/animated/reviewed-delta.ps1'),'utf8');
assert.equal(template.split('__INDEX_SHA__').length,2);put(path.join(out,'reviewed-delta.ps1'),template.replace('__INDEX_SHA__',hash(path.join(out,'package-integrity.json'))));
console.log(JSON.stringify({out,version:m.version,changedFiles:m.files,automaticActions:motion.idleInteractionPool.length,preservedFiles:m.hostFiles.length}));
