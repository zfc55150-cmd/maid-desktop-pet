param([Parameter(Mandatory=$true)][string]$Source,[Parameter(Mandatory=$true)][string]$Report)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName PresentationFramework,PresentationCore,WindowsBase
$dir=Join-Path ([IO.Path]::GetDirectoryName($Report)) ('fake-experience-'+[Guid]::NewGuid().ToString('N'))
$null=[IO.Directory]::CreateDirectory($dir);$script:dataDir=$dir;$script:context=[Windows.Controls.ContextMenu]::new();$script:ui=@{Girl=[Windows.Controls.Image]::new()}
$settings=[Windows.Controls.MenuItem]::new();$settings.Header='设置';$null=$script:context.Items.Add($settings)
$script:dragonCodexEnabled=$true;$script:quoteTicks=0;$script:stops=0;$script:resets=0;$script:completionPending=$false
function Tick-WidgetAutoQuote {param($Now,$Visible)$script:quoteTicks++}
function Reset-WidgetAutoQuoteSchedule {$script:resets++}
function Stop-DragonActivityWatch {$script:stops++}
function Stop-CompletionMonitor {$script:stops++}
function Pause-CompletionNotification {}
function Set-DragonIdleRhythm($Mode){$script:dragonIdleRhythm=$Mode}
function Set-DragonSmoothManualRoutes($Enabled){$script:dragonSmoothManualRoutes=$Enabled}
function Save-Settings {}
function Clear-WidgetTaskObserverState {}
$checks=New-Object 'System.Collections.Generic.List[string]'
function Check($Value,[string]$Name){if(!$Value){throw $Name};$checks.Add($Name)}
try{
 . ([ScriptBlock]::Create([IO.File]::ReadAllText((Join-Path $Source 'settings-store.ps1'),[Text.Encoding]::UTF8)))
 . ([ScriptBlock]::Create([IO.File]::ReadAllText((Join-Path $Source 'experience-controls.ps1'),[Text.Encoding]::UTF8)))
 Initialize-WidgetExperienceControls
 Check ($script:dragonIdleRhythm-eq 'quiet' -and $script:dragonSmoothManualRoutes -and !(Test-WidgetExperienceQuiet)) 'default-uses-existing-manual-pose-bridges-with-quiet-rhythm-and-normal-display'
 Check (!(Test-Path -LiteralPath (Join-Path $dir 'experience-preferences.json'))) 'initialization-does-not-rewrite-user-preferences'
 Tick-WidgetAutoQuote 1 $true;Check ($script:quoteTicks-eq 1) 'normal-display-delegates-to-existing-quote-policy'
 $script:soundOn=$true;$script:autoQuoteEnabled=$true;$script:petAutoBubbleEnabled=$true;$script:completionNotificationsEnabled=$true
 Set-WidgetExperienceQuiet '30m';Check (Test-WidgetExperienceQuiet) '30-minute-quiet-is-active'
 Tick-WidgetAutoQuote 2 $true;Check ($script:quoteTicks-eq 1) 'quiet-gates-automatic-quotes-including-small-form-wrapper'
 Check ($script:soundOn -and $script:autoQuoteEnabled -and $script:petAutoBubbleEnabled -and $script:completionNotificationsEnabled) 'quiet-preserves-original-sound-and-notification-preferences'
 $script:fakeUtc=([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())+864000000
 function Get-WidgetExperienceNow {return $script:fakeUtc}
 Check (Test-WidgetExperienceQuiet) 'wall-clock-forward-does-not-expire-monotonic-quiet'
 $script:fakeUtc-=1728000000
 Check (Test-WidgetExperienceQuiet) 'wall-clock-backward-does-not-extend-current-quiet-clock'
 $script:experienceQuietClock=[pscustomobject]@{Elapsed=[pscustomobject]@{TotalMilliseconds=1800001}}
 Check (!(Test-WidgetExperienceQuiet)) 'elapsed-time-expires-quiet'
 Check (([IO.File]::ReadAllText((Join-Path $dir 'experience-preferences.json'))|ConvertFrom-Json).quietUntil-eq 0) 'quiet-expiration-is-persisted-without-replaying-events'
 Set-WidgetExperienceQuiet 'until-resume';Check (Test-WidgetExperienceQuiet) 'until-resume-quiet-is-explicit'
 Set-WidgetExperienceQuiet 'off';Check (!(Test-WidgetExperienceQuiet)) 'manual-resume-restores-display'
 Set-WidgetExperienceRhythm 'natural';Set-WidgetExperienceSmooth $true
 $saved=[IO.File]::ReadAllText((Join-Path $dir 'experience-preferences.json'))|ConvertFrom-Json
 Check ($saved.idleRhythm-eq 'natural' -and $saved.smoothManualRoutes) 'optional-motion-preferences-use-separate-protected-store'
 Set-WidgetExperienceSmooth $false;$script:experienceReady=$false;Initialize-WidgetExperienceControls
 Check (!$script:dragonSmoothManualRoutes -and $script:dragonIdleRhythm-eq 'natural') 'explicit-saved-manual-route-preference-overrides-new-default'
 Set-WidgetExperienceSmooth $true
 $before=[IO.File]::ReadAllText((Join-Path $dir 'experience-preferences.json'))
 Set-WidgetObservationPaused $true
 Check ((Test-WidgetObservationPaused) -and $script:stops-eq 2) 'pause-stops-both-observers'
 Check ($script:dragonCodexEnabled -and $script:completionNotificationsEnabled) 'pause-retains-independent-follow-and-reminder-settings'
 Check (([IO.File]::ReadAllText((Join-Path $dir 'experience-preferences.json')))-eq $before) 'pause-marker-is-independent-of-motion-and-display-preferences'
 $script:completionRetryAfter=$script:fakeUtc+30000
 Set-WidgetObservationPaused $false
 Check (!(Test-WidgetObservationPaused)) 'resume-removes-only-owned-pause-marker'
 Check ($script:completionRetryAfter-eq 0) 'resume-clears-real-completion-retry-deadline'
 $script:dragonTaskSummary=@{active=3;waiting=1;completed=2;lastUpdatedAt=$script:fakeUtc;observerStatus='ok'}
 $script:dragonFailedClips=@{bad=1};Update-WidgetExperienceMenu
 Check ($settings.Items.Count-eq 1 -and $script:experienceMenuItems.Status.Header-eq '活跃 3 · 等待 1 · 完成 2') 'shared-menu-displays-anonymous-task-counts'
 Check ($script:experienceMenuItems.Health.Header-eq '同步：正常 · 隔离动作 1') 'health-shows-degradation-count-without-log-body'
 $script:widgetPetForm='bust';Update-WidgetExperienceMenu
 Check ($script:experienceMenu.Visibility-eq 'Visible' -and $script:experienceMenuItems.Follow.IsChecked) 'shared-follow-and-pause-controls-remain-visible-in-small-form'
 $script:experienceStore.CanSave=$false;$old=$script:dragonIdleRhythm
 try{Set-WidgetExperienceRhythm 'quiet';throw 'EXPECTED_BLOCK'}catch{Check ($_.Exception.Message-ne 'EXPECTED_BLOCK') 'invalid-preference-store-refuses-writes'}
 Check ($script:dragonIdleRhythm-eq $old) 'failed-preference-write-restores-previous-in-memory-choice'
 $forms=Join-Path $Source 'pet-forms.ps1'
 if(![IO.File]::Exists($forms)){$forms=[IO.Path]::GetFullPath((Join-Path $Source '../../forms/pet-forms.ps1'))}
 $ast=[Management.Automation.Language.Parser]::ParseInput([IO.File]::ReadAllText($forms,[Text.Encoding]::UTF8),[ref]$null,[ref]$null)
 foreach($name in @('Write-WidgetPetForm','Restore-WidgetPetFormPreference','Add-WidgetPetBubbleMenu','Set-WidgetPetForm')){
  $fn=$ast.Find({param($n)$n-is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name-eq $name},$true)
  . ([ScriptBlock]::Create($fn.Extent.Text))
 }
 function Reset-WidgetPetFrameTransition {}
 function Set-DragonCachedFrame($Frame) {}
 function Update-WidgetPetFormMenu {}
 function Test-WidgetPetFormAnimation {return $false}
 $formFile=Join-Path $dir 'pet-form.json';[IO.File]::WriteAllText($formFile,'{bad');[IO.File]::WriteAllText(($formFile+'.bak'),'{bad-backup')
 $script:petFormStore=Open-WidgetSettingsStore $formFile;$script:widgetPetForm='full';$script:petFormTarget='full';$script:petAutoBubbleEnabled=$true;$script:characterId='gpt-dragon';$script:drag=$null
 $script:compactMenuResources=@{CompactItem=[Windows.Style]::new([Windows.Controls.MenuItem])}
 $script:petBustFrame=@{image='fake-bust'};$script:petFormFullFrame=@{image='fake-full'};$script:petFormTransition=$false
 Add-WidgetPetBubbleMenu
 $bubble=@($settings.Items|Where-Object{$_.Tag-eq 'pet-form-auto-bubble'})[0]
 Check (!$bubble.IsEnabled) 'corrupt-form-preferences-disable-automatic-bubble-toggle'
 $bubble.IsEnabled=$true;$bubble.IsChecked=$false;$bubble.RaiseEvent([Windows.RoutedEventArgs]::new([Windows.Controls.MenuItem]::ClickEvent))
 Check ($script:petAutoBubbleEnabled -and $bubble.IsChecked -and $script:petFormSaveError-eq 'PET_FORM_SAVE_BLOCKED') 'stale-toggle-event-restores-memory-without-unhandled-save-error'
 Set-WidgetPetForm 'bust'
 Check ($script:widgetPetForm-eq 'full') 'readonly-form-store-refuses-direct-no-animation-switch'
 [IO.File]::WriteAllText($formFile,'{"version":1,"form":"full","autoBubble":true}')
 $script:petFormStore=Open-WidgetSettingsStore $formFile
 [IO.File]::WriteAllText($formFile,'{external-damage')
 Set-WidgetPetForm 'bust'
 Check ($script:widgetPetForm-eq 'full' -and $script:petFormTarget-eq 'full') 'external-form-damage-rolls-back-visible-selection'
 Check (([IO.File]::ReadAllText($formFile))-eq '{external-damage') 'failed-form-save-preserves-external-file'
 $result=@{ok=$true;count=$checks.Count;checks=@($checks.ToArray());formalPetTouched=$false;paidCalls=0}
 [IO.File]::WriteAllText($Report,($result|ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false));$result|ConvertTo-Json -Compress -Depth 5
}finally{
 if([IO.Path]::GetFullPath($dir).StartsWith([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($Report))+'\',[StringComparison]::OrdinalIgnoreCase) -and (Split-Path $dir -Leaf)-match '^fake-experience-[a-f0-9]{32}$'){Remove-Item -LiteralPath $dir -Recurse -Force}
}
