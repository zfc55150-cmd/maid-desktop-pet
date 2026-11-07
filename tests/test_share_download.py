"""Exercise the public download helper against fake local release assets."""
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT=Path(__file__).resolve().parent.parent

class DownloadHelperTests(unittest.TestCase):
    def test_download_resume_and_corrupt_existing_file(self):
        with tempfile.TemporaryDirectory(dir=ROOT/'work',prefix='download-test-') as temp:
            root=Path(temp);assets=root/'server';client=root/'client'
            assets.mkdir();client.mkdir()
            content=b'fake binary part'
            name='DeepSeekPet-1.2.1.zip.part01'
            (assets/name).write_bytes(content)
            (assets/'parts-manifest.json').write_text(json.dumps({'parts':[{'name':name,'sha256':hashlib.sha256(content).hexdigest()}]}),encoding='utf-8')
            (assets/'merge-share.ps1').write_text("[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'merge-tested.txt'),'fake merge completed')",encoding='utf-8-sig')
            source=(ROOT/'scripts/download-share.ps1').read_text(encoding='utf-8')
            source=source.replace('https://github.com/zfc55150-cmd/DeepSeekActionPet-Share/releases/download/v1.2.1/',assets.as_uri()+'/')
            script=client/'download-share.ps1';script.write_text(source,encoding='utf-8-sig')
            command=['powershell.exe','-NoProfile','-ExecutionPolicy','Bypass','-File',str(script)]
            checked=subprocess.run(command,capture_output=True,timeout=30)
            self.assertEqual(checked.returncode,0,checked.stderr.decode(errors='replace'))
            self.assertEqual((client/name).read_bytes(),content)
            self.assertTrue((client/'merge-tested.txt').exists())
            self.assertEqual(subprocess.run(command,capture_output=True,timeout=30).returncode,0)
            (client/name).write_bytes(b'corrupted existing file')
            self.assertNotEqual(subprocess.run(command,capture_output=True,timeout=30).returncode,0)
            self.assertEqual((client/name).read_bytes(),b'corrupted existing file')

if __name__=='__main__':unittest.main()
