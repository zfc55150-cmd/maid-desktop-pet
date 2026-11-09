'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),catalog=require('./app/performance-catalog.js'),{PerformanceDirector}=require('./app/performance-director.cjs');
const {manifest,clips}=require('./performance-fixture.cjs');catalog.configure(manifest);
test('all44 manual actions have valid finite plans, native returns and a final idle loop',()=>{assert.equal(catalog.selectable.length,44);for(const row of catalog.selectable){const p=catalog.plan(row.name,clips);assert.ok(catalog.idlePose(p.at(-1).clip));assert.equal(p.at(-1).loop,true);assert(p.slice(0,-1).every(s=>s.loop===false));if(manifest.transitionClips[row.clip])assert(p.some(s=>s.clip===manifest.transitionClips[row.clip]));}assert.deepEqual(catalog.route('A','C'),['poserelax','turnfront']);assert.deepEqual(catalog.route('C','B'),['turnside']);assert.equal(catalog.route('C','A'),null);});
test('automatic pool has20 safely routed entries and excludes props/drag/landing',()=>{assert.equal(catalog.automatic.length,20);for(const a of catalog.automatic){assert(['B','C'].includes(manifest.clipEntryPoses[a.clip]));assert(catalog.route('C',manifest.clipEntryPoses[a.clip])!==null);assert(!['flutter','draglanding','frontlanding','fanmishap','lanterninvite'].includes(a.clip));assert(catalog.plan(a.name,clips).some(s=>s.clip===a.clip));}});
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
});
