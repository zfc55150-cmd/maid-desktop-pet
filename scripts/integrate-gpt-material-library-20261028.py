import os
"""Synchronize the existing 37 accepted entries after verified integration.

Only generated navigation metadata/shortcuts change. No source media is moved.
"""
from pathlib import Path
import hashlib, html, json, re, shutil, subprocess

ROOT = Path(__file__).resolve().parents[1]
RELEASE = ROOT / 'work/gpt-niang-animation/release-0.7.1-materials-20261028-01'
LIB = Path(os.environ.get('USERPROFILE', str(Path.home()))) / 'Documents/Codex_产出/DeepSeek桌宠/素材总库/GPT素材'
load = lambda p: json.loads(p.read_text(encoding='utf-8-sig'))
save = lambda p, value: p.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()

def main():
    assert load(RELEASE / 'installed-verification.json')['ok']
    assert load(RELEASE / 'post-install.json')['settingsPreserved']
    manifest = load(RELEASE / 'candidate-deployment.json')
    assert manifest['version'] == '0.7.1-materials'
    approval = load(ROOT / 'work/gpt-niang-animation/approved-integration-20261028-materials.json')
    added = {r['candidate']: r for r in approval['materials']}
    before = load(LIB / '保留素材.json')
    assert len(before) == 37 and len({r['candidate'] for r in before}) == 37
    review = load(ROOT / 'work/deep-audit-20261028/human-review-20261028.json')
    accepted = {r['candidate']: r for r in review['approved']}
    assert {r['candidate'] for r in before} == set(accepted)
    for r in before:
        assert sha(Path(r['source'])) == r['sha256'] == accepted[r['candidate']]['sha256']
    backup = RELEASE / 'library-before-integration'
    assert not backup.exists(), 'Use this metadata update only once'
    backup.mkdir()
    for name in ['保留素材.json', '分类导航.json', '打开GPT素材.html']:
        shutil.copy2(LIB / name, backup / name)
        assert sha(LIB / name) == sha(backup / name)
    old_links = list(LIB.glob('*/*.lnk'))
    assert len(old_links) == 39
    for p in old_links:
        assert p.resolve().parent.parent == LIB.resolve() and not p.is_symlink()
        target = backup / 'shortcuts' / p.parent.name / p.name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(p, target)
        assert sha(p) == sha(target)
    usage = {'sleeveside':'低频整理袖口，独立间隔至少120秒；也可手动点播', 'skirtbeat':'手动单次小表演', 'cheekpuff':'手动单次小抗议', 'tickledodge':'手动单次躲痒互动', 'fanmishap':'手动持扇场景，结束180毫秒淡化回待机', 'lanterninvite':'手动持灯场景，结束180毫秒淡化回待机'}
    items = json.loads(json.dumps(before))
    for r in items:
        r['integratedVersion'] = manifest['version']
        r['installed'] = True
        if r['candidate'] in added:
            a = added[r['candidate']]
            r.update(group='02_新增接入动作', state=a['state'], master=a['master'], masterSha256=a['masterSha256'], usage=usage[a['state']])
    style = (LIB / '打开GPT素材.html').read_text(encoding='utf-8').split('<style>',1)[1].split('</style>',1)[0]
    link = lambda p, label: '<a href="' + html.escape(Path(p).as_uri(), quote=True) + '">' + html.escape(label) + '</a>'
    cards, nav = [], []
    for group in ['01_正式动作', '02_新增接入动作']:
        selected = [r for r in items if r['group'] == group]
        cards.append('<h2>' + group[3:] + ' · ' + str(len(selected)) + ' 段</h2><div class="grid">')
        (LIB / group).mkdir(exist_ok=True)
        for r in selected:
            links = link(r['source'], '原片')
            if r.get('master'): links += ' · ' + link(r['master'], '透明母版')
            cards.append('<article class="item"><h3>' + html.escape(r['title']) + '</h3><video controls preload="none" src="' + html.escape(Path(r['source']).as_uri(), quote=True) + '"></video><p>' + links + '</p><p>' + html.escape(r.get('usage','已接入程序，可从右键点播小动作查看')) + '</p><small>' + html.escape(r['candidate']) + '</small></article>')
            nav.append(dict(category=group, label=r['title'], target=r['source']))
        cards.append('</div>')
    refs = load(LIB / '角色参考.json')
    cards.append('<h2>角色参考 · 2 张</h2><div class="grid">')
    for r in refs:
        cards.append('<article class="item"><h3>' + html.escape(r['title']) + '</h3>' + link(r['path'],'参考图') + '</article>')
        nav.append(dict(category='04_角色参考', label=r['title'], target=r['path']))
    cards.append('</div>')
    page = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GPT娘素材</title><style>' + style + '</style><h1>GPT娘素材</h1><p>37 段已认可动作均已接入 0.7.1-materials · 2 张角色参考。轻捋长发返工片仍排除，本轮未生成新动作。扇子、提灯为手动场景，持物结束后淡化返回待机。</p><input id="q" placeholder="搜索动作或候选编号">' + ''.join(cards) + '<script>document.getElementById("q").oninput=e=>document.querySelectorAll(".item").forEach(n=>n.hidden=!n.textContent.toLowerCase().includes(e.target.value.toLowerCase()))</script></html>'
    ps = r'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe'
    command = "& ([ScriptBlock]::Create([IO.File]::ReadAllText('" + str(ROOT / 'scripts/create-material-shortcuts.ps1').replace("'","''") + "',[Text.Encoding]::UTF8))) -Library '" + str(LIB).replace("'","''") + "'"
    planned_links = [LIB / r['category'] / ('%04d_%s.lnk' % (i, re.sub(r'[<>:"/\\|?*\x00-\x1f]', '_', r['label'])[:105])) for i, r in enumerate(nav, 1)]
    assert len(set(planned_links)) == 39
    for p in planned_links:
        assert p.parent.resolve().parent == LIB.resolve() and not p.is_symlink()
        assert not p.exists() or p in old_links, 'Unknown shortcut would be overwritten'
    try:
        save(LIB / '保留素材.json', items); save(LIB / '分类导航.json', nav)
        (LIB / '打开GPT素材.html').write_text(page, encoding='utf-8')
        # The fixed list contains generated shortcuts, never their targets.
        for p in old_links: p.unlink()
        subprocess.run([ps,'-NoProfile','-ExecutionPolicy','Bypass','-Command',command], check=True, capture_output=True)
        assert len(list(LIB.glob('*/*.lnk'))) == len(nav) == 39
    except BaseException:
        # Restore the three metadata files and exactly the verified link list.
        # Leave the source videos, masters and unrelated files untouched.
        for p in set(old_links + planned_links):
            assert p.parent.resolve().parent == LIB.resolve() and not p.is_symlink()
            if p.exists():
                assert p.is_file() and p.suffix == '.lnk'
                p.unlink()
        for p in old_links:
            saved = backup / 'shortcuts' / p.parent.name / p.name
            shutil.copy2(saved, p)
            assert sha(saved) == sha(p)
        for name in ['保留素材.json', '分类导航.json', '打开GPT素材.html']:
            shutil.copy2(backup / name, LIB / name)
            assert sha(backup / name) == sha(LIB / name)
        raise
    for r in items: assert sha(Path(r['source'])) == r['sha256']
    save(RELEASE / 'library-integration.json', dict(ok=True, entries=37, integrated=37, uniqueSources=37, references=2, shortcuts=39, sourceMediaMoved=0, sourceMediaDeleted=0, excludedHairRedoStillAbsent=True, backup=str(backup), library=str(LIB)))
    print(json.dumps(dict(ok=True, integrated=37, shortcuts=39, sourceMediaChanged=False), ensure_ascii=False))

if __name__ == '__main__':
    main()
