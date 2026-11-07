const {test}=require('node:test'),assert=require('node:assert/strict'),{busy}=require('./review-session.cjs');
const ready=()=>({at:Date.now(),dragonMotion:{phase:'idle'},motion:{active:false},scene:{open:false},music:{enabled:false},character:{galleryOpen:false},sound:{press:{configured:false,active:true}}});
test('idle gate rejects task, interaction, stale heartbeat and active configured audio',()=>{
 assert.equal(busy(ready()),null);for(const phase of ['thinking','working','waiting'])assert.equal(busy({...ready(),dragonMotion:{phase}}),'TASK_ACTIVE');assert.equal(busy({...ready(),at:0}),'STALE_PRESENCE');assert.equal(busy({...ready(),motion:{active:true}}),'INTERACTION_ACTIVE');assert.equal(busy({...ready(),sound:{press:{configured:true,active:true}}}),'AUDIO_ACTIVE');
});
test('display support can proceed during observed Codex activity but still rejects input/audio',()=>{
 assert.equal(busy({...ready(),dragonMotion:{phase:'thinking'}},{allowTaskDisplay:true}),null);
 assert.equal(busy({...ready(),motion:{active:true}},{allowTaskDisplay:true}),'INTERACTION_ACTIVE');
 assert.equal(busy({...ready(),sound:{press:{configured:true,active:true}}},{allowTaskDisplay:true}),'AUDIO_ACTIVE');
});
