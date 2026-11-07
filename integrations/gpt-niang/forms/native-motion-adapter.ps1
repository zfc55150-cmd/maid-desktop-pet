# Script only at gesture boundaries. The C# controller owns all motion frames.
function New-WidgetMotionBox($Bounds){
  $box=[PetMotionBox]::new();$box.MinX=$Bounds.minX;$box.MaxX=$Bounds.maxX;$box.MinY=$Bounds.minY;$box.MaxY=$Bounds.maxY;return $box
}
function Get-WidgetThrowNow {return [Diagnostics.Stopwatch]::GetTimestamp()*1000.0/[Diagnostics.Stopwatch]::Frequency}
function Get-WidgetThrowVelocity($Trail,[long]$Now){
  $samples=@($Trail);$v=[PetNativeMotion]::Estimate([double[]]@($samples|ForEach-Object{$_.t}),[double[]]@($samples|ForEach-Object{$_.x}),[double[]]@($samples|ForEach-Object{$_.y}),$Now)
  if($v){return @{vx=$v.Vx;vy=$v.Vy}};return $null
}
function Step-WidgetThrow($State,[double]$Delta,$Bounds,[double]$Dpi=1){
  $native=[PetMotionState]::new();$native.X=$State.x;$native.Y=$State.y;$native.Vx=$State.vx;$native.Vy=$State.vy
  $rest=[PetNativeMotion]::Step($native,$Delta,(New-WidgetMotionBox $Bounds),$Dpi)
  $State.x=$native.X;$State.y=$native.Y;$State.vx=$native.Vx;$State.vy=$native.Vy;return $rest
}
function Copy-WidgetNativePosition {
  if(!$script:petNativeMotion){return}
  $script:desktopLeft=[Math]::Round($script:petNativeMotion.State.X);$script:desktopTop=[Math]::Round($script:petNativeMotion.State.Y);$script:lastPosition=$null
}
function Test-WidgetNativeMotionActive {return $script:petNativeMotion -and $script:petNativeMotion.Active}
function Sync-WidgetNativeMotion {
  if(!(Test-WidgetNativeMotionActive)){return}
  if($script:followHost -or !$script:window.IsVisible -or $script:context.IsOpen -or $script:settingsSizePreview -or ($script:characterGallery -and $script:characterGallery.IsVisible) -or ($script:widgetMusic -and $script:widgetMusic.Enabled)){Stop-WidgetThrow;return}
  Copy-WidgetNativePosition
}
function Get-WidgetMotionStatus {
  if(!$script:petNativeMotion){return @{engine='native-dwm-vsync';active=$false}}
  return @{engine='native-dwm-vsync';active=$script:petNativeMotion.Active;dragging=$script:petNativeMotion.Dragging;flying=$script:petNativeMotion.Flying;frames=$script:petNativeMotion.Frames;moves=$script:petNativeMotion.NativeMoves;p95GapMs=[Math]::Round($script:petNativeMotion.P95Gap,2);maxGapMs=[Math]::Round($script:petNativeMotion.MaxGap,2);clock=$script:petNativeMotion.ClockMode;catchCount=$(if($script:petCatchFeedback){$script:petCatchFeedback.Count}else{0});catchVisible=$(if($script:petCatchFeedback){$script:petCatchFeedback.Visible}else{$false})}
}
function Stop-WidgetThrow {
  if($script:petNativeMotion){$script:petNativeMotion.Stop()}
  $script:petThrowState=$null;$script:petThrowPending=$null
}
function Get-WidgetMotionRanges([double]$Dpi){
  $r=Get-WidgetRestingCharacterBounds $Dpi
  $keepX=[Math]::Min([double]$r.Width,[Math]::Max(64*$Dpi,$r.Width*0.35));$keepY=[Math]::Min([double]$r.Height,[Math]::Max(64*$Dpi,$r.Height*0.35))
  foreach($screen in [Windows.Forms.Screen]::AllScreens){$s=$screen.Bounds;New-WidgetMotionBox @{minX=$s.Left-$r.X-$r.Width+$keepX;maxX=$s.Right-$r.X-$keepX;minY=$s.Top-$r.Y-$r.Height+$keepY;maxY=$s.Bottom-$r.Y-$keepY}}
}
function Start-WidgetThrow([double]$Vx,[double]$Vy){
  Stop-WidgetThrow;if($script:followHost -or $script:drag -or !$script:window.IsVisible){return}
  Prepare-WidgetMotionAnimation
  $dpi=Get-WidgetPlacementDpi;$script:petNativeMotion.Launch([double]$script:desktopLeft,[double]$script:desktopTop,$Vx,$Vy,(New-WidgetMotionBox (Get-WidgetThrowBounds $dpi)),$dpi)
  $script:petThrowState=$script:petNativeMotion.State;Reset-WidgetAutoQuoteSchedule
}
function Tick-WidgetThrow {Sync-WidgetNativeMotion;if(Test-WidgetNativeMotionActive){$script:petNativeMotion.Pulse();Copy-WidgetNativePosition}}
function Prepare-WidgetMotionAnimation {
  $clip=[string]$script:dragonManifest.dragClip
  $animatedDrag=($script:widgetPetForm-eq 'full' -and $script:dragonAnimationEnabled -and $clip -and $script:dragonManifest.states.PSObject.Properties[$clip])
  # The compositor still owns movement. Only an explicitly configured full-body
  # drag keeps the independent native-frame animation timer running.
  $script:petNativeMotion.AnimationTimer=if($animatedDrag){$null}else{$script:dragonTimer}
  if(!$animatedDrag -and $script:widgetPetForm-ne 'bust' -and !$script:dragonPausedAt){$script:dragonPausedAt=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()}
}
function Initialize-WidgetMotionNativeTypes {
  if(!('PetNativeMotion'-as [type])){
    $nativeSource=[IO.File]::ReadAllText((Join-Path $script:appDir 'runtime\native-motion.cs'),[Text.Encoding]::UTF8)
    $nativeSource+="`n"+[IO.File]::ReadAllText((Join-Path $script:appDir 'runtime\catch-feedback.cs'),[Text.Encoding]::UTF8)
    Add-Type -TypeDefinition $nativeSource -ReferencedAssemblies @('System.dll','System.Core.dll',[Windows.Window].Assembly.Location,[Windows.Media.Visual].Assembly.Location,[Windows.Rect].Assembly.Location,[Windows.Markup.IUriContext].Assembly.Location) -ErrorAction Stop
  }
}
function Get-WidgetCatchPoint {
  $point=[GptWidgetNative+Point]::new();$null=[GptWidgetNative]::GetCursorPos([ref]$point);return $point
}
function Get-WidgetCatchScreen($Point){
  $screen=[Windows.Forms.Screen]::FromPoint([Drawing.Point]::new($Point.X,$Point.Y)).WorkingArea
  return [Windows.Rect]::new($screen.X,$screen.Y,$screen.Width,$screen.Height)
}
function Show-WidgetCatchFeedback {
  $motion=$script:petNativeMotion
  if(!$motion -or !$motion.Flying -or !$script:petCatchFeedback -or $script:characterId-ne 'gpt-dragon'){return $false}
  $dpi=Get-WidgetPlacementDpi;$vx=$motion.State.Vx/$dpi;$vy=$motion.State.Vy/$dpi
  if(![PetCatchVisuals.Rules]::Eligible($true,$vx,$vy)){return $false}
  $point=Get-WidgetCatchPoint;$screen=Get-WidgetCatchScreen $point
  $size=$script:ui.Girl.Width*$script:scale
  return $script:petCatchFeedback.TryCatch($true,$vx,$vy,$size,$point.X,$point.Y,$dpi,$screen,[bool]$script:desktopTopmost,(![Windows.SystemParameters]::ClientAreaAnimation))
}
function Initialize-WidgetThrow {
  if($script:petNativeMotion){return}
  Initialize-WidgetMotionNativeTypes
  $script:petNativeMotion=[PetNativeMotion]::new($script:window,$script:ui.Girl);$script:petThrowTimer=$script:petNativeMotion.Timer
  $fontDirectory=[IO.Path]::GetFullPath((Join-Path $script:appDir 'assets\pet-forms'))+[IO.Path]::DirectorySeparatorChar
  $script:petCatchFeedback=[PetCatchVisuals.Feedback]::new($script:window,$fontDirectory);$script:petCatchPressFired=$false
  $script:petNativeMotion.add_Stopped([Action]{Copy-WidgetNativePosition;$script:petThrowState=$null;Save-Settings})
  $script:petNativeMotion.add_GeometryChanged([Action]{
    $dpi=Get-WidgetPlacementDpi;$null=Set-WidgetPixelSize $dpi
    $script:petNativeMotion.UpdateRanges([PetMotionBox[]]@(Get-WidgetMotionRanges $dpi))
  })
  $script:ui.Girl.Add_PreviewMouseLeftButtonDown({
    $script:petCatchFeedback.Close()
    $script:petCatchPressFired=Show-WidgetCatchFeedback
    Stop-WidgetThrow
    if(!$script:followHost -and !(Test-WidgetMusicActive)){
      Prepare-WidgetMotionAnimation
      $dpi=Get-WidgetPlacementDpi;$script:petNativeMotion.BeginDrag([PetMotionBox[]]@(Get-WidgetMotionRanges $dpi),$dpi,($script:widgetPetForm-eq 'full'))
      $script:petThrowState=$script:petNativeMotion.State
    }
  })
  $script:ui.Girl.Add_PreviewMouseLeftButtonUp({
    if($script:petNativeMotion.Dragging){
      Copy-WidgetNativePosition
      if($script:drag){$script:drag.moved=$script:petNativeMotion.Moved}
      $script:petNativeMotion.EndDrag((New-WidgetMotionBox (Get-WidgetThrowBounds (Get-WidgetPlacementDpi))))
      if($script:drag){$script:drag.moved=$script:petNativeMotion.Moved}
      Copy-WidgetNativePosition;$script:petThrowState=if($script:petNativeMotion.Flying){$script:petNativeMotion.State}else{$null}
    }
  })
  $script:ui.Girl.Add_LostMouseCapture({if($script:petNativeMotion.Dragging){Stop-WidgetThrow}})
  $script:context.Add_Opened({Stop-WidgetThrow;$script:petCatchFeedback.Close()})
}
