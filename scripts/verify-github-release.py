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

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--parts',required=True)
    args=parser.parse_args()
    root=Path(args.parts)
    manifest=json.loads((root/'parts-manifest.json').read_text(encoding='utf-8'))
    expected={p['name']:{'size':p['bytes'],'digest':'sha256:'+p['sha256']} for p in manifest['parts']}
    for name in ['parts-manifest.json','merge-share.ps1','Merge-Then-Extract.cmd','Download-and-Install.txt',
                 'split-validation.json','download-share.ps1','Download-All.cmd']:
        data=(root/name).read_bytes()
        expected[name]={'size':len(data),'digest':'sha256:'+hashlib.sha256(data).hexdigest()}
    release=fetch('https://api.github.com/repos/zfc55150-cmd/DeepSeekActionPet-Share/releases/tags/v1.2.1')
    if release['draft'] or release['tag_name']!='v1.2.1':raise ValueError('Release is not public v1.2.1')
    assets=fetch(release['assets_url']+'?per_page=100')
    actual={a['name']:a for a in assets}
    if len(actual)!=len(assets) or set(actual)!=set(expected):raise ValueError('Release asset names differ from local set')
    for name,item in expected.items():
        remote=actual[name]
        if remote['state']!='uploaded' or any(remote.get(k)!=v for k,v in item.items()):
            raise ValueError('Remote asset hash/size/state mismatch: '+name)
    result={'release':release['html_url'],'public':True,'assets':len(actual),'parts':len(manifest['parts']),
            'allRemoteDigestsAndSizesMatched':True,'originalZipSha256':manifest['zipSha256']}
    output=Path(__file__).resolve().parent.parent/'work/github-release-validation.json'
    output.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(result,ensure_ascii=True))

if __name__=='__main__':main()
