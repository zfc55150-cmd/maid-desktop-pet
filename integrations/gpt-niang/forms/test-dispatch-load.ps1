param([string]$Stage,[string]$Report,[switch]$WithCatchEffect)
$ErrorActionPreference='Stop'
$nativeFile=Join-Path $Stage 'runtime\native-motion.cs'
$native=[IO.File]::ReadAllText($nativeFile)
if(!$native.Contains('class FullReplayCursor')){$native+=@'

public sealed class FullReplayCursor:IPetMotionCursor {
 readonly System.Diagnostics.Stopwatch clock=System.Diagnostics.Stopwatch.StartNew();
 public PetMotionPoint Read(){double t=clock.Elapsed.TotalSeconds;return new PetMotionPoint{X=1000+(int)(450*System.Math.Sin(t*2.5)),Y=600+(int)(130*System.Math.Sin(t*3))};}
}
'@
}
[IO.File]::WriteAllText($nativeFile,$native)
$source=[IO.File]::ReadAllText((Join-Path $Stage 'widget.ps1'))
$source=$source.Replace('if($CheckOnly){$hostWindow=', 'if($false){$hostWindow=')
$source=$source.Replace('$script:messageHook=[Windows.Interop.HwndSourceHook]{param($hwnd,$msg,$w,$l,[ref]$handled)', '$script:messageHook=[Windows.Interop.HwndSourceHook]{param($hwnd,$msg,$w,$l,[ref]$handled)'+"`r`n"+'  $script:messageCalls++')
$source=$source.Replace('$script:winEventCallback=[GptWidgetNative+WinEventProc]{param($hook,$ev,$hwnd,$objectId,$childId,$threadId,$time)', '$script:winEventCallback=[GptWidgetNative+WinEventProc]{param($hook,$ev,$hwnd,$objectId,$childId,$threadId,$time)'+"`r`n"+'  $script:eventCalls++')
$safe=@'
function Ensure-QuotaWorker([long]$now){}
function Start-CompletionMonitor{}
function Get-WidgetFreeDesktopPosition([double]$Left,[double]$Top,[double]$Dpi){return @{X=[int]$Left;Y=[int]$Top}}
$script:messageCalls=0;$script:eventCalls=0
'@
$source=$source.Replace("try{`r`n  # Do not replace",$safe+"`r`ntry{`r`n  # Do not replace")
$exercise=@'
  $script:originalMotion=$script:petNativeMotion
  $script:petNativeMotion=[PetNativeMotion]::new($script:window,$script:ui.Girl,[FullReplayCursor]::new())
  if($script:petNativeMotion.PSObject.Properties['AnimationTimer']){$script:petNativeMotion.AnimationTimer=$script:dragonTimer}
  $script:petThrowTimer=$script:petNativeMotion.Timer
  $script:exercise=[Windows.Threading.DispatcherTimer]::new()
  $script:exercise.Interval=[TimeSpan]::FromMilliseconds(500)
  $script:exercisePhase=0
  $script:exercise.add_Tick({
    if($script:exercisePhase-eq 0){
      $f=[GptWidgetNative]::Frame($script:widgetHandle);$b=[PetMotionBox]::new();$b.MinX=$f.Left-1000;$b.MaxX=$f.Left+1000;$b.MinY=$f.Top-1000;$b.MaxY=$f.Top+1000
      $script:messageCalls=0;$script:eventCalls=0
      $script:petNativeMotion.BeginDrag([PetMotionBox[]]@($b),(Get-WidgetPlacementDpi))
      if($script:testCatchEffect){
        $dpi=Get-WidgetPlacementDpi;$area=[Windows.Rect]::new($f.Left-200,$f.Top-200,1920,1080)
        $null=$script:petCatchFeedback.TryCatch($true,1200,0,291.2,($f.Left+300),($f.Top+300),$dpi,$area,$false,$false)
      }
      $script:exercisePhase=1;$script:exercise.Interval=[TimeSpan]::FromSeconds(4)
    }else{
      $m=$script:petNativeMotion
      $metrics=@{ok=$true;frames=$m.Frames;moves=$m.NativeMoves;fps=[Math]::Round($m.Frames/4.0,1);p95GapMs=[Math]::Round($m.P95Gap,2);meanWorkMs=[Math]::Round($m.TotalStepMilliseconds/[Math]::Max(1,$m.Frames),3);messageScriptCalls=$script:messageCalls;eventScriptCalls=$script:eventCalls;motionActive=$m.Active;animationIntervalMs=$script:dragonTimer.Interval.TotalMilliseconds;animationTimerRunning=$script:dragonTimer.IsEnabled;realHooks=$true;realMainTimer=$script:timer.IsEnabled;paidCalls=0;withCatchEffect=$script:testCatchEffect;catchCount=$(if($script:petCatchFeedback){$script:petCatchFeedback.Count}else{0})}
      [IO.File]::WriteAllText($script:exerciseReport,($metrics|ConvertTo-Json))
      $m.Stop();$script:exercise.Stop();$script:window.Close()
    }
  })
  $script:exercise.Start()
'@
$source=$source.Replace('  [Windows.Threading.Dispatcher]::Run()',$exercise+"`r`n  [Windows.Threading.Dispatcher]::Run()")
$script:exerciseReport=$Report
$script:testCatchEffect=[bool]$WithCatchEffect
$null=. ([ScriptBlock]::Create($source)) -AppDir $Stage
