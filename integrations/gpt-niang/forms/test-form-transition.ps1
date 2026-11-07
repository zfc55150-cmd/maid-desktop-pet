param([string]$Stage,[string]$Report,[switch]$ObserveOld)
$ErrorActionPreference='Stop';$script:checks=0
function Check([bool]$Value,[string]$Message){if(!$Value){throw $Message};$script:checks++}
$null=. ([ScriptBlock]::Create([IO.File]::ReadAllText((Join-Path $Stage 'widget.ps1')))) -CheckOnly -AppDir $Stage
$script:dragonTestMode=$true;$script:hostHandle=[IntPtr]::Zero
Write-WidgetJson (Join-Path $script:dataDir 'pet-form.json') @{version=1;form='bust';autoBubble=$false}
Initialize-WidgetSettingsMenu;Initialize-WidgetDesktopInteraction;Initialize-WidgetPetForms
$script:window.ShowActivated=$false;$script:window.Left=-12000;$script:window.Top=-12000;$script:window.Show();$script:window.UpdateLayout()
$script:widgetHandle=([Windows.Interop.WindowInteropHelper]::new($script:window)).Handle
Start-DragonAnimation
Check ($script:widgetPetForm-eq 'bust') 'Start from saved small form, with full animation still cold'
$script:cell=[int]$script:dragonManifest.cellSize
$script:unexpected=0;$script:bodyFrames=0;$script:sampleCount=0;$script:record=$false
function Capture([string]$Name){
 $view=$script:window.Content;$view.UpdateLayout();$w=[int][Math]::Ceiling($view.ActualWidth);$h=[int][Math]::Ceiling($view.ActualHeight)
 $image=[Windows.Media.Imaging.RenderTargetBitmap]::new($w,$h,96,96,[Windows.Media.PixelFormats]::Pbgra32);$image.Render($view)
 $png=[Windows.Media.Imaging.PngBitmapEncoder]::new();$png.Frames.Add([Windows.Media.Imaging.BitmapFrame]::Create($image));$stream=[IO.File]::Create((Join-Path (Split-Path $Report -Parent) $Name));try{$png.Save($stream)}finally{$stream.Dispose()}
}
function Pump([int]$Ms){
 $until=[DateTime]::UtcNow.AddMilliseconds($Ms)
 while([DateTime]::UtcNow-lt $until){
   $null=$script:window.Dispatcher.Invoke([Action]{},[Windows.Threading.DispatcherPriority]::Background)
   if($script:record){
     $source=$script:ui.Girl.Source;$script:sampleCount++
     if($script:ui.Girl.Opacity-gt 0.05 -and $source){
       if([object]::ReferenceEquals($source,$script:petBustFrame.image)){} # Correct original small pose during fade-out.
       elseif($source.PixelWidth-eq $script:cell -and $source.PixelHeight-eq $script:cell){$script:bodyFrames++}
       else{$script:unexpected++;if($script:unexpected-eq 1){Capture 'unexpected-large-portrait.png'}}
     }
   }
   Start-Sleep -Milliseconds 4
 }
}
$originalLoader=(Get-Command Get-DragonMotionFrame).ScriptBlock
function Get-DragonMotionFrame([string]$Clip,[int]$Index){if([DateTime]::UtcNow-lt $script:holdUntil){return $null};return (& $script:originalLoader $Clip $Index)}
$script:originalLoader=$originalLoader
$script:holdUntil=[DateTime]::UtcNow.AddMilliseconds(900)
$before=@($script:window.Width,$script:window.Height,$script:window.Left,$script:window.Top,$script:scale,$script:ui.Girl.Width,$script:ui.Girl.Height)
$script:record=$true;Set-WidgetPetForm full;Pump 700
$coldUnexpected=$script:unexpected;$coldBodyFrames=$script:bodyFrames
Capture 'cold-full-transition.png'
if(!$ObserveOld){
 Check ($coldUnexpected-eq 0) 'Cold full switch never exposes the enlarged static portrait'
 Check ($coldBodyFrames-gt 0) 'Real full-body preview appears even while animation decoding is delayed'
}
Pump 650;$script:record=$false
if(!$ObserveOld){
 Check ($script:dragonPresentedTotal-gt 0) 'Full-body motion takes over when decoding becomes ready'
 Check (($before|ConvertTo-Json -Compress)-eq (@($script:window.Width,$script:window.Height,$script:window.Left,$script:window.Top,$script:scale,$script:ui.Girl.Width,$script:ui.Girl.Height)|ConvertTo-Json -Compress)) 'Window, character size and anchor stay unchanged'
 foreach($gap in @(0,35,85,145,240)){
   Set-WidgetPetForm bust;Pump 300;$script:unexpected=0;$script:record=$true
   Set-WidgetPetForm full;Pump $gap;Set-WidgetPetForm bust;Pump 350;Set-WidgetPetForm full;Pump 350
   $script:record=$false
   Check ($script:unexpected-eq 0 -and $script:widgetPetForm-eq 'full' -and !$script:petFormTransition) ('Rapid transition stays clean with gap '+$gap)
 }
 $script:dragonAnimationEnabled=$false;Tick-DragonAnimation
 Set-WidgetPetForm bust;Pump 300;$script:unexpected=0;$script:record=$true;Set-WidgetPetForm full;Pump 350;$script:record=$false
 Check ($script:unexpected-eq 0 -and $script:ui.Girl.Source.PixelWidth-eq $script:cell) 'Disabled motion still shows correct full-body static pose'
 function Test-WidgetPetFormAnimation {return $false}
 Set-WidgetPetForm bust;Set-WidgetPetForm full
 Check ($script:ui.Girl.Source.PixelWidth-eq $script:cell -and !$script:petFormTransition) 'Reduced motion switches directly to real full-body frame'
}
Stop-DragonAnimation;$script:window.Close()
@{ok=$true;checks=$script:checks;observeOld=[bool]$ObserveOld;coldUnexpected=$coldUnexpected;coldBodySamples=$coldBodyFrames;samples=$script:sampleCount;realWpf=$true;fakeDecoderDelayMs=900;paidCalls=0}|ConvertTo-Json|Set-Content $Report -Encoding UTF8
