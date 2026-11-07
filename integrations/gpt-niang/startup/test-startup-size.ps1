param([Parameter(Mandatory=$true)][string]$WidgetPath,[Parameter(Mandatory=$true)][string]$Report,[switch]$ExpectMismatch)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName PresentationFramework,PresentationCore,WindowsBase
Add-Type -TypeDefinition @'
using System;using System.Runtime.InteropServices;
public static class GptWidgetNative {
 [StructLayout(LayoutKind.Sequential)] public struct Rect {public int Left,Top,Right,Bottom;}
 [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out Rect r);
 [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr c);
}
'@
$null=[GptWidgetNative]::SetThreadDpiAwarenessContext([IntPtr](-4))
$tokens=$null;$errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile([IO.Path]::GetFullPath($WidgetPath),[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'WIDGET_SYNTAX_ERROR'}
$function=$ast.Find({param($n)$n-is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name-eq 'Set-WidgetPixelSize'},$true)
if(!$function){throw 'SIZE_FUNCTION_MISSING'}
. ([ScriptBlock]::Create($function.Extent.Text))
$script:designWidth=378;$script:designHeight=378
$rows=New-Object 'System.Collections.Generic.List[object]';$mismatches=0
foreach($scale in @(0.6,1.0,1.4,2.5)){
 foreach($dpi in @(1.0,1.25,1.5,2.0)){
  $script:window=[Windows.Window]::new();$script:window.Width=378;$script:window.Height=378
  $script:window.WindowStyle='None';$script:window.AllowsTransparency=$true;$script:window.Background=[Windows.Media.Brushes]::Transparent
  $script:window.ShowActivated=$false;$script:window.ShowInTaskbar=$false;$script:window.Left=-20000;$script:window.Top=-20000
  $script:displayScale=$scale
  $script:widgetHandle=([Windows.Interop.WindowInteropHelper]::new($script:window)).EnsureHandle()
  $nativeDpi=[GptWidgetNative]::GetDpiForWindow($script:widgetHandle)/96.0
  $null=Set-WidgetPixelSize $dpi;$hidden=$script:window.Width
  $script:window.Show();$script:window.UpdateLayout()
  $r=[GptWidgetNative+Rect]::new();$null=[GptWidgetNative]::GetWindowRect($script:widgetHandle,[ref]$r)
  $first=$r.Right-$r.Left;$expected=[Math]::Round(378*$scale*$dpi)
  $null=Set-WidgetPixelSize $dpi
  $r2=[GptWidgetNative+Rect]::new();$null=[GptWidgetNative]::GetWindowRect($script:widgetHandle,[ref]$r2)
  $settled=$r2.Right-$r2.Left
  $bad=[Math]::Abs($first-$expected)-gt 1 -or [Math]::Abs($settled-$expected)-gt 1
  if($bad){$mismatches++}
  $rows.Add(@{scale=$scale;targetDpi=$dpi;nativeDpi=$nativeDpi;hiddenDip=$hidden;firstPixels=$first;settledPixels=$settled;expectedPixels=$expected;mismatch=$bad})
  $script:window.Close()
 }
}
if($ExpectMismatch){if(!$mismatches){throw 'BASELINE_DID_NOT_REPRODUCE'}}elseif($mismatches){throw ('FIRST_FRAME_SIZE_MISMATCHES '+$mismatches)}
$result=@{ok=$true;negativeControl=[bool]$ExpectMismatch;scenarios=$rows.Count;mismatches=$mismatches;rows=$rows.ToArray();settingsWritten=$false;formalPetStarted=$false}
[IO.File]::WriteAllText([IO.Path]::GetFullPath($Report),($result|ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
@{ok=$true;scenarios=$rows.Count;mismatches=$mismatches;negativeControl=[bool]$ExpectMismatch}|ConvertTo-Json
