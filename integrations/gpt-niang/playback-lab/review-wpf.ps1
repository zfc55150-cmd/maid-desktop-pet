param([Parameter(Mandatory=$true)][string]$Baseline,[switch]$ProbeOnly,[ValidateSet('A','B')][string]$Mode='B',[int]$TargetHeight=300,[string]$LabRoot=$PSScriptRoot)
$ErrorActionPreference='Stop'
if(!$LabRoot){$LabRoot=Join-Path (Get-Location) 'integrations/gpt-niang/playback-lab'}
. ([ScriptBlock]::Create([IO.File]::ReadAllText((Join-Path $LabRoot 'lab-common.ps1')))) -Baseline $Baseline -LabRoot $LabRoot
Add-Type -TypeDefinition ([IO.File]::ReadAllText((Join-Path $LabRoot 'VisibilityLease.cs')))
if($TargetHeight-lt 100 -or $TargetHeight-gt 900){throw 'Target height range'}
$installedRoot=[IO.Path]::GetFullPath($b.gptRoot)
$lease=New-Object PlaybackLab.VisibilityLease($installedRoot)
try{
 if($ProbeOnly){
  $r=@{ok=$true;productionMutexBusy=!$lease.Owned;candidateWindowOpened=$false;mutexKeySha256=[BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes([PlaybackLab.VisibilityLease]::Key($installedRoot))));formalWindowChanged=$false}
  [IO.File]::WriteAllText((Join-Path $Baseline 'visibility-probe.json'),($r|ConvertTo-Json),[Text.UTF8Encoding]::new($false));[pscustomobject]$r|ConvertTo-Json;return
 }
 if(!$lease.Owned){throw 'FORMAL_WIDGET_OWNS_DISPLAY: no candidate window created; official pet left running'}
 $window=New-Object Windows.Window;$window.Title=('GPT娘 '+$Mode+' 原速预览 · 未接入桌面物理');$window.Width=560;$window.Height=640;$window.ShowActivated=$false
 $panel=New-Object Windows.Controls.DockPanel;$window.Content=$panel
 $buttons=New-Object Windows.Controls.WrapPanel;[Windows.Controls.DockPanel]::SetDock($buttons,'Top');$panel.Children.Add($buttons)|Out-Null
 $image=New-Object Windows.Controls.Image;$image.Stretch='Uniform';$image.HorizontalAlignment='Center';$image.VerticalAlignment='Center';[Windows.Media.RenderOptions]::SetBitmapScalingMode($image,[Windows.Media.BitmapScalingMode]::HighQuality)
 $panel.Children.Add($image)|Out-Null;$panel.Background=[Windows.Media.BrushConverter]::new().ConvertFromString('#292633')
 $player=$null
 if($Mode-eq 'B'){$player=New-Object PlaybackLab.Player($image,(New-Object PlaybackLab.PageCache(216MB)))}
 else{
  $script:appDir=$installedRoot;$script:dataDir=Join-Path $Baseline 'A-review-fake-state';[IO.Directory]::CreateDirectory($script:dataDir)|Out-Null
  $script:dragonTestMode=$true;$script:characterId='gpt-dragon';$script:widgetPetForm='full';$script:window=$window;$script:ui=@{Girl=$image}
  . ([ScriptBlock]::Create([IO.File]::ReadAllText((Join-Path $installedRoot 'runtime/characters.ps1'))))
  . ([ScriptBlock]::Create([IO.File]::ReadAllText((Join-Path $installedRoot 'runtime/dragon-animation/dragon-animation.ps1'))))
  function Save-Settings {throw 'REVIEW_MUST_NOT_SAVE_SETTINGS'}
  $script:bitmap=Read-WidgetCharacterImage (Join-Path $installedRoot 'assets/gpt-dragon-niang-bust.png');$image.Source=$script:bitmap
  Initialize-DragonAnimationSettings ([pscustomobject]@{dragonMotionVersion=1;dragonCodexEnabled=$false})
  Start-DragonAnimation
 }
 function Invoke-Plan($steps){
  if($Mode-eq 'B'){$null=$player.PlaySequence([PlaybackLab.Step[]]$steps);return}
  # A retains its installed return/bridge decisions; do not substitute B's chain.
  $script:drag=$null;$script:petNativeMotion=$null;$clipName=$steps[0].Clip.Name
  if($clipName-eq 'flutter'){$script:drag=@{moved=$true};$script:petNativeMotion=[pscustomobject]@{Dragging=$true;Moved=$true;DragFlightEligible=$true;Flying=$false;DragSerial=1;FlightSerial=0;CompletedFlightSerial=0;StopReason=$null}}
  elseif($clipName-eq 'draglanding'){$script:petNativeMotion=[pscustomobject]@{Dragging=$false;Moved=$true;Flying=$false;DragSerial=1;FlightSerial=1;CompletedFlightSerial=1;StopReason='rested'};$script:dragonHandledFlightSerial=0}
  $script:dragonManualPhase=$clipName;$script:dragonManualReason=if($clipName-eq 'frontidle'){'click-settle'}elseif($clipName-eq 'draglanding'){'drag-release'}else{'menu'}
  $script:dragonPhase='';$script:dragonManualUntil=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()+$steps[0].Clip.Frames*1000/$steps[0].Clip.Fps+200
 }
 function Step($name,$speed=1,$takeoff=$false,$fade=0){$s=New-Object PlaybackLab.Step;$s.Clip=Clip $name;$s.Plan.Speed=$speed;$s.Plan.Takeoff=$takeoff;$s.FadeMs=$fade;return $s}
 $plans=@{
  '待机'=[PlaybackLab.Step[]]@((Step 'frontidle'))
  '抱臂与收势'=[PlaybackLab.Step[]]@((Step 'proudarms'),(Step 'proudarmsreturn'),(Step 'frontidle'))
  '走路原片（原地）'=[PlaybackLab.Step[]]@((Step 'walking'),(Step 'frontidle'))
  '起飞计时样本'=[PlaybackLab.Step[]]@((Step 'flutter' 1 $true 80))
  '落地与返回'=[PlaybackLab.Step[]]@((Step 'draglanding' 1.2 $false 80),(Step 'frontidle' 1 $false 80))
  '展扇原片'=[PlaybackLab.Step[]]@((Step 'fanmishap'),(Step 'frontidle' 1 $false 180))
 }
 foreach($label in @('待机','抱臂与收势','走路原片（原地）','起飞计时样本','落地与返回','展扇原片')){
  $button=New-Object Windows.Controls.Button;$button.Content=$label;$button.Tag=$plans[$label];$button.Margin=4
  $button.Add_Click({param($sender,$e)Invoke-Plan $sender.Tag})
  $buttons.Children.Add($button)|Out-Null
 }
 Add-Type @'
using System;using System.Runtime.InteropServices;
public static class ReviewDpi{[DllImport("user32.dll")]public static extern uint GetDpiForWindow(IntPtr h);}
'@
 $window.Add_SourceInitialized({$h=[Windows.Interop.WindowInteropHelper]::new($window).Handle;$dpi=[ReviewDpi]::GetDpiForWindow($h)/96.0;if($dpi-le 0){$dpi=1};$image.Width=$TargetHeight*384.0/335/$dpi;$image.Height=$image.Width})
 $window.Add_ContentRendered({Invoke-Plan $plans['待机']})
 try{$null=$window.ShowDialog()}finally{if($player){$player.Dispose()}else{Stop-DragonAnimation}}
}finally{$lease.Dispose()}
