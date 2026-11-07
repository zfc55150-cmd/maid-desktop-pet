from pathlib import Path
import json,hashlib,shutil,re
root=Path(__file__).resolve().parents[3]
source=Path(__file__).parent
base=root/'work/gpt-hover-20261101-02'
out=root/'work/gpt-hover-v2-20261101-01'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
m=json.loads((base/'deployment.json').read_text(encoding='utf-8-sig'))
parallel=root/'work/gpt-startup-size-20261101-02'
receipt=json.loads((parallel/'live-install.json').read_text(encoding='utf-8-sig'))
assert receipt['ok'] and receipt['version']=='0.7.3-startup-size.1'
parallel_manifest=json.loads((parallel/'deployment.json').read_text(encoding='utf-8-sig'))
for entry in parallel_manifest['files']:
 assert entry['target']=='widget.ps1'
 next(e for e in m['hostFiles'] if e['target']==entry['target'])['sha256']=entry['sha256']
installed=Path(m['targetRoot']);target='runtime/pet-forms.ps1'
before=(installed/target).read_bytes()
assert sha(installed/target)==m['files'][0]['sha256'],'Inspect concurrent pet-forms changes first'
(out/'baseline-pet-forms.ps1').write_bytes(before)
code=before.decode('utf-8-sig');start=code.index('# Two views inside the same character canvas.')
assert code[:start].count('function Initialize-WidgetIdentityHover')==1
code=(source/'hover-feedback.ps1').read_text(encoding='utf-8-sig')+'\n'+code[start:]
dest=out/'files'/target;dest.parent.mkdir(parents=True,exist_ok=True)
dest.write_bytes(code.encode('utf-8-sig'))
(source/'pet-forms.ps1').write_bytes(dest.read_bytes())
m['files']=[{'target':target,'sha256':sha(dest),'previousSha256':sha(installed/target)}]
for name in ['cursor-grab.cur','cursor-grabbing.cur','hover-font.ttf']:
 relative='assets/identity-hover/'+name
 assert not (installed/relative).exists(),'New asset baseline changed'
 p=out/'files'/relative;p.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source/'assets'/name,p)
 m['files'].append({'target':relative,'sha256':sha(p),'previousSha256':None})
for entry in m['hostFiles']:
 assert sha(installed/entry['target'])==entry['sha256'],'Concurrent change: '+entry['target']
m['version']='0.7.3-hover.2'
(out/'deployment.json').write_text(json.dumps(m,indent=2,ensure_ascii=False),encoding='utf-8')
for name in ['apply-update.ps1','maintenance-runner.ps1','verify-installed.cjs','merge-hooks.cjs','dragon-hooks.json']:
 shutil.copyfile(base/name,out/name)
shutil.copytree(base/'agent-files',out/'agent-files',dirs_exist_ok=True)
# Only reviewed payload and installer dependencies enter the integrity index.
paths=['deployment.json','apply-update.ps1','maintenance-runner.ps1','verify-installed.cjs','merge-hooks.cjs','dragon-hooks.json','agent-files/update-helper.ps1','baseline-pet-forms.ps1']+['files/'+e['target'] for e in m['files']]
index={'schema':1,'files':[{'path':p,'sha256':sha(out/p)} for p in paths]}
(out/'package-integrity.json').write_text(json.dumps(index,indent=2),encoding='utf-8')
s=(base/'reviewed-delta.ps1').read_text(encoding='utf-8-sig')
s=re.sub(r"reviewedDeltaIndexSha='[a-f0-9]+'","reviewedDeltaIndexSha='"+sha(out/'package-integrity.json')+"'",s)
s=s.replace("if(@($m.files).Count-ne 1 -or $m.files[0].target-ne 'runtime/pet-forms.ps1'){throw 'DELTA_MANAGED_SCOPE_CHANGED'}", "if((@($m.files.target) -join '|')-cne 'runtime/pet-forms.ps1|assets/identity-hover/cursor-grab.cur|assets/identity-hover/cursor-grabbing.cur|assets/identity-hover/hover-font.ttf'){throw 'DELTA_MANAGED_SCOPE_CHANGED'}")
s=s.replace("$actual=Get-DeltaHash (Resolve-DeltaChild $m.targetRoot $entry.target)","$target=Resolve-DeltaChild $m.targetRoot $entry.target;$actual=if([IO.File]::Exists($target)){Get-DeltaHash $target}else{$null}")
(out/'reviewed-delta.ps1').write_text(s,encoding='utf-8-sig')
print(json.dumps({'package':str(out),'files':len(m['files']),'oldHoverReplaced':True}))
