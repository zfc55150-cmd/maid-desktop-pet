"""Split a verified ZIP into Release attachments, with a verified Windows merger."""
import argparse
import hashlib
import json
import math
from pathlib import Path

MERGE = r'''param()
$ErrorActionPreference='Stop'
function Get-Sha([string]$Path) {
 $hash=New-Object Security.Cryptography.SHA256CryptoServiceProvider
 $file=[IO.File]::OpenRead($Path)
 $stream=New-Object IO.BufferedStream($file,1048576)
 try{return [BitConverter]::ToString($hash.ComputeHash($stream)).Replace('-','').ToLowerInvariant()}
 finally{$stream.Dispose();$hash.Dispose()}
}
$manifest=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'parts-manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$output=Join-Path $PSScriptRoot 'DeepSeekPet-1.2.1.zip'
$temporary=$output+'.partial'
if((Test-Path -LiteralPath $output) -or (Test-Path -LiteralPath $temporary)){throw 'Output ZIP or partial already exists. Nothing was overwritten.'}
foreach($part in $manifest.parts){
 if($part.name -notmatch '^DeepSeekPet-1\.2\.1\.zip\.part[0-9]{2}$'){throw 'Invalid part name'}
 $path=Join-Path $PSScriptRoot $part.name
 Write-Host ('Checking '+$part.name)
 if((Get-Sha $path) -ne $part.sha256){throw ('Part corrupted: '+$part.name)}
}
$destination=[IO.File]::Create($temporary)
try{
 foreach($part in $manifest.parts){
  $source=[IO.File]::OpenRead((Join-Path $PSScriptRoot $part.name))
  try{$source.CopyTo($destination,1048576)}finally{$source.Dispose()}
 }
}finally{$destination.Dispose()}
Write-Host 'Checking complete ZIP...'
if((Get-Sha $temporary) -ne $manifest.zipSha256){throw 'Merged ZIP hash mismatch; partial preserved for inspection.'}
[IO.File]::Move($temporary,$output)
Write-Host 'Done. Extract DeepSeekPet-1.2.1.zip, then run the install CMD inside.'
'''

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--archive',required=True)
    parser.add_argument('--output',required=True)
    parser.add_argument('--part-bytes',type=int,default=1_900_000_000)
    args=parser.parse_args()
    archive=Path(args.archive)
    if not 0 < args.part_bytes < 2*1024**3:raise ValueError('Invalid part size')
    count=math.ceil(archive.stat().st_size/args.part_bytes)
    if count>99:raise ValueError('Too many parts')
    check=json.loads((archive.parent/'分享包校验.json').read_text(encoding='utf-8-sig'))
    out=Path(args.output)
    out.mkdir(parents=True,exist_ok=False)
    manifest={'version':'1.2.1','zipName':'DeepSeekPet-1.2.1.zip','zipSha256':check['sha256'],'parts':[]}
    whole=hashlib.sha256()
    with archive.open('rb') as source:
        for number in range(1,count+1):
            part=out/f'DeepSeekPet-1.2.1.zip.part{number:02d}'
            remaining=args.part_bytes
            size=0
            h=hashlib.sha256()
            with part.open('xb') as target:
                while remaining:
                    block=source.read(min(1024*1024,remaining))
                    if not block:break
                    target.write(block);h.update(block);whole.update(block)
                    size+=len(block);remaining-=len(block)
            manifest['parts'].append({'name':part.name,'bytes':size,'sha256':h.hexdigest()})
            print(json.dumps({'part':number,'bytes':size}),flush=True)
        if source.read(1):raise ValueError('Archive size changed')
    if whole.hexdigest()!=check['sha256']:raise ValueError('Source ZIP no longer matches verification')
    combined=hashlib.sha256()
    for part in manifest['parts']:
        h=hashlib.sha256()
        with (out/part['name']).open('rb') as stream:
            for block in iter(lambda:stream.read(1024*1024),b''):
                h.update(block);combined.update(block)
        if h.hexdigest()!=part['sha256']:raise ValueError('Written part hash mismatch')
    if combined.hexdigest()!=check['sha256']:raise ValueError('Reconstructed ZIP differs')
    (out/'parts-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
    (out/'merge-share.ps1').write_text(MERGE,encoding='utf-8-sig')
    (out/'Merge-Then-Extract.cmd').write_bytes(b'@echo off\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0merge-share.ps1"\r\npause\r\n')
    instructions='''蓝鲸女仆桌宠 1.2.1 · GitHub 分卷下载说明

请下载全部 4 个 .part 文件、parts-manifest.json、merge-share.ps1、Merge-Then-Extract.cmd，放在同一文件夹。
双击 Merge-Then-Extract.cmd，等待全部分卷与合并 ZIP 的校验完成。
得到 DeepSeekPet-1.2.1.zip 后完整解压，再双击里面的“安装桌宠.cmd”。
打开桌面快捷方式，在设置里填写你自己的 DeepSeek API Key。
请至少保留 40 GB 空间；不要直接打开单个分卷，也不要只下载 GitHub 自动生成的 Source code。
聊天需要联网和你自己的 API 余额；本地语音默认关闭，开启需兼容的 NVIDIA 显卡和驱动。
自动长期记忆默认开启，会额外调用 DeepSeek；可在设置中关闭、修改或删除记忆。
不包含分享者的聊天记录、长期记忆、API Key 或个人设置。
包含 dsh-pet 及其依赖、Qwen3-TTS 本地模型；各组件自带说明和许可随完整程序保留。
包内哈希、解压文件和迁移后的语音依赖已验证；其他电脑和实际语音硬件未验收。
'''
    instructions=instructions.replace('全部 4 个',f'全部 {count} 个')
    instructions='推荐：下载 Download-All.cmd 和 download-share.ps1 到同一文件夹，双击 Download-All.cmd 自动下载并合并。\n\n'+instructions
    (out/'Download-and-Install.txt').write_text(instructions,encoding='utf-8-sig')
    helper=Path(__file__).with_name('download-share.ps1').read_text(encoding='utf-8-sig')
    (out/'download-share.ps1').write_text(helper,encoding='utf-8-sig')
    (out/'Download-All.cmd').write_bytes(b'@echo off\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0download-share.ps1"\r\npause\r\n')
    (out/'split-validation.json').write_text(json.dumps({'allPartsHashVerified':True,'reconstructedZipSha256':combined.hexdigest()},indent=2),encoding='utf-8')
    print(json.dumps({'parts':len(manifest['parts']),'reconstructedZipHashVerified':True}),flush=True)

if __name__=='__main__':main()
