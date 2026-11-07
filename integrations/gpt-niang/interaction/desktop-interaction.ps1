# Physical-pixel placement. Menus use the work area; the character may cover
# the taskbar and extend beyond a monitor. No new setting or network request.
function Get-WidgetRestingCharacterBounds([double]$Dpi) {
  $root=$script:ui.Root;$girl=$script:ui.Girl
  $r=[Windows.Media.VisualTreeHelper]::GetOffset($root)
  $g=[Windows.Media.VisualTreeHelper]::GetOffset($girl)
  $left=$g.X
  if($script:ui.FacingScale.ScaleX-lt 0){$left=$root.ActualWidth-$g.X-$girl.ActualWidth}
  $factor=$script:displayScale*$Dpi
  $x=($r.X+$left)*$factor;$y=($r.Y+$g.Y)*$factor
  $width=[Math]::Max(1,$girl.ActualWidth*$factor);$height=[Math]::Max(1,$girl.ActualHeight*$factor)
  if([Windows.PresentationSource]::FromVisual($root.Parent)){
    $origin=$script:window.PointToScreen([Windows.Point]::new(0,0))
    $a=$root.Parent.PointToScreen([Windows.Point]::new(($r.X+$left),($r.Y+$g.Y)))
    $b=$root.Parent.PointToScreen([Windows.Point]::new(($r.X+$left+$girl.ActualWidth),($r.Y+$g.Y+$girl.ActualHeight)))
    $x=$a.X-$origin.X;$y=$a.Y-$origin.Y;$width=$b.X-$a.X;$height=$b.Y-$a.Y
  }
  return @{X=$x;Y=$y;Width=[Math]::Max(1,$width);Height=[Math]::Max(1,$height)}
}
function Resolve-WidgetFreePosition([double]$Left,[double]$Top,$Character,$Screens,[double]$Dpi=1) {
  # Retain 35% of the character's resting box on one real monitor. Looking
  # at every monitor avoids barriers at seams or a virtual-desktop gap.
  $visibleX=[Math]::Min($Character.Width,[Math]::Max(64*$Dpi,$Character.Width*0.35))
  $visibleY=[Math]::Min($Character.Height,[Math]::Max(64*$Dpi,$Character.Height*0.35))
  $best=$null;$distance=[double]::PositiveInfinity
  foreach($screen in $Screens){
    $keepX=[Math]::Min($visibleX,$screen.Right-$screen.Left)
    $keepY=[Math]::Min($visibleY,$screen.Bottom-$screen.Top)
    $minimumX=$screen.Left-$Character.X-$Character.Width+$keepX
    $maximumX=$screen.Right-$Character.X-$keepX
    $minimumY=$screen.Top-$Character.Y-$Character.Height+$keepY
    $maximumY=$screen.Bottom-$Character.Y-$keepY
    $x=[Math]::Max($minimumX,[Math]::Min($maximumX,$Left))
    $y=[Math]::Max($minimumY,[Math]::Min($maximumY,$Top))
    $score=($x-$Left)*($x-$Left)+($y-$Top)*($y-$Top)
    if($score-lt $distance){$distance=$score;$best=@{X=[int][Math]::Round($x);Y=[int][Math]::Round($y)}}
  }
  if(!$best){return @{X=[int]$Left;Y=[int]$Top}}
  return $best
}
function Get-WidgetFreeDesktopPosition([double]$Left,[double]$Top,[double]$Dpi) {
  $character=Get-WidgetRestingCharacterBounds $Dpi
  $screens=@([Windows.Forms.Screen]::AllScreens|ForEach-Object{$_.Bounds})
  return Resolve-WidgetFreePosition $Left $Top $character $screens $Dpi
}
function Get-WidgetPlacementFrame {
  if($script:followHost){return [GptWidgetNative]::Frame($script:hostHandle)}
  $x=0;$y=0
  if($null-ne $script:desktopLeft -and $null-ne $script:desktopTop){
    $character=Get-WidgetRestingCharacterBounds (Get-WidgetPlacementDpi)
    $x=[int]($script:desktopLeft+$character.X+$character.Width/2)
    $y=[int]($script:desktopTop+$character.Y+$character.Height/2)
  }
  return [Windows.Forms.Screen]::FromPoint([Drawing.Point]::new($x,$y)).Bounds
}
function Get-WidgetMenuScreen {
  $point=$script:interactionMenuPoint
  if(!$point){$point=New-Object GptWidgetNative+Point;[GptWidgetNative]::GetCursorPos([ref]$point)|Out-Null;$script:interactionMenuPoint=$point}
  return [Windows.Forms.Screen]::FromPoint([Drawing.Point]::new($point.X,$point.Y)).WorkingArea
}
function Resolve-WidgetMenuPosition($Frame,[double]$Width,[double]$Height,[double]$X,[double]$Y,[double]$Margin=8) {
  $right=$X+$Margin;$left=$X-$Width-$Margin
  $desired=if($right+$Width-le $Frame.Right-$Margin){$right}else{$left}
  $resultX=[Math]::Max($Frame.Left+$Margin,[Math]::Min($Frame.Right-$Width-$Margin,$desired))
  $resultY=[Math]::Max($Frame.Top+$Margin,[Math]::Min($Frame.Bottom-$Height-$Margin,$Y))
  return @{X=[int][Math]::Round($resultX);Y=[int][Math]::Round($resultY)}
}
function Open-WidgetMenu {
  Raise-WidgetForInteraction
  Sync-WidgetCompactMenu
  $point=New-Object GptWidgetNative+Point;[GptWidgetNative]::GetCursorPos([ref]$point)|Out-Null
  $script:interactionMenuPoint=$point
  Set-WidgetMenuBounds;Update-WidgetSettingsMenu
  $script:context.IsOpen=$true
  Position-WidgetMenuToHost
}
function Set-WidgetMenuBounds {
  $frame=Get-WidgetMenuScreen;$dpi=Get-WidgetPlacementDpi
  $script:context.PlacementTarget=$script:window
  $script:context.Placement=[Windows.Controls.Primitives.PlacementMode]::MousePoint
  $script:context.HorizontalOffset=0;$script:context.VerticalOffset=0
  $script:context.Width=[Math]::Max(120,[Math]::Min(220,($frame.Right-$frame.Left)/$dpi-16))
  $script:context.MaxHeight=[Math]::Max(80,[Math]::Min(460,($frame.Bottom-$frame.Top)/$dpi*0.62))
  $script:context.Resources['CompactMenuMaxHeight']=[double]$script:context.MaxHeight
  $script:context.Resources['SettingsSubmenuWidth']=[double][Math]::Max(120,[Math]::Min(288,($frame.Right-$frame.Left)/$dpi-16))
  $script:context.Resources['SettingsSubmenuMaxHeight']=[double][Math]::Max(80,[Math]::Min(600,($frame.Bottom-$frame.Top)/$dpi-16))
  $right=$script:interactionMenuPoint.X-lt ($frame.Left+$frame.Right)/2
  foreach($submenu in $script:settingsSubmenus){$submenu.Tag=if($right){[Windows.Controls.Primitives.PlacementMode]::Right}else{[Windows.Controls.Primitives.PlacementMode]::Left}}
}
function Position-WidgetMenuToHost {
  if(!$script:context.IsOpen -or $script:settingsSizePreview){return}
  $script:context.UpdateLayout()
  $source=[Windows.Interop.HwndSource]::FromVisual($script:context)
  if(!$source -or $source.Handle-eq [IntPtr]::Zero){return}
  $menu=[GptWidgetNative]::Frame($source.Handle);$dpi=Get-WidgetPlacementDpi
  $position=Resolve-WidgetMenuPosition (Get-WidgetMenuScreen) ($menu.Right-$menu.Left) ($menu.Bottom-$menu.Top) $script:interactionMenuPoint.X $script:interactionMenuPoint.Y (8*$dpi)
  if($menu.Left-ne $position.X -or $menu.Top-ne $position.Y){[GptWidgetNative]::SetWindowPos($source.Handle,[IntPtr]::Zero,$position.X,$position.Y,0,0,0x15)|Out-Null}
}
function Get-WidgetMenuLabel($Item) {
  if($Item.Header-is [string]){return [string]$Item.Header}
  if($Item.Header-is [Windows.Controls.StackPanel]){
    foreach($child in $Item.Header.Children){if($child-is [Windows.Controls.TextBlock]){return $child.Text}}
  }
  return ''
}
function New-WidgetMenuBranch([string]$Label,$Items) {
  $branch=[Windows.Controls.MenuItem]::new();$branch.Header=$Label
  foreach($item in $Items){if($item){$null=$branch.Items.Add($item)}}
  return $branch
}
function Set-WidgetCompactItemStyle($Items) {
  foreach($item in $Items){
    if($item-isnot [Windows.Controls.MenuItem]){continue}
    $item.Style=$script:compactMenuResources['CompactItem']
    if($item.Header-is [Windows.Controls.StackPanel]){
      $label=Get-WidgetMenuLabel $item
      if($label){$item.ToolTip=($item.Header.Children|Where-Object{$_-is [Windows.Controls.TextBlock]}|ForEach-Object{$_.Text})-join '；';$item.Header=$label}
    }
    if($item.Header-is [Windows.UIElement]){$item.Uid='compact-panel';$item.Padding=[Windows.Thickness]::new(4,0,4,0)}
    if($item.HasItems){
      $item.Tag=[Windows.Controls.Primitives.PlacementMode]::Right
      $panel=(@($item.Items|Where-Object{$_-is [Windows.Controls.MenuItem] -and $_.Header-is [Windows.UIElement]}).Count-gt 0)
      $item.Resources['CompactSubmenuWidth']=[double]$(if($panel){272}else{220})
      $script:settingsSubmenus+=,$item
      Set-WidgetCompactItemStyle $item.Items
    }
  }
}
function Sync-WidgetCompactMenu {
  if(Get-Command Update-WidgetPetFormMenu -ErrorAction SilentlyContinue){Update-WidgetPetFormMenu}
  if($script:compactMenuReady){return}
  $script:compactMenuResources=[Windows.Markup.XamlReader]::Parse(@'
<ResourceDictionary xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml">
 <Style x:Key="CompactItem" TargetType="MenuItem">
  <Setter Property="Foreground" Value="#2B2B2B"/><Setter Property="FontSize" Value="13"/>
  <Setter Property="Padding" Value="10,5"/><Setter Property="Margin" Value="0"/>
  <Setter Property="MinHeight" Value="30"/><Setter Property="Cursor" Value="Arrow"/>
  <Setter Property="Template"><Setter.Value><ControlTemplate TargetType="MenuItem">
   <Grid><Border x:Name="ItemBody" Background="Transparent" CornerRadius="6" Padding="{TemplateBinding Padding}">
    <Grid><Grid.ColumnDefinitions><ColumnDefinition Width="*"/><ColumnDefinition Width="18"/><ColumnDefinition Width="10"/></Grid.ColumnDefinitions>
     <ContentPresenter x:Name="HeaderContent" ContentSource="Header" RecognizesAccessKey="True" VerticalAlignment="Center"/>
     <TextBlock x:Name="CheckMark" Grid.Column="1" Text="✓" Foreground="#2B63FF" Visibility="Collapsed" VerticalAlignment="Center" HorizontalAlignment="Right"/>
     <TextBlock x:Name="SubmenuArrow" Grid.Column="2" Text="›" Foreground="#9AA0A6" FontSize="15" Visibility="Collapsed" VerticalAlignment="Center" HorizontalAlignment="Right"/>
    </Grid>
   </Border>
   <Popup x:Name="PART_Popup" Placement="{Binding Tag, RelativeSource={RelativeSource TemplatedParent}, FallbackValue=Right}" PlacementTarget="{Binding ElementName=ItemBody}" IsOpen="{Binding IsSubmenuOpen, RelativeSource={RelativeSource TemplatedParent}}" AllowsTransparency="True" Focusable="False" PopupAnimation="None">
    <Border Background="#FEFFFFFF" BorderBrush="#1F000000" BorderThickness="1" CornerRadius="8" Padding="4" Width="{DynamicResource CompactSubmenuWidth}" MaxHeight="{DynamicResource CompactMenuMaxHeight}">
     <ScrollViewer VerticalScrollBarVisibility="Auto" HorizontalScrollBarVisibility="Disabled" CanContentScroll="False"><ItemsPresenter KeyboardNavigation.DirectionalNavigation="Cycle" KeyboardNavigation.TabNavigation="Cycle"/></ScrollViewer>
    </Border>
   </Popup></Grid>
   <ControlTemplate.Triggers>
    <Trigger Property="IsHighlighted" Value="True"><Setter TargetName="ItemBody" Property="Background" Value="#242B63FF"/></Trigger>
    <Trigger Property="IsChecked" Value="True"><Setter TargetName="CheckMark" Property="Visibility" Value="Visible"/></Trigger>
    <Trigger Property="Uid" Value="radio"><Setter TargetName="CheckMark" Property="Text" Value="●"/><Setter TargetName="CheckMark" Property="FontSize" Value="10"/></Trigger>
    <Trigger Property="HasItems" Value="True"><Setter TargetName="SubmenuArrow" Property="Visibility" Value="Visible"/></Trigger>
    <Trigger Property="Uid" Value="compact-panel"><Setter TargetName="HeaderContent" Property="Grid.ColumnSpan" Value="3"/></Trigger>
    <Trigger Property="IsEnabled" Value="False"><Setter Property="Opacity" Value="0.45"/></Trigger>
   </ControlTemplate.Triggers>
  </ControlTemplate></Setter.Value></Setter>
 </Style>
 <Style x:Key="CompactPreset" TargetType="Button">
  <Setter Property="FontSize" Value="13"/><Setter Property="Foreground" Value="#2B63FF"/><Setter Property="Padding" Value="8,6"/><Setter Property="BorderThickness" Value="0"/>
  <Setter Property="Template"><Setter.Value><ControlTemplate TargetType="Button"><Border x:Name="Body" Background="{TemplateBinding Background}" CornerRadius="6" Padding="{TemplateBinding Padding}"><ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center"/></Border><ControlTemplate.Triggers><Trigger Property="IsMouseOver" Value="True"><Setter TargetName="Body" Property="Background" Value="#DFE8FF"/></Trigger></ControlTemplate.Triggers></ControlTemplate></Setter.Value></Setter>
 </Style>
 <Style x:Key="CompactSlider" TargetType="Slider">
  <Setter Property="Height" Value="26"/><Setter Property="IsMoveToPointEnabled" Value="True"/>
  <Setter Property="Template"><Setter.Value><ControlTemplate TargetType="Slider"><Grid Background="Transparent"><Track x:Name="PART_Track" VerticalAlignment="Center">
   <Track.DecreaseRepeatButton><RepeatButton Command="Slider.DecreaseLarge" Focusable="False"><RepeatButton.Template><ControlTemplate TargetType="RepeatButton"><Border Height="4" Background="#2B63FF" CornerRadius="2"/></ControlTemplate></RepeatButton.Template></RepeatButton></Track.DecreaseRepeatButton>
   <Track.Thumb><Thumb Width="16" Height="16"><Thumb.Template><ControlTemplate TargetType="Thumb"><Border Background="White" BorderBrush="#2B63FF" BorderThickness="2" CornerRadius="8"/></ControlTemplate></Thumb.Template></Thumb></Track.Thumb>
   <Track.IncreaseRepeatButton><RepeatButton Command="Slider.IncreaseLarge" Focusable="False"><RepeatButton.Template><ControlTemplate TargetType="RepeatButton"><Border Height="4" Background="#E2E8F5" CornerRadius="2"/></ControlTemplate></RepeatButton.Template></RepeatButton></Track.IncreaseRepeatButton>
  </Track></Grid></ControlTemplate></Setter.Value></Setter>
  <Style.Triggers><Trigger Property="IsEnabled" Value="False"><Setter Property="Opacity" Value="0.4"/></Trigger></Style.Triggers>
 </Style>
 <Style TargetType="Separator"><Setter Property="Margin" Value="8,4"/><Setter Property="Template"><Setter.Value><ControlTemplate TargetType="Separator"><Border Height="1" Background="#16000000"/></ControlTemplate></Setter.Value></Setter></Style>
</ResourceDictionary>
'@)
  $script:context.Resources.MergedDictionaries.Add($script:compactMenuResources)
  $script:context.FontSize=13;$script:context.Foreground=[Windows.Media.BrushConverter]::new().ConvertFromString('#2B2B2B')
  $script:context.Template=[Windows.Markup.XamlReader]::Parse(@'
<ControlTemplate xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" TargetType="ContextMenu"><Border Background="#FEFFFFFF" BorderBrush="#1F000000" BorderThickness="1" CornerRadius="8" Padding="4"><ScrollViewer VerticalScrollBarVisibility="Auto" HorizontalScrollBarVisibility="Disabled" CanContentScroll="False"><ItemsPresenter KeyboardNavigation.DirectionalNavigation="Cycle"/></ScrollViewer></Border></ControlTemplate>
'@)
  # Reparent original items so every saved setting and click handler survives.
  $original=@($script:context.Items)
  $named=@{}
  foreach($item in $original){$label=Get-WidgetMenuLabel $item;if($label){$named[$label]=$item}}
  $script:context.Items.Clear()
  $actions=$named['点播小动作']
  if($actions){
    $actions.Header='动作'
    $existing=@($actions.Items);$actions.Items.Clear()
    foreach($label in @('可爱小动作','触碰有回应','跟随 Codex 工作状态')){if($named[$label]){$null=$actions.Items.Add($named[$label])}}
    $null=$actions.Items.Add([Windows.Controls.Separator]::new())
    foreach($item in $existing){$null=$actions.Items.Add($item)}
  }
  $script:settingsMenuUi.Appearance.Header='调整大小'
  $script:settingsMenuUi.Appearance.Items.Remove($script:settingsMenuUi.Hide)
  $script:settingsMenuUi.Display.Items.Insert(2,$script:settingsMenuUi.Hide)
  $named['退出 GPT 娘'].Foreground=[Windows.Media.BrushConverter]::new().ConvertFromString('#2B2B2B')
  foreach($button in $script:settingsMenuUi.SizeButtons){$button.Content=([int]([double]$button.Tag*100)).ToString()+'%';$button.Style=$script:compactMenuResources['CompactPreset']}
  foreach($slider in @($script:sizeSlider,$script:bubbleSizeSlider,$script:settingsMenuUi.Volume)){
    $slider.Style=$script:compactMenuResources['CompactSlider']
    foreach($text in $slider.Parent.Children[0].Children){if($text-is [Windows.Controls.TextBlock]){$text.Foreground=[Windows.Media.BrushConverter]::new().ConvertFromString('#5F6368')}}
  }
  Update-WidgetSizePresets
  $settingItems=@($named['刷新额度'],$script:settingsMenuUi.Character,$script:settingsMenuUi.Audio,$named['编辑我的语录'],$script:settingsMenuUi.MusicEnabled,$script:settingsMenuUi.AutoQuotes,$script:settingsMenuUi.Completion,$script:settingsMenuUi.Updates)
  $settings=New-WidgetMenuBranch '设置' $settingItems
  $script:petFormActionsMenu=$actions
  $root=@($script:settingsMenuUi.Bubble,$script:settingsMenuUi.Quote,[Windows.Controls.Separator]::new(),$script:petFormMenu,$script:settingsMenuUi.Appearance,$script:settingsMenuUi.Display,$actions,$settings,[Windows.Controls.Separator]::new(),$named['退出 GPT 娘'])
  foreach($item in $root){if($item){$null=$script:context.Items.Add($item)}}
  $script:settingsSubmenus=@()
  Set-WidgetCompactItemStyle $script:context.Items
  if(Get-Command Update-WidgetPetFormMenu -ErrorAction SilentlyContinue){Update-WidgetPetFormMenu}
  $script:compactMenuReady=$true
}
function Update-WidgetSizePresets {
  foreach($button in $script:settingsMenuUi.SizeButtons){
    $color=if([Math]::Abs([double]$button.Tag-$script:scale)-lt 0.05){'#DDE7FF'}else{'#F2F5FA'}
    $button.Background=[Windows.Media.BrushConverter]::new().ConvertFromString($color)
  }
}
function Initialize-WidgetDesktopInteraction {
  if(Get-Command Initialize-WidgetThrow -ErrorAction SilentlyContinue){Initialize-WidgetThrow}
  # Put the two everyday controls first without duplicating their handlers.
  foreach($key in @('Appearance','Display')){
    $item=$script:settingsMenuUi[$key]
    if($item){$script:context.Items.Remove($item);$script:context.Items.Insert(0,$item)}
  }
  $script:settingsMenuUi.Desktop.ToolTip='允许人物一部分在屏幕外；拖到另一块屏幕也可以。'
  $script:window.Add_PreviewMouseRightButtonUp({param($sender,$event)
    if($script:drag){return}
    Open-WidgetMenu;$event.Handled=$true
  })
  $script:context.Add_PreviewKeyDown({param($sender,$event)
    if($event.Key-eq [Windows.Input.Key]::Escape){$script:context.IsOpen=$false;$event.Handled=$true}
  })
  $script:context.Add_Closed({$script:interactionMenuPoint=$null})
  $script:context.Add_Opened({Sync-WidgetCompactMenu})
}
