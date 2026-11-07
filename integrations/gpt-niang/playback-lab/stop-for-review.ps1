param([Parameter(Mandatory=$true)][string]$Baseline,[int]$ExpectedPid,[int]$CandidatePid,[string]$CandidateVisibleFile,[switch]$AllowTaskDisplay,[string]$LabRoot)
$ErrorActionPreference='Stop'
$lab=if($LabRoot){[IO.Path]::GetFullPath($LabRoot)}else{[IO.Path]::GetFullPath((Join-Path $Baseline '../../integrations/gpt-niang/playback-lab'))}
. ([ScriptBlock]::Create([IO.File]::ReadAllText((Join-Path $lab 'review-handoff.ps1'))))
$b=Get-Content (Join-Path $Baseline 'baseline.json') -Raw -Encoding UTF8|ConvertFrom-Json
$root=[IO.Path]::GetFullPath($b.gptRoot);$data='$env:LOCALAPPDATA/GPTNiangUsage/state'
foreach($f in $b.gptFiles){if((Get-FileHash -LiteralPath (Join-Path $root $f.target)).Hash-ne $f.sha256){throw 'Baseline drift'}}
$presence=Get-Content (Join-Path $data 'presence.json') -Raw -Encoding UTF8|ConvertFrom-Json
if([int]$presence.pid-ne $ExpectedPid -or [Math]::Abs([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()-[long]$presence.at)-gt 6000){throw 'Stale or replaced widget'}
if((!$AllowTaskDisplay -and $presence.dragonMotion.phase-in @('thinking','working','waiting')) -or $presence.motion.active -or $presence.scene.open -or $presence.music.enabled -or $presence.character.galleryOpen){throw 'Widget is busy; no stop requested'}
foreach($part in @($presence.sound.press,$presence.sound.release)){if($part.configured -and $part.active){throw 'Widget audio active'}}
$process=Get-CimInstance Win32_Process -Filter ('ProcessId='+$ExpectedPid)
if(!$process -or $process.Name-notin @('powershell.exe','pwsh.exe') -or $process.CommandLine.IndexOf($root,[StringComparison]::OrdinalIgnoreCase)-lt 0 -or $process.CommandLine-notmatch '(start-widget|widget)\.ps1'){throw 'Process identity mismatch'}
$flag=Join-Path $data 'stop.flag';if(Test-Path -LiteralPath $flag){throw 'Another stop request exists'}
$requestedAt=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$nonce='playback-review-'+[Guid]::NewGuid().ToString('N');[IO.File]::WriteAllText($flag,$nonce)
try{
 $clock=[Diagnostics.Stopwatch]::StartNew()
 do{
  $current=Get-CimInstance Win32_Process -Filter ('ProcessId='+$ExpectedPid)
  if(!$current -or $current.CreationDate-ne $process.CreationDate){[pscustomobject]@{ok=$true;stoppedPid=$ExpectedPid;forced=$false;processExited=$true}|ConvertTo-Json;return}
  # The old UI can release its official mutex before PowerShell finishes
  # background cleanup. A verified new owner proves the display handoff.
  if($CandidatePid-gt 0 -and $CandidateVisibleFile -and [IO.File]::Exists($CandidateVisibleFile)){
   $v=[IO.File]::ReadAllText($CandidateVisibleFile)|ConvertFrom-Json
   $key='Local\GPTNiangUsage_'+([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($root))).Replace('/','_').Replace('+','-')
   $sha=[Security.Cryptography.SHA256]::Create();try{$expectedKey=[BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($key))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
   $candidate=Get-CimInstance Win32_Process -Filter ('ProcessId='+$CandidatePid)
   if((Test-ReviewDisplayTicket $v $CandidatePid $expectedKey $requestedAt) -and $candidate -and $candidate.Name-eq 'electron.exe' -and ($candidate.CommandLine.Contains('review-video.cjs') -or $candidate.CommandLine.Contains('desktop-main.cjs'))){
    [pscustomobject]@{ok=$true;stoppedPid=$ExpectedPid;forced=$false;processExited=$false;displayOwnershipReleased=$true;cleanupPending=$true}|ConvertTo-Json;return
   }
  }
  Start-Sleep -Milliseconds 100
 }while($clock.ElapsedMilliseconds-lt 8000)
 throw 'Widget did not exit gracefully; no process was killed'
}finally{if([IO.File]::Exists($flag) -and [IO.File]::ReadAllText($flag)-eq $nonce){Remove-Item -LiteralPath $flag}}
