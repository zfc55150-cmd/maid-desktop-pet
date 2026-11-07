param([Parameter(Mandatory=$true)][string]$Baseline,[string]$LabRoot=$PSScriptRoot)
$ErrorActionPreference='Stop';$Baseline=[IO.Path]::GetFullPath($Baseline)
if(!$LabRoot){$LabRoot=Join-Path (Get-Location) 'integrations/gpt-niang/playback-lab'}
Add-Type -AssemblyName PresentationFramework,PresentationCore,WindowsBase
$b=Get-Content (Join-Path $Baseline 'baseline.json') -Raw -Encoding UTF8|ConvertFrom-Json
$m=Get-Content (Join-Path $Baseline 'animation.json') -Raw -Encoding UTF8|ConvertFrom-Json
foreach($f in $b.gptFiles){if((Get-FileHash -LiteralPath (Join-Path $b.gptRoot $f.target)).Hash-ne $f.sha256){throw ('Installed baseline drift: '+$f.target)}}
$refs=@('System.dll','System.Core.dll',[Windows.Controls.Image].Assembly.Location,[Windows.Media.Imaging.BitmapSource].Assembly.Location,[Windows.Rect].Assembly.Location,[Windows.Markup.IUriContext].Assembly.Location)
$code=[IO.File]::ReadAllText((Join-Path $Baseline 'baseline-decoder.cs'))+"`n"+[IO.File]::ReadAllText((Join-Path $LabRoot 'CompiledPlayer.cs'))
$code+="`n"+[IO.File]::ReadAllText((Join-Path $LabRoot 'SourceMetrics.cs'))
# Keep the baseline source's using directives at compilation-unit scope.
$lines=$code -split "`n";$usings=@($lines|Where-Object {$_ -match '^using ' }|Select-Object -Unique)
$body=@($lines|Where-Object {$_ -notmatch '^using '})
Add-Type -TypeDefinition (($usings+$body)-join "`n") -ReferencedAssemblies $refs
function Clip([string]$name){
 $s=$m.states.$name;if(!$s){throw 'Missing clip'}
 $c=New-Object PlaybackLab.Clip;$c.Name=$name;$c.Frames=$s.frames;$c.Cell=$m.cellSize;$c.Fps=$s.fps;$c.Loop=$s.loop
 $v=$m.clipPresentation.$name;if($v){$c.Scale=$v.scale;$c.OffsetX=$v.offsetX;$c.OffsetY=$v.offsetY}
 $pages=@();foreach($p in $s.pages){$q=New-Object PlaybackLab.Page;$q.File=Join-Path $b.gptRoot ('assets/dragon-animation/motion-v1/'+$p.file);$q.Hash=$p.sha256;$q.Rows=$p.rows;$q.Start=$p.start;$q.Count=$p.count;$pages+=$q};$c.Pages=[PlaybackLab.Page[]]$pages;return $c
}
function Pump($task){
 $clock=[Diagnostics.Stopwatch]::StartNew()
 while(!$task.IsCompleted){if($clock.Elapsed.TotalSeconds-gt 30){throw 'Candidate timeout'};$frame=New-Object Windows.Threading.DispatcherFrame;[Windows.Threading.Dispatcher]::CurrentDispatcher.BeginInvoke([Windows.Threading.DispatcherPriority]::Background,[Action]{$frame.Continue=$false})|Out-Null;[Windows.Threading.Dispatcher]::PushFrame($frame);Start-Sleep -Milliseconds 2}
 return $task.GetAwaiter().GetResult()
}
function HashPixels($image){$pixels=New-Object byte[] ($image.PixelWidth*$image.PixelHeight*4);$image.CopyPixels($pixels,$image.PixelWidth*4,0);$h=[Security.Cryptography.SHA256]::Create();try{return [BitConverter]::ToString($h.ComputeHash($pixels))}finally{$h.Dispose()}}
function Assert($ok,$name){if(!$ok){throw ('Check failed: '+$name)}}
