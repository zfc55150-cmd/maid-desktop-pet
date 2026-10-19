$ErrorActionPreference='Stop'
$sourceRoot=Split-Path $PSScriptRoot -Parent
$appRoot=Join-Path $env:LOCALAPPDATA 'Programs\DeepSeekActionPet'
$dataRoot=Join-Path $env:LOCALAPPDATA 'DeepSeekActionPet'
$manifest=Get-Content -LiteralPath (Join-Path $sourceRoot 'deployment.json') -Raw | ConvertFrom-Json
$matched=0
foreach($item in $manifest.files){if((Get-FileHash -LiteralPath (Join-Path $appRoot $item.target)).Hash -ne $item.sha256){throw ('Installed mismatch: '+$item.target)};$matched++}
$before=@{}
foreach($name in @('simple-chat\chat.json','simple-chat\chat.json.bak','dsh-pet\main-config.jsonc')){$file=Join-Path $dataRoot $name;if(Test-Path -LiteralPath $file){$before[$file]=(Get-FileHash -LiteralPath $file).Hash}}
& (Join-Path $appRoot 'node.exe') (Join-Path $appRoot 'launcher.mjs') --stop
if($LASTEXITCODE -ne 0){throw 'Authenticated stop failed'}
for($i=0;$i -lt 60;$i++){$left=@(Get-Process | Where-Object {$_.Path -like ($appRoot+'\electron\*')});if(!$left.Count){break};Start-Sleep -Milliseconds 100}
if($left.Count){throw 'Electron children did not exit'}
$args='"'+(Join-Path $appRoot 'launcher.mjs')+'"'
$one=Start-Process -FilePath (Join-Path $appRoot 'node.exe') -ArgumentList $args -WindowStyle Hidden -PassThru
$two=Start-Process -FilePath (Join-Path $appRoot 'node.exe') -ArgumentList $args -WindowStyle Hidden -PassThru
if(!$one.WaitForExit(15000) -or !$two.WaitForExit(15000)){throw 'Launcher verification timed out'}
if($one.ExitCode -ne 0 -or $two.ExitCode -ne 0){throw 'Concurrent launchers did not both recognize the surviving instance'}
$health=Invoke-RestMethod -Uri 'http://127.0.0.1:3088/health' -NoProxy
$hosts=@(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {$_.ExecutablePath -eq (Join-Path $appRoot 'node.exe') -and $_.CommandLine -like '*standalone.js*'})
if($hosts.Count -ne 1){throw 'More than one installed host is running'}
$get=Invoke-WebRequest -Uri 'http://127.0.0.1:3088/shutdown' -NoProxy -SkipHttpErrorCheck
$post=Invoke-WebRequest -Uri 'http://127.0.0.1:3088/shutdown' -Method Post -NoProxy -SkipHttpErrorCheck
if($get.StatusCode -ne 405 -or $post.StatusCode -ne 403){throw 'Unauthenticated shutdown was not rejected'}
foreach($file in $before.Keys){if((Get-FileHash -LiteralPath $file).Hash -ne $before[$file]){throw 'Personal data changed during restart test'}}
$result=[ordered]@{installedFilesVerified=$matched;authenticatedStop=$true;concurrentLaunchersSucceeded=$true;singleHost=$true;hostPid=$health.pid;unauthenticatedGet=$get.StatusCode;unauthenticatedPost=$post.StatusCode;personalFilesUnchanged=$true}
New-Item -ItemType Directory -Path (Join-Path $sourceRoot 'work\final-check') -Force | Out-Null
$result | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $sourceRoot 'work\final-check\result.json') -Encoding utf8
$result | ConvertTo-Json -Compress
