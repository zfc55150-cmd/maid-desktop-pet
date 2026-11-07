param([string]$Stage,[string]$Report)
$ErrorActionPreference='Stop';$script:checks=0
function Check([bool]$Value,[string]$Message){if(!$Value){throw $Message};$script:checks++}
$now=[DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$fake=@{ok=$true;queryOk=$true;observedAt=$now*1000;planLabel='测试套餐';windows=@(@{minutes=300;used=18;remaining=82;resetsAt=$now+7200},@{minutes=10080;used=49;remaining=51;resetsAt=$now+259200})}
$statusPath=Join-Path $Stage 'data/status.json'
[IO.File]::WriteAllText($statusPath,($fake|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
$null=. ([ScriptBlock]::Create([IO.File]::ReadAllText((Join-Path $Stage 'widget.ps1')))) -CheckOnly -AppDir $Stage
$script:hostHandle=[IntPtr]::Zero;$script:dragonTestMode=$true
Initialize-WidgetSettingsMenu;Initialize-WidgetDesktopInteraction;Initialize-WidgetPetForms
function Test-WidgetPetFormAnimation {return $false}
$script:window.ShowActivated=$false;$script:window.Left=-12000;$script:window.Top=-12000;$script:window.Show();$script:window.UpdateLayout()
$script:widgetHandle=([Windows.Interop.WindowInteropHelper]::new($script:window)).Handle
function Pump([int]$Ms){$end=[DateTime]::UtcNow.AddMilliseconds($Ms);while([DateTime]::UtcNow-lt $end){$null=$script:window.Dispatcher.Invoke([Action]{},[Windows.Threading.DispatcherPriority]::Background);Start-Sleep -Milliseconds 5}}
function Capture([string]$Name){
 $view=$script:window.Content;$view.UpdateLayout();$w=[int][Math]::Ceiling($view.ActualWidth);$h=[int][Math]::Ceiling($view.ActualHeight)
 $image=[Windows.Media.Imaging.RenderTargetBitmap]::new($w,$h,96,96,[Windows.Media.PixelFormats]::Pbgra32);$image.Render($view)
 $png=[Windows.Media.Imaging.PngBitmapEncoder]::new();$png.Frames.Add([Windows.Media.Imaging.BitmapFrame]::Create($image));$stream=[IO.File]::Create((Join-Path (Split-Path $Report -Parent) $Name));try{$png.Save($stream)}finally{$stream.Dispose()}
}
$samples=@()
foreach($form in @('bust','full')){
 Set-WidgetPetForm $form;$script:scale=1.4;Set-Appearance
 if($form-eq 'full'){Start-DragonAnimation;Tick-DragonAnimation;Pump 150}
 $script:collapsed=$true;Set-BubbleState
 if($form-eq 'full'){
   Click-Character;Check ($script:collapsed) 'Full click keeps the bubble closed'
   Show-Quota # The explicit quota command remains available in full form.
 }else{Click-Character}
 Pump 550
 Check (!$script:collapsed -and $script:bubbleMode-eq 'quota') ('Quota remains available in '+$form)
 Update-Quota;$script:window.UpdateLayout()
 Check ($script:ui.Bubble.Width-eq 160 -and $script:ui.Bubble.Height-lt 110) 'Quota card is narrower and shorter'
 Check ($script:ui.Bubble.Width*$script:ui.Bubble.Height-lt 206*137*0.7) 'Quota card area drops by at least 30 percent'
 Check ($script:ui.ShortLeft.Text-eq '82%' -and $script:ui.WeekLeft.Text-eq '51%') 'Both quota values retained'
 Check ([Math]::Abs($script:ui.ShortBar.Width-144*0.82)-lt 0.001 -and [Math]::Abs($script:ui.WeekBar.Width-144*0.51)-lt 0.001) 'Progress bars fit new width and keep percentages'
 Check ($script:ui.ShortReset.Text.Length-gt 0 -and $script:ui.WeekReset.Text.Length-gt 0) 'Both reset times retained'
 Check ($script:ui.QuotaText.DesiredSize.Height-le $script:ui.SceneText.Height) 'Quota rows fit inside content area'
 Check ($script:ui.Refresh.IsVisible -and $script:ui.Refresh.ActualWidth-ge 14) 'Inline refresh remains available'
 $samples+=@{form=$form;width=$script:ui.Bubble.Width;height=$script:ui.Bubble.Height;contentHeight=$script:ui.SceneText.Height;quotaHeight=$script:ui.QuotaText.ActualHeight;scale=$script:scale}
 Capture ('quota-'+$form+'.png')
 if($form-eq 'bust'){
   Click-Character;Pump 350
   Check ($script:bubbleMode-eq 'quote' -and $script:ui.QuoteText.Text.Length-gt 0) 'Second small click shows local quote'
   $revision=$script:sceneRevision;Click-Character;Pump 350
   Check (!$script:collapsed -and $script:bubbleMode-eq 'quote' -and $script:sceneRevision-gt $revision) 'More small clicks keep changing quotes'
   Check ([Math]::Abs($script:ui.QuoteText.FontSize*1.4-16.32)-lt 0.001) 'Quote typography keeps accepted size'
   Tick-Scene ($script:sceneDeadline+1);Pump 550;Click-Character;Pump 500
   Check ($script:bubbleMode-eq 'quota' -and !$script:collapsed) 'After automatic close first click starts with quota again'
   Hide-Quota;Pump 550;Show-Quote;Pump 500;Click-Character;Pump 350
   Check ($script:bubbleMode-eq 'quota') 'First manual click after an automatic quote still opens quota'
   $script:completionPending=$true;$revision=$script:sceneRevision;Click-Character
   Check ($script:sceneRevision-eq $revision) 'Pending completion still has priority';$script:completionPending=$false
 }
}
Set-WidgetPetForm bust;Click-Character;Pump 350
Check ($script:bubbleMode-eq 'quota') 'Returning to small form starts with quota'
$twoRows=$script:ui.Bubble.Height
$fake.windows=@($fake.windows[0]);$fake.observedAt=($now+1)*1000
[IO.File]::WriteAllText($statusPath,($fake|ConvertTo-Json -Depth 8));$script:statusStamp=0;Update-Quota;$script:window.UpdateLayout()
Check ($script:ui.WeekRow.Visibility-eq 'Collapsed' -and $script:ui.Bubble.Height-lt $twoRows-20) 'Single available quota shrinks card instead of leaving an empty row'
$fake.queryOk=$false;$fake.ok=$false;$fake.windows=@();$fake.error='测试读取异常'
[IO.File]::WriteAllText($statusPath,($fake|ConvertTo-Json -Depth 8));$script:statusStamp=0;Update-Quota;$script:window.UpdateLayout()
Check ($script:ui.Header.Text-eq '暂无法读取' -and $script:ui.ShortReset.Text-eq '额度读取异常') 'Error state remains readable'
Check ($script:ui.QuotaText.DesiredSize.Height-le $script:ui.SceneText.Height) 'Error state still fits compact card'
Stop-DragonAnimation;$script:window.Close()
@{ok=$true;checks=$script:checks;realWpf=$true;fakeQuotaDataOnly=$true;paidCalls=0;samples=$samples}|ConvertTo-Json -Depth 5|Set-Content $Report -Encoding UTF8
