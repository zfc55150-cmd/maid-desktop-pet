param([Parameter(Mandatory=$true)][string]$Stage,[string]$Python='C:\Program Files (x86)\Microsoft Visual Studio\Shared\Python39_64\python.exe')
$ErrorActionPreference='Stop'
$appDir=pathlib.Path(os.environ.get('LOCALAPPDATA', str(pathlib.Path.home() / 'AppData/Local'))) / 'Programs/GPTNiangUsage/gpt-niang-usage'
$config=Get-Content -LiteralPath (Join-Path $appDir 'installation.json') -Raw -Encoding UTF8|ConvertFrom-Json
. (Join-Path $appDir 'runtime\supervisor-task.ps1')
Stop-WidgetSupervisorTask -AppDir $appDir
Stop-WidgetGui -AppDir $appDir -DataDir $config.dataDir
& $Python (Join-Path (Get-Location) 'integrations\gpt-niang\product-electron\rollback-installed.py') $Stage
if($LASTEXITCODE-ne 0){throw 'Rollback stopped; keep all archives and diagnostics'}
Remove-Item -LiteralPath (Join-Path $config.dataDir 'stop.flag') -ErrorAction SilentlyContinue
. (Join-Path $appDir 'runtime\supervisor-task.ps1')
Start-WidgetSupervisorTask -AppDir $appDir
