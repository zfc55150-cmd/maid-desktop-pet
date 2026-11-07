# Drag-only playback policy. Menu playback and the landing media stay native.
function Get-DragonDragEntryFrame([string]$Clip){
  # Start with the original standing pose; never skip the takeoff.
  return 0
}
function Get-DragonDragWarmKeys {
  $air=Get-DragonDragClip;$landing=[string]$script:dragonManifest.dragLandingClip
  if($air){$page=[int][Math]::Floor((Get-DragonDragEntryFrame $air)/64);Write-Output ($air+':'+$page)}
  if($landing -and $script:dragonManifest.states.PSObject.Properties[$landing]){Write-Output ($landing+':0')}
}
function Request-DragonDragWarmPages {
  if(!$script:dragonWasRendering -or $script:widgetPetForm-ne 'full'){return}
  foreach($key in @(Get-DragonDragWarmKeys)){
    $parts=$key.Split(':');Request-DragonMotionPage $parts[0] ([int]$parts[1])
  }
}
function Test-DragonDragReleaseHold([bool]$Held){return $Held}
function Get-DragonCompletedPhysicalFlight {
  $motion=$script:petNativeMotion
  if(!$motion -or $motion.Flying -or $motion.Dragging){return $false}
  $serial=[long]$motion.FlightSerial
  if($serial-le [long]$script:dragonHandledFlightSerial){return $false}
  # Consume ended episodes even when hidden/disabled or interrupted. Only the
  # native controller can certify that a real flight ended at physical rest.
  $script:dragonHandledFlightSerial=$serial
  return ($motion.StopReason-eq 'rested' -and [long]$motion.CompletedFlightSerial-eq $serial)
}

