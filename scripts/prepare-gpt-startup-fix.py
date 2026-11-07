"""Preserve the current fork and build one reviewed widget DPI fix."""
from pathlib import Path
import hashlib
import json
import shutil

ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'work/gpt-drag-release-20261101-03'
OUT=ROOT/'work/gpt-startup-size-20261101-02'
load=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def save(p,obj):
    p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
m=load(BASE/'deployment.json'); live=Path(m['targetRoot']); target='widget.ps1'
expected={e['target']:e['sha256'] for e in m['hostFiles']+m['files']}
# The separate installed hover update has its own preserved source. Pin that
# exact reviewed source, retaining both the hover and drag-release changes.
hover=ROOT/'integrations/gpt-niang/hover/pet-forms.ps1'
assert sha(hover)=='417385707bf825ef4317b0aff7bc0281739ccdae06f48756f9776d20940fb753'
expected['runtime/pet-forms.ps1']=sha(hover)
drift=[k for k,v in expected.items() if sha(live/k)!=v]
assert not drift, f'Concurrent installation changes: {drift}'
assert not OUT.exists(), 'Use a new package directory'
old=(live/target).read_bytes(); nl=b'\r\n' if b'\r\n' in old else b'\n'
before=nl.join([b'  $sx=1.0;$sy=1.0',b'  if($source -and $source.CompositionTarget){',b'    $matrix=$source.CompositionTarget.TransformToDevice;$sx=$matrix.M11;$sy=$matrix.M22',b'  }'])
assert old.count(before)==1
patch=ROOT/'integrations/gpt-niang/startup/pixel-size-dpi.ps1'
after=patch.read_bytes().replace(b'\r\n',b'\n').rstrip(b'\n').replace(b'\n',nl)
new=old.replace(before,after)
OUT.mkdir();(OUT/'files').mkdir();(OUT/'files'/target).write_bytes(new);(OUT/'before.ps1').write_bytes(old)
save(OUT/'source-baseline.json',dict(target=target,sha256=sha(live/target),patch=str(patch.relative_to(ROOT)),patchSha256=sha(patch)))
m['hostFiles']=[dict(target=k,sha256=v) for k,v in expected.items() if k!=target]
m['files']=[dict(target=target,sha256=sha(OUT/'files'/target),previousSha256=sha(live/target))]
m['version']='0.7.3-startup-size.1'
save(OUT/'deployment.json',m)
for name in ('apply-update.ps1','maintenance-runner.ps1','verify-installed.cjs','merge-hooks.cjs','dragon-hooks.json','agent-files/update-helper.ps1'):
    dest=OUT/name;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(BASE/name,dest)
index=load(BASE/'package-integrity.json')
names=[e['path'] for e in index['files'] if not e['path'].startswith('files/')]+['files/'+target]
save(OUT/'package-integrity.json',dict(schema=1,files=[dict(path=n,sha256=sha(OUT/n)) for n in names]))
entry=(BASE/'reviewed-delta.ps1').read_text(encoding='utf-8-sig')
entry=entry.replace("'runtime/dragon-animation/motion-selection.ps1'",repr(target)).replace(sha(BASE/'package-integrity.json'),sha(OUT/'package-integrity.json'))
(OUT/'reviewed-delta.ps1').write_text(entry,encoding='utf-8')
print(json.dumps(dict(package=str(OUT),files=m['files'],preservedDependencies=len(m['hostFiles']))))
