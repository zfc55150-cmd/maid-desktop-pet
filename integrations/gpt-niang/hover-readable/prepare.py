from pathlib import Path
import json,hashlib,shutil,re
root=Path(__file__).resolve().parents[3]
source=Path(__file__).parent
base=root/'work/gpt-drag-responsive-20261101-03'
tools=root/'work/gpt-hover-v2-20261101-01'
out=root/'work/gpt-hover-readable-20261102-01'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
m=json.loads((base/'deployment.json').read_text(encoding='utf-8-sig'))
assert json.loads((base/'live-install.json').read_text(encoding='utf-8-sig'))['ok']
installed=Path(m['targetRoot']);target='runtime/pet-forms.ps1'
for e in m['hostFiles']+m['files']:
 assert sha(installed/e['target'])==e['sha256'],'Concurrent change: '+e['target']
before=(installed/target).read_bytes();code=before.decode('utf-8-sig')
old='''  $script:identityHoverText.FontSize=$size*0.026
  $script:identityHoverText.LineHeight=$size*0.026*1.4
  $script:identityHoverText.MaxWidth=$size*0.8-$size*0.042-2
  $script:identityHoverBorder.Padding=[Windows.Thickness]::new($size*0.021,$size*0.010,$size*0.021,$size*0.010)
  $script:identityHoverBorder.CornerRadius=[Windows.CornerRadius]::new($size*0.016)'''
new='''  # Keep identity readable even when the character is scaled down.
  $fontSize=[Math]::Max(18.0,$size*0.042)
  $padX=[Math]::Max(12.0,$size*0.026);$padY=[Math]::Max(8.0,$size*0.016)
  $script:identityHoverText.FontSize=$fontSize
  $script:identityHoverText.LineHeight=$fontSize*1.4
  $script:identityHoverText.MaxWidth=[Math]::Max(240.0,$size*0.8)-2*$padX-2
  $script:identityHoverText.TextAlignment=[Windows.TextAlignment]::Center
  $script:identityHoverText.VerticalAlignment=[Windows.VerticalAlignment]::Center
  $script:identityHoverBorder.Padding=[Windows.Thickness]::new($padX,$padY,$padX,$padY)
  $script:identityHoverBorder.MinWidth=104
  $script:identityHoverBorder.MinHeight=44
  $script:identityHoverBorder.CornerRadius=[Windows.CornerRadius]::new([Math]::Max(8.0,$size*0.020))'''
# Preserve the exact rest of the installed script, including line endings.
newline='\r\n' if '\r\n' in code[:code.index('function Hide-WidgetIdentityHover')] else '\n'
old=old.replace('\n',newline);new=new.replace('\n',newline)
assert code.count(old)==1
code=code.replace(old,new)
(out/'baseline-pet-forms.ps1').write_bytes(before)
dest=out/'files'/target;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(code.encode('utf-8-sig'))
(source/'pet-forms.ps1').write_bytes(dest.read_bytes())
host=[e for e in m['hostFiles'] if e['target']!=target]
host.extend({'target':e['target'],'sha256':e['sha256']} for e in m['files'])
m['hostFiles']=host;m['files']=[{'target':target,'sha256':sha(dest),'previousSha256':hashlib.sha256(before).hexdigest()}]
m['version']='0.7.3-hover-readable.1'
(out/'deployment.json').write_text(json.dumps(m,indent=2,ensure_ascii=False),encoding='utf-8')
for name in ['apply-update.ps1','maintenance-runner.ps1','verify-installed.cjs','merge-hooks.cjs','dragon-hooks.json']:
 shutil.copyfile(tools/name,out/name)
shutil.copytree(tools/'agent-files',out/'agent-files',dirs_exist_ok=True)
paths=['deployment.json','apply-update.ps1','maintenance-runner.ps1','verify-installed.cjs','merge-hooks.cjs','dragon-hooks.json','agent-files/update-helper.ps1','baseline-pet-forms.ps1','files/'+target]
(out/'package-integrity.json').write_text(json.dumps({'schema':1,'files':[{'path':p,'sha256':sha(out/p)} for p in paths]},indent=2),encoding='utf-8')
s=(root/'work/gpt-hover-20261101-02/reviewed-delta.ps1').read_text(encoding='utf-8-sig')
s=re.sub(r"reviewedDeltaIndexSha='[a-f0-9]+'","reviewedDeltaIndexSha='"+sha(out/'package-integrity.json')+"'",s)
(out/'reviewed-delta.ps1').write_text(s,encoding='utf-8-sig')
print(json.dumps({'package':str(out),'changedFiles':1,'fontMinimumDip':18,'minimumTipDip':[104,44]}))
