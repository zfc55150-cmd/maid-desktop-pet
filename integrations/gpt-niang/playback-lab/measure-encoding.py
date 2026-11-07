"""Offline encoding error control. Does not rate artistic quality or run a pet."""
from pathlib import Path
import hashlib,json,subprocess,sys
ROOT=Path(__file__).resolve().parents[3]
sys.path[:0]=[str(ROOT/'work/gpt-niang-animation/video-tools'),str(ROOT/'work/gpt-niang-animation/motion-tools')]
from PIL import Image
import numpy as np

def main(out):
 out=Path(out).resolve()
 if ROOT/'work' not in out.parents:raise ValueError('Output outside workspace work')
 load=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
 b=load(out/'baseline.json');m=load(out/'animation.json');control=load(out/'encoding-control.json')
 assert 'frontidle' not in m.get('clipPresentation',{}),'Calibrated reference must be exported by the decoder'
 ff=ROOT/'work/gpt-niang-animation/video-tools/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe'
 proc=subprocess.Popen([str(ff),'-v','error','-c:v','libvpx-vp9','-i',str(out/'frontidle-control.webm'),'-f','rawvideo','-pix_fmt','rgba','pipe:1'],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 count=0;rgb_error=0;alpha_error=0;max_alpha=0;composite_error=0;transparent=0
 for page in m['states']['frontidle']['pages']:
  source=Path(b['gptRoot'])/'assets/dragon-animation/motion-v1'/page['file']
  assert hashlib.sha256(source.read_bytes()).hexdigest()==page['sha256']
  with Image.open(source) as atlas:
   atlas=atlas.convert('RGBA')
   for n in range(page['count']):
    ref=np.array(atlas.crop((n%8*384,n//8*384,(n%8+1)*384,(n//8+1)*384)))
    # Encoder accepted BGRA; prove this is precisely the encoding reference.
    assert hashlib.sha256(ref[:,:,[2,1,0,3]].tobytes()).hexdigest()==control['inputFrameSha256'][count]
    raw=proc.stdout.read(384*384*4);assert len(raw)==384*384*4
    dec=np.frombuffer(raw,np.uint8).reshape(384,384,4)
    delta=np.abs(ref.astype(np.int16)-dec.astype(np.int16));alpha_error+=int(delta[:,:,3].sum());max_alpha=max(max_alpha,int(delta[:,:,3].max()))
    rgb_error+=int(delta[:,:,:3].sum());transparent+=int(np.count_nonzero(dec[:,:,3]==0))
    for bg in (0,255):
     ra=ref[:,:,3:4].astype(np.float32)/255;da=dec[:,:,3:4].astype(np.float32)/255
     composite_error+=float(np.abs(ref[:,:,:3]*ra+bg*(1-ra)-dec[:,:,:3]*da-bg*(1-da)).sum())
    count+=1
 assert not proc.stdout.read(1),'Unexpected extra frame';assert proc.wait(timeout=10)==0
 pixels=count*384*384
 result=dict(frames=count,decodedTransparencyVerified=transparent>0,alphaMeanAbsoluteError=alpha_error/pixels,alphaMaxError=max_alpha,rgbMeanAbsoluteErrorIncludingTransparent=rgb_error/(pixels*3),blackWhiteCompositeMeanAbsoluteError=composite_error/(pixels*3*2),scale='0..255',screenPresentationVerified=False,artworkAccepted=False)
 (out/'encoding-error.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8');print(json.dumps(result))

if __name__=='__main__':main(sys.argv[1])
