import hashlib, json, pathlib, sys, zipfile

stage = pathlib.Path(sys.argv[1]).resolve()
receipt = json.loads((stage / 'rollback-backup.json').read_text('utf-8'))
root = pathlib.Path(pathlib.Path(os.environ.get('LOCALAPPDATA', str(pathlib.Path.home() / 'AppData/Local'))) / 'Programs/GPTNiangUsage/gpt-niang-usage')
def digest(stream):
    h = hashlib.sha256()
    for chunk in iter(lambda: stream.read(65536), b''):
        h.update(chunk)
    return h.hexdigest()
with open(receipt['archive'], 'rb') as stream:
    if digest(stream) != receipt['sha256']:
        raise RuntimeError('ROLLBACK_ARCHIVE_HASH')
new = json.loads((root / 'electron-deployment.json').read_text('utf-8-sig'))
if new['version'] != '0.8.0-electron':
    raise RuntimeError('ROLLBACK_VERSION')
changed = {r['path']: r['sha256'] for r in new['rootFiles']}
with zipfile.ZipFile(receipt['archive']) as archive:
    manifest = json.loads(archive.read('ROLLBACK-MANIFEST.json'))
    for row in manifest['files']:
        target = (root / row['path']).resolve()
        if root not in target.parents:
            raise RuntimeError('ROLLBACK_PATH')
        if target.exists():
            with target.open('rb') as stream:
                if digest(stream) not in (row['sha256'], changed.get(row['path'])):
                    raise RuntimeError('ROLLBACK_CONCURRENT_CHANGE:' + row['path'])
        with archive.open(row['path']) as stream:
            if digest(stream) != row['sha256']:
                raise RuntimeError('ROLLBACK_ENTRY_HASH')
    for row in manifest['files']:
        target = root / row['path']
        target.parent.mkdir(parents=True, exist_ok=True)
        with archive.open(row['path']) as source, target.open('wb') as destination:
            for chunk in iter(lambda: source.read(65536), b''):
                destination.write(chunk)
        with target.open('rb') as stream:
            if digest(stream) != row['sha256']:
                raise RuntimeError('ROLLBACK_RESTORE_HASH')
active = json.loads((root / 'active-version.json').read_text('utf-8-sig'))
if active['version'] != '0.8.0-electron':
    raise RuntimeError('ROLLBACK_ACTIVE_DRIFT')
(root / 'active-version.json').unlink()
(root / 'electron-deployment.json').unlink()
(stage / 'rollback-result.json').write_text(json.dumps({'ok': True, 'version': manifest['baseline'], 'restoredFiles': len(manifest['files']), 'personalStateWritten': False}), 'utf-8')
print(json.dumps({'ok': True, 'restoredFiles': len(manifest['files'])}))
