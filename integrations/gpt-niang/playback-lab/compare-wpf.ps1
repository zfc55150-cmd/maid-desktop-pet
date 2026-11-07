param([Parameter(Mandatory=$true)][string]$Baseline,[ValidateSet('A','B')][string]$Mode,[int]$Seconds=10,[string]$LabRoot=$PSScriptRoot)
$ErrorActionPreference='Stop'
if(!$LabRoot){$LabRoot=Join-Path (Get-Location) 'integrations/gpt-niang/playback-lab'}
. ([ScriptBlock]::Create([IO.File]::ReadAllText((Join-Path $LabRoot 'lab-common.ps1')))) -Baseline $Baseline -LabRoot $LabRoot
if(![Windows.SystemParameters]::ClientAreaAnimation){throw 'Reduced motion enabled; do not override user setting for benchmark'}
$image=New-Object Windows.Controls.Image;$player=$null
if($Mode-eq 'A'){
 $script:appDir=[IO.Path]::GetFullPath($b.gptRoot);$script:dataDir=Join-Path $Baseline 'A-fake-state';[IO.Directory]::CreateDirectory($script:dataDir)|Out-Null
 $script:dragonTestMode=$true;$script:characterId='gpt-dragon';$script:widgetPetForm='full';$script:window=[pscustomobject]@{IsVisible=$true};$script:ui=@{Girl=$image}
 . ([ScriptBlock]::Create([IO.File]::ReadAllText((Join-Path $script:appDir 'runtime/characters.ps1'))))
 . ([ScriptBlock]::Create([IO.File]::ReadAllText((Join-Path $script:appDir 'runtime/dragon-animation/dragon-animation.ps1'))))
 function Save-Settings {throw 'ISOLATED_A_MUST_NOT_SAVE_SETTINGS'}
 $script:bitmap=Read-WidgetCharacterImage (Join-Path $script:appDir 'assets/gpt-dragon-niang-bust.png');$image.Source=$script:bitmap
 Initialize-DragonAnimationSettings ([pscustomobject]@{dragonMotionVersion=1;dragonCodexEnabled=$false})
 Start-DragonAnimation
 if(!$script:dragonTimer){throw 'Installed A failed to initialize'}
 $script:dragonManualPhase='frontidle';$script:dragonManualReason='click-settle';$script:dragonPhase='';$script:dragonManualUntil=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()+30000
}else{$player=New-Object PlaybackLab.Player($image,(New-Object PlaybackLab.PageCache(216MB)))}
$observer=New-Object PlaybackLab.SourceMetrics($image)
$process=[Diagnostics.Process]::GetCurrentProcess();$process.Refresh();$cpu0=$process.TotalProcessorTime.TotalSeconds
$memory=@();$clock=[Diagnostics.Stopwatch]::StartNew();$nextSample=0
try{
 if($Mode-eq 'B'){$pending=$player.Play((Clip 'frontidle'),1)}
 while($clock.Elapsed.TotalSeconds-lt $Seconds){
  $dispatch=New-Object Windows.Threading.DispatcherFrame
  [Windows.Threading.Dispatcher]::CurrentDispatcher.BeginInvoke([Windows.Threading.DispatcherPriority]::Background,[Action]{$dispatch.Continue=$false})|Out-Null
  [Windows.Threading.Dispatcher]::PushFrame($dispatch)
  if($clock.ElapsedMilliseconds-ge $nextSample){$process.Refresh();$memory+=@{atMs=$clock.Elapsed.TotalMilliseconds;privateBytes=$process.PrivateMemorySize64};$nextSample+=500}
  Start-Sleep -Milliseconds 2
 }
 $process.Refresh();$cpu=$process.TotalProcessorTime.TotalSeconds-$cpu0
 $changes=$observer.Changes
 $details=if($Mode-eq 'A'){@{clip=$script:dragonClip;submitted=$script:dragonPresentedTotal;cachePages=$script:dragonPages.Count;pending=$script:dragonLoadRequests.Count;error=$script:dragonLastError}}else{@{clip=$player.ClipName;submitted=$player.Submitted;trace=$player.Trace;misses=$player.Misses;skipped=$player.Skipped;error=$player.Error}}
 $r=@{ok=($changes.Count-gt 200 -and !$details.error);mode=$Mode;durationMs=$clock.Elapsed.TotalMilliseconds;cpuSeconds=$cpu;memory=$memory;changes=$changes;details=$details;sourceVersion=$b.gptVersion;measurement='Identical compiled observer of Image.Source changes; not compositor or screen FPS';scenario='frontidle, native 30fps, 10-second loop; A uses existing click-settle looping entry';cacheBudgetBBytes=216MB;observerAndSettingsDisabled=$true;productionWindowOpened=$false;screenPresentationVerified=$false}
 [IO.File]::WriteAllText((Join-Path $Baseline ('wpf-'+$Mode+'-comparison.json')),($r|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
 [pscustomobject]@{mode=$Mode;ok=$r.ok;imageSourceChanges=$changes.Count;cpuSeconds=$cpu;firstSourceChangeMs=$changes[0].AtMs}|ConvertTo-Json
 if(!$r.ok){throw 'Comparison failed; inspect isolated report'}
}finally{
 $observer.Dispose()
 if($player){$player.Dispose()}else{Stop-DragonAnimation}
}
