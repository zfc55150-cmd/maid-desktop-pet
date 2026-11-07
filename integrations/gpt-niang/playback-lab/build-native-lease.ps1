param([Parameter(Mandatory=$true)][string]$Baseline,[string]$LabRoot=$PSScriptRoot)
$ErrorActionPreference='Stop'
if(!$LabRoot){$LabRoot=Join-Path (Get-Location) 'integrations/gpt-niang/playback-lab'}
$Baseline=[IO.Path]::GetFullPath($Baseline)
$tools=Get-ChildItem 'C:/Program Files/Microsoft Visual Studio/2022/Community/VC/Tools/MSVC' -Directory|Sort-Object Name -Descending|Select-Object -First 1
$sdk='C:/Program Files (x86)/Windows Kits/10';$version='10.0.26100.0'
$cl=Join-Path $tools.FullName 'bin/Hostx64/x64/cl.exe'
$output=Join-Path $Baseline 'native';if(Test-Path $output){throw 'Fresh native build required'}
[IO.Directory]::CreateDirectory($output)|Out-Null
$p=New-Object Diagnostics.ProcessStartInfo;$p.FileName=$cl;$p.UseShellExecute=$false;$p.CreateNoWindow=$true
$p.RedirectStandardOutput=$true;$p.RedirectStandardError=$true
$p.EnvironmentVariables['INCLUDE']=($tools.FullName+'/include;'+$sdk+'/Include/'+$version+'/ucrt;'+$sdk+'/Include/'+$version+'/shared;'+$sdk+'/Include/'+$version+'/um')
$p.EnvironmentVariables['LIB']=($tools.FullName+'/lib/x64;'+$sdk+'/Lib/'+$version+'/ucrt/x64;'+$sdk+'/Lib/'+$version+'/um/x64')
$p.Arguments='/nologo /LD /MT /O2 /EHsc /std:c++17 /W4 "'+(Join-Path ([IO.Path]::GetFullPath($LabRoot)) 'native-lease.cpp')+'" /Fo"'+(Join-Path $output 'native-lease.obj')+'" /Fe"'+(Join-Path $output 'native-lease.node')+'" /link kernel32.lib user32.lib'
$process=[Diagnostics.Process]::Start($p);$stdout=$process.StandardOutput.ReadToEndAsync();$stderr=$process.StandardError.ReadToEndAsync()
if(!$process.WaitForExit(60000)){throw 'Compiler timeout'}
$log=$stdout.GetAwaiter().GetResult()+$stderr.GetAwaiter().GetResult();[IO.File]::WriteAllText((Join-Path $output 'build.log'),$log)
if($process.ExitCode-ne 0){throw $log}
$r=@{ok=$true;compiler=$cl;sourceSha256=(Get-FileHash (Join-Path $LabRoot 'native-lease.cpp')).Hash.ToLowerInvariant();binarySha256=(Get-FileHash (Join-Path $output 'native-lease.node')).Hash.ToLowerInvariant();paidCalls=0;installedChanged=$false}
[IO.File]::WriteAllText((Join-Path $output 'build.json'),($r|ConvertTo-Json),[Text.UTF8Encoding]::new($false));[pscustomobject]$r|ConvertTo-Json
