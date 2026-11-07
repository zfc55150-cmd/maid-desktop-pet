param([Parameter(Mandatory=$true)][string]$Baseline,[string]$LabRoot=$PSScriptRoot)
$ErrorActionPreference='Stop'
if(!$LabRoot){$LabRoot=Join-Path (Get-Location) 'integrations/gpt-niang/playback-lab'}
. ([ScriptBlock]::Create([IO.File]::ReadAllText((Join-Path $LabRoot 'lab-common.ps1')))) -Baseline $Baseline -LabRoot $LabRoot
$cache=New-Object PlaybackLab.PageCache(108MB)
$selected=@('frontidle','proudarms','proudarmsreturn','flutter','draglanding','walking','fanmishap')
$pageResults=@();$pixelChecks=0
foreach($name in $selected){
 $c=Clip $name
 for($n=0;$n-lt $c.Pages.Length;$n++){
  $p=$c.Pages[$n];$clock=[Diagnostics.Stopwatch]::StartNew();$atlas=$cache.Request($c,$n).GetAwaiter().GetResult();$ms=$clock.Elapsed.TotalMilliseconds
  $original=[DragonMotionDecoder]::LoadAsync($p.File,$c.Cell,$p.Rows,$p.Hash,$c.Scale,$c.OffsetX,$c.OffsetY).GetAwaiter().GetResult()
  Assert ((HashPixels $atlas)-eq (HashPixels $original)) 'post-calibration atlas identity'
  # Exercise real cells on both sides of each page boundary, including partial final pages.
  foreach($index in @(0,($p.Count-1))){$frame=[DragonMotionDecoder]::Crop($atlas,$c.Cell,$index);$ref=[DragonMotionDecoder]::Crop($original,$c.Cell,$index);Assert ((HashPixels $frame)-eq (HashPixels $ref)) 'cell identity';$pixelChecks++}
  $pageResults+=@{clip=$name;page=$n;loadMs=$ms;bytes=$cache.Bytes}
  Assert ($cache.Bytes-le 108MB) 'byte budget'
 }
}
$bad=Clip 'frontidle';$bad.Name='bad';$bad.Pages[0].Hash=('0'*64)
$failed=$false;try{$null=$cache.Request($bad,0).GetAwaiter().GetResult()}catch{$failed=$true};Assert $failed 'bad hash rejected';Assert ($cache.Pending-eq 0) 'failed request drained'
Assert ($null-ne $cache.Request((Clip 'frontidle'),0).GetAwaiter().GetResult()) 'recovery after failed load'
Assert ([PlaybackLab.Player]::FrameAt(63999/30,30,180,$false,1)-eq 63) 'pre-page boundary'
Assert ([PlaybackLab.Player]::FrameAt(64001/30,30,180,$false,1)-eq 64) 'post-page boundary'
Assert ([PlaybackLab.Player]::FrameAt(6000,30,180,$true,1)-eq 0) 'loop wrap'
Assert ([PlaybackLab.Player]::FrameAt(99999,30,180,$false,1)-eq 179) 'one-shot end'
$image=New-Object Windows.Controls.Image
$player=New-Object PlaybackLab.Player($image,$cache)
$old=$player.Play((Clip 'walking'),1);$middle=$player.Play((Clip 'proudarmsreturn'),1);$new=$player.Play((Clip 'draglanding'),1.2)
$oldAccepted=Pump $old;$middleAccepted=Pump $middle;$accepted=Pump $new
Assert (!$oldAccepted -and !$middleAccepted) 'superseded requests cannot commit'
Assert $accepted 'new request accepted even when two slots are occupied';Assert ($player.ClipName-eq 'draglanding') 'new request owns image'
$null=Pump ($player.Play((Clip 'frontidle'),1))
$trace=@();$run=[Diagnostics.Stopwatch]::StartNew();$previous=-1
while($run.Elapsed.TotalMilliseconds-lt 12200){
 $dispatchFrame=New-Object Windows.Threading.DispatcherFrame
 [Windows.Threading.Dispatcher]::CurrentDispatcher.BeginInvoke([Windows.Threading.DispatcherPriority]::Background,[Action]{$dispatchFrame.Continue=$false})|Out-Null
 [Windows.Threading.Dispatcher]::PushFrame($dispatchFrame)
 if($player.Frame-ne $previous){$trace+=@{atMs=$run.Elapsed.TotalMilliseconds;frame=$player.Frame};$previous=$player.Frame}
 Start-Sleep -Milliseconds 2
}
Assert (64-in $trace.frame -and 128-in $trace.frame) 'real timed cross-page playback'
Assert (@($trace|Where-Object frame -eq 0).Count-ge 2) 'real timed loop playback'
$timed=@{durationMs=$run.Elapsed.TotalMilliseconds;trace=$trace;submitted=$player.Submitted;pageMissPulses=$player.Misses;skippedSourceIndices=$player.Skipped;screenPresentationVerified=$false}
$later=$player.Play((Clip 'proudarmsreturn'),1);$player.Dispose();$null=Pump $later
Assert ($null-eq $image.Source) 'late load cannot draw after dispose'
$report=@{ok=$true;mode='isolated-unshown-Image';baselineVersion=$b.gptVersion;candidateSha256=(Get-FileHash (Join-Path $LabRoot 'CompiledPlayer.cs')).Hash.ToLowerInvariant();pixelChecks=$pixelChecks;pageLoads=$pageResults;timedPlayback=$timed;cachePeakBytes=$cache.PeakBytes;cacheBudgetBytes=108MB;evictions=$cache.Evictions;pending=$cache.Pending;screenPresentationVerified=$false;inputLatencyVerified=$false;artworkAccepted=$false;installedChanged=$false;paidCalls=0}
[IO.File]::WriteAllText((Join-Path $Baseline 'candidate-verification.json'),($report|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
[pscustomobject]$report|Select-Object ok,mode,pixelChecks,cachePeakBytes,evictions,pending|ConvertTo-Json
