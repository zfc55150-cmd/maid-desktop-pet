param([Parameter(Mandatory=$true)][string]$BackupRoot,[switch]$PreflightOnly,[string]$InstalledRoot,[string]$ProfileSyncManifest,[string]$MediaSyncManifest,[switch]$NoRestart)
$ErrorActionPreference='Stop'
$appRoot=[IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Programs\DeepSeekActionPet'))
if($InstalledRoot){if(!$PreflightOnly){throw 'InstalledRoot override is allowed only with PreflightOnly'};$appRoot=[IO.Path]::GetFullPath($InstalledRoot)}
$backupFull=[IO.Path]::GetFullPath($BackupRoot)
$manifest=Get-Content -LiteralPath (Join-Path $backupFull 'deployment.json') -Raw | ConvertFrom-Json
& (Join-Path $appRoot 'node.exe') (Join-Path $PSScriptRoot 'deployment-safety.cjs') rollback-preflight $backupFull $appRoot
if($LASTEXITCODE -ne 0){throw 'Rollback preflight failed; no installed code was modified'}
$profileReceipt=Join-Path $backupFull 'profile-configs\receipt.json'
if($ProfileSyncManifest -and !(Test-Path -LiteralPath $profileReceipt)){throw 'Backup has no profile receipt'}
if(Test-Path -LiteralPath $profileReceipt){
 if($ProfileSyncManifest -and (Get-FileHash -LiteralPath $ProfileSyncManifest).Hash -ne (Get-Content -LiteralPath $profileReceipt -Raw | ConvertFrom-Json).manifestSha256){throw 'Profile sync manifest does not match backup receipt'}
 & (Join-Path $appRoot 'node.exe') (Join-Path $PSScriptRoot 'profile-deployment-safety.cjs') rollback-preflight $backupFull
 if($LASTEXITCODE -ne 0){throw 'Profile rollback preflight failed; nothing was modified'}
}
$mediaReceipt=Join-Path $backupFull 'tea-media\receipt.json'
if($MediaSyncManifest -and !(Test-Path -LiteralPath $mediaReceipt)){throw 'Backup has no media receipt'}
if(Test-Path -LiteralPath $mediaReceipt){
 if($MediaSyncManifest -and (Get-FileHash -LiteralPath $MediaSyncManifest).Hash -ne (Get-Content -LiteralPath $mediaReceipt -Raw | ConvertFrom-Json).manifestSha256){throw 'Media manifest does not match backup receipt'}
 & (Join-Path $appRoot 'node.exe') (Join-Path $PSScriptRoot 'media-deployment-safety.cjs') rollback-preflight $backupFull
 if($LASTEXITCODE -ne 0){throw 'Media rollback preflight failed; nothing was modified'}
}
if($PreflightOnly){return}
function ChildPath([string]$Base,[string]$Relative){$full=[IO.Path]::GetFullPath((Join-Path $Base $Relative));if(!$full.StartsWith($Base.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Unsafe path'};return $full}
foreach($item in $manifest.files){
 if($item.previousSha256){$source=ChildPath $backupFull $item.target;if((Get-FileHash -LiteralPath $source).Hash -ne $item.previousSha256){throw 'Backup verification failed'}}
}
& (Join-Path $appRoot 'node.exe') (Join-Path $PSScriptRoot 'assert-shared-runtime-idle.cjs')
if($LASTEXITCODE -ne 0){throw 'Independent host is active or unknown; shared runtime was not changed'}
& (Join-Path $appRoot 'node.exe') (Join-Path $appRoot 'launcher.mjs') --stop
if($LASTEXITCODE -ne 0){throw 'Stop the pet before restoring code'}
for($i=0;$i -lt 60;$i++){
 $active=@(Get-Process | Where-Object {$_.Path -like ($appRoot+'\*')})
 if(!$active.Count){break};Start-Sleep -Milliseconds 100
}
if($active.Count){throw 'Pet processes did not exit; no code was restored'}
& (Join-Path $appRoot 'node.exe') (Join-Path $PSScriptRoot 'assert-shared-runtime-idle.cjs')
if($LASTEXITCODE -ne 0){throw 'Independent host is active or unknown; shared runtime was not changed'}

$null=& (Join-Path $appRoot 'node.exe') (Join-Path $PSScriptRoot 'deployment-safety.cjs') rollback-preflight $backupFull $appRoot
if($LASTEXITCODE -ne 0){throw 'Installed code changed while stopping; no code was restored'}
if(Test-Path -LiteralPath $mediaReceipt){
 & (Join-Path $appRoot 'node.exe') (Join-Path $PSScriptRoot 'media-deployment-safety.cjs') combined-rollback $backupFull $appRoot
 if($LASTEXITCODE -ne 0){throw 'Combined code/profile/media rollback failed; previous transaction state restored'}
}elseif(Test-Path -LiteralPath $profileReceipt){
 & (Join-Path $appRoot 'node.exe') (Join-Path $PSScriptRoot 'profile-deployment-safety.cjs') combined-rollback $backupFull $appRoot
 if($LASTEXITCODE -ne 0){throw 'Combined code/profile rollback failed; previous transaction state restored'}
}else{
foreach($item in $manifest.files){
 $target=ChildPath $appRoot $item.target
 if($item.previousSha256){Copy-Item -LiteralPath (ChildPath $backupFull $item.target) -Destination $target -Force}
 elseif(Test-Path -LiteralPath $target){Remove-Item -LiteralPath $target -Force}
}
foreach($item in $manifest.files){
 $target=ChildPath $appRoot $item.target
 if($item.previousSha256){if((Get-FileHash -LiteralPath $target).Hash -ne $item.previousSha256){throw 'Restored checksum mismatch'}}
 elseif(Test-Path -LiteralPath $target){throw 'New module was not removed during rollback'}
}
}
if(!$NoRestart){
 & (Join-Path $appRoot 'node.exe') (Join-Path $appRoot 'launcher.mjs')
 if($LASTEXITCODE -ne 0){throw 'Restored code could not start'}
}
'Code restored. Personal chat data and model files were not rolled back.'
