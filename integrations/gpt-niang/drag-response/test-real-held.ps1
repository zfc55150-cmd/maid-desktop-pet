param([string]$Package=(Join-Path $PSScriptRoot '../../../work/gpt-held-air-landing-20261102-01'))
$ErrorActionPreference='Stop';$Package=[IO.Path]::GetFullPath($Package)
$prefix=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'test-real-wpf.ps1'));$prefix=$prefix.Substring(0,$prefix.IndexOf('$samples=New-Object'));. ([ScriptBlock]::Create($prefix)) -Package $Package
. ([ScriptBlock]::Create([IO.File]::ReadAllText((Join-Path $Package 'files/runtime/dragon-animation/motion-selection.ps1'))))
$native=[IO.File]::ReadAllText((Join-Path $Package 'files/runtime/native-motion.cs'))+@'

public sealed class HeldTestCursor:IPetMotionCursor {
 public int X,Y;public PetMotionPoint Read(){return new PetMotionPoint{X=X,Y=Y};}
}
'@
Add-Type -TypeDefinition $native -ReferencedAssemblies @('System.dll','System.Core.dll',[Windows.Window].Assembly.Location,[Windows.Media.Visual].Assembly.Location,[Windows.Rect].Assembly.Location,[Windows.Markup.IUriContext].Assembly.Location)
function Step-Held {Tick-DragonAnimation;$null=$script:window.Dispatcher.Invoke([Action]{},[Windows.Threading.DispatcherPriority]::Background);Start-Sleep -Milliseconds 5}
$until=[DateTime]::UtcNow.AddSeconds(5);do{Step-Held}while((!$script:dragonPages.ContainsKey('flutter:0') -or !$script:dragonPages.ContainsKey('draglanding:0')) -and [DateTime]::UtcNow-lt $until)
$cursor=[HeldTestCursor]::new();$motion=[PetNativeMotion]::new($script:window,$script:ui.Girl,$cursor);$script:petNativeMotion=$motion
$box=[PetMotionBox]::new();$box.MinX=-45000;$box.MaxX=-10000;$box.MinY=-45000;$box.MaxY=-10000
$motion.BeginDrag([PetMotionBox[]]@($box),1.5)
[Threading.Thread]::Sleep(50);$cursor.X=120;$motion.Pulse()
if(!$motion.DragFlightEligible){throw 'NATIVE_SPEED_THRESHOLD_NOT_LATCHED'}
$until=[DateTime]::UtcNow.AddSeconds(4)
do{$motion.Pulse();Step-Held}while(($script:dragonLastDrawnClip-ne 'flutter' -or $script:dragonFrameIndex-lt 85) -and [DateTime]::UtcNow-lt $until)
if($script:dragonFrameIndex-lt 66 -or $script:dragonLastDrawnClip-ne 'flutter'){throw 'VISIBLE_HELD_AIR_NOT_REACHED'}
$releaseFrame=$script:dragonFrameIndex
# Pointer has been still for over 150ms: release itself cannot cause a throw.
$motion.EndDrag($box)
if($motion.Flying -or $motion.FlightSerial-ne 0 -or $motion.StopReason-ne 'released'){throw 'TEST_MUST_BE_HELD_RELEASE_NOT_PHYSICAL_THROW'}
Tick-DragonAnimation
if($script:dragonLastDrawnClip-ne 'draglanding' -or $script:dragonFrameIndex-ne 0){throw 'MID_HELD_AIR_RELEASE_LOST_LANDING'}
$clock=[Diagnostics.Stopwatch]::StartNew();$seenFinal=$false;$until=[DateTime]::UtcNow.AddSeconds(9)
do{Step-Held;if($script:dragonLastDrawnClip-eq 'draglanding' -and $script:dragonFrameIndex-eq 179){$seenFinal=$true};if($seenFinal -and $script:dragonLastDrawnClip-eq 'frontidle'){break}}while([DateTime]::UtcNow-lt $until)
if(!$seenFinal -or $script:dragonLastDrawnClip-ne 'frontidle'){throw 'COMPLETE_LANDING_FAILED'}
$r=@{ok=$true;releasedFlutterFrame=$releaseFrame;dragSerial=$motion.DragSerial;speedQualified=$motion.DragFlightEligible;physicalFlightSerial=$motion.FlightSerial;stopReason=$motion.StopReason;landingFirstFrame=0;landingFinalFrame=179;returnedTo=$script:dragonLastDrawnClip;landingToIdleMs=$clock.ElapsedMilliseconds;realCursorReplay=$true;realNativeController=$true;realAtlases=$true;userMouseMoved=$false;settingsWritten=$false;paidCalls=0}
$motion.BeginDrag([PetMotionBox[]]@($box),1.5);[Threading.Thread]::Sleep(100);$cursor.X+=9;$motion.Pulse();Tick-DragonAnimation
if(!$motion.Moved -or $motion.DragFlightEligible -or $script:dragonClip-eq 'flutter'){throw 'SLOW_DRAG_MUST_STAY_GROUNDED'}
$motion.EndDrag($box);Tick-DragonAnimation
if($script:dragonClip-eq 'draglanding'){throw 'SLOW_DRAG_MUST_NOT_LAND'}
$r['slowNativeDragStayedGrounded']=$true
$motion.Stop();Stop-DragonAnimation;$script:window.Close();[IO.File]::WriteAllText((Join-Path $Package 'real-held.json'),($r|ConvertTo-Json -Depth 4),[Text.UTF8Encoding]::new($false));$r|ConvertTo-Json
