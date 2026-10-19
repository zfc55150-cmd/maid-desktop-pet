$ErrorActionPreference='Stop'
$repoRoot=Split-Path $PSScriptRoot -Parent
$workRoot=Join-Path $repoRoot 'work\host-smoke'
$stageRoot=Join-Path $workRoot 'app'
$installedRoot=Join-Path $env:LOCALAPPDATA 'Programs\DeepSeekActionPet'
$dataRoot=Join-Path $workRoot 'data'
$port=33888
$endpoint="http://127.0.0.1:$port"
$result=[ordered]@{}
function Start-TestHost {
    $info=[Diagnostics.ProcessStartInfo]::new()
    $info.FileName=Join-Path $installedRoot 'node.exe'
    $info.Arguments='"'+(Join-Path $stageRoot 'node_modules\dsh-pet\lib\standalone.js')+'" --port '+$port
    $info.WorkingDirectory=$stageRoot
    $info.UseShellExecute=$false
    $info.CreateNoWindow=$true
    $info.WindowStyle='Hidden'
    $info.RedirectStandardOutput=$true
    $info.RedirectStandardError=$true
    $info.Environment['DSH_HOME']=$dataRoot
    $info.Environment['DSH_PET_ELECTRON_PATH']=Join-Path $installedRoot 'electron\electron.exe'
    $info.Environment['DSH_PET_SMOKE']='1'
    $info.Environment['DSH_PET_SMOKE_AFTER_MS']='2500'
    $info.Environment['DSH_PET_SMOKE_OUT']=Join-Path $workRoot 'pet.png'
    $info.Environment.Remove('ELECTRON_RUN_AS_NODE') | Out-Null
    $p=[Diagnostics.Process]::Start($info)
    return @{Process=$p;Output=$p.StandardOutput.ReadToEndAsync();Error=$p.StandardError.ReadToEndAsync()}
}
$first=Start-TestHost
$second=Start-TestHost
try {
    $health=$null
    for($i=0;$i -lt 100;$i++){
        try{$health=Invoke-RestMethod -Uri "$endpoint/health" -NoProxy -TimeoutSec 1;break}catch{Start-Sleep -Milliseconds 100}
    }
    if(!$health -or $health.plugin.root -ne (Join-Path $stageRoot 'node_modules\dsh-pet')){throw 'Test host unavailable or wrong instance'}
    $result.healthy=$true
    $get=Invoke-WebRequest -Uri "$endpoint/shutdown" -NoProxy -SkipHttpErrorCheck
    $post=Invoke-WebRequest -Uri "$endpoint/shutdown" -Method Post -NoProxy -SkipHttpErrorCheck
    $origin=Invoke-WebRequest -Uri "$endpoint/health" -Headers @{Origin='https://untrusted.invalid'} -NoProxy -SkipHttpErrorCheck
    if($get.StatusCode -ne 405 -or $post.StatusCode -ne 403 -or $origin.StatusCode -ne 403){throw 'Authorization boundary failed'}
    $result.unauthenticatedShutdownBlocked=$true
    $result.crossOriginBlocked=$true
    Start-Sleep -Milliseconds 500
    $alive=@($first.Process,$second.Process | Where-Object {-not $_.HasExited})
    if($alive.Count -ne 1){throw 'Duplicate test hosts survived'}
    $result.concurrentStartLeavesOneHost=$true
    for($i=0;$i -lt 180;$i++){
        if(Test-Path -LiteralPath (Join-Path $workRoot 'pet.png')){break}
        Start-Sleep -Milliseconds 100
    }
    if(!(Test-Path -LiteralPath (Join-Path $workRoot 'pet.png'))){throw 'Renderer smoke screenshot missing'}
    $result.rendererCaptured=$true
} finally {
    if(Test-Path -LiteralPath (Join-Path $dataRoot 'control-session.json')){
        $session=Get-Content -LiteralPath (Join-Path $dataRoot 'control-session.json') -Raw | ConvertFrom-Json
        try{Invoke-RestMethod -Uri "$endpoint/shutdown" -Method Post -NoProxy -Headers @{'x-pet-control'=$session.token} -TimeoutSec 5 | Out-Null}catch{}
    }
    foreach($entry in @($first,$second)){
        if(!$entry.Process.WaitForExit(5000)){throw 'Isolated test process did not stop'}
    }
    [IO.File]::WriteAllText((Join-Path $workRoot 'stdout.log'),$first.Output.Result+$second.Output.Result)
    [IO.File]::WriteAllText((Join-Path $workRoot 'stderr.log'),$first.Error.Result+$second.Error.Result)
}
$result.shutdownCompleted=$true
$result | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $workRoot 'result.json') -Encoding utf8
$result | ConvertTo-Json -Compress
