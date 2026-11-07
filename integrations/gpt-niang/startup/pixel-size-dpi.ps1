  # WPF has no CompositionTarget before the first Show. Its Width/Height
  # are still DIPs: divide by the native HWND DPI even while hidden.
  $sx=if($dpi-gt 0){$dpi}else{1.0};$sy=$sx
  $sizeHandle=([Windows.Interop.WindowInteropHelper]::new($script:window)).Handle
  if($sizeHandle-ne [IntPtr]::Zero){
    $sizeDpi=[GptWidgetNative]::GetDpiForWindow($sizeHandle)
    if($sizeDpi-gt 0){$sx=$sizeDpi/96.0;$sy=$sx}
  }
  if($script:window.IsVisible -and $source -and $source.CompositionTarget){
    $matrix=$source.CompositionTarget.TransformToDevice;$sx=$matrix.M11;$sy=$matrix.M22
  }
