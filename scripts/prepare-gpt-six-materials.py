import os
"""Import six user-selected Gemini originals without altering existing pet logic."""
from pathlib import Path
from datetime import datetime,timezone
import json,hashlib,importlib.util,math,re,shutil,sys
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'work/gpt-hover-readable-20261102-01'
OUT=ROOT/'work/gpt-six-materials-approved-20261102-01'
SOURCES=Path(os.environ.get('USERPROFILE', str(Path.home()))) / 'Documents/Codex_产出/DeepSeek桌宠/GPT娘动作升级/Gemini新素材生成_20261101'
RECORD=ROOT/'integrations/gpt-niang/animated/material-expansion-20261102'
ACTIONS=[('booknote','booknote_v1_candidate01','翻书批注','日常与奇遇'),
 ('treasureshare','treasureshare_v1_candidate01','小龙护宝 · 愿意分享','龙娘小剧场'),
 ('tailbutterfly','tailbutterfly_v1_candidate01','尾尖逗蝶','龙娘小剧场'),
 ('cranereply','cranereply_v1_candidate01','纸鹤回信','日常与奇遇'),
 ('wingbreeze','wingbreeze_v1_candidate01','小翼挡风','龙娘小剧场'),
 ('staroops','staroops_v1_candidate01','魔法失手 · 装作从容','龙娘小剧场')]

def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def load(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def save(p,v):
 p.parent.mkdir(parents=True,exist_ok=True)
 p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

def main():
 assert not OUT.exists() and not RECORD.exists(),'Fresh package required'
 manifest=load(BASE/'deployment.json');installed=Path(manifest['targetRoot'])
 expected={e['target']:e['sha256'] for e in manifest['hostFiles']+manifest['files']}
 assert all(sha(installed/n)==v for n,v in expected.items()),'Installed baseline drift'
 for e in manifest['stableHostFiles']+manifest['stableAgent']['files']:
  assert sha(Path(manifest['stableAgent']['targetRoot'])/e['target'])==e['sha256']
 original=load(installed/'runtime/dragon-animation/animation.json')
 motion=json.loads(json.dumps(original));assert len(motion['states'])==43
 OUT.mkdir();RECORD.mkdir(parents=True)
 (OUT/'baseline-animation.json').write_bytes((installed/'runtime/dragon-animation/animation.json').read_bytes())
 spec=importlib.util.spec_from_file_location('prop_import_keyer',ROOT/'integrations/gpt-niang/animated/inspect-video-trial.py')
 k=importlib.util.module_from_spec(spec);spec.loader.exec_module(k);np=k.np
 cellsize=motion['cellSize'];assert cellsize==384
 frontpage=motion['states']['frontidle']['pages'][0]
 front=Image.open(installed/'assets/dragon-animation/motion-v1'/frontpage['file']).convert('RGBA').crop((0,0,384,384))
 y,x=np.where(np.asarray(front)[:,:,3]>16);fb=[int(x.min()),int(y.min()),int(x.max()+1),int(y.max()+1)]
 tcx=(fb[0]+fb[2])/2;tg=fb[3]
 results=[];targets=[];sourcefiles=[]
 for name,candidate,label,group in ACTIONS:
  directory=SOURCES/candidate;source=directory/'original.mp4';meta=load(directory/'metadata.json')
  declared=meta.get('output',meta.get('files',{}).get('originalMp4',{}))
  digest=sha(source);assert digest==declared['sha256']
  assert source.stat().st_size==declared.get('sizeBytes',source.stat().st_size)
  assert name not in motion['states']
  reader=k.imageio_ffmpeg.read_frames(str(source),pix_fmt='rgb24');technical=next(reader);w,h=technical['size'];fps=technical['fps'];assert fps==30
  bounds=[];rawhashes=[];cells=[];pages=[];retained=[];sourceclip=0
  # At most 64 cells are held at a time. Geometry uses the unchanged reference
  # framing and a constant full-canvas transform; there is no frame tracking.
  firstraw=next(reader);first=np.frombuffer(firstraw,np.uint8).reshape(h,w,3)
  firstmatte=k.key_frame(first)
  fy,fx=np.where(firstmatte[:,:,3]>16);box=[int(fx.min()),int(fy.min()),int(fx.max()+1),int(fy.max()+1)]
  cx=(box[0]+box[2])/2;ground=box[3]
  scale=(fb[3]-fb[1])/(box[3]-box[1])
  # Keep the whole original video canvas inside the output cell, including
  # disconnected props at either side; never crop to a tracked character box.
  limit=min((tcx-2)/cx,(382-tcx)/(w-cx),(tg-2)/ground,(382-tg)/(h-ground))
  scale=min(scale,limit)
  size=(round(w*scale),round(h*scale));position=(round(tcx-cx*scale),round(tg-ground*scale))
  assert min(position)>=1 and position[0]+size[0]<384 and position[1]+size[1]<384
  allraw=iter(reader)
  def raws():
   yield firstraw
   yield from allraw
  for i,raw in enumerate(raws()):
   rgb=np.frombuffer(raw,np.uint8).reshape(h,w,3);rgba=k.key_frame(rgb,preserve_detached=True)
   alpha=rgba[:,:,3];yy,xx=np.where(alpha>16);assert xx.size,'Empty extracted frame'
   bounds.append([int(xx.min()),int(yy.min()),int(xx.max()+1),int(yy.max()+1)])
   sourceclip+=int(xx.min()==0 or yy.min()==0 or xx.max()==w-1 or yy.max()==h-1)
   cc,_,stats,_=k.cv2.connectedComponentsWithStats(np.uint8(alpha>128),connectivity=8)
   retained.append(int(cc-1))
   rawhashes.append(hashlib.sha256(rgba.tobytes()).hexdigest())
   cell=Image.new('RGBA',(384,384));cell.alpha_composite(Image.fromarray(rgba).resize(size,Image.Resampling.LANCZOS),position)
   arr=np.asarray(cell);assert not arr[[0,-1],:,3].any() and not arr[:,[0,-1],3].any()
   cells.append(hashlib.sha256(cell.tobytes()).hexdigest())
   if i%64==0:
    start=i;sheet=Image.new('RGBA',(3072,3072))
   sheet.paste(cell,((i%64)%8*384,(i%64)//8*384))
   if i%64==63:
    filename=f'{name}-{len(pages)}.png';dest=OUT/'files/assets/dragon-animation/motion-v1'/filename
    dest.parent.mkdir(parents=True,exist_ok=True);sheet.save(dest)
    pages.append(dict(file=filename,start=start,count=64,rows=8,sha256=sha(dest)))
  count=len(cells);assert count==180 and count==meta['totalFrames']
  if count%64:
   rows=math.ceil((count%64)/8);filename=f'{name}-{len(pages)}.png';dest=OUT/'files/assets/dragon-animation/motion-v1'/filename
   sheet.crop((0,0,3072,rows*384)).save(dest)
   pages.append(dict(file=filename,start=start,count=count%64,rows=rows,sha256=sha(dest)))
  restored=[]
  for p in pages:
   with Image.open(OUT/'files/assets/dragon-animation/motion-v1'/p['file']) as page:
    for j in range(p['count']):
     restored.append(hashlib.sha256(page.crop((j%8*384,j//8*384,(j%8+1)*384,(j//8+1)*384)).tobytes()).hexdigest())
  assert restored==cells
  motion['states'][name]=dict(label=label,frames=count,fps=30,loop=False,pages=pages,approvedCandidate=candidate)
  motion['menuGroups'][name]=group;motion['returnPoses'][name]='frontidle'
  motion['clipEntryPoses'][name]='C';motion['clipExitPoses'][name]='C'
  motion['fullPlayClips'].append(name);motion['propPolicies'][name]='appear-use-disappear'
  result=dict(id=name,title=label,candidate=candidate,original=str(source),sourceSha256=digest,
    originalBytes=source.stat().st_size,width=w,height=h,frames=count,fps=fps,seconds=count/fps,
    transform=dict(scale=scale,position=position,size=size,sourceCanvas=[w,h],perFrameTracking=False),
    pages=pages,detachedForegroundPreserved=True,componentCounts=retained,sourceBoundaryTouchFrames=sourceclip,
    atlasRoundTripVerified=True,nativeRgbaFrameSha256=rawhashes,atlasFrameSha256=cells,
    framesAdded=0,framesRemoved=0,retimed=False,splices=0,
    artworkReviewPerformedByAssistant=False,technicalChecksOnly=True,manualMenu=True)
  save(OUT/f'derivation/{name}.json',result)
  results.append({key:value for key,value in result.items() if key not in ('nativeRgbaFrameSha256','atlasFrameSha256','componentCounts')})
  targets.extend('assets/dragon-animation/motion-v1/'+p['file'] for p in pages)
  sourcefiles.extend(dict(path=str(directory/n),sha256=sha(directory/n)) for n in ('original.mp4','prompt-submitted.txt','reference-used.png','metadata.json','说明.md'))
  print(json.dumps(dict(completed=name,frames=count,pages=len(pages),sourcePreserved=sha(source)==digest)),flush=True)
 assert len(motion['states'])==49 and sum(s['frames'] for s in motion['states'].values())==8580
 for name in original['states']:assert original['states'][name]==motion['states'][name]
 allowed={'states','menuGroups','returnPoses','clipEntryPoses','clipExitPoses','fullPlayClips','propPolicies'}
 for name in original:
  if name not in allowed:assert original[name]==motion[name],name
 for name in ('menuGroups','returnPoses','clipEntryPoses','clipExitPoses','propPolicies'):
  for key,value in original[name].items():assert motion[name][key]==value
 assert motion['fullPlayClips'][:len(original['fullPlayClips'])]==original['fullPlayClips']
 targets=['runtime/dragon-animation/animation.json']+targets
 save(OUT/'files/runtime/dragon-animation/animation.json',motion)
 assert (OUT/'files/runtime/dragon-animation/animation.json').stat().st_size<128*1024
 approval=dict(date='2026-11-02',humanMessage='他设计好了，你保存并使用一下。然后再设计新的动作，感觉你现在设计的动作还是很保守，感觉没有很惊艳的感觉，可以设计几个明显就更加精致，更加丰富，更加有特色的素材',
  scope='Use six delivered candidate01 originals; preserve files and import into manual action menus. New designs are a separate proposal.',
  artworkAcceptanceBasis='User instruction to save and use; no assistant visual re-review',sources=sourcefiles,actions=results,
  videoGenerationCalls=0,existingActionsUnchanged=True,automaticPoolsUnchanged=True)
 save(RECORD/'adoption.json',approval);save(OUT/'approval.json',approval)
 save(RECORD/'animation-candidate.json',motion)
 manifest['version']='0.7.4-gemini-materials.1'
 manifest['files']=[dict(target=n,sha256=sha(OUT/'files'/n),previousSha256=expected.get(n)) for n in targets]
 assert all(n not in expected for n in targets[1:]),'New target collision'
 manifest['hostFiles']=[dict(target=n,sha256=v) for n,v in expected.items() if n not in targets]
 save(OUT/'deployment.json',manifest)
 for name in ('apply-update.ps1','maintenance-runner.ps1','verify-installed.cjs','merge-hooks.cjs','dragon-hooks.json'):
  shutil.copyfile(BASE/name,OUT/name)
 (OUT/'agent-files').mkdir();shutil.copyfile(BASE/'agent-files/update-helper.ps1',OUT/'agent-files/update-helper.ps1')
 entry=(BASE/'reviewed-delta.ps1').read_text(encoding='utf-8-sig')
 needle="if(@($m.files).Count-ne 1 -or $m.files[0].target-ne 'runtime/pet-forms.ps1'){throw 'DELTA_MANAGED_SCOPE_CHANGED'}"
 replacement="$approvedTargets=@("+','.join("'"+n+"'" for n in sorted(targets))+f"); if(@($m.files).Count-ne {len(targets)} -or ((@($m.files.target|Sort-Object) -join '|')-cne ($approvedTargets -join '|'))){{throw 'DELTA_MANAGED_SCOPE_CHANGED'}}"
 assert entry.count(needle)==1;entry=entry.replace(needle,replacement)
 # New atlas files intentionally have a null previous hash. Resolve-DeltaChild
 # still validates each path before permitting absence; preflight and rollback
 # continue accepting only their exact previous/new content states.
 needle2='$actual=Get-DeltaHash (Resolve-DeltaChild $m.targetRoot $entry.target)'
 replacement2="$managedPath=Resolve-DeltaChild $m.targetRoot $entry.target; $actual=if([IO.File]::Exists($managedPath)){Get-DeltaHash $managedPath}else{$null}"
 assert entry.count(needle2)==1;entry=entry.replace(needle2,replacement2)
 names=['deployment.json','approval.json','apply-update.ps1','maintenance-runner.ps1','verify-installed.cjs','merge-hooks.cjs','dragon-hooks.json','agent-files/update-helper.ps1']+['files/'+n for n in targets]
 save(OUT/'package-integrity.json',dict(schema=1,files=[dict(path=n,sha256=sha(OUT/n)) for n in names]))
 entry=re.sub(r"(?<=reviewedDeltaIndexSha=')[a-f0-9]{64}",sha(OUT/'package-integrity.json'),entry,count=1)
 (OUT/'reviewed-delta.ps1').write_text(entry,encoding='utf-8')
 save(OUT/'build-summary.json',dict(version=manifest['version'],newActions=6,states=49,frames=8580,
   newPages=18,totalPages=sum(len(s['pages']) for s in motion['states'].values()),managedFiles=len(targets),
   expectedUnchangedHostFiles=len(manifest['hostFiles']),baselineManifest=str(BASE/'deployment.json'),
   artworkReviewPerformed=False,sourceOriginalsPreserved=True,detachedPropsPreserved=True))
 print(json.dumps(dict(package=str(OUT),states=49,frames=8580,newPages=18)),flush=True)

if __name__=='__main__':main()
