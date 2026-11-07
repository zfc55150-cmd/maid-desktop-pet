param([switch]$Apply,[string]$ReportRoot=(Join-Path $PSScriptRoot '../work/deepseek-autostart-20261101-01'))
$ErrorActionPreference='Stop'
$root="$env:LOCALAPPDATA\Programs\DeepSeekActionPet"
$launcher=Join-Path $root 'launcher.mjs';$start=Join-Path $root 'start.vbs'
if((Get-FileHash -LiteralPath $launcher -Algorithm SHA256).Hash.ToLowerInvariant()-ne '7ccc780b301c34b55da03c7308517161a75131ab6cfeb8bd16102429af5fa5ed'){throw 'DEEPSEEK_LAUNCHER_CHANGED'}
if(![IO.File]::Exists((Join-Path $root 'node.exe')) -or ![IO.File]::Exists($start)){throw 'DEEPSEEK_START_MISSING'}
$vbs=[IO.File]::ReadAllText($start)
if($vbs-notmatch 'launcher\.mjs' -or $vbs-notmatch 'shell.Run command, 0, False'){throw 'DEEPSEEK_START_UNEXPECTED'}
$startup=[Environment]::GetFolderPath('Startup');if(!$startup){throw 'STARTUP_FOLDER_UNAVAILABLE'}
$path=Join-Path $startup 'DeepSeekActionPet.lnk';$target=Join-Path $env:WINDIR 'System32\wscript.exe';$arguments='"'+$start+'"'
$shell=New-Object -ComObject WScript.Shell
$hadLink=[IO.File]::Exists($path)
if($hadLink){
 $existing=$shell.CreateShortcut($path)
 if($existing.TargetPath-ine $target -or $existing.Arguments-cne $arguments -or $existing.WorkingDirectory-ine $root){throw 'EXISTING_STARTUP_LINK_DIFFERS'}
}
$approved='HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\StartupFolder'
$approval=Get-ItemProperty -LiteralPath $approved -ErrorAction SilentlyContinue
$approvedBefore=if($approval -and $approval.PSObject.Properties['DeepSeekActionPet.lnk']){$approval.'DeepSeekActionPet.lnk'}else{$null}
$disabled=$approvedBefore -and $approvedBefore[0]-in @(3,7)
$result=@{ok=$true;mode='preflight';startupLink=$path;target=$target;arguments=$arguments;workingDirectory=$root;alreadyPresent=$hadLink;wasDisabled=[bool]$disabled;currentUserOnly=$true;petRestarted=$false}
if($Apply){
 $ReportRoot=[IO.Path]::GetFullPath($ReportRoot)
 if([IO.File]::Exists((Join-Path $ReportRoot 'receipt.json'))){throw 'AUTOSTART_RECEIPT_EXISTS'}
 $null=[IO.Directory]::CreateDirectory($ReportRoot)
 if($hadLink){[IO.File]::Copy($path,(Join-Path $ReportRoot 'before.lnk'),$false)}
 $link=$shell.CreateShortcut($path);$link.TargetPath=$target;$link.Arguments=$arguments;$link.WorkingDirectory=$root;$link.WindowStyle=7;$link.Description='Start DeepSeek desktop pet at Windows sign-in';$link.Save()
 $actual=$shell.CreateShortcut($path)
 if($actual.TargetPath-ine $target -or $actual.Arguments-cne $arguments -or $actual.WorkingDirectory-ine $root){throw 'AUTOSTART_READBACK_FAILED'}
 if($disabled){Remove-ItemProperty -LiteralPath $approved -Name 'DeepSeekActionPet.lnk'}
 $result.mode='installed';$result['previousApprovalBytes']=$(if($approvedBefore){[Convert]::ToBase64String($approvedBefore)}else{$null})
 $result['shortcutSha256']=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
 [IO.File]::WriteAllText((Join-Path $ReportRoot 'receipt.json'),($result|ConvertTo-Json -Depth 4),[Text.UTF8Encoding]::new($false))
}
$result|ConvertTo-Json -Depth 4
