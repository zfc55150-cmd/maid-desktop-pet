from pathlib import Path
import json,hashlib,shutil,difflib
ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'work/gpt-identity-aligned-20261102-01'
TOOLS=ROOT/'work/gpt-drag-responsive-20261101-03'
OUT=ROOT/'work/gpt-drag-takeoff-20261102-02'
load=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def save(p,o):
 p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(o,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
m=load(BASE/'deployment.json');live=Path(m['targetRoot']);target='runtime/dragon-animation/motion-runtime.ps1'
expected={e['target']:e['sha256'] for e in m['hostFiles']+m['files']}
assert not [k for k,v in expected.items() if sha(live/k)!=v], 'Installed baseline drift'
assert not OUT.exists(), 'Use a new package directory'
old=(live/target).read_bytes();text=old.decode('utf-8-sig');nl='\r\n' if '\r\n' in text else '\n'
def replace(a,b):
 global text
 a=a.replace('\n',nl);b=b.replace('\n',nl);assert text.count(a)==1,a[:120];text=text.replace(a,b)
replace("  if($Clip-eq (Get-DragonDragClip) -and [int]$script:dragonManifest.states.$Clip.frames-gt 66){return 66}\n  return 0", "  # Start with the original standing pose; never skip the takeoff.\n  return 0")
replace("if($script:dragonDragShownAt -and $now-$script:dragonDragShownAt-ge 120){return $false}", "if($script:dragonDragShownAt -and $now-$script:dragonDragShownAt-ge 120 -and\n     $script:dragonLastDrawnClip-eq (Get-DragonDragClip) -and\n     $script:dragonLastDrawnSerial-eq $script:dragonClipSerial -and\n     $script:dragonFrameIndex-ge [Math]::Min(66,[int]$script:dragonManifest.states.($script:dragonClip).frames-1)){return $false}")
replace('$now-$script:dragonDragReleaseAt-ge 400', '$now-$script:dragonDragReleaseAt-ge 1600')
replace("  $playbackRate=if($dragPlayback){1.5}else{1.0}\n  $duration=([int]$clip.frames-$entryFrame)*1000.0/$fps/$playbackRate\n  $age=[long](Get-DragonClipAge $now)", """  $landingPlayback=($script:dragonManualReason-eq 'drag-release' -and $script:dragonClip-eq [string]$script:dragonManifest.dragLandingClip)
  $playbackRate=if($dragPlayback){1.25}elseif($landingPlayback){1.2}else{1.0}
  $duration=([int]$clip.frames-$entryFrame)*1000.0/$fps/$playbackRate
  $age=[long](Get-DragonClipAge $now)
  $mediaAge=$age*$playbackRate
  if($dragPlayback -and [int]$clip.frames-gt 66){
    # Retain the complete 0..66 takeoff timeline in one second, then ease
    # into a slower airborne pass. Menu playback remains at native speed.
    $duration=1000+([int]$clip.frames-66)*1000.0/$fps/1.25
    $mediaAge=if($age-lt 1000){$age*(66*1000.0/$fps/1000.0)}else{66*1000.0/$fps+($age-1000)*1.25}
  }""")
replace('$entryFrame+[int][Math]::Floor($age*$fps*$playbackRate/1000)', '$entryFrame+[int][Math]::Floor($mediaAge*$fps/1000)')
replace('if($page.count-$local-lt 18){', 'if($page.count-$local-lt $(if($Clip-eq (Get-DragonDragClip)){32}else{18})){')
new=text.encode('utf-8');new=(b'\xef\xbb\xbf'+new) if old.startswith(b'\xef\xbb\xbf') else new
OUT.mkdir();dest=OUT/'files'/target;dest.parent.mkdir(parents=True);dest.write_bytes(new);(OUT/'before.ps1').write_bytes(old)
source=ROOT/'integrations/gpt-niang/drag-response';(source/'motion-runtime.ps1').write_bytes(new)
(source/'drag-response.ps1').write_bytes(text[:text.index('# Bounded asynchronous atlas decoding')].encode('utf-8'))
(OUT/'runtime.diff').write_text(''.join(difflib.unified_diff(old.decode('utf-8-sig').splitlines(True),text.splitlines(True))),encoding='utf-8')
save(OUT/'source-baseline.json',dict(target=target,sha256=hashlib.sha256(old).hexdigest()))
m['files']=[dict(target=target,sha256=sha(dest),previousSha256=hashlib.sha256(old).hexdigest())];m['hostFiles']=[dict(target=k,sha256=v) for k,v in expected.items() if k!=target];m['version']='0.7.3-drag-responsive.2';save(OUT/'deployment.json',m)
for name in ('apply-update.ps1','maintenance-runner.ps1','verify-installed.cjs','merge-hooks.cjs','dragon-hooks.json','agent-files/update-helper.ps1'):
 d=OUT/name;d.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(TOOLS/name,d)
names=[e['path'] for e in load(TOOLS/'package-integrity.json')['files'] if not e['path'].startswith('files/')]+['files/'+target]
save(OUT/'package-integrity.json',dict(schema=1,files=[dict(path=n,sha256=sha(OUT/n)) for n in names]))
entry=(TOOLS/'reviewed-delta.ps1').read_text(encoding='utf-8-sig').replace(sha(TOOLS/'package-integrity.json'),sha(OUT/'package-integrity.json'));(OUT/'reviewed-delta.ps1').write_text(entry,encoding='utf-8')
print(json.dumps(dict(package=str(OUT),files=m['files'])))
