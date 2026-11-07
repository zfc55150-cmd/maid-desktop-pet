import os
"""Curate one GPT animation per entry and remove exact, documented rejected media."""
import argparse
import collections
import importlib.util
import json
from pathlib import Path
import re
import hashlib
import html
from datetime import datetime

ROOT = Path(__file__).resolve().parents[1]
W = ROOT/'work/gpt-niang-animation'
A = ROOT/'integrations/gpt-niang/animated'
EXPORT = Path(os.environ.get('USERPROFILE', str(Path.home()))) / 'Documents/Codex_产出/DeepSeek桌宠'
E = EXPORT/'GPT娘动作升级'
AUDIT = ROOT/'work/material-organization'
OLD = EXPORT/'素材总库/现有素材_20261027'
NEW = EXPORT/'素材总库/GPT素材'
EXT = set('.png .jpg .jpeg .webp .gif .svg .mp4 .webm .mkv .mov .avi .wav .mp3 .ogg .flac .m4a .bmp .npy .npz'.split())
REJECTED = {
 'wan3-interaction-confused-720-v1': ('progress.json#/interactionConfusedBatch','无声动作反复说话式张嘴'),
 'wan3-interaction-front-reactive-720-v1': ('progress.json#/interactionFrontReactiveBatch','动作缺乏设计，头发变化不足'),
 'wan3-interaction-front-reactive-native60-119-v1': ('progress.json#/interactionFrontReactiveBatch','被否决原片的局部派生版'),
 'wan3-parallel-expression-confused-720-v1': ('progress.json#/latestMaterialSelectionCorrection','用户明确指出选错了困惑旧版'),
 'wan3-parallel-body-proudarms-720-r3-v1': ('video/body-tailfix-human-authorization-20261025.json','尾巴有问题，用户要求重新生成'),
 'wan3-round4-daily-hairtidy-720-v1': ('action-material-catalog.json#/pendingRounds/round4-20261026/items/daily','幅度太小，用户要求返工'),
 'wan3-round7-daily-sleevebonk-720-v1': ('round7-daily-redo-20261026-main/previous-materials-review.json','手显得过大，用户明确说第三个不行'),
 'wan3-expression-complimentavert-12s-720-v1': ('expression-12s-regenerate-review-20261025-01/completion.json','旧12秒版本被否决，要求完整重新生成'),
 'wan3-expression-complimentavert-12s-720-silent-v2': ('expression-12s-regenerate-review-20261025-01/completion.json','旧12秒版本的局部修口派生版'),
 'wan3-expression-complimentavert-12s-720-silent-v2-failed-track': ('expression-12s-regenerate-review-20261025-01/completion.json','旧12秒版本失败派生版'),
}

def load(p): return json.loads(Path(p).read_text(encoding='utf-8-sig'))
def save(p,d): Path(p).write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def sha(p):
 h=hashlib.sha256()
 with Path(p).open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()
def within(p,base):
 try:Path(p).relative_to(base);return True
 except ValueError:return False
def reparse(p):
 p=Path(p)
 while p.parent!=p:
  if p.exists() and p.stat().st_file_attributes & 1024:return True
  p=p.parent
 return False
def immutable(p):
 s=str(p).lower()
 return not (within(p,ROOT) or within(p,E)) or any(x in s for x in ['\\baseline\\','\\source-before','\\source_before','\\backup','\\source-baseline','\\release-','\\接力保全','\\冻结','\\更新前','\\retained-native-masters']) or within(p,A/'assets')

def selections():
 catalog=load(W/'action-material-catalog.json');rows=[]
 for key,r in catalog['materials'].items():rows.append(dict(r,record=key))
 for rnd,v in catalog.get('pendingRounds',{}).items():
  for role,r in v.get('items',{}).items():rows.append(dict(r,record=rnd+'/'+role))
 for key,r in catalog.get('additionalCandidates',{}).items():rows.append(dict(r,candidate=r.get('candidate') or key,record=key))
 installed=load(Path(load(A/'deployment.json')['targetRoot'])/'runtime/dragon-animation/animation.json')
 records={r['candidate']:r for r in rows if r.get('candidate')}
 items=[];selected=set();source_hashes=set()
 def add(key,title,group,candidate,source,master=None,record=None):
  source=Path(source)
  if not source.is_file() or candidate in REJECTED:return
  h=sha(source)
  if h in source_hashes:return
  source_hashes.add(h);selected.add(candidate)
  items.append(dict(key=key,title=title,group=group,candidate=candidate,source=str(source),sha256=h,master=str(master) if master and Path(master).is_file() else None,record=record))
 for key,r in installed['states'].items():
  c=r.get('approvedCandidate');info=records.get(c,{})
  source=W/'video'/c/'trial.mp4' if c else A/'assets/continuous-source'/(key+'.mp4')
  add(key,r['label'],'01_正式动作',c or 'formal-'+key,source,info.get('master'),info.get('record'))
 for c,r in records.items():
  if c in selected or c in REJECTED:continue
  approved=r.get('humanAcceptedForRetention') or r.get('humanArtworkApproved')
  status=r.get('status','')
  if 'archived-not-selected' in status:continue
  # Only explicitly tracked current candidates, not every historical intermediate.
  if not approved and not (c.startswith('wan3-round5-') or c.startswith('wan3-round7-') or c=='wan3-daily-hairtidy-broad-redo-720-v1'):continue
  source=r.get('sourcePath') or W/'video'/c/'trial.mp4'
  title=r.get('title') or r.get('label') or r.get('action') or r.get('actionKey') or c
  titles={'cheekpuff':'鼓腮小抗议','tickledodge':'躲痒侧步','sleeveside-redo':'侧拂袖口返工','hairtidy-broad-redo':'轻捋长发返工','fanmishap':'展扇小意外','skirtbeat':'提裙踏拍','lanterninvite':'提灯引路'}
  for word,t in titles.items():
   if word in c:title=t;break
  add(c,title,'02_认可备用' if approved else '03_待审新片',c,source,r.get('master'),r.get('record'))
 refs=[]
 folder=E/'角色三视图_20261025_01'
 for r in load(folder/'human-approval.json')['files']:
  p=folder/r['name'];assert sha(p)==r['sha256'];refs.append(dict(title='角色三视图' if 'turnaround' in p.name else '尾巴设计参考',path=str(p),sha256=r['sha256']))
 return items,refs

def build_plan():
 AUDIT.mkdir(exist_ok=True)
 inventory=load(OLD/'全部素材.json' if (OLD/'全部素材.json').exists() else AUDIT/'inventory-before-gpt-clean.json')
 items,refs=selections()
 spec=importlib.util.spec_from_file_location('material_scan',ROOT/'scripts/organize-materials.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
 protected=mod.snapshot()
 for r in items:
  protected[r['source']]=r['sha256']
  if r['master']:protected[r['master']]=sha(r['master'])
 for r in refs:protected[r['path']]=r['sha256']
 # All non-rejected native source directories retain their originals and references.
 for f in inventory:
  p=Path(f['path'])
  if within(p,W/'video') and len(p.relative_to(W/'video').parts)>1 and p.relative_to(W/'video').parts[0] not in REJECTED:
   protected[str(p)]=f['sha256']
 protected_hashes=set(protected.values())
 scopes=[W/'video'/c for c in REJECTED]
 scopes += [W/'interaction-front-reactive-review-20261025-v1',W/'expression-12s-review-20261025-01',W/'parallel-expression-20261025-01']
 scopes += [E/x for x in ['动作设计与困惑试片_20261024_01','表情与快起拖修订_20261025_01','并行表情动作_20261025_01','并行第三轮_抱臂矜持body_20261025_01','并行第四轮_轻捋长发daily_20261026_01','第七轮_袖口轻拍daily_20261026_01','被夸偷看_12秒完整成片_20261025_01']]
 scopes += [E/'第四轮主协调预览_20261026_01/daily',W/'round4-20261026-main/daily',W/'round7-click-20261026-main/daily']
 explicit={};ignored=[]
 for folder in scopes:
  if not folder.exists():continue
  assert not reparse(folder)
  for p in folder.rglob('*'):
   if not p.is_file() or p.suffix.lower() not in EXT:continue
   if immutable(p) or reparse(p) or any(x in p.name.lower() for x in ['reference','参考','first-frame']):continue
   h=sha(p)
   if str(p) in protected or h in protected_hashes:ignored.append(str(p));continue
   explicit[str(p)]={'path':str(p),'sha256':h,'bytes':p.stat().st_size,'reason':'有明确否决记录的原片或派生素材','scope':str(folder)}
 rejected_hashes={v['sha256'] for v in explicit.values()}
 # Remove byte-identical copies of rejected assets without touching frozen or active files.
 for f in inventory:
  p=Path(f['path'])
  if f['sha256'] not in rejected_hashes or str(p) in explicit or str(p) in protected or immutable(p) or not p.exists():continue
  if reparse(p) or any(x in p.name.lower() for x in ['reference','参考','first-frame']):continue
  explicit[str(p)]={'path':str(p),'sha256':f['sha256'],'bytes':f['bytes'],'reason':'被否决素材的同内容副本'}
 save(AUDIT/'gpt-clean-plan.json',dict(at=datetime.now().astimezone().isoformat(),items=items,references=refs,rejectedCandidates={k:{'evidence':v[0],'reason':v[1]} for k,v in REJECTED.items()},protected=protected,files=list(explicit.values()),ignoredSharedReferences=ignored,scope='Only documented rejected GPT media and identical copies in project or GPT delivery; no archive, frozen baseline or installed mutation'))
 print(json.dumps({'items':len(items),'groups':dict(collections.Counter(x['group'] for x in items)),'references':len(refs),'rejectedVersions':len(REJECTED),'deleteFiles':len(explicit),'deleteGiB':round(sum(f['bytes'] for f in explicit.values())/2**30,3),'protected':len(protected)},ensure_ascii=False))

def apply():
 plan=load(AUDIT/'gpt-clean-plan.json')
 if NEW.exists():raise RuntimeError('Refusing to overwrite GPT library')
 # Preflight the entire literal whitelist before deleting any files.
 for f in plan['files']:
  p=Path(f['path']);assert not immutable(p) and not reparse(p) and p.suffix.lower() in EXT
  assert str(p) not in plan['protected'] and p.stat().st_size==f['bytes'] and sha(p)==f['sha256']
 for p,h in plan['protected'].items():assert h is None or sha(p)==h, 'Protected source changed: '+p
 removed=[];failed=[]
 for f in plan['files']:
  try:Path(f['path']).unlink();removed.append(f)
  except OSError as e:failed.append({'path':f['path'],'error':type(e).__name__})
 after={p:sha(p) if Path(p).is_file() else None for p in plan['protected']}
 assert after==plan['protected'],'Protected media changed'
 NEW.mkdir(parents=True)
 groups=['01_正式动作','02_认可备用','03_待审新片','04_角色参考']
 for g in groups:(NEW/g).mkdir()
 nav=[];cards=[]
 def link(p,label):return '<a href="'+html.escape(Path(p).as_uri(),quote=True)+'">'+html.escape(label)+'</a>'
 for group in groups[:3]:
  members=[x for x in plan['items'] if x['group']==group]
  cards.append('<h2>'+group[3:]+' · '+str(len(members))+' 段</h2><div class="grid">')
  for r in members:
   nav.append({'category':group,'label':r['title'],'target':r['source']})
   links=link(r['source'],'打开原片')
   if r['master']:links+=' · '+link(r['master'],'透明母版')
   cards.append('<article class="item"><h3>'+html.escape(r['title'])+'</h3><video controls preload="none" src="'+html.escape(Path(r['source']).as_uri(),quote=True)+'"></video><p>'+links+'</p><small>'+html.escape(r['candidate'])+'</small></article>')
  cards.append('</div>')
 cards.append('<h2>角色参考 · '+str(len(plan['references']))+' 张</h2><div class="grid">')
 for r in plan['references']:
  nav.append({'category':groups[3],'label':r['title'],'target':r['path']})
  cards.append('<article class="item"><h3>'+html.escape(r['title'])+'</h3>'+link(r['path'],'打开参考图')+'</article>')
 cards.append('</div>')
 text='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GPT娘素材</title><style>body{max-width:1240px;margin:auto;padding:32px;background:#f3f5fa;color:#23344a;font:15px/1.6 "Microsoft YaHei",sans-serif}h1{margin-bottom:8px}h2{margin-top:32px}h3{font-size:18px}a{color:#175da6}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:16px}article{padding:18px;border-radius:12px;background:white;border:1px solid #dde4ef}video{width:100%;height:280px;background:#24334a;object-fit:contain}small{word-break:break-all;color:#627083}input{position:sticky;top:8px;width:97%;padding:14px;font:inherit;border:1px solid #b9c9de;border-radius:8px}p{color:#56677b}</style><h1>GPT娘素材</h1>'''
 text+='<p>按动作整理，每段只列一次。只含 GPT娘；已否决版本、图集页、深浅背景副本和旧工作包不列入素材数量。原片和透明母版是同一段素材的两种用途。</p><p>'+str(len(plan['items']))+' 段独立动作 · '+str(len(plan['references']))+' 张角色参考</p><input id="q" placeholder="搜索动作名称或候选编号">'+''.join(cards)+'<script>document.getElementById("q").oninput=e=>document.querySelectorAll(".item").forEach(n=>n.hidden=!n.textContent.toLowerCase().includes(e.target.value.toLowerCase()))</script></html>'
 (NEW/'打开GPT素材.html').write_text(text,encoding='utf-8')
 save(NEW/'分类导航.json',nav);save(NEW/'保留素材.json',plan['items']);save(NEW/'角色参考.json',plan['references'])
 report=dict(at=datetime.now().astimezone().isoformat(),items=len(plan['items']),groups=dict(collections.Counter(x['group'] for x in plan['items'])),references=len(plan['references']),rejectedVersions=len(REJECTED),deletedFiles=len(removed),deletedBytes=sum(f['bytes'] for f in removed),failed=failed,protectedVerified=len(after),mediaCopiesCreated=0,identicalSourcesInLibrary=len(plan['items'])-len({x['sha256'] for x in plan['items']}),deleted=removed)
 save(AUDIT/'gpt-clean-result.json',report);save(NEW/'清理结果.json',report)
 (NEW/'使用说明.md').write_text('# GPT娘素材\n\n打开“打开GPT素材.html”，每段动作只列一次。分类文件夹内是原片快捷方式，透明母版另在网页条目下提供。待审新片没有被冒充认可素材。\n\n本次按明确否决记录删除原片、派生预览和相同内容副本，保留原有文字审阅记录；正式源码图集、运行安装、冻结基线、回退和 D 盘归档不改动。旧交付预览中被删除的否决素材不再可播，使用本页筛选后的入口。\n\n去重按动作和源视频 SHA-256；不把图集每一页、同片不同尺寸或背景作为独立素材。必要工作路径与历史回退副本没有无差别删除。\n',encoding='utf-8')
 print(json.dumps({k:v for k,v in report.items() if k!='deleted'},ensure_ascii=False))

if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('mode',choices=['plan','apply']);mode=parser.parse_args().mode
 build_plan() if mode=='plan' else apply()
