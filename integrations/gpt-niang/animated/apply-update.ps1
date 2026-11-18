param([switch]$Apply,[string]$RollbackBackup,[switch]$NoRestart,[switch]$WithHooks,[string]$PackageRoot=$PSScriptRoot,[string]$MaintenanceToken)
$ErrorActionPreference='Stop'
$package=$PackageRoot
function Hash([string]$Path){
  if(![IO.File]::Exists($Path)){return $null}
  $algorithm=[Security.Cryptography.SHA256]::Create();$stream=[IO.File]::OpenRead($Path)
  try{return ([BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace('-','').ToLowerInvariant()}
  finally{$stream.Dispose();$algorithm.Dispose()}
}
function Child([string]$Root,[string]$Relative){
  if([IO.Path]::IsPathRooted($Relative) -or $Relative-match '[:\x00]'){throw 'Invalid relative path'}
  $base=[IO.Path]::GetFullPath($Root).TrimEnd([char[]]@('\','/'))+'\'
  $result=[IO.Path]::GetFullPath((Join-Path $Root $Relative))
  if(!$result.StartsWith($base,[StringComparison]::OrdinalIgnoreCase)){throw 'Path escaped its root'}
  $cursor=$result
  while($cursor.Length-ge $base.TrimEnd([char[]]@('\','/')).Length){
    if([IO.File]::Exists($cursor)-or [IO.Directory]::Exists($cursor)){if(([IO.File]::GetAttributes($cursor)-band [IO.FileAttributes]::ReparsePoint)-ne 0){throw 'Linked deployment path'}}
    $cursor=[IO.Path]::GetDirectoryName($cursor);if(!$cursor){break}
  }
  return $result
}
function Stop-ReviewedWidget($Manifest){
  $runtimeFile=Join-Path $Manifest.dataDir 'runtime.json'
  if(![IO.File]::Exists($runtimeFile)){return}
  $runtime=[IO.File]::ReadAllText($runtimeFile,[Text.Encoding]::UTF8)|ConvertFrom-Json
  if(!$runtime.pid){return}
  $process=Get-CimInstance Win32_Process -Filter ('ProcessId = '+[int]$runtime.pid) -ErrorAction SilentlyContinue
  if(!$process){return}
  $widgetPath=Child $Manifest.targetRoot 'widget.ps1'
  if($process.Name-notin @('powershell.exe','pwsh.exe') -or !$process.CommandLine -or $process.CommandLine.IndexOf($widgetPath,[StringComparison]::OrdinalIgnoreCase)-lt 0){throw 'Widget process identity could not be verified'}
  Stop-Process -Id ([int]$runtime.pid) -ErrorAction Stop
  for($i=0;$i-lt 30;$i++){if(!(Get-Process -Id ([int]$runtime.pid) -ErrorAction SilentlyContinue)){return};Start-Sleep -Milliseconds 100}
  throw 'Widget did not stop'
}
function Assert-ReviewedEntry($Entry){
  if($Entry.target-isnot [string] -or !$Entry.target -or $Entry.sha256-isnot [string] -or $Entry.sha256-notmatch '^[a-f0-9]{64}$'){throw 'Invalid deployment entry or SHA256'}
  if($null-ne $Entry.previousSha256 -and ($Entry.previousSha256-isnot [string] -or $Entry.previousSha256-notmatch '^[a-f0-9]{64}$')){throw 'Invalid previous SHA256'}
}
function Assert-WidgetMaintenanceContext($Manifest,[string]$ReviewedFile){
  if(!$NoRestart -or !$MaintenanceToken){throw 'MAINTENANCE_RUNNER_REQUIRED'}
  $agentRoot=[IO.Path]::GetFullPath((Join-Path (Split-Path $Manifest.dataDir -Parent) 'update-agent'))
  $owner=[IO.File]::ReadAllText((Join-Path $agentRoot 'update.lock\owner.json'),[Text.Encoding]::UTF8)|ConvertFrom-Json
  if($owner.token-cne $MaintenanceToken -or [int]$owner.pid-ne $PID -or !$owner.maintenance -or
     $owner.maintenance.phase-ne 'quiesced' -or $owner.maintenance.reviewedSha256-ne (Hash $ReviewedFile) -or
     [IO.Path]::GetFullPath($owner.maintenance.appDir)-ine [IO.Path]::GetFullPath($Manifest.targetRoot) -or
     [IO.Path]::GetFullPath($owner.maintenance.dataDir)-ine [IO.Path]::GetFullPath($Manifest.dataDir)) {throw 'MAINTENANCE_CONTEXT_INVALID'}
  $binding=[IO.File]::ReadAllText((Join-Path $agentRoot 'binding.json'),[Text.Encoding]::UTF8)|ConvertFrom-Json
  if($binding.sid-ne [Security.Principal.WindowsIdentity]::GetCurrent().User.Value -or
     [IO.Path]::GetFullPath($binding.appDir)-ine [IO.Path]::GetFullPath($Manifest.targetRoot) -or
     [IO.Path]::GetFullPath($binding.dataDir)-ine [IO.Path]::GetFullPath($Manifest.dataDir)){throw 'MAINTENANCE_BINDING_INVALID'}
  if(![IO.File]::Exists((Join-Path $Manifest.dataDir 'supervisor-stop.flag'))){throw 'MAINTENANCE_NOT_QUIESCED'}
  $scripts=@(('"'+(Join-Path $Manifest.targetRoot 'runtime\supervisor.ps1')+'"'),('"'+(Join-Path $agentRoot 'update-agent.ps1')+'"'),('"'+(Join-Path $Manifest.targetRoot 'runtime\start-widget.ps1')+'"'),('"'+(Join-Path $Manifest.targetRoot 'widget.ps1')+'"'))
  $active=@(Get-CimInstance Win32_Process -Filter "Name='powershell.exe' OR Name='pwsh.exe'" -OperationTimeoutSec 5|Where-Object{
    if($_.ProcessId-eq $PID -or ![string]$_.CommandLine){return $false}
    foreach($scriptFile in $scripts){if($_.CommandLine.IndexOf($scriptFile,[StringComparison]::OrdinalIgnoreCase)-ge 0){return $true}}
    return $false
  })
  if($active.Count){throw 'MAINTENANCE_PROCESSES_STILL_RUNNING'}
}
function Copy-ReviewedFile([string]$Source,[string]$Target,[string]$Expected){
  if((Hash $Source)-ne $Expected){throw 'Reviewed source changed before copying'}
  $temp=$Target+'.deploy-'+[Guid]::NewGuid().ToString('N')
  try{
    [IO.File]::Copy($Source,$temp,$false)
    if((Hash $temp)-ne $Expected){throw 'Staged deployment bytes changed'}
    if([IO.File]::Exists($Target)){[IO.File]::Replace($temp,$Target,[NullString]::Value)}else{[IO.File]::Move($temp,$Target)}
    if((Hash $Target)-ne $Expected){throw 'Atomic deployment verification failed'}
  }finally{if([IO.File]::Exists($temp)){[IO.File]::Delete($temp)}}
}
function StableAgent($Manifest){
  if(!$Manifest.stableAgent){return $null}
  $agent=$Manifest.stableAgent
  $expected=[IO.Path]::GetFullPath((Join-Path (Split-Path $Manifest.dataDir -Parent) 'update-agent'))
  if([IO.Path]::GetFullPath($agent.targetRoot)-ine $expected){throw 'Stable agent root does not match the reviewed data directory'}
  if(@($agent.files).Count-ne 1 -or $agent.files[0].target-ne 'update-helper.ps1'){throw 'Unreviewed stable agent file'}
  Assert-ReviewedEntry $agent.files[0]
  $runtime=@($Manifest.files|Where-Object{$_.target-eq 'runtime/update-helper.ps1'})
  if($runtime.Count-gt 1){throw 'Duplicate runtime update helper'}
  if($runtime.Count){
    Assert-ReviewedEntry $runtime[0]
    if($runtime[0].sha256-ne $agent.files[0].sha256 -or $runtime[0].previousSha256-ne $agent.files[0].previousSha256){throw 'Runtime and stable helper revisions disagree'}
  }elseif($agent.files[0].previousSha256-ne $agent.files[0].sha256 -or (Hash (Child $Manifest.targetRoot 'runtime/update-helper.ps1'))-ne $agent.files[0].sha256){throw 'Changing the stable helper requires its matching runtime entry'}
  $null=Child $agent.targetRoot 'update-helper.ps1'
  return $agent
}
if($RollbackBackup){
  $backup=[IO.Path]::GetFullPath($RollbackBackup)
  $receipt=[IO.File]::ReadAllText((Join-Path $backup 'receipt.json'),[Text.Encoding]::UTF8)|ConvertFrom-Json
  foreach($entry in $receipt.files){
    Assert-ReviewedEntry $entry
    $current=Hash (Child $receipt.targetRoot $entry.target)
    if($current-ne $entry.sha256 -and $current-ne $entry.previousSha256){throw 'Installed files changed; do not overwrite'}
    if($entry.previousSha256 -and (Hash (Child (Join-Path $backup 'files') $entry.target))-ne $entry.previousSha256){throw 'Backup hash mismatch'}
  }
  $agent=StableAgent $receipt
  if($agent){foreach($entry in $agent.files){
    $current=Hash (Child $agent.targetRoot $entry.target)
    if($current-ne $entry.sha256 -and $current-ne $entry.previousSha256){throw 'Stable agent changed; do not overwrite'}
    if($entry.previousSha256 -and (Hash (Child (Join-Path $backup 'agent-files') $entry.target))-ne $entry.previousSha256){throw 'Stable agent backup hash mismatch'}
  }}
  if($receipt.manageHooks){
    $currentHooks=Hash $receipt.hooksPath
    if($currentHooks-ne $receipt.installedHooksSha256 -and $currentHooks-ne $receipt.previousHooksSha256){throw 'Codex hooks changed; merge rollback manually'}
    if($receipt.previousHooksSha256 -and (Hash (Join-Path $backup 'hooks-before.json'))-ne $receipt.previousHooksSha256){throw 'Hook backup hash mismatch'}
  }
  if(!$Apply){@{ok=$true;mode='rollback-preflight';files=$receipt.files.Count}|ConvertTo-Json;return}
  Assert-WidgetMaintenanceContext $receipt (Join-Path $backup 'receipt.json')
  Stop-ReviewedWidget $receipt
  foreach($entry in $receipt.files){
    $target=Child $receipt.targetRoot $entry.target
    if($entry.previousSha256){$original=Child (Join-Path $backup 'files') $entry.target;Copy-ReviewedFile $original $target $entry.previousSha256}
    elseif([IO.File]::Exists($target)){Remove-Item -LiteralPath $target -Force}
  }
  if($agent){foreach($entry in $agent.files){
    $target=Child $agent.targetRoot $entry.target
    if($entry.previousSha256){Copy-ReviewedFile (Child (Join-Path $backup 'agent-files') $entry.target) $target $entry.previousSha256}
    elseif([IO.File]::Exists($target)){Remove-Item -LiteralPath $target -Force}
    if((Hash $target)-ne $entry.previousSha256){throw 'Stable agent rollback verification failed'}
  }}
  if($receipt.manageHooks){if($receipt.previousHooksSha256){Copy-Item -LiteralPath (Join-Path $backup 'hooks-before.json') -Destination $receipt.hooksPath -Force}elseif([IO.File]::Exists($receipt.hooksPath)){Remove-Item -LiteralPath $receipt.hooksPath -Force}}
  if(!$NoRestart){Start-Process -FilePath 'wscript.exe' -ArgumentList ('"'+(Join-Path $receipt.targetRoot 'launch.vbs')+'"') -WindowStyle Hidden}
  @{ok=$true;mode='rolled-back'}|ConvertTo-Json;return
}
$manifest=[IO.File]::ReadAllText((Join-Path $package 'deployment.json'),[Text.Encoding]::UTF8)|ConvertFrom-Json
foreach($entry in $manifest.files){
  Assert-ReviewedEntry $entry
  if((Hash (Child (Join-Path $package 'files') $entry.target))-ne $entry.sha256){throw 'Package hash mismatch'}
  if((Hash (Child $manifest.targetRoot $entry.target))-ne $entry.previousSha256){throw ('Installed baseline changed: '+$entry.target)}
}
$agent=StableAgent $manifest
if($agent){foreach($entry in $agent.files){
  if((Hash (Child (Join-Path $package 'agent-files') $entry.target))-ne $entry.sha256){throw 'Stable agent package hash mismatch'}
  if((Hash (Child $agent.targetRoot $entry.target))-ne $entry.previousSha256){throw 'Stable agent baseline changed'}
}}
if((Hash (Join-Path $package 'dragon-hooks.json'))-ne $manifest.hooksTemplateSha256){throw 'Hook template hash mismatch'}
if($WithHooks -and (Hash $manifest.hooksPath)-ne $manifest.previousHooksSha256){throw 'Codex hooks changed; rebuild before installation'}
if(!$Apply){@{ok=$true;mode='preflight-only';files=$manifest.files.Count;willAddHooks=[bool]$WithHooks;willRestartOnlyGPTNiang=$true}|ConvertTo-Json;return}
Assert-WidgetMaintenanceContext $manifest (Join-Path $package 'deployment.json')
$config=[IO.File]::ReadAllText((Join-Path $manifest.targetRoot 'installation.json'),[Text.Encoding]::UTF8)|ConvertFrom-Json
$backup=Join-Path $manifest.dataDir ('animation-backups\'+[DateTime]::Now.ToString('yyyyMMdd-HHmmss')+'-'+[Guid]::NewGuid().ToString('N'))
$null=New-Item -ItemType Directory -Path $backup
$merged=Join-Path $backup 'hooks-installed.json'
$expected=if($manifest.previousHooksSha256){$manifest.previousHooksSha256}else{'none'}
if($WithHooks){
  $null=& $config.nodePath (Join-Path $package 'merge-hooks.cjs') $manifest.hooksPath (Join-Path $package 'dragon-hooks.json') $expected $merged
  if($LASTEXITCODE-ne 0){throw 'Could not prepare merged hooks'}
  if($manifest.previousHooksSha256){Copy-Item -LiteralPath $manifest.hooksPath -Destination (Join-Path $backup 'hooks-before.json')}
}
foreach($entry in $manifest.files){if($entry.previousSha256){$original=Child (Join-Path $backup 'files') $entry.target;$null=New-Item -ItemType Directory -Force -Path ([IO.Path]::GetDirectoryName($original));Copy-Item -LiteralPath (Child $manifest.targetRoot $entry.target) -Destination $original}}
if($agent){foreach($entry in $agent.files){if($entry.previousSha256){$original=Child (Join-Path $backup 'agent-files') $entry.target;$null=New-Item -ItemType Directory -Force -Path ([IO.Path]::GetDirectoryName($original));Copy-Item -LiteralPath (Child $agent.targetRoot $entry.target) -Destination $original}}}
$receipt=@{version=$manifest.version;upstreamVersion=$manifest.upstreamVersion;hostFiles=$manifest.hostFiles;stableHostFiles=$manifest.stableHostFiles;targetRoot=$manifest.targetRoot;dataDir=$manifest.dataDir;manageHooks=[bool]$WithHooks;hooksPath=$manifest.hooksPath;previousHooksSha256=$manifest.previousHooksSha256;installedHooksSha256=(Hash $merged);files=$manifest.files;stableAgent=$agent}
[IO.File]::WriteAllText((Join-Path $backup 'receipt.json'),($receipt|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
Stop-ReviewedWidget $manifest
foreach($entry in $manifest.files){$target=Child $manifest.targetRoot $entry.target;$null=New-Item -ItemType Directory -Force -Path ([IO.Path]::GetDirectoryName($target));Copy-ReviewedFile (Child (Join-Path $package 'files') $entry.target) $target $entry.sha256}
if($agent){foreach($entry in $agent.files){$target=Child $agent.targetRoot $entry.target;Copy-ReviewedFile (Child (Join-Path $package 'agent-files') $entry.target) $target $entry.sha256}}
if($WithHooks){
  if((Hash $manifest.hooksPath)-ne $manifest.previousHooksSha256){throw 'Codex hooks changed during installation; backup preserved'}
  Copy-Item -LiteralPath $merged -Destination $manifest.hooksPath -Force
  if((Hash $manifest.hooksPath)-ne $receipt.installedHooksSha256){throw 'Hook deployment verification failed'}
}
if(!$NoRestart){Start-Process -FilePath 'wscript.exe' -ArgumentList ('"'+(Join-Path $manifest.targetRoot 'launch.vbs')+'"') -WindowStyle Hidden}
@{ok=$true;mode='installed';backup=$backup;requiresUserHookReview=[bool]$WithHooks}|ConvertTo-Json
