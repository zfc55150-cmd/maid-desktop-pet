param([string]$WidgetPath,[string]$AppDir=(Split-Path $PSScriptRoot -Parent),[switch]$CheckOnly,[switch]$Preview)
$ErrorActionPreference='Stop'
$appDir=[IO.Path]::GetFullPath($AppDir).TrimEnd('\')
$active=Get-Content -LiteralPath (Join-Path $appDir 'active-version.json') -Raw -Encoding UTF8|ConvertFrom-Json
if($active.renderer-ne 'electron' -or $active.version-notmatch '^\d+\.\d+\.\d+-electron(?:\.\d+)?$'){throw 'Invalid Electron activation record'}
$versionDir=Join-Path $appDir ('versions\'+$active.version)
foreach($item in @(@{relative='app\main.cjs';hash=$active.mainSha256},@{relative='electron\electron.exe';hash=$active.electronSha256},@{relative='package-manifest.json';hash=$active.manifestSha256})){
 $file=Join-Path $versionDir $item.relative
 if(!(Test-Path -LiteralPath $file -PathType Leaf) -or !$item.hash -or (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash-ine $item.hash){throw 'Electron activation hash mismatch'}
}
if($CheckOnly){return [pscustomobject]@{ok=$true;renderer='electron';version=$active.version;appDir=$versionDir}}
$process=Start-Process -FilePath (Join-Path $versionDir 'electron\electron.exe') -ArgumentList @(('"'+(Join-Path $versionDir 'app\main.cjs')+'"'),('"'+$versionDir+'"')) -WorkingDirectory $versionDir -WindowStyle Hidden -PassThru
try{$process.WaitForExit();if($process.ExitCode-ne 0){throw 'Electron character exited with an error'}}finally{$process.Dispose()}
