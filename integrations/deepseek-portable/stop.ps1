param([Parameter(Mandatory = $true)][string]$Root)
$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path -LiteralPath $Root).Path
$node = Join-Path $Root 'node.exe'
$launcher = Join-Path $Root 'launcher.mjs'
if (!(Test-Path -LiteralPath $node -PathType Leaf) -or !(Test-Path -LiteralPath $launcher -PathType Leaf)) {
  Write-Error 'Portable launcher or node.exe is missing.'
  exit 1
}
# The launcher authenticates with this profile's session and validates its port,
# PID and plugin root. Do not kill processes by a command-line substring.
& $node $launcher --stop
if ($LASTEXITCODE -ne 0) {
  Write-Error 'The portable pet could not be stopped safely.'
  exit 1
}
Write-Output '[portable-stop] authenticated shutdown completed.'
exit 0
