param([string]$Report='work/gpt-drag-responsive-20261101-01/cost.json')
$ErrorActionPreference='Stop'
Add-Type -AssemblyName PresentationFramework,PresentationCore,WindowsBase
$root=Join-Path $env:LOCALAPPDATA 'Programs/GPTNiangUsage/gpt-niang-usage'
Add-Type -TypeDefinition ([IO.File]::ReadAllText((Join-Path $root 'runtime/dragon-animation/motion-decoder.cs'))) -ReferencedAssemblies @('System.dll','System.Core.dll',[Windows.Media.Imaging.BitmapSource].Assembly.Location,[Windows.Rect].Assembly.Location,[Windows.Markup.IUriContext].Assembly.Location)
$m=[IO.File]::ReadAllText((Join-Path $root 'runtime/dragon-animation/animation.json'))|ConvertFrom-Json
$load=@();$frames=@()
foreach($clip in @('flutter','draglanding')){
 $s=$m.states.$clip;$p=$s.pages[0];$v=$m.clipPresentation.$clip;$c=[Diagnostics.Stopwatch]::StartNew()
 $image=[DragonMotionDecoder]::LoadAsync((Join-Path $root ('assets/dragon-animation/motion-v1/'+$p.file)),384,[int]$p.rows,[string]$p.sha256,[double]$v.scale,[double]$v.offsetX,[double]$v.offsetY).GetAwaiter().GetResult()
 $load+=@{clip=$clip;ms=$c.Elapsed.TotalMilliseconds};$frames+=,[DragonMotionDecoder]::Crop($image,384,30)
}
$blend=@();$trim=@()
for($n=0;$n-lt 15;$n++){$c=[Diagnostics.Stopwatch]::StartNew();$null=[DragonMotionDecoder]::Blend($frames[0],$frames[1],0.5);$blend+=$c.Elapsed.TotalMilliseconds}
for($n=0;$n-lt 3;$n++){$c=[Diagnostics.Stopwatch]::StartNew();[DragonMotionDecoder]::TrimMemory($false);$trim+=$c.Elapsed.TotalMilliseconds}
$r=@{pageLoads=$load;blendMs=$blend;blockingTrimMs=$trim}
[IO.File]::WriteAllText([IO.Path]::GetFullPath($Report),($r|ConvertTo-Json -Depth 4),[Text.UTF8Encoding]::new($false));$r|ConvertTo-Json -Depth 4
