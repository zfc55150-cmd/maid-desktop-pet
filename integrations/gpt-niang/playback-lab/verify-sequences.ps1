param([Parameter(Mandatory=$true)][string]$Baseline,[string]$LabRoot=$PSScriptRoot)
$ErrorActionPreference='Stop'
if(!$LabRoot){$LabRoot=Join-Path (Get-Location) 'integrations/gpt-niang/playback-lab'}
. ([ScriptBlock]::Create([IO.File]::ReadAllText((Join-Path $LabRoot 'lab-common.ps1')))) -Baseline $Baseline -LabRoot $LabRoot
function Step([string]$name,[double]$speed=1,[int]$fade=0,[bool]$takeoff=$false){$s=New-Object PlaybackLab.Step;$s.Clip=Clip $name;$s.Plan.Speed=$speed;$s.Plan.Takeoff=$takeoff;$s.FadeMs=$fade;return $s}
function PumpUntil($condition,[int]$timeout=20000){
 $watch=[Diagnostics.Stopwatch]::StartNew()
 while(!(& $condition)){
  if($watch.ElapsedMilliseconds-gt $timeout){throw 'SEQUENCE_TIMEOUT'}
  $f=New-Object Windows.Threading.DispatcherFrame
  [Windows.Threading.Dispatcher]::CurrentDispatcher.BeginInvoke([Windows.Threading.DispatcherPriority]::Background,[Action]{$f.Continue=$false})|Out-Null
  [Windows.Threading.Dispatcher]::PushFrame($f);Start-Sleep -Milliseconds 2
 }
}
$checks=New-Object 'System.Collections.Generic.List[string]'
function Check($value,$name){Assert $value $name;$checks.Add($name)}
# Verify every source index of the current installed piecewise takeoff mapping.
$plan=New-Object PlaybackLab.PlaybackPlan;$plan.Takeoff=$true;$air=Clip 'flutter'
foreach($ms in @(0,1,1199,1200,1201,2500,4200)){
 $media=if($ms-lt 1200){$ms*(66*1000.0/$air.Fps/1200.0)}else{66*1000.0/$air.Fps+($ms-1200)*1.25}
 $expected=[Math]::Min($air.Frames-1,[int][Math]::Floor($media*$air.Fps/1000))
 Check ($plan.Frame($ms,$air)-eq $expected) ('takeoff-native-timeline-'+$ms)
}
Check ($plan.Frame(1200,$air)-eq 66) 'takeoff-airborne-boundary'
$cache=New-Object PlaybackLab.PageCache(108MB);$image=New-Object Windows.Controls.Image;$player=New-Object PlaybackLab.Player($image,$cache)
# Real original-speed performance and native return, without accelerating the source.
$sequence=[PlaybackLab.Step[]]@((Step 'proudarms'),(Step 'proudarmsreturn'),(Step 'frontidle'))
Check (Pump ($player.PlaySequence($sequence))) 'chain-started'
PumpUntil {$player.ClipName-eq 'frontidle'}
$chainTrace=$player.Trace
foreach($name in @('proudarms','proudarmsreturn')){
 $frames=@($chainTrace|Where-Object Clip -eq $name)
 Check ($frames[0].Frame-eq 0 -and $frames[-1].Frame-eq 179) ('chain-preserves-first-and-final-'+$name)
 Check ($frames[-1].AtMs-$frames[0].AtMs-ge 5900) ('chain-native-duration-'+$name)
}
Check (!$player.Blending) 'declared-zero-fade-preserved'
# Start return chain then replace it while the first action is pending/playing.
$old=$player.PlaySequence([PlaybackLab.Step[]]@((Step 'proudarms'),(Step 'proudarmsreturn'),(Step 'frontidle')))
$new=$player.PlaySequence([PlaybackLab.Step[]]@((Step 'walking' 1 180)))
$null=Pump $old;Check (Pump $new) 'interrupt-new-action-accepted'
$boundary=$player.Trace[-1].AtMs
PumpUntil {!$player.Blending}
Check ($player.ClipName-eq 'walking') 'interrupted-chain-cannot-return-over-new-action'
Check (@($player.Trace|Where-Object {$_.AtMs-gt $boundary -and $_.Clip-in @('proudarms','proudarmsreturn')}).Count-eq 0) 'old-chain-has-no-late-submissions'
# Piecewise takeoff followed by landing at the installed 1.2x speed.
$null=Pump ($player.PlaySequence([PlaybackLab.Step[]]@((Step 'flutter' 1 80 $true))))
PumpUntil {$player.Frame-ge 85}
$releaseFrame=$player.Frame
Check (Pump ($player.PlaySequence([PlaybackLab.Step[]]@((Step 'draglanding' 1.2 80),(Step 'frontidle' 1 80))))) 'airborne-release-starts-landing'
PumpUntil {$player.ClipName-eq 'frontidle'}
$landing=@($player.Trace|Where-Object Clip -eq 'draglanding')
Check ($landing[0].Frame-eq 0 -and $landing[-1].Frame-eq 179) 'landing-completes-full-source'
Check ($landing[-1].AtMs-$landing[0].AtMs-ge 4900 -and $landing[-1].AtMs-$landing[0].AtMs-lt 6000) 'landing-retains-1point2-rate'
# Explicit interruption must suppress even a warmed automatic return.
$null=Pump ($player.PlaySequence([PlaybackLab.Step[]]@((Step 'proudarms'),(Step 'proudarmsreturn'))))
$player.Interrupt();$count=$player.Submitted
$wait=[Diagnostics.Stopwatch]::StartNew();PumpUntil {$wait.ElapsedMilliseconds-ge 200}
Check ($player.Submitted-eq $count -and $null-eq $player.ClipName) 'interrupt-freezes-and-cancels-chain'
$player.Dispose();Check ($null-eq $image.Source) 'dispose-releases-image'
$r=@{ok=$true;checks=$checks.ToArray();releasedFlutterFrame=$releaseFrame;trace=$player.Trace;sourceVersion=$b.gptVersion;sourceSha256=(Get-FileHash (Join-Path $LabRoot 'CompiledPlayer.cs')).Hash.ToLowerInvariant();screenPresentationVerified=$false;inputLatencyVerified=$false;nativeWindowPhysicsVerified=$false;releaseEligibility='synthetic scenario; production eligibility not replaced';personalSettingsWritten=$false}
[IO.File]::WriteAllText((Join-Path $Baseline 'sequence-verification.json'),($r|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
[pscustomobject]@{ok=$true;checks=$checks.Count;releasedFlutterFrame=$releaseFrame;submissions=$player.Submitted}|ConvertTo-Json
