param([string]$Stage,[string]$Report,[string]$TestRoot)
$ErrorActionPreference='Stop';$stage=$Stage
if(!$TestRoot){$TestRoot=Join-Path $PSScriptRoot 'tests'}
Add-Type -AssemblyName PresentationFramework,PresentationCore,WindowsBase
$before=[IO.File]::ReadAllText((Join-Path $TestRoot 'blend-reference.cs')).Replace('class DragonMotionDecoder','class BaselineMotionDecoder')
$after=[IO.File]::ReadAllText((Join-Path $stage 'runtime/dragon-animation/motion-decoder.cs'))
$before=[regex]::Replace($before,'(?m)^using .*;\r?\n','')
$probe=[IO.File]::ReadAllText((Join-Path $TestRoot 'blend-probe.cs'))
Add-Type -TypeDefinition ($after+"`n"+$before+"`n"+$probe) -ReferencedAssemblies @('System.dll','System.Core.dll',[Windows.Media.Visual].Assembly.Location,[Windows.Rect].Assembly.Location,[Windows.Markup.IUriContext].Assembly.Location)
$null=. ([ScriptBlock]::Create([IO.File]::ReadAllText((Join-Path $stage 'widget.ps1')))) -CheckOnly -AppDir $stage
$script:dragonTestMode=$true;Initialize-WidgetSettingsMenu;Initialize-WidgetDesktopInteraction;Initialize-WidgetPetForms
$a=$script:petFormFullFrame.image;$page=Read-WidgetCharacterImage (Join-Path $stage 'assets/dragon-animation/motion-v1/heart-0.png')
$b=[Windows.Media.Imaging.CroppedBitmap]::new($page,[Windows.Int32Rect]::new(0,0,384,384));$b.Freeze()
$max=0;$checks=0
foreach($p in @(0,0.01,0.1,0.25,0.5,0.75,0.9,0.99,1)){$d=[BlendProbe]::Compare($a,$b,$p);$max=[Math]::Max($max,$d);if($d-gt 1){throw ('Pixel mismatch '+$d)};$checks++}
# Exercise fully transparent, unequal-alpha and equal-alpha paths, then replace
# same-sized inputs so stale cache content cannot pass by accident.
$random=[Random]::new(107);$pixels=New-Object byte[] (32*32*4);$random.NextBytes($pixels)
$c=[Windows.Media.Imaging.BitmapSource]::Create(32,32,96,96,[Windows.Media.PixelFormats]::Bgra32,$null,$pixels,128);$c.Freeze();$random.NextBytes($pixels)
$e=[Windows.Media.Imaging.BitmapSource]::Create(32,32,96,96,[Windows.Media.PixelFormats]::Bgra32,$null,$pixels,128);$e.Freeze()
foreach($p in @(0,0.1,0.5,0.9,1)){$d=[BlendProbe]::Compare($c,$e,$p);$max=[Math]::Max($max,$d);if($d-gt 1){throw ('Alpha mismatch '+$d)};$checks++}
$samples=@();for($i=0;$i-lt 4;$i++){$old=[BlendProbe]::Measure($a,$b,$true,35);$new=[BlendProbe]::Measure($a,$b,$false,35);$samples+=@{beforeMs=$old;afterMs=$new;speedup=$old/$new}}
$oldMean=($samples|ForEach-Object{$_.beforeMs}|Measure-Object -Average).Average;$newMean=($samples|ForEach-Object{$_.afterMs}|Measure-Object -Average).Average
if($newMean-ge $oldMean*.8){throw 'Blend optimization did not reduce measured work enough'};$checks++
[IO.File]::WriteAllText($Report,(@{ok=$true;checks=$checks;pixelMaxDifference=$max;beforeMs=$oldMean;afterMs=$newMean;speedup=$oldMean/$newMean;samples=$samples;paidCalls=0}|ConvertTo-Json -Depth 6),[Text.UTF8Encoding]::new($false))
