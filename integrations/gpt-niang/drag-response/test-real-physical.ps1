param([string]$Package=(Join-Path $PSScriptRoot '../../../work/gpt-physical-landing-20261102-03'))
$ErrorActionPreference='Stop';$Package=[IO.Path]::GetFullPath($Package)
$prefix=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'test-real-wpf.ps1'));$prefix=$prefix.Substring(0,$prefix.IndexOf('$samples=New-Object'))
. ([ScriptBlock]::Create($prefix)) -Package $Package
. ([ScriptBlock]::Create([IO.File]::ReadAllText((Join-Path $Package 'files/runtime/dragon-animation/motion-selection.ps1'))))
Add-Type -TypeDefinition ([IO.File]::ReadAllText((Join-Path $Package 'files/runtime/native-motion.cs'))) -ReferencedAssemblies @('System.dll','System.Core.dll',[Windows.Window].Assembly.Location,[Windows.Media.Visual].Assembly.Location,[Windows.Rect].Assembly.Location,[Windows.Markup.IUriContext].Assembly.Location)
function Step-Real {Tick-DragonAnimation;$null=$script:window.Dispatcher.Invoke([Action]{},[Windows.Threading.DispatcherPriority]::Background);Start-Sleep -Milliseconds 5}
$until=[DateTime]::UtcNow.AddSeconds(5)
do{Step-Real}while((!$script:dragonPages.ContainsKey('flutter:0') -or !$script:dragonPages.ContainsKey('draglanding:0')) -and [DateTime]::UtcNow-lt $until)
if(!$script:dragonPages.ContainsKey('draglanding:0')){throw 'WARM_TIMEOUT'}
$motion=[PetNativeMotion]::new($script:window,$script:ui.Girl);$script:petNativeMotion=$motion
$box=[PetMotionBox]::new();$box.MinX=-21000;$box.MaxX=-19000;$box.MinY=-21000;$box.MaxY=-20000
$motion.Launch(-20000,-20000,0,0,$box,1.5)
Tick-DragonAnimation
if($script:dragonClip-eq 'draglanding'){throw 'LANDED_DURING_FLIGHT'}
$until=[DateTime]::UtcNow.AddSeconds(3)
while($motion.Flying -and [DateTime]::UtcNow-lt $until){[Threading.Thread]::Sleep(8);$motion.Pulse()}
if($motion.StopReason-ne 'rested' -or $motion.CompletedFlightSerial-ne 1){throw 'PHYSICAL_REST_NOT_CERTIFIED'}
Tick-DragonAnimation
if($script:dragonLastDrawnClip-ne 'draglanding' -or $script:dragonFrameIndex-ne 0){throw 'REAL_REST_DID_NOT_START_LANDING'}
$started=[Diagnostics.Stopwatch]::StartNew();$serial=$script:dragonClipSerial;$seenFinal=$false;$until=[DateTime]::UtcNow.AddSeconds(9)
do{
 Step-Real
 if($script:dragonLastDrawnClip-eq 'draglanding' -and $script:dragonFrameIndex-eq 179){$seenFinal=$true}
 if($script:dragonLastDrawnClip-eq 'frontidle' -and $seenFinal){break}
}while([DateTime]::UtcNow-lt $until)
if(!$seenFinal -or $script:dragonLastDrawnClip-ne 'frontidle'){throw 'REAL_LANDING_RETURN_FAILED'}
$r=@{ok=$true;flightSerial=$motion.FlightSerial;completedFlightSerial=$motion.CompletedFlightSerial;handledFlightSerial=$script:dragonHandledFlightSerial;landingFirstFrame=0;landingFinalFrame=179;returnedTo=$script:dragonLastDrawnClip;restToIdleMs=$started.ElapsedMilliseconds;realNativeController=$true;realAtlases=$true;offscreenWindow=$true;settingsWritten=$false;paidCalls=0}
$motion.Stop();Stop-DragonAnimation;$script:window.Close()
[IO.File]::WriteAllText((Join-Path $Package 'real-physical.json'),($r|ConvertTo-Json -Depth 4),[Text.UTF8Encoding]::new($false));$r|ConvertTo-Json
