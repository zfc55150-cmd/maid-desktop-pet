$ErrorActionPreference='Stop'
[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
$base='https://github.com/zfc55150-cmd/DeepSeekActionPet-Share/releases/download/v1.2.1/'
function Get-Sha([string]$Path){
 $hash=New-Object Security.Cryptography.SHA256CryptoServiceProvider
 $file=[IO.File]::OpenRead($Path);$stream=New-Object IO.BufferedStream($file,1048576)
 try{return [BitConverter]::ToString($hash.ComputeHash($stream)).Replace('-','').ToLowerInvariant()}
 finally{$stream.Dispose();$hash.Dispose()}
}
function Get-Asset([string]$Name,[string]$Expected=''){
 if($Name -notmatch '^[A-Za-z0-9.\-]+$'){throw 'Invalid attachment name'}
 $target=Join-Path $PSScriptRoot $Name
 if(Test-Path -LiteralPath $target){
  if($Expected -and (Get-Sha $target) -eq $Expected){Write-Host ('Verified: '+$Name);return}
  if(!$Expected){return}
  throw ('Existing file differs: '+$Name+'. Move it aside before retrying.')
 }
 $temporary=$target+'.download'
 for($attempt=1;$attempt -le 3;$attempt++){
  $client=New-Object Net.WebClient
  try{
   Write-Host ('Downloading '+$Name+' (attempt '+$attempt+')')
   $client.DownloadFile($base+$Name,$temporary)
   if($Expected -and (Get-Sha $temporary) -ne $Expected){throw 'Download hash mismatch'}
   [IO.File]::Move($temporary,$target);return
  }catch{
   if($attempt -eq 3){throw}
   Start-Sleep -Seconds 2
  }finally{$client.Dispose()}
 }
}
Get-Asset 'parts-manifest.json'
$manifest=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'parts-manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
foreach($part in $manifest.parts){
 if($part.name -notmatch '^DeepSeekPet-1\.2\.1\.zip\.part[0-9]{2}$' -or $part.sha256 -notmatch '^[a-f0-9]{64}$'){throw 'Invalid manifest'}
 Get-Asset $part.name $part.sha256
}
Get-Asset 'merge-share.ps1'
& (Join-Path $PSScriptRoot 'merge-share.ps1')
