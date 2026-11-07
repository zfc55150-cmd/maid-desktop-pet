"""Decode local conversions and generate exact alpha masks, without encoding."""
from pathlib import Path
import hashlib,json,subprocess,sys
ROOT=Path(__file__).resolve().parents[3]
sys.path[:0]=[str(ROOT/'work/gpt-niang-animation/video-tools'),str(ROOT/'work/gpt-niang-animation/motion-tools')]
import numpy as np

def verify(root,names):
 root=Path(root).resolve()
 if ROOT/'work' not in root.parents:raise ValueError('WORK_SCOPE')
 load=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
 manifest=load(root/'animation.json');ff=ROOT/'work/gpt-niang-animation/video-tools/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe'
 output=root/'hit-masks';output.mkdir(exist_ok=True);results=[]
 for name in names:
  receipt=load(root/'media'/(name+'.encoding.json'));file=root/'media'/(name+'.webm');assert hashlib.sha256(file.read_bytes()).hexdigest()==receipt['fileSha256'];s=manifest['states'][name]
  assert receipt['frames']==s['frames'] and len(receipt['inputFrameSha256'])==s['frames'] and receipt['fps']==(s.get('fps') or manifest['fps'])
  target=output/(name+'.bin')
  if target.exists():raise ValueError('EXISTING_VERIFICATION:'+name)
  proc=subprocess.Popen([str(ff),'-v','error','-c:v','libvpx-vp9','-i',str(file),'-f','rawvideo','-pix_fmt','rgba','pipe:1'],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
  frames=0;minimum=384*384;transparent=0
  with target.open('wb') as stream:
   while True:
    raw=proc.stdout.read(384*384*4)
    if not raw:break
    assert len(raw)==384*384*4
    alpha=np.frombuffer(raw,np.uint8).reshape(384,384,4)[:,:,3];visible=alpha>10;minimum=min(minimum,int(visible.sum()));transparent+=int(np.count_nonzero(alpha==0));stream.write(np.packbits(visible.reshape(-1),bitorder='little').tobytes());frames+=1
  assert proc.wait(timeout=10)==0 and frames==s['frames'] and minimum>100 and transparent>0
  result=dict(clip=name,frames=frames,fps=receipt['fps'],minimumVisiblePixels=minimum,decodedTransparency=True,sha256=receipt['fileSha256'],hitMaskSha256=hashlib.sha256(target.read_bytes()).hexdigest(),hitMaskBytes=target.stat().st_size,screenPresentationVerified=False,artworkApproved=False)
  (root/'media'/(name+'.verification.json')).write_text(json.dumps(result,indent=2),encoding='utf-8');results.append(result)
 print(json.dumps(results))
if __name__=='__main__':verify(sys.argv[1],sys.argv[2:])
