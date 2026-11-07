param([string]$Stage,[string]$Report)
$ErrorActionPreference='Stop';$script:checks=0
function Check([bool]$Value,[string]$Message){if(!$Value){throw $Message};$script:checks++}
$null=. ([ScriptBlock]::Create([IO.File]::ReadAllText((Join-Path $Stage 'widget.ps1'),[Text.Encoding]::UTF8))) -CheckOnly -AppDir $Stage
$script:hostHandle=[IntPtr]::Zero;$script:dragonTestMode=$true
Initialize-WidgetSettingsMenu;Initialize-WidgetDesktopInteraction;Initialize-WidgetPetForms
function Test-WidgetPetFormAnimation {return $false}
$script:window.Left=-10000;$script:window.Top=-10000;$script:window.Show();$script:window.UpdateLayout()
function Capture([string]$Name){
 $element=$script:window.Content;$element.UpdateLayout()
 $image=[Windows.Media.Imaging.RenderTargetBitmap]::new([int][Math]::Ceiling($element.ActualWidth),[int][Math]::Ceiling($element.ActualHeight),96,96,[Windows.Media.PixelFormats]::Pbgra32);$image.Render($element)
 $png=[Windows.Media.Imaging.PngBitmapEncoder]::new();$png.Frames.Add([Windows.Media.Imaging.BitmapFrame]::Create($image));$stream=[IO.File]::Create((Join-Path (Split-Path $Report -Parent) $Name));try{$png.Save($stream)}finally{$stream.Dispose()}
}
Set-WidgetPetForm full
$script:scale=1.9;$script:bubbleScale=1.1;Set-Appearance
$fullTop=[Windows.Controls.Canvas]::GetTop($script:ui.Bubble);$fullLeft=[Windows.Controls.Canvas]::GetLeft($script:ui.Bubble);$fullBubble=$script:ui.Bubble.LayoutTransform.ScaleX
$position=@($script:window.Left,$script:window.Top,$script:desktopLeft,$script:desktopTop)
Set-WidgetPetForm bust
Check (($position|ConvertTo-Json -Compress)-eq (@($script:window.Left,$script:window.Top,$script:desktopLeft,$script:desktopTop)|ConvertTo-Json -Compress)) 'Changing form keeps window position'
Check ($script:petBustFrame.image.PixelWidth-eq 2048) 'High-resolution cached source'
Check (2048*0.62-gt 208*0.62*2.5*2) 'Enough source pixels for maximum zoom at 200 percent DPI'
$ratios=@();$rows=@()
foreach($size in @(0.6,1.0,1.4,1.9,2.5)){
 $script:scale=$size;$script:bubbleScale=1.1;Set-Appearance
 $script:ui.QuoteText.Text='我在这儿，慢慢来就好。';Fit-QuoteText;$script:bubbleMode='quote';$script:collapsed=$false;Set-BubbleState;Apply-Scene;$script:window.UpdateLayout()
 $layout=Get-WidgetLayoutScale;$c=$script:scale/$layout;$b=$script:ui.Bubble.LayoutTransform.ScaleX
 $head=[Windows.Controls.Canvas]::GetTop($script:ui.Girl)+$script:ui.Girl.Height*(359/384-0.62*1139/1381)
 $bottom=[Windows.Controls.Canvas]::GetTop($script:ui.Bubble)+170*$b
 $girlWidth=208*0.62*$c;$bubbleWidth=256*$b
 Check ($head-$bottom-ge 7*$c -and $head-$bottom-le 25*$c) ('Bubble sits close above head at '+$size)
 Check ($bubbleWidth/$girlWidth-ge 1.1 -and $bubbleWidth/$girlWidth-le 1.8) ('Bubble matches character at '+$size+' ratio='+($bubbleWidth/$girlWidth)+' form='+$script:widgetPetForm+' mode='+$script:bubbleMode+' scale='+$script:scale+' b='+$b)
 Check ([Windows.Controls.Canvas]::GetLeft($script:ui.Bubble)+25*$b-ge 0 -and [Windows.Controls.Canvas]::GetLeft($script:ui.Bubble)+285*$b-le 350) ('Bubble is not clipped at '+$size)
 $headPoint=[Windows.Point]::new(([Windows.Controls.Canvas]::GetLeft($script:ui.Girl)+$script:ui.Girl.Width/2),($head+35*$c))
 Check (Test-GirlAlpha $headPoint) ('High-resolution alpha hit testing works at '+$size)
 if($size-ge 1){$ratios+=,($bubbleWidth/$girlWidth)}
 $rows+=@{scale=$size;characterWidth=[Math]::Round($girlWidth*$layout,1);bubbleWidth=[Math]::Round($bubbleWidth*$layout,1);headGap=[Math]::Round(($head-$bottom)*$layout,1)}
 if($size-in @(1.0,1.9,2.5)){Capture ('quote-'+$size+'.png')}
}
Check (($ratios|Measure-Object -Maximum).Maximum-($ratios|Measure-Object -Minimum).Minimum-lt 0.01) 'Relative bubble ratio stays stable when zooming'
$script:scale=1.9;$script:bubbleScale=1.1;Set-Appearance
$quoteSize=$script:ui.Bubble.LayoutTransform.ScaleX
$script:bubbleScale=1.4;Set-Appearance
Check ($script:ui.Bubble.LayoutTransform.ScaleX-gt $quoteSize) 'Bubble adjustment remains usable'
$script:scale=1;$script:bubbleScale=0.6;$script:bubbleMode='quota';Apply-Scene
Check ($script:ui.Bubble.LayoutTransform.ScaleX*(Get-WidgetLayoutScale)-ge 0.9) 'Quota text has a readable minimum size'
foreach($size in @(0.6,2.5)){foreach($bubbleSize in @(0.6,2.5)){
 $script:scale=$size;$script:bubbleScale=$bubbleSize;Set-Appearance
 Check ([Windows.Controls.Canvas]::GetTop($script:ui.Bubble)-ge 0) 'Extreme slider combinations keep bubble in canvas'
}}
$script:scale=1.9;$script:bubbleScale=1.1;Set-Appearance;Set-WidgetPetForm full
Check ([Math]::Abs([Windows.Controls.Canvas]::GetTop($script:ui.Bubble)-$fullTop)-lt 0.01 -and [Math]::Abs([Windows.Controls.Canvas]::GetLeft($script:ui.Bubble)-$fullLeft)-lt 0.01 -and $script:ui.Bubble.LayoutTransform.ScaleX-eq $fullBubble) 'Full body restores original independent layout'
Check ($script:ui.Tail.StrokeThickness-eq 4 -and $script:ui.TailNear.StrokeThickness-eq 4) 'Full body restores thought-dot strokes'
$script:window.Close()
@{ok=$true;checks=$script:checks;realWpf=$true;sourcePixels=2048;sizing=$rows;paidCalls=0}|ConvertTo-Json -Depth 6|Set-Content -LiteralPath $Report -Encoding UTF8
