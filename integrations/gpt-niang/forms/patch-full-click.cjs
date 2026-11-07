'use strict';
function patch(bytes){
 let text=bytes.toString('utf8');if(text.includes('class GptFullClickAnimation'))return require('./patch-full-click-quiet.cjs').patch(bytes);
 const nl=text.includes('\r\n')?'\r\n':'\n';
 function replace(a,b){if(text.split(a).length!==2)throw Error('Full click anchor changed: '+a);text=text.replace(a,b.replace(/\n/g,nl));}
 replace('public sealed class GptBezierEase:EasingFunctionBase {',`// Same 220ms bottom-anchored click curve as DeepSeek shared-core.squashScale.
public sealed class GptFullClickAnimation:DoubleAnimationBase {
  public static double Scale(double u){
    u=Math.Max(0,Math.Min(1,u));
    if(u<.45){double p=u/.45;return 1-.45*p*p;}
    double q=(u-.45)/.55-1;
    double f=1+2.70158*q*q*q+1.70158*q*q;
    return Math.Min(1.12,.55+.45*Math.Max(f,0));
  }
  protected override double GetCurrentValueCore(double from,double to,AnimationClock clock){return Scale(clock.CurrentProgress??1);}
  protected override Freezable CreateInstanceCore(){return new GptFullClickAnimation();}
}
public sealed class GptBezierEase:EasingFunctionBase {`);
 replace('function Animate-Press([bool]$down) {','function Animate-Press([bool]$down) {\n  if($script:characterId-eq \'gpt-dragon\' -and $script:widgetPetForm-ne \'bust\'){\n    if($down){Reset-WidgetFullClick}\n    return\n  }');
 replace('function Request-Refresh {',`function Reset-WidgetFullClick {
  if($script:petFullClickScale){
    $script:petFullClickScale.BeginAnimation([Windows.Media.ScaleTransform]::ScaleYProperty,$null)
    $script:petFullClickScale.ScaleY=1
  }
}
function Invoke-WidgetFullClick {
  if($script:characterId-ne 'gpt-dragon' -or $script:widgetPetForm-ne 'full' -or $script:petFormTransition -or ![Windows.SystemParameters]::ClientAreaAnimation){return}
  if(!$script:petFullClickScale){
    $script:petFullClickScale=[Windows.Media.ScaleTransform]::new(1,1)
    $group=[Windows.Media.TransformGroup]::new()
    $group.Children.Add($script:ui.Girl.RenderTransform)
    $group.Children.Add($script:petFullClickScale)
    $script:ui.Girl.RenderTransform=$group
    $script:ui.Girl.RenderTransformOrigin=[Windows.Point]::new(0.5,359.0/384)
  }
  Reset-WidgetFullClick
  $animation=[GptFullClickAnimation]::new()
  $animation.Duration=[Windows.Duration]::new([TimeSpan]::FromMilliseconds(220))
  $animation.FillBehavior=[Windows.Media.Animation.FillBehavior]::Stop
  $script:petFullClickScale.BeginAnimation([Windows.Media.ScaleTransform]::ScaleYProperty,$animation)
}
function Request-Refresh {`);
 replace('($touch.Y/[Math]::Max(1.0,[double]$script:ui.Girl.ActualHeight))}', '($touch.Y/[Math]::Max(1.0,[double]$script:ui.Girl.ActualHeight));Invoke-WidgetFullClick}');
 return require('./patch-full-click-quiet.cjs').patch(Buffer.from(text,'utf8'));
}
module.exports={patch};
