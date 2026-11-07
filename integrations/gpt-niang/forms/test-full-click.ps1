param([string]$Stage,[string]$Report)
$ErrorActionPreference='Stop';$script:checks=0
function Check([bool]$Value,[string]$Message){if(!$Value){throw $Message};$script:checks++}
$source=[IO.File]::ReadAllText((Join-Path $Stage 'widget.ps1'))
$null=. ([ScriptBlock]::Create($source)) -CheckOnly -AppDir $Stage
$script:hostHandle=[IntPtr]::Zero;$script:dragonTestMode=$true
Initialize-WidgetSettingsMenu;Initialize-WidgetDesktopInteraction;Initialize-WidgetPetForms
function Test-WidgetPetFormAnimation {return $false}
Set-WidgetPetForm full
$script:window.Left=-12000;$script:window.Top=-12000;$script:window.Show();$script:window.UpdateLayout()
function Pump([int]$Ms){$end=[DateTime]::UtcNow.AddMilliseconds($Ms);while([DateTime]::UtcNow-lt $end){$null=$script:window.Dispatcher.Invoke([Action]{},[Windows.Threading.DispatcherPriority]::Background);Start-Sleep -Milliseconds 2}}
function Capture([string]$Name){
 $view=$script:window.Content;$view.UpdateLayout()
 $image=[Windows.Media.Imaging.RenderTargetBitmap]::new([int][Math]::Ceiling($view.ActualWidth),[int][Math]::Ceiling($view.ActualHeight),96,96,[Windows.Media.PixelFormats]::Pbgra32);$image.Render($view)
 $png=[Windows.Media.Imaging.PngBitmapEncoder]::new();$png.Frames.Add([Windows.Media.Imaging.BitmapFrame]::Create($image));$stream=[IO.File]::Create((Join-Path (Split-Path $Report -Parent) $Name));try{$png.Save($stream)}finally{$stream.Dispose()}
}
$reference=Get-Content (Join-Path (Split-Path $Report -Parent) 'deepseek-curve.json') -Raw|ConvertFrom-Json
foreach($point in $reference){Check ([Math]::Abs([GptFullClickAnimation]::Scale($point.u)-$point.scale)-lt 1e-12) 'Matches actual DeepSeek curve'}
$before=@($script:window.Width,$script:window.Height,$script:window.Left,$script:window.Top,$script:ui.Bubble.ActualWidth,$script:ui.Bubble.ActualHeight)
Animate-Press $true;Pump 120
Check ($script:ui.PressScale.ScaleX-eq 1 -and $script:ui.PressScale.ScaleY-eq 1) 'Full hold does not deform the bubble or avatar'
Animate-Press $false;Check (!$script:petFullClickScale) 'Release after dragging does not fire ordinary click'
Invoke-WidgetFullClick
Check ([bool]$script:petFullClickScale) 'Full click installs character-only transform'
$animation=[GptFullClickAnimation]::new();$animation.Duration=[Windows.Duration]::new([TimeSpan]::FromMilliseconds(220));$animation.FillBehavior='Stop'
$clock=$animation.CreateClock();$script:petFullClickScale.ApplyAnimationClock([Windows.Media.ScaleTransform]::ScaleYProperty,$clock)
$clock.Controller.Begin();$clock.Controller.SeekAlignedToLastTick([TimeSpan]::FromMilliseconds(99),[Windows.Media.Animation.TimeSeekOrigin]::BeginTime)
Check ([Math]::Abs($script:petFullClickScale.ScaleY-0.55)-lt 0.001) 'Actual WPF animation reaches DeepSeek compression at 99ms'
$held=$script:petFullClickScale.ScaleY;Animate-Press $true
Check ($script:petFullClickScale.ScaleY-eq $held) 'Pressing during rebound does not snap the avatar back to full height'
Check ($script:petFullClickScale.ScaleX-eq 1 -and $script:ui.PressScale.ScaleX-eq 1 -and $script:ui.PressScale.ScaleY-eq 1) 'Avatar width and all bubble scaling remain unchanged'
$anchor=[Windows.Point]::new($script:ui.Girl.ActualWidth*0.5,$script:ui.Girl.ActualHeight*359/384)
$transformed=$script:ui.Girl.RenderTransform.Transform([Windows.Point]::new(0,0))
Check ($script:ui.Girl.RenderTransformOrigin.Y-eq (359.0/384)) 'Compression uses the visible foot baseline'
Capture 'full-click-compressed.png'
$clock.Controller.SeekAlignedToLastTick([TimeSpan]::FromMilliseconds(180),[Windows.Media.Animation.TimeSeekOrigin]::BeginTime)
Check ($script:petFullClickScale.ScaleY-gt 1 -and $script:petFullClickScale.ScaleY-lt 1.12) 'Small bounded overshoot instead of lingering distortion'
Capture 'full-click-rebound.png'
Reset-WidgetFullClick;Invoke-WidgetFullClick;Pump 290
Check ($script:petFullClickScale.ScaleY-eq 1) 'Real compositor clock settles naturally to exact original size'
Capture 'full-click-restored.png'
for($i=0;$i-lt 6;$i++){Animate-Press $true;Invoke-WidgetFullClick;Pump 15}
Pump 280;Check ($script:petFullClickScale.ScaleY-eq 1) 'Rapid clicks replace the previous animation without stacking'
Invoke-WidgetFullClick;Pump 60;Set-WidgetPetForm bust
Check ($script:petFullClickScale.ScaleY-eq 1) 'Form change clears full-body squash'
Animate-Press $true;Pump 280
Check ([Math]::Abs($script:ui.PressScale.ScaleX-0.96)-lt 0.001 -and $script:ui.PressScale.ScaleX-eq $script:ui.PressScale.ScaleY) 'Small form keeps accepted uniform shrink'
Animate-Press $false;Pump 280;Set-WidgetPetForm full
$after=@($script:window.Width,$script:window.Height,$script:window.Left,$script:window.Top,$script:ui.Bubble.ActualWidth,$script:ui.Bubble.ActualHeight)
Check (($before-join ',')-eq ($after-join ',')) 'Window placement, size and bubble dimensions remain stable'
Check ($source.Contains('if(!$moved -and !$caught)') -and $source.Contains('{Invoke-WidgetFullIdleClick}')) 'Only ordinary clicks trigger idle and squash; drag/catch remain separate'
Check ($source.Contains('![Windows.SystemParameters]::ClientAreaAnimation')) 'System reduced animation preference respected'
$script:window.Close()
[IO.File]::WriteAllText($Report,(@{ok=$true;checks=$script:checks;curveSamples=$reference.Count;durationMs=220;compression=0.55;smallScale=0.96;paidCalls=0}|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
