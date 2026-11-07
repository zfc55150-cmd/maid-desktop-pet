"""Import the user-approved native walking source into the current WPF fork."""
from pathlib import Path
import json, hashlib, shutil, importlib.util, math, re
from datetime import datetime, timezone
from PIL import Image, ImageDraw

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'work/gpt-walking-expression-approved-20261101-01'
BASE=ROOT/'work/gpt-startup-size-20261101-02'
SOURCE=ROOT/'work/gpt-niang-animation/video/wan3-walking-expression-gemini-20261101-03/trial.mp4'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
load=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
def save(p,v):
 p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

assert not OUT.exists(), 'Fresh directory required'
m=load(BASE/'deployment.json');installed=Path(m['targetRoot'])
expected={e['target']:e['sha256'] for e in m['hostFiles']+m['files']}
# Concurrent hover release was already documented and accepted; no arbitrary drift.
expected['runtime/pet-forms.ps1']='417385707bf825ef4317b0aff7bc0281739ccdae06f48756f9776d20940fb753'
assert all(sha(installed/k)==v for k,v in expected.items()), 'Installed fork drift'
assert sha(SOURCE)=='b7f7ca76f1c71a97006f04dd2db5be936786047656c1b81ff4e3c7dbef68b7d0'
OUT.mkdir()
save(OUT/'approval.json',dict(at=datetime.now(timezone.utc).isoformat(),humanMessage='这个他搞好了，你保存并使用吧，我验收过了',approvedSource=str(SOURCE),sourceSha256=sha(SOURCE),humanArtworkApproved=True,approvedForInstallation=True,interpretation='Latest Gemini expressive walking revision -03; replace manual walking only; no window locomotion implementation'))
motion=load(installed/'runtime/dragon-animation/animation.json')
old=json.loads(json.dumps(motion));(OUT/'baseline-animation.json').write_bytes((installed/'runtime/dragon-animation/animation.json').read_bytes())
assert len(motion['states'])==43 and motion['cellSize']==384
spec=importlib.util.spec_from_file_location('keyer',ROOT/'integrations/gpt-niang/animated/inspect-video-trial.py');k=importlib.util.module_from_spec(spec);spec.loader.exec_module(k);np=k.np
frontpage=motion['states']['frontidle']['pages'][0]
front=Image.open(installed/'assets/dragon-animation/motion-v1'/frontpage['file']).convert('RGBA').crop((0,0,384,384))
fy,fx=np.where(np.asarray(front)[:,:,3]>16);frontbox=[int(fx.min()),int(fy.min()),int(fx.max()+1),int(fy.max()+1)]
reader=k.imageio_ffmpeg.read_frames(str(SOURCE),pix_fmt='rgb24');meta=next(reader);w,h=meta['size'];assert meta['fps']==30
frames=[];native=[];bounds=[]
for raw in reader:
 rgba=k.key_frame(np.frombuffer(raw,np.uint8).reshape(h,w,3));native.append(hashlib.sha256(rgba.tobytes()).hexdigest())
 y,x=np.where(rgba[:,:,3]>16);assert x.size;bounds.append([int(x.min()),int(y.min()),int(x.max()+1),int(y.max()+1)])
 frames.append(Image.fromarray(rgba))
assert len(frames)==180
l=max(0,min(b[0] for b in bounds)-8);t=max(0,min(b[1] for b in bounds)-8);r=min(w,max(b[2] for b in bounds)+8);b=min(h,max(b[3] for b in bounds)+8)
first=bounds[0];cx=(first[0]+first[2])/2;ground=first[3];targetcx=(frontbox[0]+frontbox[2])/2;targetground=frontbox[3]
scale=(frontbox[3]-frontbox[1])/(first[3]-first[1])
size=(round((r-l)*scale),round((b-t)*scale));pos=(round(targetcx+(l-cx)*scale),round(targetground+(t-ground)*scale))
assert min(pos)>=1 and pos[0]+size[0]<384 and pos[1]+size[1]<384, 'Unsafe fixed canvas'
pages=[];digests=[];samples={};minimum=384*384
for i,im in enumerate(frames):
 cell=Image.new('RGBA',(384,384));cell.alpha_composite(im.crop((l,t,r,b)).resize(size,Image.Resampling.LANCZOS),pos)
 a=np.asarray(cell);assert not a[[0,-1],:,3].any() and not a[:,[0,-1],3].any();minimum=min(minimum,int(np.count_nonzero(a[:,:,3]>24)));digests.append(hashlib.sha256(cell.tobytes()).hexdigest())
 if i in (0,15,60,126,179):samples[i]=cell.copy()
 if i%64==0:start=i;rows=math.ceil(min(64,180-i)/8);sheet=Image.new('RGBA',(3072,rows*384))
 sheet.paste(cell,((i%64)%8*384,(i%64)//8*384))
 if i%64==63 or i==179:
  name=f'approvedwalking-{len(pages)}.png';dest=OUT/'files/assets/dragon-animation/motion-v1'/name;dest.parent.mkdir(parents=True,exist_ok=True);sheet.save(dest)
  pages.append(dict(file=name,start=start,count=i+1-start,rows=rows,sha256=sha(dest)))
restored=[]
for p in pages:
 with Image.open(OUT/'files/assets/dragon-animation/motion-v1'/p['file']) as sheet:
  for j in range(p['count']):restored.append(hashlib.sha256(sheet.crop((j%8*384,j//8*384,(j%8+1)*384,(j//8+1)*384)).tobytes()).hexdigest())
assert restored==digests
motion['states']['walking'].update(label='走动 · 轻快小得意',pages=pages,approvedCandidate='wan3-walking-expression-gemini-20261101-03')
# New fixed camera already matches the current frontidle canvas; remove the old walking-only correction.
motion['clipPresentation'].pop('walking',None)
assert {n:s for n,s in old['states'].items() if n!='walking'}=={n:s for n,s in motion['states'].items() if n!='walking'}
for name in old:
 if name not in ('states','clipPresentation'):assert old[name]==motion[name],name
assert {n:v for n,v in old['clipPresentation'].items() if n!='walking'}==motion['clipPresentation']
save(OUT/'files/runtime/dragon-animation/animation.json',motion)
contact=Image.new('RGB',(7*256,290),'#292636');draw=ImageDraw.Draw(contact)
for j,(label,im) in enumerate([('frontidle',front)]+[(f'walking {i}',samples[i]) for i in samples]+[('frontidle',front)]):
 im=im.resize((256,256),Image.Resampling.LANCZOS);contact.paste(im,(j*256,0),im);draw.text((j*256+8,264),label,fill='white')
contact.save(OUT/'joins-and-keys.png')
save(OUT/'derivation.json',dict(source=str(SOURCE),sourceSha256=sha(SOURCE),frames=180,fps=30,seconds=6,nativeRgbaFrameSha256=native,atlasFrameSha256=digests,atlasRoundTripVerified=True,fixedUnionCrop=[l,t,r,b],scale=scale,position=pos,targetFrontBbox=frontbox,minimumForegroundPixels=minimum,framesAdded=0,framesRemoved=0,retimed=False,splices=0,windowLocomotionImplemented=False))
targets=['runtime/dragon-animation/animation.json']+['assets/dragon-animation/motion-v1/'+p['file'] for p in pages]
m['files']=[dict(target=n,sha256=sha(OUT/'files'/n),previousSha256=expected[n]) for n in targets]
m['hostFiles']=[dict(target=n,sha256=v) for n,v in expected.items() if n not in targets];m['version']='0.7.3-walking-expression.1'
save(OUT/'deployment.json',m)
for name in ('apply-update.ps1','maintenance-runner.ps1','verify-installed.cjs','merge-hooks.cjs','dragon-hooks.json'):
 shutil.copyfile(BASE/name,OUT/name)
(OUT/'agent-files').mkdir();shutil.copyfile(BASE/'agent-files/update-helper.ps1',OUT/'agent-files/update-helper.ps1')
entry=(BASE/'reviewed-delta.ps1').read_text(encoding='utf-8-sig')
needle="if(@($m.files).Count-ne 1 -or $m.files[0].target-ne 'widget.ps1'){throw 'DELTA_MANAGED_SCOPE_CHANGED'}"
replacement="$approvedTargets=@("+','.join("'"+n+"'" for n in sorted(targets))+"); if(@($m.files).Count-ne 4 -or ((@($m.files.target|Sort-Object) -join '|')-cne ($approvedTargets -join '|'))){throw 'DELTA_MANAGED_SCOPE_CHANGED'}"
assert entry.count(needle)==1;entry=entry.replace(needle,replacement)
names=['deployment.json','approval.json','derivation.json','apply-update.ps1','maintenance-runner.ps1','verify-installed.cjs','merge-hooks.cjs','dragon-hooks.json','agent-files/update-helper.ps1']+['files/'+n for n in targets]
save(OUT/'package-integrity.json',dict(schema=1,files=[dict(path=n,sha256=sha(OUT/n)) for n in names]))
entry=re.sub(r"(?<=reviewedDeltaIndexSha=')[a-f0-9]{64}",sha(OUT/'package-integrity.json'),entry,count=1)
(OUT/'reviewed-delta.ps1').write_text(entry,encoding='utf-8')
print(json.dumps(dict(package=str(OUT),sourceSha256=sha(SOURCE),frames=180,managedFiles=len(targets),dependencies=len(m['hostFiles']),atlasRoundTrip=True)))
