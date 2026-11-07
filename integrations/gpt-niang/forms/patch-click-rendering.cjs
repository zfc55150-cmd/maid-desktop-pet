'use strict';
function patch(bytes){
 const text=bytes.toString('utf8');if(text.includes('public static void RequestRefreshRate('))return require('./patch-click-idle.cjs').patch(bytes);
 const nl=text.includes('\r\n')?'\r\n':'\n';
 const anchor='  public static double Scale(double u){';
 if(text.split(anchor).length!==2)throw Error('Click render helper anchor changed');
 const helper=`  [System.Runtime.InteropServices.DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr window);
  [System.Runtime.InteropServices.DllImport("user32.dll")] static extern int ReleaseDC(IntPtr window,IntPtr dc);
  [System.Runtime.InteropServices.DllImport("gdi32.dll")] static extern int GetDeviceCaps(IntPtr dc,int index);
  public static void RequestRefreshRate(Timeline animation,IntPtr window){
    IntPtr dc=GetDC(window);int hz=60;
    try{if(dc!=IntPtr.Zero)hz=GetDeviceCaps(dc,116);}finally{if(dc!=IntPtr.Zero)ReleaseDC(window,dc);}
    Timeline.SetDesiredFrameRate(animation,Math.Max(60,Math.Min(360,hz)));
  }
`;
 let out=text.replace(anchor,helper.replace(/\n/g,nl)+anchor);
 const begin='  $script:petFullClickScale.BeginAnimation([Windows.Media.ScaleTransform]::ScaleYProperty,$animation)';
 if(out.split(begin).length!==2)throw Error('Click refresh anchor changed');
 out=out.replace(begin,'  [GptFullClickAnimation]::RequestRefreshRate($animation,[IntPtr]([long]$script:widgetHandle))'+nl+begin);
 const reset='    if($down){Reset-WidgetFullClick}';
 if(out.split(reset).length!==2)throw Error('Click reset anchor changed');
 out=out.replace(reset,'    # Let an existing rebound finish while held; a new click replaces it on release.');
 const save='  Save-Settings;$script:hostEventTimer.Start();$event.Handled=$true';
 if(out.split(save).length!==2)throw Error('Click save anchor changed');
 out=out.replace(save,"  if($moved -or $caught -or $script:characterId-ne 'gpt-dragon' -or $script:widgetPetForm-ne 'full'){Save-Settings};$script:hostEventTimer.Start();$event.Handled=$true");
 return require('./patch-click-idle.cjs').patch(Buffer.from(out,'utf8'));
}
module.exports={patch};
