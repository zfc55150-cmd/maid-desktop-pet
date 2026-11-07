param([string]$ReportRoot=(Join-Path $PSScriptRoot '../work/gpt-startup-fix-20261101-01'),[string]$WidgetSource)
$ErrorActionPreference='Stop'
$ReportRoot=[IO.Path]::GetFullPath($ReportRoot);$null=[IO.Directory]::CreateDirectory($ReportRoot)
$installed=Join-Path $env:LOCALAPPDATA 'Programs/GPTNiangUsage/gpt-niang-usage'
$fake=Join-Path $ReportRoot 'fake-state';$null=[IO.Directory]::CreateDirectory($fake)
[IO.File]::WriteAllText((Join-Path $fake 'settings.json'),'{"scale":1.4,"bubbleScale":1.4,"dragonMotionVersion":1,"dragonCodexEnabled":false,"followHost":false,"desktopLeft":100,"desktopTop":100}',[Text.UTF8Encoding]::new($false))
$source=[IO.File]::ReadAllText((Join-Path $installed 'widget.ps1'))
if($WidgetSource){$source=[IO.File]::ReadAllText($WidgetSource)}
$source=$source.Replace('$script:dataDir=$script:config.dataDir',("`$script:dataDir='"+$fake.Replace("'","''")+"'"))
$null=. ([ScriptBlock]::Create($source)) -CheckOnly -AppDir $installed
$script:dragonTestMode=$true;$script:hostHandle=[IntPtr]::Zero
$script:dragonCodexEnabled=$false;$script:context=[Windows.Controls.ContextMenu]::new()
$rows=New-Object 'System.Collections.Generic.List[object]'
function Sample([string]$Stage){
 $s=[Windows.PresentationSource]::FromVisual($script:window);$matrix=if($s -and $s.CompositionTarget){$s.CompositionTarget.TransformToDevice.M11}else{$null}
 $nativeDpi=if($script:widgetHandle){[GptWidgetNative]::GetDpiForWindow($script:widgetHandle)}else{0}
 $rows.Add(@{stage=$Stage;windowWidth=$script:window.Width;windowHeight=$script:window.Height;visible=$script:window.IsVisible;compositionScale=$matrix;nativeDpi=$nativeDpi;placementDpi=(Get-WidgetPlacementDpi);displayScale=$script:displayScale;girlWidth=$script:ui.Girl.Width;girlHeight=$script:ui.Girl.Height;imageWidth=$script:bitmap.PixelWidth;imageHeight=$script:bitmap.PixelHeight;fullPreview=[bool]$script:petFormFullFrame;clip=$script:dragonClip;frame=$script:dragonFrameIndex;error=$script:dragonLastError})
}
Sample 'check-only'
try{$full=Read-WidgetPetFullFrame;$previewError=$null}catch{$previewError=$_.Exception.Message}
Initialize-WidgetPetForms
Sample 'forms'
$script:window.Left=-10000;$script:window.Top=-10000
$interop=[Windows.Interop.WindowInteropHelper]::new($script:window);$script:widgetHandle=$interop.EnsureHandle()
Set-Appearance;Sample 'handle-and-appearance'
Start-DragonAnimation;$script:dragonTimer.Stop();Sample 'animation-start'
$script:window.Show();Sample 'show'
$script:window.UpdateLayout();Sample 'show-layout'
Set-Appearance;Sample 'post-show-appearance'
for($n=0;$n-lt 100;$n++){
 Tick-DragonAnimation
 $null=$script:window.Dispatcher.Invoke([Action]{},[Windows.Threading.DispatcherPriority]::Background)
 if($n-lt 8 -or $n-eq 99){Sample ('tick-'+$n)}
 Start-Sleep -Milliseconds 10
}
Stop-DragonAnimation;$script:window.Close()
$result=@{previewError=$previewError;rows=$rows.ToArray()}
[IO.File]::WriteAllText((Join-Path $ReportRoot 'startup-probe.json'),($result|ConvertTo-Json -Depth 6),[Text.UTF8Encoding]::new($false));$result|ConvertTo-Json -Depth 6
