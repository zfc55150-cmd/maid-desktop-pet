"""Build an offline, unpublished DeepSeek repair candidate from a verified ZIP."""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile

from importlib.machinery import SourceFileLoader
ROOT = Path(__file__).resolve().parents[1]
base_builder = SourceFileLoader('portable_builder', str(ROOT / 'scripts/build-deepseek-portable-reminder.py')).load_module()
HELPER = 'node_modules/dsh-pet/runtime/electron-helper/'
ASSETS = 'node_modules/dsh-pet/assets/'
EXPECTED = 'dbdc4a61935dd75e148768f86dc0db681f62fbe6b2e7f8c385c49db5a4a9c49b'
NAME = 'DeepSeekActionPet-v1.0.3-win-x64'

def replace_once(data, old, new):
    old, new = old.encode(), new.encode()
    if data.count(old) != 1:
        raise ValueError('Expected unique source anchor: ' + repr(old))
    return data.replace(old, new, 1)

def restore_name(name):
    if not name.startswith(ASSETS):
        return name
    try:
        return name.encode('cp437').decode('gbk')
    except UnicodeError:
        return name

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--base', required=True, type=Path)
    parser.add_argument('--out', required=True, type=Path)
    args = parser.parse_args()
    if args.base.name != 'DeepSeekActionPet-v1.0.2-win-x64.zip' or base_builder.sha256(args.base) != EXPECTED:
        raise ValueError('Base ZIP does not match the checked v1.0.2 candidate')
    args.out.mkdir(parents=True, exist_ok=True)
    target = args.out / (NAME + '.zip')
    with zipfile.ZipFile(args.base) as src:
        entries = base_builder.safe_entries(src, args.base.stem)
        names = {old: restore_name(old) for old in entries}
        if len(set(n.casefold() for n in names.values())) != len(names):
            raise ValueError('Filename collision after encoding repair')
        if sum(a != b for a, b in names.items()) != 133:
            raise ValueError('Unexpected filename encoding baseline')
        if ASSETS + 'fonts/上首软糖体.ttf' not in names.values():
            raise ValueError('Expected font path was not restored')
        launcher = src.read(entries['launcher.mjs'])
        launcher = replace_once(launcher, '  if (stop) return;', """  if (stop) return;
  require('./portable/first-run.cjs').ensureFirstRun(appRoot, home);
  require(join(helper, 'pet-appearance-store.js')).readProtectedAppearance(join(home, 'dsh-pet', 'main-config.jsonc'));""")
        mainfile = src.read(entries[HELPER + 'main.js'])
        mainfile = replace_once(mainfile, "app.setName('dsh-pet-electron-helper');",
            """app.setName('dsh-pet-electron-helper');
if (process.env.DSH_HOME) app.setPath('userData', require('node:path').join(process.env.DSH_HOME, 'electron-profile'));""")
        stop = (ROOT / 'integrations/deepseek-portable/stop.ps1').read_bytes()
        first = (ROOT / 'integrations/deepseek-portable/first-run.cjs').read_bytes()
        readme = """# DeepSeek 娘便携版候选

本包为本地修复验证候选，素材授权尚未核实，不作为正式公开发行包。
完整解压到可写目录，运行 Start-DeepSeek-Niang.cmd；停止运行 Stop-DeepSeek-Niang.cmd。
首次启动从包内默认配置创建 state/dsh-pet/main-config.jsonc；已有配置和恢复副本不会被替换。
状态和 Electron 配置位于包内 state；默认端口 3089，可通过 DSH_PET_PORT 调整。
聊天请求会发送到 DeepSeek；自动长期记忆可能产生额外请求。需自行配置 API Key。
本包未包含离线语音环境。删除 state 会清除该便携副本的本地数据。
若退出失败，请查看提示，程序不会强制结束其他进程。
"""
        stop_cmd = b'''@echo off\r
setlocal\r
set "PETROOT=%~dp0"\r
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PETROOT%portable\\stop.ps1" -Root "%PETROOT%."\r
if errorlevel 1 (echo [ERROR] Could not stop safely. & pause & exit /b 1)\r
echo [DeepSeek-Niang portable] stopped.\r
endlocal\r
exit /b 0\r
'''
        changes = {'launcher.mjs': launcher, HELPER+'main.js': mainfile,
                   'portable/stop.ps1': stop, 'portable/first-run.cjs': first,
                   HELPER+'release-tag.json': b'{"tag":"v1.0.3"}\n',
                   'PORTABLE-README.md': readme.encode(),
                   'Stop-DeepSeek-Niang.cmd': stop_cmd,
                   '停止DeepSeek娘 (Stop DeepSeek-Niang).cmd': stop_cmd}
        stream = target.open('xb')
        try:
            with stream:
                with zipfile.ZipFile(stream, 'w', zipfile.ZIP_DEFLATED, compresslevel=5) as dst:
                    for old, info in entries.items():
                        name = names[old]
                        dst.writestr(NAME + '/' + name, changes.get(name, src.read(info)))
                    dst.writestr(NAME + '/portable/first-run.cjs', first)
            with zipfile.ZipFile(target) as result:
                actual = base_builder.safe_entries(result, NAME)
                if result.testzip() is not None or set(actual) != set(names.values()) | {'portable/first-run.cjs'}:
                    raise ValueError('Output archive verification failed')
                for old, info in entries.items():
                    name = names[old]
                    expected = changes.get(name, src.read(info))
                    if result.read(actual[name]) != expected:
                        raise ValueError('Output content mismatch: ' + name)
        except BaseException:
            stream.close()
            target.unlink(missing_ok=True)
            raise
    print(json.dumps({'candidate': str(target.resolve()), 'sha256': base_builder.sha256(target),
                      'bytes': target.stat().st_size, 'renamed': 133, 'publishable': False}, ensure_ascii=False))

if __name__ == '__main__':
    main()
