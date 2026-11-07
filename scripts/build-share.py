"""Build a current, self-contained friend share; never reads the personal-data root."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import struct
import time
import zipfile

ROOT = Path(__file__).resolve().parent.parent
TOP = {'electron', 'icons', 'node_modules', 'voice-runtime', 'launcher.mjs', 'node.exe', 'package.json', 'pnpm-lock.yaml', 'start.vbs', 'stop.vbs'}
SKIP_DIR = {'__pycache__', 'cache', '.cache', '.git'}

def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(8*1024*1024), b''):
            h.update(block)
    return h.hexdigest()

def payload(root):
    for directory, folders, files in os.walk(root, followlinks=False):
        parent = Path(directory)
        folders[:] = sorted(f for f in folders if f not in SKIP_DIR and (parent != root or f in TOP))
        for name in folders + files:
            item = parent / name
            if item.is_symlink() or item.stat().st_file_attributes & 0x400:
                raise ValueError('Reparse point refused: ' + str(item))
        for name in sorted(files):
            if parent == root and name not in TOP:
                continue
            low = name.lower()
            if (low.endswith(('.pyc', '.log', '.tmp', '.bak', '.key')) or
                (low.endswith('.pem') and low != 'cacert.pem') or
                low.startswith(('chat.json', '.env')) or
                low in {'control-session.json', 'main-config.jsonc', 'download-manifest.json', '.npmrc', '.pypirc'}):
                continue
            yield parent / name

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--installed', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    if struct.calcsize('P') < 8:
        raise RuntimeError('Use 64-bit Python, for example voice-runtime/python-base/python.exe from the installed program')
    root = Path(args.installed).resolve()
    out = Path(args.output).resolve()
    if root.name != 'DeepSeekActionPet' or out == root or root in out.parents:
        raise ValueError('Invalid archive boundary')
    deployment = json.loads((ROOT/'deployment.json').read_text(encoding='utf-8'))
    version = deployment['version']
    for item in deployment['files']:
        if sha(root/item['target']) != item['sha256']:
            raise ValueError('Installed source mismatch: ' + item['target'])
    files = list(payload(root))
    for required in ['node.exe', 'electron/electron.exe', 'voice-runtime/venv/Scripts/python.exe', 'voice-runtime/model/model.safetensors']:
        if root/required not in files:
            raise ValueError('Missing runtime: ' + required)
    out.mkdir(parents=True, exist_ok=True)
    archive = out/f'蓝鲸女仆桌宠-{version}-朋友分享包.zip'
    temporary = archive.with_suffix('.zip.partial')
    if archive.exists() or temporary.exists():
        raise FileExistsError('Archive or partial archive already exists')
    manifest = []
    last = time.monotonic()
    with zipfile.ZipFile(temporary, 'w', zipfile.ZIP_DEFLATED, compresslevel=1, allowZip64=True) as packed:
        for file in files:
            rel = file.relative_to(root).as_posix()
            h = hashlib.sha256()
            size = 0
            with packed.open('program/'+rel, 'w', force_zip64=True) as dst:
                if rel == 'voice-runtime/venv/pyvenv.cfg':
                    blocks = [b'home = ../python-base\ninclude-system-site-packages = false\nversion = 3.12.14\n']
                    for block in blocks:
                        dst.write(block); h.update(block); size += len(block)
                else:
                    with file.open('rb') as src:
                        for block in iter(lambda: src.read(4*1024*1024), b''):
                            dst.write(block); h.update(block); size += len(block)
            manifest.append({'path':rel, 'bytes':size, 'sha256':h.hexdigest()})
            if time.monotonic()-last > 15:
                print(json.dumps({'stage':'packing', 'files':len(manifest), 'total':len(files)}), flush=True)
                last = time.monotonic()
        packed.writestr('program/recovery-manifest.json', json.dumps({'version':version, 'files':manifest}, ensure_ascii=False, indent=2))
        packed.writestr('install-share.ps1', b'\xef\xbb\xbf'+(ROOT/'scripts/install-share.ps1').read_bytes())
        packed.writestr('安装桌宠.cmd', '@echo off\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-share.ps1"\r\nif errorlevel 1 echo Installation failed. Please keep the error message.\r\npause\r\n')
        packed.write(ROOT/'docs/朋友分享包使用说明.txt', '先看我-使用说明.txt')
    print(json.dumps({'stage':'verifying', 'files':len(manifest)}), flush=True)
    with zipfile.ZipFile(temporary) as packed:
        for n, item in enumerate(manifest):
            h = hashlib.sha256()
            with packed.open('program/'+item['path']) as src:
                for block in iter(lambda:src.read(8*1024*1024), b''):
                    h.update(block)
            if h.hexdigest() != item['sha256']:
                raise ValueError('Archive hash mismatch: '+item['path'])
            if time.monotonic()-last > 15:
                print(json.dumps({'stage':'verifying','files':n+1,'total':len(manifest)}), flush=True)
                last = time.monotonic()
        for name in ['install-share.ps1', '安装桌宠.cmd', '先看我-使用说明.txt']:
            packed.read(name)  # CRC check of installer and instructions
    temporary.rename(archive)
    result = {'version':version, 'archive':archive.name, 'archiveBytes':archive.stat().st_size,
              'sha256':sha(archive), 'programFiles':len(manifest), 'allProgramEntriesHashVerified':True,
              'personalDataRootRead':False, 'deploymentFilesVerified':len(deployment['files'])}
    (out/'分享包校验.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False), flush=True)

if __name__ == '__main__':
    main()
