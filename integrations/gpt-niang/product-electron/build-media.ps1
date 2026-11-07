param([Parameter(Mandatory=$true)][string]$Package,[Parameter(Mandatory=$true)][string[]]$Clips,[string]$ProjectRoot=(Get-Location).Path)
$ErrorActionPreference='Stop'
$Package=[IO.Path]::GetFullPath($Package)
$project=[IO.Path]::GetFullPath($ProjectRoot)
if(!$Package.StartsWith((Join-Path $project 'work')+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'WORK_SCOPE'}
$b=Get-Content (Join-Path $Package 'baseline.json') -Raw -Encoding UTF8|ConvertFrom-Json
$m=Get-Content (Join-Path $Package 'animation.json') -Raw -Encoding UTF8|ConvertFrom-Json
Add-Type -AssemblyName PresentationFramework,PresentationCore,WindowsBase
if(!('DragonMotionDecoder'-as [type])){Add-Type -TypeDefinition ([IO.File]::ReadAllText((Join-Path $Package 'baseline-decoder.cs'))) -ReferencedAssemblies @('System.dll','System.Core.dll',[Windows.Media.Imaging.BitmapSource].Assembly.Location,[Windows.Rect].Assembly.Location,[Windows.Markup.IUriContext].Assembly.Location)}
$ff=Join-Path $project 'work/gpt-niang-animation/video-tools/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe'
$dest=Join-Path $Package 'media';$null=[IO.Directory]::CreateDirectory($dest)
foreach($name in $Clips){
 if($name-notmatch '^[a-z]+$' -or !$m.states.PSObject.Properties[$name]){throw 'INVALID_CLIP'}
 $s=$m.states.$name;$v=$m.clipPresentation.$name;$fps=if($s.fps){[int]$s.fps}else{[int]$m.fps}
 if($fps-ne 30 -or $m.cellSize-ne 384){throw 'UNSUPPORTED_TIMELINE'}
 $file=Join-Path $dest ($name+'.webm');if(Test-Path -LiteralPath $file){throw ('EXISTING_MEDIA:'+ $name)}
 $info=[Diagnostics.ProcessStartInfo]::new();$info.FileName=$ff;$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardInput=$true;$info.RedirectStandardError=$true
 $info.Arguments='-hide_banner -loglevel error -f rawvideo -pix_fmt bgra -s 384x384 -r '+$fps+' -i pipe:0 -an -c:v libvpx-vp9 -pix_fmt yuva420p -crf 12 -b:v 0 -auto-alt-ref 0 -row-mt 1 -threads 2 -deadline good -cpu-used 3 "'+$file+'"'
 $process=[Diagnostics.Process]::Start($info);$errors=$process.StandardError.ReadToEndAsync();$hash=[Security.Cryptography.SHA256]::Create();$inputs=[Collections.Generic.List[string]]::new();$pixels=[byte[]]::new(384*384*4)
 try{
  foreach($page in $s.pages){
   $source=Join-Path $b.gptRoot ('assets/dragon-animation/motion-v1/'+$page.file)
   if((Get-FileHash -LiteralPath $source).Hash.ToLowerInvariant()-ne $page.sha256){throw 'SOURCE_DRIFT'}
   $scale=1.0;$x=0.0;$y=0.0;if($v){$scale=$v.scale;$x=$v.offsetX;$y=$v.offsetY}
   $atlas=[DragonMotionDecoder]::LoadAsync($source,384,[int]$page.rows,[string]$page.sha256,$scale,$x,$y).GetAwaiter().GetResult()
   for($n=0;$n-lt $page.count;$n++){$frame=[DragonMotionDecoder]::Crop($atlas,384,$n);$frame.CopyPixels($pixels,384*4,0);$inputs.Add([BitConverter]::ToString($hash.ComputeHash($pixels)).Replace('-','').ToLowerInvariant());$process.StandardInput.BaseStream.Write($pixels,0,$pixels.Length)}
  }
 }finally{$process.StandardInput.Close();$hash.Dispose()}
 if(!$process.WaitForExit(120000) -or $process.ExitCode-ne 0){throw ('ENCODING_FAILED:'+ $name)}
 if($inputs.Count-ne $s.frames){throw 'FRAME_COUNT'}
 $receipt=@{clip=$name;frames=$inputs.Count;fps=$fps;source='current installed post-calibration BGRA';inputFrameSha256=@($inputs);fileSha256=(Get-FileHash -LiteralPath $file).Hash.ToLowerInvariant();bytes=([IO.FileInfo]$file).Length;arguments=$info.Arguments;lossless=$false;newArtwork=$false;paidCalls=0;sourcePages=$s.pages}
 [IO.File]::WriteAllText((Join-Path $dest ($name+'.encoding.json')),($receipt|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
 [pscustomobject]@{clip=$name;frames=$inputs.Count;bytes=$receipt.bytes}|ConvertTo-Json -Compress
}
