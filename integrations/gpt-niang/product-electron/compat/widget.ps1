param([string]$AppDir=$PSScriptRoot,[switch]$CheckOnly,[switch]$Preview)
# Compatibility dispatcher for existing shortcuts and MCP clients. No WPF UI.
$entry=Join-Path $AppDir 'runtime\start-widget.ps1'
& ([scriptblock]::Create([IO.File]::ReadAllText($entry,[Text.Encoding]::UTF8))) -AppDir $AppDir -CheckOnly:$CheckOnly -Preview:$Preview
