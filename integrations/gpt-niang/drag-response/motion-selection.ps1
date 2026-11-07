# Visual continuity never changes the observed task metadata or controls Codex.
function Set-DragonIdleRhythm([string]$Mode){
  if($Mode-notin @('quiet','natural')){$Mode='quiet'}
  if($script:dragonIdleRhythm-ne $Mode){$script:dragonQueuedNext=$null;$script:dragonNaturalRhythmAt=Get-DragonMonotonicMs;$script:dragonNaturalInteractionAt=0}
  $script:dragonIdleRhythm=$Mode
}
function Set-DragonSmoothManualRoutes([bool]$Enabled){$script:dragonSmoothManualRoutes=$Enabled}
function Test-DragonHeldPropScene([string]$Clip){return $script:dragonManifest.propPolicies.$Clip-eq 'held-prop-fade'}
function Test-DragonIdleInteractionReady([string]$Clip,[long]$DecisionAt=-1){
  $cooldown=[long]$script:dragonManifest.states.$Clip.idleCooldownMs
  if($cooldown-le 0 -or !$script:dragonIdleClipAt -or !$script:dragonIdleClipAt.ContainsKey($Clip)){return $true}
  if($DecisionAt-lt 0){$DecisionAt=Get-DragonMonotonicMs}
  return $DecisionAt-$script:dragonIdleClipAt[$Clip]-ge $cooldown
}
function Reserve-DragonIdleInteraction([string]$Clip){
  if([long]$script:dragonManifest.states.$Clip.idleCooldownMs-le 0){return}
  if(!$script:dragonIdleClipAt){$script:dragonIdleClipAt=@{}}
  $script:dragonIdleClipAt[$Clip]=Get-DragonMonotonicMs
}
function Get-DragonIdleVariationClips {
  $base=[string]$script:dragonManifest.defaultIdleState
  return @(@($script:dragonManifest.idleInteractionPool)+@(Get-DragonPoseSuccessors $base)|Where-Object{$_ -and $_-ne $base}|Select-Object -Unique)
}
function Record-DragonSchedulingPresentation([string]$Clip){
  if(!$script:dragonManifest.idleRhythmPolicies -and !$script:dragonManifest.activeTaskVariation){return}
  if(!$script:dragonClipPresentedOrder){$script:dragonClipPresentedOrder=@{}}
  if(!$script:dragonClipPresentedAt){$script:dragonClipPresentedAt=@{}}
  $script:dragonPresentationSequence=[long]$script:dragonPresentationSequence+1
  $mono=Get-DragonMonotonicMs;$script:dragonClipPresentedOrder[$Clip]=$script:dragonPresentationSequence;$script:dragonClipPresentedAt[$Clip]=$mono
  if($Clip-in @(Get-DragonIdleVariationClips)){
    $script:dragonIdleLastPresentedAt=$mono
    $script:dragonIdlePresentedRecent=@(@($script:dragonIdlePresentedRecent)|Select-Object -Last 1)+@($Clip)
  }
}
function Select-DragonLeastShown($Candidates,$Recent){
  $choices=@($Candidates|Where-Object{$_-notin @($Recent)})
  if(!$choices.Count){$choices=@($Candidates)}
  $least=[long]::MaxValue;$ties=New-Object 'System.Collections.Generic.List[string]'
  foreach($name in $choices){
    $order=if($script:dragonClipPresentedOrder -and $script:dragonClipPresentedOrder.ContainsKey([string]$name)){[long]$script:dragonClipPresentedOrder[[string]$name]}else{-1L}
    if($order-lt $least){$least=$order;$ties.Clear()}
    if($order-eq $least){$ties.Add([string]$name)}
  }
  if($ties.Count){return $ties[$script:dragonRandom.Next($ties.Count)]}
}
function Get-DragonStableIdleContinuation([string]$Current){
  $route=@(Get-DragonPoseSuccessors $Current)
  if($Current-eq [string]$script:dragonManifest.defaultIdleState -and $Current-in $route){return $Current}
  $exit=@($route|Where-Object{$_-ne $Current})
  if($exit.Count){return [string]$exit[$script:dragonRandom.Next($exit.Count)]}
  if($route.Count){return [string]$route[0]}
  return (Get-DragonDefaultIdle)
}
function Select-DragonBalancedIdle([string]$Current,[long]$DecisionAt){
  $base=[string]$script:dragonManifest.defaultIdleState
  # Finish an existing native B/C route before selecting another daily action.
  if($Current-ne $base){return (Get-DragonStableIdleContinuation $Current)}
  $mode=if($script:dragonIdleRhythm-eq 'natural'){'natural'}else{'quiet'}
  $policy=$script:dragonManifest.idleRhythmPolicies.$mode
  if(!$policy){return (Get-DragonStableIdleContinuation $Current)}
  if($null-eq $script:dragonNaturalRhythmAt){$script:dragonNaturalRhythmAt=Get-DragonMonotonicMs}
  $anchor=if($null-ne $script:dragonIdleLastPresentedAt){[long]$script:dragonIdleLastPresentedAt}else{[long]$script:dragonNaturalRhythmAt}
  $minimum=[Math]::Max(6000,[long]$policy.minGapMs);$maximum=[Math]::Max($minimum,[long]$policy.maxGapMs)
  $gap=$DecisionAt-$anchor
  if($gap-lt $minimum){return (Get-DragonStableIdleContinuation $Current)}
  $eligible=@($script:dragonManifest.idleInteractionPool|Where-Object{
    $_ -is [string] -and $script:dragonManifest.states.PSObject.Properties[$_] -and
    (Test-DragonClipAvailable $_) -and (Test-DragonIdleInteractionReady $_ $DecisionAt) -and
    (!$script:dragonManifest.idleInteractionEntryPoses -or $Current-in @($script:dragonManifest.idleInteractionEntryPoses.$_))
  })
  $nowWall=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  if(!$script:dragonLastUserInteractionAt){$script:dragonLastUserInteractionAt=$nowWall}
  if(($nowWall-$script:dragonLastUserInteractionAt)-ge 180000 -and $script:dragonManifest.states.PSObject.Properties['sleeping'] -and (Test-DragonClipAvailable 'sleeping') -and (Test-DragonIdleInteractionReady 'sleeping' $DecisionAt)){
    $eligible+=@('sleeping')
  }
  $eligible+=@(Get-DragonPoseSuccessors $Current|Where-Object{$_-ne $Current})
  $eligible=@($eligible|Where-Object{!(Test-DragonHeldPropScene $_)}|Select-Object -Unique)
  if(!$eligible.Count -or ($gap-lt $maximum -and $script:dragonRandom.NextDouble()-ge [double]$policy.chance)){return (Get-DragonStableIdleContinuation $Current)}
  return (Select-DragonLeastShown $eligible $script:dragonIdlePresentedRecent)
}
function Test-DragonActiveTaskClipReady([string]$Clip,[long]$DecisionAt=-1){
  $policy=$script:dragonManifest.activeTaskVariation
  if(!$policy){return $true}
  $cooldown=[long]$policy.clipCooldownMs.$Clip
  if($cooldown-le 0 -or !$script:dragonClipPresentedAt -or !$script:dragonClipPresentedAt.ContainsKey($Clip)){return $true}
  if($DecisionAt-lt 0){$DecisionAt=Get-DragonMonotonicMs}
  return $DecisionAt-$script:dragonClipPresentedAt[$Clip]-ge $cooldown
}
function Select-DragonActiveTaskClip([string]$Phase,[string]$Current,[long]$DecisionAt){
  $policy=$script:dragonManifest.activeTaskVariation;$neutral=[string]$policy.neutralClip
  $pool=@($script:dragonManifest.pools.$Phase|Where-Object{(Test-DragonClipAvailable $_) -and !(Test-DragonHeldPropScene $_)})
  $choices=@($pool|Where-Object{$_-ne $neutral -and $_-ne $Current -and (Test-DragonActiveTaskClipReady $_ $DecisionAt)})
  if($choices.Count){return (Select-DragonLeastShown $choices @())}
  if($neutral-in $pool){return $neutral}
  if($pool.Count){return [string]$pool[0]}
  return (Get-DragonRecoveryClip)
}
function Get-DragonManualBridge([string]$Current,[string]$Target){
  $bridge=Get-DragonAutomaticBridge $Current $Target
  if(!$bridge){return}
  $from=Get-DragonClipPose $Current $true;$entry=Get-DragonClipPose $bridge
  $exit=Get-DragonClipPose $bridge $true;$to=Get-DragonClipPose $Target
  # A menu option may use existing native pose bridges, never invent a join.
  if($from -and $from-eq $entry -and $exit -and $exit-eq $to){return $bridge}
}
function Get-DragonMediaFps($Clip){
  if($null-ne $Clip.fps){return [int]$Clip.fps}
  return [int]$script:dragonManifest.fps
}
function Resolve-DragonVisualPhase([string]$Desired,[long]$Now){
  if($Desired-eq 'working'){$script:dragonLastWorkingAt=$Now}
  if($Desired-in @('waiting','happy','confused','idle')){return $Desired}
  if($Desired-in @('thinking','working') -and $script:dragonPhase-in @('thinking','working')){
    if($script:dragonPhase-eq 'working' -and $Desired-eq 'thinking' -and $Now-$script:dragonLastWorkingAt-lt 1000){return 'working'}
    $dwell=1400
    $clip=$script:dragonManifest.states.($script:dragonClip)
    if($clip -and $clip.sourceKind-eq 'continuous-video'){$dwell=[Math]::Min(3200,[Math]::Max(1400,$clip.frames*1000.0/(Get-DragonMediaFps $clip)))}
    if($Now-$script:dragonPhaseAt-lt $dwell){return $script:dragonPhase}
  }
  return $Desired
}
function Get-DragonPoseSuccessors([string]$Current){
  if(!$script:dragonManifest.idlePoseRoutes){return}
  $route=$script:dragonManifest.idlePoseRoutes.PSObject.Properties[$Current]
  if(!$route){return}
  foreach($name in @($route.Value)){
    if($name -is [string] -and $script:dragonManifest.states.PSObject.Properties[$name] -and (Test-DragonClipAvailable $name)){Write-Output $name}
  }
}
function Get-DragonIdleEntry([string]$Current){
  $next=@(Get-DragonPoseSuccessors $Current)
  if($next.Count){return [string]$next[0]}
  $preferred=Get-DragonReturnPose $Current
  if($preferred){return $preferred}
  $preferred=Get-DragonDefaultIdle
  if($preferred){return $preferred}
  return [string]@($script:dragonManifest.pools.idle)[0]
}
function Get-DragonDefaultIdle {
  $name=[string]$script:dragonManifest.defaultIdleState
  if($name -and $script:dragonManifest.states.PSObject.Properties[$name] -and $name-in @($script:dragonManifest.pools.idle) -and (Test-DragonClipAvailable $name)){return $name}
  return (Get-DragonRecoveryClip)
}
function Get-DragonClickSettlePose {
  if(!$script:dragonManifest -or !$script:dragonManifest.states){return}
  $name=[string]$script:dragonManifest.clickSettlePose
  if($name -and $script:dragonManifest.states.PSObject.Properties[$name] -and (Test-DragonClipAvailable $name)){return $name}
  foreach($name in @('frontidle','frontpose')){if($script:dragonManifest.states.PSObject.Properties[$name] -and (Test-DragonClipAvailable $name)){return $name}}
  return (Get-DragonIdleEntry '')
}
function Get-DragonFrontIdleHoldMs {
  if($null-ne $script:dragonManifest.frontIdleHoldMs){return [long][Math]::Max(1200,[Math]::Min(30000,[double]$script:dragonManifest.frontIdleHoldMs))}
  return [long]12000
}
function Get-DragonClipPose([string]$Clip,[bool]$Exit=$false){
  $map=if($Exit){$script:dragonManifest.clipExitPoses}else{$script:dragonManifest.clipEntryPoses}
  if($map){$property=$map.PSObject.Properties[$Clip];if($property -and $property.Value-in @('A','B','C')){return [string]$property.Value}}
}
function Get-DragonAutomaticBridge([string]$Current,[string]$Target){
  if(Test-DragonHeldPropScene $Current){return}
  if($script:dragonManifest.transitionClips){
    $property=$script:dragonManifest.transitionClips.PSObject.Properties[$Current]
    if($property -and $property.Value-is [string]){
      $transition=[string]$property.Value
      if($transition-ne $Current -and $transition-ne $Target -and $script:dragonManifest.states.PSObject.Properties[$transition] -and (Test-DragonClipAvailable $transition)){return $transition}
    }
  }
  $from=Get-DragonClipPose $Current $true;$to=Get-DragonClipPose $Target
  $bridge=if($from-eq 'C' -and $to-eq 'B'){'turnside'}elseif($from-eq 'B' -and $to-eq 'C'){'turnfront'}else{$null}
  if($bridge -and $bridge-ne $Current -and $bridge-ne $Target -and $script:dragonManifest.states.PSObject.Properties[$bridge] -and (Test-DragonClipAvailable $bridge)){return $bridge}
}
function Get-DragonReturnPose([string]$Current){
  if(!$script:dragonManifest.returnPoses){return}
  $property=$script:dragonManifest.returnPoses.PSObject.Properties[$Current]
  if(!$property -or $property.Value-isnot [string]){return}
  $pose=[string]$property.Value
  if($pose-ne $Current -and $script:dragonManifest.states.PSObject.Properties[$pose] -and $pose-in @($script:dragonManifest.pools.idle) -and (Test-DragonClipAvailable $pose)){return $pose}
}
function Test-DragonNativePoseJoin([string]$Current,[string]$Next){
  # Candidate topology only. Rendering additionally checks sampled tail/serial.
  if(Test-DragonHeldPropScene $Current){return $false}
  return $Next-in @(Get-DragonPoseSuccessors $Current)
}
function Test-DragonRenderedPoseJoin([string]$Current,[string]$Next,[int]$Frame,[long]$DrawnSerial,[long]$ClipSerial,[bool]$NativeVisible){
  if(!$NativeVisible -or $DrawnSerial-lt 0 -or $DrawnSerial-ne $ClipSerial -or !$script:dragonManifest.states.PSObject.Properties[$Current]){return $false}
  return $Frame-eq [int]$script:dragonManifest.states.$Current.frames-1 -and (Test-DragonNativePoseJoin $Current $Next)
}
function Get-DragonDragClip {
  if($script:widgetPetForm-ne 'full' -or $script:characterId-ne 'gpt-dragon'){return}
  $name=[string]$script:dragonManifest.dragClip
  if($name -and $script:dragonManifest.states.PSObject.Properties[$name]){return $name}
}
function Test-DragonMotionDragActive {
  if(!(Get-DragonDragClip)){return $false}
  # Drag feedback belongs only to a held pointer. Throw inertia must not
  # extend or start a separate flight performance after mouse-up.
  if($script:petNativeMotion -and $script:petNativeMotion.Flying){return $true}
  if($script:petNativeMotion -and $script:petNativeMotion.Dragging){return [bool]($script:petNativeMotion.Moved -and $script:petNativeMotion.DragFlightEligible)}
  return [bool]($script:drag -and $script:drag.moved)
}
function Get-DragonDragReleaseClip {
  $motion=$script:petNativeMotion;$landing=[string]$script:dragonManifest.dragLandingClip
  $physicalRest=($motion -and $motion.StopReason-eq 'rested' -and [long]$motion.FlightSerial-gt 0 -and [long]$motion.CompletedFlightSerial-eq [long]$motion.FlightSerial)
  $air=Get-DragonDragClip
  $heldAirRelease=($motion -and $motion.StopReason-eq 'released' -and $motion.DragFlightEligible -and
    [long]$motion.DragSerial-gt 0 -and [long]$script:dragonPresentedDragSerial-eq [long]$motion.DragSerial -and
    $script:dragonClip-eq $air -and $script:dragonLastDrawnClip-eq $air -and
    $script:dragonLastDrawnSerial-ge 0 -and $script:dragonLastDrawnSerial-eq $script:dragonClipSerial -and
    $script:dragonFrameIndex-ge [Math]::Min(66,[int]$script:dragonManifest.states.$air.frames-1))
  if($motion -and !$motion.Flying -and !$motion.Dragging -and ($physicalRest -or $heldAirRelease) -and
     $landing -and $script:dragonManifest.states.PSObject.Properties[$landing] -and (Test-DragonClipAvailable $landing)){return $landing}
  return (Get-DragonIdleEntry $script:dragonClip)
}
function Get-DragonActionMenuGroup([string]$Name){
  if($script:dragonManifest.menuGroups){
    $property=$script:dragonManifest.menuGroups.PSObject.Properties[$Name]
    if($property -and $property.Value-is [string] -and $property.Value){return [string]$property.Value}
  }
  if($Name-in @('idle','thinking','working','waiting','happy','confused')){return '基础状态'}
  if($Name-in @('heart','shy','bow','facepalm')){return '亲昵互动'}
  if($Name-in @('walking','stretching','sleeping','dance','flutter')){return '活动与休息'}
  return '生活小动作'
}
function Select-DragonNextClip([string]$Phase,[string]$Current,[long]$DecisionAt=-1){
  if($DecisionAt-lt 0){$DecisionAt=Get-DragonMonotonicMs}
  if($Phase-eq 'idle'){
    $preferred=Get-DragonReturnPose $Current
    if($preferred){return $preferred}
    if($script:dragonManifest.idleRhythmPolicies){return (Select-DragonBalancedIdle $Current $DecisionAt)}
    # Insert occasional interactions only at stable poses, never in an approved bridge.
    $natural=$script:dragonIdleRhythm-eq 'natural'
    $now=if($natural){Get-DragonMonotonicMs}else{[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()}
    if($natural -and !$script:dragonNaturalRhythmAt){$script:dragonNaturalRhythmAt=$now}
    $cooldown=if($natural){18000}else{[long]$script:dragonManifest.idleInteractionCooldownMs}
    $chance=if($natural){0.18}else{[double]$script:dragonManifest.idleInteractionChance}
    $lastInteraction=if($natural){$script:dragonNaturalInteractionAt}else{$script:dragonIdleInteractionAt}
    $forceNatural=$natural -and $now-$(if($lastInteraction){$lastInteraction}else{$script:dragonNaturalRhythmAt})-ge 45000
    if($Current-in @('idle','idlesway','brelaxed','frontidle') -and $chance-gt 0 -and
       (!$lastInteraction -or $now-$lastInteraction-ge $cooldown)){
      $interactions=@($script:dragonManifest.idleInteractionPool|Where-Object{
        if($_ -isnot [string] -or !$script:dragonManifest.states.PSObject.Properties[$_] -or !(Test-DragonClipAvailable $_) -or !(Test-DragonIdleInteractionReady $_)){return $false}
        if(!$script:dragonManifest.idleInteractionEntryPoses){return $true}
        $entry=$script:dragonManifest.idleInteractionEntryPoses.PSObject.Properties[$_]
        return [bool]($entry -and $Current-in @($entry.Value))
      })
      if($interactions.Count -and ($forceNatural -or $script:dragonRandom.NextDouble()-lt $chance)){
        $recent=@($script:dragonRecentClips.idleInteraction)
        $choices=@($interactions|Where-Object{$_-notin $recent})
        if(!$choices.Count){$choices=$interactions}
        $chosen=[string]$choices[$script:dragonRandom.Next($choices.Count)]
        $script:dragonRecentClips.idleInteraction=@($recent|Select-Object -Last 1)+@($chosen)
        $script:dragonIdleInteractionAt=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        if($natural){$script:dragonNaturalInteractionAt=$now}
        Reserve-DragonIdleInteraction $chosen
        return $chosen
      }
    }
    $route=@(Get-DragonPoseSuccessors $Current)
    if($route.Count){return [string]$route[$script:dragonRandom.Next($route.Count)]}
    $preferred=Get-DragonDefaultIdle
    if($preferred){return $preferred}
  }
  if($Phase-in @('thinking','working') -and $script:dragonManifest.activeTaskVariation){return (Select-DragonActiveTaskClip $Phase $Current $DecisionAt)}
  $pool=@($script:dragonManifest.pools.$Phase|Where-Object{Test-DragonClipAvailable ([string]$_)})
  $bases=@($script:dragonManifest.idleBases|Where-Object{$_ -is [string] -and $_ -in $pool})
  if(!$bases.Count){$bases=@('idle')}
  if($Phase-eq 'idle' -and $Current-in $bases -and $script:dragonManifest.idlePoseEntry -in $pool -and $script:dragonManifest.idlePoseEntryChance-gt 0){
    if($script:dragonRandom.NextDouble()-lt [double]$script:dragonManifest.idlePoseEntryChance){return [string]$script:dragonManifest.idlePoseEntry}
  }
  if($Phase-eq 'idle' -and $Current-notin $bases -and $script:dragonRandom.NextDouble()-lt 0.75){$pool=$bases}
  $recent=@($script:dragonRecentClips.$Phase)
  $choices=@($pool|Where-Object{$_-ne $Current -and $_-notin $recent})
  if(!$choices.Count){$choices=@($pool|Where-Object{$_-ne $Current})}
  if(!$choices.Count){if(Test-DragonClipAvailable $Current){return $Current};return (Get-DragonRecoveryClip)}
  $chosen=[string]$choices[$script:dragonRandom.Next($choices.Count)]
  $script:dragonRecentClips[$Phase]=@($Current,$chosen)
  return $chosen
}
function Invoke-DragonTouch([double]$X,[double]$Y){
  if(!$script:dragonAnimationEnabled -or !$script:dragonTouchEnabled -or $script:characterId-ne 'gpt-dragon' -or ($script:widgetMusic -and $script:widgetMusic.Enabled)){return $false}
  $now=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $script:dragonLastUserInteractionAt=$now
  if($now-lt $script:dragonTouchNextAt -or $X-lt 0 -or $X-gt 1 -or $Y-lt 0 -or $Y-gt 1){return $false}
  $region=if(($X-gt 0.65 -and $Y-gt 0.45) -or ($X-lt 0.32 -and $Y-gt 0.58)){'tail'}elseif($Y-ge 0.27 -and $Y-lt 0.44 -and $X-ge 0.28 -and $X-le 0.72){'cheek'}elseif($Y-lt 0.44){'head'}elseif($Y-ge 0.44 -and $Y-lt 0.72 -and ($X-lt 0.36 -or $X-gt 0.64)){'tickle'}elseif($Y-gt 0.84){'feet'}else{'body'}
  $raw=if($script:dragonManifest.touchResponses -and $script:dragonManifest.touchResponses.PSObject.Properties[$region]){$script:dragonManifest.touchResponses.$region}else{$null}
  $candidates=@()
  if($raw){$candidates=@($raw|ForEach-Object{[string]$_}|Where-Object{$_ -and $script:dragonManifest.states.PSObject.Properties[$_] -and (Test-DragonClipAvailable $_)})}
  if(!$candidates.Count){
    $fallback=switch($region){'tail'{'flutterplay'}'cheek'{'cheekpuff'}'head'{'happy'}'tickle'{'tickledodge'}'feet'{'bow'}default{'response'}}
    if($script:dragonManifest.states.PSObject.Properties[$fallback] -and (Test-DragonClipAvailable $fallback)){$candidates=@($fallback)}
  }
  if(!$candidates.Count){return $false}
  $filtered=@($candidates|Where-Object{$_-ne $script:dragonLastTouchClip})
  if(!$filtered.Count){$filtered=$candidates}
  $clip=[string]$filtered[$script:dragonRandom.Next($filtered.Count)]
  $spec=$script:dragonManifest.states.$clip;$fps=Get-DragonMediaFps $spec
  Request-DragonMotionPage $clip 0
  $script:dragonLastTouchClip=$clip;$script:dragonLastTouchRegion=$region;$script:dragonLastTouchAt=$now
  $script:dragonManualPhase=$clip;$script:dragonManualReason='touch';$script:dragonBridgeTarget=$null;$script:dragonPhase=''
  $script:dragonManualUntil=$now+[Math]::Max(2500.0,$spec.frames*1000.0/$fps+180)
  $script:dragonTouchNextAt=$now+650
  return $true
}
