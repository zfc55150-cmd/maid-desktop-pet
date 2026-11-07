param([string]$Package=(Join-Path $PSScriptRoot '../../../work/gpt-drag-responsive-20261101-03'),[switch]$Baseline)
$ErrorActionPreference='Stop';$Package=[IO.Path]::GetFullPath($Package)
Add-Type -AssemblyName PresentationFramework,PresentationCore,WindowsBase
$script:appDir='$env:LOCALAPPDATA/Programs/GPTNiangUsage/gpt-niang-usage'
$script:dataDir=Join-Path $Package $(if($Baseline){'fake-baseline-state'}else{'fake-candidate-state'});$script:dragonTestMode=$true
$null=[IO.Directory]::CreateDirectory($script:dataDir)
. ([ScriptBlock]::Create([IO.File]::ReadAllText((Join-Path $script:appDir 'runtime/characters.ps1'))))
. ([ScriptBlock]::Create([IO.File]::ReadAllText((Join-Path $script:appDir 'runtime/dragon-animation/dragon-animation.ps1'))))
$runtime=if($Baseline){Join-Path $Package 'before.ps1'}else{Join-Path $Package 'files/runtime/dragon-animation/motion-runtime.ps1'}
. ([ScriptBlock]::Create([IO.File]::ReadAllText($runtime)))
function Save-Settings {throw 'TEST_MUST_NOT_SAVE_SETTINGS'}
$script:ui=@{Girl=[Windows.Controls.Image]::new()};$script:ui.Girl.Width=300;$script:ui.Girl.Height=300
$script:window=[Windows.Window]::new();$script:window.Content=$script:ui.Girl;$script:window.Width=320;$script:window.Height=320;$script:window.Left=-20000;$script:window.Top=-20000;$script:window.ShowInTaskbar=$false;$script:window.ShowActivated=$false
$script:window.Show()
$script:characterId='gpt-dragon';$script:widgetPetForm='full'
$script:bitmap=Read-WidgetCharacterImage (Join-Path $script:appDir 'assets/gpt-dragon-niang-bust.png');$script:ui.Girl.Source=$script:bitmap
Initialize-DragonAnimationSettings ([pscustomobject]@{dragonMotionVersion=1;dragonCodexEnabled=$false})
Start-DragonAnimation
if(!$script:dragonTimer){throw 'REAL_ANIMATION_START_FAILED'}
$script:dragonTimer.Stop()
$samples=New-Object 'System.Collections.Generic.List[object]';$costs=New-Object 'System.Collections.Generic.List[double]'
$clock=[Diagnostics.Stopwatch]::StartNew();$maxPages=0
function Step {
 $beforeReason=$script:dragonManualReason;$beforeClip=$script:dragonClip
 $c=[Diagnostics.Stopwatch]::StartNew();Tick-DragonAnimation;$cost=$c.Elapsed.TotalMilliseconds;$costs.Add($cost)
 if($script:dragonPages.Count-gt $script:maxPages){$script:maxPages=$script:dragonPages.Count}
 $samples.Add(@{ms=$clock.ElapsedMilliseconds;clip=$script:dragonLastDrawnClip;frame=$script:dragonFrameIndex;fade=[bool]$script:dragonFadePrevious;costMs=$cost;beforeReason=$beforeReason;reason=$script:dragonManualReason;beforeClip=$beforeClip;pages=$script:dragonPages.Count})
 $null=$script:window.Dispatcher.Invoke([Action]{},[Windows.Threading.DispatcherPriority]::Background)
 if($script:dragonLastError){throw 'REAL_ANIMATION_ERROR'}
 Start-Sleep -Milliseconds 5
}
function Wait([scriptblock]$Ready,[int]$Timeout=12000){
 $until=$clock.ElapsedMilliseconds+$Timeout
 do{Step;if(& $Ready){return}}while($clock.ElapsedMilliseconds-lt $until)
 throw ('REAL_TIMEOUT '+$script:dragonClip+' '+$script:dragonFrameIndex)
}
function Pump([int]$Ms){$until=$clock.ElapsedMilliseconds+$Ms;do{Step}while($clock.ElapsedMilliseconds-lt $until)}
Wait {$script:dragonLastDrawnClip-eq 'frontidle'}
$warmClock=[Diagnostics.Stopwatch]::StartNew()
if(!$Baseline){Wait {$script:dragonPages.ContainsKey('flutter:1') -and $script:dragonPages.ContainsKey('draglanding:0')}}
$warmMs=$warmClock.ElapsedMilliseconds
$routes=@()
foreach($hold in $(if($Baseline){@(20)}else{@(20,80,400,3000)})){
 $script:drag=@{moved=$true};$script:petNativeMotion=[pscustomobject]@{Dragging=$true;Moved=$true;Flying=$false;StopReason=$null;AnimationTimer=$null}
 $entry=[Diagnostics.Stopwatch]::StartNew();$total=$script:dragonPresentedTotal
 Wait {$script:dragonLastDrawnClip-eq 'flutter' -and $script:dragonPresentedTotal-gt $total}
 $entryMs=$entry.ElapsedMilliseconds;$entryFrame=$script:dragonFrameIndex;$visibleAt=$clock.ElapsedMilliseconds;$shownMono=[long]$script:dragonDragShownAt
 if(!$Baseline -and $entryFrame-ne 66){throw 'NOT_LIFTED_ENTRY'}
 Pump $hold
 $script:drag=$null;$script:petNativeMotion.Dragging=$false;$script:petNativeMotion.StopReason='released'
 $released=$clock.ElapsedMilliseconds
 Wait {$script:dragonLastDrawnClip-eq 'draglanding'}
 $landingAt=$clock.ElapsedMilliseconds;$landFrame=$script:dragonFrameIndex
 $visibleDuration=if($Baseline){$landingAt-$visibleAt}else{(Get-DragonMonotonicMs)-$shownMono}
 if(!$Baseline -and ($visibleDuration-lt 120 -or $landFrame-ne 0)){throw ('LANDING_WITHOUT_VISIBLE_TAKEOFF hold='+$hold+' visibleMs='+$visibleDuration+' entry='+$landFrame)}
 $routes+=@{heldAfterFirstFrameMs=$hold;entryDelayMs=$entryMs;entryFrame=$entryFrame;flightVisibleBeforeLandingMs=$visibleDuration;releaseToLandingMs=$landingAt-$released;landingEntryFrame=$landFrame}
 if($hold-eq 20){
  Wait {$script:dragonLastDrawnClip-eq 'draglanding' -and $script:dragonFrameIndex-eq 179}
  Wait {$script:dragonLastDrawnClip-eq 'frontidle'}
 }
}
$sorted=@($costs.ToArray()|Sort-Object);$p95=$sorted[[Math]::Min($sorted.Count-1,[int][Math]::Floor($sorted.Count*0.95))]
$interactive=@($samples|Where-Object{$_.reason-in @('drag','drag-release') -or $_.beforeReason-in @('drag','drag-release')}|Sort-Object {[double]$_.costMs})
$r=@{ok=$true;baseline=[bool]$Baseline;warmPagesReadyMs=$warmMs;routes=$routes;tickSamples=$costs.Count;tickMedianMs=$sorted[[int][Math]::Floor($sorted.Count/2)];tickP95Ms=$p95;tickMaxMs=$sorted[-1];interactionP95Ms=$interactive[[int][Math]::Floor($interactive.Count*0.95)].costMs;interactionMaxMs=$interactive[-1].costMs;slowestTicks=@($samples|Sort-Object {[double]$_.costMs} -Descending|Select-Object -First 5);cacheMax=$script:maxPages;workingSetMiB=[Math]::Round((Get-Process -Id $PID).WorkingSet64/1MB,2);landingCompletedToIdle=$true;realAtlases=$true;offscreenWpfWindow=$true;settingsWritten=$false;paidCalls=0}
Stop-DragonAnimation;$script:window.Close()
$name=if($Baseline){'real-baseline.json'}else{'real-candidate.json'}
[IO.File]::WriteAllText((Join-Path $Package $name),($r|ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false));$r|ConvertTo-Json -Depth 5
