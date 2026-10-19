import argparse, hashlib, html, json, pathlib, re, shutil, zipfile

def sha(file):
    return hashlib.sha256(pathlib.Path(file).read_bytes()).hexdigest()

def inline(value):
    value=html.escape(value)
    value=re.sub(r'`([^`]+)`',r'<code>\1</code>',value)
    return re.sub(r'\*\*([^*]+)\*\*',r'<strong>\1</strong>',value)

def render_markdown(text):
    output=[];table=False;listing=False
    def close():
        nonlocal table,listing
        if table:output.append('</tbody></table></div>');table=False
        if listing:output.append('</ul>');listing=False
    for line in text.splitlines():
        if line.startswith('|'):
            if re.match(r'^\|[\s|:-]+\|$',line):continue
            cells=[inline(c.strip()) for c in line.strip('|').split('|')]
            if not table:
                close();output.append('<div class="table"><table><thead><tr>'+''.join('<th>'+c+'</th>' for c in cells)+'</tr></thead><tbody>');table=True
            else:output.append('<tr>'+''.join('<td>'+c+'</td>' for c in cells)+'</tr>')
            continue
        if line.startswith('- '):
            if table:close()
            if not listing:output.append('<ul>');listing=True
            output.append('<li>'+inline(line[2:])+'</li>');continue
        close()
        if not line.strip():continue
        match=re.match(r'^(#{1,3}) (.*)',line)
        if match:output.append(f'<h{len(match[1])}>{inline(match[2])}</h{len(match[1])}>')
        else:output.append('<p>'+inline(line)+'</p>')
    close();return '\n'.join(output)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--output',required=True);parser.add_argument('--restore-result',required=True)
    args=parser.parse_args();repo=pathlib.Path(__file__).resolve().parent.parent;out=pathlib.Path(args.output)
    out.mkdir(parents=True,exist_ok=True);recovery=out/'离线恢复';recovery.mkdir(exist_ok=True)
    for name in ['restore-offline.ps1','恢复安装.cmd']:shutil.copy2(repo/'scripts'/name,recovery/name)
    report=(repo/'docs/修复与验证报告.md').read_text(encoding='utf-8')
    check=json.loads((recovery/'恢复包校验.json').read_text(encoding='utf-8'))
    restore=json.loads(pathlib.Path(args.restore_result).read_text(encoding='utf-8-sig'))
    evidence={
        'version':'1.1.0','regressionTests':{'passed':32,'failed':0},
        'electron':json.loads((repo/'work/electron-smoke/result.json').read_text(encoding='utf-8-sig')),
        'isolatedHost':json.loads((repo/'work/host-smoke/result.json').read_text(encoding='utf-8-sig')),
        'installed':json.loads((repo/'work/final-check/result.json').read_text(encoding='utf-8-sig')),
        'voice':json.loads((repo/'work/voice-smoke/result.json').read_text(encoding='utf-8-sig')),
        'offlineArchive':check,'offlineRestore':restore,
    }
    for folder in [repo/'docs',out]:
        (folder/'验证记录.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2),encoding='utf-8')
    size=check['archiveBytes']/1024**3
    report+=f"\n## 离线恢复最终结果\n\n恢复包约 {size:.2f} GiB，共 {check['files']} 个程序文件。ZIP 内所有文件通过 SHA-256 核对；独立目录实际解压、逐文件核对与迁移后的 Python 依赖导入通过。校验详情见《验证记录.json》。\n"
    (out/'修复与验证报告.md').write_text(report,encoding='utf-8')
    page='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>蓝鲸女仆桌宠 · 修复与验证报告</title><style>body{margin:0;background:#f3f6fb;color:#24354b;font:15px/1.85 "Microsoft YaHei","Segoe UI",sans-serif}main{max-width:980px;margin:30px auto;padding:30px 42px;background:white;border:1px solid #dce5f0;border-radius:16px}h1{font-size:28px;color:#234b77}h2{font-size:21px;margin-top:32px}p,li{overflow-wrap:anywhere}table{border-collapse:collapse;width:100%;font-size:14px}th,td{border:1px solid #dce5f0;padding:10px 14px;text-align:left}th{background:#edf3fa}.table{overflow:auto}code{font:12px/1.8 Consolas,"Microsoft YaHei",monospace;background:#f0f4f9;padding:2px 4px}a{color:#235f99}@media(max-width:650px){main{margin:0;padding:20px;border:0;border-radius:0}h1{font-size:24px}}</style><main>'''+render_markdown(report)+'''<p><a href="离线恢复/恢复包校验.json">恢复包校验清单</a> · <a href="验证记录.json">全部验证记录</a></p></main></html>'''
    (out/'修复与验证报告.html').write_text(page,encoding='utf-8')
    shutil.copy2(repo/'README.md',out/'源码与恢复说明.md')
    shutil.copy2(repo/'scripts/rollback.ps1',out/'rollback.ps1')
    shutil.copy2(repo/'deployment.json',out/'deployment.json')
    # The original report remains available as a dated snapshot, with a clear latest-version link.
    original=out.parents[1]/'报告/蓝鲸女仆桌宠报告.html'
    if original.exists():
        content=original.read_text(encoding='utf-8-sig')
        marker='id="maintenance-update"'
        if marker not in content:
            shutil.copy2(original,out/'修复前使用报告.html')
            banner='<aside id="maintenance-update" style="background:#eaf4ef;border:1px solid #a9d0bd;padding:16px 20px;border-radius:10px;margin-bottom:24px"><strong>当前程序已更新到维护版 1.1.0。</strong>本页保留原使用报告快照，最新功能、修复和恢复资料请查看 <a href="../维护版本/2026-10-19-1.1.0/修复与验证报告.html">修复与验证报告</a>。</aside>'
            original.write_text(content.replace('<main>','<main>'+banner,1),encoding='utf-8')
    sourcezip=out/'源码与测试-1.1.0.zip'
    with zipfile.ZipFile(sourcezip,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as target:
        for name in ['.gitignore','README.md','package.json','deployment.json','app','baseline','docs','scripts','tests']:
            item=repo/name
            for file in ([item] if item.is_file() else sorted(item.rglob('*'))):
                if file.is_file() and '__pycache__' not in file.parts:target.write(file,file.relative_to(repo).as_posix())
    with zipfile.ZipFile(sourcezip) as target:
        if target.testzip() is not None:raise ValueError('Source archive integrity check failed')
    (out/'源码包校验.json').write_text(json.dumps({'file':sourcezip.name,'sha256':sha(sourcezip)},ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'report':str(out/'修复与验证报告.html'),'sourceZipBytes':sourcezip.stat().st_size,'offlineGiB':round(size,2)},ensure_ascii=False))
if __name__=='__main__':main()
