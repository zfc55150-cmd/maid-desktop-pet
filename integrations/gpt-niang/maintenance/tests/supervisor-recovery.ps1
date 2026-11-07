param([string]$Module,[string]$Fixture)
$ErrorActionPreference='Stop';$tokens=$null;$errors=$null
$source=[IO.File]::ReadAllText($Module,[Text.Encoding]::UTF8)
$ast=[Management.Automation.Language.Parser]::ParseInput($source,[ref]$tokens,[ref]$errors);if($errors.Count){throw 'PARSE_FAILED'}
foreach($name in @('New-WidgetSupervisorRecovery','Register-WidgetSupervisorFailure','Get-WidgetSupervisorLaunchDecision','Stop-WidgetSupervisorPendingGui','Get-WidgetSupervisorHeartbeat','Test-WidgetSupervisorPause')){
 $node=$ast.Find({param($n)$n-is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name-eq $name},$true)
 . ([ScriptBlock]::Create($node.Extent.Text))
}
$checks=New-Object 'Collections.Generic.List[string]';function Check($ok,$name){if(!$ok){throw $name};$checks.Add($name)}
$s=New-WidgetSupervisorRecovery
Check ((Get-WidgetSupervisorLaunchDecision $s 0 $false $false $false $true)-eq 'launch') 'initial launch allowed'
$s.PendingAt=100
Check ((Get-WidgetSupervisorLaunchDecision $s 44999 $false $true $false $true)-eq 'wait') 'slow startup waits before deadline'
Check ((Get-WidgetSupervisorLaunchDecision $s 45100 $false $true $false $true)-eq 'expire') 'stalled startup gets bounded deadline'
Check ((Get-WidgetSupervisorLaunchDecision $s 999999 $false $true $false $false)-eq 'suppressed') 'hidden paused startup is never force recovered'
Register-WidgetSupervisorFailure $s 45100
Check ((Get-WidgetSupervisorLaunchDecision $s 50000 $false $false $false $true)-eq 'wait') 'first retry backs off'
Check ((Get-WidgetSupervisorLaunchDecision $s 55100 $false $false $false $true)-eq 'launch') 'first retry later allowed'
Register-WidgetSupervisorFailure $s 100000;Register-WidgetSupervisorFailure $s 200000
Check ((Get-WidgetSupervisorLaunchDecision $s 9999999 $false $false $false $true)-eq 'blocked') 'three startup failures stop infinite retries'
Check ((Get-WidgetSupervisorLaunchDecision $s 9999999 $true $true $false $true)-eq 'observe' -and $s.Failures-eq 0) 'live window only observed and resets prior failure budget'
Check (Test-WidgetSupervisorPause @{desktop=$true} @()) 'desktop hide intent honored'
Check (Test-WidgetSupervisorPause @{host=12;hostPid=3;hostStarted=4} @(@{handle=12;pid=3;started=4})) 'host hide identity honored'
Check (!(Test-WidgetSupervisorPause @{host=12;hostPid=3;hostStarted=4} @(@{handle=12;pid=3;started=5}))) 'reused host does not keep stale pause'
$fakeProcess=[pscustomobject]@{Id=999999;HasExited=$false;StartTime=[DateTime]::UtcNow;Killed=$false}
$fakeProcess|Add-Member ScriptMethod Kill {$this.Killed=$true};$fakeProcess|Add-Member ScriptMethod WaitForExit {param($ms)return $true}
function Get-CimInstance {param($ClassName,$Filter,$ErrorAction)return $script:fakeCim}
$app=Join-Path $Fixture 'app';$script:fakeCim=@{Name='powershell.exe';CommandLine='OTHER_PROCESS';CreationDate=$fakeProcess.StartTime}
Check (!(Stop-WidgetSupervisorPendingGui $fakeProcess $app) -and !$fakeProcess.Killed) 'unverified pending identity cannot be terminated'
$script:fakeCim.CommandLine='powershell.exe -File "'+(Join-Path $app 'runtime\start-widget.ps1')+'"'
$script:fakeCim.CreationDate=$fakeProcess.StartTime.AddSeconds(-1)
Check (!(Stop-WidgetSupervisorPendingGui $fakeProcess $app) -and !$fakeProcess.Killed) 'reused PID with other creation time cannot be terminated'
$script:fakeCim.CreationDate=$fakeProcess.StartTime.AddTicks(-1)
Check ((Stop-WidgetSupervisorPendingGui $fakeProcess $app) -and $fakeProcess.Killed) 'verified own startup can be stopped after deadline'
$null=[IO.Directory]::CreateDirectory($Fixture)
[IO.File]::WriteAllText((Join-Path $Fixture 'runtime.json'),'{"pid":123}')
[IO.File]::WriteAllText((Join-Path $Fixture 'presence.json'),'{"pid":123,"at":100000}')
Check ((Get-WidgetSupervisorHeartbeat $Fixture 100001)-eq 'healthy') 'fresh heartbeat classified'
Check ((Get-WidgetSupervisorHeartbeat $Fixture 200000)-eq 'heartbeat-stale') 'stale heartbeat reports health only'
Check ((Get-WidgetSupervisorHeartbeat $Fixture 90000)-eq 'heartbeat-clock-change') 'clock correction never turns into process kill'
@{ok=$true;count=$checks.Count;checks=@($checks)}|ConvertTo-Json -Compress -Depth 4
