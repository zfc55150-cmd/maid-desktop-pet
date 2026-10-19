param([string]$InstalledRoot=(Join-Path $env:LOCALAPPDATA 'Programs\DeepSeekActionPet'))
$ErrorActionPreference='Stop'
$sourceRoot=Split-Path $PSScriptRoot -Parent
$workRoot=Join-Path $sourceRoot 'work\host-smoke'
$stageRoot=Join-Path $workRoot 'app'
New-Item -ItemType Directory -Path $stageRoot -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $InstalledRoot 'node_modules') -Destination $stageRoot -Recurse -Force
Copy-Item -LiteralPath (Join-Path $InstalledRoot 'package.json') -Destination $stageRoot -Force
Copy-Item -LiteralPath (Join-Path $sourceRoot 'app\standalone.mjs') -Destination (Join-Path $stageRoot 'node_modules\dsh-pet\lib\standalone.js') -Force
Get-ChildItem -LiteralPath (Join-Path $sourceRoot 'app\electron-helper') -File | Copy-Item -Destination (Join-Path $stageRoot 'node_modules\dsh-pet\runtime\electron-helper') -Force
$dataRoot=Join-Path $workRoot 'data'
New-Item -ItemType Directory -Path (Join-Path $dataRoot 'simple-chat'),(Join-Path $dataRoot 'dsh-pet') -Force | Out-Null
[IO.File]::WriteAllText((Join-Path $dataRoot 'simple-chat\chat.json'),'{"prompt":"Synthetic test persona","messages":[],"voiceEnabled":false}',[Text.UTF8Encoding]::new($false))
$appearance=@{notificationsEnabled=$false;confineToScreen=$true;pets=@(@{id='main';name='Test pet';size=480;balanceEnabled=$false;whisperEnabled=$false;workStatusEnabled=$false;fixedEnabled=$false;display='desktop';position=@{corner='bottom-right';marginX=100;marginY=80}})} | ConvertTo-Json -Depth 6
[IO.File]::WriteAllText((Join-Path $dataRoot 'dsh-pet\main-config.jsonc'),$appearance,[Text.UTF8Encoding]::new($false))
$mainFile=Join-Path $stageRoot 'node_modules\dsh-pet\runtime\electron-helper\main.js'
$main=Get-Content -LiteralPath $mainFile -Raw
$main=$main.Replace("app.setName('dsh-pet-electron-helper');","app.setName('dsh-pet-electron-helper');`napp.setPath('userData', require('node:path').join(process.env.DSH_HOME,'electron-profile'));")
$main=$main.Replace('paintWhenInitiallyHidden: false,','paintWhenInitiallyHidden: true,').Replace('win.showInactive()','void 0')
[IO.File]::WriteAllText($mainFile,$main,[Text.UTF8Encoding]::new($false))
foreach($name in @('pet.png','result.json')){ $file=Join-Path $workRoot $name;if(Test-Path -LiteralPath $file){Remove-Item -LiteralPath $file -Force} }
'Isolated test host prepared. Run scripts/host-smoke.ps1.'
