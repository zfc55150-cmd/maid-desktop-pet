param([string]$Root,[string]$Helper,[string]$UpdaterUi)
$ErrorActionPreference='Stop'
. $Helper -FunctionsOnly
$script:app=Join-Path $Root 'app\gpt-niang-usage';$script:data=Join-Path $Root 'state';$script:stops=0;$script:late=$false
function Assert-WidgetUpdateTransaction {}
function Get-WidgetFileHash {return 'FAKE-HASH'}
function Get-WidgetInstallPreflight {return [pscustomobject]@{version='1.3.6';dataDir=$script:data}}
function Assert-WidgetCandidatePackage {}
function Copy-WidgetVerifiedTree($Source,$Destination){$null=New-Item -ItemType Directory -Path (Join-Path $Destination 'gpt-niang-usage') -Force}
function Copy-WidgetUnmanagedRootItems {}
function Wait-WidgetUpdateIdle {
 if($script:late){[IO.File]::WriteAllText((Join-Path $script:app 'runtime\customization-update-policy.json'),'{}')}
}
function Write-WidgetSupervisorJson {}
function Stop-WidgetSupervisorTask {$script:stops++}
function Stop-WidgetGui {$script:stops++}
function Set-WidgetUpdatePhase($Journal,[string]$Phase){$Journal.phase=$Phase}
function Complete-WidgetUpdateCleanup {return $true}
function Restore-WidgetUpdate($Journal){$script:recovered=$true;$Journal.phase='rolled-back'}
[IO.File]::WriteAllText((Join-Path $script:app 'installation.json'),'{}')
$journal=[pscustomobject]@{phase='prepared';appDir=$script:app;dataDir=$script:data;archive=(Join-Path $Root 'fake.zip');hash='FAKE-HASH';candidate=(Join-Path $Root 'candidate');version='1.3.6';root=(Join-Path $Root 'app');nextRoot=(Join-Path $Root 'app.next');backup=(Join-Path $Root 'app.backup')}
$marker=Join-Path $script:app 'runtime\customization-update-policy.json'
[IO.File]::WriteAllText($marker,'{ invalid marker must still block }')
$blockedPrepared=$false
try{Invoke-WidgetUpdateTransaction $journal (Split-Path $Helper -Parent) 'fake-token'}catch{$blockedPrepared=$_.Exception.Message.Contains('CUSTOMIZED_INSTALLATION_REQUIRES_MAINTENANCE_PACKAGE')}
if(!$blockedPrepared -or $script:stops-ne 0 -or (Test-Path (Join-Path $script:data 'update-installing.json'))){throw 'Prepared transaction was not blocked before stopping'}
Invoke-WidgetUpdateTransaction $journal (Split-Path $Helper -Parent) 'fake-token' -Recover
if(!$script:recovered){throw 'Recovery was blocked by customization guard'}
Remove-Item -LiteralPath $marker
$journal.phase='prepared';$script:late=$true;$script:recovered=$false
$blockedLate=$false
try{Invoke-WidgetUpdateTransaction $journal (Split-Path $Helper -Parent) 'fake-token'}catch{$blockedLate=$_.Exception.Message.Contains('CUSTOMIZED_INSTALLATION_REQUIRES_MAINTENANCE_PACKAGE')}
if(!$blockedLate -or $script:stops-ne 0 -or (Test-Path (Join-Path $script:data 'update-installing.json'))){throw 'Late customization was not blocked before stopping'}
. ([ScriptBlock]::Create([IO.File]::ReadAllText($UpdaterUi,[Text.Encoding]::UTF8)))
function Read-WidgetUpdateJson([string]$File){if((Split-Path $File -Leaf)-eq 'update-status.json'){return @{phase='blocked-customization';message='protected'}};return $null}
$script:appDir=$script:app;$script:dataDir=$script:data;$script:config=@{version='1.3.5'}
$script:settingsMenuUi=@{UpdateVersion=[pscustomobject]@{Header=''};AutoUpdate=[pscustomobject]@{Header='';IsChecked=$false};UpdateStatus=[pscustomobject]@{Header=[pscustomobject]@{Text=''};ToolTip=''}}
Initialize-WidgetUpdater;Update-WidgetUpdateMenu
if(!$script:updateCustomizationProtected -or !$script:settingsMenuUi.AutoUpdate.Header.Contains([char]0x901A) -or !$script:settingsMenuUi.UpdateStatus.Header.Text.Contains([char]0x4FDD)){throw 'Protected update menu is ambiguous'}
@{blockedPrepared=$blockedPrepared;blockedLate=$blockedLate;stops=$script:stops;recoveryAllowed=$script:recovered;protectedUi=$true}|ConvertTo-Json -Compress
