from pathlib import Path
import json,hashlib,shutil,difflib
ROOT=Path(__file__).resolve().parents[1];BASE=ROOT/'work/gpt-physical-landing-20261102-03';OUT=ROOT/'work/gpt-held-air-landing-20261102-01';SOURCE=ROOT/'integrations/gpt-niang/drag-response'
load=lambda p:json.loads(p.read_text(encoding='utf-8-sig'));sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def save(p,o):
 p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(o,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
m=load(BASE/'deployment.json');live=Path(m['targetRoot']);expected={e['target']:e['sha256'] for e in m['hostFiles']+m['files']};assert not [k for k,v in expected.items() if sha(live/k)!=v],'Installed drift';assert not OUT.exists();OUT.mkdir();managed=[]
for target in ['runtime/native-motion.cs','runtime/dragon-animation/motion-selection.ps1','runtime/dragon-animation/motion-runtime.ps1']:
 old=(live/target).read_bytes();text=old.decode('utf-8-sig');nl='\r\n' if '\r\n' in text else '\n'
 def r(a,b):
  global text
  a=a.replace('\n',nl);b=b.replace('\n',nl);assert text.count(a)==1,a[:120];text=text.replace(a,b)
 if target.endswith('native-motion.cs'):
  r('public long CompletedFlightSerial {get;private set;}', 'public long CompletedFlightSerial {get;private set;}\n    public long DragSerial {get;private set;}\n    public bool DragFlightEligible {get;private set;}')
  r('State=new PetMotionState{X=r.Left,Y=r.Top};dragVx=dragVy=0;Moved=false;trail.Clear();', 'State=new PetMotionState{X=r.Left,Y=r.Top};dragVx=dragVy=0;Moved=false;trail.Clear();DragSerial++;DragFlightEligible=false;')
  r('if(trail.Count==0||trail[trail.Count-1].X!=x||trail[trail.Count-1].Y!=y)trail.Add(new Sample(now,x,y));', 'if(trail.Count==0||trail[trail.Count-1].X!=x||trail[trail.Count-1].Y!=y)trail.Add(new Sample(now,x,y));\n        if(Moved&&!DragFlightEligible&&Estimate(trail.Select(s=>s.T).ToArray(),trail.Select(s=>s.X).ToArray(),trail.Select(s=>s.Y).ToArray(),now)!=null)DragFlightEligible=true;')
 elif target.endswith('motion-selection.ps1'):
  r('return [bool]$script:petNativeMotion.Moved', 'return [bool]($script:petNativeMotion.Moved -and $script:petNativeMotion.DragFlightEligible)')
  r("  if($motion -and !$motion.Flying -and !$motion.Dragging -and $motion.StopReason-eq 'rested' -and\n     [long]$motion.FlightSerial-gt 0 -and [long]$motion.CompletedFlightSerial-eq [long]$motion.FlightSerial -and\n     $landing -and $script:dragonManifest.states.PSObject.Properties[$landing] -and (Test-DragonClipAvailable $landing)){return $landing}", """  $physicalRest=($motion -and $motion.StopReason-eq 'rested' -and [long]$motion.FlightSerial-gt 0 -and [long]$motion.CompletedFlightSerial-eq [long]$motion.FlightSerial)
  $air=Get-DragonDragClip
  $heldAirRelease=($motion -and $motion.StopReason-eq 'released' -and $motion.DragFlightEligible -and
    [long]$motion.DragSerial-gt 0 -and [long]$script:dragonPresentedDragSerial-eq [long]$motion.DragSerial -and
    $script:dragonClip-eq $air -and $script:dragonLastDrawnClip-eq $air -and
    $script:dragonLastDrawnSerial-ge 0 -and $script:dragonLastDrawnSerial-eq $script:dragonClipSerial -and
    $script:dragonFrameIndex-ge [Math]::Min(66,[int]$script:dragonManifest.states.$air.frames-1))
  if($motion -and !$motion.Flying -and !$motion.Dragging -and ($physicalRest -or $heldAirRelease) -and
     $landing -and $script:dragonManifest.states.PSObject.Properties[$landing] -and (Test-DragonClipAvailable $landing)){return $landing}""")
 else:
  r('$pose=if($completedPhysicalFlight){Get-DragonDragReleaseClip}else{Get-DragonIdleEntry $script:dragonClip};$poseClip=', '$pose=Get-DragonDragReleaseClip;$poseClip=')
  r('if($firstFrame -and $dragPlayback){$script:dragonDragShownAt=Get-DragonMonotonicMs}', 'if($firstFrame -and $dragPlayback){$script:dragonDragShownAt=Get-DragonMonotonicMs;$script:dragonPresentedDragSerial=if($script:petNativeMotion){[long]$script:petNativeMotion.DragSerial}else{0}}')
 new=text.encode('utf-8');new=(b'\xef\xbb\xbf'+new) if old.startswith(b'\xef\xbb\xbf') else new
 dest=OUT/'files'/target;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(new);(SOURCE/Path(target).name).write_bytes(new)
 before=OUT/'before'/target;before.parent.mkdir(parents=True,exist_ok=True);before.write_bytes(old)
 (OUT/(Path(target).name+'.diff')).write_text(''.join(difflib.unified_diff(old.decode('utf-8-sig').splitlines(True),text.splitlines(True))),encoding='utf-8');managed.append(dict(target=target,sha256=sha(dest),previousSha256=hashlib.sha256(old).hexdigest()))
m['files']=managed;m['hostFiles']=[dict(target=k,sha256=v) for k,v in expected.items() if k not in {e['target'] for e in managed}];m['version']='0.7.3-held-air-landing.1';save(OUT/'deployment.json',m);save(OUT/'source-baseline.json',dict(files=managed))
for name in ('apply-update.ps1','maintenance-runner.ps1','verify-installed.cjs','merge-hooks.cjs','dragon-hooks.json','agent-files/update-helper.ps1'):
 d=OUT/name;d.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(BASE/name,d)
names=[e['path'] for e in load(BASE/'package-integrity.json')['files']];save(OUT/'package-integrity.json',dict(schema=1,files=[dict(path=n,sha256=sha(OUT/n)) for n in names]))
entry=(BASE/'reviewed-delta.ps1').read_text(encoding='utf-8-sig').replace(sha(BASE/'package-integrity.json'),sha(OUT/'package-integrity.json'));(OUT/'reviewed-delta.ps1').write_text(entry,encoding='utf-8');print(json.dumps(dict(package=str(OUT),files=managed)))
