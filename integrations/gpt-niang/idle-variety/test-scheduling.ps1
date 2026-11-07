param([string]$PackageRoot=(Join-Path (Get-Location) 'work/gpt-idle-variety-20261102-01'))
$ErrorActionPreference='Stop'
$m=Get-Content (Join-Path $PackageRoot 'deployment.json') -Raw -Encoding UTF8|ConvertFrom-Json
$module=Join-Path $m.targetRoot 'runtime/dragon-animation'
. ([ScriptBlock]::Create([IO.File]::ReadAllText((Join-Path $module 'motion-selection.ps1'))))
$script:dragonManifest=Get-Content (Join-Path $PackageRoot 'files/runtime/dragon-animation/animation.json') -Raw -Encoding UTF8|ConvertFrom-Json
$old=Get-Content (Join-Path $PackageRoot 'baseline-animation.json') -Raw -Encoding UTF8|ConvertFrom-Json
$checks=New-Object 'System.Collections.Generic.List[string]'
function Check([bool]$Value,[string]$Name){if(!$Value){throw $Name};$checks.Add($Name)}
function Get-DragonMonotonicMs{return $script:mono}
function Test-DragonClipAvailable([string]$Clip){return [bool]$script:dragonManifest.states.PSObject.Properties[$Clip]}
function Present([string]$Clip){Reserve-DragonIdleInteraction $Clip;Record-DragonSchedulingPresentation $Clip}
Check (($old.menuGroups|ConvertTo-Json -Compress)-ceq ($script:dragonManifest.menuGroups|ConvertTo-Json -Compress)) 'all-existing-manual-menu-groups-preserved'
Check (($old.touchResponses|ConvertTo-Json -Depth 4 -Compress)-ceq ($script:dragonManifest.touchResponses|ConvertTo-Json -Depth 4 -Compress)) 'touch-reactions-preserved'
Check (($old.transitionClips|ConvertTo-Json -Compress)-ceq ($script:dragonManifest.transitionClips|ConvertTo-Json -Compress)) 'native-return-bridges-preserved'
Check ($old.dragClip-eq $script:dragonManifest.dragClip -and $old.dragLandingClip-eq $script:dragonManifest.dragLandingClip) 'drag-and-landing-unchanged'
foreach($name in $script:dragonManifest.idleInteractionPool){
 Check (Test-DragonClipAvailable $name) ('automatic-media-available-'+$name)
 Check (!(Test-DragonHeldPropScene $name)) ('no-held-prop-auto-'+$name)
 Check ((Get-DragonReturnPose $name)-eq 'frontidle') ('automatic-action-returns-frontidle-'+$name)
 Check ('frontidle'-in @($script:dragonManifest.idleInteractionEntryPoses.$name)) ('legal-front-entry-'+$name)
}
$runs=@()
foreach($mode in @('quiet','natural')){foreach($seed in @(1,17,83)){
 $script:mono=0L;$script:dragonIdleRhythm=$mode;$script:dragonRandom=[Random]::new($seed)
 $script:dragonNaturalRhythmAt=0L;$script:dragonIdleLastPresentedAt=$null;$script:dragonIdlePresentedRecent=@()
 $script:dragonClipPresentedOrder=@{};$script:dragonClipPresentedAt=@{};$script:dragonIdleClipAt=@{};$script:dragonPresentationSequence=0L
 $script:dragonLastUserInteractionAt=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
 $current='frontidle';$events=New-Object 'System.Collections.Generic.List[object]';$last=@{};$previous=''
 while($script:mono-lt 1800000){
  $script:mono+=[long]($script:dragonManifest.states.$current.frames*1000.0/(Get-DragonMediaFps $script:dragonManifest.states.$current))
  $next=Select-DragonNextClip idle $current $script:mono
  Check ([bool]$next) ('valid-selection-'+$mode+'-'+$seed+'-'+$script:mono)
  if($next-in @($script:dragonManifest.idleInteractionPool)){
   Check ($current-eq 'frontidle') ('no-action-cuts-pose-route-'+$mode+'-'+$seed+'-'+$script:mono)
   Check ($next-ne $previous) ('no-consecutive-primary-repeat-'+$mode+'-'+$seed+'-'+$script:mono)
   if($last.ContainsKey($next)){Check (($script:mono-$last[$next])-ge [long]$script:dragonManifest.states.$next.idleCooldownMs) ('cooldown-'+$next+'-'+$mode+'-'+$seed+'-'+$script:mono)}
   $last[$next]=$script:mono;$previous=$next;$events.Add(@{at=$script:mono;clip=$next})
  }
  Check ($next-notin @('flutter','draglanding','fanmishap','lanterninvite','bodybalance')) ('special-scenes-not-random-'+$mode+'-'+$seed+'-'+$script:mono)
  $bridge=Get-DragonAutomaticBridge $current $next
  if($bridge){Present $bridge;$script:mono+=[long]($script:dragonManifest.states.$bridge.frames*1000.0/(Get-DragonMediaFps $script:dragonManifest.states.$bridge))}
  Present $next;$current=$next
 }
 $unique=@($events.ToArray()|ForEach-Object{$_.clip}|Select-Object -Unique)
 Check ($unique.Count-eq 14) ('all-fourteen-reachable-in-30minutes-'+$mode+'-'+$seed)
 $runs+=@{mode=$mode;seed=$seed;unique=$unique;events=$events.ToArray()}
}}
# Cached/preload selection must not consume cooldown or presentation history.
$script:mono=2000000;$before=@{order=$script:dragonClipPresentedOrder;cooldown=$script:dragonIdleClipAt;seq=$script:dragonPresentationSequence}|ConvertTo-Json -Depth 5 -Compress
1..10|ForEach-Object{$null=Select-DragonNextClip idle frontidle $script:mono}
$after=@{order=$script:dragonClipPresentedOrder;cooldown=$script:dragonIdleClipAt;seq=$script:dragonPresentationSequence}|ConvertTo-Json -Depth 5 -Compress
Check ($before-ceq $after) 'preload-does-not-consume-scheduler-history'
$result=@{ok=$true;checks=$checks.Count;runs=$runs;scope='Actual installed scheduler, candidate manifest, simulated clocks and media availability; no desktop playback or settings writes'}
$result|ConvertTo-Json -Depth 8|Set-Content (Join-Path $PackageRoot 'scheduling-verification.json') -Encoding UTF8
@{ok=$true;checks=$checks.Count;runs=$runs.Count;allFourteenReachable=$true}|ConvertTo-Json -Compress
