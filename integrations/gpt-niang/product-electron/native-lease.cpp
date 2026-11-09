// Local experimental Node-API adapter. ABI declarations follow the public
// Node-API signatures: https://nodejs.org/api/n-api.html (N-API 3 subset).
// No file/process/network operations; only this process's named mutex handle.
#include <windows.h>
#include <stddef.h>
#include <vector>
#include <string>
#include <algorithm>
#include <cwctype>
#include <cmath>
#include <dwmapi.h>
typedef void* napi_env;typedef void* napi_value;typedef void* napi_callback_info;
typedef napi_value (__cdecl *napi_callback)(napi_env,napi_callback_info);
typedef int (__cdecl *GetInfo)(napi_env,napi_callback_info,size_t*,napi_value*,napi_value*,void**);
typedef int (__cdecl *GetString)(napi_env,napi_value,char16_t*,size_t,size_t*);
typedef int (__cdecl *GetBool)(napi_env,bool,napi_value*);
typedef int (__cdecl *CreateFunction)(napi_env,const char*,size_t,napi_callback,void*,napi_value*);
typedef int (__cdecl *SetProperty)(napi_env,napi_value,const char*,napi_value);
typedef int (__cdecl *AddCleanup)(napi_env,void(*)(void*),void*);
typedef int (__cdecl *ThrowError)(napi_env,const char*,const char*);
static GetInfo info;static GetString stringValue;static GetBool boolValue;
static CreateFunction functionValue;static SetProperty property;static AddCleanup cleanup;static ThrowError fail;
static void DropFollow();
static HANDLE mutexHandle=nullptr;static DWORD owner=0;
static FARPROC Find(const char* name){auto p=GetProcAddress(GetModuleHandleW(nullptr),name);if(!p){auto node=GetModuleHandleW(L"node.dll");if(node)p=GetProcAddress(node,name);}return p;}
static void Release(void*){DropFollow();if(mutexHandle){if(owner==GetCurrentThreadId())ReleaseMutex(mutexHandle);CloseHandle(mutexHandle);mutexHandle=nullptr;owner=0;}}
static napi_value Boolean(napi_env env,bool v){napi_value result=nullptr;boolValue(env,v,&result);return result;}
static napi_value Acquire(napi_env env,napi_callback_info call){
 if(mutexHandle)return Boolean(env,false);
 size_t count=1,length=0;napi_value name=nullptr;
 if(info(env,call,&count,&name,nullptr,nullptr)||count!=1||stringValue(env,name,nullptr,0,&length)||length<1||length>1024){fail(env,nullptr,"MUTEX_NAME");return nullptr;}
 std::vector<char16_t> buffer(length+1);
 if(stringValue(env,name,buffer.data(),buffer.size(),&length)){fail(env,nullptr,"MUTEX_NAME");return nullptr;}
 static_assert(sizeof(wchar_t)==sizeof(char16_t),"Windows UTF16 required");
 auto handle=CreateMutexW(nullptr,FALSE,reinterpret_cast<const wchar_t*>(buffer.data()));
 if(!handle){fail(env,nullptr,"MUTEX_CREATE");return nullptr;}
 DWORD result=WaitForSingleObject(handle,0);
 if(result==WAIT_OBJECT_0||result==WAIT_ABANDONED){mutexHandle=handle;owner=GetCurrentThreadId();return Boolean(env,true);}
 CloseHandle(handle);
 if(result!=WAIT_TIMEOUT){fail(env,nullptr,"MUTEX_WAIT");return nullptr;}
 return Boolean(env,false);
}
static napi_value Drop(napi_env env,napi_callback_info){if(mutexHandle&&owner!=GetCurrentThreadId()){fail(env,nullptr,"MUTEX_OWNER_THREAD");return nullptr;}Release(nullptr);return Boolean(env,true);}
static napi_value LeftDown(napi_env env,napi_callback_info){return Boolean(env,(GetAsyncKeyState(VK_LBUTTON)&0x8000)!=0);}

typedef int (__cdecl *CreateObject)(napi_env,napi_value*);
typedef int (__cdecl *CreateNumber)(napi_env,double,napi_value*);
typedef int (__cdecl *ReadNumber)(napi_env,napi_value,double*);
static CreateObject objectValue;static CreateNumber numberValue;static ReadNumber readNumber;
static HWND lastHost=nullptr,followWindow=nullptr,followHost=nullptr;
static HWINEVENTHOOK followHook=nullptr;static double followArgs[7]={};static long followMoves=0;
static bool IsHost(HWND h){
 if(!IsWindow(h)||!IsWindowVisible(h)||GetWindow(h,GW_OWNER))return false;
 wchar_t klass[128]={};GetClassNameW(h,klass,128);if(wcscmp(klass,L"Chrome_WidgetWin_1"))return false;
 DWORD pid=0;GetWindowThreadProcessId(h,&pid);HANDLE p=OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION,FALSE,pid);if(!p)return false;
 wchar_t file[32768];DWORD size=32768;bool ok=QueryFullProcessImageNameW(p,0,file,&size)!=0;CloseHandle(p);if(!ok)return false;
 std::wstring text(file,size);std::transform(text.begin(),text.end(),text.begin(),[](wchar_t c){return (wchar_t)towlower(c);});
 return text.find(L"\\openai.codex_")!=std::wstring::npos||text.find(L"\\openai\\codex\\")!=std::wstring::npos;
}
static BOOL CALLBACK FindHost(HWND h,LPARAM p){if(IsHost(h)&&!IsIconic(h)){*reinterpret_cast<HWND*>(p)=h;return FALSE;}return TRUE;}
static RECT Frame(HWND h){RECT r={};if(DwmGetWindowAttribute(h,DWMWA_EXTENDED_FRAME_BOUNDS,&r,sizeof(r))!=S_OK)GetWindowRect(h,&r);return r;}
static void MoveFollow(){if(!IsWindow(followWindow)||!IsWindow(followHost)||IsIconic(followHost)||!IsWindowVisible(followHost))return;
 RECT r=Frame(followHost);double width=followArgs[0],height=followArgs[1],left=followArgs[2],right=followArgs[3],bottom=followArgs[4];int anchor=(int)followArgs[5];
 int x=(int)std::lround(anchor==0?r.right-width-right:r.left+left),y=(int)std::lround(r.bottom-height-bottom);
 RECT old={};GetWindowRect(followWindow,&old);if(old.left==x&&old.top==y)return;
 SetWindowPos(followWindow,nullptr,x,y,0,0,SWP_NOSIZE|SWP_NOZORDER|SWP_NOACTIVATE);followMoves++;
}
static void CALLBACK FollowEvent(HWINEVENTHOOK,DWORD,HWND h,LONG object,LONG child,DWORD,DWORD){if(h==followHost&&object==OBJID_WINDOW&&child==0)MoveFollow();}
static void DropFollow(){if(followHook)UnhookWinEvent(followHook);followHook=nullptr;followWindow=followHost=nullptr;}
static void PutNumber(napi_env env,napi_value object,const char* key,double value){napi_value n=nullptr;numberValue(env,value,&n);property(env,object,key,n);}
static void PutBool(napi_env env,napi_value object,const char* key,bool value){property(env,object,key,Boolean(env,value));}
static napi_value HostFrame(napi_env env,napi_callback_info){
 HWND foreground=GetAncestor(GetForegroundWindow(),GA_ROOT);if(IsHost(foreground))lastHost=foreground;
 if(!IsHost(lastHost)){lastHost=nullptr;EnumWindows(FindHost,reinterpret_cast<LPARAM>(&lastHost));}
 napi_value result=nullptr;objectValue(env,&result);if(!lastHost){PutBool(env,result,"found",false);return result;}
 RECT r=Frame(lastHost);DWORD pid=0;GetWindowThreadProcessId(lastHost,&pid);PutBool(env,result,"found",true);PutBool(env,result,"visible",IsWindowVisible(lastHost)&&!IsIconic(lastHost));
 PutNumber(env,result,"handle",(double)reinterpret_cast<uintptr_t>(lastHost));PutNumber(env,result,"pid",pid);PutNumber(env,result,"x",r.left);PutNumber(env,result,"y",r.top);PutNumber(env,result,"width",r.right-r.left);PutNumber(env,result,"height",r.bottom-r.top);PutNumber(env,result,"dpi",GetDpiForWindow(lastHost));PutNumber(env,result,"followMoves",followMoves);return result;
}
static napi_value Follow(napi_env env,napi_callback_info call){
 size_t count=9;napi_value args[9];double values[9];if(info(env,call,&count,args,nullptr,nullptr)||count!=9){fail(env,nullptr,"FOLLOW_ARGUMENTS");return nullptr;}
 for(size_t i=0;i<count;i++)if(readNumber(env,args[i],&values[i])||!std::isfinite(values[i])){fail(env,nullptr,"FOLLOW_ARGUMENTS");return nullptr;}
 HWND widget=reinterpret_cast<HWND>((uintptr_t)values[0]),host=reinterpret_cast<HWND>((uintptr_t)values[1]);if(!IsWindow(widget)||!IsHost(host)){DropFollow();return Boolean(env,false);}
 if(widget!=followWindow||host!=followHost){DropFollow();followWindow=widget;followHost=host;followHook=SetWinEventHook(EVENT_OBJECT_LOCATIONCHANGE,EVENT_OBJECT_LOCATIONCHANGE,nullptr,FollowEvent,0,0,WINEVENT_OUTOFCONTEXT|WINEVENT_SKIPOWNPROCESS);}
 for(int i=0;i<7;i++)followArgs[i]=values[i+2];MoveFollow();return Boolean(env,followHook!=nullptr);
}
static napi_value Detach(napi_env env,napi_callback_info){DropFollow();return Boolean(env,true);}
static napi_value ForegroundPid(napi_env env,napi_callback_info){DWORD pid=0;GetWindowThreadProcessId(GetForegroundWindow(),&pid);napi_value result=nullptr;numberValue(env,(double)pid,&result);return result;}
static napi_value CaptureActive(napi_env env,napi_callback_info){
 HWND window=GetAncestor(GetForegroundWindow(),GA_ROOT);if(!window)return Boolean(env,false);
 DWORD pid=0;GetWindowThreadProcessId(window,&pid);
 static DWORD lastPid=0;static bool clippingHost=false,snippingTool=false;
 if(pid!=lastPid){
  lastPid=pid;clippingHost=snippingTool=false;
  HANDLE process=OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION,FALSE,pid);
  if(process){
   wchar_t file[32768]={};DWORD size=32768;
   if(QueryFullProcessImageNameW(process,0,file,&size)){
    const wchar_t* name=wcsrchr(file,L'\\');name=name?name+1:file;
    clippingHost=_wcsicmp(name,L"ScreenClippingHost.exe")==0;
    snippingTool=_wcsicmp(name,L"SnippingTool.exe")==0;
   }
   CloseHandle(process);
  }
 }
 // The Snipping Tool editor has a caption. Its selection overlay does not.
 return Boolean(env,clippingHost||(snippingTool&&(GetWindowLongPtrW(window,GWL_STYLE)&WS_CAPTION)!=WS_CAPTION));
}

extern "C" __declspec(dllexport) int node_api_module_get_api_version_v1(){return 3;}
extern "C" __declspec(dllexport) napi_value napi_register_module_v1(napi_env env,napi_value exports){
 info=reinterpret_cast<GetInfo>(Find("napi_get_cb_info"));stringValue=reinterpret_cast<GetString>(Find("napi_get_value_string_utf16"));boolValue=reinterpret_cast<GetBool>(Find("napi_get_boolean"));
 functionValue=reinterpret_cast<CreateFunction>(Find("napi_create_function"));property=reinterpret_cast<SetProperty>(Find("napi_set_named_property"));cleanup=reinterpret_cast<AddCleanup>(Find("napi_add_env_cleanup_hook"));fail=reinterpret_cast<ThrowError>(Find("napi_throw_error"));
 if(!info||!stringValue||!boolValue||!functionValue||!property||!cleanup||!fail)return exports;
 objectValue=reinterpret_cast<CreateObject>(Find("napi_create_object"));numberValue=reinterpret_cast<CreateNumber>(Find("napi_create_double"));readNumber=reinterpret_cast<ReadNumber>(Find("napi_get_value_double"));if(!objectValue||!numberValue||!readNumber)return exports;
 napi_value fn=nullptr;
 if(functionValue(env,"tryAcquire",10,Acquire,nullptr,&fn)||property(env,exports,"tryAcquire",fn))return exports;
 if(functionValue(env,"release",7,Drop,nullptr,&fn)||property(env,exports,"release",fn))return exports;
 if(functionValue(env,"leftDown",8,LeftDown,nullptr,&fn)||property(env,exports,"leftDown",fn))return exports;
 if(functionValue(env,"hostFrame",9,HostFrame,nullptr,&fn)||property(env,exports,"hostFrame",fn))return exports;
 if(functionValue(env,"follow",6,Follow,nullptr,&fn)||property(env,exports,"follow",fn))return exports;
 if(functionValue(env,"detach",6,Detach,nullptr,&fn)||property(env,exports,"detach",fn))return exports;
 if(functionValue(env,"foregroundPid",13,ForegroundPid,nullptr,&fn)||property(env,exports,"foregroundPid",fn))return exports;
 if(functionValue(env,"captureActive",13,CaptureActive,nullptr,&fn)||property(env,exports,"captureActive",fn))return exports;
 if(cleanup(env,Release,nullptr))return exports;
 return exports;
}
