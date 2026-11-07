// Local dsh-pet shared-core.js (MIT) is the behavior reference: 400 DIP/s,
// size-normalized points, 20 warm particles, 0.5-0.9s burst, 2.2s card.
namespace PetCatchVisuals {
    using System;
    using System.Diagnostics;
    using System.Runtime.InteropServices;
    using System.Windows;
    using System.Windows.Controls;
    using System.Windows.Interop;
    using System.Windows.Media;
    using System.Windows.Media.Animation;
    using System.Windows.Media.Effects;
    using System.Windows.Threading;

    public static class Rules {
        public static bool Eligible(bool flying,double vx,double vy){
            return flying&&!Double.IsNaN(vx)&&!Double.IsNaN(vy)&&!Double.IsInfinity(vx)&&!Double.IsInfinity(vy)&&Math.Sqrt(vx*vx+vy*vy)>=400;
        }
        public static int Score(double speed,double size){
            if(size<=0||speed<=0||Double.IsNaN(size)||Double.IsInfinity(size)||Double.IsNaN(speed)||Double.IsInfinity(speed))return 0;
            return (int)Math.Min(Int32.MaxValue,Math.Max(1,Math.Floor(speed/100*(462/size)+0.5)));
        }
        public static Rect Place(double x,double y,Size size,Rect area){
            return new Rect(Math.Max(area.Left+4,Math.Min(area.Right-size.Width-4,x-size.Width/2)),
                Math.Max(area.Top+4,Math.Min(area.Bottom-size.Height-4,y-size.Height-14)),size.Width,size.Height);
        }
    }
    public sealed class Burst:FrameworkElement,IDisposable {
        struct Particle {public double Vx,Vy,Radius,Life;public Brush Color;}
        readonly Particle[] particles=new Particle[20];readonly Stopwatch clock=Stopwatch.StartNew();
        readonly Point origin;bool disposed;double lastDraw=-1;
        public long Frames {get;private set;}
        public bool Running {get;private set;}
        public Burst(Point at,bool reduced){
            origin=at;IsHitTestVisible=false;
            var random=new Random();var colors=new[]{"#ffb300","#ff8f00","#ff7043","#f4511e","#ffc400","#ffd54f","#ef5350"};
            for(int i=0;i<particles.Length;i++){
                double a=random.NextDouble()*Math.PI*2,s=120+random.NextDouble()*340;
                var color=(SolidColorBrush)new BrushConverter().ConvertFromString(colors[random.Next(colors.Length)]);color.Freeze();
                particles[i]=new Particle{Vx=Math.Cos(a)*s,Vy=Math.Sin(a)*s-80,Radius=3+random.NextDouble()*4,Life=0.5+random.NextDouble()*0.4,Color=color};
            }
            if(!reduced){Running=true;CompositionTarget.Rendering+=RenderFrame;}
        }
        void RenderFrame(object sender,EventArgs args){
            double now=clock.Elapsed.TotalSeconds;
            if(now-lastDraw<1.0/60)return;lastDraw=now;
            if(now>=0.9){Dispose();InvalidateVisual();return;}
            Frames++;InvalidateVisual();
        }
        protected override void OnRender(DrawingContext dc){
            if(!Running)return;double t=clock.Elapsed.TotalSeconds;
            foreach(var p in particles){if(t>=p.Life)continue;
                dc.PushOpacity(Math.Max(0,1-t/p.Life));
                dc.DrawEllipse(p.Color,null,new Point(origin.X+p.Vx*t,origin.Y+p.Vy*t+350*t*t),p.Radius,p.Radius);dc.Pop();
            }
        }
        public void Dispose(){if(disposed)return;disposed=true;Running=false;CompositionTarget.Rendering-=RenderFrame;}
    }
    public sealed class Feedback:IDisposable {
        [StructLayout(LayoutKind.Sequential)] struct NativeRect {public int Left,Top,Right,Bottom;}
        [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h,out NativeRect rect);
        [DllImport("user32.dll",EntryPoint="GetWindowLongW")] static extern int GetWindowLong(IntPtr h,int index);
        [DllImport("user32.dll",EntryPoint="SetWindowLongW")] static extern int SetWindowLong(IntPtr h,int index,int value);
        [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int w,int height,uint flags);
        readonly Window owner;readonly FontFamily font;
        Window popup;Burst burst;DispatcherTimer lifetime;HwndSourceHook hook;
        HwndSource ownerSource;HwndSourceHook followHook;IntPtr ownerHandle;
        int ownerStartX,ownerStartY,popupStartX,popupStartY,lastPopupX,lastPopupY;
        public Canvas View {get;private set;}
        public Rect CardBounds {get;private set;}
        public bool Visible {get{return popup!=null&&popup.IsVisible;}}
        public bool BurstRunning {get{return burst!=null&&burst.Running;}}
        public IntPtr Handle {get;private set;}
        public int Count {get;private set;} public int LastScore {get;private set;}
        public double LastSpeed {get;private set;}public double LastSize {get;private set;}
        public string Detail {get;private set;}
        public Feedback(Window parent,string fontDirectory){
            owner=parent;font=new FontFamily(new Uri(fontDirectory),"./soft-candy.ttf#SSRuanTangTi");
            owner.Closed+=OwnerClosed;owner.IsVisibleChanged+=VisibilityChanged;
        }
        void OwnerClosed(object sender,EventArgs args){Dispose();}
        void VisibilityChanged(object sender,DependencyPropertyChangedEventArgs args){if(!owner.IsVisible)Close();}
        public bool TryCatch(bool flying,double vx,double vy,double size,double x,double y,double dpi,Rect screen,bool topmost,bool reduced){
            if(!Rules.Eligible(flying,vx,vy)||size<=0||Double.IsNaN(size)||Double.IsInfinity(size))return false;
            Close();LastSpeed=Math.Sqrt(vx*vx+vy*vy);LastSize=size;LastScore=Rules.Score(LastSpeed,size);
            Detail="速度 "+Math.Floor(LastSpeed+0.5)+" · 大小 "+Math.Floor(size+0.5);
            dpi=Math.Max(0.5,dpi);double width=Math.Min(600,screen.Width/dpi),height=Math.Min(600,screen.Height/dpi);
            double left=Math.Max(screen.Left,Math.Min(screen.Right-width*dpi,x-width*dpi/2));
            double top=Math.Max(screen.Top,Math.Min(screen.Bottom-height*dpi,y-height*dpi/2));
            var point=new Point((x-left)/dpi,(y-top)/dpi);
            View=new Canvas{Width=width,Height=height,IsHitTestVisible=false,ClipToBounds=true};
            burst=new Burst(point,reduced){Width=width,Height=height};View.Children.Add(burst);
            var text=new StackPanel();
            text.Children.Add(new TextBlock{Text="+"+LastScore,FontFamily=font,FontSize=22,FontWeight=FontWeights.Bold,Foreground=Brush("#ff8f00"),TextAlignment=TextAlignment.Center});
            text.Children.Add(new TextBlock{Text=Detail,FontFamily=font,FontSize=11,Foreground=Brush("#992B2B2B"),TextAlignment=TextAlignment.Center,Margin=new Thickness(0,2,0,0)});
            var card=new Border{Child=text,MinWidth=120,Padding=new Thickness(16,8,16,9),CornerRadius=new CornerRadius(12),Background=Brush("#F7FFFFFF"),BorderBrush=Brush("#59ffb300"),BorderThickness=new Thickness(1),IsHitTestVisible=false};
            card.Effect=new DropShadowEffect{Color=Colors.Black,BlurRadius=22,ShadowDepth=6,Opacity=0.22};
            card.Measure(new Size(width-16,height));CardBounds=Rules.Place(point.X,point.Y,card.DesiredSize,new Rect(0,0,width,height));
            Canvas.SetLeft(card,CardBounds.X);Canvas.SetTop(card,CardBounds.Y);View.Children.Add(card);
            popup=new Window{WindowStyle=WindowStyle.None,ResizeMode=ResizeMode.NoResize,AllowsTransparency=true,Background=Brushes.Transparent,ShowActivated=false,ShowInTaskbar=false,Focusable=false,IsHitTestVisible=false,Width=width,Height=height,Left=left/dpi,Top=top/dpi,Topmost=topmost,Content=View};
            ownerHandle=new WindowInteropHelper(owner).EnsureHandle();
            new WindowInteropHelper(popup).Owner=ownerHandle;
            Handle=new WindowInteropHelper(popup).EnsureHandle();
            SetWindowLong(Handle,-20,GetWindowLong(Handle,-20)|0x20|0x80|0x08000000);
            hook=NoInput;HwndSource.FromHwnd(Handle).AddHook(hook);
            popup.Show();
            SetWindowPos(Handle,IntPtr.Zero,(int)Math.Round(left),(int)Math.Round(top),(int)Math.Round(width*dpi),(int)Math.Round(height*dpi),0x14);
            NativeRect ownerRect,popupRect;
            if(GetWindowRect(ownerHandle,out ownerRect)&&GetWindowRect(Handle,out popupRect)){
                ownerStartX=ownerRect.Left;ownerStartY=ownerRect.Top;
                popupStartX=lastPopupX=popupRect.Left;popupStartY=lastPopupY=popupRect.Top;
                ownerSource=HwndSource.FromHwnd(ownerHandle);followHook=FollowOwner;ownerSource.AddHook(followHook);
            }
            if(!reduced){
                card.RenderTransformOrigin=new Point(0.5,0.5);var scale=new ScaleTransform(1,1);card.RenderTransform=scale;
                var pop=new DoubleAnimation(0.6,1,TimeSpan.FromMilliseconds(280)){EasingFunction=new CubicEase{EasingMode=EasingMode.EaseOut}};
                scale.BeginAnimation(ScaleTransform.ScaleXProperty,pop);scale.BeginAnimation(ScaleTransform.ScaleYProperty,pop);
                card.BeginAnimation(UIElement.OpacityProperty,new DoubleAnimation(0,1,TimeSpan.FromMilliseconds(180)));
            }
            lifetime=new DispatcherTimer(DispatcherPriority.Background,owner.Dispatcher){Interval=TimeSpan.FromMilliseconds(2200)};
            lifetime.Tick+=Expired;lifetime.Start();Count++;return true;
        }
        static SolidColorBrush Brush(string hex){var b=(SolidColorBrush)new BrushConverter().ConvertFromString(hex);b.Freeze();return b;}
        IntPtr FollowOwner(IntPtr hwnd,int msg,IntPtr w,IntPtr l,ref bool handled){
            // Follow the HWND's actual physical displacement, not the cursor or
            // a slower script tick. This runs within the same position update
            // that moves the pet, including release/throw and partial offscreen.
            if(msg!=0x47||popup==null||Handle==IntPtr.Zero||l==IntPtr.Zero)return IntPtr.Zero;
            if((Marshal.ReadInt32(l,IntPtr.Size*2+16)&2)!=0)return IntPtr.Zero;
            NativeRect rect;if(!GetWindowRect(ownerHandle,out rect))return IntPtr.Zero;
            int x=popupStartX+rect.Left-ownerStartX,y=popupStartY+rect.Top-ownerStartY;
            if(x!=lastPopupX||y!=lastPopupY){
                if(SetWindowPos(Handle,IntPtr.Zero,x,y,0,0,0x15)){lastPopupX=x;lastPopupY=y;}
            }
            return IntPtr.Zero;
        }
        static IntPtr NoInput(IntPtr hwnd,int msg,IntPtr w,IntPtr l,ref bool handled){
            if(msg==0x84){handled=true;return new IntPtr(-1);}if(msg==0x21){handled=true;return new IntPtr(3);}return IntPtr.Zero;
        }
        void Expired(object sender,EventArgs args){Close();}
        public void Close(){
            if(ownerSource!=null&&!ownerSource.IsDisposed&&followHook!=null)ownerSource.RemoveHook(followHook);
            ownerSource=null;followHook=null;
            if(lifetime!=null){lifetime.Stop();lifetime.Tick-=Expired;lifetime=null;}
            if(burst!=null){burst.Dispose();burst=null;}
            if(popup!=null){var old=popup;popup=null;old.Close();}
            hook=null;Handle=IntPtr.Zero;View=null;
        }
        public void Dispose(){Close();owner.Closed-=OwnerClosed;owner.IsVisibleChanged-=VisibilityChanged;}
    }
}
