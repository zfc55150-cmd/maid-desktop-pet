param([Parameter(Mandatory=$true)][string]$Stage)
$ErrorActionPreference='Stop'
$workspace=[IO.Path]::GetFullPath((Get-Location).Path).TrimEnd('\');$Stage=[IO.Path]::GetFullPath($Stage).TrimEnd('\')
if(!$Stage.StartsWith((Join-Path $workspace 'work')+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Cleanup stage scope'}
$plan=Get-Content -LiteralPath (Join-Path $Stage 'promotion-plan.json') -Raw -Encoding UTF8|ConvertFrom-Json
$audit=Get-Content -LiteralPath (Join-Path $Stage 'final-audit.json') -Raw -Encoding UTF8|ConvertFrom-Json
$target=[IO.Path]::GetFullPath([string]$plan.target).TrimEnd('\')
if(!$audit.ok -or $audit.legacyRemaining-ne 0 -or $target-ine "$env:LOCALAPPDATA\Programs\GPTNiangUsage\gpt-niang-usage\versions\0.8.0-electron"){throw 'Verified formal deployment required'}
if((Get-FileHash -LiteralPath (Join-Path $target 'package-manifest.json')).Hash-ine $plan.active.manifestSha256){throw 'Formal manifest drift'}
$package=Join-Path $Stage 'package'
$activeTests=@(Get-CimInstance Win32_Process -Filter "Name='electron.exe'"|Where-Object{($_.CommandLine-like ('*'+$package+'*')) -or ($_.CommandLine-like ('*'+$target+'*') -and $_.CommandLine-like '*--test-only*') -or $_.CommandLine-like ('*'+(Join-Path $Stage 'test-profile')+'*')})
if($activeTests.Count){throw 'A test instance is still running'}
foreach($name in @('settings-preview.png','bust-preview.png','product-smoke.json','product-test-status.json','test-diagnostics.json')){
 $file=Join-Path $target $name
 if(Test-Path -LiteralPath $file){Copy-Item -LiteralPath $file -Destination (Join-Path $Stage ('installed-'+$name)) -Force;Remove-Item -LiteralPath $file}
}
$folders=@((Join-Path $target 'test-state'),(Join-Path $target 'test-profile'),(Join-Path $Stage 'test-state'),(Join-Path $Stage 'test-profile'),$package)
$removed=@();$bytes=0L
foreach($folder in $folders){
 $resolved=[IO.Path]::GetFullPath($folder).TrimEnd('\')
 if($resolved-notin $folders){throw 'Unexpected cleanup target'}
 if(!$resolved.StartsWith($Stage+'\',[StringComparison]::OrdinalIgnoreCase) -and $resolved-notin @((Join-Path $target 'test-state'),(Join-Path $target 'test-profile'))){throw 'Cleanup escaped named test roots'}
 if(Test-Path -LiteralPath $resolved){
  $entries=@(Get-Item -LiteralPath $resolved -Force)+@(Get-ChildItem -LiteralPath $resolved -Force -Recurse)
  if(@($entries|Where-Object{$_.Attributes-band [IO.FileAttributes]::ReparsePoint}).Count){throw 'Linked test artifact; inspect before cleanup'}
  $bytes+=($entries|Where-Object{!$_.PSIsContainer}|Measure-Object Length -Sum).Sum
  Remove-Item -LiteralPath $resolved -Recurse -Force;$removed+=$resolved
 }
}
$receipt=@{ok=$true;at=[DateTime]::UtcNow.ToString('o');removed=$removed;bytes=$bytes;formalInstallationPreserved=$true;sourceMediaPreserved=$true;rollbackPreserved=$true}
[IO.File]::WriteAllText((Join-Path $Stage 'cleanup-receipt.json'),($receipt|ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false));$receipt|ConvertTo-Json -Depth 4
