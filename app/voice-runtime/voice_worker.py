"""Offline, prewarmed Qwen speech, PCM streaming and interruptible reply queues."""
import ctypes, json, os, pathlib, queue, re, sys, threading, time
ROOT=pathlib.Path(os.environ.get('PET_VOICE_ROOT',pathlib.Path(__file__).resolve().parent))
os.environ.update(HF_HUB_OFFLINE='1',TRANSFORMERS_OFFLINE='1',HF_HUB_DISABLE_TELEMETRY='1',
 HF_HOME=str(ROOT/'cache'),NUMBA_CACHE_DIR=str(ROOT/'cache'/'numba'),TOKENIZERS_PARALLELISM='false',OMP_NUM_THREADS='4',OPENBLAS_NUM_THREADS='1')
PROTOCOL=sys.stdout
PROTOCOL_LOCK=threading.Lock()
sys.stdout=sys.stderr
if os.environ.get('PET_SPEECH_DEBUG')=='1':
 import faulthandler
 faulthandler.enable();faulthandler.dump_traceback_later(45,repeat=True)
 print('Voice test process initialized.',file=sys.stderr,flush=True)
def emit(value):
 with PROTOCOL_LOCK:
  PROTOCOL.write(json.dumps(value,ensure_ascii=True)+'\n');PROTOCOL.flush()
def guard_parent():
 parent=int(os.environ.get('PET_SPEECH_PARENT','0'))
 if not parent:return
 kernel=ctypes.WinDLL('kernel32',use_last_error=True)
 kernel.OpenProcess.argtypes=[ctypes.c_ulong,ctypes.c_bool,ctypes.c_ulong];kernel.OpenProcess.restype=ctypes.c_void_p
 kernel.WaitForMultipleObjects.argtypes=[ctypes.c_ulong,ctypes.POINTER(ctypes.c_void_p),ctypes.c_bool,ctypes.c_ulong]
 handles=[kernel.OpenProcess(0x100000,False,pid) for pid in {parent,os.getppid()}]
 if not all(handles):os._exit(0)
 kernel.WaitForMultipleObjects(len(handles),(ctypes.c_void_p*len(handles))(*handles),False,0xFFFFFFFF)
 os._exit(0)
class Cancelled(Exception):pass
def chunks(text):
 text=re.sub(r'```[\s\S]*?```','代码请看文字。',text)
 text=re.sub(r'\[([^\]]+)\]\([^\)]+\)',r'\1',text)
 text=re.sub(r'https?://\S+','链接请看文字。',text)
 text=re.sub(r'[*#`_>]', '', text)
 text=re.sub(r'\s+',' ',text).strip()
 return [text[i:i+70] for i in range(0,len(text),70) if text[i:i+70].strip()]
class Engine:
 def __init__(self):
  import torch, soundfile as sf, numpy as np
  from qwen_tts import Qwen3TTSModel
  from fast_predictor import FastPredictor
  self.torch,self.np=torch,np
  torch.set_num_threads(1);torch.set_num_interop_threads(1)
  if not torch.cuda.is_available():raise RuntimeError('NO_GPU')
  if torch.cuda.mem_get_info()[0]<5*1024**3:raise RuntimeError('GPU_BUSY')
  self.design=os.environ.get('PET_VOICE_MODEL')=='design'
  self.instruct=os.environ.get('PET_VOICE_INSTRUCT','')
  self.model=Qwen3TTSModel.from_pretrained(str(ROOT/('model-design' if self.design else 'model')),device_map='cuda:0',dtype=torch.bfloat16,
   attn_implementation='sdpa',local_files_only=True)
  self.prompt=None
  if not self.design:
   reference,rate=sf.read(ROOT/'reference.wav',dtype='float32')
   self.prompt=self.model.create_voice_clone_prompt(ref_audio=(reference,rate),
    ref_text='你回来啦！今天过得怎么样？累了就歇一会儿吧，我会在这里陪着你。',x_vector_only_mode=False)
  predictor=self.model.model.talker.code_predictor
  predictor.generate=FastPredictor(predictor,use_graph=True)
 def stream(self,text,publish,cancel):
  torch=self.torch;model=self.model;frames=[];emitted=0
  refcode=None if self.design else self.prompt[0].ref_code.to(model.device)
  refcount=0 if refcode is None else len(refcode)
  def hook(module,inputs,output):
   nonlocal emitted
   if cancel():raise Cancelled()
   codes=output.hidden_states[-1]
   if codes is None:return
   frames.append(codes.detach().clone())
   if len(frames)%12:return
   newcodes=torch.cat(frames,dim=0)
   allcodes=newcodes if refcode is None else torch.cat([refcode,newcodes],dim=0)
   waves,rate=model.model.speech_tokenizer.decode([{'audio_codes':allcodes}])
   frame_samples=len(waves[0])//len(allcodes)
   current=waves[0][refcount*frame_samples:]
   safe_end=(len(frames)-2)*frame_samples
   if safe_end>emitted:
    if cancel():raise Cancelled()
    publish(current[emitted:safe_end]);emitted=safe_end
  h=model.model.talker.register_forward_hook(hook)
  try:
   with torch.inference_mode():
    if self.design:
     torch.manual_seed(1234)
     waves,rate=model.generate_voice_design(text=text,language='Chinese',instruct=self.instruct,
      non_streaming_mode=True,max_new_tokens=512)
    else:
     torch.manual_seed(1234)
     waves,rate=model.generate_voice_clone(text=text,language='Chinese',voice_clone_prompt=self.prompt,
      non_streaming_mode=True,max_new_tokens=512)
   if cancel():raise Cancelled()
   if len(waves[0])>emitted:publish(waves[0][emitted:])
  finally:h.remove()
def main():
 threading.Thread(target=guard_parent,daemon=True).start()
 import torch, soundfile
 from qwen_tts import Qwen3TTSModel
 commands=queue.Queue();cancelled=set()
 def read():
  for line in sys.stdin:
   try:
    r=json.loads(line);kind=r.get('type');ident=r.get('id')
    if kind not in ('warmup','begin','append','end','cancel'):continue
    if kind!='warmup' and not isinstance(ident,int):continue
    if kind=='append' and (not isinstance(r.get('text'),str) or len(r['text'])>12000):continue
    if kind=='append' and r.get('caption') is not None and (not isinstance(r['caption'],str) or len(r['caption'])>40000):continue
    if kind=='cancel':cancelled.add(ident)
    commands.put(r)
   except (ValueError,TypeError):continue
  os._exit(0)
 threading.Thread(target=read,daemon=True).start()
 engine=None;job=None
 def close_job():
  nonlocal job
  if job and job['audio']:job['audio'].close(cancel=lambda:job['id'] in cancelled)
  job=None
 while True:
  r=commands.get();kind=r['type'];ident=r.get('id')
  try:
   if kind=='cancel':
    if job and job['id']==ident:close_job()
    if len(cancelled)>128:cancelled.intersection_update(sorted(cancelled)[-64:])
    continue
   if ident in cancelled:continue
   if engine is None:
    emit({'event':'loading'})
    engine=Engine();emit({'event':'ready'})
   if kind=='warmup':emit({'event':'ready'});continue
   if kind=='begin':
    close_job();job={'id':ident,'audio':None,'played':False};continue
   if not job or job['id']!=ident:continue
   if kind=='append':
    caption=r.get('caption');marked=False
    def publish(wave):
     nonlocal marked
     if ident in cancelled:raise Cancelled()
     if job['audio'] is None:
      from wave_queue import PCMQueue
      job['audio']=PCMQueue()
     pcm=(engine.np.clip(wave,-1,1)*32767).astype('<i2').tobytes()
     callback=None
     if not marked and caption is not None:
      marked=True
      def callback(ident=ident,caption=caption):
       if ident not in cancelled:emit({'id':ident,'event':'caption','text':caption})
     job['audio'].write(pcm,on_start=callback)
     if not job['played']:job['played']=True;emit({'id':ident,'event':'playing'})
    for part in chunks(r['text']):
     engine.stream(part,publish,lambda:ident in cancelled)
   elif kind=='end':
    close_job();emit({'id':ident,'event':'done'})
  except Cancelled:close_job()
  except Exception as exc:
   if ident is not None:cancelled.add(ident)
   try:close_job()
   except Exception:pass
   code='GPU_BUSY' if 'GPU_BUSY' in str(exc) or 'out of memory' in str(exc).lower() else 'NO_GPU' if 'NO_GPU' in str(exc) else 'VOICE_ERROR'
   emit({'id':ident,'event':'error','code':code})
   print(type(exc).__name__+': '+code,file=sys.stderr,flush=True)
   if os.environ.get('PET_SPEECH_DEBUG')=='1':
    import traceback
    traceback.print_exc()
   if engine is None:return
if __name__=='__main__':main()
