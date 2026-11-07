"""Export the current small code update; never include runtime models or personal data."""
import argparse
import hashlib
import importlib.util
import json
import pathlib
import re
import shutil
import zipfile


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    root = pathlib.Path(__file__).resolve().parent.parent
    out = pathlib.Path(args.output).resolve()
    version = json.loads((root / 'package.json').read_text(encoding='utf-8'))['version']
    manifest = json.loads((root / 'deployment.json').read_text(encoding='utf-8'))
    if manifest['version'] != version:
        raise ValueError('Deployment version mismatch')
    for item in manifest['files']:
        source = (root / item['source']).resolve()
        if not source.is_relative_to(root) or hashlib.sha256(source.read_bytes()).hexdigest() != item['sha256']:
            raise ValueError('Unverified deployment source')
    out.mkdir(parents=True, exist_ok=True)
    archive = out / f'源码与代码更新-{version}.zip'
    if archive.exists():
        raise FileExistsError(archive)
    allowed = ['.gitattributes', '.gitignore', 'AGENTS.md', 'README.md', 'package.json', 'deployment.json', 'app', 'baseline', 'docs', 'scripts', 'tests']
    files = []
    for name in allowed:
        item = root / name
        if not item.exists():
            continue
        for source in ([item] if item.is_file() else sorted(item.rglob('*'))):
            if '__pycache__' in source.parts or source.suffix == '.pyc':
                continue
            if source.is_symlink() or getattr(source.stat(), 'st_file_attributes', 0) & 0x400:
                raise ValueError('Refusing reparse point')
            if source.is_file():
                if source.name.startswith('chat.json') or source.name in ['control-session.json'] or source.suffix == '.log':
                    raise ValueError('Personal data boundary violation')
                files.append(source)
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as packed:
        for source in files:
            packed.write(source, source.relative_to(root).as_posix())
    with zipfile.ZipFile(archive) as packed:
        if packed.testzip() is not None:
            raise ValueError('Update archive verification failed')
    shutil.copy2(root / 'docs/自动记忆说明.md', out / '自动记忆说明.md')
    spec = importlib.util.spec_from_file_location('report_renderer', root / 'scripts/export-deliverables.py')
    renderer = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(renderer)
    body = renderer.render_markdown((root / 'docs/自动记忆说明.md').read_text(encoding='utf-8'))
    page = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>蓝鲸女仆 · 自动记忆说明</title><style>body{margin:0;background:#f3f6fb;color:#24354b;font:15px/1.85 "Microsoft YaHei","Segoe UI",sans-serif}main{max-width:940px;margin:28px auto;padding:28px 38px;background:white;border:1px solid #dce5f0;border-radius:14px}h1{font-size:27px}h2{font-size:21px;margin-top:28px}p,li{overflow-wrap:anywhere}code{font:13px Consolas,monospace}a{color:#235f99}@media(max-width:650px){main{margin:0;padding:18px;border:0;border-radius:0}}</style><main>' + body + '</main></html>'
    (out / '自动记忆说明.html').write_text(page, encoding='utf-8')
    shutil.copy2(root / 'deployment.json', out / 'deployment.json')
    shutil.copy2(root / 'work/verification/latest.json', out / '本轮检查.json')
    shutil.copy2(root / 'work/memory-electron/result.json', out / '界面检查.json')
    result = {'version': version, 'archive': archive.name, 'bytes': archive.stat().st_size, 'sha256': hashlib.sha256(archive.read_bytes()).hexdigest(), 'sourceFiles': len(files), 'includesModels': False, 'includesPersonalData': False}
    (out / '更新包校验.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    original = out.parents[1] / '报告/蓝鲸女仆桌宠报告.html'
    if original.exists():
        content = original.read_text(encoding='utf-8-sig')
        shutil.copy2(original, out / '更新前报告.html')
        link = '../维护版本/' + out.name + '/自动记忆说明.html'
        banner = '<aside id="maintenance-update" style="background:#eaf4ef;border:1px solid #a9d0bd;padding:16px 20px;border-radius:10px;margin-bottom:24px"><strong>当前程序已更新到维护版 ' + version + '，已开启自动长期记忆。</strong>本页保留原使用报告快照，最新功能与使用方式请查看 <a href="' + link + '">自动记忆说明</a>。</aside>'
        if 'id="maintenance-update"' in content:
            content = re.sub(r'<aside id="maintenance-update"[\s\S]*?</aside>', lambda _: banner, content, count=1)
        else:
            content = content.replace('<main>', '<main>' + banner, 1)
        original.write_text(content, encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
