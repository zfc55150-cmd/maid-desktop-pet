'use strict';
// Hidden-only integration harness: real renderer/preload/IPC/media/physics.
// Synthetic PointerEvents, with capture stubbed only inside this hidden window.
const fs=require('node:fs'),path=require('node:path');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function run({win,motion,input,director,metrics,frame,masks,close,root,idleScheduler=null}){
 const checks=[],events=[],paints=[];let begun=false,propSaved=false;
 const check=(name,ok)=>{checks.push({name,ok});if(!ok)throw new Error(name);};
 const wait=async(fn,timeout=16000)=>{const until=Date.now()+timeout;while(!fn()){if(Date.now()>until)throw new Error('WAIT_TIMEOUT');await sleep(10);}};
 const note=name=>events.push({name,at:Date.now(),physical:motion.phase,performance:director.phase,frame:frame()});
 win.webContents.on('paint',(_e,_d,image)=>{const pixels=image.toBitmap(),size=image.getSize(),f=frame();let visible=0,propVisible=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]>10)++visible;
  if(f?.clip==='lanterninvite'&&f.index>=90){for(let y=Math.floor(150*size.height/384);y<300*size.height/384;y++)for(let x=Math.floor(40*size.width/384);x<125*size.width/384;x++)if(pixels[(y*size.width+x)*4+3]>10)++propVisible;if(!propSaved&&f.index>=100){fs.writeFileSync(path.join(root,'prop-composite.png'),image.toPNG());propSaved=true;}}
  if(begun&&paints.length<8192)paints.push({at:Date.now(),visible,propVisible,clip:f?.clip,index:f?.index});});
 const js=s=>win.webContents.executeJavaScript(s+';void 0;');
 const point=()=>{const b=win.getBounds(),f=frame(),mask=masks[f.clip];let n=-1;for(let y=100;y<320&&n<0;y++)for(let x=160;x<240;x++){const bit=f.index*384*384+y*384+x;if(mask[bit>>>3]&(1<<(bit&7))){n=y*384+x;break;}}if(n<0)throw new Error('NO_HIT_POINT');return {x:Math.round(b.x+n%384*b.width/384),y:Math.round(b.y+Math.floor(n/384)*b.height/384)};};
 const pointer=async(type,p)=>js(`document.querySelector('main').dispatchEvent(new PointerEvent(${JSON.stringify(type)},{bubbles:true,button:0,buttons:${type==='pointerup'?0:1},pointerId:71,isPrimary:true,screenX:${p.x},screenY:${p.y}}))`);
 const grab=async()=>{const p=point();await pointer('pointerdown',p);await wait(()=>motion.phase==='drag');return p;};
 const move=async(p,dx=100)=>{await sleep(35);p={x:p.x+dx,y:p.y-10};await pointer('pointermove',p);return p;};
 const release=async p=>{await sleep(35);p={x:p.x+30,y:p.y};await pointer('pointerup',p);await wait(()=>motion.phase!=='drag');return p;};
 try{
  await js("document.querySelector('main').setPointerCapture=()=>{};");begun=true;note('start');
  director.manual('proud');await wait(()=>frame()?.clip==='proudarms');await wait(()=>frame()?.clip==='frontidle');
  check('native performance and return both ended',metrics.mediaEnds?.some(e=>e.clip==='proudarms')&&metrics.mediaEnds.some(e=>e.clip==='proudarmsreturn'));note('native-return');
  director.manual('lantern');await wait(()=>frame()?.clip==='lanterninvite');await wait(()=>frame()?.clip==='frontidle');check('whole-canvas prop scene ended',metrics.mediaEnds.some(e=>e.clip==='lanterninvite'));check('outlying lamp region survives software composition',paints.some(p=>p.clip==='lanterninvite'&&p.index>=90&&p.propVisible>1000));note('prop-scene');
  director.manual('proud');let p=await grab();await wait(()=>frame()?.clip==='frontidle');await sleep(250);await pointer('pointerup',p);await wait(()=>motion.phase==='idle');check('grab during loading cancels old return',director.current.name==='click');
  await sleep(300);p=await grab();p=await move(p);await wait(()=>frame()?.clip==='flutter');const old={...director.current};
  p=await move(p,20);await release(p);check('preparation release has no airborne permission',director.airborneAtRelease===false);await wait(()=>frame()?.clip==='frontidle');const first=metrics.frameUpdates;await sleep(300);check('released recovery is animated',metrics.frameUpdates>first+2);check('old airborne callback rejected',!director.present({...old,clip:'flutter',frame:90,visible:true}));
  p=await grab();check('catch cancels inertia',motion.phase==='drag'&&!director.airborneAtRelease);await js("window.dispatchEvent(new Event('blur'))");await wait(()=>motion.phase==='idle');check('blur cancels held state',input.active===null);
  await sleep(200);p=await grab();p=await move(p);await wait(()=>director.phase==='airborne',4000);p=await move(p,20);await release(p);check('airborne release starts independent inertia',motion.phase==='flight'&&director.airborneAtRelease);const landingBefore=metrics.actions.filter(a=>a.name==='landing').length;await wait(()=>motion.phase==='idle',20000);await wait(()=>frame()?.clip==='draglanding');check('natural rest produces exactly one eligible landing',metrics.actions.filter(a=>a.name==='landing').length===landingBefore+1);await wait(()=>frame()?.clip==='frontidle');note('airborne-rest-return');
  const landed=metrics.actions.filter(a=>a.name==='landing').length;p=await grab();await release({x:p.x+120,y:p.y});check('release-only throw starts physics without takeoff',motion.phase==='flight'&&director.current.name==='recover');await wait(()=>motion.phase==='idle',20000);check('unseen takeoff never lands',metrics.actions.filter(a=>a.name==='landing').length===landed);
  if(idleScheduler){idleScheduler.setEnabled(true);metrics.autoProbeReady=true;await wait(()=>metrics.automatic.events.length>0,30000);check('automatic plan uses a safe existing performance',['proud','walking'].includes(metrics.automatic.events[0].name));await wait(()=>director.phase==='idle'&&frame()?.clip==='frontidle',16000);check('automatic performance completes and returns',metrics.mediaEnds.some(e=>e.requestId===director.current.requestId));idleScheduler.setEnabled(false);const count=metrics.automatic.events.length;await sleep(1000);check('paused automatic scheduler stops',metrics.automatic.events.length===count);}
  check('fixed geometry',metrics.geometry.observations.every(o=>o.size[0]===344&&o.size[1]===344));check('no transition outputs are fully transparent',paints.length>20&&paints.every(p=>p.visible>0));check('no runtime errors',metrics.errors.length===0);metrics.smokeOk=true;note('completed');
 }catch(e){metrics.smokeOk=false;metrics.errors.push('ARCHITECTURE:'+e.message);note('failed');}
 fs.writeFileSync(path.join(root,'architecture-smoke.json'),JSON.stringify({ok:metrics.smokeOk,checks,events,paints,errors:metrics.errors,syntheticPointerCapture:true,visibleWindow:false,screenPresentationVerified:false},null,2));close();
}
module.exports={run};
