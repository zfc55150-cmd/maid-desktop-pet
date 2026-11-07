# Drag-only playback policy. Menu playback and the landing media stay native.
function Get-DragonDragEntryFrame([string]$Clip){
  # Start with the original standing pose; never skip the takeoff.
  return 0
}
function Get-DragonDragWarmKeys {
  $air=Get-DragonDragClip;$landing=[string]$script:dragonManifest.dragLandingClip
  if($air){$page=[int][Math]::Floor((Get-DragonDragEntryFrame $air)/64);Write-Output ($air+':'+$page)}
  if($landing -and $script:dragonManifest.states.PSObject.Properties[$landing]){Write-Output ($landing+':0')}
}
function Request-DragonDragWarmPages {
  if(!$script:dragonWasRendering -or $script:widgetPetForm-ne 'full'){return}
  foreach($key in @(Get-DragonDragWarmKeys)){
    $parts=$key.Split(':');Request-DragonMotionPage $parts[0] ([int]$parts[1])
  }
}
function Test-DragonDragReleaseHold([bool]$Held){return $Held}
function Get-DragonCompletedPhysicalFlight {
  $motion=$script:petNativeMotion
  if(!$motion -or $motion.Flying -or $motion.Dragging){return $false}
  $serial=[long]$motion.FlightSerial
  if($serial-le [long]$script:dragonHandledFlightSerial){return $false}
  # Consume ended episodes even when hidden/disabled or interrupted. Only the
  # native controller can certify that a real flight ended at physical rest.
  $script:dragonHandledFlightSerial=$serial
  return ($motion.StopReason-eq 'rested' -and [long]$motion.CompletedFlightSerial-eq $serial)
}

# Bounded asynchronous atlas decoding, media-clock playback, and short
# premultiplied-alpha transitions. All task observation remains read-only.
function Get-DragonClipAge([long]$Now){
  if(!$script:dragonMediaClock){$script:dragonMediaClock=[DragonMediaClock]::new()}
  return $script:dragonMediaClock.Age($Now,[long]$script:dragonClipAt)
}
function Get-DragonMonotonicMs {return [long]([Diagnostics.Stopwatch]::GetTimestamp()*1000.0/[Diagnostics.Stopwatch]::Frequency)}
function Sync-DragonAnimationActivity([long]$Now){
  if($null-eq $script:dragonHasObserverSync){$script:dragonHasObserverSync=[bool](Get-Command Sync-DragonActivityObserver -ErrorAction SilentlyContinue)}
  if($script:dragonHasObserverSync){Sync-DragonActivityObserver $Now;return}
  # Compatibility for isolated tests and packages using the earlier adapter.
  if($script:dragonAnimationEnabled -and $script:dragonCodexEnabled -and $script:characterId-eq 'gpt-dragon'){Start-DragonActivityWatch}else{Stop-DragonActivityWatch}
  $script:dragonActivityPhase=Get-DragonActivityPhase $Now
}
function Update-DragonWaitingEntryState([string]$Activity){
  $policy=$script:dragonManifest.waitingEntryReaction;$mono=Get-DragonMonotonicMs
  if(!$policy -or !$policy.clip){$script:dragonWaitingPending=$false;$script:dragonWaitingObserved=$Activity;return}
  $cooldown=[Math]::Max(60000,[long]$policy.cooldownMs)
  $ready=($null-eq $script:dragonWaitingReminderAt -or $mono-$script:dragonWaitingReminderAt-ge $cooldown)
  if($Activity-eq 'waiting' -and $script:dragonWaitingObserved-ne 'waiting'){
    $script:dragonWaitingPending=$ready
    $script:dragonWaitingPendingUntil=$mono+[Math]::Min(60000,[Math]::Max(1000,[long]$policy.pendingMs))
  }
  if($Activity-ne 'waiting' -or !$ready -or ($script:dragonWaitingPending -and $mono-ge $script:dragonWaitingPendingUntil)){
    $script:dragonWaitingPending=$false
    # A delayed page must not revive an already cancelled entry reaction.
    if($script:dragonPhase-eq 'waiting' -and $script:dragonClip-eq $policy.clip -and $script:dragonLastDrawnSerial-ne $script:dragonClipSerial){$script:dragonPhase=''}
  }
  $script:dragonWaitingObserved=$Activity
}
function Test-DragonWaitingEntryReady {
  if(!$script:dragonWaitingPending -or $script:dragonActivityPhase-ne 'waiting'){return $false}
  return (Test-DragonClipAvailable ([string]$script:dragonManifest.waitingEntryReaction.clip))
}
function Record-DragonClipPresentation([string]$Clip){
  Reserve-DragonIdleInteraction $Clip
  Record-DragonSchedulingPresentation $Clip
  if($Clip-eq [string]$script:dragonManifest.waitingEntryReaction.clip){$script:dragonWaitingReminderAt=Get-DragonMonotonicMs;$script:dragonWaitingPending=$false}
}
function Test-DragonManualActive([long]$Now){
  if(!$script:dragonManualClock){$script:dragonManualClock=[DragonDeadlineClock]::new()}
  return $script:dragonManualClock.Remaining($Now,[long]$script:dragonManualUntil)-gt 0
}
function Test-DragonVisualHoldActive([long]$Now){
  if(!$script:dragonHoldClock){$script:dragonHoldClock=[DragonDeadlineClock]::new()}
  return $script:dragonHoldClock.Remaining($Now,[long]$script:dragonVisualHoldUntil)-gt 0
}
function Test-DragonClipAvailable([string]$Clip){
  if(!$Clip){return $false}
  if(!$script:dragonFailedClips -or !$script:dragonFailedClips.ContainsKey($Clip)){return $true}
  $failure=$script:dragonFailedClips[$Clip]
  return ($failure.count-lt 2 -and (Get-DragonMonotonicMs)-ge $failure.retryAt)
}
function Get-DragonRecoveryClip {
  foreach($candidate in @($script:dragonManifest.defaultIdleState,'idle')+@($script:dragonManifest.pools.idle)){
    if($candidate -and $script:dragonManifest.states.PSObject.Properties[[string]$candidate] -and (Test-DragonClipAvailable ([string]$candidate))){return [string]$candidate}
  }
}
function Record-DragonPageFailure([string]$Key){
  $clip=$Key.Split(':')[0]
  if(!$script:dragonFailedClips){$script:dragonFailedClips=@{}}
  $previous=$script:dragonFailedClips[$clip];$count=if($previous){[int]$previous.count+1}else{1}
  $script:dragonFailedClips[$clip]=@{count=[Math]::Min(2,$count);retryAt=(Get-DragonMonotonicMs)+2000}
  $script:dragonLastMediaError='MOTION_PAGE_UNAVAILABLE'
  foreach($cached in @($script:dragonPages.Keys)){if($cached.StartsWith($clip+':')){$script:dragonPages.Remove($cached);$null=$script:dragonPageOrder.Remove($cached)}}
  if($script:dragonClip-eq $clip){$script:dragonRecoverClip=$true}
}
function Update-DragonVisualEvents($Records,[long]$Now){
  if(!$script:dragonPendingEvents){$script:dragonPendingEvents=New-Object 'System.Collections.Generic.List[object]'}
  if(!$script:dragonSeenEvents){$script:dragonSeenEvents=@{}}
  $mono=Get-DragonMonotonicMs
  foreach($event in @($script:dragonPendingEvents.ToArray())){
    if($event.deadline-le $mono){$script:dragonPendingEvents.Remove($event)|Out-Null}
  }
  foreach($key in @($script:dragonSeenEvents.Keys)){if($script:dragonSeenEvents[$key]-lt $mono-300000){$script:dragonSeenEvents.Remove($key)}}
  foreach($record in $Records){
    if($record.phase-eq 'happy' -and [double]$record.at-le $Now+5000 -and [double]$record.expiresAt-gt $Now){
      $id=[string]$record.session+':'+[string]$record.turn+':'+[string]$record.at
      if(!$script:dragonSeenEvents.ContainsKey($id)){
        $script:dragonSeenEvents[$id]=$mono
        if($script:dragonPendingEvents.Count-ge 16){$script:dragonPendingEvents.RemoveAt(0)}
        $script:dragonPendingEvents.Add(@{id=$id;session=[string]$record.session;turn=[string]$record.turn;at=[double]$record.at;deadline=$mono+60000})
      }
    }elseif($record.session -and ($record.phase-in @('thinking','working','waiting') -or ($record.terminal -and $record.phase-eq 'idle'))){
      # A cancellation or a newer turn supersedes its own old reaction only.
      foreach($event in @($script:dragonPendingEvents.ToArray())){
        if($event.session-eq [string]$record.session -and [double]$record.at-ge $event.at -and ($record.terminal -or [string]$record.turn-ne $event.turn)){$script:dragonPendingEvents.Remove($event)|Out-Null}
      }
    }
  }
  while($script:dragonSeenEvents.Count-gt 128){$oldest=@($script:dragonSeenEvents.GetEnumerator()|Sort-Object Value|Select-Object -First 1)[0];$script:dragonSeenEvents.Remove($oldest.Key)}
}
function Complete-DragonVisualEvent {
  if($script:dragonPendingEvents -and $script:dragonPendingEvents.Count){$script:dragonPendingEvents.RemoveAt(0)}
}
function Report-DragonMotionFailure($Record,[string]$Code){
  $script:dragonLastError=@{code=$Code;type=$Record.Exception.GetType().Name;line=[int]$Record.InvocationInfo.ScriptLineNumber}
  try{
    $status=@{version=2;at=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();enabled=$false;paused=$true;targetFps=30;measuredFps=0;error=$Code;errorType=$Record.Exception.GetType().Name}
    [IO.File]::WriteAllText((Join-Path $script:dataDir 'animation-status.json'),($status|ConvertTo-Json -Compress),[Text.UTF8Encoding]::new($false))
  }catch{}
}
function Merge-DragonPageLoads {
  foreach($key in @($script:dragonLoadRequests.Keys)){
    $task=$script:dragonLoadRequests[$key].task
    if(!$task.IsCompleted){continue}
    if($task.IsFaulted -or $task.IsCanceled){$script:dragonLoadRequests.Remove($key);Record-DragonPageFailure $key;continue}
    $script:dragonPages[$key]=$task.GetAwaiter().GetResult()
    $script:dragonLoadRequests.Remove($key)
    $null=$script:dragonPageOrder.Remove($key);$script:dragonPageOrder.Add($key)
    $evicted=($script:dragonPages.Count-le 1)
    $warm=@(Get-DragonDragWarmKeys)
    while($script:dragonPageOrder.Count-gt 6){
      $remove=@($script:dragonPageOrder|Where-Object{$_-notin $warm}|Select-Object -First 1)[0]
      if(!$remove){$remove=$script:dragonPageOrder[0]}
      $script:dragonPageOrder.Remove($remove)|Out-Null;$script:dragonPages.Remove($remove);$evicted=$true
    }
    if($evicted){[DragonMotionDecoder]::TrimMemory($false)}
  }
}
function Request-DragonMotionPage([string]$Clip,[int]$PageNumber){
  $key=$Clip+':'+$PageNumber
  if(!(Test-DragonClipAvailable $Clip) -or $script:dragonPages.ContainsKey($key) -or $script:dragonLoadRequests.ContainsKey($key) -or $script:dragonLoadRequests.Count-ge 2){return}
  $spec=$script:dragonManifest.states.$Clip
  if($PageNumber-lt 0 -or $PageNumber-ge @($spec.pages).Count){return}
  $page=$spec.pages[$PageNumber]
  $file=Join-Path (Join-Path $script:appDir 'assets\dragon-animation\motion-v1') $page.file
  $presentation=$script:dragonManifest.clipPresentation.$Clip
  $task=if($presentation){[DragonMotionDecoder]::LoadAsync($file,[int]$script:dragonManifest.cellSize,[int]$page.rows,[string]$page.sha256,[double]$presentation.scale,[double]$presentation.offsetX,[double]$presentation.offsetY)}else{[DragonMotionDecoder]::LoadAsync($file,[int]$script:dragonManifest.cellSize,[int]$page.rows,[string]$page.sha256)}
  $script:dragonLoadRequests[$key]=@{task=$task}
}
function Get-DragonMotionFrame([string]$Clip,[int]$Index){
  $spec=$script:dragonManifest.states.$Clip;$cell=[int]$script:dragonManifest.cellSize
  $Index=[Math]::Max(0,[Math]::Min($Index,[int]$spec.frames-1))
  $pageNumber=[int][Math]::Floor($Index/64);$page=$spec.pages[$pageNumber];$key=$Clip+':'+$pageNumber
  Merge-DragonPageLoads
  if(!$script:dragonPages.ContainsKey($key)){Request-DragonMotionPage $Clip $pageNumber;return $null}
  $null=$script:dragonPageOrder.Remove($key);$script:dragonPageOrder.Add($key)
  $local=$Index-[int]$page.start
  $image=[DragonMotionDecoder]::Crop($script:dragonPages[$key],$cell,$local)
  if($page.count-$local-lt $(if($Clip-eq (Get-DragonDragClip)){32}else{18})){
    $next=$pageNumber+1
    if($next-ge @($spec.pages).Count -and $spec.loop){$next=0}
    Request-DragonMotionPage $Clip $next
  }
  return (New-DragonCachedFrame $image)
}
function Write-DragonMotionStatus([long]$Now,[bool]$Paused=$false){
  if($Now-lt $script:dragonStatusAt+1000){return}
  $elapsed=[Math]::Max([long]1,[long]($Now-$script:dragonStatusAt))
  $fps=if($script:dragonClip){Get-DragonMediaFps $script:dragonManifest.states.($script:dragonClip)}else{[int]$script:dragonManifest.fps}
  $value=@{version=2;at=$Now;enabled=[bool]$script:dragonAnimationEnabled;phase=$script:dragonActivityPhase;visualPhase=$script:dragonPhase;clip=$script:dragonClip;frame=$script:dragonFrameIndex;targetFps=$fps;measuredFps=[Math]::Round($script:dragonRendered*1000/$elapsed,1);cachedPages=$script:dragonPages.Count;pendingLoads=$script:dragonLoadRequests.Count;paused=$Paused;error=$null;degradedClips=@($script:dragonFailedClips.Keys);mediaError=$script:dragonLastMediaError}
  if($script:petFullClickTrace){$value.clickSequence=@($script:petFullClickTrace.ToArray())}
  try{
    $file=Join-Path $script:dataDir 'animation-status.json';$temp=$file+'.tmp'
    [IO.File]::WriteAllText($temp,($value|ConvertTo-Json -Depth 5 -Compress),[Text.UTF8Encoding]::new($false))
    if([IO.File]::Exists($file)){[IO.File]::Replace($temp,$file,[NullString]::Value)}else{[IO.File]::Move($temp,$file)}
  }catch{}
  $script:dragonStatusAt=$Now;$script:dragonRendered=0
}
function Get-DragonPhaseEntryClip([string]$Phase){
  if($Phase-eq 'idle'){return (Get-DragonIdleEntry $script:dragonLastDrawnClip)}
  if($Phase-eq 'waiting' -and (Test-DragonWaitingEntryReady)){return [string]$script:dragonManifest.waitingEntryReaction.clip}
  $pool=@($script:dragonManifest.pools.$Phase|Where-Object{Test-DragonClipAvailable ([string]$_)})
  if(!$pool.Count){return (Get-DragonRecoveryClip)}
  if($Phase-in @('happy','confused')){
    $index=[int]$script:dragonEventIndex[$Phase]%$pool.Count
    $script:dragonEventIndex[$Phase]=[int]$script:dragonEventIndex[$Phase]+1
    return [string]$pool[$index]
  }
  return [string]$pool[0]
}
function Set-DragonVisualClip([string]$Target,[string]$Phase,[long]$Now,[bool]$Manual=$false){
  if(!(Test-DragonClipAvailable $Target)){$Target=Get-DragonRecoveryClip;if(!$Target){return};$Phase='idle';$script:dragonBridgeTarget=$null}
  if(!$Manual -and $Phase-eq 'idle' -and !(Test-DragonIdleInteractionReady $Target)){$Target=Get-DragonDefaultIdle}
  if(!$Manual -and $Phase-in @('thinking','working') -and !(Test-DragonActiveTaskClipReady $Target)){
    $neutral=[string]$script:dragonManifest.activeTaskVariation.neutralClip
    $Target=if($neutral -and $script:dragonManifest.states.PSObject.Properties[$neutral] -and (Test-DragonClipAvailable $neutral)){$neutral}else{Get-DragonRecoveryClip}
  }
  $script:dragonClipEnteredFrom=[string]$script:dragonLastDrawnClip
  $script:dragonClipEnteredFrame=[int]$script:dragonFrameIndex;$script:dragonClipEnteredDrawnSerial=[long]$script:dragonLastDrawnSerial;$script:dragonClipEnteredSerial=[long]$script:dragonClipSerial
  $script:dragonClipEnteredNativeVisible=($script:dragonWasRendering -and $script:dragonClip-eq $script:dragonLastDrawnClip -and !$script:dragonFadePrevious -and [object]::ReferenceEquals($script:ui.Girl.Source,$script:bitmap))
  if($Manual -and $script:dragonManualReason-eq 'menu' -and $script:dragonSmoothManualRoutes){
    $manualBridge=Get-DragonManualBridge $script:dragonLastDrawnClip $Target
    if($manualBridge){$script:dragonManualRouteTarget=$Target;$script:dragonManualRouteRequest=$script:dragonManualPhase;$Target=$manualBridge}
  }
  if(!$Manual -and $Phase-notin @('working','thinking','waiting')){
    $bridge=Get-DragonAutomaticBridge $script:dragonLastDrawnClip $Target
    if($bridge){$script:dragonBridgeTarget=$Target;$script:dragonBridgePhase=$Phase;$Target=$bridge}
  }
  $script:dragonClip=$Target;$script:dragonClipAt=$Now;$script:dragonClipSerial++;$script:dragonQueuedNext=$null
  $script:dragonVisualHoldUntil=0
}
function Tick-DragonAnimation {
  if(!$script:dragonTimer){return}
  $now=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  if($null-eq $script:dragonHasClickRebound){$script:dragonHasClickRebound=[bool](Get-Command Try-WidgetFullClickRebound -ErrorAction SilentlyContinue);$script:dragonHasCancelPress=[bool](Get-Command Cancel-WidgetFullPress -ErrorAction SilentlyContinue)}
  # Bust rendering is static, while its slow timer still updates task metadata
  # and can stop an observer after the feature is disabled.
  $completedPhysicalFlight=Get-DragonCompletedPhysicalFlight
  Sync-DragonAnimationActivity $now
  Update-DragonWaitingEntryState $script:dragonActivityPhase
  if($script:petFormTransition){Write-DragonMotionStatus $now $true;return}
  if($script:widgetPetForm-eq 'bust' -and $script:characterId-eq 'gpt-dragon'){
    if($script:ui.Girl.Source-ne $script:petBustFrame.image){Set-DragonCachedFrame $script:petBustFrame};if($script:dragonPages.Count-gt 0){$script:dragonPages.Clear();$script:dragonPageOrder.Clear();$script:dragonLoadRequests.Clear();[DragonMotionDecoder]::TrimMemory($true)}
    Write-DragonMotionStatus $now $true;return
  }
  $dragAnimation=Test-DragonMotionDragActive
  if($dragAnimation -and $script:dragonHasCancelPress){Cancel-WidgetFullPress}
  if($script:petFullReboundPending -and $script:dragonManualReason-notin @('click-settle','touch')){Cancel-WidgetFullPress}
  if($script:petFullReboundPending -and $script:petFullReboundAwaitRender -and $script:petFullReboundTarget){Write-DragonMotionStatus $now;return}
  # Scaling and native frame playback run together. A click must not freeze
  # the pose throughout pointer hold or the 220ms rebound.
  if(!$script:dragonAnimationEnabled -or $script:characterId-ne 'gpt-dragon'){
    if($script:dragonWasRendering -and $script:characterId-eq 'gpt-dragon'){Set-DragonCachedFrame $script:dragonOriginal;$script:ui.Girl.ToolTip=$script:dragonOriginalTooltip}
    $script:dragonWasRendering=$false;$script:dragonFrameKey='';$script:dragonPhase='';$script:dragonFadePrevious=$null;$script:dragonPausedAt=0;$script:dragonDragRendering=$false;$script:dragonBridgeTarget=$null;$script:dragonManualRouteTarget=$null
    $script:dragonPages.Clear();$script:dragonPageOrder.Clear();$script:dragonLoadRequests.Clear();Write-DragonMotionStatus $now $true;return
  }
  Merge-DragonPageLoads
  Request-DragonDragWarmPages
  if($script:dragonRecoverClip -or ($script:dragonClip -and !(Test-DragonClipAvailable $script:dragonClip))){
    $script:dragonRecoverClip=$false;$recovery=Get-DragonRecoveryClip
    if($script:petFullReboundPending -and $script:dragonHasCancelPress){Cancel-WidgetFullPress}
    $script:dragonManualUntil=0;$script:dragonBridgeTarget=$null;$script:dragonManualRouteTarget=$null;$script:dragonFadePrevious=$null
    if($recovery){$script:dragonPhase='idle';Set-DragonVisualClip $recovery 'idle' $now}
    else{if($script:dragonOriginal){Set-DragonCachedFrame $script:dragonOriginal};Write-DragonMotionStatus $now $true;return}
  }
  $armedFullPress=($script:characterId-eq 'gpt-dragon' -and $script:widgetPetForm-eq 'full' -and $script:petFullPressActive -and !($script:drag -and $script:drag.moved))
  if(!$script:window.IsVisible -or ($script:drag -and !$dragAnimation -and !$armedFullPress) -or ($script:context -and $script:context.IsOpen) -or ($script:widgetMusic -and $script:widgetMusic.Enabled) -or ($script:characterGallery -and $script:characterGallery.IsVisible)){
    if(!$script:dragonPausedAt){
      $script:dragonPausedAt=$now
      $null=Get-DragonClipAge $now;$script:dragonMediaClock.Suspend($now,[long]$script:dragonClipAt)
      $null=Test-DragonManualActive $now;$script:dragonManualClock.Suspend($now,[long]$script:dragonManualUntil)
      if($script:dragonFadePrevious -and $script:dragonFadeClock){$script:dragonFadeClock.Suspend($now,[long]$script:dragonFadeAt)}
    }
    Write-DragonMotionStatus $now $true;return
  }
  if($script:dragonPausedAt){
    $previousClipAt=[long]$script:dragonClipAt;$previousFadeAt=[long]$script:dragonFadeAt;$previousManualUntil=[long]$script:dragonManualUntil
    $delay=[Math]::Max([long]0,[long]($now-$script:dragonPausedAt))
    # A menu selection or a touch during drag-release has already reset the
    # phase, so its newly created manual deadline must not inherit this pause.
    if($script:dragonPhase){
      $script:dragonClipAt+=$delay;$script:dragonPhaseAt+=$delay
      if($script:dragonManualUntil-gt $script:dragonPausedAt){$script:dragonManualUntil+=$delay}
      if($script:dragonFadePrevious){$script:dragonFadeAt+=$delay}
    }
    if($script:dragonMediaClock){$script:dragonMediaClock.Resume($previousClipAt,[long]$script:dragonClipAt)}
    if($script:dragonFadeClock){$script:dragonFadeClock.Resume($previousFadeAt,[long]$script:dragonFadeAt)}
    if($script:dragonManualClock){$script:dragonManualClock.Resume($previousManualUntil,[long]$script:dragonManualUntil)}
    $script:dragonPausedAt=0;$script:dragonFrameKey=''
  }
  if($script:petFullReboundPending -and $script:dragonHasClickRebound){Try-WidgetFullClickRebound}
  if($completedPhysicalFlight -and !$dragAnimation){
    $freshFlightResponse=($script:dragonManualReason-in @('touch','menu','click-settle') -and (Test-DragonManualActive $now))
    if(!$freshFlightResponse){$script:dragonDragRendering=$true}
  }
  $dragAnimation=Test-DragonDragReleaseHold $dragAnimation
  if($dragAnimation){
    if(!$script:dragonDragRendering){$script:dragonManualPhase=Get-DragonDragClip;$script:dragonManualReason='drag';$script:dragonPhase='';$script:dragonDragRendering=$true;$script:dragonBridgeTarget=$null;$script:dragonDragShownAt=0;$script:dragonDragReleaseAt=0}
    # A held drag is a single native pass followed by its final pose, not a loop.
    $script:dragonManualUntil=$now+1000
  }elseif($script:dragonDragRendering){
    $script:dragonDragRendering=$false
    # Mouse-up may already have installed a fresh click/menu response. Preserve it.
    $freshResponse=($script:dragonPhase-eq '' -and $script:dragonManualReason-in @('touch','menu','click-settle') -and (Test-DragonManualActive $now))
    if(!$freshResponse){
      $pose=Get-DragonDragReleaseClip;$poseClip=$script:dragonManifest.states.$pose
      $script:dragonManualPhase=$pose;$script:dragonManualReason='drag-release';$script:dragonPhase=''
      $script:dragonManualUntil=$now+[long][Math]::Ceiling($poseClip.frames*1000.0/(Get-DragonMediaFps $poseClip))+180
    }
  }
  $reduced=![Windows.SystemParameters]::ClientAreaAnimation
  if($script:dragonManualRouteTarget){
    if($script:dragonManualReason-ne 'menu' -or $script:dragonManualPhase-ne $script:dragonManualRouteRequest -or $dragAnimation){$script:dragonManualRouteTarget=$null}
    else{
      $routeClip=$script:dragonManifest.states.($script:dragonClip)
      $routeDone=($script:dragonLastDrawnSerial-eq $script:dragonClipSerial -and
        ($reduced -or ((Get-DragonClipAge $now)-ge $routeClip.frames*1000.0/(Get-DragonMediaFps $routeClip) -and $script:dragonFrameIndex-ge [int]$routeClip.frames-1)))
      if(!$script:dragonSmoothManualRoutes -or $routeDone){
        $routeTarget=[string]$script:dragonManualRouteTarget;$script:dragonManualRouteTarget=$null
        $targetClip=$script:dragonManifest.states.$routeTarget
        $script:dragonManualUntil=$now+[long][Math]::Max(3000,$targetClip.frames*1000.0/(Get-DragonMediaFps $targetClip)+200)
        Set-DragonVisualClip $routeTarget $script:dragonManualPhase $now $true
      }else{$script:dragonManualUntil=$now+1000}
    }
  }
  $manual=Test-DragonManualActive $now
  # Legacy metadata adapters may expose only a phase. Remember that observed
  # rising edge too; normal snapshots use hashed session/turn IDs above.
  if($script:dragonActivityPhase-eq 'happy' -and !@($script:dragonSnapshots).Count -and $script:dragonLastObservedPhase-ne 'happy' -and (!$script:dragonPendingEvents -or !$script:dragonPendingEvents.Count)){
    Update-DragonVisualEvents @(@{phase='happy';at=$now;expiresAt=$now+6500}) $now
  }
  $script:dragonLastObservedPhase=$script:dragonActivityPhase
  $phase=if($manual){$script:dragonManualPhase}else{Resolve-DragonVisualPhase $script:dragonActivityPhase $now}
  # A delivered snapshot stays valid briefly for metadata readers. It must
  # not replay when another session briefly raises then lowers the priority.
  if(!$manual -and $phase-eq 'happy' -and @($script:dragonSnapshots).Count -and (!$script:dragonPendingEvents -or !$script:dragonPendingEvents.Count)){$phase='idle'}
  if(!$manual -and $phase-in @('idle','happy') -and $script:dragonPendingEvents -and $script:dragonPendingEvents.Count){$phase='happy'}
  $desiredPhase=$phase
  if($script:dragonBridgeTarget){
    if($manual -or !$script:dragonPhase -or $desiredPhase-in @('working','thinking','waiting')){$script:dragonBridgeTarget=$null}
    else{
      $bridgeClip=$script:dragonManifest.states.($script:dragonClip)
      $bridgeDuration=$bridgeClip.frames*1000.0/(Get-DragonMediaFps $bridgeClip)
      $bridgeAge=Get-DragonClipAge $now
      if($reduced -or $bridgeDuration-$bridgeAge-lt 700){Request-DragonMotionPage ([string]$script:dragonBridgeTarget) 0}
      if($script:dragonLastDrawnSerial-eq $script:dragonClipSerial -and ($reduced -or ($bridgeAge-ge $bridgeDuration -and $script:dragonFrameIndex-ge [int]$bridgeClip.frames-1))){
        $target=[string]$script:dragonBridgeTarget;$bridgePhase=[string]$script:dragonBridgePhase;$script:dragonBridgeTarget=$null
        if($desiredPhase-ne $bridgePhase){
          $target=if($desiredPhase-eq 'idle' -and (Get-DragonDefaultIdle)){Get-DragonDefaultIdle}else{Get-DragonPhaseEntryClip $desiredPhase}
        }
        $script:dragonPhase=$desiredPhase;$script:dragonPhaseAt=$now
        Set-DragonVisualClip $target $desiredPhase $now
      }
      $phase=$script:dragonPhase
    }
  }
  if(!$manual -and $script:dragonManifest.defaultIdleState -and $script:dragonPhase -and !$script:dragonBridgeTarget -and $phase-ne $script:dragonPhase){
    $ageBeforeChange=Get-DragonClipAge $now
    $playing=$script:dragonManifest.states.($script:dragonClip)
    $completeFirst=(!$reduced -and $script:dragonClip-in @($script:dragonManifest.fullPlayClips) -and
      ($ageBeforeChange-lt $playing.frames*1000.0/(Get-DragonMediaFps $playing) -or
       $script:dragonLastDrawnSerial-ne $script:dragonClipSerial -or $script:dragonFrameIndex-lt [int]$playing.frames-1))
    $urgent=$phase-in @('working','thinking','waiting')
    if(($urgent -and $ageBeforeChange-lt 250) -or (!$urgent -and ($ageBeforeChange-lt 1000 -or (Test-DragonVisualHoldActive $now) -or $completeFirst))){$phase=$script:dragonPhase}
  }
  $waitingEntry=(!$manual -and $phase-eq 'waiting' -and (Test-DragonWaitingEntryReady))
  if($phase-ne $script:dragonPhase -or $waitingEntry){
    $previousPhase=[string]$script:dragonPhase
    $script:dragonPhase=$phase;$script:dragonPhaseAt=$now;$script:dragonPoolIndex=0;$script:dragonQueuedNext=$null
    $target=if($manual){$phase}else{Get-DragonPhaseEntryClip $phase}
    # working/thinking frequently alternate while targeting the same clip.
    # Update the observed visual phase without restarting its native clock.
    if(!$manual -and $phase-in @('thinking','working') -and $previousPhase-in @('thinking','working') -and $script:dragonManifest.activeTaskVariation -and $script:dragonClip-in @($script:dragonManifest.pools.$phase)){$target=$script:dragonClip}
    if($manual -or $target-ne $script:dragonClip){Set-DragonVisualClip $target $phase $now $manual}
  }
  $clip=$script:dragonManifest.states.($script:dragonClip);$fps=Get-DragonMediaFps $clip;$duration=[int]$clip.frames*1000.0/$fps
  $dragPlayback=($script:dragonDragRendering -and $script:dragonManualReason-eq 'drag' -and $script:dragonClip-eq (Get-DragonDragClip))
  $entryFrame=if($dragPlayback){Get-DragonDragEntryFrame $script:dragonClip}else{0}
  $landingPlayback=($script:dragonManualReason-eq 'drag-release' -and $script:dragonClip-eq [string]$script:dragonManifest.dragLandingClip)
  $playbackRate=if($dragPlayback){1.25}elseif($landingPlayback){1.2}else{1.0}
  $duration=([int]$clip.frames-$entryFrame)*1000.0/$fps/$playbackRate
  $age=[long](Get-DragonClipAge $now)
  $mediaAge=$age*$playbackRate
  if($dragPlayback -and [int]$clip.frames-gt 66){
    # Retain the complete 0..66 takeoff timeline in 1.2 seconds, then ease
    # into a slower airborne pass. Menu playback remains at native speed.
    $duration=1200+([int]$clip.frames-66)*1000.0/$fps/1.25
    $mediaAge=if($age-lt 1200){$age*(66*1000.0/$fps/1200.0)}else{66*1000.0/$fps+($age-1200)*1.25}
  }
  if($manual -and !$dragAnimation -and $duration-$age-lt 700){
    if($script:dragonManualRouteTarget){Request-DragonMotionPage ([string]$script:dragonManualRouteTarget) 0}
    else{
      $following=@(Get-DragonPoseSuccessors $script:dragonClip)
      if(!$following.Count){$preferred=Get-DragonReturnPose $script:dragonClip;if($preferred){$following=@($preferred)}}
      if($following.Count){$preload=Get-DragonAutomaticBridge $script:dragonClip $following[0];if(!$preload){$preload=$following[0]};Request-DragonMotionPage $preload 0}
    }
  }
  $returnPose=if(!$clip.loop){Get-DragonReturnPose $script:dragonClip}else{$null}
  if(!$manual -and !$reduced -and !$script:dragonBridgeTarget -and $script:dragonLastDrawnSerial-eq $script:dragonClipSerial -and ($phase-notin @('happy','confused') -or $returnPose)){
    if($age-ge $duration -and $script:dragonFrameIndex-eq [int]$clip.frames-1){
      $target=if($returnPose){$returnPose}elseif($script:dragonQueuedNext){$script:dragonQueuedNext}else{Select-DragonNextClip $phase $script:dragonClip}
      Set-DragonVisualClip $target $phase $now;$age=0
      $clip=$script:dragonManifest.states.($script:dragonClip);$fps=Get-DragonMediaFps $clip;$duration=[int]$clip.frames*1000.0/$fps
    }elseif($duration-$age-lt 700 -and !$script:dragonQueuedNext){
      $decisionAt=(Get-DragonMonotonicMs)+[long][Math]::Ceiling([Math]::Max(0,$duration-$age))
      $script:dragonQueuedNext=if($returnPose){$returnPose}else{Select-DragonNextClip $phase $script:dragonClip $decisionAt}
      $preload=Get-DragonAutomaticBridge $script:dragonClip $script:dragonQueuedNext
      if(!$preload){$preload=$script:dragonQueuedNext};Request-DragonMotionPage $preload 0
    }
  }
  $firstFrame=$script:dragonLastDrawnSerial-ne $script:dragonClipSerial
  $frame=if($reduced){0}elseif($firstFrame){$entryFrame}elseif($manual -and $clip.loop -and ($duration-lt 3000 -or $script:dragonManualReason-eq 'click-settle')){[int][Math]::Floor(($age%$duration)*$fps/1000)}else{[Math]::Min([int]$clip.frames-1,$entryFrame+[int][Math]::Floor($mediaAge*$fps/1000))}
  $key=$script:dragonClip+':'+$frame
  if($key-ne $script:dragonFrameKey -or !$script:dragonWasRendering -or $firstFrame){
    $asset=Get-DragonMotionFrame $script:dragonClip $frame
    if(!$asset){Write-DragonMotionStatus $now;return}
    if($firstFrame){
      $nativeJoin=Test-DragonRenderedPoseJoin $script:dragonClipEnteredFrom $script:dragonClip $script:dragonClipEnteredFrame $script:dragonClipEnteredDrawnSerial $script:dragonClipEnteredSerial $script:dragonClipEnteredNativeVisible
      $clickEntry=($script:petFullReboundPending -and $script:petFullReboundTarget-eq $script:dragonClip -and $script:dragonManualReason-in @('click-settle','touch'))
      if($nativeJoin -or $clickEntry){$script:dragonFadePrevious=$null}
      elseif($script:dragonWasRendering -and !$reduced -and ($script:dragonLastDrawnClip-ne $script:dragonClip -or $clip.sourceKind-eq 'continuous-video')){
        $visible=if($script:ui.Girl.Source -is [Windows.Media.Imaging.BitmapSource]){$script:ui.Girl.Source}else{$script:bitmap}
        $script:dragonFadePrevious=[DragonMotionDecoder]::Detach($visible);$script:dragonFadeAt=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        $script:dragonFadeDurationMs=if($script:dragonManualReason-in @('drag','drag-release')){80}else{180}
      }
      $script:dragonClipAt=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();$script:dragonLastDrawnSerial=$script:dragonClipSerial;$script:dragonLastDrawnClip=$script:dragonClip
      $script:dragonMediaClock=[DragonMediaClock]::new()
      if($manual -and !$dragAnimation){
        if($script:dragonManualReason-eq 'click-settle'){$script:dragonManualUntil=$script:dragonClipAt+(Get-DragonFrontIdleHoldMs)}
        elseif(@(Get-DragonPoseSuccessors $script:dragonClip).Count){$script:dragonManualUntil=$script:dragonClipAt+[long][Math]::Ceiling($duration)}
        elseif(Get-DragonReturnPose $script:dragonClip){$script:dragonManualUntil=$script:dragonClipAt+[long][Math]::Ceiling($duration)+180}
      }
      if(!$manual -and !$script:dragonBridgeTarget -and $script:dragonClip-eq (Get-DragonDefaultIdle) -and $script:dragonClipEnteredFrom-ne $script:dragonClip -and $script:dragonManifest.actionSettleMs-gt 0){$script:dragonVisualHoldUntil=$script:dragonClipAt+[long][Math]::Min(30000,$script:dragonManifest.actionSettleMs)}
    }
    Set-DragonCachedFrame $asset
    if($script:petFormsReady -and $script:widgetPetForm-eq 'full'){$script:petFormFullFrame=$asset}
    if($firstFrame -and $dragPlayback){$script:dragonDragShownAt=Get-DragonMonotonicMs;$script:dragonPresentedDragSerial=if($script:petNativeMotion){[long]$script:petNativeMotion.DragSerial}else{0}}
    $script:dragonFrameIndex=$frame;$script:dragonFrameKey=$key;$script:dragonWasRendering=$true;$script:dragonRendered++;$script:dragonPresentedTotal++
    if($firstFrame){Record-DragonClipPresentation $script:dragonClip}
    if($firstFrame -and !$script:dragonBridgeTarget -and $script:dragonPhase-eq 'happy' -and $script:dragonClip-in @($script:dragonManifest.pools.happy)){Complete-DragonVisualEvent}
    if($script:dragonHasClickRebound -and $script:petFullReboundPending){Try-WidgetFullClickRebound}
    if($firstFrame){$script:ui.Girl.ToolTip=[string]$clip.label+'；轻点有回应，右键可点播动作或调整大小';if($script:dragonStatusMenu){$script:dragonStatusMenu.Header=[string]$clip.label}}
  }
  if($script:dragonFadePrevious){
    if(!$script:dragonFadeClock){$script:dragonFadeClock=[DragonMediaClock]::new()}
    $progress=$script:dragonFadeClock.Age([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(),[long]$script:dragonFadeAt)/$(if($script:dragonFadeDurationMs-gt 0){[double]$script:dragonFadeDurationMs}else{180.0})
    if($progress-ge 1 -or $reduced){$script:dragonFadePrevious=$null;$script:ui.Girl.Source=$script:bitmap}
    else{$script:ui.Girl.Source=[DragonMotionDecoder]::Blend($script:dragonFadePrevious,$script:bitmap,$progress)}
  }
  Write-DragonMotionStatus $now
}
function Start-DragonAnimation {
  $script:dragonStartupStage='start-entered'
  if($script:dragonTimer){return}
  try{
    $script:dragonStartupStage='validating';$script:dragonLastError=$null
    if(!('DragonMotionDecoder'-as [type])){
      Add-Type -AssemblyName PresentationCore,WindowsBase,System.Xaml
      Add-Type -TypeDefinition ([IO.File]::ReadAllText((Join-Path $script:appDir 'runtime\dragon-animation\motion-decoder.cs'),[Text.Encoding]::UTF8)) -ReferencedAssemblies @('System.dll','System.Core.dll',[Windows.Media.Imaging.BitmapSource].Assembly.Location,[Windows.Rect].Assembly.Location,[Windows.Markup.IUriContext].Assembly.Location) -ErrorAction Stop
    }
    $file=Join-Path $script:appDir 'runtime\dragon-animation\animation.json'
    if(([IO.FileInfo]::new($file)).Length-gt 128KB){throw 'Motion manifest limit'}
    $manifest=[IO.File]::ReadAllText($file,[Text.Encoding]::UTF8)|ConvertFrom-Json -ErrorAction Stop
    if($manifest.version-notin @(4,5,6) -or $manifest.fps-notin @(24,30) -or $manifest.cellSize-notin @(320,384) -or $manifest.columns-ne 8 -or $manifest.pageFrames-ne 64){throw 'Motion manifest layout'}
    $states=@($manifest.states.PSObject.Properties.Name)
    if($manifest.clipPresentation){foreach($entry in $manifest.clipPresentation.PSObject.Properties){
      if($entry.Name-notin $states -or $entry.Name-in @($manifest.defaultIdleState,$manifest.clickSettlePose)){throw 'Motion presentation reference'}
      foreach($field in @('scale','offsetX','offsetY')){if($entry.Value.$field-isnot [ValueType] -or $entry.Value.$field-is [bool] -or [double]::IsNaN([double]$entry.Value.$field) -or [double]::IsInfinity([double]$entry.Value.$field)){throw 'Motion presentation numeric value'}}
      if($entry.Value.scale-lt 0.85 -or $entry.Value.scale-gt 1.18 -or [Math]::Abs([double]$entry.Value.offsetX)-gt 70 -or [Math]::Abs([double]$entry.Value.offsetY)-gt 70){throw 'Motion presentation range'}
    }}
    if($manifest.idleRhythmPolicies){foreach($mode in @('quiet','natural')){
      $policy=$manifest.idleRhythmPolicies.$mode
      if(!$policy -or $policy.minGapMs-lt 6000 -or $policy.maxGapMs-lt $policy.minGapMs -or $policy.maxGapMs-gt 120000 -or $policy.chance-lt 0 -or $policy.chance-gt 1){throw 'Motion idle rhythm policy'}
    }}
    if($manifest.activeTaskVariation){
      $neutral=[string]$manifest.activeTaskVariation.neutralClip
      if($neutral-notin @($manifest.pools.thinking) -or $neutral-notin @($manifest.pools.working)){throw 'Motion active neutral pose'}
      foreach($entry in $manifest.activeTaskVariation.clipCooldownMs.PSObject.Properties){if($entry.Name-notin $states -or $entry.Value-isnot [ValueType] -or $entry.Value-lt 0 -or $entry.Value-gt 3600000){throw 'Motion active cooldown'}}
    }
    if($states.Count-lt 9 -or $states.Count-gt 64){throw 'Motion action limit'}
    foreach($name in $states){
      $clip=$manifest.states.$name
      if($name-notmatch '^[a-z]+$' -or $clip.frames-lt 1 -or $clip.frames-gt 600 -or $clip.loop-isnot [bool] -or @($clip.pages).Count-ne [Math]::Ceiling($clip.frames/64) -or ($null-ne $clip.fps -and $clip.fps-notin @(24,30))){throw 'Motion clip layout'}
      if($null-ne $clip.idleCooldownMs -and ($clip.idleCooldownMs-isnot [ValueType] -or $clip.idleCooldownMs-lt 0 -or $clip.idleCooldownMs-gt 3600000)){throw 'Motion idle clip cooldown'}
      $total=0
      foreach($page in $clip.pages){
        if($page.file-notmatch '^[a-z]+-[0-9]\.png$' -or $page.start-ne $total -or $page.count-lt 1 -or $page.count-gt 64 -or $page.rows-ne [Math]::Ceiling($page.count/8)){throw 'Motion page layout'}
        $asset=Join-Path (Join-Path $script:appDir 'assets\dragon-animation\motion-v1') $page.file
        # Missing/corrupt pages are isolated by the asynchronous loader, rather
        # than preventing every otherwise healthy clip from starting.
        $total+=[int]$page.count
      }
      if($total-ne $clip.frames){throw 'Motion frame count'}
    }
    foreach($phase in @('idle','thinking','working','waiting','happy','confused')){
      $pool=@($manifest.pools.$phase)
      if(!$pool.Count -or @($pool|Where-Object{$_-notin $states}).Count){throw 'Motion pool'}
    }
    if($manifest.dragClip -and $manifest.dragClip-notin $states){throw 'Motion drag clip'}
    if($manifest.idleInteractionPool -and @($manifest.idleInteractionPool|Where-Object{$_-notin $states}).Count){throw 'Motion idle interaction pool'}
    if($null-ne $manifest.idleInteractionChance -and ($manifest.idleInteractionChance-lt 0 -or $manifest.idleInteractionChance-gt 1)){throw 'Motion idle interaction chance'}
    if($manifest.returnPoses){foreach($property in $manifest.returnPoses.PSObject.Properties){if($property.Name-notin $states -or $property.Value-isnot [string] -or $property.Value-notin @($manifest.pools.idle)){throw 'Motion return pose'}}}
    if($manifest.touchResponses){foreach($property in $manifest.touchResponses.PSObject.Properties){$vals=@($property.Value);if($property.Name-notin @('head','tail','feet','body','cheek','tickle') -or !$vals.Count -or @($vals|Where-Object{$_ -isnot [string] -or $_-notin $states}).Count){throw 'Motion touch response'}}}
    if($manifest.menuGroups){foreach($property in $manifest.menuGroups.PSObject.Properties){if($property.Name-notin $states -or $property.Value-isnot [string] -or !$property.Value -or $property.Value.Length-gt 24){throw 'Motion menu group'}}}
    foreach($name in @('defaultIdleState','clickSettlePose')){if($manifest.$name -and $manifest.$name-notin $states){throw 'Motion preferred pose'}}
    if($manifest.idleInteractionEntryPoses){foreach($property in $manifest.idleInteractionEntryPoses.PSObject.Properties){if($property.Name-notin $states -or @($property.Value|Where-Object{$_-notin @($manifest.pools.idle)}).Count){throw 'Motion idle entry pose'}}}
    foreach($name in @('clipEntryPoses','clipExitPoses')){if($manifest.$name){foreach($property in $manifest.$name.PSObject.Properties){if($property.Name-notin $states -or $property.Value-notin @('A','B','C')){throw 'Motion pose family'}}}}
    if($manifest.transitionClips){foreach($property in $manifest.transitionClips.PSObject.Properties){if($property.Name-notin $states -or $property.Value-isnot [string] -or $property.Value-notmatch '^[a-z]+$'){throw 'Motion transition clip'}}}
    if($manifest.waitingEntryReaction){
      $entry=$manifest.waitingEntryReaction
      if($entry.clip-notin $states -or $entry.cooldownMs-isnot [ValueType] -or $entry.cooldownMs-lt 60000 -or $entry.cooldownMs-gt 3600000 -or $entry.pendingMs-isnot [ValueType] -or $entry.pendingMs-lt 1000 -or $entry.pendingMs-gt 60000){throw 'Motion waiting entry policy'}
    }
    if($manifest.propPolicies){foreach($property in $manifest.propPolicies.PSObject.Properties){
      if($property.Value-eq 'held-prop-fade' -and ($property.Name-notin $states -or $manifest.clipExitPoses.PSObject.Properties[$property.Name] -or $manifest.returnPoses.($property.Name)-ne 'frontidle' -or $property.Name-in @($manifest.idleInteractionPool) -or @($manifest.pools.PSObject.Properties|Where-Object{$property.Name-in @($_.Value)}).Count)){throw 'Motion held prop scene policy'}
    }}
    $script:dragonManifest=$manifest;$script:dragonPages=@{};$script:dragonLoadRequests=@{};$script:dragonPageOrder=New-Object 'System.Collections.Generic.List[string]'
    $script:dragonFailedClips=@{};$script:dragonRecoverClip=$false;$script:dragonLastMediaError=$null
    $script:dragonPendingEvents=New-Object 'System.Collections.Generic.List[object]';$script:dragonSeenEvents=@{}
    $script:dragonNextEventScan=0;$script:dragonLastObservedPhase='idle'
    $script:dragonWaitingObserved='';$script:dragonWaitingPending=$false;$script:dragonWaitingPendingUntil=0;$script:dragonWaitingReminderAt=$null;$script:dragonIdleClipAt=@{}
    $script:dragonPresentationSequence=0;$script:dragonClipPresentedOrder=@{};$script:dragonClipPresentedAt=@{};$script:dragonIdleLastPresentedAt=$null;$script:dragonIdlePresentedRecent=@()
    if($null-eq $script:dragonNaturalRhythmAt){$script:dragonNaturalRhythmAt=Get-DragonMonotonicMs}
    $script:dragonMediaClock=[DragonMediaClock]::new();$script:dragonFadeClock=[DragonMediaClock]::new();$script:dragonManualClock=[DragonDeadlineClock]::new();$script:dragonHoldClock=[DragonDeadlineClock]::new();$script:dragonHasClickRebound=$null;$script:dragonHasObserverSync=$null
    $script:dragonOriginal=if($script:petFormFullFrame){$script:petFormFullFrame}else{New-DragonCachedFrame (Read-WidgetCharacterImage (Join-Path $script:appDir 'assets\gpt-dragon-niang-bust.png'))};$script:dragonOriginalTooltip=$script:ui.Girl.ToolTip
    $script:dragonActivityDir=Join-Path $script:dataDir 'activity';$script:dragonNextScan=0;$script:dragonSnapshotCache=@{};$script:dragonSnapshots=@()
    $script:dragonPhase='';$script:dragonActivityPhase='idle';$script:dragonManualUntil=0;$script:dragonFrameKey='';$script:dragonWasRendering=$false;$script:dragonEventIndex=@{};$script:dragonPausedAt=0;$script:dragonDragRendering=$false
    $script:dragonHandledFlightSerial=if($script:petNativeMotion){[long]$script:petNativeMotion.FlightSerial}else{0}
    $script:dragonClipSerial=0;$script:dragonLastDrawnSerial=-1;$script:dragonLastDrawnClip='';$script:dragonFadePrevious=$null;$script:dragonQueuedNext=$null;$script:dragonRecentClips=@{};$script:dragonRandom=[Random]::new();$script:dragonIdleInteractionAt=0
    $script:dragonBridgeTarget=$null;$script:dragonBridgePhase='';$script:dragonManualRouteTarget=$null;$script:dragonVisualHoldUntil=0;$script:dragonClipEnteredFrom=''
    $script:dragonStatusAt=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();$script:dragonRendered=0;$script:dragonFrameIndex=0;$script:dragonPresentedTotal=0
    if($script:context){
      $null=$script:context.Items.Add([Windows.Controls.Separator]::new())
      $script:dragonStatusMenu=[Windows.Controls.MenuItem]::new();$script:dragonStatusMenu.Header='全身小龙娘';$script:dragonStatusMenu.IsEnabled=$false;$null=$script:context.Items.Add($script:dragonStatusMenu)
      $toggle=[Windows.Controls.MenuItem]::new();$toggle.Header='可爱小动作';$toggle.IsCheckable=$true;$toggle.IsChecked=$script:dragonAnimationEnabled
      $toggle.Add_Click({param($sender,$event)$script:dragonAnimationEnabled=[bool]$sender.IsChecked;Save-Settings;Tick-DragonAnimation});$null=$script:context.Items.Add($toggle)
      $touch=[Windows.Controls.MenuItem]::new();$touch.Header='触碰有回应';$touch.IsCheckable=$true;$touch.IsChecked=$script:dragonTouchEnabled
      $touch.Add_Click({param($sender,$event)$script:dragonTouchEnabled=[bool]$sender.IsChecked;Save-Settings});$null=$script:context.Items.Add($touch)
      $follow=[Windows.Controls.MenuItem]::new();$follow.Header='跟随 Codex 工作状态';$follow.IsCheckable=$true;$follow.IsChecked=$script:dragonCodexEnabled
      $follow.Add_Click({param($sender,$event)$script:dragonCodexEnabled=[bool]$sender.IsChecked;$script:dragonManualUntil=0;Save-Settings});$null=$script:context.Items.Add($follow)
      $actions=[Windows.Controls.MenuItem]::new();$actions.Header='点播小动作'
      $groups=@{};$groupNames=if($manifest.menuGroups){@($states|ForEach-Object{Get-DragonActionMenuGroup $_}|Select-Object -Unique)}else{@('基础状态','生活小动作','亲昵互动','活动与休息')}
      foreach($label in $groupNames){$group=[Windows.Controls.MenuItem]::new();$group.Header=$label;$null=$actions.Items.Add($group);$groups[$label]=$group}
      foreach($name in $states){
        $label=Get-DragonActionMenuGroup $name
        $item=[Windows.Controls.MenuItem]::new();$item.Header=[string]$manifest.states.$name.label;$item.Tag=$name
        $item.Add_Click({param($sender,$event)$script:dragonManualRouteTarget=$null;$script:dragonManualPhase=[string]$sender.Tag;$script:dragonManualReason='menu';$script:dragonPhase='';$clip=$script:dragonManifest.states.($script:dragonManualPhase);$fps=Get-DragonMediaFps $clip;$script:dragonManualUntil=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()+[Math]::Max(3000.0,$clip.frames*1000.0/$fps+200)});$null=$groups[$label].Items.Add($item)
      }
      $null=$script:context.Items.Add($actions)
    }
    $script:dragonTimer=[Windows.Threading.DispatcherTimer]::new();$script:dragonTimer.Interval=[TimeSpan]::FromMilliseconds(1000/60)
    $script:dragonTimer.Add_Tick({try{Tick-DragonAnimation}catch{Report-DragonMotionFailure $_ 'MOTION_RENDER_FAILED';Stop-DragonAnimation;try{if($script:characterId-eq 'gpt-dragon'){Set-DragonCachedFrame $script:dragonOriginal}}catch{}}})
    $script:dragonTimer.Start();$script:dragonStartupStage='timer-started';[DragonMotionDecoder]::TrimMemory($false)
    if(Get-Command Update-WidgetPetFormMenu -ErrorAction SilentlyContinue){Update-WidgetPetFormMenu}
  }catch{Report-DragonMotionFailure $_ 'MOTION_START_FAILED';Stop-DragonAnimation}
}
