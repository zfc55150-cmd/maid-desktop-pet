from pathlib import Path
import json,hashlib,shutil,re
root=Path(__file__).resolve().parents[3];source=Path(__file__).parent
base=root/'work/gpt-hover-readable-20261102-01';out=root/'work/gpt-identity-aligned-20261102-01'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
m=json.loads((base/'deployment.json').read_text(encoding='utf-8-sig'));installed=Path(m['targetRoot'])
assert json.loads((root/'work/gpt-hover-readable-install-20261102.json').read_text(encoding='utf-8-sig'))['ok']
for e in m['hostFiles']+m['files']:
 assert sha(installed/e['target'])==e['sha256'],'Concurrent change: '+e['target']
targets=['runtime/pet-forms.ps1','runtime/characters.ps1','assets/characters.json']
new_entries=[]
for target in targets:
 p=installed/target;before=p.read_bytes();code=before.decode('utf-8-sig')
 if target.endswith('pet-forms.ps1'):
  original=(root/'integrations/gpt-niang/hover-v2/hover-feedback.ps1').read_text(encoding='utf-8-sig')
  start=original.index('function Set-WidgetIdentityHoverStyle');end=original.index('function Hide-WidgetIdentityHover',start)
  a=code.index('function Set-WidgetIdentityHoverStyle');b=code.index('function Hide-WidgetIdentityHover',a)
  code=code[:a]+original[start:end]+code[b:]
  needle='$size=$girl.ActualWidth;if($size-le 0){return}'
  assert code.count(needle)==1
  code=code.replace(needle,"$size=480.0 # Match the current DeepSeek pet.size CSS baseline, independently of this character canvas.")
 elif target.endswith('characters.ps1'):
  old="id='gpt-dragon';name='龙娘1'";assert code.count(old)==1
  code=code.replace(old,"id='gpt-dragon';name='ChatGPT 傲娇龙娘'")
 else:
  data=json.loads(code);rows=[e for e in data['characters'] if e['id']=='gpt-dragon'];assert len(rows)==1
  old='"name": "'+rows[0]['name']+'"';assert code.count(old)==1
  code=code.replace(old,'"name": "ChatGPT 傲娇龙娘"')
 d=out/'files'/target;d.parent.mkdir(parents=True,exist_ok=True)
 d.write_bytes(code.encode('utf-8-sig') if before.startswith(b'\xef\xbb\xbf') else code.encode('utf-8'))
 s=source/target;s.parent.mkdir(parents=True,exist_ok=True);s.write_bytes(d.read_bytes())
 backup=out/'baseline'/target;backup.parent.mkdir(parents=True,exist_ok=True);backup.write_bytes(before)
 new_entries.append({'target':target,'sha256':sha(d),'previousSha256':sha(p)})
m['hostFiles']=[e for e in m['hostFiles'] if e['target'] not in targets]
m['files']=new_entries;m['version']='0.7.3-identity-aligned.1'
(out/'deployment.json').write_text(json.dumps(m,indent=2,ensure_ascii=False),encoding='utf-8')
for name in ['apply-update.ps1','maintenance-runner.ps1','verify-installed.cjs','merge-hooks.cjs','dragon-hooks.json']:
 shutil.copyfile(base/name,out/name)
shutil.copytree(base/'agent-files',out/'agent-files',dirs_exist_ok=True)
paths=['deployment.json','apply-update.ps1','maintenance-runner.ps1','verify-installed.cjs','merge-hooks.cjs','dragon-hooks.json','agent-files/update-helper.ps1']+['files/'+t for t in targets]+['baseline/'+t for t in targets]
(out/'package-integrity.json').write_text(json.dumps({'schema':1,'files':[{'path':p,'sha256':sha(out/p)} for p in paths]},indent=2),encoding='utf-8')
s=(base/'reviewed-delta.ps1').read_text(encoding='utf-8-sig')
s=re.sub(r"reviewedDeltaIndexSha='[a-f0-9]+'","reviewedDeltaIndexSha='"+sha(out/'package-integrity.json')+"'",s)
s=s.replace("if(@($m.files).Count-ne 1 -or $m.files[0].target-ne 'runtime/pet-forms.ps1'){throw 'DELTA_MANAGED_SCOPE_CHANGED'}", "if((@($m.files.target) -join '|')-cne 'runtime/pet-forms.ps1|runtime/characters.ps1|assets/characters.json'){throw 'DELTA_MANAGED_SCOPE_CHANGED'}")
(out/'reviewed-delta.ps1').write_text(s,encoding='utf-8-sig')
print(json.dumps({'package':str(out),'files':len(targets),'deepseekReferenceSize':480,'name':'ChatGPT 傲娇龙娘'},ensure_ascii=True))
