'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../app/electron-helper/pet-form.js'),'utf8');
function fixture({saved=null,fail=false,reduced=false,voiceEnabled=false}={}){
 const data=new Map(saved?[['deepseek-pet-form:main',saved]]:[]),writes=[],errors=[],fades=[];
 const element=()=>({style:{setProperty(k,v){this[k]=v;},removeProperty(k){delete this[k];}},dataset:{},animate(frames,options){fades.push({from:frames[0].opacity,to:frames[1].opacity,duration:options.duration});return {finished:new Promise(r=>setTimeout(r,2)),cancel(){}};}});
 const sounds=[];class Audio {constructor(src){this.src=src;this.plays=0;this.pauses=0;sounds.push(this);}play(){this.plays++;return Promise.resolve();}pause(){this.pauses++;}}
 const win={Audio,__dshPetDebug:{},setTimeout,clearTimeout,matchMedia:()=>({matches:reduced}),localStorage:{getItem:k=>data.get(k),setItem(k,v){writes.push([k,v]);data.set(k,v);}},document:{currentScript:{src:'file:///test/pet-form.js'},createElement(){const image=element();Object.defineProperty(image,'src',{set(){queueMicrotask(()=>fail?image.onerror?.():image.onload?.());}});return image;}}};
 vm.runInNewContext(source,{window:win,URL});
 const sprite={pet:{id:'main'},size:480,height:270,bottomPad:22.5,hitRect:{w:180},el:element(),fullLayer:element(),stage:{...element(),insertBefore(){}},hit:{},pos:{x:-55,y:704},customPos:{rx:0.37,ry:0.64},inlineChat:{state:{voiceEnabled},bubble:m=>errors.push(m)},stopThrow(){},stopMove(){},stopSquash(){},syncInputRegions(){}};
 const controller=new win.PetForms.Controller(sprite);
 return {controller,sprite,writes,errors,fades,win,sounds};
}
test('both forms retain the same bottom center at multiple sizes',()=>{
 const {win}=fixture();
 for(const size of [240,480,720]){const h=size*9/16,pad=h/12,w=size*240/640;const b=win.PetForms.bustBox(size,h,pad,w);assert.equal(b.left+b.width/2,size/2);assert.equal(pad+b.top+b.height,h);assert.equal(b.width,b.height);assert.equal(b.width,w*0.8);}
});
test('switching both ways preserves shared coordinates and stores only a form name',async()=>{
 const f=fixture(),before=JSON.stringify({pos:f.sprite.pos,customPos:f.sprite.customPos});
 assert.equal(await f.controller.set('bust'),true);assert.equal(f.controller.mode,'bust');
 assert.equal(await f.controller.set('full'),true);assert.equal(f.controller.mode,'full');
 assert.equal(JSON.stringify({pos:f.sprite.pos,customPos:f.sprite.customPos}),before);
 assert.deepEqual(f.writes,[['deepseek-pet-form:main','bust'],['deepseek-pet-form:main','full']]);
 assert.deepEqual(f.fades.map(x=>[x.from,x.to,x.duration]),[[1,0,90],[0,1,130],[1,0,90],[0,1,130]]);
});
test('image failure retains the visible full-body form and does not persist a broken choice',async()=>{
 const f=fixture({fail:true});assert.equal(await f.controller.set('bust'),false);assert.equal(f.controller.mode,'full');assert.equal(f.controller.full.style.opacity,'1');assert.equal(f.writes.length,0);assert.equal(f.fades.length,0);assert.equal(f.errors.length,1);
});
test('saved bust starts without flashing the full-body layer',async()=>{
 const f=fixture({saved:'bust'});assert.equal(f.controller.full.style.opacity,'0');await f.controller.ready;assert.equal(f.controller.mode,'bust');assert.equal(f.controller.image.style.opacity,'1');assert.equal(f.fades.length,0);
});
test('the latest rapid choice wins without concurrent fades',async()=>{
 const f=fixture();const first=f.controller.set('bust');f.controller.set('full');await first;assert.equal(f.controller.mode,'full');
 const second=f.controller.set('bust');await new Promise(r=>setTimeout(r,1));f.controller.set('full');await second;assert.equal(f.controller.mode,'full');assert.equal(f.controller.full.style.opacity,'1');assert.equal(f.controller.image.style.opacity,'0');
});
test('reduced motion and disposal keep the final visible state consistent',async()=>{
 const f=fixture({reduced:true});await f.controller.set('bust');assert.equal(f.fades.length,0);f.controller.dispose();assert.equal(await f.controller.set('full'),true);assert.equal(f.controller.mode,'bust');
});

test('half-body clicks cycle local lines without repeating or flooding',async()=>{
 const f=fixture();await f.controller.set('bust');f.controller.random=()=>0;
 assert.equal(f.controller.click(),true);const first=f.errors.at(-1);
 f.controller.click();assert.equal(f.errors.length,1);
 f.controller.lastChatterAt=-Infinity;f.controller.click();assert.notEqual(f.errors.at(-1),first);
 await f.controller.set('full');assert.equal(f.controller.click(),false);
});

test('chat, speech and a visible reply keep priority over local chatter and sounds',async()=>{
 const f=fixture({voiceEnabled:true});await f.controller.set('bust');
 for(const state of [{pending:true},{phase:'thinking'},{phase:'speaking'},{voiceStatus:'playing'},{replyText:'fake reply'}]){
  Object.assign(f.sprite.inlineChat,{pending:false,phase:'idle',voiceStatus:'off',replyText:''},state);
  f.sprite.whisperOn=!!state.replyText;f.controller.lastChatterAt=-Infinity;
  f.controller.click();f.controller.press(true);f.controller.press(false);
  assert.equal(f.errors.length,0);assert.equal(f.sounds.length,0);
 }
});

test('muted half-body still has text, while paired audio queues release exactly once',async()=>{
 const muted=fixture();await muted.controller.set('bust');muted.controller.press(true);muted.controller.press(false);muted.controller.click();
 assert.equal(muted.errors.length,1);assert.equal(muted.sounds.length,0);
 const f=fixture({voiceEnabled:true});await f.controller.set('bust');f.controller.press(true);f.controller.press(false);f.controller.press(false);
 assert.equal(f.sounds[0].plays,1);assert.equal(f.sounds[1].plays,0);
 f.sounds[0].onended();assert.equal(f.sounds[1].plays,1);
 f.controller.press(true);f.sounds[0].onended();f.controller.press(false);assert.equal(f.sounds[1].plays,2);
 await f.controller.set('full');assert.ok(f.sounds.every(a=>a.pauses>0));assert.equal(f.controller.releaseQueued,false);
});

test('an old hidden reply does not block subsequent local lines, while a new reply wins',async()=>{
 const f=fixture();await f.controller.set('bust');f.sprite.inlineChat.replyText='old fake reply';
 f.sprite.inlineChat.bubble=m=>{f.errors.push(m);f.sprite.whisperOn=true;f.sprite.whisperView={text:m};};
 f.controller.click();f.controller.lastChatterAt=-Infinity;f.controller.click();assert.equal(f.errors.length,2);
 f.sprite.whisperView={text:'new fake reply'};f.controller.lastChatterAt=-Infinity;f.controller.click();assert.equal(f.errors.length,2);
});

test('one flat menu item toggles forms and half clicks never play hidden full-body actions',()=>{
 let menu,calls=0;const context={window:{__dshPetDebug:{}},S:{buildMenuTree:()=>[],mountContextMenu:o=>(menu=o.tree,{close(){}})}};
 vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../app/electron-helper/sprite.js'),'utf8')+';globalThis.Sprite=PetSprite;',context);
 const sprite={dragState:{},forms:{mode:'bust',target:'bust',set(mode){calls++;this.target=mode;},click:()=>true},inlineChat:{state:{}},stopThrow(){},stopMove(){},cancelPendingSwitch(){},setInteractive(){},syncInputBusy(){},visibleClampRect(){},syncInputRegions(){},closeMenu(){this.menuOpen=false;},playOnce(){throw Error('hidden full-body click action');},animations:{clicks:['fake']}};
 context.Sprite.prototype.onContextMenu.call(sprite,{preventDefault(){},clientX:20,clientY:20});
 const item=menu.find(x=>x.label==='切换形态');assert.equal(item.action,'form-toggle');assert.equal(item.children,undefined);assert.equal(menu.some(x=>x.label==='形态'),false);
 context.Sprite.prototype.onMenuAction.call(sprite,{action:'form-toggle'});assert.equal(sprite.forms.target,'full');assert.equal(calls,1);
 context.Sprite.prototype.onClick.call(sprite);
});
