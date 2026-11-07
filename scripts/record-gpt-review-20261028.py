import os
"""Apply the explicit 2026-10-28 review to the existing local material index only."""
from pathlib import Path
import json,hashlib,html,shutil,collections
ROOT=Path(__file__).resolve().parents[1]
AUDIT=ROOT/'work/deep-audit-20261028'
LIB=Path(os.environ.get('USERPROFILE', str(Path.home()))) / 'Documents/Codex_产出/DeepSeek桌宠/素材总库/GPT素材'
load=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
save=lambda p,v:p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
proof=load(AUDIT/'human-review-20261028.json')
accepted={x['candidate']:x for x in proof['approved']}
before=load(LIB/'保留素材.json')
items=[]
for r in before:
 if r['candidate'] not in accepted:continue
 assert hashlib.sha256(Path(r['source']).read_bytes()).hexdigest()==accepted[r['candidate']]['sha256']
 r['humanAcceptedForRetention']=True;r['humanReview']=str(AUDIT/'human-review-20261028.json')
 if r['group']!='01_正式动作':r['group']='02_认可备用'
 items.append(r)
assert len(items)==37
backup=AUDIT/'library-before-review';backup.mkdir(exist_ok=True)
for name in ['保留素材.json','分类导航.json','打开GPT素材.html']:
 if not (backup/name).exists():shutil.copy2(LIB/name,backup/name)
old_page=(LIB/'打开GPT素材.html').read_text(encoding='utf-8')
style=old_page.split('<style>',1)[1].split('</style>',1)[0]
def link(path,title):return '<a href="'+html.escape(Path(path).as_uri(),quote=True)+'">'+html.escape(title)+'</a>'
cards=[];nav=[]
for g in ['01_正式动作','02_认可备用']:
 group=[r for r in items if r['group']==g]
 cards.append('<h2>'+g[3:]+' · '+str(len(group))+' 段</h2><div class="grid">')
 for r in group:
  links=link(r['source'],'原片')
  if r.get('master'):links+=' · '+link(r['master'],'透明母版')
  cards.append('<article class="item"><h3>'+html.escape(r['title'])+'</h3><video controls preload="none" src="'+html.escape(Path(r['source']).as_uri(),quote=True)+'"></video><p>'+links+'</p><small>'+html.escape(r['candidate'])+'</small></article>')
  nav.append({'category':g,'label':r['title'],'target':r['source']})
 cards.append('</div>')
refs=load(LIB/'角色参考.json');cards.append('<h2>角色参考 · 2 张</h2><div class="grid">')
for r in refs:
 cards.append('<article class="item"><h3>'+html.escape(r['title'])+'</h3>'+link(r['path'],'参考图')+'</article>')
 nav.append({'category':'04_角色参考','label':r['title'],'target':r['path']})
cards.append('</div>')
page='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GPT娘素材</title><style>'+style+'</style><h1>GPT娘素材</h1><p>37 段已认可动作 · 2 张角色参考。2026-10-28 已按你的验收剔除轻捋长发返工片。认可备用尚未据此安装；现有局限记录保留。</p><input id="q" placeholder="搜索动作或候选编号">'+''.join(cards)+'<script>document.getElementById("q").oninput=e=>document.querySelectorAll(".item").forEach(n=>n.hidden=!n.textContent.toLowerCase().includes(e.target.value.toLowerCase()))</script></html>'
(LIB/'打开GPT素材.html').write_text(page,encoding='utf-8')
save(LIB/'保留素材.json',items);save(LIB/'分类导航.json',nav);save(LIB/'人工验收_20261028.json',proof)
# Remove only generated navigation links, never their source targets.
links=list(LIB.glob('*/*.lnk'))
assert len(links)==40
for p in links:
 assert p.parent.parent==LIB and not p.is_symlink()
 p.unlink()
pending=LIB/'03_待审新片'
if pending.exists() and not any(pending.iterdir()):pending.rmdir()
print(json.dumps({'retained':len(items),'groups':dict(collections.Counter(r['group'] for r in items)),'excluded':proof['rejected']['candidate'],'sourceMediaDeleted':0,'generatedLinksToRebuild':len(nav)},ensure_ascii=False))
