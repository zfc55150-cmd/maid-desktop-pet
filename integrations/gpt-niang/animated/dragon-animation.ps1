# Local frames and bounded status metadata only. This module never reads a
# Codex transcript, sends a request, changes window layering or plays sound.
function Initialize-DragonAnimationSettings($Settings) {
  $script:dragonAnimationEnabled=($Settings.dragonAnimationEnabled -isnot [bool] -or $Settings.dragonAnimationEnabled)
  if($Settings.dragonMotionVersion-ne 1 -and (!$script:characterId -or $script:characterId-eq 'gpt-dragon')){$script:scale=[Math]::Max(1.4,[double]$script:scale)}
  $script:dragonMotionVersion=1
  $script:dragonTouchEnabled=($Settings.dragonTouchEnabled -isnot [bool] -or $Settings.dragonTouchEnabled)
  $script:dragonCodexEnabled=($Settings.dragonCodexEnabled -isnot [bool] -or $Settings.dragonCodexEnabled)
}
function New-DragonCachedFrame($Image) { return @{image=$Image} }
function Set-DragonCachedFrame($Frame) {
  $image=$Frame.image;$stride=$image.PixelWidth*4
  if(!$script:dragonSharedPixels -or $script:dragonSharedPixels.Length-ne $stride*$image.PixelHeight){$script:dragonSharedPixels=New-Object byte[] ($stride*$image.PixelHeight)}
  $image.CopyPixels($script:dragonSharedPixels,$stride,0)
  $script:bitmap=$image;$script:alphaBitmap=$image;$script:alphaStride=$stride;$script:alphaPixels=$script:dragonSharedPixels;$script:ui.Girl.Source=$image
  if($script:widgetColors){foreach($overlay in @($script:widgetColors.halo,$script:widgetColors.tint)){if($overlay -and $overlay.OpacityMask){$overlay.OpacityMask.ImageSource=$image}}}
}
function Test-DragonObservationPaused {
  if($null-eq $script:dragonHasPauseControl){$script:dragonHasPauseControl=[bool](Get-Command Test-WidgetObservationPaused -ErrorAction SilentlyContinue)}
  if($script:dragonHasPauseControl){return [bool](Test-WidgetObservationPaused)}
  return [bool]($script:dataDir -and [IO.File]::Exists((Join-Path $script:dataDir 'task-observers-paused.flag')))
}
function Sync-DragonActivityObserver([long]$Now) {
  $paused=Test-DragonObservationPaused
  if($script:dragonAnimationEnabled -and $script:dragonCodexEnabled -and $script:characterId-eq 'gpt-dragon' -and !$paused){Start-DragonActivityWatch}
  else{Stop-DragonActivityWatch}
  $script:dragonActivityPhase=Get-DragonActivityPhase $Now
}
function Get-DragonActivityPhase([long]$Now) {
  $summary=@{active=0;waiting=0;working=0;thinking=0;completed=0;lastUpdatedAt=0;observerStatus='disabled';observerCode='OBSERVER_DISABLED'}
  $script:dragonTaskSummary=$summary
  if((Test-DragonObservationPaused) -or !$script:dragonCodexEnabled -or !$script:dragonAnimationEnabled -or ($script:characterId -and $script:characterId-ne 'gpt-dragon')){
    if(Test-DragonObservationPaused){$summary.observerStatus='paused';$summary.observerCode='OBSERVER_PAUSED'}
    if($script:dragonPendingEvents){$script:dragonPendingEvents.Clear()};$script:dragonSnapshots=@();return 'idle'
  }
  $summary.observerStatus='degraded';$summary.observerCode=if($script:dragonWatchLastError){$script:dragonWatchLastError}else{'OBSERVER_STARTING'}
  if($Now-ge $script:dragonNextScan){
    $script:dragonNextScan=$Now+500
    $records=New-Object 'System.Collections.Generic.List[object]'
    if([IO.Directory]::Exists($script:dragonActivityDir)){
      try{
        if(([IO.File]::GetAttributes($script:dragonActivityDir)-band [IO.FileAttributes]::ReparsePoint)-ne 0){return 'idle'}
        $files=@(Get-ChildItem -LiteralPath $script:dragonActivityDir -Filter '*.json' -File -ErrorAction Stop | Where-Object {$_.Name-match '^[a-f0-9]{32}\.json$'} | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 64)
        foreach($file in $files){
          if($file.Length-gt 16384 -or ($file.Attributes-band [IO.FileAttributes]::ReparsePoint)-ne 0){continue}
          $key=$file.Name;$stamp=$file.LastWriteTimeUtc.Ticks
          if(!$script:dragonSnapshotCache.ContainsKey($key) -or $script:dragonSnapshotCache[$key].stamp-ne $stamp){
            try{
              $value=[IO.File]::ReadAllText($file.FullName,[Text.Encoding]::UTF8)|ConvertFrom-Json -ErrorAction Stop
              if($value.version-ne 1 -or $value.phase-notin @('idle','thinking','working','waiting','happy','confused') -or $value.at-isnot [ValueType] -or $value.expiresAt-isnot [ValueType]){continue}
              $script:dragonSnapshotCache[$key]=@{stamp=$stamp;value=$value}
            }catch{continue}
          }
          $records.Add($script:dragonSnapshotCache[$key].value)
        }
        $keep=@{};foreach($file in $files){$keep[$file.Name]=$true}
        foreach($key in @($script:dragonSnapshotCache.Keys)){if(!$keep.ContainsKey($key)){$script:dragonSnapshotCache.Remove($key)}}
      }catch{}
    }
    $script:dragonSnapshots=@($records.ToArray())
    $script:dragonObserverHealth=$null
    try{
      $healthFile=Join-Path $script:dragonActivityDir 'observer-health.json'
      if([IO.File]::Exists($healthFile) -and ([IO.FileInfo]::new($healthFile)).Length-le 4096 -and ([IO.File]::GetAttributes($healthFile)-band [IO.FileAttributes]::ReparsePoint)-eq 0){
        $health=[IO.File]::ReadAllText($healthFile,[Text.Encoding]::UTF8)|ConvertFrom-Json
        if($health.version-eq 1 -and $health.at-is [ValueType] -and $health.status-in @('ok','degraded','paused') -and $health.code-in @('OBSERVER_OK','OBSERVER_POLLING','OBSERVER_PARTIAL','OBSERVER_SOURCE_UNAVAILABLE','OBSERVER_PAUSED','OBSERVER_READ_FAILED','OBSERVER_STATE_FAILED')){$script:dragonObserverHealth=$health}
      }
    }catch{}
  }
  $health=$script:dragonObserverHealth
  if($health){
    if($Now-[double]$health.at-le 10000 -and [double]$health.at-le $Now+5000){$summary.observerStatus=[string]$health.status;$summary.observerCode=[string]$health.code}
    else{$summary.observerCode='OBSERVER_STALE'}
  }
  if($Now-ge $script:dragonNextEventScan){$script:dragonNextEventScan=$Now+500;Update-DragonVisualEvents $script:dragonSnapshots $Now}
  $priority=@{waiting=6;working=5;thinking=4;confused=3;happy=2;idle=1}
  $best='idle';$rank=0;$latest=0
  foreach($record in $script:dragonSnapshots){
    if($record.phase-eq 'happy' -and [double]$record.at-ge $Now-60000 -and [double]$record.at-le $Now+5000){$summary.completed++}
    if([double]$record.at-gt $Now+5000 -or [double]$record.expiresAt-le $Now){continue}
    $phase=[string]$record.phase
    if($phase-eq 'confused' -and $record.recoverAt-is [ValueType] -and [double]$record.recoverAt-le $Now){$phase=if(@($record.tools).Count-gt 0){'working'}else{'thinking'}}
    if(!$record.terminal -and $phase-in @('thinking','working','waiting','confused')){$summary.active++}
    if($phase-in @('thinking','working','waiting')){$summary[$phase]++}
    if([double]$record.at-gt $summary.lastUpdatedAt){$summary.lastUpdatedAt=[double]$record.at}
    if($priority[$phase]-gt $rank -or ($priority[$phase]-eq $rank -and [double]$record.at-gt $latest)){$best=$phase;$rank=$priority[$phase];$latest=[double]$record.at}
  }
  return $best
}
function Stop-DragonAnimation {
  if($script:dragonTimer){$script:dragonTimer.Stop();$script:dragonTimer=$null}
  Stop-DragonActivityWatch
  $script:dragonFadePrevious=$null
  if($script:dragonPages){$script:dragonPages.Clear()}
  if($script:dragonLoadRequests){$script:dragonLoadRequests.Clear()}
  if($script:dragonPageOrder){$script:dragonPageOrder.Clear()}
}
function Stop-DragonActivityWatch {
  if($script:dragonWatchProcess){
    try{$script:dragonWatchProcess.StandardInput.Close();if(!$script:dragonWatchProcess.WaitForExit(300)){$script:dragonWatchProcess.Kill()}}catch{}
    try{$script:dragonWatchProcess.Dispose()}catch{}
    $script:dragonWatchProcess=$null
  }
}
function Start-DragonActivityWatch {
  if($script:dragonTestMode -or !$script:dragonCodexEnabled -or !$script:dragonAnimationEnabled -or (Test-DragonObservationPaused)){return}
  if($script:dragonWatchProcess){try{if(!$script:dragonWatchProcess.HasExited){return}}catch{};Stop-DragonActivityWatch}
  $now=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  if($script:dragonWatchRetryAt-gt $now){return}
  $script:dragonWatchRetryAt=$now+30000
  try{
    $start=[Diagnostics.ProcessStartInfo]::new();$start.FileName=[string]$script:config.nodePath
    $watch=Join-Path $script:appDir 'runtime\dragon-animation\activity-watch.mjs'
    $codex=if($script:config.codexHome){[string]$script:config.codexHome}else{Join-Path $env:USERPROFILE '.codex'}
    $start.Arguments='"'+$watch+'" --state-dir "'+$script:dragonActivityDir+'" --codex-home "'+$codex+'"'
    if($script:dataDir){$start.Arguments+=' --pause-file "'+(Join-Path $script:dataDir 'task-observers-paused.flag')+'"'}
    $start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
    $start.RedirectStandardInput=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
    $process=[Diagnostics.Process]::new();$process.StartInfo=$start
    if($process.Start()){$script:dragonWatchProcess=$process;$script:dragonWatchLastError=$null;$null=$process.StandardOutput.ReadToEndAsync();$null=$process.StandardError.ReadToEndAsync()}
    else{$script:dragonWatchLastError='OBSERVER_START_FAILED';$process.Dispose()}
  }catch{$script:dragonWatchLastError='OBSERVER_START_FAILED';if($process){try{$process.Dispose()}catch{}}}
}
. ([ScriptBlock]::Create([IO.File]::ReadAllText((Join-Path $script:appDir 'runtime\dragon-animation\motion-selection.ps1'),[Text.Encoding]::UTF8)))
. ([ScriptBlock]::Create([IO.File]::ReadAllText((Join-Path $script:appDir 'runtime\dragon-animation\motion-runtime.ps1'),[Text.Encoding]::UTF8)))
