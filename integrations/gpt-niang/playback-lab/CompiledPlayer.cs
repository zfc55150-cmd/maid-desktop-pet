// Candidate only. No settings, windows, process control, networking or production writes.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Controls;
using System.Windows.Media.Imaging;
using System.Windows.Threading;

namespace PlaybackLab {
 public sealed class Page {
  public string File,Hash; public int Rows,Start,Count;
 }
 public sealed class Clip {
  public string Name; public int Frames,Cell,Fps;public bool Loop;
  public double Scale=1,OffsetX,OffsetY; public Page[] Pages;
 }
 sealed class Entry {public BitmapSource Image;public long Bytes;public long Use;}
 public sealed class PageCache {
  readonly object gate=new object();readonly Dictionary<string,Entry> pages=new Dictionary<string,Entry>();
  readonly Dictionary<string,Task<BitmapSource>> pending=new Dictionary<string,Task<BitmapSource>>();
  readonly SemaphoreSlim decoder=new SemaphoreSlim(1,1);readonly long budget;long serial,bytes;
  public long PeakBytes{get;private set;}public int Evictions{get;private set;}
  public int Loads{get;private set;}public int Pending{get{lock(gate)return pending.Count;}}
  public long Bytes{get{lock(gate)return bytes;}}
  public PageCache(long maxBytes){if(maxBytes<36L*1024*1024)throw new ArgumentOutOfRangeException("maxBytes");budget=maxBytes;}
  string Key(Clip c,int n){return c.Name+":"+n;}
  public BitmapSource Peek(Clip c,int n){lock(gate){Entry e;if(!pages.TryGetValue(Key(c,n),out e))return null;e.Use=++serial;return e.Image;}}
  public Task<BitmapSource> Request(Clip c,int n){
   if(n<0||n>=c.Pages.Length)throw new ArgumentOutOfRangeException("n");
   lock(gate){
    string key=Key(c,n);Entry e;Task<BitmapSource> existing;
    if(pages.TryGetValue(key,out e)){e.Use=++serial;return Task.FromResult(e.Image);}
    if(pending.TryGetValue(key,out existing))return existing;
    if(pending.Count>=2)return Task.FromResult<BitmapSource>(null);
    // Register before scheduling: completion cannot race dictionary insertion.
    var completion=new TaskCompletionSource<BitmapSource>();pending.Add(key,completion.Task);
    Task.Run(async ()=>{
     try{
      await decoder.WaitAsync().ConfigureAwait(false);BitmapSource image;
      try{Page p=c.Pages[n];image=await DragonMotionDecoder.LoadAsync(p.File,c.Cell,p.Rows,p.Hash,c.Scale,c.OffsetX,c.OffsetY).ConfigureAwait(false);}
      finally{decoder.Release();}
      long size=(long)image.PixelWidth*image.PixelHeight*4;
      if(size>budget)throw new InvalidOperationException("PAGE_EXCEEDS_BUDGET");
      lock(gate){
       while(bytes+size>budget&&pages.Count>0){string oldest=null;long age=long.MaxValue;foreach(var pair in pages)if(pair.Value.Use<age){oldest=pair.Key;age=pair.Value.Use;}bytes-=pages[oldest].Bytes;pages.Remove(oldest);Evictions++;}
       pages[key]=new Entry{Image=image,Bytes=size,Use=++serial};bytes+=size;PeakBytes=Math.Max(PeakBytes,bytes);Loads++;pending.Remove(key);
      }
      completion.SetResult(image);
     }catch(Exception error){lock(gate)pending.Remove(key);completion.SetException(error);}
    });
    return completion.Task;
   }
  }
 }
 public sealed class PlaybackPlan {
  public double Speed=1;public bool Takeoff;
  public double MediaMs(double age,int fps){return Takeoff?(age<1200?age*(66000.0/fps/1200):66000.0/fps+(age-1200)*1.25):age*Speed;}
  public double Duration(int frames,int fps){return Takeoff?1200+Math.Max(0,frames-66)*1000.0/fps/1.25:frames*1000.0/fps/Speed;}
  public int Frame(double age,Clip clip){return Player.FrameAt(MediaMs(age,clip.Fps),clip.Fps,clip.Frames,clip.Loop,1);}
 }
 public sealed class Step {public Clip Clip;public PlaybackPlan Plan=new PlaybackPlan();public int FadeMs;}
 public sealed class Submission {public string Clip;public int Frame;public double AtMs;public bool Blending;public int Generation;}
 public sealed class Player:IDisposable {
  readonly Image image;readonly DispatcherTimer timer;readonly Stopwatch clock=new Stopwatch();readonly PageCache cache;
  Clip clip;int generation,activeGeneration,last=-1;bool disposed,ended;PlaybackPlan plan;double submittedAt;
  Step[] steps;int stepIndex;BitmapSource previous,nativeFrame;int fadeMs;
  readonly Stopwatch session=Stopwatch.StartNew();
  readonly List<Submission> trace=new List<Submission>();
  public Submission[] Trace{get{return trace.ToArray();}}
  public bool Ended{get{return ended;}}public bool Blending{get{return previous!=null;}}
  public int Submitted{get;private set;}public int Misses{get;private set;}public int Skipped{get;private set;}
  public string Error{get;private set;}public int Frame{get{return last;}}public string ClipName{get{return clip==null?null:clip.Name;}}
  public Player(Image target,PageCache pages){image=target;cache=pages;timer=new DispatcherTimer(DispatcherPriority.Render,target.Dispatcher);timer.Interval=TimeSpan.FromMilliseconds(1000.0/60);timer.Tick+=(s,e)=>Pulse();}
  public Task<bool> Play(Clip next,double playbackRate){return PlaySequence(new Step[]{new Step{Clip=next,Plan=new PlaybackPlan{Speed=playbackRate}}});}
  public Task<bool> PlaySequence(Step[] requested){
   image.Dispatcher.VerifyAccess();if(disposed)throw new ObjectDisposedException("Player");
   if(requested==null||requested.Length==0)throw new ArgumentException("EMPTY_SEQUENCE");
   // Snapshot public input; caller mutation cannot rewrite an in-flight request.
   Step[] snapshot=new Step[requested.Length];
   for(int i=0;i<requested.Length;i++){
    Step s=requested[i];if(s==null||s.Clip==null||s.Plan==null||s.Clip.Fps<=0||s.Clip.Frames<=0||s.FadeMs<0||s.FadeMs>1000||s.Plan.Speed<=0||Double.IsNaN(s.Plan.Speed)||Double.IsInfinity(s.Plan.Speed)||(s.Plan.Takeoff&&s.Clip.Frames<=66))throw new ArgumentException("CLIP_TIMELINE");
    if(s.Clip.Loop&&i<requested.Length-1)throw new ArgumentException("LOOP_CANNOT_AUTO_RETURN");
    Clip c=s.Clip;var pages=new Page[c.Pages.Length];
    for(int j=0;j<pages.Length;j++){Page p=c.Pages[j];pages[j]=new Page{File=p.File,Hash=p.Hash,Rows=p.Rows,Start=p.Start,Count=p.Count};}
    snapshot[i]=new Step{Clip=new Clip{Name=c.Name,Frames=c.Frames,Cell=c.Cell,Fps=c.Fps,Loop=c.Loop,Scale=c.Scale,OffsetX=c.OffsetX,OffsetY=c.OffsetY,Pages=pages},FadeMs=s.FadeMs,Plan=new PlaybackPlan{Speed=s.Plan.Speed,Takeoff=s.Plan.Takeoff}};
   }
   int token=++generation;return Switch(snapshot,0,token);
  }
  async Task<bool> Switch(Step[] requested,int index,int token){
   Clip next=requested[index].Clip;BitmapSource first=null;Exception failure=null;
   try{
    var waiting=Stopwatch.StartNew();
    do{
     if(Volatile.Read(ref generation)!=token)return false;
     first=await cache.Request(next,0).ConfigureAwait(false);
     if(first==null)await Task.Delay(10).ConfigureAwait(false);
    }while(first==null&&waiting.ElapsedMilliseconds<5000);
   }catch(Exception e){failure=e;}
   // PowerShell's STA does not guarantee a DispatcherSynchronizationContext.
   // Explicitly marshal commit, including its generation check, to the image owner.
   return await image.Dispatcher.InvokeAsync(new Func<bool>(()=>{
    if(disposed||token!=generation)return false;
    if(failure!=null){Error=failure.GetType().Name;return false;}
    if(first==null)return false;
    // The outgoing image remains owned and visible until this commit.
    previous=requested[index].FadeMs>0&&image.Source!=null?DragonMotionDecoder.Detach((BitmapSource)image.Source):null;
    steps=requested;stepIndex=index;clip=next;plan=requested[index].Plan;fadeMs=requested[index].FadeMs;activeGeneration=token;
    last=-1;ended=false;Error=null;clock.Restart();Submit(first,0);Blend();timer.Start();return true;
   })).Task.ConfigureAwait(false);
  }
  void Submit(BitmapSource atlas,int frame){nativeFrame=DragonMotionDecoder.Crop(atlas,clip.Cell,frame-clip.Pages[frame/64].Start);image.Source=nativeFrame;last=frame;submittedAt=clock.Elapsed.TotalMilliseconds;Submitted++;
   if(trace.Count<16384)trace.Add(new Submission{Clip=clip.Name,Frame=frame,AtMs=session.Elapsed.TotalMilliseconds,Blending=previous!=null,Generation=activeGeneration});
  }
  void Blend(){if(previous==null)return;double progress=clock.Elapsed.TotalMilliseconds/fadeMs;if(progress>=1){previous=null;image.Source=nativeFrame;}else image.Source=DragonMotionDecoder.Blend(previous,nativeFrame,progress);}
  public void Pulse(){
   image.Dispatcher.VerifyAccess();if(disposed||clip==null)return;
   double age=clock.Elapsed.TotalMilliseconds;int wanted=plan.Frame(age,clip);
   int page=wanted/64;BitmapSource atlas=cache.Peek(clip,page);
   if(atlas==null){Misses++;Observe(cache.Request(clip,page));Blend();return;}
   if(wanted!=last){if(last>=0&&wanted>last+1)Skipped+=wanted-last-1;Submit(atlas,wanted);}
   if(clip.Pages[page].Start+clip.Pages[page].Count-wanted<18){int next=page+1;if(next<clip.Pages.Length)Observe(cache.Request(clip,next));else if(clip.Loop)Observe(cache.Request(clip,0));}
   Blend();
   if(stepIndex+1<steps.Length&&plan.Duration(clip.Frames,clip.Fps)-age<700)Observe(cache.Request(steps[stepIndex+1].Clip,0));
   // A final source frame is submitted before starting the next clip. It must
   // occupy at least its native duration, not just a property write in this tick.
   double finalFrameMs=1000.0/clip.Fps/(plan.Takeoff?1.25:plan.Speed);
   if(!clip.Loop&&wanted==clip.Frames-1&&age>=plan.Duration(clip.Frames,clip.Fps)&&age>=submittedAt+finalFrameMs&&!ended){
    ended=true;timer.Stop();
    if(activeGeneration==generation&&stepIndex+1<steps.Length)ObserveSwitch(Switch(steps,stepIndex+1,activeGeneration));
   }
  }
  void ObserveSwitch(Task<bool> task){task.ContinueWith(t=>{var observed=t.Exception;},TaskContinuationOptions.OnlyOnFaulted);}
  static void Observe(Task<BitmapSource> task){task.ContinueWith(t=>{var observed=t.Exception;},TaskContinuationOptions.OnlyOnFaulted);}
  public static int FrameAt(double ms,int fps,int frames,bool loop,double speed){if(ms<0||Double.IsNaN(ms)||Double.IsInfinity(ms)||fps<=0||frames<=0||speed<=0||Double.IsNaN(speed)||Double.IsInfinity(speed))throw new ArgumentException("TIMELINE");double n=Math.Floor(ms*fps*speed/1000);return loop?(int)(n%frames):(int)Math.Min(frames-1,n);}
  public void Interrupt(){image.Dispatcher.VerifyAccess();generation++;timer.Stop();clock.Stop();steps=null;clip=null;previous=null;ended=true;}
  public void Dispose(){image.Dispatcher.VerifyAccess();Interrupt();disposed=true;nativeFrame=null;image.Source=null;}
 }
}
