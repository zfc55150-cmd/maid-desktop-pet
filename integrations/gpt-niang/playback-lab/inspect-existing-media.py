"""Read-only source/video attribution. Decode existing media; never encode it."""
from pathlib import Path
import hashlib,json,subprocess,sys
ROOT=Path(__file__).resolve().parents[3]
sys.path[:0]=[str(ROOT/'work/gpt-niang-animation/video-tools'),str(ROOT/'work/gpt-niang-animation/motion-tools')]
import numpy as np
from PIL import Image,ImageDraw
from scipy import ndimage

def main(output):
 out=Path(output).resolve()
 if ROOT/'work' not in out.parents:raise ValueError('WORK_SCOPE')
 load=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
 baseline=load(out/'baseline.json');animation=load(out/'animation.json');scenes=load(out/'scenes.json');hits=load(out/'hit-masks.json')
 ff=ROOT/'work/gpt-niang-animation/video-tools/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe'
 report={'newEncoding':False,'paidCalls':0,'screenPresentationVerified':False,'artworkAccepted':False,'clips':{}}
 for clip in ['frontidle','fanmishap','lanterninvite']:
  assert clip not in animation.get('clipPresentation',{}),'Use owning decoder for transformed reference'
  file=(out/scenes['clips'][clip]['file']).resolve();control=load(file.with_name('encoding-control.json' if clip=='frontidle' else clip+'-encoding.json'))
  assert hashlib.sha256(file.read_bytes()).hexdigest()==control['fileSha256']
  packed=np.frombuffer((out/hits['entries'][clip]['file']).read_bytes(),np.uint8)
  mask=np.unpackbits(packed,bitorder='little').reshape(-1,384,384).astype(bool)
  proc=subprocess.Popen([str(ff),'-v','error','-c:v','libvpx-vp9','-i',str(file),'-f','rawvideo','-pix_fmt','rgba','pipe:1'],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
  sheet=Image.new('RGB',(384*2,416*5),'#30343a');draw=ImageDraw.Draw(sheet)
  count=0;alpha_sum=0;edge_sum=0;edge_count=0;composite_sum=0;max_alpha=0;detached=[];prop_regions=[];selected=[0,45,90,135,179]
  for page in animation['states'][clip]['pages']:
   source=Path(baseline['gptRoot'])/'assets/dragon-animation/motion-v1'/page['file']
   assert hashlib.sha256(source.read_bytes()).hexdigest()==page['sha256']
   with Image.open(source) as atlas:
    for n in range(page['count']):
     reference=atlas.crop((n%8*384,n//8*384,(n%8+1)*384,(n//8+1)*384)).convert('RGBA');ref=np.array(reference)
     assert hashlib.sha256(ref[:,:,[2,1,0,3]].tobytes()).hexdigest()==control['inputFrameSha256'][count]
     raw=proc.stdout.read(384*384*4);assert len(raw)==384*384*4
     dec=np.frombuffer(raw,np.uint8).reshape(384,384,4);assert np.array_equal(dec[:,:,3]>10,mask[count])
     if clip=='lanterninvite' and count in [90,135,179]:
      # Fixed source-canvas region around outlying lamp + tassel; do not demand
      # disconnection from the fine handle attaching it to the hand.
      region=(slice(150,300),slice(40,125));ref_region=(ref[:,:,3]>10)[region];decoded_region=mask[count][region]
      prop_regions.append({'frame':count,'region':[40,150,125,300],'sourceOpaquePixels':int(ref_region.sum()),'decodedHitPixels':int(decoded_region.sum()),'sourceHitCoverage':float(decoded_region[ref_region].mean())})
     alpha=np.abs(ref[:,:,3].astype(np.int16)-dec[:,:,3].astype(np.int16));alpha_sum+=int(alpha.sum());max_alpha=max(max_alpha,int(alpha.max()))
     ra=ref[:,:,3:4].astype(np.float32)/255;da=dec[:,:,3:4].astype(np.float32)/255
     edge=(ref[:,:,3]>0)&(ref[:,:,3]<255)
     for bg in [0,255]:
      error=np.abs(ref[:,:,:3]*ra+bg*(1-ra)-dec[:,:,:3]*da-bg*(1-da));composite_sum+=float(error.sum());edge_sum+=float(error[edge].sum());edge_count+=int(edge.sum())*3
     labels,total=ndimage.label(ref[:,:,3]>10,np.ones((3,3)));areas=np.bincount(labels.ravel());areas[0]=0
     body=int(areas.argmax());distance=ndimage.distance_transform_edt(labels!=body)
     for component in np.flatnonzero(areas>=40):
      if component==body:continue
      ys,xs=np.where(labels==component);gap=float(distance[ys,xs].min())
      if gap>=3:
       visible=mask[count][ys,xs];detached.append({'frame':count,'pixels':len(xs),'bbox':[int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1)],'gapPixels':gap,'preservedHitPixels':int(visible.sum()),'referenceComponentHitCoverage':float(visible.mean())})
     if count in selected:
      row=selected.index(count);background=Image.new('RGBA',(384,384),'#30343a')
      for col,picture in enumerate([reference,Image.fromarray(dec)]):sheet.paste(Image.alpha_composite(background,picture).convert('RGB'),(384*col,416*row+32))
      draw.text((8,416*row+8),f'{clip} frame {count} / installed PNG reference',(255,255,255));draw.text((392,416*row+8),'Existing VP9 decode / same 384 canvas',(255,255,255))
     count+=1
  assert not proc.stdout.read(1);assert proc.wait(timeout=10)==0;assert count==control['frames']
  sheet.save(out/(clip+'-encoding-contact.png'))
  report['clips'][clip]={'frames':count,'videoSha256':control['fileSha256'],'allInputHashesMatchCurrentInstalledPixels':True,'allHitMasksMatchDecodedAlpha':True,'alphaMeanAbsoluteError':alpha_sum/(count*384*384),'alphaMaxError':max_alpha,'blackWhiteCompositeMeanAbsoluteError':composite_sum/(count*384*384*3*2),'edgeCompositeMeanAbsoluteError':edge_sum/max(1,edge_count),'errorScale':'0..255','detachedComponents':detached,'outlyingPropRegions':prop_regions,'interpretation':'Components and regions are geometry evidence, not artistic approval.'}
 (out/'existing-media-inspection.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
 print(json.dumps({clip:{k:v for k,v in data.items() if k!='detachedComponents'}|{'detachedComponents':len(data['detachedComponents'])} for clip,data in report['clips'].items()}))

if __name__=='__main__':main(sys.argv[1])
