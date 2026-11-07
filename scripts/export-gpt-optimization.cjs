'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),work=path.join(root,'work/optimization-20261101');
const output=path.resolve(process.argv[2]||path.join(work,'delivery-01'));
if(fs.existsSync(output))throw Error('Delivery directory exists; do not overwrite prior results');
const digest=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function copy(src,dst){if(fs.lstatSync(src).isSymbolicLink())throw Error('Refusing reparse file');fs.mkdirSync(path.dirname(dst),{recursive:true});fs.copyFileSync(src,dst);if(digest(src)!==digest(dst))throw Error('Export hash mismatch');}
function tree(src,dst,filter=()=>true){if(!fs.existsSync(src))return;for(const e of fs.readdirSync(src,{withFileTypes:true})){if(e.isSymbolicLink())throw Error('Refusing reparse directory');if(['__pycache__','profile'].includes(e.name))continue;const s=path.join(src,e.name),d=path.join(dst,e.name);if(e.isDirectory())tree(s,d,filter);else if(filter(e.name))copy(s,d);}}
const manifest=JSON.parse(fs.readFileSync(path.join(root,'deployment.json')));
for(const e of manifest.files){if(digest(path.join(root,e.source))!==e.sha256)throw Error('Unverified source');}
const source=path.join(output,'维护源候选');
for(const e of manifest.files)copy(path.join(root,e.source),path.join(source,e.source));
for(const name of ['deployment.json','package.json','AGENTS.md','README.md'])copy(path.join(root,name),path.join(source,name));
for(const name of ['check.cjs','verify.cjs','install.ps1','rollback.ps1','deployment-safety.cjs','profile-deployment-safety.cjs','snapshot-gpt-optimization.cjs','review-gpt-electron.cjs','summarize-gpt-review.cjs','export-gpt-optimization.cjs'])if(fs.existsSync(path.join(root,'scripts',name)))copy(path.join(root,'scripts',name),path.join(source,'scripts',name));
tree(path.join(root,'tests'),path.join(source,'tests'),n=>n.endsWith('.test.cjs')||n==='test_gpt_candidate_preflight.py');
tree(path.join(root,'integrations/gpt-niang/electron'),path.join(source,'integrations/gpt-niang/electron'));
copy(path.join(root,'docs/GPT娘优化实施结果-20261101.md'),path.join(output,'实施结果.md'));
copy(path.join(root,'docs/GPT娘优化实施结果-20261101.md'),path.join(source,'docs/GPT娘优化实施结果-20261101.md'));
copy(path.join(root,'docs/GPT娘优化执行交接-20261101.md'),path.join(source,'docs/GPT娘优化执行交接-20261101.md'));
copy(path.join(root,'docs/改进与副作用说明.md'),path.join(source,'docs/改进与副作用说明.md'));
const visual=path.join(output,'观感复核');
for(const d of ['baseline-full','candidate-full','static-review','tea-native-candidate-01'])tree(path.join(work,'visual',d),path.join(visual,d),n=>/\.(webm|png|json)$/.test(n)&&!['fixture.js','index.html'].includes(n));
for(const n of ['review.html','static-visual-findings.md','verification-summary.json'])if(fs.existsSync(path.join(work,'visual',n)))copy(path.join(work,'visual',n),path.join(visual,n));
tree(path.join(work,'profile-sync-01'),path.join(output,'两入口动画同步候选'));
for(const n of ['deployment-preflight.json','deployment-rehearsal.json','deployment-implementation.md','protected-assets-check.json','source-verification.txt','geometry-implementation.md','playback-runtime-report.md','assistance-cost.json','profile-transaction-report.json','code-profile-preflight.txt'])if(fs.existsSync(path.join(work,n)))copy(path.join(work,n),path.join(output,'验证记录',n));
copy(path.join(root,'work/verification/latest.json'),path.join(output,'验证记录/source-verify.json'));
for(const d of ['candidate-input2','candidate-input-native-trace','candidate-idle','candidate-idle-final'])for(const n of ['result.json','failure.json','loaded-code-hashes.json']){const p=path.join(work,'visual',d,n);if(fs.existsSync(p))copy(p,path.join(output,'验证记录',d,n));}
// Preserve the reviewed pre-change code without entire runtime/media copies.
tree(path.join(work,'baseline/installed'),path.join(output,'更新前代码基线'));
copy(path.join(root,'deployment.json'),path.join(output,'更新前代码基线/deployment.json'));
copy(path.join(work,'baseline/baseline.json'),path.join(output,'验证记录/baseline.json'));
fs.writeFileSync(path.join(output,'先读说明.txt'),'这是1.2.4-gpt-candidate候选包，未安装。先打开观感复核/review.html。实施结果.md列明技术通过与未完成验收。正式素材和母版未替换。请勿直接运行安装器：真实拖拽、多屏/DPI、视觉结论及生成/朗读状态仍需完成。本包不含聊天、密钥、模型、整套动画库或运行环境。\n','utf8');
const files=[];function inventory(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())inventory(p);else files.push({path:path.relative(output,p).replaceAll('\\','/'),bytes:fs.statSync(p).size,sha256:digest(p)});}}
inventory(output);const report={at:new Date().toISOString(),version:manifest.version,deploymentSha256:digest(path.join(root,'deployment.json')),installed:false,userArtApproved:false,files};fs.writeFileSync(path.join(output,'交付校验.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({output,files:files.length,bytes:files.reduce((n,f)=>n+f.bytes,0),manifestSha256:report.deploymentSha256,installed:false}));
