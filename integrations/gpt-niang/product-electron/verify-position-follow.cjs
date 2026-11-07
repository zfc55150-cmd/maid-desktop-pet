'use strict';
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const stage=path.resolve(process.argv[2]),read=p=>JSON.parse(fs.readFileSync(p,'utf8')),plan=read(path.join(stage,'deployment.json')),root=process.argv.includes('--installed')?plan.target:plan.candidate;
if(!stage.startsWith(path.resolve(__dirname,'../../../work')+path.sep))throw Error('TEST_SCOPE');
app.disableHardwareAcceleration();app.commandLine.appendSwitch('force-device-scale-factor','1');app.setPath('userData',path.join(stage,'follow-test-profile'));
app.whenReady().then(async()=>{
 const native=require(path.join(root,'native-product/native-lease.node')),host=native.hostFrame(),checks=[],main=fs.readFileSync(path.join(root,'app/main.cjs'),'utf8');let win;
 try{
  assert(host.found&&host.visible,'VISIBLE_CODEX_HOST_REQUIRED');
  win=new BrowserWindow({show:false,frame:false,transparent:true,width:413,height:413,x:450,y:300,webPreferences:{offscreen:true,sandbox:true}});await win.loadURL('data:text/html,<body></body>');
  const values={followHost:true,anchor:'free'},writes=[];
  const product={prefs:()=>values,update(p){Object.assign(values,p);writes.push(p);},settings:{update(p){Object.assign(values,p);writes.push(p);}}};
  const context={testOnly:false,win,product,native,Motion:require(path.join(root,'app/desktop-motion.cjs')).Motion,display:{mode:'full'},director:{motion(){}},scheduler:{reset(){}},hideSpeech(){},showClickCard(){},positionSpeech(){},expected:413,lastRequested:null,stats:{moves:0},moveOnly:require(path.join(root,'app/desktop-geometry.cjs')).moveOnly,error(code){throw Error(code);},Date};vm.createContext(context);
  vm.runInContext(main.slice(main.indexOf('function writePosition('),main.indexOf('async function command('))+main.slice(main.indexOf('motion=new Motion('),main.indexOf('\n input=new InputDriver(')),context);
  const same=(a,b)=>Math.abs(a.x-b.x)<=1&&Math.abs(a.y-b.y)<=1;
  function follow(){const h=native.hostFrame(),dpi=h.dpi/96,handle=Number(win.getNativeWindowHandle().readBigUInt64LE());assert(native.follow(handle,h.handle,413,413,values.left*dpi,values.right*dpi,values.bottom*dpi,2,0));}
  function reset(){native.detach();context.motion.cancel();win.setPosition(450,300,false);context.persistPosition();follow();}
  function check(name,before){follow();const after=win.getBounds();assert(same(before,after),name);checks.push({name,before,after,ok:true});native.detach();}
  for(const reason of ['cancel','watchdog','coast-cancel']){
   reset();const {InputDriver}=require(path.join(root,'app/desktop-input.cjs')),input=new InputDriver({motion:context.motion,bounds:()=>win.getBounds(),hit:()=>true,write:context.writePosition});input.handle({kind:'begin',gesture:1,x:500,y:400,at:100},100);input.handle({kind:'move',gesture:1,x:720,y:320,at:600},600);const before=win.getBounds();
   if(reason==='watchdog')input.recover({x:0,y:0},false,800);else{if(reason==='coast-cancel'){context.motion.phase='flight';context.motion.flight={x:before.x,y:before.y,vx:500,vy:100};}context.motion.cancel();}check(reason,before);
  }
  reset();context.motion.phase='flight';context.motion.flight={x:620,y:1200,vx:0,vy:0};const next=context.motion.tick(.016,{minX:0,maxX:1800,minY:0,maxY:900});context.writePosition(next);check('final-rest-commits-before-native-follow',win.getBounds());
  reset();context.writePosition({x:620,y:220});follow();context.writePosition({x:620,y:220});const after=win.getBounds();assert.equal(after.x,620);assert.equal(after.y,220);checks.push({name:'native-move-invalidates-identical-write-cache',ok:true});
  assert(!win.isVisible());const report={ok:true,checks,hostDpi:host.dpi,nativeFollow:true,personalStateWritten:false,screenPresentationVerified:false};fs.writeFileSync(path.join(stage,(process.argv.includes('--installed')?'installed':'candidate')+'-position-follow.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));native.detach();win.destroy();app.exit(0);
 }catch(e){native.detach();if(win&&!win.isDestroyed())win.destroy();fs.writeFileSync(path.join(stage,'position-follow-failure.json'),JSON.stringify({ok:false,error:e.message,checks},null,2));console.error(e.message);app.exit(1);}
});
