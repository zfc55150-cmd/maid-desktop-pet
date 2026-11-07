param([string]$Package=(Join-Path $PSScriptRoot '../../../work/gpt-physical-landing-20261102-03'))
$ErrorActionPreference='Stop';$Package=[IO.Path]::GetFullPath($Package)
$setup=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'test-policy.ps1'));$setup=$setup.Substring($setup.IndexOf('$ErrorActionPreference='));$setup=$setup.Substring(0,$setup.IndexOf('$m=New-TestManifest'))
$setup=$setup.Replace("(Join-Path `$PSScriptRoot '../animated/tests')",("(Join-Path '"+$PSScriptRoot.Replace("'","''")+"' '../animated/tests')"));. ([ScriptBlock]::Create($setup))
. ([ScriptBlock]::Create([IO.File]::ReadAllText((Join-Path $Package 'files/runtime/dragon-animation/motion-selection.ps1'))))
Add-Type -TypeDefinition ([IO.File]::ReadAllText((Join-Path $Package 'files/runtime/native-motion.cs'))) -ReferencedAssemblies @('System.dll','System.Core.dll',[Windows.Window].Assembly.Location,[Windows.Media.Visual].Assembly.Location,[Windows.Rect].Assembly.Location,[Windows.Markup.IUriContext].Assembly.Location)
$m=New-TestManifest;$m|Add-Member NoteProperty dragLandingClip 'draglanding';$m.states|Add-Member NoteProperty draglanding ([pscustomobject]@{frames=180;fps=30;loop=$false;sourceKind='continuous-video';pages=@()});$m.returnPoses|Add-Member NoteProperty draglanding 'frontidle'
function Reset-Physical {
 Reset-TestRuntime $m;$script:simMono=1000;$script:simAge=0;$script:dragonHandledFlightSerial=0
 $script:petNativeMotion=[pscustomobject]@{Dragging=$true;Moved=$true;Flying=$false;StopReason=$null;AnimationTimer=$null;FlightSerial=0;CompletedFlightSerial=0}
}
foreach($f in 0..179){
 Reset-Physical;Tick-DragonAnimation;$script:dragonFrameIndex=$f;$script:petNativeMotion.Dragging=$false;$script:petNativeMotion.StopReason='released';Tick-DragonAnimation
 Check ($script:dragonClip-ne 'draglanding' -and !$script:dragonDragRendering) ('ordinary-drag-release-never-lands-'+$f)
}
Reset-Physical;Tick-DragonAnimation;$script:petNativeMotion.Dragging=$false;$script:petNativeMotion.Flying=$true;$script:petNativeMotion.FlightSerial=1;Tick-DragonAnimation
Check ($script:dragonClip-eq 'flutter' -and $script:dragonHandledFlightSerial-eq 0) 'real-throw-remains-airborne-and-cannot-land-early'
$script:petNativeMotion.Flying=$false;$script:petNativeMotion.StopReason='rested';$script:petNativeMotion.CompletedFlightSerial=1;Tick-DragonAnimation
Check ($script:dragonClip-eq 'draglanding' -and $script:dragonFrameIndex-eq 0 -and $script:dragonHandledFlightSerial-eq 1) 'real-rest-starts-one-landing'
$serial=$script:dragonClipSerial;Tick-DragonAnimation;Check ($script:dragonClipSerial-eq $serial) 'rest-heartbeats-do-not-restart-landing'
foreach($reason in @('released','interrupted','unknown')){
 Reset-Physical;Tick-DragonAnimation;$script:petNativeMotion.Dragging=$false;$script:petNativeMotion.FlightSerial=1;$script:petNativeMotion.StopReason=$reason;Tick-DragonAnimation
 Check ($script:dragonClip-ne 'draglanding') ('non-rest-end-not-landing-'+$reason)
}
Reset-Physical;$script:petNativeMotion.Dragging=$false;$script:petNativeMotion.FlightSerial=1;$script:petNativeMotion.CompletedFlightSerial=1;$script:petNativeMotion.StopReason='rested';Tick-DragonAnimation
Check ($script:dragonClip-eq 'draglanding') 'complete-flight-between-animation-ticks-is-not-lost'
Reset-Physical;$script:petNativeMotion.Dragging=$false;$script:petNativeMotion.FlightSerial=2;$script:petNativeMotion.CompletedFlightSerial=1;$script:petNativeMotion.StopReason='rested';Tick-DragonAnimation
Check ($script:dragonClip-ne 'draglanding') 'old-completion-cannot-certify-new-flight'
foreach($reason in @('menu','touch','click-settle')){
 Reset-Physical;$script:petNativeMotion.Dragging=$false;$script:petNativeMotion.FlightSerial=1;$script:petNativeMotion.CompletedFlightSerial=1;$script:petNativeMotion.StopReason='rested'
 $script:dragonManualReason=$reason;$script:dragonManualPhase='happy';$script:dragonManualUntil=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()+10000;Tick-DragonAnimation
 Check ($script:dragonClip-eq 'happy') ('new-response-wins-over-completion-'+$reason)
}
Reset-Physical;$script:petNativeMotion.Dragging=$false;$script:petNativeMotion.FlightSerial=1;$script:petNativeMotion.CompletedFlightSerial=1;$script:petNativeMotion.StopReason='rested';$script:dragonAnimationEnabled=$false;Tick-DragonAnimation
$script:dragonAnimationEnabled=$true;Tick-DragonAnimation;Check ($script:dragonClip-ne 'draglanding') 'disabled-period-completion-not-replayed-later'
$vectors=[IO.File]::ReadAllText((Join-Path $Package 'deepseek-reference.json'))|ConvertFrom-Json
foreach($v in $vectors){
 $actual=[PetNativeMotion]::Estimate([double[]]@($v.trail|ForEach-Object{$_.t}),[double[]]@($v.trail|ForEach-Object{$_.x}),[double[]]@($v.trail|ForEach-Object{$_.y}),[double]$v.now)
 if($null-eq $v.want){Check ($null-eq $actual) ('deepseek-null-'+$v.speed+'-'+$v.pause+'-'+$v.angle)}else{Check ($actual -and [Math]::Abs($actual.Vx-$v.want.vx)-lt 0.00001 -and [Math]::Abs($actual.Vy-$v.want.vy)-lt 0.00001) ('deepseek-velocity-'+$v.speed+'-'+$v.pause+'-'+$v.angle)}
}
Stop-DragonAnimation
# The real controller owns episode certification; this window remains offscreen.
$w=[Windows.Window]::new();$w.Width=30;$w.Height=30;$w.Left=-20000;$w.Top=-20000;$w.ShowInTaskbar=$false;$w.ShowActivated=$false;$girl=[Windows.Controls.Image]::new();$w.Content=$girl;$w.Show()
$motion=[PetNativeMotion]::new($w,$girl);$box=[PetMotionBox]::new();$box.MinX=-21000;$box.MaxX=-19000;$box.MinY=-21000;$box.MaxY=-20000
$motion.Launch(-20000,-20000,0,0,$box,1.5);Check ($motion.FlightSerial-eq 1 -and $motion.CompletedFlightSerial-eq 0) 'native-launch-creates-uncompleted-episode'
$until=[DateTime]::UtcNow.AddSeconds(3);while($motion.Flying -and [DateTime]::UtcNow-lt $until){[Threading.Thread]::Sleep(8);$motion.Pulse()}
Check (!$motion.Flying -and $motion.StopReason-eq 'rested' -and $motion.CompletedFlightSerial-eq 1) 'native-physical-rest-certifies-episode'
$motion.Launch(-20000,-20000,800,0,$box,1.5);$motion.Stop();Check ($motion.FlightSerial-eq 2 -and $motion.CompletedFlightSerial-eq 1 -and $motion.StopReason-eq 'interrupted') 'native-interruption-does-not-certify-next-episode'
$w.Close()
$r=@{ok=$true;count=$checks.Count;deepseekTrajectories=$vectors.Count;checks=@($checks.ToArray());paidCalls=0;settingsWritten=$false;userMouseMoved=$false}
[IO.File]::WriteAllText((Join-Path $Package 'physical-tests.json'),($r|ConvertTo-Json -Depth 4),[Text.UTF8Encoding]::new($false));@{ok=$true;count=$checks.Count;deepseekTrajectories=$vectors.Count}|ConvertTo-Json
