public static class BlendProbe {
 public static int Compare(System.Windows.Media.Imaging.BitmapSource a,System.Windows.Media.Imaging.BitmapSource b,double p){
  var old=BaselineMotionDecoder.Blend(a,b,p);var current=DragonMotionDecoder.Blend(a,b,p);
  int stride=a.PixelWidth*4;byte[] x=new byte[stride*a.PixelHeight],y=new byte[x.Length];old.CopyPixels(x,stride,0);current.CopyPixels(y,stride,0);
  int difference=0;for(int i=0;i<x.Length;i++)difference=System.Math.Max(difference,System.Math.Abs(x[i]-y[i]));return difference;
 }
 public static double Measure(System.Windows.Media.Imaging.BitmapSource a,System.Windows.Media.Imaging.BitmapSource b,bool baseline,int count){
  var watch=System.Diagnostics.Stopwatch.StartNew();for(int i=0;i<count;i++){double p=(i%17+1)/19.0;if(baseline)BaselineMotionDecoder.Blend(a,b,p);else DragonMotionDecoder.Blend(a,b,p);}return watch.Elapsed.TotalMilliseconds/count;
 }
}
