param([Parameter(Mandatory=$true)][string]$Stage,[ValidateSet('Prepare','Activate','Retire')][string]$Phase='Prepare')
$ErrorActionPreference='Stop'
$Stage=[IO.Path]::GetFullPath($Stage).TrimEnd('\')
$workspace=[IO.Path]::GetFullPath((Get-Location).Path).TrimEnd('\')
if(!$Stage.StartsWith((Join-Path $workspace 'work')+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Stage is outside workspace work directory'}
$plan=Get-Content -LiteralPath (Join-Path $Stage 'promotion-plan.json') -Raw -Encoding UTF8|ConvertFrom-Json
$appDir=pathlib.Path(os.environ.get('LOCALAPPDATA', str(pathlib.Path.home() / 'AppData/Local'))) / 'Programs/GPTNiangUsage/gpt-niang-usage'
$dataDir="$env:LOCALAPPDATA\GPTNiangUsage\state"
$target=[IO.Path]::GetFullPath([string]$plan.target).TrimEnd('\')
if($target-ine (Join-Path $appDir 'versions\0.8.0-electron') -or $plan.version-ne '0.8.0-electron'){throw 'Promotion target mismatch'}
function Assert-Hash([string]$File,[string]$Hash){if(!$Hash -or !(Test-Path -LiteralPath $File -PathType Leaf) -or (Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash-ine $Hash){throw ('Hash mismatch: '+$File)}}
function Assert-Relative([string]$Relative){if([IO.Path]::IsPathRooted($Relative) -or $Relative-match '(^|[\/])\.\.?([\/]|$)' -or $Relative.Contains(':')){throw 'Unsafe manifest path'}}
function Assert-Unlinked([string]$File){for($current=$File;$current -and $current.StartsWith($appDir,[StringComparison]::OrdinalIgnoreCase);$current=Split-Path $current -Parent){if((Test-Path -LiteralPath $current) -and ((Get-Item -LiteralPath $current -Force).Attributes-band [IO.FileAttributes]::ReparsePoint)){throw 'Reparse point in promotion path'}}}
function Write-Json([string]$File,$Value){$tmp=$File+'.electron-tmp';[IO.File]::WriteAllText($tmp,($Value|ConvertTo-Json -Depth 20),[Text.UTF8Encoding]::new($false));Move-Item -LiteralPath $tmp -Destination $File -Force}
Assert-Unlinked $target
Assert-Hash ([string]$plan.rollback.archive) ([string]$plan.rollback.sha256)
if(!$plan.rollback.verified -or $plan.rollback.personalStateIncluded){throw 'Verified application-only rollback required'}
$package=Join-Path $Stage 'package'
$manifest=Get-Content -LiteralPath (Join-Path $package 'package-manifest.json') -Raw -Encoding UTF8|ConvertFrom-Json
Assert-Hash (Join-Path $package 'package-manifest.json') $plan.active.manifestSha256
foreach($row in $manifest.files){Assert-Relative $row.path;Assert-Hash (Join-Path $package $row.path) $row.sha256}
if($Phase-eq 'Prepare'){
 if(Test-Path -LiteralPath $target){throw 'Fresh formal version directory required'}
 $null=New-Item -ItemType Directory -Path $target
 foreach($row in $manifest.files){$destination=Join-Path $target $row.path;$null=New-Item -ItemType Directory -Path (Split-Path $destination -Parent) -Force;Copy-Item -LiteralPath (Join-Path $package $row.path) -Destination $destination;Assert-Hash $destination $row.sha256}
 Copy-Item -LiteralPath (Join-Path $package 'package-manifest.json') -Destination (Join-Path $target 'package-manifest.json')
 Write-Json (Join-Path $Stage 'promotion-state.json') @{phase='prepared';at=[DateTime]::UtcNow.ToString('o');target=$target;files=$manifest.files.Count}
 return @{ok=$true;phase='prepared';version=$plan.version;files=$manifest.files.Count}|ConvertTo-Json
}
foreach($row in $manifest.files){Assert-Hash (Join-Path $target $row.path) $row.sha256}
if($Phase-eq 'Activate'){
 foreach($test in @('final-full-smoke','repeat-shutdown','renderer-crash-recovery')){
  $r=Get-Content -LiteralPath (Join-Path $Stage ($test+'.json')) -Raw -Encoding UTF8|ConvertFrom-Json
  if($r.timedOut -or ($test-ne 'renderer-crash-recovery' -and ($r.code-ne 0 -or $r.errors.Count)) -or ($test-eq 'renderer-crash-recovery' -and ($r.code-ne 1 -or 'RENDERER_GONE'-notin $r.errors))){throw ('Incomplete lifecycle verification: '+$test)}
 }
 $full=Get-Content -LiteralPath (Join-Path $Stage 'final-product-smoke.json') -Raw -Encoding UTF8|ConvertFrom-Json
 if(!$full.ok -or @($full.checks|Where-Object{$_.name-like 'select-*'}).Count-ne 43){throw 'Full media verification missing'}
 if(!(Test-Path -LiteralPath (Join-Path $dataDir 'supervisor-stop.flag'))){throw 'Stop the existing supervisor before activation'}
 $presence=$null;try{$presence=Get-Content -LiteralPath (Join-Path $dataDir 'presence.json') -Raw -Encoding UTF8|ConvertFrom-Json}catch{}
 if($presence -and ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()-[double]$presence.at)-lt 6000){throw 'A character is still publishing live presence'}
 foreach($row in $plan.replacements){Assert-Relative $row.path;Assert-Unlinked (Join-Path $appDir $row.path);Assert-Hash (Join-Path $appDir $row.path) $row.previousSha256;Assert-Hash (Join-Path (Join-Path $Stage 'root-overlay') $row.path) $row.sha256}
 foreach($row in $plan.replacements){Copy-Item -LiteralPath (Join-Path (Join-Path $Stage 'root-overlay') $row.path) -Destination (Join-Path $appDir $row.path) -Force;Assert-Hash (Join-Path $appDir $row.path) $row.sha256}
 $receipt=@{schema=1;version=$plan.version;renderer='electron';baseline=$plan.baseline;phase='activated';at=[DateTime]::UtcNow.ToString('o');rootFiles=@($plan.replacements|ForEach-Object{@{path=$_.path;sha256=$_.sha256}});retired=@($plan.retire);rollback=$plan.rollback}
 Write-Json (Join-Path $appDir 'electron-deployment.json') $receipt
 Write-Json (Join-Path $appDir 'active-version.json') $plan.active
 Write-Json (Join-Path $Stage 'promotion-state.json') @{phase='activated';at=[DateTime]::UtcNow.ToString('o');target=$target}
 return @{ok=$true;phase='activated';version=$plan.version}|ConvertTo-Json
}
# Delete only exact archived bytes after the new running instance proves healthy.
$runtime=Get-Content -LiteralPath (Join-Path $dataDir 'runtime.json') -Raw -Encoding UTF8|ConvertFrom-Json
$diagnostics=Get-Content -LiteralPath (Join-Path $target 'diagnostics.json') -Raw -Encoding UTF8|ConvertFrom-Json
$now=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
if($runtime.renderer-ne 'electron' -or $runtime.version-ne $plan.version -or $runtime.appDir-ine $target -or $diagnostics.pid-ne $runtime.pid -or $now-[double]$diagnostics.at-gt 5000 -or $diagnostics.errors.Count -or $diagnostics.frameUpdates-lt 100 -or !$diagnostics.visible){throw 'Formal Electron instance is not healthy'}
if(([DateTime]::UtcNow-([DateTime]$runtime.startedAt).ToUniversalTime()).TotalSeconds-lt 30){throw 'Allow at least30 seconds of live validation before retiring old files'}
$process=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$runtime.pid)
if(!$process -or $process.Name-ne 'electron.exe' -or [IO.Path]::GetFullPath([string]$process.ExecutablePath)-ine (Join-Path $target 'electron\electron.exe') -or $process.CommandLine.IndexOf(('"'+(Join-Path $target 'app\main.cjs')+'"'),[StringComparison]::OrdinalIgnoreCase)-lt 0){throw 'Formal process identity mismatch'}
$supervisor=Get-Content -LiteralPath (Join-Path $dataDir 'supervisor-status.json') -Raw -Encoding UTF8|ConvertFrom-Json
if(!$supervisor.widgetRunning -or $supervisor.healthCode-ne 'healthy'){throw 'Supervisor does not recognize the new character'}
foreach($row in $plan.retire){Assert-Relative $row.path;$file=[IO.Path]::GetFullPath((Join-Path $appDir $row.path));if(!$file.StartsWith($appDir+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Retirement escaped installation'};Assert-Unlinked $file;Assert-Hash $file $row.sha256}
foreach($row in $plan.retire){Remove-Item -LiteralPath (Join-Path $appDir $row.path) -ErrorAction Stop}
foreach($relative in @('assets','tests','runtime\dragon-animation')){
 $directory=Join-Path $appDir $relative
 if(Test-Path -LiteralPath $directory){$folders=@(Get-ChildItem -LiteralPath $directory -Directory -Recurse)|Sort-Object{$_.FullName.Length} -Descending;foreach($folder in $folders){if(!@(Get-ChildItem -LiteralPath $folder.FullName -Force).Count){Remove-Item -LiteralPath $folder.FullName}};if(!@(Get-ChildItem -LiteralPath $directory -Force).Count){Remove-Item -LiteralPath $directory}}
}
$receipt=Get-Content -LiteralPath (Join-Path $appDir 'electron-deployment.json') -Raw -Encoding UTF8|ConvertFrom-Json
$receipt.phase='retired';$receipt|Add-Member -NotePropertyName retiredAt -NotePropertyValue ([DateTime]::UtcNow.ToString('o')) -Force;Write-Json (Join-Path $appDir 'electron-deployment.json') $receipt
Write-Json (Join-Path $Stage 'promotion-state.json') @{phase='retired';at=[DateTime]::UtcNow.ToString('o');target=$target;deleted=$plan.retire.Count}
@{ok=$true;phase='retired';version=$plan.version;deleted=$plan.retire.Count}|ConvertTo-Json
