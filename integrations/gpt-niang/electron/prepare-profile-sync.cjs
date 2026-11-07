'use strict';
// One animation profile, two entry configurations. Candidate-only; preserves preferences.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function merge(profile,configBytes,expectedSha256){
 if(hash(configBytes)!==expectedSha256)throw Error('Configuration changed since review');
 const original=JSON.parse(configBytes.toString('utf8').replace(/^\uFEFF/,''));
 if(profile.characterId!=='gptniang'||!profile.animations?.actionRegistry)throw Error('Unreviewed animation profile');
 const result={...original};
 for(const key of ['characterId','geometry','humanoid','animations','animationWeights','hitBox'])if(profile[key]!==undefined)result[key]=profile[key];
 return result;
}
function prepare({profileFile,baselineFile,out}){
 const work=fs.realpathSync(path.resolve(__dirname,'../../../work')),dest=path.resolve(out),relative=path.relative(work,dest);
 if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error('Candidate directory must be inside workspace/work');
 let ancestor=path.dirname(dest);while(ancestor!==work){if(fs.existsSync(ancestor)&&fs.lstatSync(ancestor).isSymbolicLink())throw Error('Refusing candidate reparse path');ancestor=path.dirname(ancestor);}
 if(fs.existsSync(out))throw Error('Use a fresh candidate directory');
 const profileBytes=fs.readFileSync(profileFile),profile=JSON.parse(profileBytes);
 const baseline=JSON.parse(fs.readFileSync(baselineFile));
 const candidates=[];
 for(const entry of baseline.configs){
  const bytes=fs.readFileSync(entry.path),config=merge(profile,bytes,entry.sha256);
  candidates.push({target:entry.path,previousSha256:entry.sha256,file:path.basename(path.dirname(path.dirname(path.dirname(entry.path))))+'-config.candidate.json',config});
 }
 // Validate every target before writing any candidate. Never writes an installed config.
 fs.mkdirSync(out,{recursive:true});
 const report={profileSha256:hash(profileBytes),canonicalProfile:path.resolve(profileFile),productionModified:false,artApproval:profile.artApproval||false,targets:[]};
 candidates.forEach((c,i)=>{const file=`${i}-`+c.file,bytes=Buffer.from(JSON.stringify(c.config,null,2)+'\n');fs.writeFileSync(path.join(out,file),bytes);report.targets.push({target:c.target,file,previousSha256:c.previousSha256,sha256:hash(bytes)});});
 fs.writeFileSync(path.join(out,'sync-manifest.json'),JSON.stringify(report,null,2)+'\n');return report;
}
if(require.main===module){try{console.log(JSON.stringify(prepare({profileFile:process.argv[2],baselineFile:process.argv[3],out:process.argv[4]}),null,2));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={merge,prepare};
