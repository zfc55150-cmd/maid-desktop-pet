param([string]$Module,[string]$Fixture)
$ErrorActionPreference='Stop'
. ([ScriptBlock]::Create([IO.File]::ReadAllText($Module,[Text.Encoding]::UTF8)))
$null=[IO.Directory]::CreateDirectory($Fixture);$checks=New-Object 'Collections.Generic.List[string]'
function Check($ok,$name){if(!$ok){throw $name};$checks.Add($name)}
function Write-Fake($p,$text){[IO.File]::WriteAllText($p,$text,[Text.UTF8Encoding]::new($false))}
$p=Join-Path $Fixture 'settings.json';$good='{"scale":1.4,"followHost":false,"other":"FAKE"}'
Write-Fake $p $good;Write-Fake ($p+'.bak') '{"scale":0.8}'
$s=Open-WidgetSettingsStore $p;Check ($s.CanSave -and !$s.Recovered -and $s.Data.scale-eq 1.4) 'valid main retained'
Save-WidgetSettingsStore $s @{scale=1.6;followHost=$false};Check ((Read-WidgetSettingsDocument ($p+'.bak')).Data.scale-eq 1.4) 'save keeps valid previous main'
Write-Fake $p '{BROKEN';Write-Fake ($p+'.bak') $good;$backup=Get-WidgetSettingsDigest ($p+'.bak')
$s=Open-WidgetSettingsStore $p;Check ($s.CanSave -and $s.Recovered -and $s.Data.scale-eq 1.4) 'bad main restored from good backup'
Check ((Get-WidgetSettingsDigest $p)-eq $backup -and (Get-WidgetSettingsDigest ($p+'.bak'))-eq $backup) 'recovery keeps backup byte exact'
$quarantine=@(Get-ChildItem -LiteralPath $Fixture -Filter 'settings.json.corrupt-*');Check ($quarantine.Count-eq 1 -and [IO.File]::ReadAllText($quarantine[0].FullName)-eq '{BROKEN') 'bad original quarantined byte exact'
Save-WidgetSettingsStore $s @{scale=1.7};Check ((Read-WidgetSettingsDocument ($p+'.bak')).Data.scale-eq 1.4) 'save after recovery retains last good settings'
Write-Fake $p '{BAD1';Write-Fake ($p+'.bak') '{BAD2';$a=Get-WidgetSettingsDigest $p;$b=Get-WidgetSettingsDigest ($p+'.bak')
$s=Open-WidgetSettingsStore $p;$blocked=$false;try{Save-WidgetSettingsStore $s @{scale=1}}catch{$blocked=$_.Exception.Message-eq 'SETTINGS_SAVE_BLOCKED'}
Check (!$s.CanSave -and $blocked -and (Get-WidgetSettingsDigest $p)-eq $a -and (Get-WidgetSettingsDigest ($p+'.bak'))-eq $b) 'two bad files block every ordinary save without changing bytes'
Write-Fake $p $good;Write-Fake ($p+'.bak') $good;$s=Open-WidgetSettingsStore $p;Write-Fake $p '{EXTERNAL';$a=Get-WidgetSettingsDigest $p;$b=Get-WidgetSettingsDigest ($p+'.bak')
try{Save-WidgetSettingsStore $s @{scale=1}}catch{}
Check (!$s.CanSave -and (Get-WidgetSettingsDigest $p)-eq $a -and (Get-WidgetSettingsDigest ($p+'.bak'))-eq $b) 'corruption after open cannot consume good backup'
Write-Fake $p $good;$s=Open-WidgetSettingsStore $p;Write-Fake $p '{"scale":2}';$a=Get-WidgetSettingsDigest $p
try{Save-WidgetSettingsStore $s @{scale=1}}catch{}
Check (!$s.CanSave -and (Get-WidgetSettingsDigest $p)-eq $a) 'external valid editor wins'
Write-Fake $p '{LOCKED';Write-Fake ($p+'.bak') $good;$a=Get-WidgetSettingsDigest $p;$b=Get-WidgetSettingsDigest ($p+'.bak')
$lock=[IO.File]::Open($p,[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
try{$s=Open-WidgetSettingsStore $p;Check (!$s.CanSave -and $s.ErrorCode-eq 'SETTINGS_RECOVERY_FAILED') 'failed recovery remains read only'}finally{$lock.Dispose()}
Check ((Get-WidgetSettingsDigest $p)-eq $a -and (Get-WidgetSettingsDigest ($p+'.bak'))-eq $b) 'locked recovery preserves both files'
$new=Join-Path $Fixture 'new.json';$s=Open-WidgetSettingsStore $new;Save-WidgetSettingsStore $s @{quiet=$true};Check ((Read-WidgetSettingsDocument $new).Data.quiet-eq $true) 'first use works for independent preferences'
Remove-Item -LiteralPath $p;Write-Fake ($p+'.bak') $good;$s=Open-WidgetSettingsStore $p;Check ($s.Recovered -and $s.CanSave) 'missing main can restore backup'
Write-Fake $p '[]';Write-Fake ($p+'.bak') 'null';$s=Open-WidgetSettingsStore $p;Check (!$s.CanSave) 'non object JSON cannot become settings'
Write-Fake $p ('{"large":"'+('A'*1048576)+'"}');Write-Fake ($p+'.bak') $good;$a=Get-WidgetSettingsDigest $p;$b=Get-WidgetSettingsDigest ($p+'.bak')
$s=Open-WidgetSettingsStore $p;Check (!$s.CanSave -and $s.ErrorCode-eq 'SETTINGS_TOO_LARGE' -and $s.Data.scale-eq 1.4) 'oversized main never parsed or automatically copied'
try{Save-WidgetSettingsStore $s @{scale=1}}catch{}
Check ((Get-WidgetSettingsDigest $p)-eq $a -and (Get-WidgetSettingsDigest ($p+'.bak'))-eq $b) 'oversized document cannot consume good backup'
@{ok=$true;count=$checks.Count;checks=@($checks)}|ConvertTo-Json -Depth 4 -Compress
