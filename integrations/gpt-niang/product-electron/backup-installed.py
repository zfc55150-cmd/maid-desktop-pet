"""Verified application-only rollback archive. Personal state is outside this tree."""
import hashlib, json, pathlib, sys, zipfile

stage = pathlib.Path(sys.argv[1]).resolve()
baseline = json.loads((stage / 'baseline.json').read_text('utf-8-sig'))
root = pathlib.Path(baseline['gptRoot']).resolve()
if str(root).lower() != pathlib.Path(os.environ.get('LOCALAPPDATA', str(pathlib.Path.home() / 'AppData/Local'))) / 'Programs/GPTNiangUsage/gpt-niang-usage'.lower():
    raise RuntimeError('BACKUP_ROOT')
target = pathlib.Path(r'D:\Codex_归档\GPT娘Electron正式迁移-20261102\旧WPF-0.7.3-idle-variety.1.zip')
if target.exists():
    raise RuntimeError('FRESH_BACKUP_REQUIRED')

def digest(stream):
    h = hashlib.sha256()
    while True:
        data = stream.read(65536)
        if not data:
            return h.hexdigest()
        h.update(data)

for row in baseline['gptFiles']:
    with (root / row['target']).open('rb') as stream:
        if digest(stream) != row['sha256']:
            raise RuntimeError('BASELINE_DRIFT: ' + row['target'])

files = []
for file in root.rglob('*'):
    if file.is_symlink():
        raise RuntimeError('BACKUP_LINK')
    if not file.is_file():
        continue
    relative = file.relative_to(root).as_posix()
    if relative.startswith('versions/'):
        raise RuntimeError('BASELINE_ALREADY_PROMOTED')
    if file.name.lower() in ('chat.json', '.env', 'auth.json') or 'credential' in file.name.lower():
        raise RuntimeError('UNEXPECTED_PERSONAL_FILE')
    with file.open('rb') as stream:
        files.append({'path': relative, 'bytes': file.stat().st_size, 'sha256': digest(stream)})

target.parent.mkdir(parents=True, exist_ok=True)
manifest = {'baseline': baseline['gptVersion'], 'root': str(root), 'files': files, 'personalStateIncluded': False}
with zipfile.ZipFile(target, 'x', compression=zipfile.ZIP_STORED, allowZip64=True) as archive:
    for row in files:
        archive.write(root / row['path'], row['path'])
    archive.writestr('ROLLBACK-MANIFEST.json', json.dumps(manifest, ensure_ascii=False, indent=2))
with zipfile.ZipFile(target) as archive:
    for row in files:
        with archive.open(row['path']) as stream:
            if digest(stream) != row['sha256']:
                raise RuntimeError('ARCHIVE_VERIFY: ' + row['path'])
with target.open('rb') as stream:
    receipt = {'archive': str(target), 'sha256': digest(stream), 'files': len(files), 'bytes': target.stat().st_size, 'verified': True, 'personalStateIncluded': False}
(stage / 'rollback-backup.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2), 'utf-8')
target.with_suffix('.receipt.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2), 'utf-8')
print(json.dumps(receipt, ensure_ascii=False))
