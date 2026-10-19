"""Continuous Windows PCM output, no per-chunk device restart."""
import ctypes as c
from ctypes import wintypes as w
import time
import threading
from collections import deque

class Format(c.Structure):
    _fields_=[('tag',w.WORD),('channels',w.WORD),('rate',w.DWORD),('bytes_sec',w.DWORD),
              ('align',w.WORD),('bits',w.WORD),('extra',w.WORD)]
class Header(c.Structure):
    _fields_=[('data',c.c_void_p),('length',w.DWORD),('recorded',w.DWORD),('user',c.c_size_t),
              ('flags',w.DWORD),('loops',w.DWORD),('next',c.c_void_p),('reserved',c.c_size_t)]

class PCMQueue:
    # WHDR_DONE is a driver queue marker, not an acoustic playback marker.
    # Drain a silent tail before closing so device/mixer latency cannot eat
    # the final phoneme. This is once per reply, never between streamed chunks.
    TAIL_SECONDS = .4
    def __init__(self,rate=24000):
        self.dll=c.WinDLL('winmm')
        self.handle=c.c_void_p()
        self.dll.waveOutOpen.argtypes=[c.POINTER(c.c_void_p),w.UINT,c.POINTER(Format),c.c_size_t,c.c_size_t,w.DWORD]
        for name in ('waveOutPrepareHeader','waveOutWrite','waveOutUnprepareHeader'):
            getattr(self.dll,name).argtypes=[c.c_void_p,c.POINTER(Header),w.UINT]
        self.dll.waveOutReset.argtypes=[c.c_void_p]
        self.dll.waveOutClose.argtypes=[c.c_void_p]
        self.buffers=[]
        self.rate=rate
        self.closed=False
        self.markers=deque();self.marker_lock=threading.Lock();self.stop_markers=threading.Event()
        fmt=Format(1,1,rate,rate*2,2,16,0)
        self.check(self.dll.waveOutOpen(c.byref(self.handle),0xFFFFFFFF,c.byref(fmt),0,0,0))
        self.marker_thread=threading.Thread(target=self.watch_markers,daemon=True)
        self.marker_thread.start()
    def check(self,result):
        if result: raise RuntimeError('waveOut error '+str(result))
    def watch_markers(self):
        while not self.stop_markers.wait(.01):
            self.dispatch_markers()
    def dispatch_markers(self):
        with self.marker_lock:
            while self.markers and not self.stop_markers.is_set():
                previous,callback=self.markers[0]
                if previous is not None and not previous.flags&1:break
                self.markers.popleft();callback()
    def write(self,pcm,on_start=None):
        previous=self.buffers[-1][0] if self.buffers else None
        data=c.create_string_buffer(pcm)
        header=Header(c.cast(data,c.c_void_p),len(pcm),0,0,0,0,None,0)
        self.check(self.dll.waveOutPrepareHeader(self.handle,c.byref(header),c.sizeof(header)))
        self.buffers.append((header,data))
        self.check(self.dll.waveOutWrite(self.handle,c.byref(header),c.sizeof(header)))
        if on_start:
            with self.marker_lock:self.markers.append((previous,on_start))
    def done(self):
        return all(h.flags&1 for h,b in self.buffers)
    def close(self,timeout=180,cancel=None):
        if self.closed:return
        limit=time.perf_counter()+timeout
        if self.buffers and not (cancel and cancel()):
            self.write(bytes(round(self.rate*self.TAIL_SECONDS)*2))
        while not self.done() and time.perf_counter()<limit:
            if cancel and cancel(): break
            time.sleep(.01)
        if self.done() and not (cancel and cancel()):self.dispatch_markers()
        self.stop_markers.set();self.marker_thread.join()
        if not self.done(): self.dll.waveOutReset(self.handle)
        for h,b in self.buffers:
            self.check(self.dll.waveOutUnprepareHeader(self.handle,c.byref(h),c.sizeof(h)))
        self.check(self.dll.waveOutClose(self.handle))
        self.closed=True
