# Shared controls for display quietness, local observation and existing motions.
# Temporary display quietness never changes the user's sound/quote settings.
function Get-WidgetExperienceNow {return [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()}
function Get-WidgetObservationPauseFile {return (Join-Path $script:dataDir 'task-observers-paused.flag')}
function Test-WidgetObservationPaused {return [IO.File]::Exists((Get-WidgetObservationPauseFile))}
function Test-WidgetExperienceQuiet {
  if($script:experienceQuietIndefinite){return $true}
  if($script:experienceQuietClock -and $script:experienceQuietClock.Elapsed.TotalMilliseconds-lt $script:experienceQuietRemainingMs){return $true}
  if($script:experienceQuietUntil-gt 0){$script:experienceQuietUntil=0;$script:experienceQuietClock=$null;try{Save-WidgetExperiencePreferences}catch{}}
  return $false
}
function Save-WidgetExperiencePreferences {
  if(!$script:experienceStore -or !$script:experienceStore.CanSave){throw 'EXPERIENCE_PREFERENCES_BLOCKED'}
  Save-WidgetSettingsStore -State $script:experienceStore -Value @{version=1;idleRhythm=[string]$script:dragonIdleRhythm;smoothManualRoutes=[bool]$script:dragonSmoothManualRoutes;quietUntil=[long]$script:experienceQuietUntil}
}
function Set-WidgetExperienceQuiet([ValidateSet('off','30m','until-resume')][string]$Mode){
  $oldUntil=$script:experienceQuietUntil;$oldClock=$script:experienceQuietClock;$oldRemaining=$script:experienceQuietRemainingMs;$oldIndefinite=$script:experienceQuietIndefinite
  $script:experienceQuietIndefinite=$Mode-eq 'until-resume'
  $script:experienceQuietUntil=if($Mode-eq 'until-resume'){-1L}elseif($Mode-eq '30m'){(Get-WidgetExperienceNow)+1800000L}else{0L}
  $script:experienceQuietRemainingMs=if($Mode-eq '30m'){1800000L}else{0L}
  $script:experienceQuietClock=if($Mode-eq '30m'){[Diagnostics.Stopwatch]::StartNew()}else{$null}
  try{Save-WidgetExperiencePreferences}catch{$script:experienceQuietUntil=$oldUntil;$script:experienceQuietClock=$oldClock;$script:experienceQuietRemainingMs=$oldRemaining;$script:experienceQuietIndefinite=$oldIndefinite;throw}
  if(Get-Command Reset-WidgetAutoQuoteSchedule -ErrorAction SilentlyContinue){Reset-WidgetAutoQuoteSchedule}
  if($Mode-ne 'off'){
    $script:completionPending=$false;$script:completionAcknowledgedAt=Get-WidgetExperienceNow
    if(Get-Command Pause-CompletionNotification -ErrorAction SilentlyContinue){Pause-CompletionNotification}
  }
}
function Set-WidgetObservationPaused([bool]$Paused){
  $file=Get-WidgetObservationPauseFile
  if($Paused){
    $temp=$file+'.'+[Guid]::NewGuid().ToString('N')+'.tmp'
    try{[IO.File]::WriteAllText($temp,'paused',[Text.UTF8Encoding]::new($false));if([IO.File]::Exists($file)){[IO.File]::Replace($temp,$file,[System.Management.Automation.Language.NullString]::Value)}else{[IO.File]::Move($temp,$file)}}finally{if([IO.File]::Exists($temp)){[IO.File]::Delete($temp)}}
    if(Get-Command Stop-DragonActivityWatch -ErrorAction SilentlyContinue){Stop-DragonActivityWatch}
    if(Get-Command Stop-CompletionMonitor -ErrorAction SilentlyContinue){Stop-CompletionMonitor}
    $script:completionPending=$false
    if(Get-Command Pause-CompletionNotification -ErrorAction SilentlyContinue){Pause-CompletionNotification}
    $script:dragonSnapshots=@();$script:dragonActivityPhase='idle';$script:dragonNextScan=0
  }else{
    if([IO.File]::Exists($file)){[IO.File]::Delete($file)}
    $script:dragonWatchRetryAt=0;$script:completionRetryAfter=0;$script:dragonNextScan=0
    $script:completionAcknowledgedAt=Get-WidgetExperienceNow
  }
}
function Set-WidgetExperienceRhythm([ValidateSet('quiet','natural')][string]$Rhythm){
  $before=$script:dragonIdleRhythm
  Set-DragonIdleRhythm $Rhythm
  try{Save-WidgetExperiencePreferences}catch{Set-DragonIdleRhythm $before;throw}
}
function Set-WidgetExperienceSmooth([bool]$Enabled){
  $before=[bool]$script:dragonSmoothManualRoutes
  Set-DragonSmoothManualRoutes $Enabled
  try{Save-WidgetExperiencePreferences}catch{Set-DragonSmoothManualRoutes $before;throw}
}
function Initialize-WidgetExperienceControls {
  if($script:experienceReady){return}
  $script:experienceQuietUntil=0L;$script:experienceQuietRemainingMs=0L;$script:experienceQuietIndefinite=$false;$script:experienceQuietClock=$null
  $script:dragonIdleRhythm='quiet';$script:dragonSmoothManualRoutes=$true;$script:experienceMessage=''
  if(Get-Command Open-WidgetSettingsStore -ErrorAction SilentlyContinue){
    $script:experienceStore=Open-WidgetSettingsStore -Path (Join-Path $script:dataDir 'experience-preferences.json')
    $saved=$script:experienceStore.Data
    if($saved.version-eq 1){
      if($saved.idleRhythm-in @('quiet','natural')){$script:dragonIdleRhythm=[string]$saved.idleRhythm}
      if($saved.smoothManualRoutes-is [bool]){$script:dragonSmoothManualRoutes=$saved.smoothManualRoutes}
      if($saved.quietUntil-is [ValueType]){
        try{$until=[long]$saved.quietUntil;if($until-eq -1){$script:experienceQuietUntil=-1L;$script:experienceQuietIndefinite=$true}elseif($until-gt (Get-WidgetExperienceNow)){$script:experienceQuietUntil=$until;$script:experienceQuietRemainingMs=[long][Math]::Min([double]1800000,[double]($until-(Get-WidgetExperienceNow)));$script:experienceQuietClock=[Diagnostics.Stopwatch]::StartNew()}}catch{}
      }
    }
  }
  if(Get-Command Set-DragonIdleRhythm -ErrorAction SilentlyContinue){Set-DragonIdleRhythm $script:dragonIdleRhythm}
  if(Get-Command Set-DragonSmoothManualRoutes -ErrorAction SilentlyContinue){Set-DragonSmoothManualRoutes ([bool]$script:dragonSmoothManualRoutes)}
  if($script:context -and !$script:experienceMenuHooked){$script:context.Add_Opened({Update-WidgetExperienceMenu});$script:experienceMenuHooked=$true}
  $script:experienceReady=$true
}
function New-WidgetExperienceItem([string]$Header,[ScriptBlock]$Action,[bool]$Checkable=$false){
  $item=[Windows.Controls.MenuItem]::new();$item.Header=$Header;$item.IsCheckable=$Checkable
  if($script:compactMenuResources -and $script:compactMenuResources['CompactItem']){$item.Style=$script:compactMenuResources['CompactItem']}
  if($Action){$item.Add_Click($Action)}
  return $item
}
function Get-WidgetExperienceStatusText {
  if(Test-WidgetObservationPaused){return '任务观察已暂停（不读取任务日志）'}
  if(!$script:dragonCodexEnabled){return '状态跟随已关闭；完成提醒独立设置'}
  $s=$script:dragonTaskSummary
  if(!$s){return '任务状态正在同步'}
  $waiting=[Math]::Max(0,[int]$s.waiting);$active=[Math]::Max(0,[int]$s.active);$completed=[Math]::Max(0,[int]$s.completed)
  return ('活跃 {0} · 等待 {1} · 完成 {2}' -f $active,$waiting,$completed)
}
function Update-WidgetExperienceMenu {
  if(!$script:experienceReady -or !$script:context){return}
  if(!$script:experienceMenu){
    $settings=@($script:context.Items|Where-Object{$_-is [Windows.Controls.MenuItem] -and $_.Header-eq '设置'})
    if(!$settings.Count){return}
    $menu=New-WidgetExperienceItem '陪伴与任务' $null
    $script:experienceMenu=$menu;$script:experienceMenuItems=@{}
    $status=New-WidgetExperienceItem '任务状态' $null;$status.IsEnabled=$false;$status.ToolTip='按匿名快照聚合；完成是最近约60秒的会话状态，不是全部历史完成记录。';$script:experienceMenuItems.Status=$status;$null=$menu.Items.Add($status)
    $health=New-WidgetExperienceItem '同步状态' $null;$health.IsEnabled=$false;$script:experienceMenuItems.Health=$health;$null=$menu.Items.Add($health)
    $completionHealth=New-WidgetExperienceItem '完成提醒状态' $null;$completionHealth.IsEnabled=$false;$script:experienceMenuItems.CompletionHealth=$completionHealth;$null=$menu.Items.Add($completionHealth)
    $quiet=New-WidgetExperienceItem '安静一会儿' $null;$script:experienceMenuItems.QuietMenu=$quiet
    $quiet.ToolTip='暂停主动语录、半身冒泡和回答结束展示；手动操作仍可用，任务观察继续。'
    foreach($spec in @(@('安静30分钟','30m'),@('安静直到恢复','until-resume'),@('恢复展示','off'))){
      $item=New-WidgetExperienceItem $spec[0] {param($sender,$event)try{Set-WidgetExperienceQuiet ([string]$sender.Tag);$script:experienceMessage=''}catch{$script:experienceMessage='偏好暂不可保存，已保留原设置'};Update-WidgetExperienceMenu};$item.Tag=$spec[1];$null=$quiet.Items.Add($item)
    };$null=$menu.Items.Add($quiet)
    $follow=New-WidgetExperienceItem '跟随任务状态' {param($sender,$event)$before=$script:dragonCodexEnabled;$script:dragonCodexEnabled=[bool]$sender.IsChecked;try{Save-Settings;if($script:settingsStore -and !$script:settingsStore.CanSave){throw 'SETTINGS_SAVE_BLOCKED'}}catch{$script:dragonCodexEnabled=$before;$script:experienceMessage='设置暂不可保存'};$script:dragonNextScan=0;Update-WidgetExperienceMenu} $true
    $script:experienceMenuItems.Follow=$follow;$null=$menu.Items.Add($follow)
    $pause=New-WidgetExperienceItem '暂停所有任务观察' {param($sender,$event)try{Set-WidgetObservationPaused ([bool]$sender.IsChecked);$script:experienceMessage=''}catch{$script:experienceMessage='暂停状态暂不可更改'};Update-WidgetExperienceMenu} $true
    $pause.ToolTip='停止两种任务观察；不删除聊天，不修改原来的跟随或提醒开关。'
    $script:experienceMenuItems.Pause=$pause;$null=$menu.Items.Add($pause)
    $clear=New-WidgetExperienceItem '清除本地产生的任务状态' {try{if(!(Test-WidgetObservationPaused)){return};Clear-WidgetTaskObserverState;$script:experienceMessage='自产任务状态已清理；聊天记录保留'}catch{$script:experienceMessage='任务状态暂不可清理'};Update-WidgetExperienceMenu}
    $clear.ToolTip='先暂停观察。只清理本桌宠产生的匿名状态和恢复元数据，不删除Codex聊天、导出或凭据。'
    $script:experienceMenuItems.Clear=$clear;$null=$menu.Items.Add($clear)
    $rhythm=New-WidgetExperienceItem '待机节奏' $null
    foreach($spec in @(@('安静（低频轮换）','quiet'),@('自然变化','natural'))){
      $item=New-WidgetExperienceItem $spec[0] {param($sender,$event)try{Set-WidgetExperienceRhythm ([string]$sender.Tag);$script:experienceMessage=''}catch{$script:experienceMessage='节奏偏好暂不可保存'};Update-WidgetExperienceMenu} $true
      $item.Tag=$spec[1];$script:experienceMenuItems['Rhythm_'+$spec[1]]=$item;$null=$rhythm.Items.Add($item)
    };$null=$menu.Items.Add($rhythm)
    $smooth=New-WidgetExperienceItem '点播顺姿态衔接' {param($sender,$event)try{Set-WidgetExperienceSmooth ([bool]$sender.IsChecked);$script:experienceMessage=''}catch{$script:experienceMessage='点播偏好暂不可保存'};Update-WidgetExperienceMenu} $true
    $smooth.ToolTip='可选：菜单点播可能先播放约6秒的匹配转身，再播所选动作；可重新点播或拖拽取消，普通点击顺序保持。'
    $script:experienceMenuItems.Smooth=$smooth;$null=$menu.Items.Add($smooth)
    $privacy=New-WidgetExperienceItem '读取与保留说明' $null
    $privacy.ToolTip='任务状态与完成提醒分别读取本地任务日志；仅保存匿名状态、计数和有限恢复位置，不保存聊天正文。暂停停止读取，清理只处理桌宠自产状态。'
    $null=$menu.Items.Add($privacy);$null=$settings[0].Items.Add($menu)
  }
  $items=$script:experienceMenuItems;$items.Status.Header=Get-WidgetExperienceStatusText
  $summary=$script:dragonTaskSummary;$state=[string]$summary.observerStatus
  $health=if(Test-WidgetObservationPaused){'已暂停'}elseif(!$script:dragonCodexEnabled){'状态跟随已关闭'}elseif($state-eq 'ok'){'正常'}elseif($state-in @('paused','disabled')){'已暂停'}elseif($state-eq 'degraded'){'部分可用'}else{'同步中'}
  $isolated=if($script:dragonFailedClips){$script:dragonFailedClips.Count}else{0}
  $items.Health.Header='同步：'+$health+' · 隔离动作 '+$isolated
  $stamp=0L;try{$stamp=[long]$summary.lastUpdatedAt}catch{}
  $age=if($stamp-gt 0){[long][Math]::Max([long]0,((Get-WidgetExperienceNow)-$stamp))}else{-1L}
  $items.Health.ToolTip=if($age-ge 0){'最近同步 '+[Math]::Floor($age/1000.0)+' 秒前；诊断只显示状态，不包含聊天内容。'}else{'等待首次同步；诊断不包含聊天内容。'}
  $completion=if(Get-Command Get-CompletionNotificationStatus -ErrorAction SilentlyContinue){Get-CompletionNotificationStatus}else{$null}
  $completionText=if(Test-WidgetObservationPaused){'已暂停'}elseif(!$script:completionNotificationsEnabled){'已关闭'}elseif($completion.observerStatus-eq 'ok'){'正常'}elseif($completion.observerStatus-eq 'degraded'){'同步中或部分可用'}else{'同步中'}
  $items.CompletionHealth.Header='完成提醒：'+$completionText
  $items.CompletionHealth.ToolTip='完成提醒与动作跟随独立；暂停所有任务观察会同时停止两者读取。'
  if($script:experienceMessage){$items.Health.Header=$script:experienceMessage}
  $items.QuietMenu.Header=if(Test-WidgetExperienceQuiet){'安静中（可手动恢复）'}else{'安静一会儿'}
  $items.Pause.IsChecked=Test-WidgetObservationPaused;$items.Clear.IsEnabled=[bool]$items.Pause.IsChecked
  $items.Follow.IsChecked=[bool]$script:dragonCodexEnabled;$items.Rhythm_quiet.IsChecked=$script:dragonIdleRhythm-eq 'quiet';$items.Rhythm_natural.IsChecked=$script:dragonIdleRhythm-eq 'natural';$items.Smooth.IsChecked=[bool]$script:dragonSmoothManualRoutes
  $items.Follow.IsEnabled=(!$script:settingsStore -or [bool]$script:settingsStore.CanSave)
  if($script:settingsStore -and !$script:settingsStore.CanSave){$items.Health.ToolTip+=' 显示设置暂为只读，原文件和备份受到保护。'}
}
if(!$script:experienceOriginalQuoteTick -and (Get-Command Tick-WidgetAutoQuote -ErrorAction SilentlyContinue)){$script:experienceOriginalQuoteTick=(Get-Command Tick-WidgetAutoQuote).ScriptBlock}
function Tick-WidgetAutoQuote([long]$Now,[bool]$Visible){
  if(Test-WidgetExperienceQuiet){Reset-WidgetAutoQuoteSchedule $Now;return}
  if($script:experienceOriginalQuoteTick){& $script:experienceOriginalQuoteTick $Now $Visible}
}
