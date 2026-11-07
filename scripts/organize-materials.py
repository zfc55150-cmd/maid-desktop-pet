"""Build a non-destructive local material library. Never move source assets."""
import argparse
import collections
import concurrent.futures
import csv
from datetime import datetime
import hashlib
import html
import json
import os
from pathlib import Path
import re

PROJECT = Path(__file__).resolve().parents[1]
WORK = PROJECT / 'work/gpt-niang-animation'
ANIM = PROJECT / 'integrations/gpt-niang/animated'
DELIVERY = Path(os.environ.get('USERPROFILE', str(Path.home()))) / 'Documents/Codex_产出/DeepSeek桌宠'
GPT = Path(os.environ.get('LOCALAPPDATA', str(Path.home() / 'AppData/Local'))) / 'Programs/GPTNiangUsage/gpt-niang-usage'
ROOTS = {
    '项目源码与工作区': PROJECT,
    '既有交付': DELIVERY,
    'D盘历史归档': Path(r'D:\Codex_归档\桌宠空间整理-20261024'),
    'DeepSeek正式素材': Path(os.environ.get('LOCALAPPDATA', str(Path.home() / 'AppData/Local'))) / 'Programs/DeepSeekActionPet/node_modules/dsh-pet/assets',
    'GPT娘正式素材': GPT / 'assets',
    'DeepSeek正式互动素材': Path(os.environ.get('LOCALAPPDATA', str(Path.home() / 'AppData/Local'))) / 'Programs/DeepSeekActionPet/node_modules/dsh-pet/runtime/electron-helper',
    'DeepSeek参考音色': Path(os.environ.get('LOCALAPPDATA', str(Path.home() / 'AppData/Local'))) / 'Programs/DeepSeekActionPet/voice-runtime',
}
MEDIA = set('.png .jpg .jpeg .webp .gif .svg .mp4 .webm .mkv .mov .avi .wav .mp3 .ogg .flac .m4a .ico .bmp .tif .tiff .psd .kra .blend .aep .clip .aseprite .atlas .ttf .otf .woff .woff2'.split())
SKIP = set('.git node_modules __pycache__ site-packages .venv venv python-base python python-runtime video-tools video-tools-v036 motion-tools material-organization 素材总库 cache model'.split())
CATS = ['01_正式使用', '02_原片与母版', '03_认可保留', '04_候选与返工', '05_参考与设计', '06_审阅与预览', '07_历史交付与归档', '08_其他素材']


def load(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def save(path, value):
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def sha(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def uri(path):
    return Path(path).absolute().as_uri()


def unit(root_key, root, p):
    rel = p.relative_to(root)
    parts = rel.parts
    if root_key == '项目源码与工作区':
        if parts[:3] == ('work', 'gpt-niang-animation', 'video') and len(parts) > 4:
            return root.joinpath(*parts[:4])
        if parts[:3] == ('integrations', 'gpt-niang', 'animated'):
            depth = 5 if len(parts) > 5 and parts[3] == 'assets' else 4
            return root.joinpath(*parts[:min(depth, len(parts)-1)])
        depth = 3 if len(parts) > 3 and parts[:2] == ('work', 'gpt-niang-animation') else 2
        return root.joinpath(*parts[:min(depth, len(parts)-1)])
    if root_key == '既有交付':
        return root.joinpath(*parts[:min(2, len(parts)-1)])
    if root_key == 'D盘历史归档':
        return root.joinpath(*parts[:min(3, len(parts)-1)])
    return root


def category(path, root_key):
    s = str(path).lower()
    if '正式' in root_key or root_key == 'DeepSeek参考音色' or ('integrations' in s and '\\assets\\motion-v1' in s) or '\\app\\' in s:
        return CATS[0]
    if root_key == 'D盘历史归档' or re.search(r'release-|backup|source-before|baseline|verification-|stage-|冻结|接力保全|更新_|更新包|维护版本|历史离线|分享包', s):
        return CATS[6]
    if re.search(r'reference|turnaround|参考|三视图|design|设计', s):
        return CATS[4]
    if '\\video\\' in s or 'retained-native-masters' in s:
        return CATS[1]
    if re.search(r'review|comparison|audit|preview|审阅|对比|预览|验收|检查', s):
        return CATS[5]
    if re.search(r'candidate|trial|round[4-7]|返工|修正|试片|小样|parallel', s):
        return CATS[3]
    return CATS[7]


def snapshot():
    paths = [PROJECT/'deployment.json', ANIM/'deployment.json', ANIM/'motion.json', WORK/'action-material-catalog.json']
    for name in ('approved-materials-20261025.json', 'approved-materials-20261025-final-round.json', 'approved-transitions-20261025.json', 'approved-integration-20261026.json'):
        paths.append(WORK/name)
    for manifest, root in [(PROJECT/'deployment.json', Path(os.environ.get('LOCALAPPDATA', str(Path.home() / 'AppData/Local'))) / 'Programs/DeepSeekActionPet'), (ANIM/'deployment.json', GPT)]:
        for item in load(manifest)['files']:
            paths.append(root/item['target'])
            if item.get('source'):
                paths.append(PROJECT/item['source'])
    return {str(p): sha(p) if p.is_file() else None for p in set(paths)}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--output', type=Path, required=True)
    ap.add_argument('--hash-cache', type=Path, help='Prior generated inventory; reuse hashes only if size and mtime are unchanged.')
    args = ap.parse_args()
    out = args.output.absolute()
    if out.exists():
        raise SystemExit('Output must be a new directory; existing libraries are never overwritten.')
    out.mkdir(parents=True)
    for cat in CATS:
        (out/cat).mkdir()
    before = snapshot()
    save(out/'整理前保护清单.json', before)
    files, skipped, errors, packages = [], [], [], []
    for root_key, root in ROOTS.items():
        if not root.is_dir():
            errors.append({'path': str(root), 'error': 'root missing'})
            continue
        for base, dirs, names in os.walk(root, followlinks=False, onerror=lambda e: errors.append({'error': str(e)})):
            keep = []
            for d in dirs:
                p = Path(base)/d
                try:
                    if d.lower() in SKIP or p == out or p.is_symlink() or p.stat().st_file_attributes & 1024:
                        skipped.append(str(p))
                    else:
                        keep.append(d)
                except OSError as e:
                    errors.append({'path': str(p), 'error': str(e)})
            dirs[:] = keep
            for name in names:
                p = Path(base)/name
                if p.suffix.lower() not in MEDIA and p.suffix.lower() not in {'.zip', '.7z'}:
                    continue
                try:
                    st = p.stat()
                    if p.is_symlink() or st.st_file_attributes & 1024:
                        skipped.append(str(p)); continue
                    if p.suffix.lower() in {'.zip', '.7z'}:
                        packages.append({'root': root_key, 'path': str(p), 'bytes': st.st_size})
                        continue
                    u = unit(root_key, root, p)
                    files.append({'root': root_key, 'path': str(p), 'relative': str(p.relative_to(root)), 'bytes': st.st_size, 'mtimeNs': st.st_mtime_ns, 'ext': p.suffix.lower(), 'unit': str(u), 'category': category(p, root_key)})
                except OSError as e:
                    errors.append({'path': str(p), 'error': str(e)})
    print(json.dumps({'stage':'scan', 'files':len(files), 'GiB':round(sum(f['bytes'] for f in files)/2**30, 3)}, ensure_ascii=False), flush=True)

    cache = {f['path'].lower():f for f in load(args.hash_cache)} if args.hash_cache else {}

    def hash_one(f):
        try:
            old = cache.get(f['path'].lower(), {})
            if old.get('stableDuringHash') and old.get('sha256') and old.get('bytes') == f['bytes'] and old.get('mtimeNs') == f['mtimeNs']:
                f['sha256'] = old['sha256']
                f['hashReused'] = True
            else:
                f['sha256'] = sha(f['path'])
            st = Path(f['path']).stat()
            f['stableDuringHash'] = st.st_size == f['bytes'] and st.st_mtime_ns == f['mtimeNs']
            if not f['stableDuringHash']:
                errors.append({'path': f['path'], 'error': 'changed during hashing'})
        except OSError as e:
            f['sha256'] = ''; errors.append({'path': f['path'], 'error': str(e)})
        return f

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        for i, _ in enumerate(executor.map(hash_one, files), 1):
            if i % 2000 == 0:
                print(json.dumps({'stage': 'hash', 'done': i, 'total': len(files)}), flush=True)
    bypath = {f['path'].lower(): f for f in files}
    same = collections.defaultdict(list)
    for f in files:
        if f.get('sha256') and f.get('stableDuringHash'):
            same[(f['bytes'], f['sha256'])].append(f)
    duplicates = [{'sha256': h, 'bytesEach': size, 'paths': [x['path'] for x in group]} for (size, h), group in same.items() if len(group) > 1]

    registry = load(WORK/'action-material-catalog.json')['materials']
    approved = {}
    for filename in ('approved-materials-20261025.json', 'approved-materials-20261025-final-round.json', 'approved-transitions-20261025.json', 'approved-integration-20261026.json'):
        p = WORK/filename
        if p.is_file():
            d = load(p)
            records = d.get('materials', [])
            if isinstance(records, dict):
                records = records.values()
            for r in records:
                if r.get('candidate'):
                    approved[r['candidate']] = dict(r, evidence=str(p))
    motion_path = GPT/'assets/dragon-animation/motion-v1/motion.json'
    if not motion_path.exists():
        motion_path = GPT/'runtime/dragon-animation/animation.json'
    # The runtime animation manifest contains the full state bank in current builds.
    installed_motion = load(motion_path)
    if 'states' not in installed_motion:
        raise RuntimeError('Installed state manifest unavailable; do not infer installed status.')
    active = {v.get('approvedCandidate'): k for k,v in installed_motion['states'].items() if v.get('approvedCandidate')}
    source_motion = load(ANIM/'motion.json')
    states = []
    for key, state in installed_motion['states'].items():
        pages = []
        for page in state.get('pages', []):
            p = GPT/'assets/dragon-animation/motion-v1'/page['file']
            item = bypath.get(str(p).lower())
            pages.append({'path':str(p), 'expected':page.get('sha256'), 'actual':item.get('sha256') if item else None, 'ok':bool(item and item.get('stableDuringHash') and item.get('sha256') == page.get('sha256'))})
        states.append({'key':key,'label':state.get('label',key),'frames':state.get('frames'),'fps':state.get('fps',installed_motion.get('fps')),'candidate':state.get('approvedCandidate'),'pages':pages,'allPagesVerified':bool(pages) and all(p['ok'] for p in pages)})

    candidates = []
    superseded = {v.get('supersededRejectedCandidate') for v in registry.values() if v.get('supersededRejectedCandidate')}
    for folder in sorted((WORK/'video').iterdir()):
        if not folder.is_dir() or not (folder/'trial.mp4').is_file():
            continue
        c = folder.name
        record = next((dict(v, registryKey=k) for k,v in registry.items() if v.get('candidate') == c), {})
        approval = approved.get(c, {})
        reviews = []
        for review in (folder/'source-art-review.json', folder/'matte-v1/art-review.json'):
            if review.is_file():
                reviews.append(dict(load(review), evidence=str(review)))
        retained_review = next((r for r in reviews if r.get('humanAcceptedForRetention') is True), {})
        source = bypath.get(str(folder/'trial.mp4').lower(), {})
        expected = record.get('sourceVideoSha256') or approval.get('sourceVideoSha256')
        integrity = '匹配登记哈希' if expected and expected == source.get('sha256') else ('登记哈希不匹配' if expected else '已记录现有哈希，未找到登记哈希')
        status = '已安装使用' if c in active else ('认可保留' if record.get('humanAcceptedForRetention') or approval.get('humanAcceptedForRetention') or retained_review else '未找到明确认可记录')
        if status == '未找到明确认可记录' and (c in superseded or any(r.get('fullClipRejected') is True for r in reviews)):
            status = '返工或历史版本'
        if record.get('status') and any(w in record['status'] for w in ('rejected', 'superseded')):
            status = '返工或历史版本'
        masters = [f['path'] for f in files if f['unit'] == str(folder) and (f['ext'] == '.mkv' or 'lossless' in Path(f['path']).name.lower())]
        named_master = record.get('master') or approval.get('master')
        if named_master and named_master not in masters:
            masters.insert(0, named_master)
        master_expected = record.get('masterSha256') or approval.get('masterSha256')
        master_actual = bypath.get(str(named_master).lower(), {}).get('sha256') if named_master else None
        if not named_master and masters:
            named_master = masters[0]
        candidates.append({'candidate':c, 'title':record.get('title') or approval.get('label') or record.get('actionKey') or c, 'status':status, 'registryStatus':record.get('status'), 'installedState':active.get(c), 'source':str(folder/'trial.mp4'), 'sha256':source.get('sha256'), 'integrity':integrity, 'master':named_master, 'masterVerified':bool(master_expected and master_expected == master_actual), 'masters':masters, 'evidence':approval.get('evidence') or (str(WORK/'action-material-catalog.json') if record else retained_review.get('evidence')), 'delivery':record.get('delivery') or (str(DELIVERY/'GPT娘动作升级'/record['folder']) if record.get('folder') else None), 'note':record.get('note','')})

    units = {}
    for f in files:
        u = units.setdefault(f['unit'], {'path':f['unit'],'root':f['root'],'category':category(Path(f['unit'])/'_',f['root']),'files':0,'bytes':0,'types':collections.Counter()})
        u['files'] += 1; u['bytes'] += f['bytes']; u['types'][f['ext']] += 1
    navigation = []
    for u in sorted(units.values(), key=lambda x:(x['category'], x['path'])):
        navigation.append({'category':u['category'],'label':Path(u['path']).name,'target':u['path'],'files':u['files'],'bytes':u['bytes']})
    for c in candidates:
        if c['status'] in ('已安装使用', '认可保留'):
            navigation.append({'category':CATS[2],'label':c['title']+'__'+c['candidate'],'target':str(Path(c['source']).parent),'files':0,'bytes':0})
    for p in packages:
        navigation.append({'category':CATS[6], 'label':Path(p['path']).name,'target':p['path'],'files':1,'bytes':p['bytes']})
    for base in (PROJECT/'docs', ANIM, ANIM/'design-parallel-20261025', ANIM/'design-transitions-20261025'):
        if base.is_dir():
            navigation.append({'category':CATS[4],'label':'说明与设计__'+base.name,'target':str(base),'files':0,'bytes':0})

    after = snapshot()
    changed = [p for p in before if before[p] != after.get(p)]
    save(out/'整理后保护清单.json', after)
    summary = {'at':datetime.now().astimezone().isoformat(), 'mediaFiles':len(files),'logicalBytes':sum(f['bytes'] for f in files),'roots':{k:{'path':str(root),'files':sum(f['root']==k for f in files),'bytes':sum(f['bytes'] for f in files if f['root']==k)} for k,root in ROOTS.items()},'candidateSources':len(candidates),'candidateStatus':dict(collections.Counter(c['status'] for c in candidates)), 'states':len(states), 'frames':sum(s['frames'] for s in states), 'installedAtlasPages':sum(len(s['pages']) for s in states),'installedAtlasVerified':all(s['allPagesVerified'] for s in states),'duplicateGroups':len(duplicates),'duplicateCopies':sum(len(d['paths'])-1 for d in duplicates),'duplicateLogicalBytes':sum((len(d['paths'])-1)*d['bytesEach'] for d in duplicates),'protectedFiles':len(before),'protectedChanged':changed,'packages':len(packages),'errors':errors,'skipped':skipped,'navigationEntries':len(navigation),'sourceManifestMatchesInstalledStates':source_motion['states']==installed_motion['states'],'operations':{'moved':0,'deleted':0,'copiedMedia':0,'installed':False,'paidCalls':0}}
    save(out/'整理结果.json', summary)
    save(out/'全部素材.json', files)
    save(out/'原片与认可状态.json', candidates)
    save(out/'正式动作清单.json', states)
    save(out/'重复内容分组.json', duplicates)
    save(out/'历史压缩包.json', packages)
    save(out/'分类导航.json', navigation)
    columns = ['category','root','path','ext','bytes','sha256','stableDuringHash','unit']
    with (out/'全部素材.csv').open('w', encoding='utf-8-sig',newline='') as f:
        writer=csv.DictWriter(f,fieldnames=columns,extrasaction='ignore');writer.writeheader();writer.writerows(files)
    with (out/'原片与认可状态.csv').open('w', encoding='utf-8-sig',newline='') as f:
        writer=csv.DictWriter(f,fieldnames=['candidate','title','status','installedState','source','sha256','integrity','master','masterVerified','evidence','note'],extrasaction='ignore');writer.writeheader();writer.writerows(candidates)

    def a(path,label):
        return '<a href="'+html.escape(uri(path),quote=True)+'">'+html.escape(str(label))+'</a>'
    cards = []
    for cat in CATS:
        cards.append('<section><h2>'+html.escape(cat.replace('_',' · '))+'</h2><div class="grid">')
        for n in navigation:
            if n['category'] != cat: continue
            detail = (str(n['files'])+' 个媒体文件 · '+format(n['bytes']/2**20,'.1f')+' MiB') if n['files'] else '快捷入口 · 原文件保持原位置'
            cards.append('<article class="searchable"><b>'+a(n['target'],n['label'])+'</b><p>'+html.escape(detail)+'</p><small>'+html.escape(n['target'])+'</small></article>')
        cards.append('</div></section>')
    candidate_rows = []
    for c in candidates:
        links = a(c['source'],'原片')+' · '+a(Path(c['source']).parent,'素材目录')
        if c['master'] and Path(c['master']).exists(): links += ' · '+a(c['master'],'透明母版')
        if c['delivery'] and Path(c['delivery']).exists(): links += ' · '+a(c['delivery'],'交付预览')
        candidate_rows.append('<tr class="searchable"><td><b>'+html.escape(c['title'])+'</b><br><small>'+html.escape(c['candidate'])+'</small></td><td>'+html.escape(c['status'])+'<br><small>'+html.escape(c['integrity'])+'</small></td><td>'+links+'</td></tr>')
    state_rows = ''.join('<tr class="searchable"><td>'+html.escape(s['label'])+'</td><td>'+html.escape(s['key'])+'</td><td>'+str(s['frames'])+'</td><td>'+('图集匹配' if s['allPagesVerified'] else '需核查')+'</td></tr>' for s in states)
    document = '''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>桌宠素材总库</title><style>
    *{box-sizing:border-box}body{margin:0;background:#f3f5f9;color:#1c2d42;font:15px/1.65 "Microsoft YaHei",sans-serif}main{max-width:1280px;margin:auto;padding:36px 28px}h1{font-size:32px;margin:0}h2{font-size:21px;margin-top:34px}a{color:#175ca6;text-decoration:none}a:hover{text-decoration:underline}.intro{max-width:900px;color:#526174}.stats{display:flex;gap:12px;flex-wrap:wrap;margin:22px 0}.stat,article{background:white;border:1px solid #dce4ee;border-radius:12px;padding:17px}.stat b{display:block;font-size:24px}.toolbar{position:sticky;top:0;padding:12px 0;background:#f3f5f9;z-index:2}input{width:100%;padding:13px;border:1px solid #bbcddd;border-radius:9px;font:inherit}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:12px}article p{margin:7px 0;color:#64748b}small{font-size:12px;color:#6d7785;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;background:white}td,th{padding:12px;text-align:left;border-bottom:1px solid #e2e8f0;overflow-wrap:anywhere}nav{display:flex;gap:18px;flex-wrap:wrap}details{margin:28px 0}summary{cursor:pointer;font-size:21px;font-weight:bold}.empty{display:none}</style><main>'''
    document += '<h1>桌宠素材总库</h1><p class="intro">统一查找 DeepSeek 与 GPT娘现有素材。原文件保持原路径，分类文件夹提供 Windows 快捷方式。认可状态来自已有登记；“未找到明确认可记录”不代表被否定。压缩包只登记入口，未解包。</p>'
    document += '<div class="stats">'+''.join('<div class="stat"><b>'+str(value)+'</b>'+label+'</div>' for value,label in [(len(files),'媒体文件'),(format(summary['logicalBytes']/2**30,'.2f'),'GiB 逻辑大小（含副本）'),(len(candidates),'原片候选'),(len(states),'正式动作'),(len(duplicates),'同内容分组')])+'</div>'
    document += '<nav>'+a(out/'全部素材.csv','完整文件清单 CSV')+a(out/'原片与认可状态.csv','原片与状态 CSV')+a(out/'重复内容分组.json','重复内容记录')+a(out/'使用说明.md','整理说明')+'</nav><div class="toolbar"><input id="search" placeholder="搜索动作、候选编号、文件夹名称或路径" aria-label="搜索素材"></div>'
    document += '<details open><summary>原片、母版与认可状态</summary><table><thead><tr><th>素材与版本</th><th>现有状态</th><th>打开</th></tr></thead><tbody>'+''.join(candidate_rows)+'</tbody></table></details>'
    document += '<details><summary>正式使用的 '+str(len(states))+' 组动作</summary><table><tr><th>动作</th><th>编号</th><th>帧数</th><th>本次核对</th></tr>'+state_rows+'</table></details>'+''.join(cards)
    document += '<script>const q=document.getElementById("search");q.addEventListener("input",()=>{const v=q.value.toLowerCase().trim();document.querySelectorAll(".searchable").forEach(e=>e.hidden=!e.textContent.toLowerCase().includes(v));if(v)document.querySelectorAll("details").forEach(e=>e.open=true)});</script></main></html>'
    (out/'打开素材总库.html').write_text(document,encoding='utf-8')
    notes = f'''# 桌宠素材整理结果

整理时间：{summary['at']}

入口：双击“打开素材总库.html”；按分类浏览 Windows 快捷方式，或用完整 CSV 搜索每一个媒体文件。

本次盘点 {len(files)} 个媒体文件，逻辑大小 {summary['logicalBytes']/2**30:.3f} GiB，包含不同工作副本。已逐文件计算 SHA-256；同内容 {len(duplicates)} 组，多余副本的逻辑大小 {summary['duplicateLogicalBytes']/2**30:.3f} GiB。重复记录仅表示字节相同，不表示可以直接删除，正式路径、冻结包和回退文件都可能有必要保留。

原片候选 {len(candidates)} 个。当前正式图集 {len(states)} 组、{summary['frames']} 帧、{summary['installedAtlasPages']} 页，本次逐页哈希匹配：{summary['installedAtlasVerified']}。保护清单 {len(before)} 项，本次改变 {len(changed)} 项。

分类文件夹是导航，原片、母版、图集、交付页和已有元数据保持原路径及字节。未移动或删除原文件，未复制大素材，未安装或重启桌宠，未调用付费接口。分类按路径和既有登记生成，不新增人工认可。已安装状态依据本次正式动作清单；保留动作不等于每段都已接入或适合循环。

“全部素材.csv / json”列出每个实际媒体文件。“原片与认可状态.csv / json”列出 trial.mp4 原片、透明母版、认可证据及正式动作关联。“正式动作清单.json”包含图集逐页核对。“历史压缩包.json”列出 {len(packages)} 个压缩包入口，未解压或重复统计其中内容。分片、程序依赖、模型权重、聊天、配置凭据和日志不作为媒体纳入。

缺失、读取失败、制作中变动：{len(errors)} 项，详见“整理结果.json”的 errors。排除的依赖目录和重解析点见 skipped。未逐段重播所有视频，本次是文件整理和完整性核对，不是新增美术验收。

未来更新：在项目目录运行 `python scripts/organize-materials.py --output <新的输出目录>`，生成新快照；已有输出拒绝覆盖。生成后用配套 PowerShell 入口建立分类快捷方式。
'''
    (out/'使用说明.md').write_text(notes, encoding='utf-8')
    print(json.dumps({k:v for k,v in summary.items() if k not in ('skipped','roots')},ensure_ascii=False),flush=True)
    if errors or changed or not summary['installedAtlasVerified']:
        raise SystemExit(2)


if __name__ == '__main__':
    main()
