param([string]$Stage,[string]$Report)
$ErrorActionPreference='Stop';$script:checks=0
function Check([bool]$Value,[string]$Message){if(!$Value){throw $Message};$script:checks++}
$source=[IO.File]::ReadAllText((Join-Path $Stage 'widget.ps1'))
$null=. ([ScriptBlock]::Create($source)) -CheckOnly -AppDir $Stage
$script:hostHandle=[IntPtr]::Zero;$script:dragonTestMode=$true
Initialize-WidgetSettingsMenu;Initialize-WidgetDesktopInteraction;Initialize-WidgetPetForms
function Test-WidgetPetFormAnimation {return $false}
Set-WidgetPetForm full
$script:window.Left=-12000;$script:window.Top=-12000;$script:window.Show();$script:window.UpdateLayout()
$script:hostEventTimer=[Windows.Threading.DispatcherTimer]::new();$script:hostEventTimer.Interval=[TimeSpan]::FromHours(1)
$script:collapsed=$true;Set-BubbleState
$script:completionPending=$false
$refresh=Join-Path $script:dataDir 'refresh.flag';if(Test-Path $refresh){Remove-Item -LiteralPath $refresh}
foreach($advance in @($false,$true)){
 $script:bubbleTapAdvance=$advance
 foreach($mode in @('quota','quote','completion')){
   $script:bubbleMode=$mode
   foreach($closed in @($true,$false)){
     $script:collapsed=$closed
     $before=@($script:collapsed,$script:bubbleMode,$script:bubbleEpoch,$script:sceneRevision,$script:sceneDeadline)
     for($i=0;$i-lt 5;$i++){Click-Character}
     $after=@($script:collapsed,$script:bubbleMode,$script:bubbleEpoch,$script:sceneRevision,$script:sceneDeadline)
     Check (($before-join ',')-eq ($after-join ',')) 'Full clicks neither open, change nor extend any bubble'
   }
 }
}
Check (!(Test-Path $refresh)) 'Full clicks do not request a quota refresh'
$script:touches=0
$script:settingsWrites=0
function Save-Settings {$script:settingsWrites++}
function Invoke-DragonTouch {$script:touches++;return $true}
$ast=[Management.Automation.Language.Parser]::ParseInput($source,[ref]$null,[ref]$null)
$assignment=$ast.Find({param($n)$n-is [Management.Automation.Language.AssignmentStatementAst] -and $n.Left.Extent.Text-eq '$pressUp'},$true)
$realUp=$assignment.Right.Expression.ScriptBlock.GetScriptBlock()
$up=[Windows.Input.MouseButtonEventArgs]::new([Windows.Input.Mouse]::PrimaryDevice,0,[Windows.Input.MouseButton]::Left)
$up.RoutedEvent=[Windows.UIElement]::MouseLeftButtonUpEvent
$script:collapsed=$true;Set-BubbleState;$script:petCatchPressFired=$false;$script:drag=@{moved=$false;music=$false}
& $realUp $script:ui.Girl $up
Check ($script:collapsed -and $script:touches-eq 0 -and [bool]$script:petFullClickScale -and [object]::ReferenceEquals($script:ui.Girl.Source,$script:petFullClickIdleFrame.image)) 'Real release shows the idle pose before rebound with no bubble or extra touch pose'
Check ($script:settingsWrites-eq 0) 'Ordinary full click performs no redundant settings write'
Reset-WidgetFullClick
$script:drag=@{moved=$true;music=$false};$script:touches=0
& $realUp $script:ui.Girl $up
Check ($script:touches-eq 0 -and $script:collapsed) 'Drag release does not become an ordinary click'
$script:drag=@{moved=$false;music=$false};$script:petCatchPressFired=$true
& $realUp $script:ui.Girl $up
Check ($script:touches-eq 0 -and !$script:petCatchPressFired -and $script:collapsed) 'Catch release consumes the flag without ordinary bubble or touch'
Show-Quota
Check (!$script:collapsed -and $script:bubbleMode-eq 'quota') 'Explicit quota action still works in full form'
$script:window.Close()
[IO.File]::WriteAllText($Report,(@{ok=$true;checks=$script:checks;realWpf=$true;realReleaseHandler=$true;paidCalls=0}|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
