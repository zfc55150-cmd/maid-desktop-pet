"""Compare public GitHub asset digests and sizes with the verified local split."""
import argparse
import hashlib
import json
from pathlib import Path
from urllib.request import Request, urlopen

def fetch(url):
    request=Request(url,headers={'User-Agent':'DeepSeekPet-release-verification','Accept':'application/vnd.github+json'})
    with urlopen(request,timeout=45) as response:
        return json.load(response)

ROOT=Path(__file__).resolve().parent.parent


def default_release_tag():
    pkg_file=ROOT/'package.json'
    if pkg_file.is_file():
        tag=json.loads(pkg_file.read_text(encoding='utf-8')).get('releaseTag')
        if tag:return str(tag)
    return 'v1.0.7'


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--parts',required=True)
    parser.add_argument('--repo',default='zfc55150-cmd/maid-desktop-pet')
    parser.add_argument('--tag',default=default_release_tag())
    args=parser.parse_args()
    root=Path(args.parts)
    manifest=json.loads((root/'parts-manifest.json').read_text(encoding='utf-8'))
    expected={p['name']:{'size':p['bytes'],'digest':'sha256:'+p['sha256']} for p in manifest['parts']}
    for name in ['parts-manifest.json','merge-share.ps1','Merge-Then-Extract.cmd','Download-and-Install.txt',
                 'split-validation.json','download-share.ps1','Download-All.cmd']:
        data=(root/name).read_bytes()
        expected[name]={'size':len(data),'digest':'sha256:'+hashlib.sha256(data).hexdigest()}
    release=fetch(f'https://api.github.com/repos/{args.repo}/releases/tags/{args.tag}')
    if release.get('draft') or release.get('prerelease') or release.get('tag_name')!=args.tag:raise ValueError(f'Release is not public {args.tag}')
    assets=fetch(release['assets_url']+'?per_page=100')
    actual={a['name']:a for a in assets}
    if len(actual)!=len(assets) or set(actual)!=set(expected):raise ValueError('Release asset names differ from local set')
    for name,item in expected.items():
        remote=actual[name]
        if remote['state']!='uploaded' or any(remote.get(k)!=v for k,v in item.items()):
            raise ValueError('Remote asset hash/size/state mismatch: '+name)
    result={'release':release['html_url'],'public':True,'assets':len(actual),'parts':len(manifest['parts']),
            'allRemoteDigestsAndSizesMatched':True,'originalZipSha256':manifest['zipSha256']}
    output=ROOT/'work/github-release-validation.json'
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(result,ensure_ascii=True))

if __name__=='__main__':main()
