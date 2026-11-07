param([string]$Package=(Join-Path $PSScriptRoot '../../../work/gpt-drag-takeoff-20261102-02'))
$Package=[IO.Path]::GetFullPath($Package);$ErrorActionPreference='Stop'
$setup=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'test-policy.ps1'))
$setup=$setup.Substring($setup.IndexOf("`$ErrorActionPreference="));$setup=$setup.Substring(0,$setup.IndexOf('$m=New-TestManifest'))
$setup=$setup.Replace("(Join-Path `$PSScriptRoot '../animated/tests')",("(Join-Path '"+$PSScriptRoot.Replace("'","''")+"' '../animated/tests')"));. ([ScriptBlock]::Create($setup))
$m=New-TestManifest;$m|Add-Member NoteProperty dragLandingClip 'draglanding'
$m.states|Add-Member NoteProperty draglanding ([pscustomobject]@{frames=180;fps=30;loop=$false;sourceKind='continuous-video';pages=@()})
$m.returnPoses|Add-Member NoteProperty draglanding 'frontidle';$m|Add-Member NoteProperty fullPlayClips @('draglanding')
function Reset-Flight {
 Reset-TestRuntime $m;$script:simMono=1000;$script:simAge=0;$script:dragonDragShownAt=0;$script:dragonDragReleaseAt=0;$script:dragonDragReleaseTimedOut=$false
 $script:petNativeMotion=[pscustomobject]@{Dragging=$true;Moved=$true;Flying=$false;StopReason=$null;AnimationTimer=$null}
}
Reset-Flight;Tick-DragonAnimation;Check ($script:dragonFrameIndex-eq 0) 'takeoff-starts-at-original-frame-zero'
foreach($f in 0..66){
 $script:simAge=[long][Math]::Ceiling($f*1000.0/66);Tick-DragonAnimation
 Check ($script:dragonFrameIndex-eq $f) ('complete-takeoff-timeline-'+$f)
}
foreach($age in @(1200,1600,2200,3000,5000)){
 $script:simAge=$age;Tick-DragonAnimation
 Check ($script:dragonFrameIndex-eq [Math]::Min(179,66+[Math]::Floor(($age-1000)*37.5/1000))) ('airborne-eases-to-1.25x-'+$age)
}
foreach($duration in @(1,20,250,900,1000,2000)){
 Reset-Flight;Tick-DragonAnimation;$script:simMono=1000+$duration;$script:simAge=$duration
 $script:petNativeMotion.Dragging=$false;$script:petNativeMotion.StopReason='released';Tick-DragonAnimation
 Check ($script:dragonClip-eq 'flutter') ('release-does-not-skip-unpresented-takeoff-'+$duration)
 if($duration-lt 1000){$script:simMono=2000;$script:simAge=1000;Tick-DragonAnimation;Check ($script:dragonFrameIndex-eq 66) ('quick-release-completes-visible-lift-'+$duration)}
 Tick-DragonAnimation;Check ($script:dragonClip-eq 'draglanding' -and $script:dragonFrameIndex-eq 0) ('landing-still-starts-at-zero-'+$duration)
}
Reset-Flight;Tick-DragonAnimation;$script:simAge=1000;$script:simMono=2000;Tick-DragonAnimation
$script:petNativeMotion.Dragging=$false;$script:petNativeMotion.StopReason='released';$script:simAge=0;Tick-DragonAnimation
foreach($f in 0..179){$script:simAge=[long][Math]::Ceiling($f*1000.0/36);Tick-DragonAnimation;Check ($script:dragonFrameIndex-eq $f) ('complete-landing-1.2x-'+$f)}
Reset-Flight;$script:testBlockFrames=$true;Tick-DragonAnimation;$script:simMono=1020;$script:petNativeMotion.Dragging=$false;$script:petNativeMotion.StopReason='released';Tick-DragonAnimation
$script:simMono=2620;Tick-DragonAnimation;Check ($script:dragonClip-ne 'flutter' -and $script:dragonClip-ne 'draglanding') 'cold-failure-upper-bound-is-safe'
foreach($reason in @('menu','touch','click-settle')){
 Reset-Flight;Tick-DragonAnimation;$script:petNativeMotion.Dragging=$false;$script:petNativeMotion.StopReason='released'
 $script:dragonPhase='';$script:dragonManualReason=$reason;$script:dragonManualPhase='happy';$script:dragonManualUntil=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()+10000;Tick-DragonAnimation
 Check ($script:dragonClip-eq 'happy') ('fresh-response-interrupts-takeoff-'+$reason)
}
foreach($reason in @('interrupted','unknown')){
 Reset-Flight;Tick-DragonAnimation;$script:petNativeMotion.Dragging=$false;$script:petNativeMotion.StopReason=$reason;Tick-DragonAnimation
 Check (!$script:dragonDragRendering -and $script:dragonClip-ne 'draglanding') ('abnormal-release-not-extended-'+$reason)
}
Reset-Flight;Tick-DragonAnimation;$script:petNativeMotion.Dragging=$false;$script:petNativeMotion.Flying=$true;Tick-DragonAnimation
Check (!$script:dragonDragRendering -and $script:dragonClip-ne 'draglanding') 'throw-not-extended'
Reset-Flight;$script:petNativeMotion=$null;$script:dragonManualReason='menu';$script:dragonManualPhase='flutter';$script:dragonManualUntil=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()+10000;Tick-DragonAnimation
$script:simAge=1000;Tick-DragonAnimation;Check ($script:dragonFrameIndex-eq 30) 'manual-flight-native-speed'
Reset-Flight;$script:dragonWasRendering=$true;Request-DragonDragWarmPages
Check ('flutter:0'-in $script:testRequests -and 'draglanding:0'-in $script:testRequests) 'prewarm-original-takeoff-and-landing'
Stop-DragonAnimation
$r=@{ok=$true;count=$checks.Count;checks=@($checks.ToArray());fakeState=$true;settingsWritten=$false;paidCalls=0}
[IO.File]::WriteAllText((Join-Path $Package 'takeoff-tests.json'),($r|ConvertTo-Json -Depth 4),[Text.UTF8Encoding]::new($false));@{ok=$true;count=$checks.Count}|ConvertTo-Json
