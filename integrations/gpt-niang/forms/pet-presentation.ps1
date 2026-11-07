# DeepSeek's presentation rules: one pet scale, content-sized white speech
# cards, dark normal-weight text, a short pointer and a visible-head anchor.
$script:petPresentationOriginalScale=(Get-Command Get-WidgetLayoutScale).ScriptBlock
$script:petPresentationOriginalFit=(Get-Command Fit-QuoteText).ScriptBlock
$script:petPresentationOriginalSettings=(Get-Command Initialize-WidgetSettingsMenu).ScriptBlock
$script:petPresentationOriginalColors=(Get-Command Update-WidgetColorScene).ScriptBlock
function Get-WidgetLayoutScale {
  if($script:characterId-eq 'gpt-dragon'){return [double]$script:scale}
  return (& $script:petPresentationOriginalScale)
}
function Get-WidgetPetTextWidth {
  return $(if($script:widgetPetForm-eq 'bust'){146.0}else{164.0})
}
$script:petSmallClickEpoch=-1
function Invoke-WidgetSmallClick {
  if($script:completionPending){return}
  if($script:collapsed -or $script:petSmallClickEpoch-ne $script:bubbleEpoch){Show-Quota}else{Show-Quote}
  $script:petSmallClickEpoch=$script:bubbleEpoch
}
function Get-WidgetQuotaContentWidth {
  if($script:characterId-eq 'gpt-dragon'){return 144.0};return 184.0
}
function Measure-WidgetCompactQuota {
  $quota=$script:ui.QuotaText;$quota.Visibility=[Windows.Visibility]::Visible;$quota.Width=144
  $header=$script:ui.Header;$header.FontSize=9.5;$header.LineHeight=12;$header.MaxWidth=112
  $header.Parent.Height=12
  $header.Parent.ColumnDefinitions[0].Width=[Windows.GridLength]::new(16)
  $header.Parent.ColumnDefinitions[2].Width=[Windows.GridLength]::new(16)
  $refresh=$script:ui.Refresh;$refresh.Width=14;$refresh.Height=12;$refresh.FontSize=10
  $refresh.Padding=[Windows.Thickness]::new(0);$refresh.BorderThickness=[Windows.Thickness]::new(0);$refresh.Background=[Windows.Media.Brushes]::Transparent
  foreach($prefix in @('Short','Week')){
    $label=$script:ui[$prefix+'Label'];$label.FontSize=10.5;$label.Parent.Height=18
    $value=$script:ui[$prefix+'Left'];$value.FontSize=17;$value.LineHeight=18
    $bar=$script:ui[$prefix+'Bar'];$bar.Parent.Height=3
    $reset=$script:ui[$prefix+'Reset'];$reset.FontSize=9.5;$reset.LineHeight=12
    $reset.TextWrapping=[Windows.TextWrapping]::NoWrap;$reset.TextTrimming=[Windows.TextTrimming]::CharacterEllipsis
  }
  $quota.Measure([Windows.Size]::new(144,[double]::PositiveInfinity))
  return @{width=144.0;height=[Math]::Max(28,[Math]::Ceiling($quota.DesiredSize.Height+1))}
}
function Fit-QuoteText {
  if($script:characterId-ne 'gpt-dragon'){& $script:petPresentationOriginalFit;return}
  $text=$script:ui.QuoteText;$text.Tag=$text.Text
  # The first quote follows quota mode, where this TextBlock is Collapsed.
  # WPF reports zero DesiredSize for a collapsed control, even when measured.
  $text.Visibility=[Windows.Visibility]::Visible
  $fontRoot=[Uri]::new(([IO.Path]::GetFullPath((Join-Path $script:appDir 'assets\pet-forms'))+[IO.Path]::DirectorySeparatorChar))
  $text.FontFamily=[Windows.Media.FontFamily]::new($fontRoot,'./soft-candy.ttf#SSRuanTangTi')
  # The Viewbox already applies the pet scale. Match DeepSeek's actual
  # current display size rather than scaling its font a second time.
  $reference=[IO.File]::ReadAllText((Join-Path $script:appDir 'assets\pet-forms\font-reference.json'))|ConvertFrom-Json
  $text.FontSize=[double]$reference.fontSizeDip/[double]$reference.gptReferenceScale
  $text.FontWeight=[Windows.FontWeights]::Normal;$text.LineHeight=$text.FontSize*1.6
  $text.LineStackingStrategy=[Windows.LineStackingStrategy]::BlockLineHeight
  $text.HorizontalAlignment='Left';$text.VerticalAlignment='Center';$text.TextAlignment='Left'
  $text.Margin=[Windows.Thickness]::new(0);$text.Padding=[Windows.Thickness]::new(0)
  $text.RenderTransform=[Windows.Media.Transform]::Identity;$text.TextWrapping='Wrap';$text.TextTrimming='CharacterEllipsis'
  $text.Width=[double]::NaN;$text.Height=[double]::NaN;$text.MaxWidth=Get-WidgetPetTextWidth
  $text.MaxHeight=if($script:widgetPetForm-eq 'bust'){176.0}else{112.0}
  $text.Measure([Windows.Size]::new($text.MaxWidth,[double]::PositiveInfinity))
  $script:petSpeechWidth=[Math]::Max(28.0,[Math]::Min($text.MaxWidth,$text.DesiredSize.Width))
  $text.Width=$script:petSpeechWidth;$text.Measure([Windows.Size]::new($text.Width,[double]::PositiveInfinity))
  # A fractional line height can be rounded down at 150% DPI. Reserve a
  # pixel of slack so the final line is not replaced by an ellipsis.
  $script:petSpeechHeight=[Math]::Max(24.0,[Math]::Min($text.MaxHeight,[Math]::Ceiling($text.DesiredSize.Height+1)))
  $script:quoteLayout=$null
}
function Set-WidgetPetSpeechStyle {
  if($script:characterId-ne 'gpt-dragon'){return}
  $shape=$script:ui.BubbleShape
  $shape.Fill=[Windows.Media.BrushConverter]::new().ConvertFromString('#EBFFFFFF');$shape.Stroke=$null;$shape.StrokeThickness=0
  $script:ui.QuoteText.Foreground=[Windows.Media.BrushConverter]::new().ConvertFromString('#2B2B2B')
  if(!$script:petSpeechShadow){
    $script:petSpeechShadow=[Windows.Media.Effects.DropShadowEffect]::new()
    $script:petSpeechShadow.Color=[Windows.Media.Colors]::Black;$script:petSpeechShadow.Opacity=0.14
    $script:petSpeechShadow.BlurRadius=12;$script:petSpeechShadow.ShadowDepth=3
  }
  $shape.Effect=$script:petSpeechShadow
}
function Update-WidgetColorScene {
  & $script:petPresentationOriginalColors
  Set-WidgetPetSpeechStyle
}
function Set-WidgetPetSpeechLayout {
  $bubble=$script:ui.Bubble;$scene=$script:ui.SceneText;$girl=$script:ui.Girl
  $isText=$script:bubbleMode-in @('quote','completion')
  if($isText){
    if(!$script:petSpeechWidth -or $script:petSpeechText-ne $script:ui.QuoteText.Text -or $script:petSpeechForm-ne $script:widgetPetForm){Fit-QuoteText;$script:petSpeechText=$script:ui.QuoteText.Text;$script:petSpeechForm=$script:widgetPetForm}
    $cw=$script:petSpeechWidth;$ch=$script:petSpeechHeight;$script:ui.QuoteText.Height=$ch
  }else{$quota=Measure-WidgetCompactQuota;$cw=$quota.width;$ch=$quota.height}
  $padX=if($isText){11.0}else{8.0};$padY=if($isText){8.0}else{6.0}
  $width=$cw+2*$padX;$height=$ch+2*$padY;$tip=6.0
  $gx=[Windows.Controls.Canvas]::GetLeft($girl);$gy=[Windows.Controls.Canvas]::GetTop($girl)
  $head=if($script:widgetPetForm-eq 'bust'){$gy+$girl.Height*(359/384-0.62*1139/1381)}else{$gy+$girl.Height*0.073}
  $center=$gx+$girl.Width/2
  $left=[Math]::Max(8.0,[Math]::Min(342.0-$width,$center-$width/2))
  $top=[Math]::Max(8.0,$head-8-$height-$tip)
  $bubble.Width=$width;$bubble.Height=$height+$tip;$bubble.LayoutTransform=[Windows.Media.Transform]::Identity
  $bubble.RenderTransformOrigin=[Windows.Point]::new(0.5,1)
  [Windows.Controls.Canvas]::SetLeft($bubble,$left);[Windows.Controls.Canvas]::SetTop($bubble,$top)
  [Windows.Controls.Canvas]::SetLeft($scene,$padX);[Windows.Controls.Canvas]::SetTop($scene,$padY)
  $scene.Width=$cw;$scene.Height=$ch
  $pointer=[Math]::Max(15.0,[Math]::Min($width-15,$center-$left))
  $geometry=[Windows.Media.GeometryGroup]::new()
  $geometry.Children.Add([Windows.Media.RectangleGeometry]::new([Windows.Rect]::new(0,0,$width,$height),11,11))
  $triangle=[Windows.Media.StreamGeometry]::new();$pen=$triangle.Open()
  try{$pen.BeginFigure([Windows.Point]::new($pointer-6,$height-0.5),$true,$true);$pen.LineTo([Windows.Point]::new($pointer,$height+$tip),$true,$false);$pen.LineTo([Windows.Point]::new($pointer+6,$height-0.5),$true,$false)}finally{$pen.Close()}
  $geometry.Children.Add($triangle);$geometry.Freeze();$script:ui.BubbleShape.Data=$geometry
  foreach($name in @('Tail','TailNear')){
    $script:ui[$name].Clip=[Windows.Media.RectangleGeometry]::new([Windows.Rect]::new(0,0,0,0))
    $script:ui[$name].IsHitTestVisible=$false
  }
  Set-WidgetPetSpeechStyle
}
function Set-WidgetIndependentLayout {
  if($script:characterId-eq 'gpt-dragon'){$script:bubbleScale=$script:scale}
  & $script:petFormOriginalLayout
  if($script:characterId-ne 'gpt-dragon'){return}
  Set-WidgetPetSpeechLayout
}
function Set-WidgetSceneLayout {
  if($script:characterId-ne 'gpt-dragon'){& $script:petFormOriginalSceneLayout;return}
  Set-WidgetIndependentLayout
}
function Initialize-WidgetSettingsMenu {
  & $script:petPresentationOriginalSettings
  if($script:characterId-ne 'gpt-dragon'){return}
  $panel=$script:bubbleSizeSlider.Parent
  foreach($item in @($script:settingsMenuUi.Appearance.Items)){
    if([object]::ReferenceEquals($item.Header,$panel)){$script:settingsMenuUi.Appearance.Items.Remove($item)}
  }
  $caption=$script:sizeSlider.Parent.Children[0].Children[0];$caption.Text='桌宠大小'
  $script:sizeSlider.ToolTip='人物和气泡一起缩放，气泡自动适配文字。'
}
