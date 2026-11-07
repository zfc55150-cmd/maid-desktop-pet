param([Parameter(Mandatory=$true)][string]$Out,[int]$Seconds=20,[string]$LabRoot=$PSScriptRoot)
$ErrorActionPreference='Stop'
if(!$LabRoot){$LabRoot=Join-Path (Get-Location) 'integrations/gpt-niang/playback-lab'}
$Out=[IO.Path]::GetFullPath($Out)
if(Test-Path -LiteralPath $Out){throw 'Fresh output directory required'}
$project=[IO.Path]::GetFullPath((Join-Path $LabRoot '../../..'))
$g='$env:LOCALAPPDATA/Programs/GPTNiangUsage/gpt-niang-usage'
$d='$env:LOCALAPPDATA/Programs/DeepSeekActionPet'
$state='$env:LOCALAPPDATA/GPTNiangUsage/state'
function Sha($p){(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
function Save($name,$value){[IO.File]::WriteAllText((Join-Path $Out $name),($value|ConvertTo-Json -Depth 15),[Text.UTF8Encoding]::new($false))}
$receiptPath=Join-Path $project 'work/gpt-gentle-takeoff-20261102-01/live-install.json'
$manifestPath=Join-Path $project 'work/gpt-gentle-takeoff-20261102-01/deployment.json'
$gm=Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8|ConvertFrom-Json
$dm=Get-Content -LiteralPath (Join-Path $project 'deployment.json') -Raw -Encoding UTF8|ConvertFrom-Json
$checks=@();foreach($f in @($gm.files)+@($gm.hostFiles)){
 $actual=Sha (Join-Path $g $f.target);if($actual-ne $f.sha256){throw ('GPT baseline drift: '+$f.target)}
 $checks+=@{target=$f.target;sha256=$actual}
}
foreach($f in $dm.files){if((Sha (Join-Path $d $f.target))-ne $f.sha256 -or (Sha (Join-Path $project $f.source))-ne $f.sha256){throw ('DeepSeek baseline drift: '+$f.target)}}
[IO.Directory]::CreateDirectory($Out)|Out-Null
$animation=Join-Path $g 'runtime/dragon-animation/animation.json'
Copy-Item -LiteralPath $animation -Destination (Join-Path $Out 'animation.json')
Copy-Item -LiteralPath (Join-Path $g 'runtime/dragon-animation/motion-decoder.cs') -Destination (Join-Path $Out 'baseline-decoder.cs')
$presence=Get-Content -LiteralPath (Join-Path $state 'presence.json') -Raw -Encoding UTF8|ConvertFrom-Json
$widgetId=[int]$presence.pid
$proc=Get-Process -Id $widgetId
Add-Type @'
using System;using System.Runtime.InteropServices;
public static class LabWindowProbe {
 [StructLayout(LayoutKind.Sequential)]public struct Rect{public int Left,Top,Right,Bottom;}
 [DllImport("user32.dll")]public static extern bool GetWindowRect(IntPtr h,out Rect r);
 [DllImport("user32.dll")]public static extern uint GetDpiForWindow(IntPtr h);
}
'@
$rect=New-Object LabWindowProbe+Rect
$handle=$proc.MainWindowHandle
$geometry=$null
if($handle-ne [IntPtr]::Zero -and [LabWindowProbe]::GetWindowRect($handle,[ref]$rect)){
 $geometry=@{left=$rect.Left;top=$rect.Top;right=$rect.Right;bottom=$rect.Bottom;dpi=[LabWindowProbe]::GetDpiForWindow($handle)}
}
Save 'baseline.json' @{at=[DateTimeOffset]::Now.ToString('o');gptVersion=$gm.version;deepseekVersion=$dm.version;gptRoot=$g;gptFiles=$checks;deepseekFiles=$dm.files;receiptSha256=(Sha $receiptPath);receipt=(Get-Content $receiptPath -Raw -Encoding UTF8|ConvertFrom-Json);pid=$widgetId;window=$geometry;screenPresentationVerified=$false;characterPhysicalHeightVerified=$false;refreshRateVerified=$false;paidCalls=0;formalInstallChanged=$false}
$samples=@();$clock=[Diagnostics.Stopwatch]::StartNew()
while($clock.Elapsed.TotalSeconds-lt $Seconds){
 try{
  $p=Get-Content -LiteralPath (Join-Path $state 'presence.json') -Raw -Encoding UTF8|ConvertFrom-Json
  $a=Get-Content -LiteralPath (Join-Path $state 'animation-status.json') -Raw -Encoding UTF8|ConvertFrom-Json
  $proc.Refresh()
  $samples+=@{sampleMs=$clock.Elapsed.TotalMilliseconds;presenceAt=$p.at;pid=$p.pid;dragonMotion=$p.dragonMotion;clip=$a.clip;frame=$a.frame;targetFps=$a.targetFps;reportedFps=$a.measuredFps;cachedPages=$a.cachedPages;pendingLoads=$a.pendingLoads;paused=$a.paused;cpuSeconds=$proc.TotalProcessorTime.TotalSeconds;privateBytes=$proc.PrivateMemorySize64;workingSet=$proc.WorkingSet64}
 }catch{$samples+=@{sampleMs=$clock.Elapsed.TotalMilliseconds;readFailed=$true}}
 Start-Sleep -Milliseconds 500
}
# Recheck both baseline owners after sampling; never bless a concurrent replacement.
$drift=@();foreach($f in $checks){if((Sha (Join-Path $g $f.target))-ne $f.sha256){$drift+=$f.target}}
foreach($f in $dm.files){if((Sha (Join-Path $d $f.target))-ne $f.sha256){$drift+=('DeepSeek/'+$f.target)}}
Save 'passive-samples.json' @{durationMs=$clock.Elapsed.TotalMilliseconds;samples=$samples;endDrift=$drift;screenFpsCertified=$false;interpretation='Passive application telemetry only; no screen capture, input injection, or restart.'}
if($drift.Count){throw 'Concurrent installed update detected; rebase before candidate testing'}
Write-Output ('Baseline captured: '+$Out)
