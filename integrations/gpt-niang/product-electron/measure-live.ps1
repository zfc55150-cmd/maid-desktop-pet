param([Parameter(Mandatory=$true)][string]$Stage)
$ErrorActionPreference='Stop'
$data="$env:LOCALAPPDATA\GPTNiangUsage\state"
$supervisor=Get-Content -LiteralPath (Join-Path $data 'supervisor-status.json') -Raw -Encoding UTF8|ConvertFrom-Json
$rootProcess=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$supervisor.pid)
if(!$rootProcess -or $rootProcess.Name-ne 'powershell.exe' -or $rootProcess.CommandLine-notlike '*GPTNiangUsage\update-agent\update-agent.ps1*Supervisor*'){throw 'Supervisor identity mismatch'}
$samples=@();$last=$null
for($index=0;$index-lt 6;$index++){
 $all=@(Get-CimInstance Win32_Process|Select-Object ProcessId,ParentProcessId,Name)
 $ids=[Collections.Generic.HashSet[int]]::new();$null=$ids.Add([int]$supervisor.pid)
 do{$added=$false;foreach($p in $all){if($ids.Contains([int]$p.ParentProcessId) -and $ids.Add([int]$p.ProcessId)){$added=$true}}}while($added)
 $rows=@();foreach($id in $ids){$p=Get-Process -Id $id -ErrorAction SilentlyContinue;if($p){$rows+=@{pid=$id;name=$p.ProcessName;privateBytes=[long]$p.PrivateMemorySize64;workingSetBytes=[long]$p.WorkingSet64;cpuSeconds=[double]$p.CPU}}}
 $now=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();$cpu=($rows.cpuSeconds|Measure-Object -Sum).Sum;$key=(@($ids|Sort-Object)-join ',')
 $sample=@{at=$now;processes=$rows;privateCommitMiB=($rows.privateBytes|Measure-Object -Sum).Sum/1MB;workingSetMiB=($rows.workingSetBytes|Measure-Object -Sum).Sum/1MB;cpuOneCorePercent=$null}
 if($last -and $last.key-eq $key){$sample.cpuOneCorePercent=[Math]::Max(0,100*($cpu-$last.cpu)/(($now-$last.at)/1000))}
 $diag=Get-Content -LiteralPath '%LOCALAPPDATA%\Programs\GPTNiangUsage\gpt-niang-usage\versions\0.8.0-electron\diagnostics.json' -Raw -Encoding UTF8|ConvertFrom-Json
 $sample.errors=@($diag.errors);$sample.frames=$diag.frameUpdates;$sample.visible=$diag.visible;$samples+=$sample;$last=@{key=$key;cpu=$cpu;at=$now}
 if($index-lt 5){Start-Sleep -Seconds 10}
}
$report=@{scope='existing GPT supervisor and all descendant processes; pre-existing independent MCP clients excluded';samples=$samples;gpuUsageMeasured=$false;screenPresentationVerified=$false}
[IO.File]::WriteAllText((Join-Path $Stage 'live-resources.json'),($report|ConvertTo-Json -Depth 10),[Text.UTF8Encoding]::new($false))
@{samples=$samples.Count;privateCommitMiB=($samples.privateCommitMiB|Measure-Object -Minimum -Maximum);cpuOneCorePercent=($samples.cpuOneCorePercent|Measure-Object -Minimum -Maximum -Average);errors=@($samples|ForEach-Object{$_.errors}|Select-Object -Unique)}|ConvertTo-Json -Depth 4
