param([string]$Stage,[string]$Report)
$ErrorActionPreference='Stop';$script:checks=0
function Check([bool]$Value,[string]$Message){if(!$Value){throw $Message};$script:checks++}
$nativeFile=Join-Path $Stage 'runtime\native-motion.cs';$native=[IO.File]::ReadAllText($nativeFile)
if(!$native.Contains('class CatchStillCursor')){
 $native+="`npublic sealed class CatchStillCursor:IPetMotionCursor {public PetMotionPoint Read(){return new PetMotionPoint{X=0,Y=0};}}"
 [IO.File]::WriteAllText($nativeFile,$native)
}
$source=[IO.File]::ReadAllText((Join-Path $Stage 'widget.ps1'))
$null=. ([ScriptBlock]::Create($source)) -CheckOnly -AppDir $Stage
$script:hostHandle=[IntPtr]::Zero;$script:dragonTestMode=$true
Initialize-WidgetSettingsMenu;Initialize-WidgetDesktopInteraction;Initialize-WidgetPetForms
$script:petNativeMotion=[PetNativeMotion]::new($script:window,$script:ui.Girl,[CatchStillCursor]::new())
Check ([bool]$script:petCatchFeedback) 'Feedback initializes with native motion'
Check (![PetCatchVisuals.Rules]::Eligible($false,1200,0)) 'Stationary pet never triggers'
Check (![PetCatchVisuals.Rules]::Eligible($true,399,0)) 'Same 400 DIP/s threshold as DeepSeek'
Check ([PetCatchVisuals.Rules]::Eligible($true,400,0)) 'Threshold is inclusive'
Check (![PetCatchVisuals.Rules]::Eligible($true,[double]::NaN,0)) 'Non-finite velocity rejected'
Check ([PetCatchVisuals.Rules]::Score(400,462)-eq 4) 'Reference speed score'
Check ([PetCatchVisuals.Rules]::Score(900,231)-eq 18) 'Score normalizes size'
Check ([PetCatchVisuals.Rules]::Score(50,462)-eq 1) 'Positive score minimum'
Check ([PetCatchVisuals.Rules]::Score(900,0)-eq 0) 'Invalid size rejected'
foreach($x in @(0,300,600)){foreach($y in @(0,300,600)){
 $b=[PetCatchVisuals.Rules]::Place($x,$y,[Windows.Size]::new(180,70),[Windows.Rect]::new(0,0,600,600))
 Check ($b.Left-ge 4 -and $b.Top-ge 4 -and $b.Right-le 596 -and $b.Bottom-le 596) 'Card stays on screen near an edge'
}}
$script:window.ShowActivated=$false;$script:window.Left=-12000;$script:window.Top=-12000;$script:window.Show();$script:window.UpdateLayout()
$script:widgetHandle=([Windows.Interop.WindowInteropHelper]::new($script:window)).Handle
function Pump([int]$Ms){$end=[DateTime]::UtcNow.AddMilliseconds($Ms);while([DateTime]::UtcNow-lt $end){$null=$script:window.Dispatcher.Invoke([Action]{},[Windows.Threading.DispatcherPriority]::Background);Start-Sleep -Milliseconds 3}}
function Capture([string]$Name){
 $view=$script:petCatchFeedback.View;$view.UpdateLayout();$w=[int][Math]::Ceiling($view.ActualWidth);$h=[int][Math]::Ceiling($view.ActualHeight)
 $image=[Windows.Media.Imaging.RenderTargetBitmap]::new($w,$h,96,96,[Windows.Media.PixelFormats]::Pbgra32);$image.Render($view)
 $png=[Windows.Media.Imaging.PngBitmapEncoder]::new();$png.Frames.Add([Windows.Media.Imaging.BitmapFrame]::Create($image))
 $stream=[IO.File]::Create((Join-Path (Split-Path $Report -Parent) $Name));try{$png.Save($stream)}finally{$stream.Dispose()}
}
function Get-WidgetCatchPoint {return @{X=-16000;Y=-16000}}
function Get-WidgetCatchScreen($Point){return [Windows.Rect]::new(-17000,-17000,1920,1080)}
$frame=[GptWidgetNative]::Frame($script:widgetHandle);$range=[PetMotionBox]::new();$range.MinX=$frame.Left-2000;$range.MaxX=$frame.Left+2000;$range.MinY=$frame.Top-2000;$range.MaxY=$frame.Top+2000
function Get-WidgetMotionRanges([double]$Dpi){return $range}
function Get-WidgetThrowBounds([double]$Dpi){return @{minX=$range.MinX;maxX=$range.MaxX;minY=$range.MinY;maxY=$range.MaxY}}
function Test-WidgetPetFormAnimation {return $false}
$script:hostEventTimer=[Windows.Threading.DispatcherTimer]::new();$script:hostEventTimer.Interval=[TimeSpan]::FromHours(1)
$script:ordinaryClicks=0;$script:touches=0
function Click-Character {$script:ordinaryClicks++}
function Invoke-DragonTouch {$script:touches++;return $false}
$ast=[Management.Automation.Language.Parser]::ParseInput($source,[ref]$null,[ref]$null)
$assignment=$ast.Find({param($node)$node-is [Management.Automation.Language.AssignmentStatementAst] -and $node.Left.Extent.Text-eq '$pressUp'},$true)
$realUp=$assignment.Right.Expression.ScriptBlock.GetScriptBlock()
$script:ui.Girl.Add_MouseLeftButtonUp($realUp)
$down=[Windows.Input.MouseButtonEventArgs]::new([Windows.Input.Mouse]::PrimaryDevice,0,[Windows.Input.MouseButton]::Left);$down.RoutedEvent=[Windows.UIElement]::PreviewMouseLeftButtonDownEvent
$up=[Windows.Input.MouseButtonEventArgs]::new([Windows.Input.Mouse]::PrimaryDevice,0,[Windows.Input.MouseButton]::Left);$up.RoutedEvent=[Windows.UIElement]::MouseLeftButtonUpEvent
$previewUp=[Windows.Input.MouseButtonEventArgs]::new([Windows.Input.Mouse]::PrimaryDevice,0,[Windows.Input.MouseButton]::Left);$previewUp.RoutedEvent=[Windows.UIElement]::PreviewMouseLeftButtonUpEvent
$feedback=$script:petCatchFeedback
Check (!(Show-WidgetCatchFeedback) -and !$feedback.Visible) 'No effect during ordinary idle click'
foreach($form in @('bust','full')){
 $down.Handled=$false;$up.Handled=$false;$previewUp.Handled=$false
 Set-WidgetPetForm $form
 $dpi=Get-WidgetPlacementDpi
 $script:petNativeMotion.Launch($frame.Left,$frame.Top,1000,0,$range,$dpi)
 $foreground=[GptWidgetNative]::GetForegroundWindow()
 $script:ui.Girl.RaiseEvent($down)
 Check ($script:petCatchPressFired -and $feedback.Visible) ('Catch triggers on press in '+$form)
 Check ($script:petNativeMotion.Dragging -and !$script:petNativeMotion.Flying) 'Flying velocity read before grabbing clears it'
 Check ([Math]::Abs($feedback.LastSpeed-1000)-lt 0.001) 'Physical velocity converts back to DIP exactly once'
 Check ($feedback.LastScore-eq [PetCatchVisuals.Rules]::Score(1000,$script:ui.Girl.Width*$script:scale)) 'Displayed points match current size'
 Check ($foreground-eq [GptWidgetNative]::GetForegroundWindow()) 'Celebration never steals foreground focus'
 $style=[GptWidgetNative]::GetWindowLongPtr($feedback.Handle,-20).ToInt64()
 Check (($style-band 0x08000020)-eq 0x08000020) 'Overlay has click-through and no-activate styles'
 Pump 180
 Check ($feedback.BurstRunning -and $feedback.CardBounds.Width-ge 120) 'Particles and score card visible together'
 Capture ('catch-'+$form+'.png')
 $ownerBefore=[GptWidgetNative]::Frame($script:widgetHandle);$popupBefore=[GptWidgetNative]::Frame($feedback.Handle)
 foreach($delta in @(@(120,-70),@(-180,90),@(360,210),@(-280,-130),@(0,0))){
   $null=[GptWidgetNative]::SetWindowPos($script:widgetHandle,[IntPtr]::Zero,($ownerBefore.Left+$delta[0]),($ownerBefore.Top+$delta[1]),0,0,0x15)
   $ownerAfter=[GptWidgetNative]::Frame($script:widgetHandle);$popupAfter=[GptWidgetNative]::Frame($feedback.Handle)
   Check (($popupAfter.Left-$popupBefore.Left)-eq ($ownerAfter.Left-$ownerBefore.Left) -and ($popupAfter.Top-$popupBefore.Top)-eq ($ownerAfter.Top-$ownerBefore.Top)) ('Popup follows the same physical movement synchronously in '+$form)
 }
 $count=$feedback.Count;$script:drag=@{moved=$false;music=$false;control=$script:ui.Girl}
 $script:ui.Girl.RaiseEvent($previewUp);$script:ui.Girl.RaiseEvent($up)
 Check (!$script:petCatchPressFired -and $feedback.Count-eq $count) 'Release consumes the catch flag without a duplicate effect'
 Check ($script:ordinaryClicks-eq 0 -and $script:touches-eq 0) 'Catch release does not open a normal quote or play touch animation'
 Check (!$script:petNativeMotion.Active) 'Grabbing and releasing without movement leaves pet stopped'
 $feedback.Close()
}
$screen=[Windows.Rect]::new(-17000,-17000,1920,1080)
$null=$feedback.TryCatch($true,900,0,291.2,-16000,-16000,1.5,$screen,$false,$true)
Check ($feedback.Visible -and !$feedback.BurstRunning) 'Reduced animation keeps score but skips particles'
$feedback.Close()
$null=$feedback.TryCatch($true,900,0,291.2,-16000,-16000,1.5,$screen,$false,$false)
$ownerBefore=[GptWidgetNative]::Frame($script:widgetHandle);$popupBefore=[GptWidgetNative]::Frame($feedback.Handle)
$script:petNativeMotion.Launch($ownerBefore.Left,$ownerBefore.Top,700,-100,$range,(Get-WidgetPlacementDpi));Pump 100
$ownerAfter=[GptWidgetNative]::Frame($script:widgetHandle);$popupAfter=[GptWidgetNative]::Frame($feedback.Handle)
Check ($ownerAfter.Left-ne $ownerBefore.Left) 'Real native flight moves owner while score remains visible'
Check (($popupAfter.Left-$popupBefore.Left)-eq ($ownerAfter.Left-$ownerBefore.Left) -and ($popupAfter.Top-$popupBefore.Top)-eq ($ownerAfter.Top-$ownerBefore.Top)) 'Score keeps following after release and flight resumes'
$script:petNativeMotion.Stop();$stoppedPopup=[GptWidgetNative]::Frame($feedback.Handle);Pump 60
$popupAfter=[GptWidgetNative]::Frame($feedback.Handle)
Check ($popupAfter.Left-eq $stoppedPopup.Left -and $popupAfter.Top-eq $stoppedPopup.Top) 'Stopping motion leaves card at final relative position'
Pump 1000
Check (!$feedback.BurstRunning -and $feedback.Visible) 'Particles clean up before score expiry'
Pump 1300
Check (!$feedback.Visible -and $feedback.Handle-eq [IntPtr]::Zero) 'Score closes automatically after 2.2 seconds'
$null=$feedback.TryCatch($true,900,0,291.2,-16000,-16000,1.5,$screen,$false,$false)
$script:window.Hide()
Check (!$feedback.Visible -and !$feedback.BurstRunning) 'Hiding owner cleans up card and render subscription'
$script:window.Close()
@{ok=$true;checks=$script:checks;realWpf=$true;realPressRelease=$true;paidCalls=0;catchCount=$feedback.Count;thresholdDip=400;popupDurationMs=2200}|ConvertTo-Json|Set-Content $Report -Encoding UTF8
