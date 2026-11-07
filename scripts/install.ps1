param([string]$OutputRoot,[switch]$PreflightOnly,[string]$InstalledRoot,[string]$BaselinePath,[string]$ProfileSyncManifest,[string]$MediaSyncManifest)
$ErrorActionPreference='Stop'
$sourceRoot=Split-Path $PSScriptRoot -Parent
$appRoot=Join-Path $env:LOCALAPPDATA 'Programs\DeepSeekActionPet'
if($InstalledRoot){if(!$PreflightOnly){throw 'InstalledRoot override is allowed only with PreflightOnly'};$appRoot=[IO.Path]::GetFullPath($InstalledRoot)}
$dataRoot=Join-Path $env:LOCALAPPDATA 'DeepSeekActionPet'
$manifest=Get-Content -LiteralPath (Join-Path $sourceRoot 'deployment.json') -Raw | ConvertFrom-Json
# The same code-only validation precedes both preview and real installation.
$node=Join-Path $appRoot 'node.exe'
if(!(Test-Path -LiteralPath $node)){throw 'Installed Node runtime was not found'}
$arguments=@((Join-Path $PSScriptRoot 'deployment-safety.cjs'),'preflight',$sourceRoot,$appRoot)
if($BaselinePath){$arguments+=$BaselinePath}
$preflight=& $node @arguments
if($LASTEXITCODE -ne 0){throw 'Deployment preflight failed; no installation was attempted'}
if($ProfileSyncManifest){
 $profilePreflight=& $node (Join-Path $PSScriptRoot 'profile-deployment-safety.cjs') preflight $ProfileSyncManifest $sourceRoot
 if($LASTEXITCODE -ne 0){throw 'Profile preflight failed; nothing was installed'}
}
if($MediaSyncManifest){
 $mediaPreflight=& $node (Join-Path $PSScriptRoot 'media-deployment-safety.cjs') preflight $MediaSyncManifest $sourceRoot
 if($LASTEXITCODE -ne 0){throw 'Media preflight failed; nothing was installed'}
}
if($PreflightOnly){$preflight;if($ProfileSyncManifest){$profilePreflight};if($MediaSyncManifest){$mediaPreflight};return}
if(!$OutputRoot){$OutputRoot=Join-Path $env:USERPROFILE ('Documents\Codex_产出\DeepSeek桌宠\维护版本\'+(Get-Date -Format 'yyyy-MM-dd-HHmmss')+'-'+$manifest.version)}
$backupRoot=Join-Path $OutputRoot '更新前代码'
if(Test-Path -LiteralPath $backupRoot){throw 'Backup directory already exists. Choose another OutputRoot before another install.'}
function Under([string]$Base,[string]$Relative){
 $baseFull=[IO.Path]::GetFullPath($Base).TrimEnd('\')+'\'
 $full=[IO.Path]::GetFullPath((Join-Path $Base $Relative))
 if(!$full.StartsWith($baseFull,[StringComparison]::OrdinalIgnoreCase)){throw 'Path escapes approved root'}
 $cursor=$full
 while($cursor.Length -ge $baseFull.TrimEnd('\').Length){
  if((Test-Path -LiteralPath $cursor) -and ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Refusing reparse point'}
  $cursor=Split-Path $cursor -Parent
 }
 return $full
}
$protected=@((Join-Path $dataRoot 'simple-chat\chat.json'),(Join-Path $dataRoot 'simple-chat\chat.json.bak'),(Join-Path $dataRoot 'dsh-pet\main-config.jsonc'),(Join-Path $appRoot 'voice-runtime\reference.wav'),(Join-Path $appRoot 'voice-runtime\voice-settings.json'))
$before=@{}
foreach($file in $protected){if(Test-Path -LiteralPath $file){$before[$file]=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash}}
foreach($item in $manifest.files){
 $source=Under $sourceRoot $item.source
 $target=Under $appRoot $item.target
 if((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -ne $item.sha256){throw 'Source hash mismatch'}
 if($item.previousSha256){if(!(Test-Path -LiteralPath $target) -or (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -ne $item.previousSha256){throw ('Installed file changed since review: '+$item.target)}}
 elseif(Test-Path -LiteralPath $target){throw ('Unexpected target file: '+$item.target)}
}
New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
foreach($item in $manifest.files){
 if($item.previousSha256){$backup=Under $backupRoot $item.target;New-Item -ItemType Directory -Path (Split-Path $backup -Parent) -Force | Out-Null;Copy-Item -LiteralPath (Under $appRoot $item.target) -Destination $backup}
}
Copy-Item -LiteralPath (Join-Path $sourceRoot 'deployment.json') -Destination (Join-Path $backupRoot 'deployment.json')
if($ProfileSyncManifest){
 & $node (Join-Path $PSScriptRoot 'profile-deployment-safety.cjs') prepare $ProfileSyncManifest $backupRoot $sourceRoot
 if($LASTEXITCODE -ne 0){throw 'Profile backup failed; no installed code was changed'}
}
if($MediaSyncManifest){
 & $node (Join-Path $PSScriptRoot 'media-deployment-safety.cjs') prepare $MediaSyncManifest $backupRoot $sourceRoot
 if($LASTEXITCODE -ne 0){throw 'Media backup failed; no installed code was changed'}
}
# The pre-upgrade launcher knows its own shutdown protocol (including older versions).
& (Join-Path $appRoot 'node.exe') (Join-Path $PSScriptRoot 'assert-shared-runtime-idle.cjs')
if($LASTEXITCODE -ne 0){throw 'Independent host is active or unknown; shared runtime was not changed'}
& (Join-Path $appRoot 'node.exe') (Join-Path $appRoot 'launcher.mjs') --stop
if($LASTEXITCODE -ne 0){throw 'Existing launcher could not stop the pet; no code was replaced'}
for($i=0;$i -lt 60;$i++){
 $active=@(Get-Process | Where-Object {$_.Path -like ($appRoot+'\*')})
 if(!$active.Count){break};Start-Sleep -Milliseconds 100
}
if($active.Count){throw 'Pet processes did not exit; no code was replaced'}
& (Join-Path $appRoot 'node.exe') (Join-Path $PSScriptRoot 'assert-shared-runtime-idle.cjs')
if($LASTEXITCODE -ne 0){throw 'Independent host is active or unknown; shared runtime was not changed'}

# Refresh protection hashes only after all writers have exited.
foreach($file in $protected){if(Test-Path -LiteralPath $file){$before[$file]=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash}}
$changed=@()
try {
 foreach($item in $manifest.files){
  if($item.sha256 -eq $item.previousSha256){continue}
  $target=Under $appRoot $item.target
  $changed+=$item
  $temporary=$target+'.maintenance-new'
  Copy-Item -LiteralPath (Under $sourceRoot $item.source) -Destination $temporary -Force
  if((Get-FileHash -LiteralPath $temporary -Algorithm SHA256).Hash -ne $item.sha256){throw 'Copied file hash mismatch'}
  Move-Item -LiteralPath $temporary -Destination $target -Force
 }
 foreach($item in $manifest.files){if((Get-FileHash -LiteralPath (Under $appRoot $item.target)).Hash -ne $item.sha256){throw 'Installed checksum mismatch'}}
 foreach($file in $before.Keys){if((Get-FileHash -LiteralPath $file).Hash -ne $before[$file]){throw 'Protected personal data or voice reference changed'}}
 if($ProfileSyncManifest){
  & $node (Join-Path $PSScriptRoot 'profile-deployment-safety.cjs') apply $backupRoot
  if($LASTEXITCODE -ne 0){throw 'Profile installation failed'}
 }
 if($MediaSyncManifest){
  & $node (Join-Path $PSScriptRoot 'media-deployment-safety.cjs') apply $backupRoot
  if($LASTEXITCODE -ne 0){throw 'Media installation failed'}
 }
 & (Join-Path $appRoot 'node.exe') (Join-Path $appRoot 'launcher.mjs')
 if($LASTEXITCODE -ne 0){throw 'New launcher failed to start'}
 $h=Invoke-RestMethod -Uri 'http://127.0.0.1:3088/health' -NoProxy -TimeoutSec 5
 if($h.plugin.root -ne (Join-Path $appRoot 'node_modules\dsh-pet')){throw 'Unexpected running instance'}
 $result=[ordered]@{version=$manifest.version;installed=$true;changedFiles=$changed.Count;protectedFilesUnchanged=$true;profileSync=[bool]$ProfileSyncManifest;mediaSync=[bool]$MediaSyncManifest;backup=$backupRoot;pid=$h.pid}
 $result | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $OutputRoot '安装结果.json') -Encoding utf8
 $result | ConvertTo-Json -Compress
} catch {
 $failure=$_
 # Roll back only files from the reviewed deployment manifest.
 try{& (Join-Path $appRoot 'node.exe') (Join-Path $appRoot 'launcher.mjs') --stop}catch{}
 for($i=0;$i -lt 60;$i++){
  $rollbackActive=@(Get-Process | Where-Object {$_.Path -like ($appRoot+'\*')})
  if(!$rollbackActive.Count){break};Start-Sleep -Milliseconds 100
 }
 if($rollbackActive.Count){throw 'Processes remain active; rollback was not attempted. Reviewed backups retained'}
 $mediaRollbackFailed=$false
 if($MediaSyncManifest){
  & $node (Join-Path $PSScriptRoot 'media-deployment-safety.cjs') rollback $backupRoot
  $mediaRollbackFailed=$LASTEXITCODE -ne 0
 }
 $profileRollbackFailed=$false
 if($ProfileSyncManifest){
  & $node (Join-Path $PSScriptRoot 'profile-deployment-safety.cjs') rollback $backupRoot
  $profileRollbackFailed=$LASTEXITCODE -ne 0
 }
 foreach($item in $changed){
  $target=Under $appRoot $item.target
  if($item.previousSha256){Copy-Item -LiteralPath (Under $backupRoot $item.target) -Destination $target -Force}
  elseif(Test-Path -LiteralPath $target){Remove-Item -LiteralPath $target -Force}
 }
 if($profileRollbackFailed -or $mediaRollbackFailed){throw 'Code restored; configuration/media rollback refused a concurrent change. Original backups retained and automatic restart blocked'}
 & (Join-Path $appRoot 'node.exe') (Join-Path $appRoot 'launcher.mjs')
 throw $failure
}
