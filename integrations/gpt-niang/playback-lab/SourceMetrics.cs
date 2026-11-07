using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.CompilerServices;
using System.Windows.Controls;
using System.Windows.Media.Imaging;
namespace PlaybackLab {
 public sealed class SourceChange {public double AtMs;public string Kind;public int Width,Height,ParentIdentity,TileX,TileY;}
 // Observe identical Image.Source notifications in A and B. No pixel copies,
 // atlas references, UI polling, or per-frame PowerShell callbacks are retained.
 public sealed class SourceMetrics:IDisposable {
  readonly Image image;readonly Stopwatch clock=Stopwatch.StartNew();
  readonly DependencyPropertyDescriptor property=DependencyPropertyDescriptor.FromProperty(Image.SourceProperty,typeof(Image));
  readonly List<SourceChange> changes=new List<SourceChange>();
  public SourceChange[] Changes{get{return changes.ToArray();}}
  public SourceMetrics(Image target){image=target;property.AddValueChanged(image,Changed);}
  void Changed(object sender,EventArgs e){
   var source=image.Source as BitmapSource;if(source==null||changes.Count>=32768)return;
   var c=new SourceChange{AtMs=clock.Elapsed.TotalMilliseconds,Width=source.PixelWidth,Height=source.PixelHeight,Kind=source.GetType().Name};
   var crop=source as CroppedBitmap;if(crop!=null){c.ParentIdentity=RuntimeHelpers.GetHashCode(crop.Source);c.TileX=crop.SourceRect.X;c.TileY=crop.SourceRect.Y;}
   changes.Add(c);
  }
  public void Dispose(){property.RemoveValueChanged(image,Changed);clock.Stop();}
 }
}
