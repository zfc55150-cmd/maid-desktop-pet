param([string]$Module,[string]$Patched,[string]$Fixture)
$ErrorActionPreference='Stop'
. ([ScriptBlock]::Create([IO.File]::ReadAllText($Module,[Text.Encoding]::UTF8)))
$t=$null;$e=$null;$ast=[Management.Automation.Language.Parser]::ParseInput([IO.File]::ReadAllText($Patched,[Text.Encoding]::UTF8),[ref]$t,[ref]$e)
if($e.Count){throw 'PATCHED_PARSE_FAILED'}
$node=$ast.Find({param($n)$n-is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name-eq 'Save-Settings'},$true)
. ([ScriptBlock]::Create($node.Extent.Text))
$p=Join-Path $Fixture 'blocked.json';[IO.File]::WriteAllText($p,'{BAD');[IO.File]::WriteAllText(($p+'.bak'),'{BAD_BAK')
$a=Get-WidgetSettingsDigest $p;$b=Get-WidgetSettingsDigest ($p+'.bak');$script:settingsStore=Open-WidgetSettingsStore $p;$script:settingsLoadFailed=$false
Save-Settings
if(!$script:settingsLoadFailed -or (Get-WidgetSettingsDigest $p)-ne $a -or (Get-WidgetSettingsDigest ($p+'.bak'))-ne $b){throw 'ORDINARY_SAVE_DID_NOT_STAY_READ_ONLY'}
[IO.File]::WriteAllText($p,'{}');[IO.File]::WriteAllText(($p+'.bak'),'{}');$script:settingsStore=Open-WidgetSettingsStore $p
[IO.File]::WriteAllText($p,'{CHANGED');$a=Get-WidgetSettingsDigest $p;$b=Get-WidgetSettingsDigest ($p+'.bak');$script:settingsLoadFailed=$false
Save-Settings
if(!$script:settingsLoadFailed -or $script:settingsStore.CanSave -or (Get-WidgetSettingsDigest $p)-ne $a -or (Get-WidgetSettingsDigest ($p+'.bak'))-ne $b){throw 'ORDINARY_SAVE_DID_NOT_CATCH_WRITE_FAILURE'}
@{ok=$true;count=2;fullHostLoaded=$false}|ConvertTo-Json -Compress
