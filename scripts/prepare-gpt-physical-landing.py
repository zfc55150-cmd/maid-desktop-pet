from pathlib import Path
import json,hashlib,shutil,difflib
ROOT=Path(__file__).resolve().parents[1];BASE=ROOT/'work/gpt-drag-takeoff-20261102-02';OUT=ROOT/'work/gpt-physical-landing-20261102-03';SOURCE=ROOT/'integrations/gpt-niang/drag-response'
load=lambda p:json.loads(p.read_text(encoding='utf-8-sig'));sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def save(p,o):
 p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(o,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
m=load(BASE/'deployment.json');live=Path(m['targetRoot']);expected={e['target']:e['sha256'] for e in m['hostFiles']+m['files']}
drift=[k for k,v in expected.items() if sha(live/k)!=v];assert not drift,drift
assert not OUT.exists(),'Use a fresh package';OUT.mkdir()
managed=[]
def patch(target,fn):
 old=(live/target).read_bytes();txt=old.decode('utf-8-sig');nl='\r\n' if '\r\n' in txt else '\n'
 def replace(a,b):
  nonlocal txt
  a=a.replace('\n',nl);b=b.replace('\n',nl);assert txt.count(a)==1,a[:120];txt=txt.replace(a,b)
 txt=fn(txt,replace,nl);new=txt.encode('utf-8');new=(b'\xef\xbb\xbf'+new) if old.startswith(b'\xef\xbb\xbf') else new
 dest=OUT/'files'/target;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(new)
 backup=OUT/'before'/target;backup.parent.mkdir(parents=True,exist_ok=True);backup.write_bytes(old)
 (SOURCE/Path(target).name).write_bytes(new)
 (OUT/(Path(target).name+'.diff')).write_text(''.join(difflib.unified_diff(old.decode('utf-8-sig').splitlines(True),txt.splitlines(True))),encoding='utf-8')
 managed.append(dict(target=target,sha256=sha(dest),previousSha256=hashlib.sha256(old).hexdigest()))
def native(txt,r,nl):
 def r(a,b):
  nonlocal txt
  a=a.replace('\n',nl);b=b.replace('\n',nl);assert txt.count(a)==1,a[:120];txt=txt.replace(a,b)
 r('public string StopReason {get;private set;}', 'public string StopReason {get;private set;}\n    public long FlightSerial {get;private set;}\n    public long CompletedFlightSerial {get;private set;}')
 # Both successful pointer throws and programmatic Launch create episodes.
 assert txt.count('throwBox=bounds;Flying=true;')==2
 txt=txt.replace('throwBox=bounds;Flying=true;', 'throwBox=bounds;FlightSerial++;Flying=true;')
 r('        StopReason=reason;', '        if(Flying && reason=="rested")CompletedFlightSerial=FlightSerial;\n        StopReason=reason;')
 return txt
def selection(txt,r,nl):
 def r(a,b):
  nonlocal txt
  a=a.replace('\n',nl);b=b.replace('\n',nl);assert txt.count(a)==1,a[:120];txt=txt.replace(a,b)
 r('if($script:petNativeMotion -and $script:petNativeMotion.Flying){return $false}', 'if($script:petNativeMotion -and $script:petNativeMotion.Flying){return $true}')
 start=txt.index('function Get-DragonDragReleaseClip {');end=txt.index('function Get-DragonActionMenuGroup',start)
 fn="""function Get-DragonDragReleaseClip {
  $motion=$script:petNativeMotion;$landing=[string]$script:dragonManifest.dragLandingClip
  if($motion -and !$motion.Flying -and !$motion.Dragging -and $motion.StopReason-eq 'rested' -and
     [long]$motion.FlightSerial-gt 0 -and [long]$motion.CompletedFlightSerial-eq [long]$motion.FlightSerial -and
     $landing -and $script:dragonManifest.states.PSObject.Properties[$landing] -and (Test-DragonClipAvailable $landing)){return $landing}
  return (Get-DragonIdleEntry $script:dragonClip)
}
""".replace('\n',nl)
 return txt[:start]+fn+txt[end:]
def runtime(txt,r,nl):
 def r(a,b):
  nonlocal txt
  a=a.replace('\n',nl);b=b.replace('\n',nl);assert txt.count(a)==1,a[:120];txt=txt.replace(a,b)
 start=txt.index('function Test-DragonDragReleaseHold(');end=txt.index('# Bounded asynchronous atlas decoding')
 helper="""function Test-DragonDragReleaseHold([bool]$Held){return $Held}
function Get-DragonCompletedPhysicalFlight {
  $motion=$script:petNativeMotion
  if(!$motion -or $motion.Flying -or $motion.Dragging){return $false}
  $serial=[long]$motion.FlightSerial
  if($serial-le [long]$script:dragonHandledFlightSerial){return $false}
  # Consume ended episodes even when hidden/disabled or interrupted. Only the
  # native controller can certify that a real flight ended at physical rest.
  $script:dragonHandledFlightSerial=$serial
  return ($motion.StopReason-eq 'rested' -and [long]$motion.CompletedFlightSerial-eq $serial)
}

""".replace('\n',nl)
 txt=txt[:start]+helper+txt[end:]
 r('  Sync-DragonAnimationActivity $now', '  $completedPhysicalFlight=Get-DragonCompletedPhysicalFlight\n  Sync-DragonAnimationActivity $now')
 r('  $dragAnimation=Test-DragonDragReleaseHold $dragAnimation', """  if($completedPhysicalFlight -and !$dragAnimation){
    $freshFlightResponse=($script:dragonManualReason-in @('touch','menu','click-settle') -and (Test-DragonManualActive $now))
    if(!$freshFlightResponse){$script:dragonDragRendering=$true}
  }
  $dragAnimation=Test-DragonDragReleaseHold $dragAnimation""")
 r("$pose=if($script:dragonDragReleaseTimedOut){Get-DragonIdleEntry $script:dragonClip}else{Get-DragonDragReleaseClip};$poseClip=", "$pose=if($completedPhysicalFlight){Get-DragonDragReleaseClip}else{Get-DragonIdleEntry $script:dragonClip};$poseClip=")
 # Do not replay a flight that completed before animation startup/restart.
 r("$script:dragonDragRendering=$false\n    $script:dragonClipSerial=0", "$script:dragonDragRendering=$false\n    $script:dragonHandledFlightSerial=if($script:petNativeMotion){[long]$script:petNativeMotion.FlightSerial}else{0}\n    $script:dragonClipSerial=0")
 return txt
patch('runtime/native-motion.cs',native)
patch('runtime/dragon-animation/motion-selection.ps1',selection)
patch('runtime/dragon-animation/motion-runtime.ps1',runtime)
full=(SOURCE/'motion-runtime.ps1').read_bytes();(SOURCE/'drag-response.ps1').write_bytes(full[:full.index(b'# Bounded asynchronous atlas decoding')])
m['files']=managed;m['hostFiles']=[dict(target=k,sha256=v) for k,v in expected.items() if k not in {e['target'] for e in managed}];m['version']='0.7.3-physical-landing.1';save(OUT/'deployment.json',m)
save(OUT/'source-baseline.json',dict(files=managed))
for name in ('apply-update.ps1','maintenance-runner.ps1','verify-installed.cjs','merge-hooks.cjs','dragon-hooks.json','agent-files/update-helper.ps1'):
 d=OUT/name;d.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(BASE/name,d)
names=[e['path'] for e in load(BASE/'package-integrity.json')['files'] if not e['path'].startswith('files/')]+['files/'+e['target'] for e in managed]
save(OUT/'package-integrity.json',dict(schema=1,files=[dict(path=n,sha256=sha(OUT/n)) for n in names]))
entry=(BASE/'reviewed-delta.ps1').read_text(encoding='utf-8-sig').replace(sha(BASE/'package-integrity.json'),sha(OUT/'package-integrity.json'))
guard="if(@($m.files).Count-ne 1 -or $m.files[0].target-ne 'runtime/dragon-animation/motion-runtime.ps1'){throw 'DELTA_MANAGED_SCOPE_CHANGED'}"
scope="if((@($m.files.target|Sort-Object)-join '|')-cne 'runtime/dragon-animation/motion-runtime.ps1|runtime/dragon-animation/motion-selection.ps1|runtime/native-motion.cs'){throw 'DELTA_MANAGED_SCOPE_CHANGED'}"
assert entry.count(guard)==1;entry=entry.replace(guard,scope);(OUT/'reviewed-delta.ps1').write_text(entry,encoding='utf-8')
print(json.dumps(dict(package=str(OUT),files=managed)))
