param([string]$Stage,[string]$Report)
$ErrorActionPreference='Stop';$script:checks=0
function Check([bool]$Value,[string]$Message){if(!$Value){throw $Message};$script:checks++}
$null=. ([ScriptBlock]::Create([IO.File]::ReadAllText((Join-Path $Stage 'widget.ps1'),[Text.Encoding]::UTF8))) -CheckOnly -AppDir $Stage
$script:hostHandle=[IntPtr]::Zero;$script:dragonTestMode=$true
Initialize-WidgetSettingsMenu;Initialize-WidgetDesktopInteraction;Initialize-WidgetPetForms;Sync-WidgetCompactMenu
Check (@($script:settingsMenuUi.Appearance.Items|Where-Object{[object]::ReferenceEquals($_.Header,$script:bubbleSizeSlider.Parent)}).Count-eq 0) 'Separate bubble slider removed from menu'
Check (@($script:settingsMenuUi.Appearance.Items|Where-Object{[object]::ReferenceEquals($_.Header,$script:sizeSlider.Parent)}).Count-eq 1) 'One visible pet size slider'
Check ($script:sizeSlider.Parent.Children[0].Children[0].Text-eq '桌宠大小') 'Unified size label'
function Test-WidgetPetFormAnimation {return $false}
$script:window.Left=-10000;$script:window.Top=-10000;$script:window.Show();$script:window.UpdateLayout()
Set-WidgetPetForm full;Start-DragonAnimation
for($i=0;$i-lt 150;$i++){Tick-DragonAnimation;$null=$script:window.Dispatcher.Invoke([Action]{},[Windows.Threading.DispatcherPriority]::Background);Start-Sleep -Milliseconds 20;if($script:dragonPresentedTotal-gt 1){break}}
Check ($script:dragonPresentedTotal-gt 1) 'Real full-body animation initialized'
$script:bubbleMode='quota';Apply-Scene
Check ($script:ui.QuoteText.Visibility-eq 'Collapsed') 'Quota initially hides quote control'
$script:bubbleMode='quote';$script:ui.QuoteText.Text='收工前，把今天的进展记下来，明天就能接着走。';Fit-QuoteText;Apply-Scene
Check ($script:petSpeechWidth-gt 100 -and $script:petSpeechHeight-ge $script:ui.QuoteText.LineHeight*2) 'First quote measures visible text after leaving quota mode'
function Capture([string]$Name){
 $element=$script:window.Content;$element.UpdateLayout()
 $image=[Windows.Media.Imaging.RenderTargetBitmap]::new([int][Math]::Ceiling($element.ActualWidth),[int][Math]::Ceiling($element.ActualHeight),96,96,[Windows.Media.PixelFormats]::Pbgra32);$image.Render($element)
 $png=[Windows.Media.Imaging.PngBitmapEncoder]::new();$png.Frames.Add([Windows.Media.Imaging.BitmapFrame]::Create($image));$stream=[IO.File]::Create((Join-Path (Split-Path $Report -Parent) $Name));try{$png.Save($stream)}finally{$stream.Dispose()}
}
$samples=@()
foreach($form in @('full','bust')){
 Set-WidgetPetForm $form
 foreach($size in @(0.8,1.4,2.5)){
  $script:sizeSlider.Value=$size
  Check ($script:scale-eq $size -and (Get-WidgetLayoutScale)-eq $size -and $script:bubbleScale-eq $size) 'One scale controls model and bubble'
  Check ($script:ui.Bubble.LayoutTransform.Value.IsIdentity) 'Bubble has no independent scale transform'
  $script:bubbleMode='quote';$script:collapsed=$false
  $script:ui.QuoteText.Text='在呢。';Fit-QuoteText;Apply-Scene;Set-BubbleState
  $smallWidth=$script:ui.Bubble.Width;$smallHeight=$script:ui.Bubble.Height
  $script:ui.QuoteText.Text='先把眼前的一件事做好，剩下的事情我们慢慢来。';Fit-QuoteText;Apply-Scene;Set-BubbleState
  Check ($script:ui.Bubble.Width-gt $smallWidth -and $script:ui.Bubble.Height-ge $smallHeight) 'Speech card grows with text'
  Check ($script:ui.BubbleShape.Data-is [Windows.Media.GeometryGroup] -and $script:ui.BubbleShape.Data.Children.Count-eq 2) 'Rounded card and short pointer replace cloud'
  Check ($script:ui.BubbleShape.StrokeThickness-eq 0 -and $null-eq $script:ui.BubbleShape.Stroke) 'No purple outline'
  Check ($script:ui.QuoteText.FontWeight-eq [Windows.FontWeights]::Normal -and $script:ui.QuoteText.TextAlignment-eq 'Left') 'Normal dark text without cloud typography'
  Check ($script:ui.Tail.Clip.Bounds.IsEmpty -or $script:ui.Tail.Clip.Bounds.Width-eq 0) 'Thought circles cannot render during bubble animations'
  $girl=$script:ui.Girl;$head=[Windows.Controls.Canvas]::GetTop($girl)+$girl.Height*$(if($form-eq 'bust'){359/384-0.62*1139/1381}else{0.073})
  $bottom=[Windows.Controls.Canvas]::GetTop($script:ui.Bubble)+$script:ui.Bubble.Height
  Check ([Math]::Abs($head-$bottom-8)-lt 0.01) 'Pointer stays close above visible head'
  Check ([Windows.Controls.Canvas]::GetLeft($script:ui.Bubble)-ge 8 -and [Windows.Controls.Canvas]::GetLeft($script:ui.Bubble)+$script:ui.Bubble.Width-le 342) 'Card remains inside drawing area'
  $script:window.UpdateLayout()
  Check ($script:ui.QuoteText.ActualHeight-ge $script:ui.QuoteText.LineHeight*2) 'Multiline quote is not trimmed by fractional-DPI rounding'
  $samples+=@{form=$form;scale=$size;modelWidth=208*$(if($form-eq 'bust'){0.62}else{1})*$size;cardWidth=$script:ui.Bubble.Width*$size;cardHeight=$script:ui.Bubble.Height*$size;contentWidth=$script:ui.QuoteText.Width;contentHeight=$script:petSpeechHeight;actualTextHeight=$script:ui.QuoteText.ActualHeight;sceneHeight=$script:ui.SceneText.Height}
  if($size-eq 1.4 -or ($form-eq 'bust' -and $size-eq 2.5)){Capture ($form+'-'+$size+'.png')}
 }
 $script:ui.QuoteText.Text=('长句测试。'*35);Fit-QuoteText;Apply-Scene
 Check ($script:ui.QuoteText.Tag.Length-eq 175) 'Long text remains available in copy and tooltip'
 Check ([Windows.Controls.Canvas]::GetTop($script:ui.Bubble)+$script:ui.Bubble.Height-le $head-7.9) 'Long card avoids overlapping character'
 $script:bubbleMode='quota';Apply-Scene
 Check ($script:ui.SceneText.Width-eq 144 -and $script:ui.SceneText.Height-lt 100 -and $script:ui.QuotaText.DesiredSize.Height-le $script:ui.SceneText.Height) 'Compact quota measures its content without excess blank space'
}
Set-WidgetPetForm bust
Check ($script:petBustFrame.image.PixelWidth-eq 2048) 'Previously accepted crisp small-form raster is unchanged'
$before=@($script:window.Left,$script:window.Top,$script:desktopLeft,$script:desktopTop)
Set-WidgetPetForm full;Set-WidgetPetForm bust
Check (($before|ConvertTo-Json -Compress)-eq (@($script:window.Left,$script:window.Top,$script:desktopLeft,$script:desktopTop)|ConvertTo-Json -Compress)) 'Form switching does not move window'
Stop-DragonAnimation;$script:window.Close()
@{ok=$true;checks=$script:checks;realWpf=$true;samples=$samples;smallFormRasterUnchanged=$true;paidCalls=0}|ConvertTo-Json -Depth 6|Set-Content -LiteralPath $Report -Encoding UTF8
