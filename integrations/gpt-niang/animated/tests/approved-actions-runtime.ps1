param([string]$Stage,[string]$Report=(Join-Path $PSScriptRoot '..\..\..\..\work\gpt-niang-animation\approved-actions-runtime-tests\report.json'))
$ErrorActionPreference='Stop'
$code=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$Report=[IO.Path]::GetFullPath($Report);$null=[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($Report))
Add-Type -AssemblyName PresentationFramework,PresentationCore,WindowsBase,System.Xaml
if(!('DragonMotionDecoder'-as [type])){Add-Type -TypeDefinition ([IO.File]::ReadAllText((Join-Path $code 'motion-decoder.cs'),[Text.Encoding]::UTF8)) -ReferencedAssemblies @('System.dll','System.Core.dll',[Windows.Media.Imaging.BitmapSource].Assembly.Location,[Windows.Rect].Assembly.Location,[Windows.Markup.IUriContext].Assembly.Location)}
. ([ScriptBlock]::Create([IO.File]::ReadAllText((Join-Path $code 'motion-selection.ps1'),[Text.Encoding]::UTF8)))
. ([ScriptBlock]::Create([IO.File]::ReadAllText((Join-Path $code 'motion-runtime.ps1'),[Text.Encoding]::UTF8)))
. ([ScriptBlock]::Create([IO.File]::ReadAllText((Join-Path $code '..\forms\native-motion-adapter.ps1'),[Text.Encoding]::UTF8)))
$checks=New-Object 'System.Collections.Generic.List[string]'
function Check($Value,[string]$Name){if(!$Value){throw $Name};$checks.Add($Name)}
function New-TestBitmap([byte]$Colour=210){$pixels=New-Object byte[] 64;for($n=0;$n-lt 64;$n+=4){$pixels[$n]=$Colour;$pixels[$n+1]=180;$pixels[$n+2]=220;$pixels[$n+3]=255};$image=[Windows.Media.Imaging.BitmapSource]::Create(4,4,96,96,[Windows.Media.PixelFormats]::Bgra32,$null,$pixels,16);$image.Freeze();return $image}
$script:testBitmap=New-TestBitmap
function New-DragonCachedFrame($Image){return @{image=$Image}}
function Set-DragonCachedFrame($Frame){$script:bitmap=$Frame.image;$script:ui.Girl.Source=$Frame.image}
function Start-DragonActivityWatch {}
function Stop-DragonActivityWatch {}
function Stop-DragonAnimation {if($script:dragonTimer){$script:dragonTimer.Stop();$script:dragonTimer=$null}}
function Save-Settings {throw 'TEST_MUST_NOT_SAVE_PERSONAL_SETTINGS'}
function Get-DragonActivityPhase([long]$Now){
 # Completion reactions now come from stable, deduplicated snapshots. A fake
 # perpetual phase with no source record exercises only the legacy adapter.
 if($script:testActivity-eq 'happy'){
  if(!$script:testHappyRecord){$script:testHappyRecord=@{version=1;session=('a'*32);turn=('b'*32);phase='happy';terminal=$true;at=$Now;expiresAt=$Now+6500;tools=@()}}
  $script:dragonSnapshots=@($script:testHappyRecord);Update-DragonVisualEvents $script:dragonSnapshots $Now
 }else{$script:dragonSnapshots=@()}
 return $script:testActivity
}
function Reset-TestRuntime($Manifest){
 $script:dragonManifest=$Manifest;$script:dragonAnimationEnabled=$true;$script:dragonTouchEnabled=$true;$script:dragonCodexEnabled=$false;$script:dragonTouchNextAt=0
 $script:characterId='gpt-dragon';$script:widgetPetForm='full';$script:petFormTransition=$false;$script:petFullClickIdleUntil=0;$script:widgetMusic=$null;$script:characterGallery=$null;$script:petFormsReady=$false
 $script:window=[pscustomobject]@{IsVisible=$true};$script:ui=@{Girl=[Windows.Controls.Image]::new()};$script:bitmap=$script:testBitmap;$script:ui.Girl.Source=$script:bitmap
 $script:context=[Windows.Controls.ContextMenu]::new();$script:dragonTimer=[Windows.Threading.DispatcherTimer]::new();$script:dragonManualUntil=0;$script:dragonManualPhase='';$script:dragonManualReason=''
 $script:dragonPhase='';$script:dragonActivityPhase='idle';$script:dragonFrameKey='';$script:dragonWasRendering=$false;$script:dragonPausedAt=0;$script:dragonDragRendering=$false
 $script:dragonPendingEvents=New-Object 'System.Collections.Generic.List[object]';$script:dragonSeenEvents=@{};$script:dragonSnapshots=@();$script:testHappyRecord=$null;$script:dragonLastObservedPhase='idle'
 $script:dragonMediaClock=[DragonMediaClock]::new();$script:dragonManualClock=[DragonDeadlineClock]::new();$script:dragonHoldClock=[DragonDeadlineClock]::new()
 $script:dragonHasClickRebound=$null;$script:dragonHasCancelPress=$null;$script:dragonHasObserverSync=$null
 $script:dragonClipSerial=0;$script:dragonLastDrawnSerial=-1;$script:dragonLastDrawnClip='';$script:dragonFadePrevious=$null;$script:dragonQueuedNext=$null;$script:dragonRecentClips=@{};$script:dragonEventIndex=@{}
 $script:dragonPages=@{};$script:dragonLoadRequests=@{};$script:dragonPageOrder=New-Object 'System.Collections.Generic.List[string]';$script:dragonPresentedTotal=0;$script:dragonRendered=0;$script:dragonFrameIndex=0
 $script:dragonStatusAt=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();$script:dragonOriginal=@{image=$script:testBitmap};$script:dragonOriginalTooltip='TEST';$script:dragonStatusMenu=$null;$script:dragonTouchNextAt=0
 $script:petFullReboundPending=$false;$script:petFullReboundTarget='';$script:petFullReboundQueuedAt=0;$script:petFullPressActive=$false;$script:petFullPressWasDragged=$false
 $script:dragonLastWorkingAt=0;$script:dragonPhaseAt=0;$script:drag=$null;$script:petNativeMotion=$null;$script:testActivity='idle';$script:testBlockFrames=$false;$script:testRequests=@()
 $script:dragonRandom=New-Object psobject -Property @{index=0;value=0.0}
 $script:dragonRandom|Add-Member ScriptMethod Next {param([int]$Count)return [Math]::Min($this.index,$Count-1)}
 $script:dragonRandom|Add-Member ScriptMethod NextDouble {return $this.value}
}
function New-TestManifest {
 $states=[ordered]@{};$idle=@('idle','idlesway','poserelax','weightshift','brelaxed','turnfront','frontidle','turnside','footrelax')
 $actions=@('response','happy','confused','wave','stretching','thinking','lookaround','sleeping','tea','walking','flutter','flutterplay','bodybalance','confusedquiet','bow','frontpose');$returns=[ordered]@{};$groups=[ordered]@{}
 foreach($name in $idle+$actions){$states[$name]=@{label=$name;frames=180;fps=30;loop=($name-in @('idle','idlesway','weightshift','brelaxed','frontidle'));sourceKind='continuous-video';pages=@()};$groups[$name]=if($name-in $idle){'待机与姿态'}else{'表情与互动'}}
 foreach($name in $actions){$returns[$name]='frontidle'}
 return (@{version=6;fps=30;states=$states;pools=@{idle=$idle;thinking=@('thinking');working=@('thinking');waiting=@('frontidle');happy=@('happy','response');confused=@('confused')};idleBases=@('idle','idlesway');idlePoseRoutes=@{poserelax=@('brelaxed');brelaxed=@('brelaxed','turnfront');turnfront=@('frontidle');frontidle=@('frontidle','turnside');turnside=@('brelaxed','footrelax');footrelax=@('turnfront')};returnPoses=$returns;touchResponses=@{tail='flutterplay';head='happy';body='response';feet='bow'};menuGroups=$groups;idleInteractionPool=@('thinking','tea','lookaround','stretching','sleeping');idleInteractionChance=0.10;dragClip='flutter'}|ConvertTo-Json -Depth 9|ConvertFrom-Json)
}
$manifest=New-TestManifest;Reset-TestRuntime $manifest
Check ((Get-DragonIdleEntry 'flutter')-eq 'frontidle') 'new-action-return-pose-selected'
Check (!(Test-DragonNativePoseJoin 'flutter' 'frontidle')) 'return-pose-is-not-an-invented-native-join'
Check ((Get-DragonIdleEntry 'turnfront')-eq 'frontidle') 'approved-native-pose-route-retained'
Check ((Select-DragonNextClip 'idle' 'tea')-eq 'frontidle') 'automatic-one-shot-returns-before-another-action'
Check ((Select-DragonNextClip 'idle' 'idle')-eq 'thinking') 'stable-idle-can-select-low-frequency-interaction'
Check ((Select-DragonNextClip 'idle' 'frontidle')-eq 'tea') 'idle-interaction-recent-history-avoids-repeat'
foreach($name in @('turnfront','turnside','poserelax','footrelax')){Check ((Select-DragonNextClip 'idle' $name)-in @(Get-DragonPoseSuccessors $name)) ('no-interaction-in-approved-bridge-'+$name)}
foreach($touch in @(@{x=0.5;y=0.25;clip='happy'},@{x=0.8;y=0.6;clip='flutterplay'},@{x=0.5;y=0.6;clip='response'},@{x=0.5;y=0.9;clip='bow'})){$script:dragonTouchNextAt=0;Check ((Invoke-DragonTouch $touch.x $touch.y)-and $script:dragonManualPhase-eq $touch.clip) ('new-touch-'+$touch.clip)}
$script:dragonTouchEnabled=$false;$script:dragonTouchNextAt=0;Check (!(Invoke-DragonTouch 0.5 0.5)) 'touch-disable-respected'
Check (@($manifest.states.PSObject.Properties.Name|ForEach-Object{Get-DragonActionMenuGroup $_}|Where-Object{!$_}).Count-eq 0) 'new-menu-groups-cover-all-25-states'
$old=@{states=@{idle=@{};shy=@{frames=100;fps=30};tailgroom=@{frames=100;fps=30};heart=@{frames=100;fps=30};bow=@{frames=100;fps=30}};pools=@{idle=@('idle')};fps=30}|ConvertTo-Json -Depth 5|ConvertFrom-Json
Reset-TestRuntime $old;Check ((Get-DragonIdleEntry 'heart')-eq 'idle') 'legacy-default-idle-retained';Check (!(Get-DragonDragClip)) 'legacy-manifest-has-no-drag-animation'
foreach($touch in @(@{x=0.5;y=0.25;clip='shy'},@{x=0.8;y=0.6;clip='tailgroom'},@{x=0.5;y=0.6;clip='heart'},@{x=0.5;y=0.9;clip='bow'})){$script:dragonTouchNextAt=0;Check ((Invoke-DragonTouch $touch.x $touch.y)-and $script:dragonManualPhase-eq $touch.clip) ('legacy-touch-'+$touch.clip)}
Check ((Get-DragonActionMenuGroup 'wave')-eq '生活小动作') 'legacy-menu-classification-retained'
Reset-TestRuntime $manifest;$script:petNativeMotion=[pscustomobject]@{AnimationTimer=$null;Dragging=$true;Moved=$false};Prepare-WidgetMotionAnimation
Check ($null-eq $script:petNativeMotion.AnimationTimer -and !$script:dragonPausedAt) 'new-full-body-native-mover-does-not-stop-animation'
Check (!(Test-DragonMotionDragActive)) 'unmoved-pointer-does-not-trigger-flight'
$script:drag=@{moved=$true};$script:petNativeMotion.Dragging=$false;Check (Test-DragonMotionDragActive) 'follow-host-PS-drag-falls-back-when-native-is-idle'
$script:petNativeMotion.Dragging=$true;Check (!(Test-DragonMotionDragActive)) 'native-pending-movement-does-not-use-stale-PS-moved-flag'
$script:drag=$null
$script:petNativeMotion.Moved=$true;Check (Test-DragonMotionDragActive) 'native-moved-threshold-triggers-flight'
$script:widgetPetForm='bust';Prepare-WidgetMotionAnimation;Check ($script:petNativeMotion.AnimationTimer-eq $script:dragonTimer) 'bust-preserves-native-animation-pause'
$script:widgetPetForm='full';$script:dragonManifest=$old;$script:dragonPausedAt=0;Prepare-WidgetMotionAnimation;Check ($script:petNativeMotion.AnimationTimer-eq $script:dragonTimer -and $script:dragonPausedAt-gt 0) 'legacy-native-animation-pause-preserved'

# Optional integration pass uses the real staged 25-state assets, never a live widget.
if($Stage){
 $script:appDir=[IO.Path]::GetFullPath($Stage);$script:dataDir=Join-Path ([IO.Path]::GetDirectoryName($Report)) 'fake-state';$null=[IO.Directory]::CreateDirectory($script:dataDir)
 Reset-TestRuntime $manifest;$script:dragonTimer=$null;$script:petFormFullFrame=@{image=$script:testBitmap};$script:dragonTestMode=$true
 Start-DragonAnimation
 Check ($script:dragonStartupStage-eq 'timer-started' -and !$script:dragonLastError) 'staged-runtime-starts'
 $script:dragonTimer.Stop();$real=@($script:dragonManifest.states.PSObject.Properties.Name)
 $menu=@($script:context.Items|Where-Object{$_ -is [Windows.Controls.MenuItem] -and $_.Header-eq '点播小动作'})
 $items=@($menu[0].Items|ForEach-Object{$_.Items}|Where-Object{$_ -is [Windows.Controls.MenuItem]});$tags=@($items|ForEach-Object{[string]$_.Tag})
 Check ($tags.Count-eq $real.Count -and @($tags|Select-Object -Unique).Count-eq $real.Count -and @($real|Where-Object{$_-notin $tags}).Count-eq 0) 'real-staged-menu-covers-all-actions'
 function Wait-TestClip([string]$Clip,[int]$Frame=-1){$deadline=[DateTime]::UtcNow.AddSeconds(12);do{Tick-DragonAnimation;if($script:dragonLastDrawnClip-eq $Clip -and ($Frame-lt 0 -or $script:dragonFrameIndex-eq $Frame)){return};Start-Sleep -Milliseconds 5}while([DateTime]::UtcNow-lt $deadline);throw ('STAGED_FRAME_TIMEOUT_'+$Clip)}
 $script:dragonManifest.idleInteractionChance=0;$script:petNativeMotion=$null;$entry=Get-DragonIdleEntry '';Wait-TestClip $entry
 $before=$script:ui.Girl.Source;$script:drag=@{moved=$true};$script:petNativeMotion=[pscustomobject]@{Dragging=$true;Moved=$true;AnimationTimer=$null};Tick-DragonAnimation
 Check ($script:ui.Girl.Source-eq $before) 'real-cold-drag-first-page-keeps-current-character'
 $dragClip=[string]$script:dragonManifest.dragClip;Wait-TestClip $dragClip
 if([Windows.SystemParameters]::ClientAreaAnimation){$duration=$script:dragonManifest.states.$dragClip.frames*1000.0/(Get-DragonMediaFps $script:dragonManifest.states.$dragClip);$script:dragonClipAt=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()-[long]$duration-1000;Wait-TestClip $dragClip ([int]$script:dragonManifest.states.$dragClip.frames-1);Check ($script:dragonFrameIndex-eq [int]$script:dragonManifest.states.$dragClip.frames-1) 'real-drag-holds-native-last-frame'}
 $script:drag=$null;$script:petNativeMotion.Dragging=$false;Wait-TestClip 'frontidle';Check (!$script:dragonDragRendering) 'real-drag-release-returns-to-front-idle'
 Check ($script:dragonPages.Count-le 3) 'real-decoded-page-cache-stays-bounded';Stop-DragonAnimation
}

# Frame availability is controlled here to deterministically exercise cold-load races.
function Merge-DragonPageLoads {}
function Request-DragonMotionPage([string]$Clip,[int]$Page){$script:testRequests+=@($Clip+':'+$Page)}
function Get-DragonMotionFrame([string]$Clip,[int]$Index){if($script:testBlockFrames){return $null};return @{image=$script:testBitmap}}
Reset-TestRuntime $manifest;$script:drag=@{moved=$true};$script:petNativeMotion=[pscustomobject]@{Dragging=$true;Moved=$true;AnimationTimer=$null};$script:testBlockFrames=$true;$before=$script:ui.Girl.Source;Tick-DragonAnimation
Check ($script:ui.Girl.Source-eq $before -and $script:dragonLastDrawnSerial-eq -1) 'cold-drag-retains-character-before-ready'
$script:testBlockFrames=$false;Tick-DragonAnimation;Check ($script:dragonClip-eq 'flutter' -and $script:dragonFrameIndex-eq 0) 'drag-starts-first-native-frame'
if([Windows.SystemParameters]::ClientAreaAnimation){$script:dragonClipAt=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()-12000;Tick-DragonAnimation;Check ($script:dragonFrameIndex-eq 179) 'held-drag-stops-at-native-last-frame';Tick-DragonAnimation;Check ($script:dragonFrameIndex-eq 179) 'held-drag-never-wraps'}
$script:testBlockFrames=$true;$before=$script:ui.Girl.Source;$script:drag=$null;$script:petNativeMotion.Dragging=$false;Tick-DragonAnimation;Check ($script:ui.Girl.Source-eq $before) 'cold-release-retains-drag-character'
$script:testBlockFrames=$false;Tick-DragonAnimation;Check ($script:dragonClip-eq 'frontidle' -and !$script:dragonDragRendering) 'release-selects-existing-front-idle'
Reset-TestRuntime $manifest;$script:dragonDragRendering=$true;$script:dragonClip='flutter';$script:dragonManualReason='touch';$script:dragonManualPhase='happy';$script:dragonManualUntil=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()+10000;Tick-DragonAnimation
Check ($script:dragonClip-eq 'happy' -and $script:dragonManualReason-eq 'touch') 'release-does-not-swallow-new-mouse-up-response'
Reset-TestRuntime $manifest;$script:dragonCodexEnabled=$true;$script:testActivity='working';Tick-DragonAnimation
Check ($script:dragonClip-eq 'thinking') 'real-work-phase-uses-new-thinking-pool'
if([Windows.SystemParameters]::ClientAreaAnimation){$script:dragonClipAt=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()-7000;Tick-DragonAnimation;Check ($script:dragonClip-eq 'frontidle') 'automatic-task-one-shot-returns-before-repeating'}
# This case checks completion dedupe, independently of optional idle actions.
$manifest.idleInteractionChance=0
Reset-TestRuntime $manifest;$script:dragonCodexEnabled=$true;$script:testActivity='happy';Tick-DragonAnimation
if([Windows.SystemParameters]::ClientAreaAnimation){$script:dragonClipAt=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()-7000;Tick-DragonAnimation;Check ($script:dragonClip-eq 'frontidle') 'completion-one-shot-returns-to-poise';$script:dragonClipAt=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()-7000;Tick-DragonAnimation;Check ($script:dragonClip-eq 'frontidle') 'same-completion-event-does-not-repeat-reaction'}
Reset-TestRuntime $old;$script:drag=$true;Tick-DragonAnimation;Check ($script:dragonPresentedTotal-eq 0 -and $script:dragonPausedAt-gt 0) 'legacy-drag-still-pauses-animation'
$result=@{ok=$true;count=$checks.Count;checks=@($checks.ToArray());stagedAssetsVerified=[bool]$Stage;usesFakeState=$true;personalSettingsWritten=$false;paidCalls=0}
[IO.File]::WriteAllText($Report,($result|ConvertTo-Json -Depth 7),[Text.UTF8Encoding]::new($false));$result|ConvertTo-Json -Depth 7
