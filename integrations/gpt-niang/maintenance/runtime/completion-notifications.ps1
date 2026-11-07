if(!('CompletionWindowLayer' -as [type])){
  Add-Type -TypeDefinition @'
using System;using System.Runtime.InteropServices;
public static class CompletionWindowLayer {
 [StructLayout(LayoutKind.Sequential)]public struct Rect{public int Left,Top,Right,Bottom;}
 [DllImport("user32.dll")]public static extern bool GetWindowRect(IntPtr h,out Rect r);
 [DllImport("user32.dll")]public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")]public static extern IntPtr GetWindow(IntPtr h,uint command);
 [DllImport("user32.dll")]public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")]public static extern bool IsWindow(IntPtr h);
 [DllImport("user32.dll",EntryPoint="GetWindowLongPtrW")]public static extern IntPtr GetWindowLongPtr(IntPtr h,int i);
 [DllImport("user32.dll",EntryPoint="SetWindowLongPtrW")]public static extern IntPtr SetWindowLongPtr(IntPtr h,int i,IntPtr value);
 [DllImport("user32.dll")]public static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int width,int height,uint flags);
}
'@
}

function Test-CompletionFullscreen([IntPtr]$Handle){
  if($Handle-eq [IntPtr]::Zero -or ![CompletionWindowLayer]::IsWindow($Handle)){return $false}
  $rect=New-Object CompletionWindowLayer+Rect
  if(![CompletionWindowLayer]::GetWindowRect($Handle,[ref]$rect)){return $false}
  $area=[Windows.Forms.Screen]::FromHandle($Handle).Bounds
  return $rect.Left-le $area.Left -and $rect.Top-le $area.Top -and $rect.Right-ge $area.Right -and $rect.Bottom-ge $area.Bottom
}
function Stop-TemporaryCompletion {
  $state=$script:completionTemporary;$script:completionTemporary=$null
  if(!$state){return}
  if($state.timer){$state.timer.Stop()}
  try{
    if([CompletionWindowLayer]::IsWindow($script:widgetHandle)){
      $script:window.Topmost=$state.topmost
      [CompletionWindowLayer]::SetWindowLongPtr($script:widgetHandle,-20,$state.style)|Out-Null
      $owner=if([CompletionWindowLayer]::IsWindow($state.owner)){$state.owner}else{[IntPtr]::Zero}
      $band=if(($state.style.ToInt64()-band 8)-ne 0){[IntPtr](-1)}else{[IntPtr](-2)}
      # Demote and place the detached widget before restoring its owner. An
      # owned window near the front can otherwise raise Codex with it.
      [CompletionWindowLayer]::SetWindowPos($script:widgetHandle,$band,0,0,0,0,0x213)|Out-Null
      if(!$state.visible){$script:window.Hide()}
      $after=if($owner-ne [IntPtr]::Zero){[CompletionWindowLayer]::GetWindow($owner,3)}else{$state.previous}
      while($after-ne [IntPtr]::Zero -and [CompletionWindowLayer]::IsWindow($after) -and ($after-eq $script:widgetHandle -or ![CompletionWindowLayer]::IsWindowVisible($after))){$after=[CompletionWindowLayer]::GetWindow($after,3)}
      if($after-eq $script:widgetHandle -or ![CompletionWindowLayer]::IsWindow($after) -or ([CompletionWindowLayer]::GetWindowLongPtr($after,-20).ToInt64()-band 8)-ne ($state.style.ToInt64()-band 8)){$after=[IntPtr]::Zero}
      [CompletionWindowLayer]::SetWindowPos($script:widgetHandle,$after,0,0,0,0,0x213)|Out-Null
      [CompletionWindowLayer]::SetWindowLongPtr($script:widgetHandle,-8,$owner)|Out-Null
    }
  }catch{}
  $script:lastPosition=$null;$script:attachedHost=[IntPtr]::Zero
}
function Start-TemporaryCompletion {
  if($script:completionTemporary){return $true}
  $foreground=[CompletionWindowLayer]::GetForegroundWindow()
  $script:completionTemporary=@{owner=[CompletionWindowLayer]::GetWindowLongPtr($script:widgetHandle,-8);style=[CompletionWindowLayer]::GetWindowLongPtr($script:widgetHandle,-20);topmost=$script:window.Topmost;visible=$script:window.IsVisible;previous=[CompletionWindowLayer]::GetWindow($script:widgetHandle,3);foreground=$foreground;fullscreen=(Test-CompletionFullscreen $foreground);expiresAt=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()+7000;timer=$null}
  try{
    if($script:occlusionRecovery){$script:occlusionRecovery.Configure([IntPtr]::Zero,$false)}
    if($script:hostFollower){$script:hostFollower.Detach()}
    [CompletionWindowLayer]::SetWindowLongPtr($script:widgetHandle,-8,[IntPtr]::Zero)|Out-Null
    $script:window.Show()
    $style=$script:completionTemporary.style.ToInt64()-bor 0x08000020
    [CompletionWindowLayer]::SetWindowLongPtr($script:widgetHandle,-20,[IntPtr]$style)|Out-Null
    $script:window.Topmost=$true
    if(![CompletionWindowLayer]::SetWindowPos($script:widgetHandle,[IntPtr](-1),0,0,0,0,0x13)){throw 'Temporary reminder layer failed'}
    $timer=[Windows.Threading.DispatcherTimer]::new();$timer.Interval=[TimeSpan]::FromMilliseconds(100)
    $timer.Add_Tick({
      if(!$script:completionTemporary){return}
      try{
        $now=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        $active=Test-WidgetCompletionHostForeground
        $foreground=[CompletionWindowLayer]::GetForegroundWindow()
        $leftFullscreen=$script:completionTemporary.fullscreen -and ($foreground-ne $script:completionTemporary.foreground -or !(Test-CompletionFullscreen $foreground))
        if($active -or $leftFullscreen){Dismiss-CompletionNotification;if(!$script:collapsed){Hide-Quota -KeepCompletion}}
        # An error while opening the scene must never leave a topmost
        # click-through reminder layer pinned on screen. This independent
        # deadline works even when sceneDeadline was never set.
        elseif($now-ge $script:completionTemporary.expiresAt){Hide-Quota}
        elseif($script:sceneDeadline-gt 0 -and $now-ge $script:sceneDeadline){Hide-Quota}
      }catch{try{Stop-TemporaryCompletion}catch{}}
    })
    $script:completionTemporary.timer=$timer;$timer.Start();return $true
  }catch{
    Stop-TemporaryCompletion;$script:completionLastError='COMPLETION_LAYER_FAILED';return $false
  }
}

if(!('GptCompletionMonitorOutput' -as [type])){
  Add-Type -TypeDefinition @'
using System;
using System.Diagnostics;
using System.Collections.Generic;
public static class GptCompletionMonitorOutput {
  static readonly object Gate=new object();
  static readonly Queue<string> Lines=new Queue<string>();
  static string Active=null;
  public static string LastError {get;private set;}
  public static void Attach(Process process,string token){
    lock(Gate){Active=token;Lines.Clear();LastError=null;}
    process.OutputDataReceived+=(sender,args)=>{
      if(args.Data==null || args.Data.Length>2048)return;
      lock(Gate){if(Active!=token)return;if(Lines.Count>=64)Lines.Dequeue();Lines.Enqueue(args.Data);}
    };
    process.ErrorDataReceived+=(sender,args)=>{
      if(args.Data==null)return;
      lock(Gate){if(Active==token)LastError="OBSERVER_PROCESS_ERROR";}
    };
  }
  public static bool TryRead(out string line){lock(Gate){if(Lines.Count>0){line=Lines.Dequeue();return true;}line=null;return false;}}
  public static void Clear(){lock(Gate){Active=null;Lines.Clear();}}
}
'@
}

function Initialize-CompletionNotificationState($Settings=$null) {
  $script:completionNotificationsEnabled=($Settings.taskCompletionBubble-is [bool] -and $Settings.taskCompletionBubble)
  $script:completionPending=$false;$script:completionProcess=$null;$script:completionRetryAfter=0
  $script:completionReceived=0;$script:completionDisplayCount=0;$script:completionLastError=$null
  $script:completionAcknowledgedAt=0;$script:completionTemporary=$null
  $script:completionPendingCount=0
}
function Clear-CompletionNotifications {$script:completionPending=$false;$script:completionPendingCount=0;[GptCompletionMonitorOutput]::Clear()}
function Dismiss-CompletionNotification {
  Stop-TemporaryCompletion
  $script:completionAcknowledgedAt=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $script:completionPending=$false;$script:completionPendingCount=0;Reset-WidgetAutoQuoteSchedule
}

function Test-CompletionObservationPaused {
  if($null-eq $script:completionHasPauseControl){$script:completionHasPauseControl=[bool](Get-Command Test-WidgetObservationPaused -ErrorAction SilentlyContinue)}
  if($script:completionHasPauseControl){return [bool](Test-WidgetObservationPaused)}
  return [bool]($script:dataDir -and [IO.File]::Exists((Join-Path $script:dataDir 'task-observers-paused.flag')))
}
function Clear-WidgetTaskObserverState {
  # The caller owns the pause flag. Workers enforce the same precondition and
  # remove only their fixed generated-state whitelist, never a rollout.
  if(!(Test-CompletionObservationPaused)){throw 'OBSERVERS_MUST_BE_PAUSED'}
  Stop-CompletionMonitor
  if(Get-Command Stop-DragonActivityWatch -ErrorAction SilentlyContinue){Stop-DragonActivityWatch}
  $flag=Join-Path $script:dataDir 'task-observers-paused.flag'
  $jobs=@(@{module='runtime\completion-monitor.mjs';arguments='"'+(Join-Path $script:dataDir 'completion-monitor-state.json')+'" --clear-state'},@{module='runtime\dragon-animation\activity-watch.mjs';arguments='--state-dir "'+(Join-Path $script:dataDir 'activity')+'" --clear-state'})
  foreach($job in $jobs){
    $start=[Diagnostics.ProcessStartInfo]::new();$start.FileName=[string]$script:config.nodePath
    $start.Arguments='"'+(Join-Path $script:appDir $job.module)+'" '+$job.arguments+' --pause-file "'+$flag+'"'
    $start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
    $start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
    $process=[Diagnostics.Process]::new();$process.StartInfo=$start
    try{if(!$process.Start()){throw 'OBSERVER_CLEAR_FAILED'};$out=$process.StandardOutput.ReadToEndAsync();$err=$process.StandardError.ReadToEndAsync();if(!$process.WaitForExit(5000)){$process.Kill();throw 'OBSERVER_CLEAR_FAILED'};if($process.ExitCode-ne 0){throw 'OBSERVER_CLEAR_FAILED'}}catch{throw 'OBSERVER_CLEAR_FAILED'}finally{$process.Dispose()}
  }
  $script:dragonSnapshots=@();$script:dragonSnapshotCache=@{};$script:dragonObserverHealth=$null
  if($script:dragonPendingEvents){$script:dragonPendingEvents.Clear()}
  Clear-CompletionNotifications
  return @{cleared=$true;scope='generated-task-state';paused=$true}
}

function Start-CompletionMonitor {
  if(!$script:completionNotificationsEnabled){return}
  if(Test-CompletionObservationPaused){Stop-CompletionMonitor;return}
  if($script:completionProcess){
    if(!$script:completionProcess.HasExited){return}
    $script:completionLastError=[GptCompletionMonitorOutput]::LastError
    $script:completionProcess.Dispose();$script:completionProcess=$null
  }
  $now=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  if($now-lt $script:completionRetryAfter){return}
  $process=$null
  try{
    $start=New-Object Diagnostics.ProcessStartInfo
    $start.FileName=[string]$script:config.nodePath
    # The state file lets a restarted monitor recover completions that landed
    # between its crash and the restart instead of baselining them away. Tests
    # and partial harnesses may not have a data directory yet.
    $monitorArguments='"'+(Join-Path $script:appDir 'runtime\completion-monitor.mjs')+'"'
    if($script:dataDir){$monitorArguments+=' "'+(Join-Path $script:dataDir 'completion-monitor-state.json')+'"'}
    if($script:dataDir){$monitorArguments+=' --pause-file "'+(Join-Path $script:dataDir 'task-observers-paused.flag')+'"'}
    $start.Arguments=$monitorArguments
    $start.WorkingDirectory=$script:appDir;$start.UseShellExecute=$false;$start.CreateNoWindow=$true
    if($script:config.codexHome){$start.EnvironmentVariables['CODEX_HOME']=[IO.Path]::GetFullPath([string]$script:config.codexHome)}
    $start.RedirectStandardInput=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
    $start.StandardOutputEncoding=[Text.UTF8Encoding]::new($false);$start.StandardErrorEncoding=[Text.UTF8Encoding]::new($false)
    $process=New-Object Diagnostics.Process;$process.StartInfo=$start
    [GptCompletionMonitorOutput]::Attach($process,[Guid]::NewGuid().ToString('N'))
    if(!$process.Start()){throw 'The reply monitor did not start.'}
    $process.BeginOutputReadLine();$process.BeginErrorReadLine()
    $script:completionProcess=$process;$script:completionLastError=$null;$script:completionRetryAfter=$now+5000
  }catch{
    [GptCompletionMonitorOutput]::Clear()
    if($process){try{if(!$process.HasExited){$process.Kill();$null=$process.WaitForExit(200)}}catch{};$process.Dispose()};$script:completionProcess=$null
    $script:completionLastError='OBSERVER_START_FAILED';$script:completionRetryAfter=$now+5000
  }
}
function Stop-CompletionMonitor {
  Stop-TemporaryCompletion
  [GptCompletionMonitorOutput]::Clear()
  if(!$script:completionProcess){return}
  try{
    if(!$script:completionProcess.HasExited){
      $script:completionProcess.StandardInput.Close()
      if(!$script:completionProcess.WaitForExit(200)){$script:completionProcess.Kill();$null=$script:completionProcess.WaitForExit(200)}
    }
  }catch{}
  $script:completionProcess.Dispose();$script:completionProcess=$null
}
function Set-CompletionNotificationEnabled([bool]$Enabled) {
  if($Enabled-eq $script:completionNotificationsEnabled){return}
  $script:completionNotificationsEnabled=$Enabled;$script:completionRetryAfter=0
  if($Enabled){Start-CompletionMonitor}
  else{
    Stop-CompletionMonitor;Clear-CompletionNotifications
    $script:completionLastError=$null
    if(!$script:collapsed -and $script:bubbleMode-eq 'completion'){Hide-Quota}
  }
  Reset-WidgetAutoQuoteSchedule;Save-Settings
}
function Receive-CompletionMonitorLine([string]$Line) {
  if(!$script:completionNotificationsEnabled -or $Line.Length-gt 2048){return}
  try{
    $event=$Line|ConvertFrom-Json
    if($event.type-ne 'completion' -or $event.sessionId-isnot [string] -or $event.turnId-isnot [string] -or !$event.sessionId -or !$event.turnId){return}
    if($null-eq $event.endedAt -or [double]$event.endedAt-lt $script:completionAcknowledgedAt){return}
    $script:completionReceived++;$script:completionPending=$true;$script:completionPendingCount=[Math]::Min(4096,[int]$script:completionPendingCount+1)
  }catch{}
}
function Read-CompletionMonitorOutput {
  $line=$null
  for($i=0;$i-lt 64 -and [GptCompletionMonitorOutput]::TryRead([ref]$line);$i++){
    Receive-CompletionMonitorLine $line;$line=$null
  }
}
function Test-CompletionDisplayAllowed([bool]$Visible) {
  return $Visible -and $script:window.IsVisible -and ![bool]$script:drag -and !$script:context.IsOpen -and !$script:settingsSizePreview -and !(Test-WidgetUpdateEditor) -and (Test-WidgetCompletionForeground)
}
function Pause-CompletionNotification {
  Stop-TemporaryCompletion
  if(!$script:collapsed -and $script:bubbleMode-eq 'completion'){Hide-Quota -KeepCompletion}
}
function Tick-CompletionNotifications([bool]$Visible) {
  if(!$script:completionNotificationsEnabled){return}
  if(Test-CompletionObservationPaused){Stop-CompletionMonitor;Dismiss-CompletionNotification;if(!$script:collapsed -and $script:bubbleMode-eq 'completion'){Hide-Quota};return}
  Read-CompletionMonitorOutput;Start-CompletionMonitor
  if($null-eq $script:completionHasQuietControl){$script:completionHasQuietControl=[bool](Get-Command Test-WidgetExperienceQuiet -ErrorAction SilentlyContinue)}
  if($script:completionHasQuietControl -and (Test-WidgetExperienceQuiet)){Dismiss-CompletionNotification;if(!$script:collapsed -and $script:bubbleMode-eq 'completion'){Hide-Quota};return}
  $busy=[bool]$script:drag -or $script:context.IsOpen -or $script:settingsSizePreview -or (Test-WidgetUpdateEditor)
  if($busy){Pause-CompletionNotification;return}
  if($script:completionTemporary){return}
  $foreground=Test-WidgetCompletionHostForeground
  if($foreground){
    if(!(Test-CompletionDisplayAllowed $Visible)){Pause-CompletionNotification;return}
  }elseif(!$script:collapsed){
    if($script:bubbleMode-eq 'completion'){Pause-CompletionNotification};return
  }
  if(!$script:completionPending -or !$script:collapsed -or ($script:closeTimer -and $script:closeTimer.IsEnabled)){return}
  if(!$foreground -and !(Start-TemporaryCompletion)){return}
  Open-WidgetBubble 'completion';$script:completionDisplayCount++
}
function Get-CompletionNotificationStatus {
  $monitorPid=0
  if($script:completionProcess){try{if(!$script:completionProcess.HasExited){$monitorPid=$script:completionProcess.Id}}catch{}}
  $health=$null
  try{if($script:dataDir){$file=Join-Path $script:dataDir 'completion-observer-health.json';if([IO.File]::Exists($file) -and ([IO.FileInfo]::new($file)).Length-le 4096 -and ([IO.File]::GetAttributes($file)-band [IO.FileAttributes]::ReparsePoint)-eq 0){$value=[IO.File]::ReadAllText($file,[Text.Encoding]::UTF8)|ConvertFrom-Json;if($value.version-eq 1 -and $value.status-in @('ok','degraded','paused') -and $value.code-in @('OBSERVER_OK','OBSERVER_POLLING','OBSERVER_PARTIAL','OBSERVER_SOURCE_UNAVAILABLE','OBSERVER_PAUSED','OBSERVER_READ_FAILED','OBSERVER_STATE_FAILED')){$health=$value}}}}catch{}
  $status=if(Test-CompletionObservationPaused){'paused'}elseif(!$script:completionNotificationsEnabled){'disabled'}elseif($health -and [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()-[double]$health.at-le 10000){[string]$health.status}else{'degraded'}
  $code=if($status-eq 'paused'){'OBSERVER_PAUSED'}elseif($status-eq 'disabled'){'OBSERVER_DISABLED'}elseif($health){[string]$health.code}elseif($script:completionLastError){$script:completionLastError}else{'OBSERVER_STARTING'}
  return @{enabled=[bool]$script:completionNotificationsEnabled;pending=[bool]$script:completionPending;pendingCount=[int]$script:completionPendingCount;temporaryTopmost=[bool]$script:completionTemporary;showing=(!$script:collapsed -and $script:bubbleMode-eq 'completion');received=$script:completionReceived;displayCount=$script:completionDisplayCount;monitorPid=$monitorPid;error=$script:completionLastError;observerStatus=$status;observerCode=$code;lastScanAt=if($health){$health.lastScanAt}else{0}}
}
