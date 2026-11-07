param([Parameter(Mandatory=$true)][string]$Baseline,[string]$ClipName='frontidle')
$ErrorActionPreference='Stop';$Baseline=[IO.Path]::GetFullPath($Baseline)
$project=[IO.Path]::GetFullPath((Join-Path $Baseline '../..'))
if($ClipName-notmatch '^[a-z]+$'){throw 'Invalid clip name'}
$out=Join-Path $Baseline ($ClipName+'-control.webm');if(Test-Path $out){throw 'Control output exists'}
Add-Type -AssemblyName PresentationFramework,PresentationCore,WindowsBase
if(!('DragonMotionDecoder'-as [type])){Add-Type -TypeDefinition ([IO.File]::ReadAllText((Join-Path $Baseline 'baseline-decoder.cs'))) -ReferencedAssemblies @('System.dll','System.Core.dll',[Windows.Media.Imaging.BitmapSource].Assembly.Location,[Windows.Rect].Assembly.Location,[Windows.Markup.IUriContext].Assembly.Location)}
$b=Get-Content (Join-Path $Baseline 'baseline.json') -Raw -Encoding UTF8|ConvertFrom-Json
$m=Get-Content (Join-Path $Baseline 'animation.json') -Raw -Encoding UTF8|ConvertFrom-Json
$s=$m.states.$ClipName;$v=$m.clipPresentation.$ClipName
if(!$s -or $s.fps-ne 30 -or $m.cellSize-ne 384){throw 'Unsupported control layout'}
$ff=Join-Path $project 'work/gpt-niang-animation/video-tools/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe'
$args='-hide_banner -loglevel error -f rawvideo -pix_fmt bgra -s 384x384 -r 30 -i pipe:0 -an -c:v libvpx-vp9 -pix_fmt yuva420p -crf 12 -b:v 0 -auto-alt-ref 0 -row-mt 1 -threads 2 -deadline good -cpu-used 3 "'+$out+'"'
$info=New-Object Diagnostics.ProcessStartInfo;$info.FileName=$ff;$info.Arguments=$args;$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardInput=$true;$info.RedirectStandardError=$true
$proc=[Diagnostics.Process]::Start($info);$errors=$proc.StandardError.ReadToEndAsync();$hash=[Security.Cryptography.SHA256]::Create();$frameHashes=@()
try{
 foreach($p in $s.pages){
  $file=Join-Path $b.gptRoot ('assets/dragon-animation/motion-v1/'+$p.file)
  $scale=1.0;$x=0.0;$y=0.0;if($v){$scale=$v.scale;$x=$v.offsetX;$y=$v.offsetY}
  $atlas=[DragonMotionDecoder]::LoadAsync($file,384,[int]$p.rows,[string]$p.sha256,$scale,$x,$y).GetAwaiter().GetResult()
  for($n=0;$n-lt $p.count;$n++){
   $frame=[DragonMotionDecoder]::Crop($atlas,384,$n);$pixels=New-Object byte[] (384*384*4);$frame.CopyPixels($pixels,384*4,0)
   $frameHashes+=[BitConverter]::ToString($hash.ComputeHash($pixels)).Replace('-','').ToLowerInvariant();$proc.StandardInput.BaseStream.Write($pixels,0,$pixels.Length)
  }
 }
}finally{$proc.StandardInput.Close();$hash.Dispose()}
if(!$proc.WaitForExit(120000)){throw 'Encoder timeout'}
if($proc.ExitCode-ne 0){throw ('Local encoder failed: '+$errors.GetAwaiter().GetResult())}
$r=@{source=('frozen installed '+$ClipName+'; post-calibration BGRA');clip=$ClipName;frames=$frameHashes.Count;inputFrameSha256=$frameHashes;canvas=@(384,384);fps=30;arguments=$args;fileSha256=(Get-FileHash $out).Hash.ToLowerInvariant();bytes=(Get-Item $out).Length;encodingIsLossless=$false;chroma='4:2:0';paidCalls=0;newArtworkGenerated=$false;formalInstallChanged=$false}
$reportName=if($ClipName-eq 'frontidle'){'encoding-control.json'}else{$ClipName+'-encoding.json'}
[IO.File]::WriteAllText((Join-Path $Baseline $reportName),($r|ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
[pscustomobject]$r|Select-Object frames,bytes,encodingIsLossless,paidCalls|ConvertTo-Json
