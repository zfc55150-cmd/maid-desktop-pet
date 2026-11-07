param([string]$Package=(Join-Path $PSScriptRoot '../../../work/gpt-drag-responsive-20261101-03'))
$ErrorActionPreference='Stop';$Package=[IO.Path]::GetFullPath($Package)
$installed='$env:LOCALAPPDATA/Programs/GPTNiangUsage/gpt-niang-usage'
Add-Type -AssemblyName PresentationFramework,PresentationCore,WindowsBase
Add-Type -TypeDefinition ([IO.File]::ReadAllText((Join-Path $installed 'runtime/dragon-animation/motion-decoder.cs'))) -ReferencedAssemblies @('System.dll','System.Core.dll',[Windows.Media.Imaging.BitmapSource].Assembly.Location,[Windows.Rect].Assembly.Location,[Windows.Markup.IUriContext].Assembly.Location)
$testRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../animated/tests'))
$harness=[IO.File]::ReadAllText((Join-Path $testRoot 'approved-actions-runtime.ps1'))
$harness=$harness.Substring($harness.IndexOf('$ErrorActionPreference='));$harness=$harness.Substring(0,$harness.IndexOf('$manifest=New-TestManifest;Reset-TestRuntime $manifest'))
$harness=$harness.Replace('$PSScriptRoot',("'"+$testRoot.Replace("'","''")+"'"));$Report=Join-Path $Package 'unused.json'
. ([ScriptBlock]::Create($harness))
. ([ScriptBlock]::Create([IO.File]::ReadAllText((Join-Path $installed 'runtime/dragon-animation/motion-selection.ps1'))))
. ([ScriptBlock]::Create([IO.File]::ReadAllText((Join-Path $Package 'files/runtime/dragon-animation/motion-runtime.ps1'))))
$merge=(Get-Command Merge-DragonPageLoads).ScriptBlock
function Merge-DragonPageLoads {}
function Request-DragonMotionPage([string]$Clip,[int]$Page){$script:testRequests+=@($Clip+':'+$Page)}
function Get-DragonMotionFrame([string]$Clip,[int]$Index){if($script:testBlockFrames){return $null};return @{image=$script:testBitmap}}
function Get-DragonMonotonicMs {return [long]$script:simMono}
function Get-DragonClipAge([long]$Now){return [long]$script:simAge}
$m=New-TestManifest
$m|Add-Member NoteProperty dragLandingClip 'draglanding'
$m.states|Add-Member NoteProperty draglanding ([pscustomobject]@{frames=180;fps=30;loop=$false;sourceKind='continuous-video';pages=@()})
$m.returnPoses|Add-Member NoteProperty draglanding 'frontidle'
$m|Add-Member NoteProperty fullPlayClips @('draglanding')
function Reset-Responsive {
 Reset-TestRuntime $m;$script:simMono=1000;$script:simAge=0;$script:dragonDragShownAt=0;$script:dragonDragReleaseAt=0;$script:dragonDragReleaseTimedOut=$false;$script:dragonFadeDurationMs=0
 $script:petNativeMotion=[pscustomobject]@{Dragging=$true;Moved=$true;Flying=$false;StopReason=$null;AnimationTimer=$null}
}
Reset-Responsive;Tick-DragonAnimation
Check ($script:dragonClip-eq 'flutter' -and $script:dragonFrameIndex-eq 66) 'held-drag-enters-lifted-pose'
foreach($age in @(20,100,200,500,1500,3000)){
 $script:simAge=$age;Tick-DragonAnimation
 Check ($script:dragonFrameIndex-eq [Math]::Min(179,66+[Math]::Floor($age*45/1000))) ('drag-playback-rate-'+$age)
}
foreach($duration in @(1,20,80,119,120,250,3000)){
 Reset-Responsive;Tick-DragonAnimation;$script:simMono=1000+$duration;$script:petNativeMotion.Dragging=$false;$script:petNativeMotion.StopReason='released';Tick-DragonAnimation
 if($duration-lt 120){
  Check ($script:dragonClip-eq 'flutter') ('quick-release-keeps-visible-flight-'+$duration)
  $script:simMono=1120;Tick-DragonAnimation
 }
 Check ($script:dragonClip-eq 'draglanding' -and $script:dragonFrameIndex-eq 0) ('release-preserves-full-landing-'+$duration)
 if([Windows.SystemParameters]::ClientAreaAnimation){Check ($script:dragonFadeDurationMs-eq 80) ('short-drag-transition-'+$duration)}
}
Reset-Responsive;$script:testBlockFrames=$true;$before=$script:ui.Girl.Source;Tick-DragonAnimation
Check ([object]::ReferenceEquals($before,$script:ui.Girl.Source)) 'cold-flight-retains-current-visible-frame'
$script:simMono=1020;$script:petNativeMotion.Dragging=$false;$script:petNativeMotion.StopReason='released';Tick-DragonAnimation
Check ($script:dragonClip-eq 'flutter') 'cold-quick-release-waits-for-takeoff'
$script:testBlockFrames=$false;$script:simMono=1100;Tick-DragonAnimation
Check ($script:dragonFrameIndex-eq 66) 'late-flight-starts-at-lifted-pose'
$script:simMono=1219;Tick-DragonAnimation;Check ($script:dragonClip-eq 'flutter') 'actual-flight-presentation-not-release-clock-controls-minimum'
$script:simMono=1220;Tick-DragonAnimation;Check ($script:dragonClip-eq 'draglanding') 'cold-quick-release-keeps-landing-after-visible-flight'
Reset-Responsive;$script:testBlockFrames=$true;Tick-DragonAnimation;$script:simMono=1020;$script:petNativeMotion.Dragging=$false;$script:petNativeMotion.StopReason='released';Tick-DragonAnimation
$script:simMono=1420;Tick-DragonAnimation;Check ($script:dragonClip-ne 'flutter' -and $script:dragonClip-ne 'draglanding') 'failed-entry-times-out-without-groundless-landing'
foreach($reason in @('interrupted','unknown',$null)){
 Reset-Responsive;Tick-DragonAnimation;$script:petNativeMotion.Dragging=$false;$script:petNativeMotion.StopReason=$reason;Tick-DragonAnimation
 Check ($script:dragonClip-ne 'draglanding' -and !$script:dragonDragRendering) ('abnormal-release-no-pending-flight-'+$reason)
}
Reset-Responsive;Tick-DragonAnimation;$script:petNativeMotion.Dragging=$false;$script:petNativeMotion.Flying=$true;Tick-DragonAnimation
Check ($script:dragonClip-ne 'draglanding' -and !$script:dragonDragRendering) 'throw-is-not-a-grounded-landing'
foreach($reason in @('menu','touch','click-settle')){
 Reset-Responsive;Tick-DragonAnimation;$script:petNativeMotion.Dragging=$false;$script:petNativeMotion.StopReason='released'
 $script:dragonManualReason=$reason;$script:dragonManualPhase='happy';$script:dragonPhase='';$script:dragonManualUntil=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()+10000;Tick-DragonAnimation
 Check ($script:dragonClip-eq 'happy') ('fresh-response-wins-'+$reason)
}
Reset-Responsive;Tick-DragonAnimation;$script:simMono=1200;$script:petNativeMotion.Dragging=$false;$script:petNativeMotion.StopReason='released';Tick-DragonAnimation
$script:petNativeMotion.Dragging=$true;$script:petNativeMotion.StopReason=$null;Tick-DragonAnimation
Check ($script:dragonClip-eq 'flutter' -and $script:dragonFrameIndex-eq 66) 'regrab-interrupts-landing-immediately'
Reset-Responsive;$script:petNativeMotion=$null;$script:dragonManualReason='menu';$script:dragonManualPhase='flutter';$script:dragonManualUntil=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()+10000;Tick-DragonAnimation
Check ($script:dragonFrameIndex-eq 0) 'menu-flight-still-starts-at-native-zero'
$script:simAge=1000;Tick-DragonAnimation;Check ($script:dragonFrameIndex-eq 30) 'menu-flight-still-native-speed'
Reset-Responsive;$script:petNativeMotion=$null;$script:dragonManualReason='menu';$script:dragonManualPhase='draglanding';$script:dragonManualUntil=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()+10000;Tick-DragonAnimation
foreach($f in 0..179){$script:simAge=[long][Math]::Ceiling($f*1000.0/30);Tick-DragonAnimation;Check ($script:dragonFrameIndex-eq $f) ('landing-native-frame-and-speed-'+$f)}
Reset-Responsive;$script:dragonWasRendering=$true;Request-DragonDragWarmPages
Check ('flutter:1'-in $script:testRequests -and 'draglanding:0'-in $script:testRequests) 'warm-flight-entry-and-landing-start'
$script:widgetPetForm='bust';$script:testRequests=@();Request-DragonDragWarmPages;Check (!$script:testRequests.Count) 'bust-does-not-warm-hidden-flight'
Reset-Responsive
foreach($k in @('flutter:1','draglanding:0','frontidle:0','thinking:0','happy:0','wave:0')){$script:dragonPages[$k]=$script:testBitmap;$script:dragonPageOrder.Add($k)}
$t=New-Object 'System.Threading.Tasks.TaskCompletionSource[object]';$t.SetResult($script:testBitmap);$script:dragonLoadRequests['tea:0']=@{task=$t.Task}
& $merge
Check ($script:dragonPages.Count-eq 6) 'pinned-entry-pages-do-not-increase-cache-cap'
Check ($script:dragonPages.ContainsKey('flutter:1') -and $script:dragonPages.ContainsKey('draglanding:0')) 'unrelated-eviction-keeps-both-warm-pages'
Check (!$script:dragonPages.ContainsKey('frontidle:0')) 'ordinary-lru-victim-used-for-eviction'
Stop-DragonAnimation
$result=@{ok=$true;count=$checks.Count;checks=@($checks.ToArray());fakeState=$true;realWpfBlend=$true;settingsWritten=$false;paidCalls=0}
[IO.File]::WriteAllText((Join-Path $Package 'policy-tests.json'),($result|ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false));@{ok=$true;count=$checks.Count}|ConvertTo-Json
