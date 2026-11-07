param([string]$Report,[string]$Module)
$ErrorActionPreference='Stop';$script:checks=0
function Check([bool]$Value,[string]$Message){if(!$Value){throw $Message};$script:checks++}
function Tick-WidgetAutoQuote([long]$Now,[bool]$Visible){$script:originalTicks++}
function Reset-WidgetAutoQuoteSchedule([long]$Now){$script:originalResets++}
function Test-WidgetUpdateEditor {return $script:editorBusy}
function Show-Quote {$script:quotes++;$script:collapsed=$false;Reset-WidgetAutoQuoteSchedule $script:clock}
. ([ScriptBlock]::Create([IO.File]::ReadAllText($Module,[Text.Encoding]::UTF8)))
$script:petBubbleRandom=[Random]::new(8234)
$delays=@(1..100|ForEach-Object{Get-WidgetPetBubbleDelay})
Check (@($delays|Where-Object{$_-lt 120000 -or $_-gt 300000}).Count-eq 0) 'Every delay is 2-5 minutes'
Check (@($delays|Select-Object -Unique).Count-gt 90) 'Intervals vary instead of repeating a fixed period'
$script:context=[pscustomobject]@{IsOpen=$false};$script:petAutoBubbleEnabled=$true;$script:characterId='gpt-dragon';$script:widgetPetForm='bust';$script:collapsed=$true;$script:clock=10000;$script:quotes=0
Tick-WidgetAutoQuote $script:clock $true
Check ($script:quotes-eq 0 -and $script:petBubbleNextAt-ge $script:clock+120000) 'No immediate popup on entry'
$deadline=$script:petBubbleNextAt
while($script:clock+1000-lt $deadline){$script:clock+=1000;Tick-WidgetAutoQuote $script:clock $true}
Check ($script:quotes-eq 0) 'Never fires before deadline'
$script:clock=$deadline;Tick-WidgetAutoQuote $script:clock $true
Check ($script:quotes-eq 1 -and !$script:collapsed) 'One automatic bubble at the randomized deadline'
$script:clock+=1000;Tick-WidgetAutoQuote $script:clock $true
Check ($script:quotes-eq 1 -and $script:petBubbleNextAt-eq 0) 'Visible bubble cannot be overwritten'
$script:collapsed=$true;$script:clock+=1000;Tick-WidgetAutoQuote $script:clock $true
Check ($script:petBubbleNextAt-ge $script:clock+120000) 'Full quiet interval after bubble closes'
foreach($flag in @('petFormTransition','completionPending','drag','settingsSizePreview','editorBusy')){
 Set-Variable -Scope Script -Name $flag -Value $true
 $script:clock+=1000;Tick-WidgetAutoQuote $script:clock $true
 Check ($script:petBubbleNextAt-eq 0 -and $script:quotes-eq 1) ('Yields to '+$flag)
 Set-Variable -Scope Script -Name $flag -Value $false
 $script:clock+=1000;Tick-WidgetAutoQuote $script:clock $true
 Check ($script:petBubbleNextAt-ge $script:clock+120000) ('Restarts quiet interval after '+$flag)
}
$script:context.IsOpen=$true;$script:clock+=1000;Tick-WidgetAutoQuote $script:clock $true
Check ($script:petBubbleNextAt-eq 0) 'Open menu suppresses bubble';$script:context.IsOpen=$false
$script:characterGallery=[pscustomobject]@{IsVisible=$true};$script:clock+=1000;Tick-WidgetAutoQuote $script:clock $true
Check ($script:petBubbleNextAt-eq 0) 'Character gallery suppresses bubble';$script:characterGallery=$null
$script:widgetMusic=[pscustomobject]@{Enabled=$true};$script:clock+=1000;Tick-WidgetAutoQuote $script:clock $true
Check ($script:petBubbleNextAt-eq 0) 'Music interaction suppresses bubble';$script:widgetMusic=$null
$script:clock+=1000;Tick-WidgetAutoQuote $script:clock $false
Check ($script:petBubbleNextAt-eq 0) 'Hidden window stays silent'
$script:clock+=1000;Tick-WidgetAutoQuote $script:clock $true
$script:clock+=3600000;Tick-WidgetAutoQuote $script:clock $true
Check ($script:quotes-eq 1 -and $script:petBubbleNextAt-ge $script:clock+120000) 'Resume cannot cause overdue burst'
$script:clock-=20000;Tick-WidgetAutoQuote $script:clock $true
Check ($script:petBubbleNextAt-ge $script:clock+120000) 'Clock rollback restarts quiet interval'
Reset-WidgetAutoQuoteSchedule $script:clock
Check ($script:petBubbleNextAt-eq 0 -and $script:originalResets-gt 0) 'Manual interaction resets both schedules'
$script:petAutoBubbleEnabled=$false;$script:clock+=1000;Tick-WidgetAutoQuote $script:clock $true
Check ($script:petBubbleNextAt-eq 0 -and $script:quotes-eq 1) 'Off preference suppresses random bubbles'
$script:widgetPetForm='full';$script:originalTicks=0;Tick-WidgetAutoQuote $script:clock $true
Check ($script:originalTicks-eq 1 -and $script:quotes-eq 1) 'Full form keeps its existing schedule'
$script:widgetPetForm='bust';$script:characterId='other';Tick-WidgetAutoQuote $script:clock $true
Check ($script:originalTicks-eq 2) 'Other characters keep existing behavior'
@{ok=$true;checks=$script:checks;minDelayMs=120000;maxDelayMs=300000;sampledIntervals=100;paidCalls=0}|ConvertTo-Json|Set-Content -LiteralPath $Report -Encoding UTF8
