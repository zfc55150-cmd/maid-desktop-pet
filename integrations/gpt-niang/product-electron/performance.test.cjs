'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),catalog=require('./app/performance-catalog.js'),{PerformanceDirector}=require('./app/performance-director.cjs');
const {manifest,clips}=require('./performance-fixture.cjs');catalog.configure(manifest);
test('manual actions have valid finite plans and both new turns are route-only',()=>{assert.equal(catalog.selectable.length,44);for(const row of catalog.selectable){const p=catalog.plan(row.name,clips);assert.ok(catalog.idlePose(p.at(-1).clip));assert.equal(p.at(-1).loop,true);assert(p.slice(0,-1).every(s=>s.loop===false));if(manifest.transitionClips[row.clip])assert(p.some(s=>s.clip===manifest.transitionClips[row.clip]));}assert.deepEqual(catalog.route('A','C'),['atocbridge']);assert.deepEqual(catalog.route('C','A'),['turnside','btoabridge']);assert.deepEqual(catalog.route('A','C',{...clips,atocbridge:undefined}),['poserelax','turnfront']);assert.equal(catalog.route('B','A',{...clips,btoabridge:undefined}),null);for(const name of ['btoabridge','atocbridge'])assert(!catalog.isSelectable('clip:'+name));});
test('automatic choices have valid pose routes and exclude drag, stand-alone turns and props without returns',()=>{for(const a of catalog.automatic){assert(catalog.route('C',a.entryPose)!==null);assert(!['flutter','draglanding','frontlanding','fanmishap','lanterninvite','btoabridge','atocbridge'].includes(a.clip));assert(catalog.plan(a.name,clips).some(s=>s.clip===a.clip));}});
test('tasks can interrupt idle variety but not manual scenes, grab or inertia; old requests remain invalid',()=>{const commands=[],d=new PerformanceDirector(c=>commands.push(c));d.start();assert(d.manual('clip:walking',{origin:'automatic'}));assert(d.manual('clip:thinking',{origin:'task'}));assert(d.manual('clip:fanmishap'));assert(!d.manual('clip:thinking',{origin:'task'}));const old={...d.current,clip:'fanmishap',visible:true,frame:90};d.motion({type:'grab',serial:1,gesture:1});assert(!d.manual('clip:thinking',{origin:'task'}));assert(!d.present(old));d.motion({type:'release',serial:1,moved:true,thrown:true});assert(!d.manual('clip:happy'));d.motion({type:'rested',serial:1});assert(d.manual('clip:happy'));});
test('side actions stay in the side idle and start the next action from the displayed pose',()=>{
 assert.deepEqual(catalog.plan('clip:response',clips).map(s=>s.clip),['turnside','response','brelaxed']);
 assert.deepEqual(catalog.plan('clip:footrelax',clips,{fromPose:'B'}).map(s=>s.clip),['footrelax','brelaxed']);
 assert.deepEqual(catalog.plan('clip:frontidle',clips,{fromPose:'B'}).map(s=>s.clip),['turnfront','frontidle']);
 const director=new PerformanceDirector(()=>{});director.manual('clip:response');
 assert(director.present({...director.current,clip:'brelaxed',frame:1,visible:true}));
 assert.equal(director.phase,'idle');assert.equal(director.pose,'B');
 director.manual('clip:happy');assert.equal(director.current.fromPose,'B');
 director.motion({type:'grab',serial:1,gesture:1});
 assert.equal(catalog.plan(director.current.name,clips)[0].clip,'frontidle');
 director.motion({type:'release',serial:1,moved:false,thrown:false});
 assert.equal(director.phase,'performing');
 assert(director.present({...director.current,clip:'static',frame:0,visible:true}));
 assert.equal(director.phase,'idle');assert.equal(director.pose,'C');
 const {TouchResponses}=require('./app/touch.cjs');
 assert.equal(new TouchResponses({}).choose({x:0.5,y:0.5}),null);
 assert.match(catalog.actionQuote('clip:tea'),/茶/);
 assert.equal(catalog.actionQuote('clip:frontidle'),null);
 assert.throws(()=>catalog.configure({states:{frontidle:{}},transitionClips:{frontidle:'nonexistent'}}),/INVALID_CHARACTER_MANIFEST/);
 catalog.reset();
 assert.deepEqual(catalog.actions,[]);
 assert.deepEqual(catalog.selectable,[]);
 assert.deepEqual(catalog.automatic,[]);
 assert.equal(catalog.isSelectable('clip:happy'),false);
 assert.throws(()=>catalog.plan('clip:happy',clips),/UNKNOWN_PERFORMANCE/);
 catalog.configure(manifest);
});

test('PerformanceDirector clears previous faultTimer and recovers after faultCount > 3', t => {
 t.mock.timers.enable({ apis: ['setTimeout'] });
 const cmds = [];
 const d = new PerformanceDirector(c => cmds.push(c));
 d.start();
 const match = { ...d.current };
 for (let i = 0; i < 4; i++) {
  d.mediaError(match);
  assert.equal(d.phase, 'fault');
 }
 assert.equal(d.faultCount, 4);
 assert.ok(d.faultTimer);
 t.mock.timers.tick(29999);
 assert.equal(d.phase, 'fault');
 t.mock.timers.tick(1);
 assert.equal(d.phase, 'idle');
 assert.equal(d.faultTimer, null);
});
