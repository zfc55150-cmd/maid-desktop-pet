function Get-WidgetIdentityPlacement([double]$X,[double]$Y,[double]$Width,[double]$Height,[double]$Left,[double]$Top,[double]$Right,[double]$Bottom,[double]$Gap){
  $px=$X+$Gap;if($px+$Width-gt $Right){$px=$X-$Gap-$Width}
  $py=$Y+$Gap;if($py+$Height-gt $Bottom){$py=$Y-$Gap-$Height}
  $px=[Math]::Max($Left,[Math]::Min($px,[Math]::Max($Left,$Right-$Width)))
  $py=[Math]::Max($Top,[Math]::Min($py,[Math]::Max($Top,$Bottom-$Height)))
  return [Windows.Point]::new($px,$py)
}
function Set-WidgetIdentityHoverStyle([double]$size){
  $script:identityHoverText.Text=if($script:activeCharacter.name){[string]$script:activeCharacter.name}else{'GPT娘'}
  $script:identityHoverText.FontSize=$size*0.026
  $script:identityHoverText.LineHeight=$size*0.026*1.4
  $script:identityHoverText.MaxWidth=$size*0.8-$size*0.042-2
  $script:identityHoverBorder.Padding=[Windows.Thickness]::new($size*0.021,$size*0.010,$size*0.021,$size*0.010)
  $script:identityHoverBorder.CornerRadius=[Windows.CornerRadius]::new($size*0.016)
  # WPF blur radius needs twice the CSS box-shadow blur for the same falloff.
  $script:identityHoverBorder.Effect.BlurRadius=$size*0.026
  $script:identityHoverBorder.Effect.ShadowDepth=$size*0.004
  $script:identityHoverBorder.Measure([Windows.Size]::new([double]::PositiveInfinity,[double]::PositiveInfinity))
}
function Hide-WidgetIdentityHover {
  if($script:identityHoverPopup){$script:identityHoverPopup.IsOpen=$false}
}
function Update-WidgetIdentityHover {
  if(!$script:identityHoverPopup -or !$script:window.IsVisible){Hide-WidgetIdentityHover;return}
  $girl=$script:ui.Girl
  $pressed=[Windows.Input.Mouse]::LeftButton-eq [Windows.Input.MouseButtonState]::Pressed
  $point=[Windows.Input.Mouse]::GetPosition($script:ui.Root)
  $hit=Test-GirlAlpha $point
  $girl.Cursor=if($pressed -and ($hit -or $script:drag)){$script:identityGrabbedCursor}elseif($hit){$script:identityGrabCursor}else{[Windows.Input.Cursors]::Arrow}
  if(!$hit -or $pressed -or $script:drag -or $script:context.IsOpen -or $script:petFormTransition){Hide-WidgetIdentityHover;return}
  $size=$girl.ActualWidth;if($size-le 0){return}
  Set-WidgetIdentityHoverStyle $size
  $local=$script:ui.Root.TranslatePoint($point,$girl)
  $screen=$girl.PointToScreen($local)
  $area=[Windows.Forms.Screen]::FromPoint([Drawing.Point]::new([int]$screen.X,[int]$screen.Y)).WorkingArea
  $tl=$girl.PointFromScreen([Windows.Point]::new($area.Left,$area.Top));$br=$girl.PointFromScreen([Windows.Point]::new($area.Right,$area.Bottom))
  $tipSize=$script:identityHoverBorder.DesiredSize
  $pos=Get-WidgetIdentityPlacement $local.X $local.Y $tipSize.Width $tipSize.Height $tl.X $tl.Y $br.X $br.Y ($size*0.022)
  $shadowPad=$size*0.035
  $script:identityHoverSurface.Padding=[Windows.Thickness]::new($shadowPad)
  $script:identityHoverPopup.HorizontalOffset=$pos.X-$shadowPad
  $script:identityHoverPopup.VerticalOffset=$pos.Y-$shadowPad
  if(!$script:identityHoverPopup.IsOpen){
    $script:identityHoverPopup.IsOpen=$true
    $script:identityHoverBorder.BeginAnimation([Windows.UIElement]::OpacityProperty,[Windows.Media.Animation.DoubleAnimation]::new(0,1,[Windows.Duration]::new([TimeSpan]::FromMilliseconds(120))))
  }
}
function Initialize-WidgetIdentityHover {
  if($script:identityHoverPopup){return}
  $assets=Join-Path $script:appDir 'assets\identity-hover'
  $script:identityGrabCursor=[Windows.Input.Cursor]::new((Join-Path $assets 'cursor-grab.cur'))
  $script:identityGrabbedCursor=[Windows.Input.Cursor]::new((Join-Path $assets 'cursor-grabbing.cur'))
  [Windows.Controls.ToolTipService]::SetIsEnabled($script:ui.Girl,$false)
  $script:identityHoverText=[Windows.Controls.TextBlock]::new()
  $fontUri=[Uri]::new($assets.TrimEnd('\')+'\',[UriKind]::Absolute)
  $script:identityHoverText.FontFamily=[Windows.Media.FontFamily]::new($fontUri,'./#SSRuanTangTi')
  $script:identityHoverText.Foreground=[Windows.Media.BrushConverter]::new().ConvertFromString('#1f1f1f')
  $script:identityHoverText.TextTrimming=[Windows.TextTrimming]::CharacterEllipsis
  $script:identityHoverText.TextWrapping=[Windows.TextWrapping]::NoWrap
  $script:identityHoverText.LineStackingStrategy=[Windows.LineStackingStrategy]::BlockLineHeight
  $script:identityHoverBorder=[Windows.Controls.Border]::new()
  $script:identityHoverBorder.Child=$script:identityHoverText
  $script:identityHoverBorder.Background=[Windows.Media.BrushConverter]::new().ConvertFromString('#F5FFFFFF')
  # CSS paints white under its translucent border; WPF Border does not.
  # Use that composited stroke color to preserve the original visible border.
  $script:identityHoverBorder.BorderBrush=[Windows.Media.BrushConverter]::new().ConvertFromString('#DFDFDF')
  $script:identityHoverBorder.BorderThickness=[Windows.Thickness]::new(1)
  $shadow=[Windows.Media.Effects.DropShadowEffect]::new();$shadow.Color=[Windows.Media.Colors]::Black;$shadow.Opacity=0.18;$shadow.Direction=270
  $script:identityHoverBorder.Effect=$shadow
  $script:identityHoverPopup=[Windows.Controls.Primitives.Popup]::new()
  $script:identityHoverSurface=[Windows.Controls.Border]::new()
  $script:identityHoverSurface.Child=$script:identityHoverBorder
  $script:identityHoverSurface.IsHitTestVisible=$false
  $script:identityHoverPopup.Child=$script:identityHoverSurface
  $script:identityHoverPopup.PlacementTarget=$script:ui.Girl
  $script:identityHoverPopup.Placement=[Windows.Controls.Primitives.PlacementMode]::RelativePoint
  $script:identityHoverPopup.AllowsTransparency=$true
  $script:identityHoverPopup.StaysOpen=$true
  $script:identityHoverPopup.IsHitTestVisible=$false
  $script:identityHoverBorder.IsHitTestVisible=$false
  $script:ui.Girl.Cursor=$script:identityGrabCursor
  $script:ui.Girl.Add_MouseMove({Update-WidgetIdentityHover})
  $script:ui.Girl.Add_MouseEnter({Update-WidgetIdentityHover})
  $script:ui.Girl.Add_MouseLeave({Hide-WidgetIdentityHover})
  $script:ui.Girl.Add_PreviewMouseDown({Hide-WidgetIdentityHover;$script:ui.Girl.Cursor=$script:identityGrabbedCursor})
  $script:ui.Girl.Add_PreviewMouseUp({Hide-WidgetIdentityHover;$script:ui.Girl.Cursor=$script:identityGrabCursor})
  $script:ui.Girl.Add_LostMouseCapture({Hide-WidgetIdentityHover;$script:ui.Girl.Cursor=$script:identityGrabCursor})
  $script:context.Add_Opened({Hide-WidgetIdentityHover})
  $script:identityHoverTimer=[Windows.Threading.DispatcherTimer]::new();$script:identityHoverTimer.Interval=[TimeSpan]::FromMilliseconds(80)
  $script:identityHoverTimer.Add_Tick({Update-WidgetIdentityHover});$script:identityHoverTimer.Start()
  $script:window.Add_IsVisibleChanged({if(!$script:window.IsVisible){Hide-WidgetIdentityHover}})
  $script:window.Add_Closed({Hide-WidgetIdentityHover;$script:identityHoverTimer.Stop();$script:identityGrabCursor.Dispose();$script:identityGrabbedCursor.Dispose()})
}
