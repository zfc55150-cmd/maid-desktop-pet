from pathlib import Path
import json,hashlib,shutil
root=Path(__file__).resolve().parents[3]
base=root/'work/gpt-candidate-b-trial-20261101-04'
out=root/'work/gpt-hover-20261101-01'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
manifest=json.loads((base/'deployment.json').read_text(encoding='utf-8-sig'))
installed=Path(manifest['targetRoot'])
target='runtime/pet-forms.ps1'
# Snapshot the currently installed behavior, rather than replacing it with older source.
original=(installed/target).read_bytes()
(out/'baseline-pet-forms.ps1').write_bytes(original)
code=original.decode('utf-8-sig')
needle='$script:petFormsReady=$true;Update-WidgetPetFormMenu'
assert code.count(needle)==1
code=code.replace(needle,needle+';Initialize-WidgetIdentityHover')
hover=(Path(__file__).parent/'hover-feedback.ps1').read_text(encoding='utf-8-sig')
updated=b'\xef\xbb\xbf'+(hover+'\n'+code).encode('utf-8')
dest=out/'files'/target
dest.parent.mkdir(parents=True,exist_ok=True)
dest.write_bytes(updated)
(Path(__file__).parent/'pet-forms.ps1').write_bytes(updated)
old=next(e for e in manifest['hostFiles'] if e['target']==target)
assert sha(installed/target)==old['sha256']
manifest['hostFiles']=[e for e in manifest['hostFiles'] if e['target']!=target]
manifest['hostFiles'].append({'target':'runtime/dragon-animation/animation.json','sha256':sha(installed/'runtime/dragon-animation/animation.json')})
manifest['files']=[{'target':target,'previousSha256':sha(installed/target),'sha256':sha(dest)}]
manifest['version']='0.7.3-hover.1'
(out/'deployment.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
for name in ['apply-update.ps1','maintenance-runner.ps1','verify-installed.cjs','merge-hooks.cjs','dragon-hooks.json']:
 shutil.copyfile(base/name,out/name)
shutil.copytree(base/'agent-files',out/'agent-files',dirs_exist_ok=True)
index={'schema':1,'files':[{'path':p.relative_to(out).as_posix(),'sha256':sha(p)} for p in out.rglob('*') if p.is_file() and p.name not in ['reviewed-delta.ps1','package-integrity.json'] and not p.name.endswith('.json.tmp')]}
(out/'package-integrity.json').write_text(json.dumps(index,indent=2),encoding='utf-8')
entry=(base/'reviewed-delta.ps1').read_text(encoding='utf-8-sig').replace('38891495ca8bb1b231f4044935130e7ba2a0fa21b9c5ed76f0ba1b7c3bbea935',sha(out/'package-integrity.json')).replace("$m.files[0].target-ne 'runtime/dragon-animation/animation.json'","$m.files[0].target-ne 'runtime/pet-forms.ps1'")
(out/'reviewed-delta.ps1').write_text(entry,encoding='utf-8-sig')
print(json.dumps({'package':str(out),'previousSha256':sha(installed/target),'sha256':sha(dest)}))
