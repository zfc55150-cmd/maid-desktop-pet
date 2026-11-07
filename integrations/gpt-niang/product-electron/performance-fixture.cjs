'use strict';
const fs=require('node:fs'),path=require('node:path');
const manifest=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../../work/gpt-electron-formal-20261102-01/animation.json'),'utf8'));
const c=JSON.parse(fs.readFileSync(path.join(__dirname,'media-additions/frontlanding/clip.json'),'utf8'));
manifest.states[c.id]={frames:c.frames,fps:c.fps,label:c.label,loop:false};manifest.clipEntryPoses[c.id]=c.entryPose;manifest.clipExitPoses[c.id]=c.exitPose;manifest.menuGroups[c.id]=c.menuGroup;manifest.returnPoses[c.id]='frontidle';manifest.transitionClips.frontpose=c.id;
const clips=Object.fromEntries(Object.entries(manifest.states).map(([n,s])=>[n,{frames:s.frames,fps:s.fps||manifest.fps||30,loop:!!s.loop}]));
module.exports={manifest,clips};
