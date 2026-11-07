$ErrorActionPreference='Stop'
Add-Type -AssemblyName PresentationFramework,PresentationCore,WindowsBase,System.Drawing,System.Windows.Forms
. ([ScriptBlock]::Create([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'hover-feedback.ps1'),[Text.Encoding]::UTF8)))
$script:appDir=Join-Path (Split-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) -Parent) 'work\gpt-hover-v2-20261101-01\files'
$script:ui=@{Girl=[Windows.Controls.Image]::new();Root=[Windows.Controls.Grid]::new()}
$script:window=[Windows.Window]::new();$script:context=[Windows.Controls.ContextMenu]::new()
$script:activeCharacter=@{name='GPT娘'}
$checks=0
function Check($v,$label){if(!$v){throw $label};$script:checks++}
try{
 Initialize-WidgetIdentityHover;$script:identityHoverTimer.Stop()
 $popup=$script:identityHoverPopup;Initialize-WidgetIdentityHover
 Check ($popup-eq $script:identityHoverPopup) 'Idempotent initialization'
 Check ($script:identityGrabCursor-ne [Windows.Input.Cursors]::Hand) 'Custom grab cursor loaded'
 Check ($script:identityGrabbedCursor-ne [Windows.Input.Cursors]::SizeAll) 'Custom grabbing cursor loaded'
 Check (!$popup.IsHitTestVisible -and !$script:identityHoverBorder.IsHitTestVisible) 'No input interception'
 Check (![Windows.Controls.ToolTipService]::GetIsEnabled($script:ui.Girl)) 'Native tooltip removed'
 Check ($script:identityHoverText.FontFamily.Source-eq './#SSRuanTangTi') 'Original font family'
 foreach($size in @(240,377.5,462,640)){
  Set-WidgetIdentityHoverStyle $size
  Check ([Math]::Abs($script:identityHoverText.FontSize-$size*.026)-lt .0001) 'Font matches source ratio'
  Check ([Math]::Abs($script:identityHoverBorder.Padding.Left-$size*.021)-lt .0001) 'Padding matches source ratio'
  Check ([Math]::Abs($script:identityHoverBorder.CornerRadius.TopLeft-$size*.016)-lt .0001) 'Radius matches source ratio'
  Check ([Math]::Abs($script:identityHoverBorder.Effect.BlurRadius-$size*.026)-lt .0001) 'Shadow matches source ratio'
 }
 Check ($script:identityHoverBorder.Background.Color.A-eq 245) 'White background opacity'
 Check ($script:identityHoverBorder.BorderBrush.Color.R-eq 223) 'Border opacity'
 Check ($script:identityHoverText.Text-eq 'GPT娘') 'Only character display name'
 $vectors=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'placement-vectors.json'))|ConvertFrom-Json
 foreach($v in $vectors){
  $p=Get-WidgetIdentityPlacement $v.x $v.y $v.w $v.h $v.left $v.top $v.right $v.bottom $v.gap
  Check ([Math]::Abs($p.X-$v.expected.x)-lt .0001 -and [Math]::Abs($p.Y-$v.expected.y)-lt .0001) 'Placement equals original shared-core'
 }
  $widgetFile='$env:LOCALAPPDATA\Programs\GPTNiangUsage\gpt-niang-usage\widget.ps1'
  $tokens=$null;$errors=$null;$ast=[Management.Automation.Language.Parser]::ParseInput([IO.File]::ReadAllText($widgetFile,[Text.Encoding]::UTF8),[ref]$tokens,[ref]$errors)
  $fn=$ast.Find({param($node)$node-is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name-eq 'Test-GirlAlpha'},$true)
  . ([ScriptBlock]::Create($fn.ToString()))
  $script:ui.Girl.Width=200;$script:ui.Girl.Height=200;$script:ui.Root.Width=200;$script:ui.Root.Height=200
  $script:ui.Root.Children.Add($script:ui.Girl)|Out-Null
  $script:ui.Root.Measure([Windows.Size]::new(200,200));$script:ui.Root.Arrange([Windows.Rect]::new(0,0,200,200))
  $script:bitmap=[Windows.Media.Imaging.WriteableBitmap]::new(4,4,96,96,[Windows.Media.PixelFormats]::Bgra32,$null)
  $script:alphaStride=16;$script:alphaPixels=New-Object byte[] 64;$script:alphaPixels[23]=255
  $script:ui.Girl.Source=$script:bitmap;$script:ui.Root.Measure([Windows.Size]::new(200,200));$script:ui.Root.Arrange([Windows.Rect]::new(0,0,200,200));$script:ui.Root.UpdateLayout()
  Check (Test-GirlAlpha ([Windows.Point]::new(75,75))) 'Opaque body pixel uses existing production hit test'
  Check (!(Test-GirlAlpha ([Windows.Point]::new(25,25)))) 'Transparent character canvas is excluded'
  Check (!(Test-GirlAlpha ([Windows.Point]::new(250,75)))) 'Outside character is excluded'
 # Offline rendering of the actual WPF visual tree, without capturing the user's desktop.
 Set-WidgetIdentityHoverStyle 462
 $canvas=[Windows.Controls.Canvas]::new();$canvas.Width=260;$canvas.Height=95;$canvas.Background=[Windows.Media.BrushConverter]::new().ConvertFromString('#eceff3')
  $script:identityHoverSurface.Child=$null
  $canvas.Children.Add($script:identityHoverBorder)|Out-Null
 [Windows.Controls.Canvas]::SetLeft($script:identityHoverBorder,65);[Windows.Controls.Canvas]::SetTop($script:identityHoverBorder,30)
 $canvas.Measure([Windows.Size]::new(260,95));$canvas.Arrange([Windows.Rect]::new(0,0,260,95));$canvas.UpdateLayout()
 $bitmap=[Windows.Media.Imaging.RenderTargetBitmap]::new(520,190,192,192,[Windows.Media.PixelFormats]::Pbgra32);$bitmap.Render($canvas)
 $encoder=[Windows.Media.Imaging.PngBitmapEncoder]::new();$encoder.Frames.Add([Windows.Media.Imaging.BitmapFrame]::Create($bitmap))
 $out=Join-Path $PSScriptRoot 'wpf-preview.png';$stream=[IO.File]::Create($out);try{$encoder.Save($stream)}finally{$stream.Dispose()}
 @{ok=$true;checks=$checks;desktopInput=$false;render=$out;placementComparedTo='app/electron-helper/shared-core.js'}|ConvertTo-Json
}finally{$script:identityHoverTimer.Stop();$script:window.Close();$script:identityGrabCursor.Dispose();$script:identityGrabbedCursor.Dispose()}
