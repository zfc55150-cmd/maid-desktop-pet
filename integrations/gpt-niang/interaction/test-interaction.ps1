param([Parameter(Mandatory=$true)][string]$Package,[Parameter(Mandatory=$true)][string]$Report)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName PresentationFramework,PresentationCore,WindowsBase,System.Windows.Forms,System.Drawing
$tokens=$null;$errors=$null
$source=[IO.File]::ReadAllText((Join-Path $Package 'files/widget.ps1'),[Text.Encoding]::UTF8)
$ast=[Management.Automation.Language.Parser]::ParseInput($source,[ref]$tokens,[ref]$errors)
if($errors.Count){throw ($errors|Out-String)}
$module=[IO.File]::ReadAllText((Join-Path $Package 'files/runtime/desktop-interaction.ps1'),[Text.Encoding]::UTF8)
$null=[Management.Automation.Language.Parser]::ParseInput($module,[ref]$tokens,[ref]$errors)
if($errors.Count){throw ($errors|Out-String)}
. ([ScriptBlock]::Create($module))
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class GptWidgetNative {
 public static int X,Y;
 [StructLayout(LayoutKind.Sequential)] public struct Point {public int X,Y;}
 [StructLayout(LayoutKind.Sequential)] public struct Rect {public int Left,Top,Right,Bottom;}
 public static bool GetCursorPos(out Point p){p=new Point{X=X,Y=Y};return true;}
 [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int w,int z,uint flags);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out Rect r);
 [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr h);
 public static Rect Frame(IntPtr h){Rect r;GetWindowRect(h,out r);return r;}
}
'@
$script:checks=0
function Check([bool]$Condition,[string]$Name){if(!$Condition){throw $Name};$script:checks++}
$frame=[pscustomobject]@{Left=0;Top=0;Right=1920;Bottom=1080}
$negative=[pscustomobject]@{Left=-1920;Top=-200;Right=0;Bottom=880}
foreach($dpi in @(1,1.5,2)){
 foreach($scale in @(0.6,1.4,2.5)){
  $box=@{X=120*$scale*$dpi;Y=140*$scale*$dpi;Width=208*$scale*$dpi;Height=208*$scale*$dpi}
  foreach($screen in @($frame,$negative)){
   foreach($request in @(@(-9999,-9999),@(9999,9999),@(-400,400),@(500,500))){
    $position=Resolve-WidgetFreePosition $request[0] $request[1] $box @($screen) $dpi
    $l=$position.X+$box.X;$t=$position.Y+$box.Y
    $visibleX=[Math]::Min($l+$box.Width,$screen.Right)-[Math]::Max($l,$screen.Left)
    $visibleY=[Math]::Min($t+$box.Height,$screen.Bottom)-[Math]::Max($t,$screen.Top)
    Check ($visibleX-ge [Math]::Min($box.Width,[Math]::Max(64*$dpi,$box.Width*0.35))-1) 'Lost horizontal grab area'
    Check ($visibleY-ge [Math]::Min($box.Height,[Math]::Max(64*$dpi,$box.Height*0.35))-1) 'Lost vertical grab area'
    $again=Resolve-WidgetFreePosition $position.X $position.Y $box @($screen) $dpi
    Check ($position.X-eq $again.X -and $position.Y-eq $again.Y) 'Periodic refresh changed a legal position'
   }
  }
 }
}
$box=@{X=0;Y=0;Width=200;Height=300}
foreach($x in @(-1800,-150,-50,0,50,1800)){
 $p=Resolve-WidgetFreePosition $x 200 $box @($negative,$frame)
 Check ($p.X-eq $x -and $p.Y-eq 200) 'Monitor seam blocked a drag'
}
$far=[pscustomobject]@{Left=3000;Top=0;Right=4920;Bottom=1080}
$p=Resolve-WidgetFreePosition 2450 400 $box @($frame,$far)
Check ($p.X-ne 2450) 'Monitor gap swallowed the character'
foreach($request in @(@(-100,100),@(1820,100),@(800,-150),@(800,930))){
 $p=Resolve-WidgetFreePosition $request[0] $request[1] $box @($frame)
 Check ($p.X-eq $request[0] -and $p.Y-eq $request[1]) 'Half-offscreen placement rejected'
}
foreach($screen in @($frame,$negative)){
 foreach($x in @($screen.Left,($screen.Right-1))){
  foreach($y in @($screen.Top,($screen.Bottom-1))){
   $p=Resolve-WidgetMenuPosition $screen 272 650 $x $y
   Check ($p.X-ge $screen.Left -and $p.X+272-le $screen.Right -and $p.Y-ge $screen.Top -and $p.Y+650-le $screen.Bottom) 'Menu escaped the screen'
  }
 }
}
# Execute the real drag handler against an isolated WPF window. Native input
# is replaced by fixed coordinates; no mouse/keyboard injection is used.
$script:window=[Windows.Markup.XamlReader]::Parse([IO.File]::ReadAllText('$env:LOCALAPPDATA\Programs\GPTNiangUsage\gpt-niang-usage\widget.xaml'))
$script:window.Title='GPT interaction isolated regression';$script:window.Width=529.2;$script:window.Height=529.2
$script:window.Left=500;$script:window.Top=300
$script:ui=@{};foreach($name in @('Root','Girl','FacingScale','TextFacingScale','MenuButton')){$script:ui[$name]=$script:window.FindName($name)}
$script:displayScale=1.4;$script:designWidth=378;$script:designHeight=378;$script:followHost=$false;$script:side='right'
$script:context=[Windows.Controls.ContextMenu]::new();$script:settingsMenuUi=@{};$script:settingsSubmenus=@()
$script:settingsSizePreview=$false
function Test-WidgetMusicActive {return $false}
function Set-WidgetPixelSize($Dpi) {return 529}
function Get-WidgetPlacementDpi {return [Math]::Max(1,[GptWidgetNative]::GetDpiForWindow($script:widgetHandle)/96.0)}
function Test-WidgetPlacementFrame($Frame,$Dpi) {return $true}
function Set-Facing {$script:flipCalls++;$script:ui.FacingScale.ScaleX=-$script:ui.FacingScale.ScaleX}
function Raise-WidgetForInteraction {}
function Update-WidgetSettingsMenu {}
function Reset-WidgetAutoQuoteSchedule {}
function Animate-Press($Value) {}
function Play-WidgetReleaseSound {}
function Save-Settings {$script:savedPosition=@{X=$script:desktopLeft;Y=$script:desktopTop}}
$script:hostEventTimer=[Windows.Threading.DispatcherTimer]::new()
$script:flipCalls=0
$move=$ast.Find({param($n)$n-is [Management.Automation.Language.AssignmentStatementAst] -and $n.Left.Extent.Text-eq '$pressMove'},$true)
$up=$ast.Find({param($n)$n-is [Management.Automation.Language.AssignmentStatementAst] -and $n.Left.Extent.Text-eq '$pressUp'},$true)
. ([ScriptBlock]::Create($move.Extent.Text));. ([ScriptBlock]::Create($up.Extent.Text))
try{
 $hidden=Get-WidgetRestingCharacterBounds 1
 Check ($hidden.Width-gt 0) 'Hidden first-frame layout failed'
 $script:widgetHandle=([Windows.Interop.WindowInteropHelper]::new($script:window)).EnsureHandle()
 $script:window.Show();$script:window.UpdateLayout()
 $rect=[GptWidgetNative]::Frame($script:widgetHandle)
 $script:drag=@{x=500;y=400;left=$rect.Left;top=$rect.Top;moved=$false;music=$false}
 $event=[pscustomobject]@{Handled=$false}
 foreach($cursorX in @(900,1100,950,1080,940,1120,900)){
  [GptWidgetNative]::X=$cursorX;[GptWidgetNative]::Y=500
  & $pressMove $script:ui.Girl $event
  $placed=[GptWidgetNative]::Frame($script:widgetHandle)
  Check ($placed.Left-eq [int]$script:desktopLeft) 'Native drag did not follow pointer'
  Check ($script:ui.FacingScale.ScaleX-eq 1 -and $script:flipCalls-eq 0) 'Midline drag mirrored the character'
 }
 & $pressUp $script:ui.Girl $event
 Check (!$script:drag -and $script:savedPosition.X-eq $script:desktopLeft) 'Release failed to save the final position'
 $bounds=Get-WidgetRestingCharacterBounds (Get-WidgetPlacementDpi)
 $script:ui.Root.RenderTransform.Children[0].ScaleX=0.9
 $pressed=Get-WidgetRestingCharacterBounds (Get-WidgetPlacementDpi)
 Check ($bounds.X-eq $pressed.X -and $bounds.Width-eq $pressed.Width) 'Press feedback changed drag limits'
 $script:ui.Root.RenderTransform.Children[0].ScaleX=1
 $screen=[Windows.Forms.Screen]::PrimaryScreen.WorkingArea
 foreach($point in @(@(($screen.Left+2),($screen.Top+2)),@(($screen.Right-2),($screen.Bottom-2)))){
  $script:interactionMenuPoint=[pscustomobject]@{X=$point[0];Y=$point[1]}
  $script:context.PlacementTarget=$script:window
  $script:context.Items.Clear();foreach($label in @('显示与位置','外观设置','查看额度','点播小动作','退出 GPT 娘')){$null=$script:context.Items.Add($label)}
  Set-WidgetMenuBounds;$script:context.IsOpen=$true;Position-WidgetMenuToHost
  $handle=[Windows.Interop.HwndSource]::FromVisual($script:context).Handle
  $menu=[GptWidgetNative]::Frame($handle)
  Check ($menu.Left-ge $screen.Left -and $menu.Right-le $screen.Right+1 -and $menu.Top-ge $screen.Top -and $menu.Bottom-le $screen.Bottom+1) 'Real popup left the work area'
  $script:context.IsOpen=$false
 }
}finally{$script:context.IsOpen=$false;$script:window.Close();$script:hostEventTimer.Stop()}
$result=@{ok=$true;checks=$script:checks;realWpf=$true;paidCalls=0;formalWindowChanged=$false}
[IO.File]::WriteAllText($Report,($result|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
$result|ConvertTo-Json
