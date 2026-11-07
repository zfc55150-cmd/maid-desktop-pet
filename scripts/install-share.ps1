param([string]$Destination=(Join-Path $env:LOCALAPPDATA 'Programs\DeepSeekActionPet'),[switch]$VerifyOnly)
$ErrorActionPreference='Stop'
$source=Join-Path $PSScriptRoot 'program'
$manifest=Get-Content -LiteralPath (Join-Path $source 'recovery-manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
function Test-Payload([string]$Root) {
 $rootFull=[IO.Path]::GetFullPath($Root).TrimEnd('\')
 foreach($item in $manifest.files){
  $target=[IO.Path]::GetFullPath((Join-Path $rootFull $item.path))
  if(!$target.StartsWith($rootFull+'\',[StringComparison]::OrdinalIgnoreCase) -or $item.path.Contains(':')){throw 'Unsafe manifest path'}
  $hash=New-Object Security.Cryptography.SHA256CryptoServiceProvider
  $stream=[IO.File]::OpenRead($target)
  try{$actual=[BitConverter]::ToString($hash.ComputeHash($stream)).Replace('-','').ToLowerInvariant()}
  finally{$stream.Dispose();$hash.Dispose()}
  if($actual -ne $item.sha256){throw ('File verification failed: '+$item.path)}
 }
}
Test-Payload $source
if($VerifyOnly){'Share payload verified. No installation or personal data changed.';return}
$destFull=[IO.Path]::GetFullPath($Destination).TrimEnd('\')
if((Split-Path $destFull -Leaf) -ne 'DeepSeekActionPet'){throw 'Destination must be a dedicated DeepSeekActionPet directory'}
if(Test-Path -LiteralPath $destFull){throw 'An installation already exists. Nothing was overwritten.'}
New-Item -ItemType Directory -Path $destFull | Out-Null
Get-ChildItem -LiteralPath $source -Force | Copy-Item -Destination $destFull -Recurse
Test-Payload $destFull
$base=Join-Path $destFull 'voice-runtime\python-base'
$venv=Join-Path $destFull 'voice-runtime\venv'
$config="home = $base`r`ninclude-system-site-packages = false`r`nversion = 3.12.14`r`nexecutable = $base\python.exe`r`ncommand = $base\python.exe -m venv $venv`r`n"
[IO.File]::WriteAllText((Join-Path $venv 'pyvenv.cfg'),$config,[Text.UTF8Encoding]::new($false))
$data=Join-Path $env:LOCALAPPDATA 'DeepSeekActionPet'
$chatDir=Join-Path $data 'simple-chat'
$petDir=Join-Path $data 'dsh-pet'
New-Item -ItemType Directory -Path $chatDir,$petDir -Force | Out-Null
if(!(Test-Path -LiteralPath (Join-Path $chatDir 'chat.json'))){
 $initial=@{prompt='你是用户桌面上的蓝鲸女仆小伙伴。请用自然、温柔、简洁的中文交流。';messages=@();voiceEnabled=$false;memory='';autoMemoryEnabled=$true} | ConvertTo-Json -Depth 5
 [IO.File]::WriteAllText((Join-Path $chatDir 'chat.json'),$initial,[Text.UTF8Encoding]::new($false))
}
if(!(Test-Path -LiteralPath (Join-Path $petDir 'main-config.jsonc'))){
 $appearance=@{notificationsEnabled=$false;confineToScreen=$true;pets=@(@{id='main';name='DeepSeek 蓝鲸女仆';size=480;balanceEnabled=$false;whisperEnabled=$false;workStatusEnabled=$false;fixedEnabled=$false;display='desktop';position=@{corner='bottom-right';marginX=100;marginY=80}})} | ConvertTo-Json -Depth 6
 [IO.File]::WriteAllText((Join-Path $petDir 'main-config.jsonc'),$appearance,[Text.UTF8Encoding]::new($false))
}
$shell=New-Object -ComObject WScript.Shell
foreach($folder in @([Environment]::GetFolderPath('Programs'),[Environment]::GetFolderPath('Desktop'))){
 $shortcut=$shell.CreateShortcut((Join-Path $folder 'DeepSeek 蓝鲸女仆.lnk'))
 $shortcut.TargetPath=Join-Path $destFull 'start.vbs';$shortcut.WorkingDirectory=$destFull;$shortcut.Save()
}
'Installed and verified. Open the desktop shortcut, then enter your own DeepSeek API key in settings. Voice starts disabled.'
