param([string]$Stage,[string]$Report)
$ErrorActionPreference='Stop';$script:checks=0
function Check([bool]$Value,[string]$Message){if(!$Value){throw $Message};$script:checks++}
$null=. ([ScriptBlock]::Create([IO.File]::ReadAllText((Join-Path $Stage 'widget.ps1'),[Text.Encoding]::UTF8))) -CheckOnly -AppDir $Stage
$script:dragonTestMode=$true;$script:hostHandle=[IntPtr]::Zero
Initialize-WidgetSettingsMenu;Initialize-WidgetDesktopInteraction;Initialize-WidgetPetForms
Check ([bool]$script:petThrowTimer) 'Real gesture hooks and dispatcher timer initialize'
$still=@(@{t=0;x=0;y=0},@{t=40;x=0;y=0},@{t=100;x=1;y=0})
Check ($null-eq (Get-WidgetThrowVelocity $still 100)) 'Slow release stays where placed'
$quick=@(@{t=0;x=0;y=0},@{t=40;x=50;y=0},@{t=80;x=130;y=-30},@{t=110;x=220;y=-50})
$v=Get-WidgetThrowVelocity $quick 110
Check ($v.vx-gt 500 -and $v.vy-lt 0) 'Fling follows sampled direction'
Check ([Math]::Sqrt($v.vx*$v.vx+$v.vy*$v.vy)-lt 3600) 'Soft speed clamp'
Check ($null-eq (Get-WidgetThrowVelocity $quick 500)) 'Pause before release removes stale momentum'
Check ($null-eq (Get-WidgetThrowVelocity @(@{t=0;x=0;y=0},@{t=5;x=300;y=0}) 5)) 'Too-short pointer samples cannot fling'
$bounds=@{minX=0.0;maxX=500.0;minY=0.0;maxY=400.0}
$state=@{x=499.0;y=200.0;vx=600.0;vy=0.0};$null=Step-WidgetThrow $state 0.016 $bounds
Check ($state.x-eq 500 -and $state.vx-lt 0) 'Screen wall reflects throw'
$state=@{x=250.0;y=399.0;vx=300.0;vy=700.0};$null=Step-WidgetThrow $state 0.016 $bounds
Check ($state.y-eq 400 -and $state.vy-lt 0 -and $state.vx-lt 300) 'Floor has bounce and friction'
$state=@{x=250.0;y=100.0;vx=1200.0;vy=-900.0};$rest=$false
for($i=0;$i-lt 3000;$i++){if(Step-WidgetThrow $state 0.016 $bounds){$rest=$true;break}}
Check ($rest -and $state.y-eq 400) 'Throw settles instead of moving forever'
$state=@{x=20.0;y=20.0;vx=0.0;vy=0.0};$null=Step-WidgetThrow $state 8 $bounds
Check ($state.y-lt 30) 'Long frame interval is bounded'
# Reuse the exact bundled DeepSeek font without a system font installation.
$script:bubbleMode='quote';$script:ui.QuoteText.Text='我们慢慢来，先做好一件小事。';Fit-QuoteText
$face=$null;$typeface=[Windows.Media.Typeface]::new($script:ui.QuoteText.FontFamily,[Windows.FontStyles]::Normal,[Windows.FontWeights]::Normal,[Windows.FontStretches]::Normal)
Check ($typeface.TryGetGlyphTypeface([ref]$face)) 'Bundled font resolves in WPF'
Check ($face.FontUri.LocalPath.EndsWith('soft-candy.ttf',[StringComparison]::OrdinalIgnoreCase)) ('Actual DeepSeek font used rather than fallback: '+$face.FontUri.LocalPath)
Check ([Math]::Abs($script:ui.QuoteText.LineHeight/$script:ui.QuoteText.FontSize-1.6)-lt 0.001) 'DeepSeek line-height ratio'
# Exercise actual WPF timer + native movement on a fake off-screen window.
$script:window.Left=-9800;$script:window.Top=-9800;$script:window.Show();$script:window.UpdateLayout()
$script:widgetHandle=([Windows.Interop.WindowInteropHelper]::new($script:window)).Handle
$script:desktopLeft=-9800;$script:desktopTop=-9800
function Get-WidgetThrowBounds([double]$Dpi){return @{minX=-10000.0;maxX=-9000.0;minY=-10000.0;maxY=-9000.0}}
function Pump([int]$Ms){$end=[DateTime]::UtcNow.AddMilliseconds($Ms);while([DateTime]::UtcNow-lt $end){$null=$script:window.Dispatcher.Invoke([Action]{},[Windows.Threading.DispatcherPriority]::Background);Start-Sleep -Milliseconds 8}}
Start-WidgetThrow 900 -300;Pump 250
$frame=[GptWidgetNative]::Frame($script:widgetHandle)
Check ($script:desktopLeft-gt -9800 -and $frame.Left-eq $script:desktopLeft) 'Real dispatcher moves isolated native window'
Stop-WidgetThrow;$placed=@($script:desktopLeft,$script:desktopTop);Pump 80
Check (!$script:petThrowState -and !$script:petThrowTimer.IsEnabled) 'Grabbing stops motion and clears velocity'
Check (($placed-join ',')-eq (@($script:desktopLeft,$script:desktopTop)-join ',')) 'Motion stays stopped after grabbing'
$now=Get-WidgetThrowNow;$script:petThrowTrail=@($quick|ForEach-Object{@{t=$now-110+$_.t;x=$_.x;y=$_.y}})
$script:drag=@{moved=$true;music=$false}
$release=[Windows.Input.MouseButtonEventArgs]::new([Windows.Input.Mouse]::PrimaryDevice,0,[Windows.Input.MouseButton]::Left)
$release.RoutedEvent=[Windows.UIElement]::PreviewMouseLeftButtonUpEvent;$script:ui.Girl.RaiseEvent($release)
$script:drag=$null;Pump 60
Check ([bool]$script:petThrowState) 'Release routed event starts throw after ordinary drag cleanup'
Stop-WidgetThrow
$script:petThrowTrail=@(@{t=(Get-WidgetThrowNow)-500;x=0;y=0});$script:drag=@{moved=$true;music=$false}
$script:ui.Girl.RaiseEvent($release);$script:drag=$null;Pump 40
Check (!$script:petThrowState) 'Stationary routed release stays in place'
$script:followHost=$true;Start-WidgetThrow 900 0
Check (!$script:petThrowState) 'Follow-window mode remains attached'
$script:followHost=$false;$script:context.IsOpen=$true;Start-WidgetThrow 900 0;Tick-WidgetThrow
Check (!$script:petThrowState) 'Opening menu stops physics safely'
$script:context.IsOpen=$false;$script:window.Close()
@{ok=$true;checks=$script:checks;realWpf=$true;font=$face.FontUri.LocalPath;stationaryRelease=$true;fling=$true;nativeMovement=$true;paidCalls=0}|ConvertTo-Json|Set-Content -LiteralPath $Report -Encoding UTF8
