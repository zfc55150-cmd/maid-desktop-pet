"""Compare public GitHub release asset digests and sizes with local portable archives or legacy split parts."""
import argparse
import hashlib
import json
import os
from pathlib import Path
from urllib.request import Request, urlopen

def fetch(url):
    headers = {'User-Agent': 'DeepSeekPet-release-verification', 'Accept': 'application/vnd.github+json'}
    token = os.environ.get('GITHUB_TOKEN') or os.environ.get('GH_TOKEN')
    if token:
        headers['Authorization'] = f'Bearer {token}'
    request = Request(url, headers=headers)
    with urlopen(request, timeout=45) as response:
        return json.load(response)

ROOT=Path(__file__).resolve().parent.parent


def default_release_tag():
    pkg_file=ROOT/'package.json'
    if pkg_file.is_file():
        tag=json.loads(pkg_file.read_text(encoding='utf-8')).get('releaseTag')
        if tag:return str(tag)
    return 'v1.0.11'


def build_expected_from_portable_dir(portable_dir: Path) -> dict:
    sums_file = portable_dir / 'SHA256SUMS.txt'
    if not sums_file.is_file():
        raise ValueError(f'Missing SHA256SUMS.txt in {portable_dir}')
    raw_sums = sums_file.read_bytes()
    if raw_sums.startswith(b'\xef\xbb\xbf'):
        raise ValueError('SHA256SUMS.txt must not contain UTF-8 BOM')
    try:
        sums_text = raw_sums.decode('ascii')
    except UnicodeDecodeError as exc:
        raise ValueError('SHA256SUMS.txt must be pure ASCII') from exc
    expected = {
        'SHA256SUMS.txt': {'size': len(raw_sums), 'digest': 'sha256:' + hashlib.sha256(raw_sums).hexdigest()}
    }
    for line in sums_text.splitlines():
        line = line.strip()
        if not line:
            continue
        parts = line.split(None, 1)
        if len(parts) != 2:
            raise ValueError(f'Invalid SHA256SUMS.txt line: {line}')
        digest_hex, name = parts[0].lower(), parts[1].strip()
        asset = portable_dir / name
        if not asset.is_file():
            raise ValueError(f'Missing local release asset listed in SHA256SUMS.txt: {name}')
        data = asset.read_bytes()
        actual_hex = hashlib.sha256(data).hexdigest().lower()
        if actual_hex != digest_hex:
            raise ValueError(f'Local SHA256SUMS.txt mismatch for {name}')
        expected[name] = {'size': len(data), 'digest': 'sha256:' + actual_hex}
    if len(expected) < 2 or not any(name.lower().endswith('.zip') for name in expected if name != 'SHA256SUMS.txt'):
        raise ValueError('SHA256SUMS.txt must list at least one release .zip archive')
    return expected


def main():
    parser=argparse.ArgumentParser()
    group=parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--parts',help='Legacy split-share parts directory')
    group.add_argument('--portable-dir',help='Portable release output directory containing ZIPs and SHA256SUMS.txt')
    parser.add_argument('--repo',default='zfc55150-cmd/maid-desktop-pet')
    parser.add_argument('--tag',default=default_release_tag())
    args=parser.parse_args()
    if args.portable_dir:
        expected=build_expected_from_portable_dir(Path(args.portable_dir))
        extra_meta={'mode':'portable'}
    else:
        root=Path(args.parts)
        manifest=json.loads((root/'parts-manifest.json').read_text(encoding='utf-8'))
        expected={p['name']:{'size':p['bytes'],'digest':'sha256:'+p['sha256']} for p in manifest['parts']}
        for name in ['parts-manifest.json','merge-share.ps1','Merge-Then-Extract.cmd','Download-and-Install.txt',
                     'split-validation.json','download-share.ps1','Download-All.cmd']:
            data=(root/name).read_bytes()
            expected[name]={'size':len(data),'digest':'sha256:'+hashlib.sha256(data).hexdigest()}
        extra_meta={'mode':'parts','parts':len(manifest['parts']),'originalZipSha256':manifest['zipSha256']}
    release=fetch(f'https://api.github.com/repos/{args.repo}/releases/tags/{args.tag}')
    if release.get('draft') or release.get('prerelease') or release.get('tag_name')!=args.tag:raise ValueError(f'Release is not public {args.tag}')
    assets=fetch(release['assets_url']+'?per_page=100')
    actual={a['name']:a for a in assets}
    if len(actual)!=len(assets) or set(actual)!=set(expected):raise ValueError('Release asset names differ from local set')
    for name,item in expected.items():
        remote=actual[name]
        if remote['state']!='uploaded' or any(remote.get(k)!=v for k,v in item.items()):
            raise ValueError('Remote asset hash/size/state mismatch: '+name)
    result={'release':release['html_url'],'public':True,'assets':len(actual),
            'allRemoteDigestsAndSizesMatched':True,**extra_meta}
    output=ROOT/'work/github-release-validation.json'
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(result,ensure_ascii=True))

if __name__=='__main__':main()
