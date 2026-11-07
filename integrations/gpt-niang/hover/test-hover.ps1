$ErrorActionPreference='Stop'
Add-Type -AssemblyName PresentationFramework,PresentationCore,WindowsBase
. (Join-Path $PSScriptRoot 'hover-feedback.ps1')
$script:ui=@{Girl=[Windows.Controls.Image]::new()}
$script:window=[Windows.Window]::new();$script:context=[Windows.Controls.ContextMenu]::new()
$script:window.Content=$script:ui.Girl;$script:window.ShowInTaskbar=$false;$script:window.Left=-9000;$script:window.Show()
$script:activeCharacter=@{name='龙娘1'};$script:characterId='gpt-dragon'
$checks=0
function Check($value,$message){if(!$value){throw $message};$script:checks++}
try{
 Initialize-WidgetIdentityHover
 $tip=$script:identityHoverTip;Initialize-WidgetIdentityHover
 Check ($tip-eq $script:identityHoverTip) 'Initialization must be idempotent'
 Update-WidgetIdentityHover $true $false
 Check ($tip.IsOpen -and $tip.Content-eq 'GPT娘 · 龙娘1') 'Identity shown'
 Check ($script:ui.Girl.Cursor-eq [Windows.Input.Cursors]::Hand) 'Hover hand'
 $script:ui.Girl.ToolTip='walking';Update-WidgetIdentityHover $true $false
 Check ($tip.Content-eq 'GPT娘 · 龙娘1') 'Animation tooltip cannot replace identity'
 Update-WidgetIdentityHover $true $true
 Check (!$tip.IsOpen -and $script:ui.Girl.Cursor-eq [Windows.Input.Cursors]::SizeAll) 'Pressed cursor and hidden tip'
 $script:drag=@{moved=$true};Update-WidgetIdentityHover $true $false
 Check (!$tip.IsOpen) 'Dragging hides tip'
 $script:drag=$null;$script:petFormTransition=$true;Update-WidgetIdentityHover $true $false
 Check (!$tip.IsOpen) 'Transition hides tip'
 $script:petFormTransition=$false;Update-WidgetIdentityHover $true $false
 $leave=[Windows.Input.MouseEventArgs]::new([Windows.Input.Mouse]::PrimaryDevice,0);$leave.RoutedEvent=[Windows.Input.Mouse]::MouseLeaveEvent;$script:ui.Girl.RaiseEvent($leave)
 Check (!$tip.IsOpen) 'Leave event closes tip'
 $script:activeCharacter=@{};Update-WidgetIdentityHover $true $false
 Check ($tip.Content-eq 'GPT娘 · GPT娘') 'Missing name fallback'
 $script:window.Hide()
 Check (!$tip.IsOpen) 'Window hide closes tip'
 Check (!$tip.IsHitTestVisible) 'Tip never takes input'
 Check (![Windows.Controls.ToolTipService]::GetIsEnabled($script:ui.Girl)) 'Old tooltip disabled'
 @{ok=$true;checks=$checks;realInput=$false;paidCalls=0}|ConvertTo-Json
}finally{$script:window.Close()}
