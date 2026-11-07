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
function Pump([int]$Ms){
 $frame=[Windows.Threading.DispatcherFrame]::new();$timer=[Windows.Threading.DispatcherTimer]::new([Windows.Threading.DispatcherPriority]::Background)
 $timer.Interval=[TimeSpan]::FromMilliseconds($Ms);$timerFrame=$frame
 $stop={param($sender,$event)$sender.Stop();$timerFrame.Continue=$false}.GetNewClosure();$timer.Add_Tick($stop);$timer.Start();[Windows.Threading.Dispatcher]::PushFrame($frame)
}
$idle=$script:petFullClickIdleFrame.image
Check ($idle.IsFrozen -and $idle.PixelWidth-eq 384) 'Neutral full pose is decoded once and immutable'
$page=Read-WidgetCharacterImage (Join-Path $Stage 'assets/dragon-animation/motion-v1/heart-0.png')
$other=[Windows.Media.Imaging.CroppedBitmap]::new($page,[Windows.Int32Rect]::new(0,0,384,384));$other.Freeze()
$otherFrame=New-DragonCachedFrame $other
$script:originalSquash=(Get-Command Invoke-WidgetFullClick).ScriptBlock
$script:squashes=0
function Invoke-WidgetFullClick {
 if($script:dragonTouchEnabled){Check ([object]::ReferenceEquals($script:ui.Girl.Source,$script:petFullClickIdleFrame.image)) 'Neutral frame is installed before squash starts'}
 $script:squashes++;& $script:originalSquash
}
Start-DragonAnimation
$script:originalRead=(Get-Command Get-DragonMotionFrame).ScriptBlock;$script:frameReads=0
function Get-DragonMotionFrame([string]$Clip,[int]$Index){$script:frameReads++;return (& $script:originalRead $Clip $Index)}
$before=@($script:window.Left,$script:window.Top,$script:window.Width,$script:window.Height,$script:scale)
Set-DragonCachedFrame $otherFrame;$script:petFormFullFrame=$otherFrame
$script:dragonManualPhase='heart';$script:dragonManualUntil=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()+5000
$script:dragonFadePrevious=$other;$script:dragonWasRendering=$true
$script:collapsed=$true;Set-BubbleState
Invoke-WidgetFullIdleClick
Check ($script:dragonManualUntil-eq 0 -and !$script:dragonFadePrevious) 'Click cancels the previous pose and pending image blend'
Check ([object]::ReferenceEquals($script:petFullClickIdleFrame.image,$idle)) 'Dynamic full-frame cache never overwrites the neutral click pose'
$script:frameReads=0;Pump 190
Check ($script:frameReads-eq 0 -and [object]::ReferenceEquals($script:ui.Girl.Source,$idle)) 'Playback cannot replace the neutral frame during rebound'
Check ($script:collapsed) 'No quota or quote opens'
Check ($script:petFullClickScale.ScaleY-ne 1) 'Neutral pose participates in the rebound'
Pump 130
Check ($script:frameReads-gt 0 -and $script:petFullClickScale.ScaleY-eq 1) 'Playback resumes only after the complete rebound'
for($i=0;$i-lt 5;$i++){Invoke-WidgetFullIdleClick;Pump 35;Check ([object]::ReferenceEquals($script:ui.Girl.Source,$idle)) 'Rapid clicks stay on the same neutral pose'}
Set-WidgetPetForm bust
Check ($script:petFullClickIdleUntil-eq 0 -and $script:petFullClickScale.ScaleY-eq 1) 'Switching form clears the idle hold and rebound'
Check ([object]::ReferenceEquals($script:ui.Girl.Source,$script:petBustFrame.image)) 'Small form keeps its own original image'
$count=$script:squashes;Invoke-WidgetFullIdleClick
Check ($script:squashes-eq $count) 'Full idle click never acts on the small form'
Set-WidgetPetForm full;$script:dragonAnimationEnabled=$false;Set-DragonCachedFrame $otherFrame
Invoke-WidgetFullIdleClick
Check ([object]::ReferenceEquals($script:ui.Girl.Source,$idle)) 'Disabled pose playback still uses a real neutral body frame'
$script:dragonTouchEnabled=$false;Set-DragonCachedFrame $otherFrame;$count=$script:squashes
Invoke-WidgetFullIdleClick
Check ([object]::ReferenceEquals($script:ui.Girl.Source,$other) -and $script:squashes-eq $count+1) 'Existing touch-response switch still controls pose resets while retaining rebound'
$after=@($script:window.Left,$script:window.Top,$script:window.Width,$script:window.Height,$script:scale)
Check (($before-join ',')-eq ($after-join ',')) 'Position and size remain unchanged'
Stop-DragonAnimation;$script:window.Close()
[IO.File]::WriteAllText($Report,(@{ok=$true;checks=$script:checks;realWpf=$true;frameReadyBeforeSquash=$true;holdMs=260;squashMs=220;paidCalls=0}|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
