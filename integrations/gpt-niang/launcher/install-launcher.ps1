param(
  [string]$UserRoot = '$env:USERPROFILE',
  [string]$ReportRoot
)
$ErrorActionPreference = 'Stop'
if (!$ReportRoot) {
  $ReportRoot = Join-Path $PSScriptRoot ('..\..\..\work\gpt-niang-launcher\' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
}
$ReportRoot = [IO.Path]::GetFullPath($ReportRoot)
if (Test-Path -LiteralPath $ReportRoot) { throw 'Use a new report directory.' }
$agentRoot = Join-Path $UserRoot 'AppData\Local\GPTNiangUsage\update-agent'
$launch = Join-Path $agentRoot 'agent-launch.vbs'
$iconSource = Join-Path $PSScriptRoot 'gpt-niang-v1.ico'
$wscript = Join-Path $env:WINDIR 'System32\wscript.exe'
foreach ($file in @($launch, $iconSource, $wscript)) {
  if (!(Test-Path -LiteralPath $file -PathType Leaf)) { throw "Missing file: $file" }
}
$desktop = [Environment]::GetFolderPath('Desktop')
$programs = [Environment]::GetFolderPath('Programs')
$name = 'GPT' + [char]0x5A18
$openName = [string][char]0x6253 + [char]0x5F00 + ' ' + $name
$menuDir = Join-Path $programs ($name + [char]0x989D + [char]0x5EA6 + [char]0x6302 + [char]0x4EF6)
$iconRoot = Join-Path $UserRoot 'AppData\Local\Programs\GPTNiangUsage\launcher'
$iconTarget = Join-Path $iconRoot 'gpt-niang-v1.ico'
$links = @((Join-Path $desktop ($name + '.lnk')), (Join-Path $menuDir ($openName + '.lnk')))
$null = New-Item -ItemType Directory -Path $ReportRoot
$backups = @()
$index = 0
foreach ($path in @($iconTarget) + $links) {
  if (Test-Path -LiteralPath $path) {
    $backup = Join-Path $ReportRoot ("before-$index" + [IO.Path]::GetExtension($path))
    Copy-Item -LiteralPath $path -Destination $backup
    $backups += [pscustomobject]@{ original = $path; backup = $backup }
  }
  $index++
}
$null = New-Item -ItemType Directory -Path $iconRoot, $menuDir -Force
Copy-Item -LiteralPath $iconSource -Destination $iconTarget -Force
if ((Get-FileHash -LiteralPath $iconSource).Hash -ne (Get-FileHash -LiteralPath $iconTarget).Hash) { throw 'Icon copy mismatch.' }
$shell = New-Object -ComObject WScript.Shell
$verified = @()
foreach ($path in $links) {
  $shortcut = $shell.CreateShortcut($path)
  $shortcut.TargetPath = $wscript
  $shortcut.Arguments = '"' + $launch + '"'
  $shortcut.WorkingDirectory = $agentRoot
  $shortcut.IconLocation = $iconTarget + ',0'
  $shortcut.Description = 'Open GPT Niang'
  $shortcut.WindowStyle = 1
  $shortcut.Save()
  $readback = $shell.CreateShortcut($path)
  if ($readback.TargetPath -ine $wscript -or $readback.Arguments -cne ('"' + $launch + '"') -or $readback.WorkingDirectory -ine $agentRoot -or $readback.IconLocation -ine ($iconTarget + ',0')) {
    throw "Shortcut verification failed: $path"
  }
  $verified += [pscustomobject]@{ path = $path; target = $readback.TargetPath; arguments = $readback.Arguments; icon = $readback.IconLocation; verified = $true }
}
$report = [pscustomobject]@{ createdAt = [DateTime]::UtcNow.ToString('o'); shortcuts = $verified; icon = $iconTarget; backups = $backups; applicationCodeChanged = $false }
$json = $report | ConvertTo-Json -Depth 6
[IO.File]::WriteAllText((Join-Path $ReportRoot 'installation.json'), $json, [Text.UTF8Encoding]::new($false))
$json
