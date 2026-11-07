param([string]$Package=(Join-Path $PSScriptRoot '../../../work/gpt-gentle-takeoff-20261102-01'))
$ErrorActionPreference='Stop';$Package=[IO.Path]::GetFullPath($Package)
$setup=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'test-policy.ps1'));$setup=$setup.Substring($setup.IndexOf('$ErrorActionPreference='));$setup=$setup.Substring(0,$setup.IndexOf('$m=New-TestManifest'));$setup=$setup.Replace("(Join-Path `$PSScriptRoot '../animated/tests')",("(Join-Path '"+$PSScriptRoot.Replace("'","''")+"' '../animated/tests')"));. ([ScriptBlock]::Create($setup))
$m=New-TestManifest;$m|Add-Member NoteProperty dragLandingClip 'draglanding';$m.states|Add-Member NoteProperty draglanding ([pscustomobject]@{frames=180;fps=30;loop=$false;sourceKind='continuous-video';pages=@()});$m.returnPoses|Add-Member NoteProperty draglanding 'frontidle'
function Reset-Gentle {
 Reset-TestRuntime $m;$script:simMono=1000;$script:simAge=0;$script:dragonHandledFlightSerial=0;$script:dragonPresentedDragSerial=0
 $script:petNativeMotion=[pscustomobject]@{Dragging=$true;Moved=$true;Flying=$false;StopReason=$null;AnimationTimer=$null;FlightSerial=0;CompletedFlightSerial=0;DragSerial=1;DragFlightEligible=$true}
}
Reset-Gentle;Tick-DragonAnimation
foreach($f in 0..66){$script:simAge=1+[long][Math]::Ceiling($f*1200.0/66);Tick-DragonAnimation;Check ($script:dragonFrameIndex-eq $f) ('full-gentle-takeoff-'+$f)}
foreach($age in @(1400,1800,2600,5000)){$script:simAge=$age;Tick-DragonAnimation;Check ($script:dragonFrameIndex-eq [Math]::Min(179,66+[Math]::Floor(($age-1200)*37.5/1000))) ('airborne-rate-unchanged-'+$age)}
Reset-Gentle;Tick-DragonAnimation;$script:simAge=1001;Tick-DragonAnimation;Check ($script:dragonFrameIndex-eq 55) 'one-second-still-in-takeoff'
$script:petNativeMotion.Dragging=$false;$script:petNativeMotion.StopReason='released';Tick-DragonAnimation;Check ($script:dragonClip-ne 'draglanding') 'not-yet-airborne-release-still-does-not-land'
Reset-Gentle;Tick-DragonAnimation;$script:simAge=1600;Tick-DragonAnimation;$script:petNativeMotion.Dragging=$false;$script:petNativeMotion.StopReason='released';Tick-DragonAnimation
Check ($script:dragonClip-eq 'draglanding' -and $script:dragonFrameIndex-eq 0) 'midair-release-still-lands'
$script:simAge=2500;Tick-DragonAnimation;Check ($script:dragonFrameIndex-eq 90) 'landing-remains-1.2x'
Stop-DragonAnimation;$r=@{ok=$true;count=$checks.Count;introMs=1200;checks=@($checks.ToArray());settingsWritten=$false;paidCalls=0}
[IO.File]::WriteAllText((Join-Path $Package 'gentle-tests.json'),($r|ConvertTo-Json -Depth 4),[Text.UTF8Encoding]::new($false));@{ok=$true;count=$checks.Count}|ConvertTo-Json
