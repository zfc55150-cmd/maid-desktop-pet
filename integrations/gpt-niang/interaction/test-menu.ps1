param([Parameter(Mandatory=$true)][string]$Stage,[Parameter(Mandatory=$true)][string]$Report)
$ErrorActionPreference='Stop'
$script:checks=0
function Check([bool]$Condition,[string]$Message){if(!$Condition){throw $Message};$script:checks++}
$stagePath=[IO.Path]::GetFullPath($Stage)
$source=[IO.File]::ReadAllText((Join-Path $stagePath 'widget.ps1'),[Text.Encoding]::UTF8)
$null=. ([ScriptBlock]::Create($source)) -CheckOnly -AppDir $stagePath
$script:hostHandle=[IntPtr]::Zero
$script:widgetHandle=([Windows.Interop.WindowInteropHelper]::new($script:window)).EnsureHandle()
$script:dragonTestMode=$true
Initialize-WidgetAudio -AppDir $script:appDir -DataDir $script:dataDir
Initialize-WidgetSettingsMenu
Initialize-WidgetDesktopInteraction
if(Get-Command Initialize-WidgetPetForms -ErrorAction SilentlyContinue){Write-WidgetJson (Join-Path $script:dataDir 'pet-form.json') @{version=1;form='full'};Initialize-WidgetPetForms}
function Raise-WidgetForInteraction {}
# Construct the actual animation menu without starting the decoder or watcher.
$motion=[IO.File]::ReadAllText((Join-Path $stagePath 'runtime/dragon-animation/motion-runtime.ps1'),[Text.Encoding]::UTF8)
$tokens=$null;$errors=$null
$ast=[Management.Automation.Language.Parser]::ParseInput($motion,[ref]$tokens,[ref]$errors)
$menuBlock=$ast.Find({param($n)$n-is [Management.Automation.Language.IfStatementAst] -and $n.Extent.Text.StartsWith('if($script:context){')},$true)
if(!$menuBlock){throw 'Animation menu block missing'}
$manifest=Get-Content (Join-Path $stagePath 'runtime/dragon-animation/animation.json') -Raw -Encoding UTF8|ConvertFrom-Json
$script:dragonManifest=$manifest;$states=@($manifest.states.PSObject.Properties.Name)
. ([ScriptBlock]::Create($menuBlock.Extent.Text))
function Get-Leaves($Items){foreach($item in $Items){if($item-is [Windows.Controls.MenuItem]){if($item.HasItems){Get-Leaves $item.Items}elseif($item.IsEnabled -and $item.IsHitTestVisible -and (Get-WidgetMenuLabel $item)){$item}}}}
function Get-Items($Items){foreach($item in $Items){if($item-is [Windows.Controls.MenuItem]){$item;if($item.HasItems){Get-Items $item.Items}}}}
$before=@(Get-Leaves $script:context.Items)
$actionLeaves=@($before|Where-Object{$_.Tag-is [string] -and $_.Tag-in $states})
$originalTags=@($actionLeaves|ForEach-Object{$_.Tag})
Sync-WidgetCompactMenu
$after=@(Get-Leaves $script:context.Items)
foreach($leaf in $before){Check (@($after|Where-Object{[object]::ReferenceEquals($_,$leaf)}).Count-eq 1) ('Lost or duplicated command: '+(Get-WidgetMenuLabel $leaf))}
Check ($script:context.Items.Count-eq $(if($script:petFormMenu){10}else{9})) 'Home menu is too long'
$labels=@($script:context.Items|Where-Object{$_-is [Windows.Controls.MenuItem]}|ForEach-Object{Get-WidgetMenuLabel $_})
Check (($labels-join '|')-eq $(if($script:petFormMenu){'查看额度|换一句台词|切换形态|调整大小|显示与位置|动作|设置|退出 GPT 娘'}else{'查看额度|换一句台词|调整大小|显示与位置|动作|设置|退出 GPT 娘'})) ('Unexpected home: '+($labels-join '|'))
foreach($item in @(Get-Items $script:context.Items)){Check ($item.Style-eq $script:compactMenuResources['CompactItem']) 'Mixed menu styles remain'}
Check (($actionLeaves|ForEach-Object{$_.Tag})-join '|' -eq ($originalTags-join '|')) 'Action identifiers were overwritten'
Check ($actionLeaves.Count-eq $states.Count) 'Action coverage changed'
foreach($action in @('wave','nod')){
 $item=@($actionLeaves|Where-Object{$_.Tag-eq $action})[0]
 $item.RaiseEvent([Windows.RoutedEventArgs]::new([Windows.Controls.MenuItem]::ClickEvent))
 Check ($script:dragonManualPhase-eq $action -and $script:dragonManualUntil-gt [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()) 'Action click failed after regrouping'
}
$count=$script:context.Items.Count
Sync-WidgetCompactMenu
Check ($script:context.Items.Count-eq $count) 'Reopening duplicated items'
$script:sizeSlider.Value=1.6
Check ($script:scale-eq 1.6) 'Size slider lost its original change handler'
$saved=Get-Content (Join-Path $script:dataDir 'settings.json') -Raw -Encoding UTF8|ConvertFrom-Json
Check ($saved.scale-eq 1.6) 'Size slider failed to save isolated settings'
$script:sizeSlider.Value=1.4
function Render-Menu($Visual,[string]$Name){
 $Visual.UpdateLayout()
 $width=[int][Math]::Ceiling($Visual.ActualWidth);$height=[int][Math]::Ceiling($Visual.ActualHeight)
 $bitmap=[Windows.Media.Imaging.RenderTargetBitmap]::new($width,$height,96,96,[Windows.Media.PixelFormats]::Pbgra32)
 $bitmap.Render($Visual);$png=[Windows.Media.Imaging.PngBitmapEncoder]::new();$png.Frames.Add([Windows.Media.Imaging.BitmapFrame]::Create($bitmap))
 $stream=[IO.File]::Create((Join-Path ([IO.Path]::GetDirectoryName($Report)) $Name));try{$png.Save($stream)}finally{$stream.Dispose()}
}
try{
 $script:window.Show();$script:window.UpdateLayout()
 $script:interactionMenuPoint=[pscustomobject]@{X=600;Y=300}
 Set-WidgetMenuBounds
 $script:context.IsOpen=$true;Position-WidgetMenuToHost
 Check ($script:context.ActualHeight-lt 300) 'Home still requires a tall scrolling panel'
 Render-Menu $script:context 'menu-home.png'
 foreach($label in @('动作','设置','调整大小','显示与位置')){
  $item=@($script:context.Items|Where-Object{$_-is [Windows.Controls.MenuItem] -and $_.Header-eq $label})[0]
  $item.IsSubmenuOpen=$true;$item.UpdateLayout()
  $popup=$item.Template.FindName('PART_Popup',$item)
  Check ($popup -and $popup.IsOpen -and $popup.Child.ActualWidth-gt 100) ('Submenu failed: '+$label)
  Render-Menu $popup.Child ('menu-'+@{'动作'='actions';'设置'='settings';'调整大小'='size';'显示与位置'='display'}[$label]+'.png')
  $item.IsSubmenuOpen=$false
 }
 # Esc uses the real routed handler installed by the interaction module.
 $key=[Windows.Input.KeyEventArgs]::new([Windows.Input.Keyboard]::PrimaryDevice,[Windows.PresentationSource]::FromVisual($script:window),0,[Windows.Input.Key]::Escape)
 $key.RoutedEvent=[Windows.Input.Keyboard]::PreviewKeyDownEvent
 $script:context.RaiseEvent($key)
 Check (!$script:context.IsOpen) 'Esc did not close the compact menu'
}finally{$script:context.IsOpen=$false;$script:window.Close();if($script:settingsMenuDismissTimer){$script:settingsMenuDismissTimer.Stop()};Stop-WidgetAudio}
$result=@{ok=$true;checks=$script:checks;home=$labels;rootEntries=$labels.Count;actions=$states.Count;allOriginalCommandsPreserved=$true;paidCalls=0;formalInstall=$false}
[IO.File]::WriteAllText($Report,($result|ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
$result|ConvertTo-Json -Depth 5
