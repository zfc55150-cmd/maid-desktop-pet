"""Create and validate a self-contained offline program archive. Excludes user data."""
import argparse, hashlib, json, os, pathlib, shutil, time, zipfile

def digest(file):
    h=hashlib.sha256()
    with open(file,'rb') as stream:
        for chunk in iter(lambda:stream.read(8*1024*1024),b''):h.update(chunk)
    return h.hexdigest()

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--installed',required=True);parser.add_argument('--output',required=True)
    parser.add_argument('--store',action='store_true',help='Use a fast uncompressed ZIP for large offline runtimes')
    args=parser.parse_args();root=pathlib.Path(args.installed).resolve();out=pathlib.Path(args.output).resolve()
    if root.name!='DeepSeekActionPet' or root in out.parents:raise ValueError('Invalid program/archive boundary')
    for required in ['node.exe','electron/electron.exe','voice-runtime/venv/Scripts/python.exe','voice-runtime/model/model.safetensors']:
        if not (root/required).is_file():raise ValueError('Missing runtime: '+required)
    out.mkdir(parents=True,exist_ok=True)
    archive=out/'蓝鲸女仆-1.1.0-完整离线恢复.zip'
    if archive.exists():raise FileExistsError(archive)
    temporary=archive.with_suffix('.zip.partial');manifest=[];last=time.monotonic();processed=0
    compression=zipfile.ZIP_STORED if args.store else zipfile.ZIP_DEFLATED
    with zipfile.ZipFile(temporary,'w',compression=compression,compresslevel=1,allowZip64=True) as target:
        for directory,folders,files in os.walk(root,followlinks=False):
            folders[:]=sorted(f for f in folders if f not in ['__pycache__','cache','.git'] and not pathlib.Path(directory,f).is_symlink())
            for name in sorted(files):
                source=pathlib.Path(directory,name)
                if source.is_symlink() or getattr(source.stat(),'st_file_attributes',0)&0x400:raise ValueError('Refusing reparse point: '+str(source))
                relative=source.relative_to(root).as_posix()
                if name.endswith(('.pyc','.log','.tmp')) or name.startswith('chat.json') or name=='control-session.json':continue
                h=hashlib.sha256();size=0
                info=zipfile.ZipInfo.from_file(source,relative);info.compress_type=compression;info._compresslevel=1
                with source.open('rb') as src,target.open(info,'w',force_zip64=True) as dst:
                    for chunk in iter(lambda:src.read(4*1024*1024),b''):
                        h.update(chunk);size+=len(chunk);dst.write(chunk)
                manifest.append({'path':relative,'bytes':size,'sha256':h.hexdigest()});processed+=size
                if time.monotonic()-last>15:
                    print(json.dumps({'stage':'packing','files':len(manifest),'bytes':processed}),flush=True);last=time.monotonic()
        target.writestr('recovery-manifest.json',json.dumps({'version':'1.1.0','files':manifest},ensure_ascii=False,indent=2))
    print(json.dumps({'stage':'verifying_archive','files':len(manifest),'sourceBytes':processed}),flush=True)
    # Verify each decompressed file against its recorded hash, not merely ZIP headers.
    with zipfile.ZipFile(temporary) as packed:
        for item in manifest:
            h=hashlib.sha256()
            with packed.open(item['path']) as src:
                for chunk in iter(lambda:src.read(8*1024*1024),b''):h.update(chunk)
            if h.hexdigest()!=item['sha256']:raise ValueError('Archive verification failed: '+item['path'])
    temporary.rename(archive)
    result={'version':'1.1.0','archive':archive.name,'files':len(manifest),'sourceBytes':processed,'archiveBytes':archive.stat().st_size,'sha256':digest(archive),'allEntriesHashVerified':True,'containsChatData':False}
    (out/'恢复包校验.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(result,ensure_ascii=False),flush=True)
if __name__=='__main__':main()
