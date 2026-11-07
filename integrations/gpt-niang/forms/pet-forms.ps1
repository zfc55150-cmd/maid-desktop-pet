# Two views inside the same character canvas. No placement or scale is saved here.
function Read-WidgetPetBustFrame {
  $path=Join-Path $script:appDir 'assets\pet-forms\frost-glass-cheek.png'
  $image=Read-WidgetCharacterImage $path
  # Build directly from the original PNG, never from a thumbnail. The old
  # 384px canvas reduced the artwork to 176px before the user's zoom applied.
  $cell=2048;$width=$cell*0.62;$height=$width*$image.PixelHeight/$image.PixelWidth
  $visual=[Windows.Media.DrawingVisual]::new();$drawing=$visual.RenderOpen()
  [Windows.Media.RenderOptions]::SetBitmapScalingMode($visual,[Windows.Media.BitmapScalingMode]::HighQuality)
  try{$drawing.DrawImage($image,[Windows.Rect]::new(($cell-$width)/2,($cell*359/384-$height),$width,$height))}finally{$drawing.Close()}
  $bitmap=[Windows.Media.Imaging.RenderTargetBitmap]::new($cell,$cell,96,96,[Windows.Media.PixelFormats]::Pbgra32)
  $bitmap.Render($visual);$bitmap.Freeze()
  return (New-DragonCachedFrame $bitmap)
}
function Read-WidgetPetFullFrame([string]$Pose='') {
  # A real body frame is available before either form becomes visible. The
  # original portrait bitmap is a different pose and must never be a fallback.
  $manifestFile=Join-Path $script:appDir 'runtime\dragon-animation\animation.json'
  $manifest=[IO.File]::ReadAllText($manifestFile,[Text.Encoding]::UTF8)|ConvertFrom-Json
  $name=if($Pose -and $manifest.states.PSObject.Properties[$Pose]){$Pose}elseif($manifest.defaultIdleState -and $manifest.states.PSObject.Properties[[string]$manifest.defaultIdleState]){[string]$manifest.defaultIdleState}else{'idle'}
  $cell=[int]$manifest.cellSize;$page=@($manifest.states.$name.pages)[0]
  if($cell-notin @(320,384) -or [int]$manifest.columns-ne 8 -or !$page -or $page.file-notmatch '^[a-z]+-0\.png$' -or [int]$page.start-ne 0){throw 'FORM_FULL_PREVIEW_LAYOUT'}
  $image=Read-WidgetCharacterImage (Join-Path $script:appDir ('assets\dragon-animation\motion-v1\'+$page.file))
  if($image.PixelWidth-ne $cell*8 -or $image.PixelHeight-lt $cell){throw 'FORM_FULL_PREVIEW_DIMENSIONS'}
  $stride=$cell*4;$pixels=New-Object byte[] ($stride*$cell)
  $image.CopyPixels([Windows.Int32Rect]::new(0,0,$cell,$cell),$pixels,$stride,0)
  $frame=[Windows.Media.Imaging.BitmapSource]::Create($cell,$cell,96,96,[Windows.Media.PixelFormats]::Bgra32,$null,$pixels,$stride);$frame.Freeze()
  return (New-DragonCachedFrame $frame)
}
function Reset-WidgetPetFrameTransition {
  if(Get-Command Stop-WidgetAudio -ErrorAction SilentlyContinue){Stop-WidgetAudio}
  if(Get-Command Clear-WidgetFullClickQueue -ErrorAction SilentlyContinue){Clear-WidgetFullClickQueue}
  $script:petFullClickIdleUntil=0;$script:petFullPressActive=$false;$script:petFullPressWasDragged=$false;$script:petFullPressFrame=$null
  $script:petFullReboundPending=$false;$script:petFullReboundTarget='';$script:petFullReboundQueuedAt=0
  if(Get-Command Reset-WidgetFullClick -ErrorAction SilentlyContinue){Reset-WidgetFullClick}
  $script:dragonManualUntil=0;$script:dragonPhase='';$script:dragonFrameKey='';$script:dragonFadePrevious=$null
  $script:dragonWasRendering=$false;$script:dragonLastDrawnSerial=-1;$script:dragonLastDrawnClip='';$script:dragonBridgeTarget=$null
}
function Get-WidgetFullPressNow {return [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()}
function Initialize-WidgetFullPressScale {
  if($script:petFullClickScale){return}
  $script:petFullClickScale=[Windows.Media.ScaleTransform]::new(1,1)
  $group=[Windows.Media.TransformGroup]::new();$group.Children.Add($script:ui.Girl.RenderTransform);$group.Children.Add($script:petFullClickScale)
  $script:ui.Girl.RenderTransform=$group;$script:ui.Girl.RenderTransformOrigin=[Windows.Point]::new(0.5,359.0/384)
}
function Set-WidgetFullPressScale([double]$Target,[int]$Duration){
  Initialize-WidgetFullPressScale
  $current=[double]$script:petFullClickScale.ScaleY
  $script:petFullClickScale.BeginAnimation([Windows.Media.ScaleTransform]::ScaleYProperty,$null)
  $script:petFullClickScale.ScaleY=$current
  if(![Windows.SystemParameters]::ClientAreaAnimation){$script:petFullClickScale.ScaleY=1;return}
  $animation=[Windows.Media.Animation.DoubleAnimation]::new($current,$Target,[Windows.Duration]::new([TimeSpan]::FromMilliseconds($Duration)))
  $animation.EasingFunction=[Windows.Media.Animation.CubicEase]::new();$animation.EasingFunction.EasingMode=[Windows.Media.Animation.EasingMode]::EaseOut
  $animation.FillBehavior=[Windows.Media.Animation.FillBehavior]::HoldEnd
  if('GptFullClickAnimation'-as [type]){[GptFullClickAnimation]::RequestRefreshRate($animation,[IntPtr]([long]$script:widgetHandle))}
  else{[Windows.Media.Animation.Timeline]::SetDesiredFrameRate($animation,120)}
  $script:petFullClickScale.BeginAnimation([Windows.Media.ScaleTransform]::ScaleYProperty,$animation)
}
function Start-WidgetFullPress {
  if($script:petFormTransition -or !$script:ui.Girl.Source){return}
  $script:petFullPressActive=$true;$script:petFullPressWasDragged=$false
  # DeepSeek's full form keeps playing while held. Pointer-down only arms the
  # click/drag decision; no extra 92% press and no frozen source bitmap.
  Initialize-WidgetFullPressScale
  if($script:dragonAnimationEnabled -and $script:dragonTouchEnabled -and (Get-Command Get-DragonClickSettlePose -ErrorAction SilentlyContinue)){
    $pose=Get-DragonClickSettlePose
    if($pose){Request-DragonMotionPage $pose 0}
  }
}
function New-WidgetFullReboundTimeline([double]$current){
  # Match the installed DeepSeek curve: 220ms, height0.55 at99ms,
  # then its cubic back-ease. Two native spline segments reproduce the
  # quadratic/cubic polynomials without per-frame PowerShell callbacks.
  # The first segment starts at the real displayed scale on rapid repeats.
  $duration=220
  $animation=[Windows.Media.Animation.DoubleAnimationUsingKeyFrames]::new()
  $null=$animation.KeyFrames.Add([Windows.Media.Animation.LinearDoubleKeyFrame]::new($current,[Windows.Media.Animation.KeyTime]::FromTimeSpan([TimeSpan]::Zero)))
  $points=@(@{time=99;value=0.55;spline=[Windows.Media.Animation.KeySpline]::new(1.0/3,0,2.0/3,1.0/3)},
            @{time=220;value=1.0;spline=[Windows.Media.Animation.KeySpline]::new(1.0/3,1.5671933333333333,2.0/3,1)})
  foreach($point in $points){
    $spline=$point.spline
    $key=[Windows.Media.Animation.SplineDoubleKeyFrame]::new([double]$point.value,[Windows.Media.Animation.KeyTime]::FromTimeSpan([TimeSpan]::FromMilliseconds([int]$point.time)),$spline)
    $null=$animation.KeyFrames.Add($key)
  }
  $animation.Duration=[Windows.Duration]::new([TimeSpan]::FromMilliseconds($duration))
  $animation.FillBehavior=[Windows.Media.Animation.FillBehavior]::Stop
  if('GptFullClickAnimation'-as [type]){[GptFullClickAnimation]::RequestRefreshRate($animation,[IntPtr]([long]$script:widgetHandle))}
  else{[Windows.Media.Animation.Timeline]::SetDesiredFrameRate($animation,120)}
  return $animation
}
function Start-WidgetFullRebound {
  Initialize-WidgetFullPressScale
  $current=[double]$script:petFullClickScale.ScaleY
  $script:petFullClickScale.BeginAnimation([Windows.Media.ScaleTransform]::ScaleYProperty,$null)
  $script:petFullClickScale.ScaleY=1
  if(![Windows.SystemParameters]::ClientAreaAnimation){return 0}
  $animation=New-WidgetFullReboundTimeline $current
  $script:petFullClickScale.BeginAnimation([Windows.Media.ScaleTransform]::ScaleYProperty,$animation)
  return [int]$animation.Duration.TimeSpan.TotalMilliseconds
}
function Cancel-WidgetFullPress {
  if(!$script:petFullPressActive -and !$script:petFullClickIdleUntil -and !$script:petFullReboundPending){return}
  $script:petFullPressActive=$false;$script:petFullPressWasDragged=$true;$script:petFullClickIdleUntil=0;$script:petFullPressFrame=$null
  Clear-WidgetFullClickQueue
  $script:petFullReboundPending=$false;$script:petFullReboundTarget='';$script:petFullReboundQueuedAt=0
  if(Get-Command Reset-WidgetFullClick -ErrorAction SilentlyContinue){Reset-WidgetFullClick}
  elseif($script:petFullClickScale){$script:petFullClickScale.BeginAnimation([Windows.Media.ScaleTransform]::ScaleYProperty,$null);$script:petFullClickScale.ScaleY=1}
}
function Complete-WidgetFullPress {
  if(!$script:petFullPressActive){return}
  if($script:petFullPressWasDragged){Cancel-WidgetFullPress;return}
  $script:petFullPressActive=$false
  # Mouse-up alone is not a click (lost capture/drag also releases). The
  # confirmed click queues its rebound below, after its target is present.
}
function Try-WidgetFullClickRebound {
  if(!$script:petFullReboundPending){return}
  if($script:petFormTransition -or $script:widgetPetForm-ne 'full' -or ($script:drag -and $script:drag.moved)) {Cancel-WidgetFullPress;return}
  if($script:petFullReboundTarget){
    if($script:dragonManualReason-ne 'click-settle'){Cancel-WidgetFullPress;return}
    $ready=($script:dragonLastDrawnClip-eq $script:petFullReboundTarget -and $script:dragonLastDrawnSerial-eq $script:dragonClipSerial)
    # Never squash an outgoing action just because an idle load timed out.
    if(!$ready){return}
  }
  if($script:petFullReboundAwaitRender){return}
  $script:petFullReboundPending=$false;$script:petFullReboundTarget=''
  $duration=Start-WidgetFullRebound
  $script:petFullClickIdleUntil=(Get-WidgetFullPressNow)+$duration
  Add-WidgetFullClickTrace 'reboundStarted'
}
function Add-WidgetFullClickTrace([string]$Event){
  if(!$script:petFullClickTrace){$script:petFullClickTrace=New-Object 'System.Collections.Generic.List[object]'}
  if($script:petFullClickTrace.Count-ge 8){$script:petFullClickTrace.RemoveAt(0)}
  $script:petFullClickTrace.Add(@{at=(Get-WidgetFullPressNow);event=$Event;clip=[string]$script:dragonLastDrawnClip;frame=[int]$script:dragonFrameIndex;renderTicks=[int]$script:petFullReboundRenderTicks;scaleY=if($script:petFullClickScale){[double]$script:petFullClickScale.ScaleY}else{1.0}})
}
function Clear-WidgetFullClickQueue {
  $script:petFullReboundQueueEpoch=[long]$script:petFullReboundQueueEpoch+1
  if($script:petFullReboundOperation){$null=$script:petFullReboundOperation.Abort();$script:petFullReboundOperation=$null}
  if($script:petFullReboundRenderingHandler){[Windows.Media.CompositionTarget]::remove_Rendering($script:petFullReboundRenderingHandler);$script:petFullReboundRenderingHandler=$null}
  $script:petFullReboundAwaitRender=$false
  if($script:petFullReboundVisibleClock){$script:petFullReboundVisibleClock.Stop();$script:petFullReboundVisibleClock=$null}
}
function Get-WidgetFullReboundElapsedMs {
  if($script:petFullReboundVisibleClock){return $script:petFullReboundVisibleClock.Elapsed.TotalMilliseconds}
  return [double]0
}
function Queue-WidgetFullClickRebound {
  Clear-WidgetFullClickQueue
  $script:petFullReboundAwaitRender=$true
  $script:petFullReboundQueuedAt=Get-WidgetFullPressNow;$script:petFullReboundRenderTicks=0
  $script:petFullReboundVisibleClock=[Diagnostics.Stopwatch]::StartNew()
  $callback=[EventHandler]{
    if(!$script:petFullReboundPending -or !$script:petFullReboundAwaitRender){Clear-WidgetFullClickQueue;return}
    $script:petFullReboundRenderTicks++
    if((Get-WidgetFullReboundElapsedMs)-lt 40 -or $script:petFullReboundRenderTicks-lt 2){return}
    [Windows.Media.CompositionTarget]::remove_Rendering($script:petFullReboundRenderingHandler);$script:petFullReboundRenderingHandler=$null
    $script:petFullReboundAwaitRender=$false
    Add-WidgetFullClickTrace 'idleVisibleLeadInCompleted'
    Try-WidgetFullClickRebound
  }
  $script:petFullReboundRenderingHandler=$callback
  [Windows.Media.CompositionTarget]::add_Rendering($callback)
}
function Get-WidgetFullClickIdleFrame([string]$Pose){
  $page=@($script:dragonManifest.states.$Pose.pages)[0]
  $key=$Pose+'|'+[string]$page.sha256
  $presentation=$script:dragonManifest.clipPresentation.$Pose
  if($presentation){$key+='|camera:'+($presentation|ConvertTo-Json -Compress)}
  if($script:petFullClickIdleFrameKey-eq $key -and $script:petFullClickIdleFrame){return $script:petFullClickIdleFrame}
  $frame=Get-DragonMotionFrame $Pose 0
  if(!$frame){
    # A degraded recovery pose may have a fixed display camera. Never cache
    # an uncalibrated PNG as that pose while its asynchronous page is cold.
    if($presentation){throw 'CLICK_CALIBRATED_IDLE_NOT_READY'}
    $frame=Read-WidgetPetFullFrame $Pose
  }
  if(!$frame -or !$frame.image){throw 'CLICK_IDLE_FRAME_UNAVAILABLE'}
  $script:petFullClickIdleFrame=$frame;$script:petFullClickIdleFrameKey=$key
  return $frame
}
if(!$script:petFormOriginalPress -and (Get-Command Animate-Press -ErrorAction SilentlyContinue)){$script:petFormOriginalPress=(Get-Command Animate-Press).ScriptBlock}
function Animate-Press([bool]$Down){
  if($script:characterId-eq 'gpt-dragon' -and $script:widgetPetForm-eq 'full' -and !($script:widgetMusic -and $script:widgetMusic.Enabled)){
    if($Down){Start-WidgetFullPress}else{Complete-WidgetFullPress};return
  }
  if($script:petFormOriginalPress){& $script:petFormOriginalPress $Down}
}
function Invoke-WidgetFullIdleClick {
  if($script:characterId-ne 'gpt-dragon' -or $script:widgetPetForm-ne 'full' -or $script:petFormTransition){return}
  $script:petFullReboundPending=$true;$script:petFullReboundQueuedAt=Get-WidgetFullPressNow;$script:petFullReboundTarget=''
  $script:petFullClickTrace=New-Object 'System.Collections.Generic.List[object]'
  if(!$script:dragonTouchEnabled -or !$script:dragonAnimationEnabled){Try-WidgetFullClickRebound;return}
  $pose=Get-DragonClickSettlePose
  if(!$pose -or !$script:dragonManifest.states.PSObject.Properties[$pose]){Try-WidgetFullClickRebound;return}
  $now=Get-WidgetFullPressNow
  # Commit a verified native idle now. A queued target/serial is not proof
  # that the actual Image.Source has changed before the squash starts.
  $script:dragonManualPhase=$pose;$script:dragonManualReason='click-settle';$script:dragonBridgeTarget=$null
  # Every confirmed click explicitly returns to native idle0, including a
  # click while another frame of that same idle clip is currently playing.
  if($pose){
    try{$idle=Get-WidgetFullClickIdleFrame $pose}catch{Clear-WidgetFullClickQueue;$script:petFullReboundPending=$false;Add-WidgetFullClickTrace 'idleUnavailable';return}
    Clear-WidgetFullClickQueue
    if($script:petFullClickScale){$script:petFullClickScale.BeginAnimation([Windows.Media.ScaleTransform]::ScaleYProperty,$null);$script:petFullClickScale.ScaleY=1}
    Set-DragonVisualClip $pose $pose $now $true
    $script:dragonFadePrevious=$null;$script:dragonPausedAt=0
    Set-DragonCachedFrame $idle
    $script:dragonLastDrawnClip=$pose;$script:dragonLastDrawnSerial=$script:dragonClipSerial;$script:dragonFrameIndex=0;$script:dragonFrameKey=$pose+':0';$script:dragonWasRendering=$true
    $script:petFormFullFrame=$idle
  }
  $script:dragonPhase=$pose;$script:dragonPhaseAt=$now
  $script:dragonManualUntil=$now+(Get-DragonFrontIdleHoldMs)+200
  $script:petFullReboundTarget=$pose
  Add-WidgetFullClickTrace 'idleCommittedBeforeSquash'
  if($script:dragonTimer -and !$script:dragonTimer.IsEnabled){$script:dragonTimer.Start()}
  Queue-WidgetFullClickRebound
}
# Small-form bubble sizes are relative to the character. Keep the original
# independent layout, preferences and full-body appearance untouched.
if(!$script:petFormOriginalLayout -and (Get-Command Set-WidgetIndependentLayout -ErrorAction SilentlyContinue)){$script:petFormOriginalLayout=(Get-Command Set-WidgetIndependentLayout).ScriptBlock}
if(!$script:petFormOriginalSceneLayout -and (Get-Command Set-WidgetSceneLayout -ErrorAction SilentlyContinue)){$script:petFormOriginalSceneLayout=(Get-Command Set-WidgetSceneLayout).ScriptBlock}
function Set-WidgetIndependentLayout {
  if($script:petFormOriginalLayout){& $script:petFormOriginalLayout}
  foreach($name in @('Tail','TailNear')){if($script:ui[$name]){$script:ui[$name].StrokeThickness=4}}
  if($script:widgetPetForm-ne 'bust' -or $script:characterId-ne 'gpt-dragon' -or !$script:petBustFrame){return}
  $layout=Get-WidgetLayoutScale;$character=$script:scale/$layout
  $minimum=if($script:bubbleMode-eq 'quota'){0.9}else{0.5}
  $bubble=[Math]::Min(1.0,[Math]::Max($minimum,0.58*$script:scale*$script:bubbleScale)/$layout)
  $girlLeft=[Windows.Controls.Canvas]::GetLeft($script:ui.Girl);$girlTop=[Windows.Controls.Canvas]::GetTop($script:ui.Girl)
  $headTop=$girlTop+$script:ui.Girl.Height*(359/384-0.62*1139/1381)
  $headCenter=$girlLeft+$script:ui.Girl.Width/2
  $script:ui.Bubble.LayoutTransform=[Windows.Media.ScaleTransform]::new($bubble,$bubble)
  $left=[Math]::Max(4-25*$bubble,[Math]::Min(346-285*$bubble,$headCenter-155*$bubble))
  $top=[Math]::Max(4,[Math]::Min(350-172*$bubble,$headTop-18*$character-170*$bubble))
  [Windows.Controls.Canvas]::SetLeft($script:ui.Bubble,$left);[Windows.Controls.Canvas]::SetTop($script:ui.Bubble,$top)
  # Two small thought dots bridge the gap to the visible head, rather than
  # pointing at the transparent top half of the shared character canvas.
  foreach($dot in @(@{name='Tail';width=12;height=9;gap=13;x=-18},@{name='TailNear';width=7;height=5;gap=5;x=-7})){
    $element=$script:ui[$dot.name];$element.Width=$dot.width*$character;$element.Height=$dot.height*$character
    $element.StrokeThickness=2*$character
    [Windows.Controls.Canvas]::SetLeft($element,$headCenter+$dot.x*$character)
    [Windows.Controls.Canvas]::SetTop($element,$headTop-$dot.gap*$character)
  }
  if($script:widgetMusic -and $script:widgetMusic.Enabled){$script:widgetMusic.CaptureBaseLayout()}
}
function Set-WidgetSceneLayout {
  if($script:petFormOriginalSceneLayout){& $script:petFormOriginalSceneLayout}
  if($script:widgetPetForm-eq 'bust' -and $script:characterId-eq 'gpt-dragon'){Set-WidgetIndependentLayout}
}
function Update-WidgetPetFormMenu {
  $dragon=$script:characterId-eq 'gpt-dragon'
  if($dragon -and $script:widgetPetForm-eq 'bust'){$script:ui.Girl.ToolTip='点击先看额度，再点换语录；收起后从额度开始；拖动调整位置；右键设置'}
  elseif($dragon){$script:ui.Girl.ToolTip='点击轻压回弹后正面放松；拖动调整位置；右键查看额度、点播动作和设置'}
  if($script:dragonTimer){$script:dragonTimer.Interval=[TimeSpan]::FromMilliseconds($(if($dragon -and $script:widgetPetForm-eq 'bust'){1000}else{1000/60}))}
  if($script:petFormMenu){$script:petFormMenu.IsEnabled=$dragon -and [bool]$script:petBustFrame -and [bool]$script:petFormFullFrame -and (!$script:petFormStore -or [bool]$script:petFormStore.CanSave)}
  if($script:petFormActionsMenu){$script:petFormActionsMenu.Visibility=if($dragon -and $script:widgetPetForm-eq 'bust'){'Collapsed'}else{'Visible'}}
  if($script:petFormsReady){Set-WidgetIndependentLayout}
}
function Write-WidgetPetForm {
  $script:petFormSaveError=$null
  $value=@{version=1;form=$script:widgetPetForm;autoBubble=[bool]$script:petAutoBubbleEnabled}
  try{
    if($script:petFormStore){Save-WidgetSettingsStore -State $script:petFormStore -Value $value}
    else{Write-WidgetJson (Join-Path $script:dataDir 'pet-form.json') $value}
  }catch{$script:petFormSaveError='PET_FORM_SAVE_BLOCKED';$script:experienceMessage='形态设置暂不可保存，已保留原偏好'}
}
function Restore-WidgetPetFormPreference {
  if($script:petFormPrevious-in @('full','bust')){$script:widgetPetForm=$script:petFormPrevious;$script:petFormTarget=$script:petFormPrevious}
  Reset-WidgetPetFrameTransition
  $frame=if($script:widgetPetForm-eq 'bust'){$script:petBustFrame}else{$script:petFormFullFrame}
  if($frame){Set-DragonCachedFrame $frame}
}
function Get-WidgetPetBubbleDelay {
  if(!$script:petBubbleRandom){$script:petBubbleRandom=[Random]::new()}
  return $script:petBubbleRandom.Next(120000,300001)
}
function Test-WidgetPetBubbleDue([long]$Now,[bool]$Visible,[bool]$Busy) {
  $gap=$Now-$script:petBubbleLastTick
  if(!$script:petAutoBubbleEnabled -or !$Visible -or $Busy){$script:petBubbleNextAt=0;$script:petBubbleLastTick=$Now;return $false}
  if(!$script:petBubbleNextAt -or $gap-lt 0 -or $gap-gt 5000){
    $script:petBubbleNextAt=$Now+(Get-WidgetPetBubbleDelay);$script:petBubbleLastTick=$Now;return $false
  }
  $script:petBubbleLastTick=$Now
  if($Now-lt $script:petBubbleNextAt){return $false}
  $script:petBubbleNextAt=$Now+(Get-WidgetPetBubbleDelay)
  return $true
}
# Keep the full-body schedule intact; the small form has its own quiet rhythm.
if(!$script:petBubbleOriginalTick -and (Get-Command Tick-WidgetAutoQuote -ErrorAction SilentlyContinue)){$script:petBubbleOriginalTick=(Get-Command Tick-WidgetAutoQuote).ScriptBlock}
if(!$script:petBubbleOriginalReset -and (Get-Command Reset-WidgetAutoQuoteSchedule -ErrorAction SilentlyContinue)){$script:petBubbleOriginalReset=(Get-Command Reset-WidgetAutoQuoteSchedule).ScriptBlock}
function Reset-WidgetAutoQuoteSchedule([long]$Now=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()) {
  if($script:petBubbleOriginalReset){& $script:petBubbleOriginalReset $Now}
  $script:petBubbleNextAt=0;$script:petBubbleLastTick=$Now
}
function Tick-WidgetAutoQuote([long]$Now,[bool]$Visible) {
  if($script:widgetPetForm-ne 'bust' -or $script:characterId-ne 'gpt-dragon'){
    $script:petBubbleNextAt=0
    if($script:petBubbleOriginalTick){& $script:petBubbleOriginalTick $Now $Visible};return
  }
  $busy=[bool]$script:petThrowState -or $script:petFormTransition -or $script:completionPending -or !$script:collapsed -or [bool]$script:drag -or $script:context.IsOpen -or $script:settingsSizePreview -or ($script:closeTimer -and $script:closeTimer.IsEnabled) -or ($script:characterGallery -and $script:characterGallery.IsVisible) -or ($script:widgetMusic -and $script:widgetMusic.Enabled) -or (Test-WidgetUpdateEditor)
  if(Test-WidgetPetBubbleDue $Now $Visible ([bool]$busy)){Show-Quote;$script:autoQuoteDisplayCount++}
}
function Add-WidgetPetBubbleMenu {
  $settings=@($script:context.Items|Where-Object{$_-is [Windows.Controls.MenuItem] -and $_.Header-eq '设置'})
  if(!$settings.Count){return}
  $existing=@($settings[0].Items|Where-Object{$_.Tag-eq 'pet-form-auto-bubble'})
  if($existing.Count){$existing[0].IsEnabled=(!$script:petFormStore -or [bool]$script:petFormStore.CanSave);$existing[0].IsChecked=$script:petAutoBubbleEnabled;return}
  $item=[Windows.Controls.MenuItem]::new();$item.Header='半身随机冒泡';$item.Tag='pet-form-auto-bubble';$item.IsCheckable=$true;$item.IsChecked=$script:petAutoBubbleEnabled
  $item.ToolTip='安静显示本地语录，每次间隔随机 2～5 分钟；忙碌时延后。'
  $item.Style=$script:compactMenuResources['CompactItem']
  $item.IsEnabled=(!$script:petFormStore -or [bool]$script:petFormStore.CanSave)
  $item.Add_Click({param($sender,$event)$before=$script:petAutoBubbleEnabled;$script:petAutoBubbleEnabled=[bool]$sender.IsChecked;$script:petBubbleNextAt=0;Write-WidgetPetForm;if($script:petFormSaveError){$script:petAutoBubbleEnabled=$before;$sender.IsChecked=$before}})
  $null=$settings[0].Items.Add($item)
}
function Test-WidgetPetFormAnimation {return [Windows.SystemParameters]::ClientAreaAnimation}
function Restore-WidgetPetFormOpacity {
  $script:ui.Girl.BeginAnimation([Windows.UIElement]::OpacityProperty,$null)
  $script:ui.Girl.Opacity=1;$script:petFormTransition=$false
}
function Complete-WidgetPetFormFadeIn {
  Restore-WidgetPetFormOpacity
  Write-WidgetPetForm
  if($script:petFormSaveError){Restore-WidgetPetFormPreference;Update-WidgetPetFormMenu;return}
  Update-WidgetPetFormMenu
  if($script:petFormTarget-ne $script:widgetPetForm){Set-WidgetPetForm $script:petFormTarget}
}
function Complete-WidgetPetFormFadeOut {
  $script:widgetPetForm=$script:petFormTarget
  Reset-WidgetPetFrameTransition
  if($script:widgetPetForm-eq 'bust'){Set-DragonCachedFrame $script:petBustFrame}
  else{Set-DragonCachedFrame $script:petFormFullFrame}
  $script:ui.Girl.BeginAnimation([Windows.UIElement]::OpacityProperty,$null);$script:ui.Girl.Opacity=0
  Update-WidgetPetFormMenu
  $animation=[Windows.Media.Animation.DoubleAnimation]::new(0,1,[Windows.Duration]::new([TimeSpan]::FromMilliseconds(130)))
  $animation.EasingFunction=[Windows.Media.Animation.SineEase]::new()
  $animation.Add_Completed({try{Complete-WidgetPetFormFadeIn}catch{Restore-WidgetPetFormOpacity}})
  $script:ui.Girl.BeginAnimation([Windows.UIElement]::OpacityProperty,$animation)
}
function Set-WidgetPetForm([ValidateSet('full','bust')][string]$Mode) {
  if($script:characterId-ne 'gpt-dragon' -or $script:drag){return}
  if($script:petFormStore -and !$script:petFormStore.CanSave){$script:experienceMessage='形态设置暂为只读，原偏好受到保护';return}
  if($Mode-eq 'bust' -and !$script:petBustFrame){return}
  if($Mode-eq 'full' -and !$script:petFormFullFrame){return}
  $script:petFormTarget=$Mode
  if($script:widgetPetForm-ne $Mode){$script:petSmallClickEpoch=-1}
  $script:petBubbleNextAt=0
  if($script:petFormTransition -or $script:widgetPetForm-eq $Mode){return}
  $script:petFormPrevious=$script:widgetPetForm
  if(!(Test-WidgetPetFormAnimation)){
    $script:widgetPetForm=$Mode
    Reset-WidgetPetFrameTransition
    if($Mode-eq 'bust'){Set-DragonCachedFrame $script:petBustFrame}else{Set-DragonCachedFrame $script:petFormFullFrame}
    Write-WidgetPetForm;if($script:petFormSaveError){Restore-WidgetPetFormPreference};Update-WidgetPetFormMenu;return
  }
  $script:petFormTransition=$true
  $animation=[Windows.Media.Animation.DoubleAnimation]::new([double]$script:ui.Girl.Opacity,0,[Windows.Duration]::new([TimeSpan]::FromMilliseconds(90)))
  $animation.EasingFunction=[Windows.Media.Animation.SineEase]::new()
  $animation.Add_Completed({try{Complete-WidgetPetFormFadeOut}catch{Restore-WidgetPetFormOpacity}})
  $script:ui.Girl.BeginAnimation([Windows.UIElement]::OpacityProperty,$animation)
}
function Initialize-WidgetPetForms {
  if($script:petFormsReady){return}
  if([string]::IsNullOrWhiteSpace($script:window.Title)){$script:window.Title='GPT娘桌宠'}
  $script:widgetPetForm='full';$script:petFormTarget='full';$script:petFormTransition=$false
  $script:petAutoBubbleEnabled=$true;$script:petBubbleNextAt=0;$script:petBubbleLastTick=0
  try{$script:petFormFullFrame=Read-WidgetPetFullFrame}catch{$script:petFormFullFrame=$null}
  $script:petFullClickIdleFrame=$script:petFormFullFrame
  $script:petFullClickIdleFrameKey=''
  try{$script:petBustFrame=Read-WidgetPetBustFrame}catch{$script:petBustFrame=$null}
  try{
    $file=Join-Path $script:dataDir 'pet-form.json'
    if(Get-Command Open-WidgetSettingsStore -ErrorAction SilentlyContinue){$script:petFormStore=Open-WidgetSettingsStore -Path $file}
    if($script:petFormStore -or [IO.File]::Exists($file)){
      $saved=if($script:petFormStore){$script:petFormStore.Data}else{[IO.File]::ReadAllText($file,[Text.Encoding]::UTF8)|ConvertFrom-Json}
      if($saved.autoBubble-is [bool]){$script:petAutoBubbleEnabled=$saved.autoBubble}
      if($saved.version-eq 1 -and $saved.form-eq 'bust' -and $script:petBustFrame){$script:widgetPetForm='bust';$script:petFormTarget='bust'}
    }
  }catch{}
  if($script:widgetPetForm-eq 'bust' -and $script:characterId-eq 'gpt-dragon'){Set-DragonCachedFrame $script:petBustFrame}
  elseif($script:characterId-eq 'gpt-dragon' -and $script:petFormFullFrame){Set-DragonCachedFrame $script:petFormFullFrame}
  $script:petFormMenu=[Windows.Controls.MenuItem]::new();$script:petFormMenu.Header='切换形态'
  $script:petFormMenu.Add_Click({$next=if($script:petFormTarget-eq 'bust'){'full'}else{'bust'};Set-WidgetPetForm $next})
  if(!$script:petBubbleMenuHooked){$script:context.Add_Opened({Add-WidgetPetBubbleMenu});$script:petBubbleMenuHooked=$true}
  $script:petFormsReady=$true;Update-WidgetPetFormMenu
  if(Get-Command Initialize-WidgetExperienceControls -ErrorAction SilentlyContinue){Initialize-WidgetExperienceControls}
  if(!$script:petFullPressReleaseHooked){
    $script:ui.Girl.Add_PreviewMouseLeftButtonUp({
      if($script:petFullPressActive -and $script:drag -and $script:drag.moved){$script:petFullPressWasDragged=$true;Cancel-WidgetFullPress}
    })
    $script:petFullPressReleaseHooked=$true
  }
}

if($script:appDir){
  $experience=Join-Path $script:appDir 'runtime\experience-controls.ps1'
  if([IO.File]::Exists($experience)){. ([ScriptBlock]::Create([IO.File]::ReadAllText($experience,[Text.Encoding]::UTF8)))}
  $presentation=Join-Path $script:appDir 'runtime\pet-presentation.ps1'
  if([IO.File]::Exists($presentation)){. ([ScriptBlock]::Create([IO.File]::ReadAllText($presentation,[Text.Encoding]::UTF8)))}
  $physics=Join-Path $script:appDir 'runtime\pet-throw.ps1'
  if([IO.File]::Exists($physics)){. ([ScriptBlock]::Create([IO.File]::ReadAllText($physics,[Text.Encoding]::UTF8)))}
}
