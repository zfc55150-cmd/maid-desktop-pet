const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../../..'),core=vm.runInNewContext(fs.readFileSync(path.join(root,'app/electron-helper/shared-core.js'),'utf8')+';PetShared;');
const cases=[];
for(const speed of [0,100,450,500,530,540,550,600,900,1800,4000])for(const pause of [0,100,151])for(const angle of [0,0.7]){
 const trail=[0,25,50,75,100].map(t=>({t,x:Math.cos(angle)*speed*t/1000,y:Math.sin(angle)*speed*t/1000}));
 cases.push({speed,pause,angle,trail,now:100+pause,want:core.estimateReleaseVelocity(trail,100+pause)});
}
const dest=path.join(root,'work/gpt-physical-landing-20261102-03/deepseek-reference.json');fs.writeFileSync(dest,JSON.stringify(cases));console.log(`DeepSeek reference: ${cases.length} trajectories`);
