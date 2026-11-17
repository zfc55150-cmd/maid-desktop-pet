'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
// Run the production window-write/save functions and Motion callback together.
// Verify drag, cancel, watchdog, and flight landing persist desktop bounds cleanly.
function fixture(){
 const main=fs.readFileSync(path.join(__dirname,'app/main.cjs'),'utf8');
 const functions=main.slice(main.indexOf('function writePosition('),main.indexOf('async function command('));
 const wire=main.slice(main.indexOf('motion=new Motion('),main.indexOf('\n input=new InputDriver('));
 const win={box:{x:400,y:300,width:413,height:413},getBounds(){return {...this.box};},setPosition(x,y){this.box.x=x;this.box.y=y;},webContents:{send(){}}};
 let saved=0;const values={followHost:false,anchor:'free',desktopLeft:400,desktopTop:300};
 const product={prefs:()=>values,update(patch){Object.assign(values,patch);saved++;},settings:{update(patch){Object.assign(values,patch);saved++;}}};
 const context={testOnly:false,win,product,native:{detach(){}},Motion:require('./app/desktop-motion.cjs').Motion,display:{mode:'full'},director:{motion(){}},scheduler:{reset(){}},hideSpeech(){},showClickCard(){},positionSpeech(){},expected:413,lastRequested:null,stats:{moves:0},windowCoordinate:require('./app/desktop-geometry.cjs').windowCoordinate,error(code){throw Error(code);},Date};
 vm.createContext(context);vm.runInContext(functions+wire,context);
 return {c:context,win,values,saved:()=>saved,begin(){context.motion.begin({x:500,y:400},win.getBounds(),100,1);},move(){const next=context.motion.move({x:720,y:320},600);context.writePosition(next);}};
}
test('cancel after moving retains the displayed drop point on desktop',()=>{
 const f=fixture();f.begin();f.move();const before=f.win.getBounds();f.c.motion.cancel();assert.equal(f.values.desktopLeft,before.x);assert.equal(f.values.desktopTop,before.y);assert.equal(f.saved(),1);
});
test('missed release watchdog saves the actual interrupted drag position',()=>{
 const f=fixture(),{InputDriver}=require('./app/desktop-input.cjs'),d=new InputDriver({motion:f.c.motion,bounds:()=>f.win.getBounds(),hit:()=>true,write:f.c.writePosition});
 d.handle({kind:'begin',gesture:1,x:500,y:400,at:100},100);d.handle({kind:'move',gesture:1,x:720,y:320,at:600},600);const before=f.win.getBounds();d.recover({x:0,y:0},false,800);assert.equal(f.values.desktopLeft,before.x);assert.equal(f.values.desktopTop,before.y);
});
test('interrupted coast saves the current physical window rather than stale coordinates',()=>{
 const f=fixture();f.c.motion.phase='flight';f.c.motion.flight={x:800,y:600,vx:500,vy:100};f.c.writePosition(f.c.motion.flight);const before=f.win.getBounds();f.c.motion.cancel();assert.equal(f.values.desktopLeft,before.x);assert.equal(f.values.desktopTop,before.y);
});
test('last physics position is written before resting callback saves desktop coordinates',()=>{
 const f=fixture();f.c.motion.phase='flight';f.c.motion.flight={x:620,y:1200,vx:0,vy:0};const next=f.c.motion.tick(.016,{minX:0,maxX:1800,minY:0,maxY:900});if(next)f.c.writePosition(next);const before=f.win.getBounds();assert.equal(before.y,900);assert.equal(f.values.desktopLeft,before.x);assert.equal(f.values.desktopTop,before.y);
});
test('free placement also saves cancellation and final coast positions',()=>{
 const f=fixture();f.begin();f.move();f.c.motion.cancel();assert.equal(f.values.desktopLeft,f.win.box.x);assert.equal(f.values.desktopTop,f.win.box.y);f.c.motion.phase='flight';f.c.motion.flight={x:620,y:1200,vx:0,vy:0};const next=f.c.motion.tick(.016,{minX:0,maxX:1800,minY:0,maxY:900});f.c.writePosition(next);assert.equal(f.values.desktopTop,900);
});
test('idle recovery does not overwrite saved coordinates when already idle',()=>{
 const f=fixture();f.values.anchor='right';f.c.motion.cancel();assert.equal(f.saved(),0);assert.equal(f.values.anchor,'right');
});
test('write deduplication notices an external move between identical requests',()=>{
 const f=fixture();f.c.writePosition({x:620,y:220});f.win.setPosition(100,100);f.c.writePosition({x:620,y:220});assert.equal(f.win.box.x,620);assert.equal(f.win.box.y,220);assert.equal(f.c.stats.moves,2);f.c.writePosition({x:620,y:220});assert.equal(f.c.stats.moves,2);
});
test('normal slow release persists the same drop point without a flight',()=>{
 const f=fixture();f.begin();f.move();const before=f.win.getBounds();f.c.motion.end({x:720,y:320},1200);assert.equal(f.c.motion.phase,'idle');assert.equal(f.values.desktopLeft,before.x);assert.equal(f.values.desktopTop,before.y);
});
