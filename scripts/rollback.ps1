param([Parameter(Mandatory=$true)][string]$BackupRoot)
$ErrorActionPreference='Stop'
$appRoot=[IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Programs\DeepSeekActionPet'))
$backupFull=[IO.Path]::GetFullPath($BackupRoot)
$manifest=Get-Content -LiteralPath (Join-Path $backupFull 'deployment.json') -Raw | ConvertFrom-Json
function ChildPath([string]$Base,[string]$Relative){$full=[IO.Path]::GetFullPath((Join-Path $Base $Relative));if(!$full.StartsWith($Base.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Unsafe path'};return $full}
foreach($item in $manifest.files){
 if($item.previousSha256){$source=ChildPath $backupFull $item.target;if((Get-FileHash -LiteralPath $source).Hash -ne $item.previousSha256){throw 'Backup verification failed'}}
}
& (Join-Path $appRoot 'node.exe') (Join-Path $appRoot 'launcher.mjs') --stop
if($LASTEXITCODE -ne 0){throw 'Stop the pet before restoring code'}
foreach($item in $manifest.files){
 $target=ChildPath $appRoot $item.target
 if($item.previousSha256){Copy-Item -LiteralPath (ChildPath $backupFull $item.target) -Destination $target -Force}
 elseif(Test-Path -LiteralPath $target){Remove-Item -LiteralPath $target -Force}
}
& (Join-Path $appRoot 'node.exe') (Join-Path $appRoot 'launcher.mjs')
if($LASTEXITCODE -ne 0){throw 'Restored code could not start'}
'Code restored. Personal chat data and model files were not rolled back.'
