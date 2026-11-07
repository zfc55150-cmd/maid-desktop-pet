"""Apply bounded drag-only changes to the exact current WPF runtime."""
from pathlib import Path
import hashlib,json,shutil,difflib
ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'work/gpt-walking-expression-approved-20261101-02'
TOOLS=ROOT/'work/gpt-startup-size-20261101-02'
OUT=ROOT/'work/gpt-drag-responsive-20261101-03'
SOURCE=ROOT/'integrations/gpt-niang/drag-response'
load=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def save(p,o):
 p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(o,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
m=load(BASE/'deployment.json');live=Path(m['targetRoot']);target='runtime/dragon-animation/motion-runtime.ps1'
expected={e['target']:e['sha256'] for e in m['hostFiles']+m['files']}
assert not [k for k,v in expected.items() if sha(live/k)!=v], 'Installed baseline drift'
assert not OUT.exists(), 'Use a fresh package'
old=(live/target).read_bytes();text=old.decode('utf-8-sig');nl='\r\n' if '\r\n' in text else '\n'
def replace(a,b):
 global text
 a=a.replace('\n',nl);b=b.replace('\n',nl)
 assert text.count(a)==1, a[:130]
 text=text.replace(a,b)
replace("    $evicted=($script:dragonPages.Count-le 1);while($script:dragonPageOrder.Count-gt 6){$remove=$script:dragonPageOrder[0];$script:dragonPageOrder.RemoveAt(0);$script:dragonPages.Remove($remove);$evicted=$true};if($evicted){[DragonMotionDecoder]::TrimMemory($false)}", """    $evicted=($script:dragonPages.Count-le 1)
    $warm=@(Get-DragonDragWarmKeys)
    while($script:dragonPageOrder.Count-gt 6){
      $remove=@($script:dragonPageOrder|Where-Object{$_-notin $warm}|Select-Object -First 1)[0]
      if(!$remove){$remove=$script:dragonPageOrder[0]}
      $script:dragonPageOrder.Remove($remove)|Out-Null;$script:dragonPages.Remove($remove);$evicted=$true
    }
    if($evicted){[DragonMotionDecoder]::TrimMemory($false)}""")
replace('  Merge-DragonPageLoads\n  if($script:dragonRecoverClip', '  Merge-DragonPageLoads\n  Request-DragonDragWarmPages\n  if($script:dragonRecoverClip')
replace('  if($dragAnimation){\n    if(!$script:dragonDragRendering)', '  $dragAnimation=Test-DragonDragReleaseHold $dragAnimation\n  if($dragAnimation){\n    if(!$script:dragonDragRendering)')
replace("$script:dragonDragRendering=$true;$script:dragonBridgeTarget=$null}","$script:dragonDragRendering=$true;$script:dragonBridgeTarget=$null;$script:dragonDragShownAt=0;$script:dragonDragReleaseAt=0}")
replace("$pose=Get-DragonDragReleaseClip;$poseClip=", "$pose=if($script:dragonDragReleaseTimedOut){Get-DragonIdleEntry $script:dragonClip}else{Get-DragonDragReleaseClip};$poseClip=")
replace("  $age=[long](Get-DragonClipAge $now)\n  if($manual", """  $dragPlayback=($script:dragonDragRendering -and $script:dragonManualReason-eq 'drag' -and $script:dragonClip-eq (Get-DragonDragClip))
  $entryFrame=if($dragPlayback){Get-DragonDragEntryFrame $script:dragonClip}else{0}
  $playbackRate=if($dragPlayback){1.5}else{1.0}
  $duration=([int]$clip.frames-$entryFrame)*1000.0/$fps/$playbackRate
  $age=[long](Get-DragonClipAge $now)
  if($manual""")
replace("$frame=if($reduced -or $firstFrame){0}","$frame=if($reduced){0}elseif($firstFrame){$entryFrame}")
replace("[int][Math]::Floor($age*$fps/1000))}","$entryFrame+[int][Math]::Floor($age*$fps*$playbackRate/1000))}")
replace("$script:dragonFadePrevious=[DragonMotionDecoder]::Detach($visible);$script:dragonFadeAt=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()", """$script:dragonFadePrevious=[DragonMotionDecoder]::Detach($visible);$script:dragonFadeAt=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        $script:dragonFadeDurationMs=if($script:dragonManualReason-in @('drag','drag-release')){80}else{180}""")
replace("    $script:dragonFrameIndex=$frame;$script:dragonFrameKey=$key;", "    if($firstFrame -and $dragPlayback){$script:dragonDragShownAt=Get-DragonMonotonicMs}\n    $script:dragonFrameIndex=$frame;$script:dragonFrameKey=$key;")
replace("$script:dragonFadeAt)/180.0", "$script:dragonFadeAt)/$(if($script:dragonFadeDurationMs-gt 0){[double]$script:dragonFadeDurationMs}else{180.0})")
helpers=(SOURCE/'drag-response.ps1').read_text(encoding='utf-8-sig').replace('\r\n','\n').rstrip('\n').replace('\n',nl)
text=helpers+nl+nl+text
new=text.encode('utf-8');new=(b'\xef\xbb\xbf'+new) if old.startswith(b'\xef\xbb\xbf') else new
OUT.mkdir();dest=OUT/'files'/target;dest.parent.mkdir(parents=True);dest.write_bytes(new);(OUT/'before.ps1').write_bytes(old)
(SOURCE/'motion-runtime.ps1').write_bytes(new)
(OUT/'runtime.diff').write_text(''.join(difflib.unified_diff(old.decode('utf-8-sig').splitlines(True),text.splitlines(True),fromfile='before',tofile='after')),encoding='utf-8')
save(OUT/'source-baseline.json',dict(target=target,sha256=hashlib.sha256(old).hexdigest(),helpersSha256=sha(SOURCE/'drag-response.ps1')))
m['files']=[dict(target=target,sha256=sha(dest),previousSha256=hashlib.sha256(old).hexdigest())]
m['hostFiles']=[dict(target=k,sha256=v) for k,v in expected.items() if k!=target]
m['version']='0.7.3-drag-responsive.1';save(OUT/'deployment.json',m)
for name in ('apply-update.ps1','maintenance-runner.ps1','verify-installed.cjs','merge-hooks.cjs','dragon-hooks.json','agent-files/update-helper.ps1'):
 d=OUT/name;d.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(TOOLS/name,d)
names=[e['path'] for e in load(TOOLS/'package-integrity.json')['files'] if not e['path'].startswith('files/')]+['files/'+target]
save(OUT/'package-integrity.json',dict(schema=1,files=[dict(path=n,sha256=sha(OUT/n)) for n in names]))
entry=(TOOLS/'reviewed-delta.ps1').read_text(encoding='utf-8-sig').replace("$m.files[0].target-ne 'widget.ps1'", "$m.files[0].target-ne '"+target+"'").replace(sha(TOOLS/'package-integrity.json'),sha(OUT/'package-integrity.json'))
(OUT/'reviewed-delta.ps1').write_text(entry,encoding='utf-8')
print(json.dumps(dict(package=str(OUT),files=m['files'])))
