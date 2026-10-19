const path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'work/voice-smoke');fs.mkdirSync(out,{recursive:true});
const installed=process.argv[2];if(!installed)throw new Error('Explicit installed program path required');
const {PetSpeech}=require(path.join(installed,'node_modules/dsh-pet/runtime/electron-helper/pet-speech'));
const log=require(path.join(installed,'node_modules/dsh-pet/runtime/electron-helper/voice-log')).createVoiceLogger(out);
const speech=new PetSpeech(undefined,{root:path.join(installed,'voice-runtime'),log,timeoutMs:180000});
const result={paidApi:false,realLocalVoice:true,events:[]};
(async()=>{
 try {
  const start=Date.now();await speech.warmup();result.warmupSeconds=(Date.now()-start)/1000;
  console.log(JSON.stringify({stage:'warm',seconds:result.warmupSeconds}));
  const job=speech.begin(e=>result.events.push(e.event));job.append('你好，我在这里陪你。','你好，我在这里陪你。');job.end();
  const complete=await job.done;assert.equal(complete.stopped,false);assert.ok(result.events.includes('caption'));assert.ok(result.events.includes('playing'));
  result.completed=true;console.log(JSON.stringify({stage:'played',events:result.events}));
 } finally {speech.dispose();result.workerDisposed=speech.worker===null;fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
