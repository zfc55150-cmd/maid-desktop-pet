using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Threading;
namespace PlaybackLab {
 // The official widget owns this same named mutex before showing its window.
 // A candidate must keep ownership on its UI thread until its window closes.
 public sealed class VisibilityLease:IDisposable {
  static readonly HashSet<string> localOwners=new HashSet<string>();
  Mutex mutex;string key;bool owned;
  public bool Owned{get{return owned;}}
  public static string Key(string installedRoot){return "Local\\GPTNiangUsage_"+Convert.ToBase64String(Encoding.UTF8.GetBytes(Path.GetFullPath(installedRoot))).Replace('/','_').Replace('+','-');}
  public VisibilityLease(string installedRoot){
   key=Key(installedRoot);
   lock(localOwners){
    if(localOwners.Contains(key))return;
    mutex=new Mutex(false,key);
    try{owned=mutex.WaitOne(0);}catch(AbandonedMutexException){owned=true;}
    if(owned)localOwners.Add(key);else{mutex.Dispose();mutex=null;}
   }
  }
  public void Dispose(){lock(localOwners){if(owned){mutex.ReleaseMutex();owned=false;localOwners.Remove(key);}if(mutex!=null){mutex.Dispose();mutex=null;}}}
 }
}
