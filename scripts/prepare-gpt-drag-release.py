"""Build a one-module delta against the preserved, installed WPF fork."""
from pathlib import Path
import hashlib
import json
import shutil

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'work/gpt-candidate-b-trial-20261101-04'
OUT = ROOT / 'work/gpt-drag-release-20261101-03'
TARGET = 'runtime/dragon-animation/motion-selection.ps1'
load = lambda p: json.loads(p.read_text(encoding='utf-8-sig'))
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
def save(p, obj):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

m = load(BASE / 'deployment.json')
installed = Path(m['targetRoot'])
expected = {e['target']: e['sha256'] for e in m['hostFiles'] + m['files']}
preserved_hover = 'runtime/pet-forms.ps1'
if sha(installed / preserved_hover) == '417385707bf825ef4317b0aff7bc0281739ccdae06f48756f9776d20940fb753':
    expected[preserved_hover] = sha(installed / preserved_hover)
drift = [k for k, v in expected.items() if sha(installed / k) != v]
assert not drift, f'Installed baseline changed: {drift}'
assert not OUT.exists(), 'Use a new package directory'
OUT.mkdir()
old = (installed / TARGET).read_bytes()
before = b'''     $script:dragonLastDrawnSerial-eq $script:dragonClipSerial -and\r\n     $script:dragonFrameIndex-eq [int]$script:dragonManifest.states.$air.frames-1){return $landing}\r\n  # The available landing was conditioned on the exact final airborne pose.\r\n  # An early release gets the existing relaxed return, with no long wait,\r\n  # fabricated frame, or claim that this fallback is a native landing.'''
after = b'''     $script:dragonLastDrawnSerial-ge 0 -and\r\n     $script:dragonLastDrawnSerial-eq $script:dragonClipSerial -and\r\n     (Test-DragonClipAvailable $landing)){return $landing}\r\n  # A normal release may land from any presented airborne frame. The renderer\r\n  # retains its exact-tail native-join check; early releases use its existing\r\n  # 180ms crossfade from the visible frame, without waiting out the flight.'''
def patched(raw):
    a, b = (before, after) if b'\r\n' in raw else (before.replace(b'\r\n', b'\n'), after.replace(b'\r\n', b'\n'))
    assert raw.count(a) == 1
    return raw.replace(a, b)
new = patched(old)
dest = OUT / 'files' / TARGET
dest.parent.mkdir(parents=True)
dest.write_bytes(new)
save(OUT / 'source-baseline.json', {'target': TARGET, 'sha256': hashlib.sha256(old).hexdigest(), 'installedSourcePreserved': True})
(OUT / 'before.ps1').write_bytes(old)
# Apply the same bounded patch to the historical maintenance module; the
# package itself retains all additional code of the current installed fork.
canonical = ROOT / 'integrations/gpt-niang/animated/motion-selection.ps1'
raw = canonical.read_bytes()
if b'# A normal release may land from any presented airborne frame.' not in raw:
    canonical.write_bytes(patched(raw))
m['hostFiles'] = [dict(target=k, sha256=v) for k, v in expected.items() if k != TARGET]
m['files'] = [dict(target=TARGET, sha256=sha(dest), previousSha256=hashlib.sha256(old).hexdigest())]
m['version'] = '0.7.3-drag-release.1'
# Existing installer requires its unchanged stable helper as an identity pin.
(OUT / 'agent-files').mkdir()
shutil.copyfile(BASE / 'agent-files/update-helper.ps1', OUT / 'agent-files/update-helper.ps1')
save(OUT / 'deployment.json', m)
for name in ('apply-update.ps1', 'maintenance-runner.ps1', 'verify-installed.cjs', 'merge-hooks.cjs', 'dragon-hooks.json'):
    shutil.copyfile(BASE / name, OUT / name)
entry = (BASE / 'reviewed-delta.ps1').read_text(encoding='utf-8-sig')
entry = entry.replace("'runtime/dragon-animation/animation.json'", repr(TARGET))
names = ['deployment.json', 'source-baseline.json', 'apply-update.ps1', 'maintenance-runner.ps1', 'verify-installed.cjs', 'merge-hooks.cjs', 'dragon-hooks.json', 'files/' + TARGET, 'agent-files/update-helper.ps1']
save(OUT / 'package-integrity.json', {'schema': 1, 'files': [dict(path=n, sha256=sha(OUT / n)) for n in names]})
entry = entry.replace('38891495ca8bb1b231f4044935130e7ba2a0fa21b9c5ed76f0ba1b7c3bbea935', sha(OUT / 'package-integrity.json'))
(OUT / 'reviewed-delta.ps1').write_text(entry, encoding='utf-8')
print(json.dumps({'package': str(OUT), 'files': m['files'], 'preservedDependencies': len(m['hostFiles'])}))
