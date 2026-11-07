using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Threading;

public sealed class PetMotionBox { public double MinX, MaxX, MinY, MaxY; }
public sealed class PetMotionVector { public double Vx, Vy; }
public sealed class PetMotionState { public double X, Y, Vx, Vy; }
public struct PetMotionPoint { public int X,Y; }
public interface IPetMotionCursor { PetMotionPoint Read(); }
// WPF calls HwndSource hooks for every window message. Only messages used by
// the script need to cross the PowerShell boundary; geometry stays native.
public sealed class PetWindowMessageRelay {
    readonly HwndSourceHook script; readonly Action<IntPtr> position;
    public long Received,Forwarded;
    public PetWindowMessageRelay(HwndSourceHook handler,Action<IntPtr> changed){script=handler;position=changed;}
    public IntPtr Message(IntPtr hwnd,int msg,IntPtr w,IntPtr l,ref bool handled){
        Received++;
        if(msg==0x47){position(l);return IntPtr.Zero;}
        if(msg==0x21){handled=true;return new IntPtr(3);}
        if(msg!=0x84&&msg!=0x2e0&&msg!=0x7e&&msg!=0x1a)return IntPtr.Zero;
        Forwarded++;var result=script(hwnd,msg,w,l,ref handled);
        // The PowerShell delegate's ref bool does not round-trip reliably.
        // Its only nonzero remaining response is transparent alpha hit-testing.
        if(msg==0x84&&result!=IntPtr.Zero)handled=true;
        return result;
    }
}
public sealed class PetWindowEventRelay {
    readonly IntPtr own; readonly Delegate script;
    public long Received,Forwarded;
    public PetWindowEventRelay(IntPtr widget,Delegate handler){own=widget;script=handler;}
    public void OnEvent(IntPtr hook,uint ev,IntPtr hwnd,int objectId,int childId,uint thread,uint time){
        Received++;
        if(objectId!=0||childId!=0||hwnd==own)return;
        if(ev!=3&&ev!=16&&ev!=17&&ev!=22&&ev!=23&&ev!=0x8000&&ev!=0x8001&&ev!=0x8002&&ev!=0x8003&&ev!=0x800a)return;
        Forwarded++;script.DynamicInvoke(hook,ev,hwnd,objectId,childId,thread,time);
    }
}
public sealed class PetNativeMotion {
    [StructLayout(LayoutKind.Sequential)] struct Rect { public int Left,Top,Right,Bottom; }
    [DllImport("user32.dll")] static extern bool GetCursorPos(out PetMotionPoint point);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr window,out Rect rect);
    [DllImport("user32.dll")] static extern uint GetDpiForWindow(IntPtr window);
    [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr window,IntPtr after,int x,int y,int w,int h,uint flags);
    [DllImport("dwmapi.dll")] static extern int DwmFlush();
    struct Sample { public double T,X,Y; public Sample(double t,double x,double y){T=t;X=x;Y=y;} }
    readonly Stopwatch clock=Stopwatch.StartNew(); readonly Window window; readonly UIElement girl;
    readonly IPetMotionCursor cursor;
    sealed class NativeCursor:IPetMotionCursor { public PetMotionPoint Read(){PetMotionPoint p;GetCursorPos(out p);return p;} }
    readonly List<Sample> trail=new List<Sample>(64); readonly List<double> gaps=new List<double>(2048);
    IntPtr handle; PetMotionBox[] ranges; PetMotionBox throwBox;
    double lastTick,grabX,grabY,originX,originY,dpi=1;
    double dragVx,dragVy; int lastX,lastY,generation;
    public string ClockMode {get;private set;}
    public PetMotionState State {get;private set;}
    public bool Dragging {get;private set;} public bool Flying {get;private set;}
    public string StopReason {get;private set;}
    public long FlightSerial {get;private set;}
    public long CompletedFlightSerial {get;private set;}
    public long DragSerial {get;private set;}
    public bool DragFlightEligible {get;private set;}
    public bool Moved {get;private set;} public bool Active {get{return Dragging||Flying;}}
    public DispatcherTimer Timer {get;private set;}
    public DispatcherTimer AnimationTimer {get;set;}
    bool resumeAnimation,pendingDrag;
    public event Action Stopped;
    public event Action GeometryChanged;
    public void UpdateRanges(PetMotionBox[] freeRanges){ranges=freeRanges;}
    public static bool IsDragDistance(double dx,double dy,double scale){
        double threshold=3*Math.Max(0.5,scale);return dx*dx+dy*dy>=threshold*threshold;
    }
    public long Frames {get;private set;} public long NativeMoves {get;private set;}
    public double LastStepMilliseconds {get;private set;}
    public double TotalStepMilliseconds {get;private set;}
    public double P95Gap {get{if(gaps.Count==0)return 0;var a=gaps.ToArray();Array.Sort(a);return a[(int)Math.Floor((a.Length-1)*0.95)];}}
    public double MaxGap {get{return gaps.Count==0?0:gaps.Max();}}
    public PetNativeMotion(Window target,UIElement character):this(target,character,null){}
    public PetNativeMotion(Window target,UIElement character,IPetMotionCursor source){
        cursor=source??new NativeCursor();
        State=new PetMotionState();window=target;girl=character;handle=new WindowInteropHelper(window).EnsureHandle();
        Timer=new DispatcherTimer(DispatcherPriority.Render,window.Dispatcher);Timer.Interval=TimeSpan.FromMilliseconds(8);
        // Compatibility surface for old callers; the motion clock below uses
        // one compositor cadence rather than competing Rendering/timer ticks.
        // High-frequency mouse moves never enter PowerShell or recompute layout.
        girl.PreviewMouseMove+=(s,e)=>{
            if(!Dragging)return;
            if(pendingDrag){var p=cursor.Read();double dx=p.X-grabX,dy=p.Y-grabY;if(IsDragDistance(dx,dy,dpi))StartClock();}
            e.Handled=true;
        };
        window.Closed+=(s,e)=>Stop();
    }
    void StartClock(){
        pendingDrag=false;
        gaps.Clear();Frames=0;NativeMoves=0;TotalStepMilliseconds=0;lastTick=clock.Elapsed.TotalSeconds;
        int token=Interlocked.Increment(ref generation);var dispatcher=window.Dispatcher;
        resumeAnimation=AnimationTimer!=null&&AnimationTimer.IsEnabled;
        if(resumeAnimation)AnimationTimer.Stop();
        ClockMode="dwm-vsync";
        // DwmFlush waits off the UI thread. Coalesce late frames instead of
        // accumulating timer work when the UI is busy or the machine sleeps.
        var worker=new Thread(()=>{
            int queued=0;
            while(token==Volatile.Read(ref generation)){
                int hr=DwmFlush();if(hr!=0)Thread.Sleep(16);
                if(token!=Volatile.Read(ref generation))break;
                if(Interlocked.CompareExchange(ref queued,1,0)!=0)continue;
                try{dispatcher.BeginInvoke(DispatcherPriority.Render,new Action(()=>{
                    Interlocked.Exchange(ref queued,0);
                    if(token==Volatile.Read(ref generation))Pulse();
                }));}catch(InvalidOperationException){break;}
            }
        });worker.IsBackground=true;worker.Name="Pet compositor motion";worker.Start();
    }
    public void BeginDrag(PetMotionBox[] freeRanges,double scale){
        BeginDrag(freeRanges,scale,false);
    }
    public void BeginDrag(PetMotionBox[] freeRanges,double scale,bool waitForMovement){
        Stop();dpi=Math.Max(0.5,scale);ranges=freeRanges;
        var p=cursor.Read();Rect r;if(!GetWindowRect(handle,out r))return;
        originX=r.Left;originY=r.Top;grabX=p.X;grabY=p.Y;lastX=r.Left;lastY=r.Top;
        State=new PetMotionState{X=r.Left,Y=r.Top};dragVx=dragVy=0;Moved=false;trail.Clear();DragSerial++;DragFlightEligible=false;
        trail.Add(new Sample(clock.Elapsed.TotalMilliseconds,p.X/dpi,p.Y/dpi));Dragging=true;StopReason=null;
        if(waitForMovement){pendingDrag=true;ClockMode="pointer-pending";}else StartClock();
    }
    void ReadPointer(double now,out double targetX,out double targetY){
        var p=cursor.Read();targetX=originX+p.X-grabX;targetY=originY+p.Y-grabY;
        if(IsDragDistance(p.X-grabX,p.Y-grabY,dpi))Moved=true;
        double x=p.X/dpi,y=p.Y/dpi;
        while(trail.Count>0&&now-trail[0].T>200)trail.RemoveAt(0);
        if(trail.Count==0||trail[trail.Count-1].X!=x||trail[trail.Count-1].Y!=y)trail.Add(new Sample(now,x,y));
        if(Moved&&!DragFlightEligible&&Estimate(trail.Select(s=>s.T).ToArray(),trail.Select(s=>s.X).ToArray(),trail.Select(s=>s.Y).ToArray(),now)!=null)DragFlightEligible=true;
    }
    public void EndDrag(PetMotionBox bounds){
        if(!Dragging)return;double x,y;ReadPointer(clock.Elapsed.TotalMilliseconds,out x,out y);Dragging=false;
        var velocity=Estimate(trail.Select(s=>s.T).ToArray(),trail.Select(s=>s.X).ToArray(),trail.Select(s=>s.Y).ToArray(),clock.Elapsed.TotalMilliseconds);
        if(Moved&&velocity!=null){State.Vx=velocity.Vx*dpi;State.Vy=velocity.Vy*dpi;throwBox=bounds;FlightSerial++;Flying=true;lastTick=clock.Elapsed.TotalSeconds;if(pendingDrag)StartClock();}
        else Stop("released");
    }
    public void Launch(double x,double y,double vx,double vy,PetMotionBox bounds,double scale){
        Stop();dpi=scale;State=new PetMotionState{X=x,Y=y,Vx=vx*scale,Vy=vy*scale};lastX=(int)Math.Round(x);lastY=(int)Math.Round(y);
        throwBox=bounds;FlightSerial++;Flying=true;StopReason=null;StartClock();
    }
    public void Pulse(){
        if(!Active)return;if(!window.IsVisible){Stop();return;}
        double currentDpi=GetDpiForWindow(handle)/96.0;
        if(currentDpi>0&&Math.Abs(currentDpi-dpi)>0.01){dpi=currentDpi;trail.Clear();if(GeometryChanged!=null)GeometryChanged();}
        double started=clock.Elapsed.TotalSeconds,dt=started-lastTick;if(dt<0.001)return;lastTick=started;
        if(dt>0.25){Stop();return;}
        if(gaps.Count<2048)gaps.Add(dt*1000);Frames++;
        bool rest=false;
        if(Dragging){
            double targetX,targetY;ReadPointer(started*1000,out targetX,out targetY);
            if(Moved){dt=Math.Min(dt,1.0/30);dragVx+=((targetX-State.X)*200-dragVx*30)*dt;dragVy+=((targetY-State.Y)*200-dragVy*30)*dt;
                State.X+=dragVx*dt;State.Y+=dragVy*dt;ConstrainDrag();}
        }else rest=Step(State,dt,throwBox,dpi);
        int px=(int)Math.Round(State.X),py=(int)Math.Round(State.Y);
        if(px!=lastX||py!=lastY){SetWindowPos(handle,IntPtr.Zero,px,py,0,0,0x15);lastX=px;lastY=py;NativeMoves++;}
        LastStepMilliseconds=(clock.Elapsed.TotalSeconds-started)*1000;
        TotalStepMilliseconds+=LastStepMilliseconds;
        if(rest)Stop("rested");
    }
    void ConstrainDrag(){
        if(ranges==null||ranges.Length==0)return;double best=double.PositiveInfinity,bx=State.X,by=State.Y;
        foreach(var b in ranges){double x=Math.Max(b.MinX,Math.Min(b.MaxX,State.X)),y=Math.Max(b.MinY,Math.Min(b.MaxY,State.Y));double d=(x-State.X)*(x-State.X)+(y-State.Y)*(y-State.Y);if(d<best){best=d;bx=x;by=y;}}
        if(bx!=State.X)dragVx=0;if(by!=State.Y)dragVy=0;State.X=bx;State.Y=by;
    }
    public void Stop(){Stop("interrupted");}
    void Stop(string reason){
        if(Flying && reason=="rested")CompletedFlightSerial=FlightSerial;
        StopReason=reason;
        bool active=Active&&!pendingDrag;pendingDrag=false;Dragging=Flying=false;Interlocked.Increment(ref generation);Timer.Stop();
        if(resumeAnimation&&AnimationTimer!=null)AnimationTimer.Start();resumeAnimation=false;
        dragVx=dragVy=0;State.Vx=State.Vy=0;if(active&&Stopped!=null)Stopped();
    }
    public static PetMotionVector Estimate(double[] t,double[] x,double[] y,double now){
        if(t.Length<2||now-t[t.Length-1]>150)return null;int first=0;while(first<t.Length&&now-t[first]>150)first++;
        int last=t.Length-1;if(last-first<1||t[last]-t[first]<20)return null;
        double vx=(x[last]-x[first])*1000/(t[last]-t[first]),vy=(y[last]-y[first])*1000/(t[last]-t[first]);double speed=Math.Sqrt(vx*vx+vy*vy);if(speed<0.000001)return null;
        var segments=new List<Sample>();int p=first;for(int i=first+1;i<=last;i++)if(t[i]-t[p]>=8){double dx=x[i]-x[p],dy=y[i]-y[p];segments.Add(new Sample(t[i],Math.Sqrt(dx*dx+dy*dy)*1000/(t[i]-t[p]),0));p=i;}
        double peak=segments.Count>0?segments.Max(s=>s.X):speed,accel=0;
        if(segments.Count>=2)accel=(segments[segments.Count-1].X-segments[0].X)/Math.Max((segments[segments.Count-1].T-segments[0].T)/1000,0.02);
        double before=(0.5*speed+0.5*peak)*(1+Math.Min(Math.Max(accel,0)/8000,1)*0.6),clamped=3600*(1-Math.Exp(-before/3600));
        return clamped<500?null:new PetMotionVector{Vx=vx/speed*clamped,Vy=vy/speed*clamped};
    }
    public static bool Step(PetMotionState s,double raw,PetMotionBox b,double dpi){
        double dt=Math.Min(Math.Max(raw,0),0.05);bool bounce=false;s.Vy+=1400*dpi*dt;s.X+=s.Vx*dt;s.Y+=s.Vy*dt;
        if(s.X<b.MinX){s.X=b.MinX;s.Vx=Math.Abs(s.Vx)*0.78;bounce=true;}else if(s.X>b.MaxX){s.X=b.MaxX;s.Vx=-Math.Abs(s.Vx)*0.78;bounce=true;}
        if(s.Y<b.MinY){s.Y=b.MinY;s.Vy=Math.Abs(s.Vy)*0.78;bounce=true;}else if(s.Y>=b.MaxY){s.Y=b.MaxY;s.Vx*=Math.Max(0,1-2.5*dt);s.Vy=Math.Abs(s.Vy)<40*dpi?0:-Math.Abs(s.Vy)*0.78;bounce=true;}
        return (s.Y>=b.MaxY-1&&Math.Abs(s.Vy)<dpi&&Math.Abs(s.Vx)<15*dpi)||(bounce&&Math.Sqrt(s.Vx*s.Vx+s.Vy*s.Vy)<40*dpi&&Math.Abs(s.Vy)<dpi);
    }
}
