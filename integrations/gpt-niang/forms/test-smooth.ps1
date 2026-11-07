param([string]$Stage,[string]$Report)
$ErrorActionPreference='Stop';$script:checks=0
function Check([bool]$Value,[string]$Message){if(!$Value){throw $Message};$script:checks++}
$nativeFile=Join-Path $Stage 'runtime\native-motion.cs'
$nativeText=[IO.File]::ReadAllText($nativeFile)
if(!$nativeText.Contains('class SmoothReplayCursor')){
 $nativeText+=@'

public sealed class SmoothReplayCursor:IPetMotionCursor {
 readonly System.Diagnostics.Stopwatch clock=System.Diagnostics.Stopwatch.StartNew();public bool Hold,Linear;PetMotionPoint last;
 public PetMotionPoint Read(){if(!Hold){double t=clock.Elapsed.TotalSeconds;last=new PetMotionPoint{X=1500+(int)(Linear?t*1600:500*System.Math.Sin(t*2)),Y=1000+(int)(Linear?0:180*System.Math.Sin(t*3))};}return last;}
}
'@
 [IO.File]::WriteAllText($nativeFile,$nativeText,[Text.UTF8Encoding]::new($false))
}
$source=[IO.File]::ReadAllText((Join-Path $Stage 'widget.ps1'),[Text.Encoding]::UTF8)
$null=. ([ScriptBlock]::Create($source)) -CheckOnly -AppDir $Stage
$script:hostHandle=[IntPtr]::Zero;$script:dragonTestMode=$true
Initialize-WidgetSettingsMenu;Initialize-WidgetDesktopInteraction;Initialize-WidgetPetForms
Check ([bool]$script:petNativeMotion) 'Compiled controller initializes'
Check ($source.Contains('if(!$script:drag -and !(Test-WidgetNativeMotionActive)){')) 'Legacy positioning does not fight native motion'
Check ($source.Contains('Sync-WidgetNativeMotion')) 'Native location synchronized for persistence'
Check ($source.Contains('motion=(Get-WidgetMotionStatus)')) 'Live movement metrics exposed'
$script:testMessages=0;$script:testPositions=0
$hook=[Windows.Interop.HwndSourceHook]{param($h,$m,$w,$l,[ref]$handled)$script:testMessages++;$handled.Value=$true;return [IntPtr]42}
$relay=[PetWindowMessageRelay]::new($hook,[Action[IntPtr]]{param($p)$script:testPositions++})
$handled=$false;$null=$relay.Message([IntPtr]1,0x46,[IntPtr]::Zero,[IntPtr]::Zero,[ref]$handled)
Check ($script:testMessages-eq 0 -and !$handled) 'Ordinary movement messages never enter script or hide WPF processing'
$null=$relay.Message([IntPtr]1,0x47,[IntPtr]::Zero,[IntPtr]::Zero,[ref]$handled)
Check ($script:testMessages-eq 0 -and $script:testPositions-eq 1) 'Position recovery routed directly to native callback'
$r=$relay.Message([IntPtr]1,0x84,[IntPtr]::Zero,[IntPtr]::Zero,[ref]$handled)
Check ($r.ToInt64()-eq 42 -and $handled -and $script:testMessages-eq 1) 'Alpha hit-testing return and handled flag preserved'
$handled=$false;$r=$relay.Message([IntPtr]1,0x21,[IntPtr]::Zero,[IntPtr]::Zero,[ref]$handled)
Check ($r.ToInt64()-eq 3 -and $handled -and $script:testMessages-eq 1) 'Mouse activation stays native and does not activate the overlay'
$script:testEvents=0;$callback=[GptWidgetNative+WinEventProc]{param($a,$b,$c,$d,$e,$f,$g)$script:testEvents++}
$events=[PetWindowEventRelay]::new([IntPtr]1,$callback)
$events.OnEvent([IntPtr]::Zero,0x800a,[IntPtr]1,0,0,0,0)
$events.OnEvent([IntPtr]::Zero,0x800a,[IntPtr]2,-4,0,0,0)
Check ($script:testEvents-eq 0) 'Own movement and irrelevant accessibility events filtered'
$events.OnEvent([IntPtr]::Zero,3,[IntPtr]2,0,0,0,0)
Check ($script:testEvents-eq 1) 'External foreground events still reach host lifecycle handler'
$still=@(@{t=0;x=0;y=0},@{t=60;x=1;y=0},@{t=100;x=1;y=0})
Check ($null-eq (Get-WidgetThrowVelocity $still 100)) 'Slow release does not fling'
$quick=@(@{t=0;x=0;y=0},@{t=40;x=50;y=0},@{t=80;x=130;y=-30},@{t=110;x=220;y=-50})
$v=Get-WidgetThrowVelocity $quick 110
Check ($v.vx-gt 500 -and $v.vy-lt 0) 'Fling direction preserved'
Check ($null-eq (Get-WidgetThrowVelocity $quick 500)) 'Held release clears old motion'
$b=@{minX=0.0;maxX=500.0;minY=0.0;maxY=400.0};$s=@{x=499.0;y=200.0;vx=600.0;vy=0.0};$null=Step-WidgetThrow $s 0.016 $b
Check ($s.vx-lt 0 -and $s.x-eq 500) 'Bounce preserved'
function Test-WidgetPetFormAnimation {return $false}
Set-WidgetPetForm bust;$script:scale=1.4;Set-Appearance
$script:bubbleMode='quote';$script:ui.QuoteText.Text='把问题拆小一点，就有路啦。';Fit-QuoteText;Apply-Scene
Check ([Math]::Abs($script:ui.QuoteText.FontSize*1.4-480*0.034)-lt 0.001) 'Same displayed font size as DeepSeek actual 480px pet'
Check ([Math]::Abs($script:ui.QuoteText.LineHeight/$script:ui.QuoteText.FontSize-1.6)-lt 0.001) 'Same line-height ratio'
$face=$null;$type=[Windows.Media.Typeface]::new($script:ui.QuoteText.FontFamily,[Windows.FontStyles]::Normal,[Windows.FontWeights]::Normal,[Windows.FontStretches]::Normal)
Check ($type.TryGetGlyphTypeface([ref]$face)-and $face.FontUri.LocalPath.EndsWith('soft-candy.ttf',[StringComparison]::OrdinalIgnoreCase)) 'Same font file, no fallback'
$script:window.Left=-9800;$script:window.Top=-9800;$script:window.Show();$script:window.UpdateLayout()
$script:widgetHandle=([Windows.Interop.WindowInteropHelper]::new($script:window)).Handle
function Pump([int]$Ms){$end=[DateTime]::UtcNow.AddMilliseconds($Ms);while([DateTime]::UtcNow-lt $end){$null=$script:window.Dispatcher.Invoke([Action]{},[Windows.Threading.DispatcherPriority]::Background);Start-Sleep -Milliseconds 2}}
Animate-Press $true
for($i=0;$i-lt 15;$i++){
 Pump 18
 Check ([Math]::Abs($script:ui.PressScale.ScaleX-$script:ui.PressScale.ScaleY)-lt 0.000001) 'Bust press keeps the same horizontal and vertical scale'
}
Check ($script:ui.PressScale.ScaleX-lt 1) 'Bust press shrinks instead of widening'
Animate-Press $false
for($i=0;$i-lt 15;$i++){
 Pump 18
 Check ([Math]::Abs($script:ui.PressScale.ScaleX-$script:ui.PressScale.ScaleY)-lt 0.000001) 'Bust release keeps aspect ratio throughout rebound'
}
Check ([Math]::Abs($script:ui.PressScale.ScaleX-1)-lt 0.001) 'Bust returns to original size'
# A compiled injectable cursor replays motion without moving the user's mouse.
$cursor=[SmoothReplayCursor]::new();$motion=[PetNativeMotion]::new($script:window,$script:ui.Girl,$cursor)
$animationTimer=[Windows.Threading.DispatcherTimer]::new();$animationTimer.Interval=[TimeSpan]::FromSeconds(1);$animationTimer.Start();$motion.AnimationTimer=$animationTimer
$frame=[GptWidgetNative]::Frame($script:widgetHandle)
$range=[PetMotionBox]::new();$range.MinX=$frame.Left-1000;$range.MaxX=$frame.Left+1000;$range.MinY=$frame.Top-1000;$range.MaxY=$frame.Top+1000
Pump 500
$motion.BeginDrag([PetMotionBox[]]@($range),1);Pump 1800
Check (!$animationTimer.IsEnabled -and $motion.ClockMode-eq 'dwm-vsync') 'One compositor clock owns motion; frame-decoding timer suspended'
$fps=$motion.Frames/1.8;$cost=$motion.TotalStepMilliseconds/[Math]::Max(1.0,[double]$motion.Frames)
Check ($motion.Moved -and $motion.NativeMoves-gt 40) ('Actual off-screen native window follows replayed pointer; frames='+$motion.Frames+' moves='+$motion.NativeMoves+' active='+$motion.Active+' moved='+$motion.Moved)
Check ($fps-ge 45) ('Continuous movement rate '+$fps)
Check ($motion.P95Gap-lt 45) ('Frame gap p95 '+$motion.P95Gap)
Check ($cost-lt 3) ('Compiled frame work stays small '+$cost)
$metrics=@{fps=[Math]::Round($fps,1);p95GapMs=[Math]::Round($motion.P95Gap,2);meanWorkMs=[Math]::Round($cost,3);frames=$motion.Frames;moves=$motion.NativeMoves}
$cursor.Hold=$true;Pump 220;$motion.EndDrag($range)
Check (!$motion.Active) 'Stop then release stays put'
Check ($animationTimer.IsEnabled) 'Animation timer resumes when motion settles'
$x=$motion.State.X;$y=$motion.State.Y;Pump 60
Check ($motion.State.X-eq $x -and $motion.State.Y-eq $y) 'No stale momentum after holding'
$motion.Launch($motion.State.X,$motion.State.Y,900,-300,$range,1);Pump 250
Check ($motion.Flying -and $motion.NativeMoves-gt 4) 'Native throwing animates'
$motion.Stop();Check (!$motion.Active -and !$motion.Timer.IsEnabled) 'Grab stops controller'
$script:petNativeMotion=$motion;$script:petThrowTimer=$motion.Timer
function Get-WidgetMotionRanges([double]$Dpi){return $range}
function Get-WidgetThrowBounds([double]$Dpi){return @{minX=$range.MinX;maxX=$range.MaxX;minY=$range.MinY;maxY=$range.MaxY}}
$cursor.Hold=$false;$cursor.Linear=$true;$script:drag=@{moved=$false;music=$false}
$down=[Windows.Input.MouseButtonEventArgs]::new([Windows.Input.Mouse]::PrimaryDevice,0,[Windows.Input.MouseButton]::Left);$down.RoutedEvent=[Windows.UIElement]::PreviewMouseLeftButtonDownEvent
$up=[Windows.Input.MouseButtonEventArgs]::new([Windows.Input.Mouse]::PrimaryDevice,0,[Windows.Input.MouseButton]::Left);$up.RoutedEvent=[Windows.UIElement]::PreviewMouseLeftButtonUpEvent
$script:ui.Girl.RaiseEvent($down);Pump 160;$script:ui.Girl.RaiseEvent($up)
Check ($script:drag.moved -and $motion.Flying) 'Real preview release hands moved state to ordinary release handler and flings'
$script:drag=$null;Stop-WidgetThrow
$script:drag=@{moved=$false;music=$false};$script:ui.Girl.RaiseEvent($down);Pump 100;$cursor.Hold=$true;Pump 200;$script:ui.Girl.RaiseEvent($up)
Check ($script:drag.moved -and !$motion.Active) 'Routed hold then release stays at placement'
$script:drag=$null
Set-WidgetPetForm full
$script:dragonTimer=$animationTimer;$animationTimer.Start();$cursor.Hold=$true
$frames=$motion.Frames;$script:drag=@{moved=$false;music=$false}
$script:ui.Girl.RaiseEvent($down);Pump 90
Check ($motion.Dragging -and $motion.ClockMode-eq 'pointer-pending' -and $motion.Frames-eq $frames) 'Full ordinary hold does not start a compositor worker'
Check ($animationTimer.IsEnabled) 'Full ordinary hold does not stop and restart the media timer'
$script:ui.Girl.RaiseEvent($up)
Check (!$motion.Active -and $animationTimer.IsEnabled) 'Full ordinary release leaves motion and media clocks untouched'
$script:drag=$null;$script:drag=@{moved=$false;music=$false}
$cursor.Hold=$false;$script:ui.Girl.RaiseEvent($down);Pump 40
$move=[Windows.Input.MouseEventArgs]::new([Windows.Input.Mouse]::PrimaryDevice,0);$move.RoutedEvent=[Windows.UIElement]::PreviewMouseMoveEvent
$script:ui.Girl.RaiseEvent($move);Pump 160
Check ($motion.ClockMode-eq 'dwm-vsync' -and $motion.Moved -and !$animationTimer.IsEnabled) 'First actual movement starts the same smooth drag clock'
$cursor.Hold=$true;Pump 200;$script:ui.Girl.RaiseEvent($up)
Check (!$motion.Active -and $animationTimer.IsEnabled) 'Full drag still rests in place when held before release'
$script:drag=$null
$script:window.Close()
@{ok=$true;checks=$script:checks;realWpf=$true;replayedInputOnly=$true;metrics=$metrics;fontReferenceDip=16.32;paidCalls=0}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $Report -Encoding UTF8
