function Update-WidgetIdentityHover([bool]$Hovered,[bool]$Pressed) {
  if(!$script:identityHoverTip){return}
  $girl=$script:ui.Girl
  $girl.Cursor=if($Pressed){[Windows.Input.Cursors]::SizeAll}else{[Windows.Input.Cursors]::Hand}
  $blocked=$Pressed -or $script:drag -or ($script:context -and $script:context.IsOpen) -or $script:petFormTransition
  if(!$Hovered -or $blocked){$script:identityHoverTip.IsOpen=$false;return}
  $name=if($script:activeCharacter.name){[string]$script:activeCharacter.name}else{'GPT娘'}
  $script:identityHoverTip.Content=if($script:characterId-eq 'gpt-dragon'){'GPT娘 · '+$name}else{$name}
  $script:identityHoverTip.IsOpen=$true
}
function Initialize-WidgetIdentityHover {
  if($script:identityHoverTip){return}
  $girl=$script:ui.Girl
  # Use an independent tooltip: animation/form code may still update Girl.ToolTip.
  [Windows.Controls.ToolTipService]::SetIsEnabled($girl,$false)
  $script:identityHoverTip=[Windows.Controls.ToolTip]::new()
  $script:identityHoverTip.PlacementTarget=$girl
  $script:identityHoverTip.Placement=[Windows.Controls.Primitives.PlacementMode]::MousePoint
  $script:identityHoverTip.HorizontalOffset=12
  $script:identityHoverTip.VerticalOffset=16
  $script:identityHoverTip.IsHitTestVisible=$false
  $script:identityHoverTip.StaysOpen=$true
  $girl.Cursor=[Windows.Input.Cursors]::Hand
  $girl.Add_MouseEnter({Update-WidgetIdentityHover $true $false})
  $girl.Add_MouseMove({param($sender,$event) Update-WidgetIdentityHover $sender.IsMouseOver ($event.LeftButton-eq [Windows.Input.MouseButtonState]::Pressed)})
  $girl.Add_MouseLeave({Update-WidgetIdentityHover $false $false})
  $girl.Add_PreviewMouseDown({Update-WidgetIdentityHover $false $true})
  $girl.Add_PreviewMouseUp({Update-WidgetIdentityHover $false $false})
  $girl.Add_LostMouseCapture({Update-WidgetIdentityHover $false $false})
  if($script:context){$script:context.Add_Opened({Update-WidgetIdentityHover $false $false})}
  if($script:window){$script:window.Add_IsVisibleChanged({if(!$script:window.IsVisible){Update-WidgetIdentityHover $false $false}});$script:window.Add_Closed({Update-WidgetIdentityHover $false $false})}
}
