param([string]$Archive=(Join-Path $PSScriptRoot '蓝鲸女仆-1.1.0-完整离线恢复.zip'),[string]$Destination=(Join-Path $env:LOCALAPPDATA 'Programs\DeepSeekActionPet'),[switch]$VerifyOnly)
$ErrorActionPreference='Stop'
$archiveFull=[IO.Path]::GetFullPath($Archive)
$destFull=[IO.Path]::GetFullPath($Destination).TrimEnd('\')
if((Split-Path $destFull -Leaf) -ne 'DeepSeekActionPet'){throw 'Destination must be a dedicated DeepSeekActionPet directory'}
if(Test-Path -LiteralPath $destFull){throw 'Destination already exists. This restore never overwrites an existing installation.'}
$parent=Split-Path $destFull -Parent
if(!(Test-Path -LiteralPath $parent)){New-Item -ItemType Directory -Path $parent -Force | Out-Null}
$check=Get-Content -LiteralPath (Join-Path (Split-Path $archiveFull -Parent) '恢复包校验.json') -Raw | ConvertFrom-Json
if((Get-FileHash -LiteralPath $archiveFull -Algorithm SHA256).Hash -ne $check.sha256){throw 'Archive SHA-256 mismatch'}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip=[IO.Compression.ZipFile]::OpenRead($archiveFull)
try {
 foreach($entry in $zip.Entries){
  $target=[IO.Path]::GetFullPath((Join-Path $destFull $entry.FullName))
  if(!$target.StartsWith($destFull+'\',[StringComparison]::OrdinalIgnoreCase) -or $entry.FullName.Contains(':')){throw 'Unsafe archive path'}
 }
} finally {$zip.Dispose()}
[IO.Compression.ZipFile]::ExtractToDirectory($archiveFull,$destFull)
$manifest=Get-Content -LiteralPath (Join-Path $destFull 'recovery-manifest.json') -Raw | ConvertFrom-Json
foreach($item in $manifest.files){
 $target=[IO.Path]::GetFullPath((Join-Path $destFull $item.path))
 if(!$target.StartsWith($destFull+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Unsafe manifest path'}
 if((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -ne $item.sha256){throw ('Restored file mismatch: '+$item.path)}
}
# Python's working environment needs its base path adjusted when moved to another user.
$base=Join-Path $destFull 'voice-runtime\python-base'
$cfg=Join-Path $destFull 'voice-runtime\venv\pyvenv.cfg'
$config=Get-Content -LiteralPath $cfg -Raw
$config=[regex]::Replace($config,'(?m)^home = .*$',('home = '+$base))
$config=[regex]::Replace($config,'(?m)^executable = .*$',('executable = '+(Join-Path $base 'python.exe')))
$config=[regex]::Replace($config,'(?m)^command = .*$',('command = '+(Join-Path $base 'python.exe')+' -m venv '+(Join-Path $destFull 'voice-runtime\venv')))
[IO.File]::WriteAllText($cfg,$config,[Text.UTF8Encoding]::new($false))
$python=Join-Path $destFull 'voice-runtime\venv\Scripts\python.exe'
& $python -B -c 'import torch, qwen_tts, soundfile; print("Voice dependencies available; CUDA available:", torch.cuda.is_available())'
if($LASTEXITCODE -ne 0){throw 'Restored voice environment failed validation. Files preserved for inspection.'}
if($VerifyOnly){'Offline extraction, file hashes and relocated Python imports verified. No user data or shortcuts changed.';return}
$data=Join-Path $env:LOCALAPPDATA 'DeepSeekActionPet'
$chatDir=Join-Path $data 'simple-chat';$petDir=Join-Path $data 'dsh-pet'
New-Item -ItemType Directory -Path $chatDir,$petDir -Force | Out-Null
if(!(Test-Path -LiteralPath (Join-Path $chatDir 'chat.json'))){
 $initial=@{prompt='你是用户桌面上的蓝鲸女仆小伙伴。请用自然、温柔、简洁的中文交流。';messages=@();voiceEnabled=$false;memory=''} | ConvertTo-Json -Depth 5
 [IO.File]::WriteAllText((Join-Path $chatDir 'chat.json'),$initial,[Text.UTF8Encoding]::new($false))
}
if(!(Test-Path -LiteralPath (Join-Path $petDir 'main-config.jsonc'))){
 $appearance=@{notificationsEnabled=$false;confineToScreen=$true;pets=@(@{id='main';name='DeepSeek 蓝鲸女仆';size=480;balanceEnabled=$false;whisperEnabled=$false;workStatusEnabled=$false;fixedEnabled=$false;display='desktop';position=@{corner='bottom-right';marginX=100;marginY=80}})} | ConvertTo-Json -Depth 6
 [IO.File]::WriteAllText((Join-Path $petDir 'main-config.jsonc'),$appearance,[Text.UTF8Encoding]::new($false))
}
$shell=New-Object -ComObject WScript.Shell
$menu=[Environment]::GetFolderPath('Programs')
foreach($item in @(@('DeepSeek 蓝鲸女仆','start.vbs'),@('关闭 DeepSeek 桌宠','stop.vbs'))){$shortcut=$shell.CreateShortcut((Join-Path $menu ($item[0]+'.lnk')));$shortcut.TargetPath=Join-Path $destFull $item[1];$shortcut.WorkingDirectory=$destFull;$shortcut.Save()}
'Restore verified. Launch start.vbs, open settings and enter your own API key. Existing personal data was preserved.'
