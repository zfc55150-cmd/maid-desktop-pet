"""Build bounded per-source-frame alpha bit masks from existing control WebMs."""
from pathlib import Path
import json,subprocess,sys,hashlib
ROOT=Path(__file__).resolve().parents[3]
sys.path[:0]=[str(ROOT/'work/gpt-niang-animation/video-tools'),str(ROOT/'work/gpt-niang-animation/motion-tools')]
import numpy as np
out=Path(sys.argv[1]).resolve()
assert ROOT/'work' in out.parents
scenes=json.loads((out/'scenes.json').read_text(encoding='utf-8-sig'))
dest=out/'hit-masks';dest.mkdir(exist_ok=False)
ff=ROOT/'work/gpt-niang-animation/video-tools/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe'
entries={}
selected=set(sys.argv[2:])
for name,c in scenes['clips'].items():
 if selected and name not in selected:continue
 source=(out/c['file']).resolve()
 p=subprocess.Popen([str(ff),'-v','error','-c:v','libvpx-vp9','-i',str(source),'-f','rawvideo','-pix_fmt','rgba','pipe:1'],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 target=dest/(name+'.bin');count=0
 with target.open('wb') as stream:
  while True:
   raw=p.stdout.read(384*384*4)
   if not raw:break
   assert len(raw)==384*384*4
   a=np.frombuffer(raw,np.uint8).reshape(384,384,4)[:,:,3]
   stream.write(np.packbits((a>10).reshape(-1),bitorder='little').tobytes());count+=1
 assert p.wait(timeout=10)==0 and count==c['frames']
 entries[name]=dict(file='hit-masks/'+target.name,frames=count,bytes=target.stat().st_size,sha256=hashlib.sha256(target.read_bytes()).hexdigest(),videoSha256=hashlib.sha256(source.read_bytes()).hexdigest())
existing=json.loads((out/'hit-masks.json').read_text(encoding='utf-8-sig')) if selected and (out/'hit-masks.json').exists() else dict(size=384,threshold=10,source='decoded VP9 alpha',entries={})
existing['entries'].update(entries)
(out/'hit-masks.json').write_text(json.dumps(existing,indent=2)+'\n',encoding='utf-8')
print(json.dumps(dict(clips=len(entries),bytes=sum(e['bytes'] for e in entries.values()))))
