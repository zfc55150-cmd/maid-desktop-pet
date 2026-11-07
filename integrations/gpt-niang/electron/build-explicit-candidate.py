"""Encode ONE explicitly locked lossless stage master to a NEW workspace candidate.

No production WebM input, source discovery, API calls, config editing, automatic
settling/blending or publication. Geometry must already be reviewed upstream.
"""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def sha256(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for part in iter(lambda: f.read(1048576), b''):
            h.update(part)
    return h.hexdigest()


def preflight(recipe, out):
    out = Path(out).resolve()
    if not out.is_relative_to(ROOT / 'work'):
        raise ValueError('Output must be a new workspace/work directory')
    if out.exists() and any(out.iterdir()):
        raise ValueError('Refusing to overwrite an existing candidate')
    source = Path(recipe['masterPath']).resolve()
    if source.suffix.lower() != '.mkv':
        raise ValueError('Only an explicit lossless MKV master is allowed; delivery WebM is never a master')
    if sha256(source) != recipe['masterSha256']:
        raise ValueError('Master hash mismatch')
    encoder = Path(recipe['ffmpegPath']).resolve()
    if sha256(encoder) != recipe['ffmpegSha256']:
        raise ValueError('Encoder hash mismatch')
    if recipe.get('stage') != {'width': 640, 'height': 360, 'fps': 30}:
        raise ValueError('An explicitly normalized 640x360/30fps master is required')
    if recipe.get('masterCodec') not in ('ffv1', 'png', 'qtrle'):
        raise ValueError('Unsupported lossless master declaration')
    if not isinstance(recipe.get('geometryEvidence'), str) or not recipe['geometryEvidence']:
        raise ValueError('Record upstream geometry review evidence')
    quality = recipe.get('quality', 'crf24')
    if quality not in ('crf24', 'crf16', 'lossless'):
        raise ValueError('Only named A/B quality settings are allowed')
    return source, encoder, out, quality


def build(recipe, output, execute=False):
    source, encoder, out, quality = preflight(recipe, output)
    # Probe before encoding. No imports or calls into old studio generation scripts.
    probe = subprocess.run([str(encoder), '-v', 'info', '-i', str(source), '-f', 'null', '-t', '0', '-'],
                           capture_output=True, text=True, encoding='utf-8', errors='replace', check=True)
    expected = recipe['masterCodec']
    if expected not in probe.stderr or '640x360' not in probe.stderr or '30 fps' not in probe.stderr:
        raise ValueError('Declared lossless master codec/stage does not match media metadata')
    command = [str(encoder), '-v', 'error', '-nostdin', '-n', '-i', str(source),
               '-map', '0:v:0', '-an', '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p',
               '-auto-alt-ref', '0', '-b:v', '0']
    command += ['-lossless', '1'] if quality == 'lossless' else ['-crf', quality[3:]]
    command += [str(out / 'clip.webm')]
    report = {'schemaVersion': 1, 'recipe': recipe, 'command': command,
              'technicalStatus': 'preflight-passed', 'visualStatus': 'pending-human-review',
              'productionFilesChanged': False, 'executed': execute}
    if execute:
        out.mkdir(parents=True, exist_ok=True)
        subprocess.run(command, check=True, capture_output=True)
        report['outputSha256'] = sha256(out / 'clip.webm')
        report['technicalStatus'] = 'encoded-not-visually-approved'
        (out / 'build-manifest.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return report


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--recipe', type=Path, required=True)
    p.add_argument('--out', type=Path, required=True)
    p.add_argument('--execute', action='store_true', help='Encode one candidate after preflight; default is read-only preflight')
    a = p.parse_args()
    print(json.dumps(build(json.loads(a.recipe.read_text(encoding='utf-8-sig')), a.out, a.execute), ensure_ascii=False, indent=2))
