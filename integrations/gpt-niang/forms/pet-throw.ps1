# Local desktop throw physics, matching DeepSeek's release window, gravity,
# restitution and floor friction. Coordinates are physical pixels; velocity
# sampling is DPI-normalized. Dragging itself remains the existing handler.
$script:petThrowClock=[Diagnostics.Stopwatch]::StartNew()
function Get-WidgetThrowNow {return $script:petThrowClock.ElapsedMilliseconds}
function Get-WidgetThrowVelocity($Trail,[long]$Now) {
  $all=@($Trail);if(!$all.Count -or $Now-$all[-1].t-gt 150){return $null}
  $win=@($all|Where-Object{$Now-$_.t-le 150});if($win.Count-lt 2){return $null}
  $span=$win[-1].t-$win[0].t;if($span-lt 20){return $null}
  $vx=($win[-1].x-$win[0].x)*1000/$span;$vy=($win[-1].y-$win[0].y)*1000/$span
  $base=[Math]::Sqrt($vx*$vx+$vy*$vy);if($base-lt 0.000001){return $null}
  $segments=@();$previous=$win[0]
  foreach($sample in $win[1..($win.Count-1)]){
    $dt=$sample.t-$previous.t;if($dt-ge 8){$dx=$sample.x-$previous.x;$dy=$sample.y-$previous.y;$segments+=@{speed=[Math]::Sqrt($dx*$dx+$dy*$dy)*1000/$dt;t=$sample.t};$previous=$sample}
  }
  $peak=$base;if($segments.Count){$peak=($segments.speed|Measure-Object -Maximum).Maximum}
  $accel=0.0;if($segments.Count-ge 2){$accel=($segments[-1].speed-$segments[0].speed)/[Math]::Max(($segments[-1].t-$segments[0].t)/1000.0,0.02)}
  $before=(0.5*$base+0.5*$peak)*(1+[Math]::Min([Math]::Max($accel,0.0)/8000.0,1.0)*0.6)
  $speed=3600*(1-[Math]::Exp(-$before/3600));if($speed-lt 500){return $null}
  return @{vx=$vx/$base*$speed;vy=$vy/$base*$speed}
}
function Step-WidgetThrow($State,[double]$Delta,$Bounds,[double]$Dpi=1) {
  $dt=[Math]::Min([Math]::Max($Delta,0.0),0.05);$bounced=$false
  $State.vy+=1400*$Dpi*$dt;$State.x+=$State.vx*$dt;$State.y+=$State.vy*$dt
  if($State.x-lt $Bounds.minX){$State.x=$Bounds.minX;$State.vx=[Math]::Abs($State.vx)*0.78;$bounced=$true}
  elseif($State.x-gt $Bounds.maxX){$State.x=$Bounds.maxX;$State.vx=-[Math]::Abs($State.vx)*0.78;$bounced=$true}
  if($State.y-lt $Bounds.minY){$State.y=$Bounds.minY;$State.vy=[Math]::Abs($State.vy)*0.78;$bounced=$true}
  elseif($State.y-ge $Bounds.maxY){
    $State.y=$Bounds.maxY;$State.vx*=[Math]::Max(0.0,1-2.5*$dt)
    $State.vy=if([Math]::Abs($State.vy)-lt 40*$Dpi){0.0}else{-[Math]::Abs($State.vy)*0.78};$bounced=$true
  }
  $speed=[Math]::Sqrt($State.vx*$State.vx+$State.vy*$State.vy)
  return (($State.y-ge $Bounds.maxY-1 -and [Math]::Abs($State.vy)-lt $Dpi -and [Math]::Abs($State.vx)-lt 15*$Dpi) -or ($bounced -and $speed-lt 40*$Dpi -and [Math]::Abs($State.vy)-lt $Dpi))
}
function Stop-WidgetThrow {
  if($script:petThrowTimer){$script:petThrowTimer.Stop()}
  $moving=[bool]$script:petThrowState;$script:petThrowState=$null;$script:petThrowPending=$null
  if($moving){Save-Settings}
}
function Get-WidgetThrowBounds([double]$Dpi) {
  $r=Get-WidgetRestingCharacterBounds $Dpi
  $small=$script:characterId-eq 'gpt-dragon' -and $script:widgetPetForm-eq 'bust'
  $x=$r.X+$r.Width*$(if($small){0.19}else{0.21})
  $y=$r.Y+$r.Height*$(if($small){359/384-0.62*1139/1381}else{0.073})
  $w=$r.Width*$(if($small){0.62}else{0.58});$h=$r.Height*$(if($small){0.62*1139/1381}else{359/384-0.073})
  $screen=[Windows.Forms.Screen]::FromPoint([Drawing.Point]::new([int]($script:desktopLeft+$x+$w/2),[int]($script:desktopTop+$y+$h/2))).WorkingArea
  return @{minX=[double]($screen.Left-$x);maxX=[double][Math]::Max($screen.Left-$x,$screen.Right-$x-$w);minY=[double]($screen.Top-$y);maxY=[double][Math]::Max($screen.Top-$y,$screen.Bottom-$y-$h)}
}
function Tick-WidgetThrow {
  if(!$script:petThrowState){return}
  if($script:drag -or $script:followHost -or !$script:window.IsVisible -or $script:context.IsOpen -or $script:settingsSizePreview -or ($script:characterGallery -and $script:characterGallery.IsVisible) -or ($script:widgetMusic -and $script:widgetMusic.Enabled)){Stop-WidgetThrow;return}
  $now=(Get-WidgetThrowNow);$delta=($now-$script:petThrowTick)/1000.0;$script:petThrowTick=$now
  if($delta-gt 0.25){Stop-WidgetThrow;return}
  $rest=Step-WidgetThrow $script:petThrowState $delta $script:petThrowBounds $script:petThrowDpi
  $script:desktopLeft=[Math]::Round($script:petThrowState.x);$script:desktopTop=[Math]::Round($script:petThrowState.y)
  [GptWidgetNative]::SetWindowPos($script:widgetHandle,[IntPtr]::Zero,[int]$script:desktopLeft,[int]$script:desktopTop,0,0,0x15)|Out-Null
  $script:lastPosition=$null
  if($rest){Stop-WidgetThrow}
}
function Start-WidgetThrow([double]$Vx,[double]$Vy) {
  Stop-WidgetThrow
  if($script:followHost -or $script:drag -or !$script:window.IsVisible){return}
  $script:petThrowDpi=Get-WidgetPlacementDpi;$script:petThrowBounds=Get-WidgetThrowBounds $script:petThrowDpi
  $script:petThrowState=@{x=[double]$script:desktopLeft;y=[double]$script:desktopTop;vx=$Vx*$script:petThrowDpi;vy=$Vy*$script:petThrowDpi}
  $script:petThrowTick=(Get-WidgetThrowNow);Reset-WidgetAutoQuoteSchedule;$script:petThrowTimer.Start()
}
function Add-WidgetThrowSample {
  $point=New-Object GptWidgetNative+Point;[GptWidgetNative]::GetCursorPos([ref]$point)|Out-Null
  $now=(Get-WidgetThrowNow);$dpi=Get-WidgetPlacementDpi
  $script:petThrowTrail=@($script:petThrowTrail|Where-Object{$now-$_.t-le 200})
  if(!$script:petThrowTrail.Count -or $point.X/$dpi-ne $script:petThrowTrail[-1].x -or $point.Y/$dpi-ne $script:petThrowTrail[-1].y){$script:petThrowTrail+=@{t=$now;x=$point.X/$dpi;y=$point.Y/$dpi}}
}
function Initialize-WidgetThrow {
  if($script:petThrowTimer){return}
  $script:petThrowTimer=[Windows.Threading.DispatcherTimer]::new();$script:petThrowTimer.Interval=[TimeSpan]::FromMilliseconds(16)
  $script:petThrowTimer.Add_Tick({try{Tick-WidgetThrow}catch{Stop-WidgetThrow}})
  $script:ui.Girl.Add_PreviewMouseLeftButtonDown({Stop-WidgetThrow;$script:petThrowTrail=@();Add-WidgetThrowSample})
  $script:ui.Girl.Add_PreviewMouseMove({if($script:drag -and !$script:drag.music){Add-WidgetThrowSample}})
  $script:ui.Girl.Add_PreviewMouseLeftButtonUp({
    if(!$script:followHost -and $script:drag -and $script:drag.moved -and !$script:drag.music){
      $script:petThrowPending=Get-WidgetThrowVelocity $script:petThrowTrail ((Get-WidgetThrowNow))
      if($script:petThrowPending){$null=$script:window.Dispatcher.BeginInvoke([Action]{if($script:petThrowPending){$v=$script:petThrowPending;$script:petThrowPending=$null;Start-WidgetThrow $v.vx $v.vy}})}
    }
  })
  $script:window.Add_Closed({Stop-WidgetThrow})
}
if($script:appDir){
  $adapter=Join-Path $script:appDir 'runtime\native-motion-adapter.ps1'
  if([IO.File]::Exists($adapter)){. ([ScriptBlock]::Create([IO.File]::ReadAllText($adapter,[Text.Encoding]::UTF8)))}
}
