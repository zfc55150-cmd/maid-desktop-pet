$ErrorActionPreference='Stop'
$repo="$env:USERPROFILE\Documents\ChatGPT\女仆桌宠";$release=Join-Path $repo 'work\gpt-niang-animation\release-0.7.3-continuity-20261028-01'
$nav="$env:USERPROFILE\Documents\Codex_产出\DeepSeek桌宠\桌宠文件导航"
$export=[IO.File]::ReadAllText((Join-Path $release 'export-result.json'),[Text.Encoding]::UTF8)|ConvertFrom-Json
if(!$export.ok -or !(Test-Path -LiteralPath $export.out)){throw 'Verified delivery missing'}
$index=Join-Path $nav '导航清单.json';$data=[IO.File]::ReadAllText($index,[Text.Encoding]::UTF8)|ConvertFrom-Json
$old=@($data.items|Where-Object{$_.pet-eq 'GPT娘' -and $_.label-eq '本次静音修复'})
if($old.Count-ne 1 -or $data.items.Count-ne 12){throw 'Navigation baseline changed'}
$oldPath=[string]$old[0].path;$oldLink=Join-Path $nav 'GPT娘\本次静音修复.lnk';$newLink=Join-Path $nav 'GPT娘\当前优化与衔接设计.lnk'
$shell=New-Object -ComObject WScript.Shell
if($shell.CreateShortcut($oldLink).TargetPath-ine $oldPath -or (Test-Path -LiteralPath $newLink)){throw 'Unknown navigation shortcut'}
$backup=Join-Path $release 'navigation-before';if(Test-Path -LiteralPath $backup){throw 'Use a fresh navigation backup'};$null=New-Item -ItemType Directory -Path $backup
$names=@('文件地址说明.md','打开桌宠文件导航.html','导航清单.json')
foreach($name in $names){Copy-Item -LiteralPath (Join-Path $nav $name) -Destination (Join-Path $backup $name)}
Copy-Item -LiteralPath $oldLink -Destination (Join-Path $backup '本次静音修复.lnk')
$utf8=[Text.UTF8Encoding]::new($false)
try{
 $link=$shell.CreateShortcut($newLink);$link.TargetPath=$export.out;$link.Description='当前动作优化、增量包、验收和衔接素材设计';$link.Save()
 if($shell.CreateShortcut($newLink).TargetPath-ine $export.out){throw 'New shortcut target mismatch'}
 foreach($name in @('文件地址说明.md','打开桌宠文件导航.html')){
  $file=Join-Path $nav $name;$text=[IO.File]::ReadAllText($file,[Text.Encoding]::UTF8)
  $text=$text.Replace('0.7.2-form-audio','0.7.3-continuity').Replace('本次静音修复','当前优化与衔接设计').Replace('修复说明、增量包和验收','优化说明、增量包、验收与衔接设计').Replace($oldPath,[string]$export.out).Replace(([Uri]::new($oldPath)).AbsoluteUri,([Uri]::new([string]$export.out)).AbsoluteUri)
  [IO.File]::WriteAllText($file,$text,$utf8)
 }
 $old[0].label='当前优化与衔接设计';$old[0].role='优化说明、增量包、验收与衔接设计';$old[0].path=[string]$export.out
 $data|Add-Member NoteProperty updatedAt ([DateTimeOffset]::Now.ToString('o')) -Force
 [IO.File]::WriteAllText($index,($data|ConvertTo-Json -Depth 7),$utf8)
 # Only replace this generated, target-verified shortcut; no media target moves.
 Remove-Item -LiteralPath $oldLink
}catch{
 foreach($name in $names){Copy-Item -LiteralPath (Join-Path $backup $name) -Destination (Join-Path $nav $name)}
 Copy-Item -LiteralPath (Join-Path $backup '本次静音修复.lnk') -Destination $oldLink
 if(Test-Path -LiteralPath $newLink){Remove-Item -LiteralPath $newLink}
 throw
}
$result=@{ok=$true;version='0.7.3-continuity';navigation=$nav;shortcuts=12;sourceMediaMoved=0;personalDataCopied=0}
[IO.File]::WriteAllText((Join-Path $release 'navigation-sync.json'),($result|ConvertTo-Json),$utf8);$result|ConvertTo-Json -Compress
