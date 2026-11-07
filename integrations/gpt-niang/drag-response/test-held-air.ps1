param([string]$Package=(Join-Path $PSScriptRoot '../../../work/gpt-held-air-landing-20261102-01'))
$ErrorActionPreference='Stop';$Package=[IO.Path]::GetFullPath($Package)
$setup=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'test-policy.ps1'));$setup=$setup.Substring($setup.IndexOf('$ErrorActionPreference='));$setup=$setup.Substring(0,$setup.IndexOf('$m=New-TestManifest'));$setup=$setup.Replace("(Join-Path `$PSScriptRoot '../animated/tests')",("(Join-Path '"+$PSScriptRoot.Replace("'","''")+"' '../animated/tests')"));. ([ScriptBlock]::Create($setup))
. ([ScriptBlock]::Create([IO.File]::ReadAllText((Join-Path $Package 'files/runtime/dragon-animation/motion-selection.ps1'))))
$m=New-TestManifest;$m|Add-Member NoteProperty dragLandingClip 'draglanding';$m.states|Add-Member NoteProperty draglanding ([pscustomobject]@{frames=180;fps=30;loop=$false;sourceKind='continuous-video';pages=@()});$m.returnPoses|Add-Member NoteProperty draglanding 'frontidle'
function Reset-Held([bool]$Eligible){
 Reset-TestRuntime $m;$script:simMono=1000;$script:simAge=0;$script:dragonHandledFlightSerial=0;$script:dragonPresentedDragSerial=0
 $script:petNativeMotion=[pscustomobject]@{Dragging=$true;Moved=$true;Flying=$false;StopReason=$null;AnimationTimer=$null;FlightSerial=0;CompletedFlightSerial=0;DragSerial=1;DragFlightEligible=$Eligible}
}
foreach($eligible in @($false,$true)){
 foreach($f in 0..179){
  Reset-Held $eligible;Tick-DragonAnimation
  if($eligible){
   $script:simAge=if($f-le 66){[long][Math]::Ceiling($f*1000.0/66)}else{1000+[long][Math]::Ceiling(($f-66)*1000.0/37.5)};Tick-DragonAnimation
  }else{Check ($script:dragonClip-ne 'flutter') ('slow-drag-does-not-start-flight-'+$f)}
  $script:petNativeMotion.Dragging=$false;$script:petNativeMotion.StopReason='released';Tick-DragonAnimation
  Check (($script:dragonClip-eq 'draglanding')-eq ($eligible -and $f-ge 66)) ('held-release-'+$eligible+'-'+$f)
 }
}
Reset-Held $true;Tick-DragonAnimation;$script:simAge=1500;Tick-DragonAnimation;$script:petNativeMotion.DragSerial=2;$script:petNativeMotion.Dragging=$false;$script:petNativeMotion.StopReason='released';Tick-DragonAnimation
Check ($script:dragonClip-ne 'draglanding') 'old-presented-flight-cannot-authorize-new-drag'
Reset-Held $true;Tick-DragonAnimation;$script:simAge=1500;Tick-DragonAnimation;$script:petNativeMotion.Dragging=$false;$script:petNativeMotion.StopReason='interrupted';Tick-DragonAnimation
Check ($script:dragonClip-ne 'draglanding') 'capture-or-menu-interruption-is-not-normal-release'
Reset-Held $true;Tick-DragonAnimation;$script:simAge=1500;Tick-DragonAnimation;$script:petNativeMotion.Dragging=$false;$script:petNativeMotion.StopReason='released';Tick-DragonAnimation
Check ($script:dragonClip-eq 'draglanding' -and $script:dragonFrameIndex-eq 0) 'midair-held-release-keeps-complete-landing'
$serial=$script:dragonClipSerial;Tick-DragonAnimation;Check ($script:dragonClipSerial-eq $serial) 'held-release-landing-not-repeated'
Stop-DragonAnimation
$r=@{ok=$true;count=$checks.Count;checks=@($checks.ToArray());settingsWritten=$false;paidCalls=0}
[IO.File]::WriteAllText((Join-Path $Package 'held-tests.json'),($r|ConvertTo-Json -Depth 4),[Text.UTF8Encoding]::new($false));@{ok=$true;count=$checks.Count}|ConvertTo-Json
