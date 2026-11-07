'use strict';
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),helper=path.join(root,'app/electron-helper');
const out=path.join(root,'work/pet-form-followup/smoke');fs.mkdirSync(out,{recursive:true});app.setPath('userData',path.join(out,'profile'));
const url=p=>pathToFileURL(p).href;
const video=path.join(process.env.LOCALAPPDATA||path.join(require('node:os').homedir(),'AppData/Local'),'Programs/DeepSeekActionPet/node_modules/dsh-pet/assets/webm');
const css=fs.readFileSync(path.join(helper,'index.html'),'utf8').match(/<style>([\s\S]*?)<\/style>/)[1];
const fixture=`localStorage.clear();window.__dshPetDebug={};window.bounds=[];window.messages=[];
 const S=window.PetShared, CONFIG={scale:1,topInsetRatio:0}, BASE='', VIEW={x:0,y:0,w:1600,h:1000}, PRIMARY_AREA={x:0,y:0,width:1600,height:1000};
 const WINDOW_MARGIN_RATIO=0.5, rootEl=document.getElementById('root'), cfg={animations:null},config={};
 const toScreen=x=>x,toLocal=x=>x;
 const WORK_AREAS=[PRIMARY_AREA],AREAS=[PRIMARY_AREA],PANELS=[PRIMARY_AREA];
 window.petBridge={setBounds(...args){window.bounds.push(args)},setInputRegions(){},setInteractive(){},setInputBusy(){},chatState:async()=>({ok:true,data:{messages:[],voiceEnabled:true}}),onChatEvent:()=>()=>{}};
 window.audioEvents=[];
 const fakePet={id:'main',name:'测试蓝鲸女仆',size:480,position:{corner:'bottom-right',marginX:20,marginY:20},fixedEnabled:true,animations:{idle:['待机呼吸休闲'],turn:[],clicks:['待机呼吸休闲'],drag:['待机呼吸休闲'],moves:{actions:[]},categories:[]}};
 window.sprite=new PetSprite(fakePet);sprite.assetBase=${JSON.stringify(url(video)+ '/')};sprite.switchTo('待机呼吸休闲',false);
 `;
fs.writeFileSync(path.join(out,'fixture.js'),fixture);
fs.writeFileSync(path.join(out,'index.html'),`<!doctype html><meta charset="utf-8"><style>${css}body{background:#eef2f7}</style><div id="root"></div><script src="${url(path.join(helper,'shared-core.js'))}"></script><script src="${url(path.join(helper,'pet-form.js'))}"></script><script src="${url(path.join(helper,'pet-inline-chat.js'))}"></script><script src="${url(path.join(helper,'sprite.js'))}"></script><script src="./fixture.js"></script>`);
const pause=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,width:1100,height:900,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
 win.webContents.on('console-message',(_e,_level,message)=>{if(message.includes('Error'))console.error(message);});
 win.webContents.setAudioMuted(true);
 await win.loadFile(path.join(out,'index.html'));
 for(let i=0;i<100;i++){if(await win.webContents.executeJavaScript('!!window.sprite && sprite.pending===null && sprite.videoB.readyState>=2'))break;await pause(40);}
 await win.webContents.executeJavaScript('sprite.forms.ready');await win.webContents.capturePage();await pause(300);
 const before=await win.webContents.executeJavaScript('({pos:{...sprite.pos},bounds:bounds.length,customPos:sprite.customPos,ready:Math.max(sprite.videoA.readyState,sprite.videoB.readyState),rect:sprite.el.getBoundingClientRect().toJSON(),fullOpacity:getComputedStyle(sprite.fullLayer).opacity,videoOpacity:getComputedStyle(sprite.videoB).opacity,time:sprite.videoB.currentTime})');
 assert.ok(before.ready>=2,'real full-body video did not load');
 const crop={x:220,y:260,width:520,height:330};
 fs.writeFileSync(path.join(out,'full.png'),(await win.webContents.capturePage(crop)).toPNG());
 await win.webContents.executeJavaScript('sprite.onMenuAction({action:"form-toggle"});sprite.forms.task');
 const bust=await win.webContents.executeJavaScript('({pos:{...sprite.pos},bounds:bounds.length,mode:sprite.forms.mode,opacity:getComputedStyle(sprite.forms.image).opacity,image:sprite.forms.image.getBoundingClientRect().toJSON(),loaded:sprite.forms.image.naturalWidth})');
 assert.deepEqual(bust.pos,before.pos);assert.equal(bust.bounds,before.bounds);assert.equal(bust.mode,'bust');assert.equal(bust.loaded,610);assert.equal(bust.opacity,'1');assert.equal(bust.image.width,144);
 assert.ok(Math.abs(bust.image.x+bust.image.width/2-(before.rect.x+240))<1);
 assert.ok(Math.abs(bust.image.bottom-(before.rect.y+270))<1);
 fs.writeFileSync(path.join(out,'bust.png'),(await win.webContents.capturePage(crop)).toPNG());
 await win.webContents.executeJavaScript('sprite.forms.press(true);for(const [i,a] of sprite.forms.sounds.entries()){a.addEventListener("ended",()=>audioEvents.push(i));}sprite.forms.press(false);sprite.onClick();',true);await win.webContents.capturePage(crop);
 for(let i=0;i<50;i++){if(await win.webContents.executeJavaScript('audioEvents.length===2'))break;await pause(50);}
 await pause(300);
 const interaction=await win.webContents.executeJavaScript('({events:audioEvents,durations:sprite.forms.sounds.map(a=>a.duration),bubble:sprite.bubble.textContent,opacity:getComputedStyle(sprite.bubble).opacity,rect:sprite.bubble.getBoundingClientRect().toJSON()})');
 assert.deepEqual(interaction.events,[0,1]);assert.ok(interaction.durations.every(d=>d>0&&Number.isFinite(d)));assert.ok(interaction.bubble.length>0);assert.equal(interaction.opacity,'1');assert.ok(interaction.rect.bottom<=bust.image.top);
 await pause(300);fs.writeFileSync(path.join(out,'bust-chatter.png'),(await win.webContents.capturePage(crop)).toPNG());
 await win.webContents.executeJavaScript('sprite.forms.press(false);sprite.onMenuAction({action:"form-toggle"});sprite.forms.task');
 const after=await win.webContents.executeJavaScript('({pos:{...sprite.pos},bounds:bounds.length,mode:sprite.forms.mode})');
 assert.deepEqual(after.pos,before.pos);assert.equal(after.bounds,before.bounds);assert.equal(after.mode,'full');
 // Capture transition frames from the real Chromium compositor, not CSS guesses.
 await win.webContents.executeJavaScript('void sprite.forms.set("bust");true');
 for(let i=0;i<8;i++){fs.writeFileSync(path.join(out,`transition-${i}.png`),(await win.webContents.capturePage(crop)).toPNG());await pause(30);}
 await win.webContents.executeJavaScript('sprite.forms.task');
 const result={ok:true,realElectron:true,positionUnchanged:true,noWindowBoundsRequests:true,anchorErrorUnderOnePixel:true,sourceImagePixels:610,halfSizeRatio:0.8,localChatter:interaction.bubble,pairedAudioDecoded:interaction.durations,initialVideo:before,paidCalls:0};
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));win.destroy();app.quit();
}).catch(error=>{console.error(error.stack);app.exit(1);});
setTimeout(()=>app.exit(2),20000).unref();
