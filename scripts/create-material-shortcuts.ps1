param([Parameter(Mandatory=$true)][string]$Library)
$ErrorActionPreference = 'Stop'
$libraryRoot = (Resolve-Path -LiteralPath $Library).Path
$items = Get-Content -LiteralPath (Join-Path $libraryRoot '分类导航.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$shell = New-Object -ComObject WScript.Shell
$created = 0
foreach ($item in $items) {
    if (-not (Test-Path -LiteralPath $item.target)) { throw "Missing target: $($item.target)" }
    $folder = Join-Path $libraryRoot $item.category
    $resolvedFolder = (Resolve-Path -LiteralPath $folder).Path
    if (-not $resolvedFolder.StartsWith($libraryRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Shortcut destination escaped library' }
    $label = ($item.label -replace '[<>:"/\\|?*\x00-\x1f]', '_')
    if ($label.Length -gt 105) { $label = $label.Substring(0,105) }
    $created++
    $file = Join-Path $resolvedFolder ('{0:D4}_{1}.lnk' -f $created, $label)
    if (Test-Path -LiteralPath $file) { throw 'Refusing to overwrite shortcut' }
    $link = $shell.CreateShortcut($file)
    $link.TargetPath = $item.target
    $link.Description = '素材导航；原文件保持原位置'
    $link.Save()
    $check = $shell.CreateShortcut($file)
    if ($check.TargetPath -ne $item.target) { throw 'Shortcut verification failed' }
}
@{shortcuts=$created; verified=$true; library=$libraryRoot} | ConvertTo-Json
