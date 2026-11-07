from pathlib import Path
import json,hashlib,shutil
ROOT=Path(__file__).resolve().parents[1];BASE=ROOT/'work/gpt-held-air-landing-20261102-01';OUT=ROOT/'work/gpt-gentle-takeoff-20261102-01'
load=lambda p:json.loads(p.read_text(encoding='utf-8-sig'));sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def save(p,o):
 p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(o,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
m=load(BASE/'deployment.json');live=Path(m['targetRoot']);expected={e['target']:e['sha256'] for e in m['hostFiles']+m['files']};assert not [k for k,v in expected.items() if sha(live/k)!=v],'Installed baseline drift';assert not OUT.exists();target='runtime/dragon-animation/motion-runtime.ps1';old=(live/target).read_bytes();new=old
changes=[
 (b'$duration=1000+([int]$clip.frames-66)',b'$duration=1200+([int]$clip.frames-66)'),
 (b'$mediaAge=if($age-lt 1000){$age*(66*1000.0/$fps/1000.0)}else{66*1000.0/$fps+($age-1000)*1.25}',b'$mediaAge=if($age-lt 1200){$age*(66*1000.0/$fps/1200.0)}else{66*1000.0/$fps+($age-1200)*1.25}'),
 (b'0..66 takeoff timeline in one second',b'0..66 takeoff timeline in 1.2 seconds'),
]
for a,b in changes:assert new.count(a)==1;new=new.replace(a,b)
dest=OUT/'files'/target;dest.parent.mkdir(parents=True);dest.write_bytes(new);(OUT/'before.ps1').write_bytes(old);(ROOT/'integrations/gpt-niang/drag-response/motion-runtime.ps1').write_bytes(new)
save(OUT/'source-baseline.json',dict(target=target,sha256=hashlib.sha256(old).hexdigest(),introMs=1200))
m['files']=[dict(target=target,sha256=sha(dest),previousSha256=hashlib.sha256(old).hexdigest())];m['hostFiles']=[dict(target=k,sha256=v) for k,v in expected.items() if k!=target];m['version']='0.7.3-gentle-takeoff.1';save(OUT/'deployment.json',m)
for name in ('apply-update.ps1','maintenance-runner.ps1','verify-installed.cjs','merge-hooks.cjs','dragon-hooks.json','agent-files/update-helper.ps1'):
 d=OUT/name;d.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(BASE/name,d)
names=[e['path'] for e in load(BASE/'package-integrity.json')['files'] if not e['path'].startswith('files/')]+['files/'+target];save(OUT/'package-integrity.json',dict(schema=1,files=[dict(path=n,sha256=sha(OUT/n)) for n in names]))
entry=(BASE/'reviewed-delta.ps1').read_text(encoding='utf-8-sig').replace(sha(BASE/'package-integrity.json'),sha(OUT/'package-integrity.json'))
guard="if((@($m.files.target|Sort-Object)-join '|')-cne 'runtime/dragon-animation/motion-runtime.ps1|runtime/dragon-animation/motion-selection.ps1|runtime/native-motion.cs'){throw 'DELTA_MANAGED_SCOPE_CHANGED'}"
assert entry.count(guard)==1;entry=entry.replace(guard,"if(@($m.files).Count-ne 1 -or $m.files[0].target-ne '"+target+"'){throw 'DELTA_MANAGED_SCOPE_CHANGED'}");(OUT/'reviewed-delta.ps1').write_text(entry,encoding='utf-8');print(json.dumps(dict(package=str(OUT),files=m['files'])))
