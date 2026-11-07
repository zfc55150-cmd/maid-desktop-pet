param([Parameter(Mandatory=$true)][string]$Baseline,[string]$LabRoot=$PSScriptRoot)
$ErrorActionPreference='Stop'
if(!$LabRoot){$LabRoot=Join-Path (Get-Location) 'integrations/gpt-niang/playback-lab'}
Add-Type -TypeDefinition ([IO.File]::ReadAllText((Join-Path $LabRoot 'VisibilityLease.cs')))
$fakeRoot=Join-Path ([IO.Path]::GetTempPath()) ('playback-lease-'+[Guid]::NewGuid().ToString('N'))
$first=New-Object PlaybackLab.VisibilityLease($fakeRoot)
try{
 if(!$first.Owned){throw 'Synthetic first owner rejected'}
 $second=New-Object PlaybackLab.VisibilityLease($fakeRoot)
 try{if($second.Owned){throw 'Recursive duplicate owner accepted'}}finally{$second.Dispose()}
}finally{$first.Dispose()}
$third=New-Object PlaybackLab.VisibilityLease($fakeRoot)
try{if(!$third.Owned){throw 'Lease failed to release'}}finally{$third.Dispose()}
$r=@{ok=$true;syntheticOwnerAccepted=$true;duplicateOwnerRejected=$true;releaseReacquired=$true;windowOpened=$false;productionMutexUsed=$false}
[IO.File]::WriteAllText((Join-Path $Baseline 'lease-verification.json'),($r|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
[pscustomobject]$r|ConvertTo-Json
