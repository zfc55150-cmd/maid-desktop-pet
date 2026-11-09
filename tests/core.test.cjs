const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{EventEmitter}=require('node:events');
const root=path.resolve(__dirname,'..'),helper=path.join(root,'app/electron-helper');
const {ChatService}=require(helper+'/simple-chat-service');
const control=require(helper+'/local-control');
const {ChatConfigStore}=require(helper+'/chat-config-store');
const {AppearanceStore}=require(helper+'/pet-appearance-store');
const fakeSecrets={decryptString:()=> 'sk-SYNTHETIC-TEST-ONLY',isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s)};
function fixture(t,{fetchImpl,voiceEnabled=false}={}){
 const dir=fs.mkdtempSync(path.join(root,'.test-data-'));
 t.after(()=>{assert.ok(path.resolve(dir).startsWith(root+path.sep+'.test-data-'));fs.rmSync(dir,{recursive:true,force:true});});
 fs.writeFileSync(path.join(dir,'chat.json'),JSON.stringify({key:'SYNTHETIC',prompt:'Test persona',memory:'Remember test preference',autoMemoryEnabled:false,messages:[{role:'user',content:'old input'},{role:'assistant',content:'old reply'}],voiceEnabled}));
 const service=new ChatService({dir,secrets:fakeSecrets,requireExisting:true,fetchImpl:fetchImpl||reply('stop')});
 t.after(()=>service.dispose());
 return {dir,service,read:()=>JSON.parse(fs.readFileSync(path.join(dir,'chat.json'),'utf8')),backup:()=>JSON.parse(fs.readFileSync(path.join(dir,'chat.json.bak'),'utf8'))};
}
function reply(reason,content='Test response'){return async()=>new Response('data: '+JSON.stringify({choices:[{delta:{content},finish_reason:reason}]})+'\n\ndata: [DONE]\n\n');}
test('normal streaming response saves a complete turn',async t=>{const {service,read}=fixture(t);const r=await service.send('new',()=>{});assert.equal(read().messages.length,4);assert.equal(r.replyWarning,'');assert.equal(r.messages.at(-1).finishReason,'stop');});
test('length termination is explicitly incomplete',async t=>{const {service}=fixture(t,{fetchImpl:reply('length')});const r=await service.send('new',()=>{});assert.match(r.replyWarning,/长度上限/);assert.equal(r.messages.at(-1).incomplete,true);});
for(const reason of ['insufficient_system_resource','aborted','content_filter','tool_calls',null]){
 test('reject incomplete service termination '+reason,async t=>{const {service,read}=fixture(t,{fetchImpl:reply(reason)});await assert.rejects(service.send('new',()=>{}));assert.equal(read().messages.length,2);assert.equal(service.pending,null);});
}
test('network failure preserves disk data and can retry',async t=>{const {service,read}=fixture(t,{fetchImpl:async()=>{throw new TypeError('synthetic');}});await assert.rejects(service.send('new',()=>{}),/连接失败/);assert.equal(read().messages.length,2);service.fetchImpl=reply('stop');await service.send('retry',()=>{});assert.equal(read().messages.length,4);});
test('non-streaming finish reason is checked too',async t=>{const {service}=fixture(t,{fetchImpl:async()=>new Response(JSON.stringify({choices:[{message:{content:'answer'},finish_reason:'length'}]}))});const r=await service.send('new');assert.equal(r.messages.at(-1).incomplete,true);});
test('explicit memory is sent, edited and can be removed',async t=>{let body;const {service}=fixture(t,{fetchImpl:async(_u,o)=>{body=JSON.parse(o.body);return reply('stop')();}});await service.send('new',()=>{});assert.match(body.messages[0].content,/Remember test preference/);let s=service.state();service.save({apiKey:'',prompt:s.prompt,memory:'',revision:s.revision});await service.send('new',()=>{});assert.doesNotMatch(body.messages[0].content,/Remember test preference/);});
test('stale memory/settings save does not overwrite newer data',t=>{const {service}=fixture(t);const s=service.state();service.setVoice(true);assert.throws(()=>service.save({apiKey:'',prompt:s.prompt,memory:'changed',revision:s.revision}),/更新/);assert.equal(service.state().memory,'Remember test preference');});
test('default clear keeps recovery backup and memory',t=>{const {service,read,backup}=fixture(t);service.clear();assert.equal(read().messages.length,0);assert.equal(backup().messages.length,2);assert.equal(read().memory,'Remember test preference');});
test('privacy clear sanitizes both files and selected memory',t=>{const {service,read,backup}=fixture(t);service.clear({includeBackup:true,clearMemory:true});for(const data of [read(),backup()]){assert.deepEqual(data.messages,[]);assert.equal(data.memory,'');assert.equal(data.key,'SYNTHETIC');}});
test('stale clear cannot remove newer messages',t=>{const {service,read}=fixture(t);const revision=service.state().revision;service.setVoice(true);assert.throws(()=>service.clear({revision,includeBackup:true}),/更新/);assert.equal(read().messages.length,2);});
test('failed main-file commit retains valid config and sanitized backup',t=>{const {service,read,backup}=fixture(t);const original=service.store.writeAtomic.bind(service.store);service.store.writeAtomic=(file,...args)=>{if(file===service.file)throw Object.assign(new Error('synthetic'),{code:'ENOSPC'});return original(file,...args);};assert.throws(()=>service.clear({includeBackup:true,clearMemory:true}));assert.equal(read().messages.length,2);assert.deepEqual(backup().messages,[]);assert.equal(backup().memory,'');});
test('corrupt existing configuration is not replaced',t=>{const {service,dir}=fixture(t);fs.writeFileSync(path.join(dir,'chat.json'),'{broken');assert.throws(()=>service.setVoice(true),/损坏/);assert.equal(fs.readFileSync(path.join(dir,'chat.json'),'utf8'),'{broken');});

const token='a'.repeat(64);
function request(method='POST',url='/shutdown',headers={}){return{method,url,headers:{host:'127.0.0.1:3088','x-pet-control':token,...headers},socket:{localPort:3088}};}
test('control token, origin, host and browser metadata are checked',()=>{
 assert.equal(control.authorized(request(),token),true);
 for(const headers of [{'x-pet-control':''},{'x-pet-control':'b'.repeat(64)},{origin:'https://untrusted.invalid'},{host:'untrusted.invalid:3088'},{host:'127.0.0.1:3089'},{'sec-fetch-site':'cross-site'}])assert.equal(control.authorized(request('POST','/shutdown',headers),token),false);
});
function serverContext(){const source=fs.readFileSync(path.join(root,'app/standalone.mjs'),'utf8');const a=source.indexOf('const CORS_HEADERS ='),b=source.indexOf('async function listenStandaloneServer',a);const c={localControl:control,URL,Buffer,queueMicrotask,PORT_SCAN_LIMIT:25};vm.createContext(c);vm.runInContext(source.slice(a,b)+'\nthis.make=createRequestListener;this.bind=bindFirstFree;',c);return c;}
test('portable shutdown validates its own port without relaxing the installed default',t=>{
 const dir=fs.mkdtempSync(path.join(root,'.test-data-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 control.publish(dir,'a'.repeat(64),3089);
 assert.equal(control.readSession(dir,3089).pid,process.pid);
 assert.throws(()=>control.readSession(dir),/Invalid control session/);
 assert.throws(()=>control.readSession(dir,33889),/Invalid control session/);
});
test('shutdown requires POST and token; never advertises cross-origin access',async()=>{const c=serverContext();let stopped=0;const handler=c.make({routes:[],logger:{debug(){}},token,onShutdown(){stopped++;}});for(const [req,want]of [[request('GET'),405],[request('POST','/shutdown',{'x-pet-control':''}),403],[request(),200]]){let status,headers;handler(req,{writeHead(s,h){status=s;headers=h;},end(){}});assert.equal(status,want);assert.equal(headers['access-control-allow-origin'],undefined);}await Promise.resolve();assert.equal(stopped,1);});
test('unauthenticated config requests never reach mutation handlers',()=>{const c=serverContext();let invoked=false,status;const handler=c.make({routes:[{kind:'prefix',path:'/dsh-pet-7340',handler(){invoked=true;}}],logger:{debug(){}},token});handler(request('PUT','/dsh-pet-7340/config',{'x-pet-control':''}),{writeHead(s){status=s;},end(){}});assert.equal(status,403);assert.equal(invoked,false);});
test('occupied port cannot fall through to a second port',async()=>{const c=serverContext(),server=new EventEmitter();let calls=0;server.listen=()=>{calls++;queueMicrotask(()=>server.emit('error',Object.assign(new Error('occupied'),{code:'EADDRINUSE'})));};await assert.rejects(c.bind(server,3088,{warn(){}}),/未启动第二个实例/);assert.equal(calls,1);});

function installChat(service,home){const handlers=new Map(),events=[];const {pathToFileURL}=require('node:url');const sender={id:1,mainFrame:{routingId:2,processId:3},isDestroyed:()=>false,send:(_n,v)=>events.push(v)};const event={sender,senderFrame:{...sender.mainFrame,url:pathToFileURL(path.join(helper,'index.html')).href}};
 const speech={current:null,stops:0,status:()=> 'ready',stop(){this.stops++;this.current?.resolve({stopped:true});this.current=null;},begin(){let resolve;const done=new Promise(r=>resolve=r);this.current={resolve};return {done,append(){},end(){}};},dispose(){this.stop();},voiceSettings:()=>({})};
 let stop;
 const api=require(helper+'/simple-chat-main')({app:{on(_name,fn){stop=fn;},getPath(){return home;}},ipcMain:{handle:(n,f)=>handlers.set(n,f)},safeStorage:fakeSecrets,BrowserWindow:function(){},clipboard:{writeText(){}}},new Map([[1,{isDestroyed:()=>false,webContents:sender}]]),{service,speech});
 return {events,speech,api,stop,call:(name,arg)=>handlers.get('simple-chat:'+name)(event,arg)};
}
test('fresh portable profile can save its first key through the real chat IPC',async t=>{
 const home=fs.mkdtempSync(path.join(root,'.test-data-'));
 const env=process.env.DSH_HOME;process.env.DSH_HOME=home;
 const ui=installChat(undefined,home);
 t.after(()=>{ui.stop();if(env===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=env;fs.rmSync(home,{recursive:true,force:true});});
 const state=await ui.call('state');
 assert.equal(state.ok,true);
 assert.equal(state.data.hasKey,false);
 assert.equal(state.data.revision,null);
 const key='sk-FAKE-PORTABLE-KEY';
 const saved=await ui.call('save',{apiKey:key,prompt:state.data.prompt,revision:state.data.revision});
 assert.equal(saved.ok,true);
 assert.equal(saved.data.hasKey,true);
 assert.ok(!JSON.stringify(saved).includes(key));
 const file=path.join(home,'simple-chat','chat.json');
 assert.ok(!fs.readFileSync(file,'utf8').includes(key));
 assert.equal((await ui.call('state')).data.hasKey,true);
 await ui.call('save',{apiKey:'',prompt:saved.data.prompt,revision:saved.data.revision});
 fs.unlinkSync(file);
 const reopened=installChat(undefined,home);
 assert.equal((await reopened.call('state')).ok,false);
 assert.equal(fs.existsSync(file+'.bak'),true);
});
async function until(fn){for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setImmediate(r));}assert.fail('timed out waiting for mock');}
test('clear during speech invalidates old reply and resets pet',async t=>{const {service,read}=fixture(t,{voiceEnabled:true});const ui=installChat(service);const pending=ui.call('send',{text:'new',requestId:1});await until(()=>ui.events.some(e=>e.type==='text-done'));const r=await ui.call('clear',{includeBackup:true});assert.equal(r.ok,true);assert.equal(read().messages.length,0);assert.equal((await pending).data.cancelled,true);assert.ok(ui.events.some(e=>e.type==='reset'));assert.equal(ui.api.isBusy(),false);});
test('a second send cannot steal an active speech reply',async t=>{const {service}=fixture(t,{voiceEnabled:true});const ui=installChat(service);const pending=ui.call('send',{text:'new',requestId:1});await until(()=>ui.events.some(e=>e.type==='text-done'));const next=await ui.call('send',{text:'second',requestId:2});assert.equal(next.ok,false);assert.match(next.error,/朗读/);await ui.call('cancel');assert.equal((await pending).data.cancelled,true);});
test('200 stream chunks do not trigger 200 file reads',async t=>{
 const chunks=Array.from({length:200},()=> 'data: '+JSON.stringify({choices:[{delta:{content:'x'},finish_reason:null}]})+'\n\n').join('')+'data: '+JSON.stringify({choices:[{delta:{},finish_reason:'stop'}]})+'\n\n';
 const {service}=fixture(t,{fetchImpl:async()=>new Response(chunks)});let reads=0;const original=service.store.read.bind(service.store);service.store.read=()=>{reads++;return original();};const ui=installChat(service);assert.equal((await ui.call('send',{text:'new',requestId:1})).ok,true);assert.equal(ui.events.filter(e=>e.type==='text').length,200);assert.ok(reads<15,'read count='+reads);
});
test('clear during generation is refused without stopping speech',async t=>{let release;const {service}=fixture(t,{voiceEnabled:true,fetchImpl:()=>new Promise(r=>release=r)});const ui=installChat(service);const pending=ui.call('send',{text:'new',requestId:1});const count=ui.speech.stops;const clear=await ui.call('clear');assert.equal(clear.ok,false);assert.equal(ui.speech.stops,count);release(await reply('stop')());await until(()=>ui.events.some(e=>e.type==='text-done'));await ui.call('cancel');await pending;});

function inline(){const c={window:{},S:{},clearTimeout(){},setTimeout(){}};vm.createContext(c);vm.runInContext(fs.readFileSync(helper+'/pet-inline-chat.js','utf8'),c);const instance=Object.create(c.window.PetInlineChat.prototype);Object.assign(instance,{sequence:0,draft:'',state:{voiceEnabled:false},pet:{animations:{events:{}}},bubble(){},animation(){},idle(){},showReply(){},closeInput(){},hideBubble(){}});return instance;}
test('failed send preserves input for reopening',async()=>{const ui=inline();ui.call=async()=>{throw new Error('offline');};await ui.send('draft text');assert.equal(ui.draft,'draft text');assert.equal(ui.pending,false);});
test('successful send clears draft and shows truncation warning',async()=>{const ui=inline();let displayed;ui.showReply=s=>displayed=s;ui.call=async()=>({messages:[{role:'assistant',content:'partial'}],replyWarning:'truncated'});await ui.send('draft');assert.equal(ui.draft,'');assert.match(displayed,/truncated/);});
test('reset invalidates late send without restoring old state',async()=>{const ui=inline();let finish;ui.call=()=>new Promise(r=>finish=r);const pending=ui.send('draft');ui.onEvent({type:'reset'});finish({messages:[{role:'assistant',content:'old'}]});await pending;assert.equal(ui.state,null);assert.equal(ui.replyText,'');});
test('voice logs contain only allowlisted metadata and rotate',t=>{const {dir}=fixture(t);const {createVoiceLogger}=require(helper+'/voice-log');const log=createVoiceLogger(dir);log('error','GPU_BUSY');log('error','sk-SHOULD-NEVER-LOG');log('PRIVATE TEXT','NO_GPU');const file=path.join(dir,'voice.log');const text=fs.readFileSync(file,'utf8');assert.match(text,/GPU_BUSY/);assert.doesNotMatch(text,/SHOULD|PRIVATE/);fs.writeFileSync(file,'x'.repeat(270000));log('ready');assert.ok(fs.existsSync(file+'.1'));assert.ok(fs.statSync(file).size<1000);});
test('appearance recovery and version conflict still work',t=>{const {dir}=fixture(t);const file=path.join(dir,'appearance.jsonc');fs.writeFileSync(file,JSON.stringify({pets:[{id:'main',size:480}]}));const store=new AppearanceStore({file});const a=store.state();assert.equal(a.percent,75);store.save({percent:80,revision:a.revision});assert.throws(()=>store.save({percent:90,revision:a.revision}),/更新/);fs.writeFileSync(file,'broken');assert.equal(store.state().percent,80);assert.equal(store.state().canSave,false);});
test('stream phraser preserves all text and captions',()=>{const {SpeechPhraser}=require(helper+'/speech-phrasing');const text='测试一段完整文字。这段文字需要完整保留，同时不能在结束后继续发出旧字幕。';const parts=[];const p=new SpeechPhraser((s,c)=>parts.push([s,c]));for(const ch of text)p.push(ch);p.end();assert.equal(parts.map(x=>x[0]).join(''),text);assert.equal(parts.at(-1)[1],text);p.push('ignored');assert.equal(parts.at(-1)[1],text);});
test('launcher tolerates shutdown socket resets but verifies refusal',async t=>{
 const {dir}=fixture(t);const appRoot=path.join(dir,'app');fs.writeFileSync(path.join(dir,'control-session.json'),JSON.stringify({token,port:3088,pid:123}));
 const {runLauncher}=await import(require('node:url').pathToFileURL(path.join(root,'app/launcher.mjs')).href);
 let calls=0;const network=code=>Object.assign(new TypeError('fetch failed'),{cause:{code}});
 const fetchImpl=async()=>{calls++;if(calls===1)return{ok:true,json:async()=>({name:'dsh-pet-standalone',pid:123,plugin:{root:path.join(appRoot,'node_modules/dsh-pet')}})};if(calls===2)throw network('UND_ERR_SOCKET');if(calls===3)throw network('ECONNRESET');throw network('ECONNREFUSED');};
 await runLauncher({appRoot,home:dir,stop:true,fetchImpl,delay:async()=>{}});assert.equal(calls,4);
});
test('launcher does not report stopped while authenticated host remains alive',async t=>{
 const {dir}=fixture(t);const appRoot=path.join(dir,'app');fs.writeFileSync(path.join(dir,'control-session.json'),JSON.stringify({token,port:3088,pid:123}));
 const {runLauncher}=await import(require('node:url').pathToFileURL(path.join(root,'app/launcher.mjs')).href);
 const fetchImpl=async url=>url.endsWith('/shutdown')?{ok:true}:{ok:true,json:async()=>({name:'dsh-pet-standalone',pid:123,plugin:{root:path.join(appRoot,'node_modules/dsh-pet')}})};
 await assert.rejects(runLauncher({appRoot,home:dir,stop:true,fetchImpl,delay:async()=>{}}),/still shutting down/);
});
