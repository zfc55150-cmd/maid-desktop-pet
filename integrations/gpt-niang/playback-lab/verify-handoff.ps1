param([string]$LabRoot=$PSScriptRoot)
$ErrorActionPreference='Stop'
if(!$LabRoot){$LabRoot=Join-Path (Get-Location) 'integrations/gpt-niang/playback-lab'}
. ([ScriptBlock]::Create([IO.File]::ReadAllText((Join-Path $LabRoot 'review-handoff.ps1'))))
$valid=[pscustomobject]@{pid=123;visible=$true;leaseOwned=$true;keySha256='expected';at=1000}
if(!(Test-ReviewDisplayTicket $valid 123 'expected' 999)){throw 'Valid handoff rejected'}
foreach($change in @(@{pid=124},@{visible=$false},@{leaseOwned=$false},@{keySha256='wrong'},@{at=998})){
 $copy=$valid|Select-Object *;foreach($name in $change.Keys){$copy.$name=$change[$name]}
 if(Test-ReviewDisplayTicket $copy 123 'expected' 999){throw 'Invalid handoff accepted'}
}
Write-Output '6 handoff checks passed'
