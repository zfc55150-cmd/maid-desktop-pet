param([string]$Workspace=(Get-Location).Path)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
Add-Type @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class GptInteractionProbe {
 public delegate bool EnumProc(IntPtr h,IntPtr p);
 [StructLayout(LayoutKind.Sequential)] public struct Rect {public int Left,Top,Right,Bottom;}
 [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb,IntPtr p);
 [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out Rect r);
 public static long[] Windows(int pid){var found=new List<long>();EnumWindows((h,p)=>{uint id;GetWindowThreadProcessId(h,out id);if(id==pid&&IsWindowVisible(h))found.Add(h.ToInt64());return true;},IntPtr.Zero);return found.ToArray();}
}
'@
$manifest=Get-Content (Join-Path $Workspace 'integrations/gpt-niang/interaction/deployment.json') -Raw|ConvertFrom-Json
$animated=Get-Content (Join-Path $Workspace 'integrations/gpt-niang/animated/deployment.json') -Raw|ConvertFrom-Json
$presencePath=Join-Path $manifest.dataDir 'presence.json'
$presence=Get-Content $presencePath -Raw|ConvertFrom-Json
$process=Get-Process -Id $presence.pid
if(!$process.Responding -or !$presence.visible){throw 'Widget is not responding or visible'}
foreach($file in $animated.files){if((Get-FileHash (Join-Path $manifest.targetRoot $file.target)).Hash.ToLowerInvariant()-ne $file.sha256){throw ('Installed mismatch: '+$file.target)}}
$before=@([GptInteractionProbe]::Windows($presence.pid))
$requestFile=Join-Path $manifest.dataDir 'display-request.json'
function Send-MenuRequest([string]$Mode){
 $request=@{mode=$Mode;nonce=[Guid]::NewGuid().ToString('N');at=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()}
 [IO.File]::WriteAllText($requestFile,($request|ConvertTo-Json -Compress),[Text.UTF8Encoding]::new($false))
}
try{
 Send-MenuRequest 'menu'
 $deadline=[DateTime]::UtcNow.AddSeconds(6)
 do{
  Start-Sleep -Milliseconds 200
  $popup=@([GptInteractionProbe]::Windows($presence.pid)|Where-Object{$_-notin $before})
 }while($popup.Count-eq 0 -and [DateTime]::UtcNow-lt $deadline)
 if($popup.Count-eq 0){throw 'Live context menu did not open'}
 Start-Sleep -Milliseconds 250
 $rect=New-Object GptInteractionProbe+Rect
 $null=[GptInteractionProbe]::GetWindowRect([IntPtr]$popup[0],[ref]$rect)
 $center=[Drawing.Point]::new([int](($rect.Left+$rect.Right)/2),[int](($rect.Top+$rect.Bottom)/2))
 $work=[Windows.Forms.Screen]::FromPoint($center).WorkingArea
 if($rect.Left-lt $work.Left -or $rect.Top-lt $work.Top -or $rect.Right-gt $work.Right -or $rect.Bottom-gt $work.Bottom){throw 'Live menu escaped work area'}
 if($manifest.version-eq 'interaction-1.1-menu' -and ($rect.Bottom-$rect.Top)-gt 350){throw 'Live compact menu is unexpectedly tall'}
 $settings=Get-Content (Join-Path $manifest.dataDir 'settings.json') -Raw|ConvertFrom-Json
 $report=@{ok=$true;checkedAt=[DateTimeOffset]::Now.ToString('o');pid=$process.Id;visible=$presence.visible;responding=$process.Responding;installedFiles=$animated.files.Count;animationError=$presence.dragonMotion.error;menuOpened=$true;menuInWorkArea=$true;menu=@{left=$rect.Left;top=$rect.Top;width=$rect.Right-$rect.Left;height=$rect.Bottom-$rect.Top};settings=@{followHost=$settings.followHost;topmost=$settings.desktopTopmost;scale=$settings.scale;bubbleScale=$settings.bubbleScale};realMouseDragTested=$false;isolatedAssertions=254;deploymentAndStartupTests=2;paidCalls=0}
 if($manifest.version-eq 'interaction-1.1-menu'){
  $report.menuAssertions=150;$report.homeEntries=7
  $before=Get-Content (Join-Path $Workspace 'work/gpt-niang-interaction/menu-settings-before.json') -Raw|ConvertFrom-Json
  $report.settingsFileUnchanged=$before.sha256-eq (Get-FileHash (Join-Path $manifest.dataDir 'settings.json')).Hash
 }
 $output=Join-Path $Workspace 'work/gpt-niang-interaction/post-install.json'
 [IO.File]::WriteAllText($output,($report|ConvertTo-Json -Depth 6),[Text.UTF8Encoding]::new($false))
 $report|ConvertTo-Json -Depth 6
}finally{Send-MenuRequest 'close-menu'}
