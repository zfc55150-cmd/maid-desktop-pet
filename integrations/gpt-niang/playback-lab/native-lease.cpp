// Local experimental Node-API adapter. ABI declarations follow the public
// Node-API signatures: https://nodejs.org/api/n-api.html (N-API 3 subset).
// No file/process/network operations; only this process's named mutex handle.
#include <windows.h>
#include <stddef.h>
#include <vector>
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
static HANDLE mutexHandle=nullptr;static DWORD owner=0;
static FARPROC Find(const char* name){auto p=GetProcAddress(GetModuleHandleW(nullptr),name);if(!p){auto node=GetModuleHandleW(L"node.dll");if(node)p=GetProcAddress(node,name);}return p;}
static void Release(void*){if(mutexHandle){if(owner==GetCurrentThreadId())ReleaseMutex(mutexHandle);CloseHandle(mutexHandle);mutexHandle=nullptr;owner=0;}}
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
extern "C" __declspec(dllexport) int node_api_module_get_api_version_v1(){return 3;}
extern "C" __declspec(dllexport) napi_value napi_register_module_v1(napi_env env,napi_value exports){
 info=reinterpret_cast<GetInfo>(Find("napi_get_cb_info"));stringValue=reinterpret_cast<GetString>(Find("napi_get_value_string_utf16"));boolValue=reinterpret_cast<GetBool>(Find("napi_get_boolean"));
 functionValue=reinterpret_cast<CreateFunction>(Find("napi_create_function"));property=reinterpret_cast<SetProperty>(Find("napi_set_named_property"));cleanup=reinterpret_cast<AddCleanup>(Find("napi_add_env_cleanup_hook"));fail=reinterpret_cast<ThrowError>(Find("napi_throw_error"));
 if(!info||!stringValue||!boolValue||!functionValue||!property||!cleanup||!fail)return exports;
 napi_value fn=nullptr;
 if(functionValue(env,"tryAcquire",10,Acquire,nullptr,&fn)||property(env,exports,"tryAcquire",fn))return exports;
 if(functionValue(env,"release",7,Drop,nullptr,&fn)||property(env,exports,"release",fn))return exports;
 if(functionValue(env,"leftDown",8,LeftDown,nullptr,&fn)||property(env,exports,"leftDown",fn))return exports;
 if(cleanup(env,Release,nullptr))return exports;
 return exports;
}
