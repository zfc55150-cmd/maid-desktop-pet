'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{motionBounds}=require('./app/desktop-geometry.cjs'),{TouchResponses}=require('./app/touch.cjs'),{scope}=require('./app/appearance.cjs'),{Motion}=require('./app/desktop-motion.cjs');
const display=(x,y,w,h)=>({bounds:{x,y,width:w,height:h},workArea:{x,y,width:w,height:h-40}});
test('throws cross connected panels, bounce at outer edges and keep square canvas size',()=>{
 const screens=[display(0,0,1920,1080),display(1920,0,1920,1080)],m=new Motion(()=>{});m.phase='flight';m.serial=1;m.flight={x:1570,y:300,vx:2400,vy:0};let crossed=false;
 for(let i=0;i<35;i++){m.tick(.016,motionBounds(m.flight,screens,344));if(m.position.x>1920)crossed=true;}assert(crossed);assert(m.flight.vx>0);
 assert.equal(motionBounds({x:10,y:100},screens,344).minX,0);assert.equal(motionBounds({x:3500,y:100},screens,344).maxX,3840-344);
 assert(Number.isFinite(motionBounds({x:1500,y:900},[display(0,0,1920,1080),display(1920,0,1920,700)],344).maxX));
 assert(Number.isFinite(motionBounds({x:1500,y:300},[display(0,0,1920,1080),display(1940,0,1920,1080)],344).maxX));
});
test('touch regions preserve original selection, cooldown and no immediate repeat',()=>{let now=1000;const m={states:{a:{},b:{},happy:{}},touchResponses:{tail:['a','b'],head:['happy']}};const t=new TouchResponses(m,{now:()=>now,random:()=>0});assert.equal(t.choose({x:.8,y:.6}).clip,'a');assert.equal(t.choose({x:.8,y:.6}),null);now+=650;assert.equal(t.choose({x:.8,y:.6}).clip,'b');now+=650;assert.equal(t.choose({x:.5,y:.2}).region,'head');assert.equal(t.choose({x:NaN,y:.4}),null);});
test('appearance draws once per scene with separate full and text probabilities',()=>{const p={colorMode:'mixed',colorChance:.5,colorTextChance:3};assert.equal(scope(p,'test',[],()=>.002),'full');assert.equal(scope(p,'test',[],()=>.02),'text');assert.equal(scope(p,'test',[],()=>.5),'none');assert.equal(scope({...p,colorMode:'special'},'key',['key']),'full');assert.equal(scope({...p,colorMode:'original'},'key',['key']),'none');});
