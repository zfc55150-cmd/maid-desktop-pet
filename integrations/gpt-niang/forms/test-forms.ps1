param([string]$Stage,[string]$Report)
$ErrorActionPreference='Stop';$script:checks=0
function Check([bool]$Value,[string]$Message){if(!$Value){throw $Message};$script:checks++}
$source=[IO.File]::ReadAllText((Join-Path $Stage 'widget.ps1'),[Text.Encoding]::UTF8)
$null=. ([ScriptBlock]::Create($source)) -CheckOnly -AppDir $Stage
$script:dragonTestMode=$true;$script:hostHandle=[IntPtr]::Zero
Save-Settings # Normalize the isolated minimal fixture before testing real bubble open/close saves.
$settingsFile=Join-Path $script:dataDir 'settings.json';$settingsHash=(Get-FileHash $settingsFile).Hash
Write-WidgetJson (Join-Path $script:dataDir 'pet-form.json') @{version=1;form='full'}
Initialize-WidgetSettingsMenu;Initialize-WidgetDesktopInteraction;Initialize-WidgetPetForms
Check ($script:widgetPetForm-eq 'full') 'Default full form'
Check ([bool]$script:petBustFrame) 'Real bust image decoded'
$script:window.Left=-10000;$script:window.Top=-10000;$script:window.Show();$script:window.UpdateLayout()
$script:widgetHandle=([Windows.Interop.WindowInteropHelper]::new($script:window)).Handle
function Pump([int]$Milliseconds){$until=[DateTime]::UtcNow.AddMilliseconds($Milliseconds);while([DateTime]::UtcNow-lt $until){$null=$script:window.Dispatcher.Invoke([Action]{},[Windows.Threading.DispatcherPriority]::Background);Start-Sleep -Milliseconds 8}}
Start-DragonAnimation
for($i=0;$i-lt 150;$i++){Tick-DragonAnimation;Pump 20;if($script:dragonPresentedTotal-gt 1){break}}
Check ($script:dragonPresentedTotal-gt 1) 'Full-body frames play'
Sync-WidgetCompactMenu
Check (@($script:context.Items|Where-Object{$_.Header-eq '切换形态'}).Count-eq 1) 'Single direct toggle menu'
Check (!$script:petFormMenu.HasItems) 'No form submenu'
$before=@($script:window.Left,$script:window.Top,$script:window.Width,$script:window.Height,$script:desktopLeft,$script:desktopTop,$script:scale,$script:bubbleScale,[Windows.Controls.Canvas]::GetLeft($script:ui.Girl),[Windows.Controls.Canvas]::GetTop($script:ui.Girl),$script:ui.Girl.Width,$script:ui.Girl.Height,$script:ui.FacingScale.ScaleX)
function Unchanged {
 $after=@($script:window.Left,$script:window.Top,$script:window.Width,$script:window.Height,$script:desktopLeft,$script:desktopTop,$script:scale,$script:bubbleScale,[Windows.Controls.Canvas]::GetLeft($script:ui.Girl),[Windows.Controls.Canvas]::GetTop($script:ui.Girl),$script:ui.Girl.Width,$script:ui.Girl.Height,$script:ui.FacingScale.ScaleX)
 Check (($before|ConvertTo-Json -Compress)-eq ($after|ConvertTo-Json -Compress)) 'Window, character canvas, facing and settings do not jump'
}
function Capture([string]$Name){
 $script:ui.Root.UpdateLayout();$width=[int][Math]::Ceiling($script:ui.Root.ActualWidth);$height=[int][Math]::Ceiling($script:ui.Root.ActualHeight)
 $image=[Windows.Media.Imaging.RenderTargetBitmap]::new($width,$height,96,96,[Windows.Media.PixelFormats]::Pbgra32);$image.Render($script:ui.Root)
 $png=[Windows.Media.Imaging.PngBitmapEncoder]::new();$png.Frames.Add([Windows.Media.Imaging.BitmapFrame]::Create($image));$stream=[IO.File]::Create((Join-Path (Split-Path $Report -Parent) $Name));try{$png.Save($stream)}finally{$stream.Dispose()}
}
Capture 'full.png'
$script:petFormMenu.RaiseEvent([Windows.RoutedEventArgs]::new([Windows.Controls.MenuItem]::ClickEvent));Pump 350
Check ($script:widgetPetForm-eq 'bust' -and !$script:petFormTransition) 'Toggle fades into bust'
Check ($script:ui.Girl.Opacity-eq 1) 'Fade ends visible'
Unchanged
Check ($script:petFormActionsMenu.Visibility-eq 'Collapsed') 'Full-body action menu hidden in bust'
for($i=0;$i-lt 4;$i++){Tick-DragonAnimation;Pump 25}
Check ([object]::ReferenceEquals($script:ui.Girl.Source,$script:petBustFrame.image)) 'Animation clock cannot overwrite half form'
Check ($script:petBustFrame.image.PixelWidth-ge 2048 -and $script:petBustFrame.image.PixelHeight-ge 2048) 'Bust retains high resolution before zoom'
$normalized=[Windows.Media.Imaging.TransformedBitmap]::new($script:petBustFrame.image,[Windows.Media.ScaleTransform]::new((384.0/$script:petBustFrame.image.PixelWidth),(384.0/$script:petBustFrame.image.PixelHeight)))
$bytes=New-Object byte[] (384*384*4);$normalized.CopyPixels($bytes,384*4,0)
$minX=384;$minY=384;$maxX=-1;$maxY=-1
for($y=0;$y-lt 384;$y++){for($x=0;$x-lt 384;$x++){if($bytes[($y*384+$x)*4+3]-gt 8){$minX=[Math]::Min($minX,$x);$minY=[Math]::Min($minY,$y);$maxX=[Math]::Max($maxX,$x);$maxY=[Math]::Max($maxY,$y)}}}
Check ($maxY-ge 357 -and $maxY-le 359) 'Bust uses full-body foot baseline'
Check ($maxX-$minX-ge 230 -and $maxX-$minX-le 240 -and $maxY-$minY-lt 200) 'Half form is readable and remains shorter than full body'
Capture 'bust.png'
$now=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
Hide-Quota;Pump 550
$script:petBubbleNextAt=$now-1;$script:petBubbleLastTick=$now-1000
Tick-WidgetAutoQuote $now $true;Pump 750
Check (!$script:collapsed -and $script:bubbleMode-eq 'quote' -and $script:ui.QuoteText.Text.Length-gt 0) 'Real local quote renders without click'
Capture 'bust-auto-bubble.png'
Hide-Quota;Pump 550
Add-WidgetPetBubbleMenu;Add-WidgetPetBubbleMenu
$settingsMenu=@($script:context.Items|Where-Object{$_.Header-eq '设置'})[0]
$autoMenus=@($settingsMenu.Items|Where-Object{$_.Tag-eq 'pet-form-auto-bubble'})
Check ($autoMenus.Count-eq 1 -and $autoMenus[0].IsChecked) 'One enabled random bubble checkbox'
$autoMenus[0].IsChecked=$false;$autoMenus[0].RaiseEvent([Windows.RoutedEventArgs]::new([Windows.Controls.MenuItem]::ClickEvent))
Check (!$script:petAutoBubbleEnabled) 'Random bubble setting turns off'
$autoMenus[0].IsChecked=$true;$autoMenus[0].RaiseEvent([Windows.RoutedEventArgs]::new([Windows.Controls.MenuItem]::ClickEvent))
Check ($script:petAutoBubbleEnabled) 'Random bubble setting turns on'
$script:quoteCalls=0;$script:quotaCalls=0;$script:collapsed=$true
function Show-Quota {$script:quotaCalls++;$script:collapsed=$false;$script:bubbleEpoch++}
function Show-Quote {$script:quoteCalls++}
Click-Character;Check ($script:quotaCalls-eq 1 -and $script:quoteCalls-eq 0) 'First half click shows quota'
Click-Character;Check ($script:quoteCalls-eq 1) 'Next half click invokes existing quotes'
$script:completionPending=$true;Click-Character;Check ($script:quoteCalls-eq 1) 'Completion bubble has priority';$script:completionPending=$false
Set-WidgetPetForm full;Pump 350;Unchanged
Check ($script:petFormActionsMenu.Visibility-eq 'Visible') 'Full actions return'
for($i=0;$i-lt 8;$i++){Tick-DragonAnimation;Pump 25}
Check (![object]::ReferenceEquals($script:ui.Girl.Source,$script:petBustFrame.image)) 'Full animation resumes'
Set-WidgetPetForm bust;Set-WidgetPetForm full;Pump 650
Check ($script:widgetPetForm-eq 'full' -and !$script:petFormTransition) 'Rapid requests use final selection';Unchanged
function Test-WidgetPetFormAnimation {return $false}
Set-WidgetPetForm bust;Check ($script:widgetPetForm-eq 'bust' -and !$script:petFormTransition) 'Reduced motion switches immediately';Unchanged
Set-WidgetPetForm full
Check ((Get-FileHash $settingsFile).Hash-eq $settingsHash) 'Personal settings remain byte-identical'
$saved=[IO.File]::ReadAllText((Join-Path $script:dataDir 'pet-form.json'))|ConvertFrom-Json
Check ($saved.form-eq 'full' -and @($saved.PSObject.Properties.Name).Count-eq 3 -and $saved.autoBubble) 'Stores form, bubble preference and schema version without coordinates'
$script:petFormsReady=$false;Write-WidgetJson (Join-Path $script:dataDir 'pet-form.json') @{version=1;form='bust'}
Initialize-WidgetPetForms;Check ($script:widgetPetForm-eq 'bust' -and [object]::ReferenceEquals($script:bitmap,$script:petBustFrame.image)) 'Saved half restores before first display'
function Read-WidgetPetBustFrame {throw 'FAKE_MISSING_IMAGE'}
Set-DragonCachedFrame $script:petFormFullFrame
$script:petFormsReady=$false;Initialize-WidgetPetForms
Check ($script:widgetPetForm-eq 'full' -and !$script:petFormMenu.IsEnabled) 'Missing image retains full form with disabled switch'
Stop-DragonAnimation;$script:window.Close()
@{ok=$true;checks=$script:checks;realWpf=$true;positionUnchanged=$true;compactBust=@{left=$minX;top=$minY;right=$maxX;bottom=$maxY};paidCalls=0}|ConvertTo-Json|Set-Content -LiteralPath $Report -Encoding UTF8
