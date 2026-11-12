param(
  [Parameter(Mandatory=$true)][string]$Output,
  [ValidateRange(1,1440)][int]$Minutes = 1440,
  [ValidateRange(2,300)][int]$IntervalSeconds = 60
)
$ErrorActionPreference = 'Stop'
$local = [Environment]::GetFolderPath('LocalApplicationData')
$roots = [ordered]@{
  GPT = (Join-Path $local 'Programs/GPTNiangUsage/gpt-niang-usage') + [IO.Path]::DirectorySeparatorChar
  DeepSeek = (Join-Path $local 'Programs/DeepSeekActionPet') + [IO.Path]::DirectorySeparatorChar
}
$target = [IO.Path]::GetFullPath($Output)
$stream = [IO.File]::Open($target, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::Read)
$writer = [IO.StreamWriter]::new($stream)
$writer.AutoFlush = $true
$clock = [Diagnostics.Stopwatch]::StartNew()
$previous = @{}
$counts = @{}

function Write-Record($Record) {
  $writer.WriteLine(($Record | ConvertTo-Json -Compress -Depth 5))
}

try {
  Write-Record ([ordered]@{type='started'; utc=[DateTime]::UtcNow.ToString('o');
    minutes=$Minutes; intervalSeconds=$IntervalSeconds; samplerPid=$PID; scope='installed app executable directories'})
  while ($true) {
    $elapsed = $clock.Elapsed.TotalSeconds
    $groups = @{}
    foreach ($name in $roots.Keys) { $groups[$name] = [Collections.Generic.List[object]]::new() }
    foreach ($process in (Get-Process -Name electron,node -ErrorAction SilentlyContinue)) {
      try {
        $image = $process.Path
        if (!$image) { continue }
        foreach ($name in $roots.Keys) {
          if (!$image.StartsWith($roots[$name], [StringComparison]::OrdinalIgnoreCase)) { continue }
          $groups[$name].Add(@{key="$($process.Id)/$($process.StartTime.ToUniversalTime().Ticks)";
            cpu=$process.TotalProcessorTime.TotalSeconds; private=$process.PrivateMemorySize64; resident=$process.WorkingSet64})
        }
      } catch { continue }
    }
    foreach ($name in $roots.Keys) {
      $prior = $previous[$name]
      $current = @{}
      $private = $resident = 0L
      $cpuSeconds = 0.0
      $matched = 0
      foreach ($record in $groups[$name]) {
        $current[$record.key] = $record.cpu
        $private += $record.private
        $resident += $record.resident
        if ($prior -and $prior.processes.ContainsKey($record.key)) {
          $cpuSeconds += [Math]::Max(0, $record.cpu - $prior.processes[$record.key])
          $matched++
        }
      }
      $cpuPercent = if ($matched -gt 0) { [Math]::Round(100 * $cpuSeconds / ($elapsed - $prior.seconds), 2) }
      $previous[$name] = @{seconds=$elapsed; processes=$current}
      if ($groups[$name].Count) { $counts[$name] = 1 + $counts[$name] }
      Write-Record ([ordered]@{type='sample'; utc=[DateTime]::UtcNow.ToString('o'); pet=$name;
        processCount=$groups[$name].Count; cpuMatched=$matched; cpuOneCorePercent=$cpuPercent;
        privateMiB=[Math]::Round($private / 1MB, 2); workingSetMiB=[Math]::Round($resident / 1MB, 2)})
    }
    $remaining = $Minutes*60 - $clock.Elapsed.TotalSeconds
    if ($remaining -le 0) { break }
    Start-Sleep -Milliseconds ([int](1000 * [Math]::Min($IntervalSeconds, $remaining)))
  }
  Write-Record ([ordered]@{type='finished'; utc=[DateTime]::UtcNow.ToString('o'); samplesWithPet=$counts})
} finally {
  $writer.Dispose()
}
