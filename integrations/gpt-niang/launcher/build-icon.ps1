param(
  [string]$Source = '$env:LOCALAPPDATA\Programs\GPTNiangUsage\gpt-niang-usage\assets\gpt-dragon-niang-bust.png'
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$original = [Drawing.Image]::FromFile($Source)
$frames = @()
try {
  foreach ($size in @(16, 24, 32, 48, 64, 128, 256)) {
    $bitmap = [Drawing.Bitmap]::new($size, $size, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    $stream = [IO.MemoryStream]::new()
    try {
      $graphics.Clear([Drawing.Color]::Transparent)
      $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $ratio = [Math]::Min($size / $original.Width, $size / $original.Height)
      $width = [int][Math]::Round($original.Width * $ratio)
      $height = [int][Math]::Round($original.Height * $ratio)
      $graphics.DrawImage($original, [Drawing.Rectangle]::new([int](($size-$width)/2), [int](($size-$height)/2), $width, $height))
      $bitmap.Save($stream, [Drawing.Imaging.ImageFormat]::Png)
      $frames += [pscustomobject]@{ size = $size; bytes = $stream.ToArray() }
      if ($size -eq 256) { $bitmap.Save((Join-Path $PSScriptRoot 'icon-preview.png'), [Drawing.Imaging.ImageFormat]::Png) }
    } finally { $graphics.Dispose(); $bitmap.Dispose(); $stream.Dispose() }
  }
} finally { $original.Dispose() }
$output = [IO.File]::Create((Join-Path $PSScriptRoot 'gpt-niang-v1.ico'))
$writer = [IO.BinaryWriter]::new($output)
try {
  $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$frames.Count)
  $offset = 6 + 16 * $frames.Count
  foreach ($frame in $frames) {
    $dimension = if ($frame.size -eq 256) { 0 } else { $frame.size }
    $writer.Write([byte]$dimension); $writer.Write([byte]$dimension)
    $writer.Write([byte]0); $writer.Write([byte]0)
    $writer.Write([uint16]1); $writer.Write([uint16]32)
    $writer.Write([uint32]$frame.bytes.Length); $writer.Write([uint32]$offset)
    $offset += $frame.bytes.Length
  }
  foreach ($frame in $frames) { $writer.Write([byte[]]$frame.bytes) }
} finally { $writer.Dispose(); $output.Dispose() }
Get-FileHash -LiteralPath $Source, (Join-Path $PSScriptRoot 'gpt-niang-v1.ico') | Select-Object Path, Hash
