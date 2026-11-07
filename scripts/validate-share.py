"""Extract and verify a completed friend archive in a dedicated work directory."""
import argparse
import json
from pathlib import Path
import subprocess
import zipfile

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--archive', required=True)
    parser.add_argument('--stage', required=True)
    parser.add_argument('--existing-stage', action='store_true')
    args = parser.parse_args()
    stage = Path(args.stage).resolve()
    if not args.existing_stage:
        stage.mkdir(parents=True, exist_ok=False)
        with zipfile.ZipFile(args.archive) as packed:
            for item in packed.infolist():
                target = (stage/item.filename).resolve()
                if stage not in target.parents or ':' in item.filename:
                    raise ValueError('Unsafe archive path')
            packed.extractall(stage)
    print('Extracted; verifying installed payload without modifying user data.', flush=True)
    subprocess.run(['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
                    str(stage/'install-share.ps1'), '-VerifyOnly'], check=True, timeout=900)
    base = stage/'program/voice-runtime/python-base'
    venv = stage/'program/voice-runtime/venv'
    (venv/'pyvenv.cfg').write_text('home = '+str(base)+'\ninclude-system-site-packages = false\n'
                                 'version = 3.12.14\nexecutable = '+str(base/'python.exe')+'\n', encoding='utf-8')
    code = ('import torch, qwen_tts, soundfile, certifi, pathlib; '
            'assert pathlib.Path(certifi.where()).is_file(); '
            'print("Relocated voice imports and public certificate available")')
    subprocess.run([str(venv/'Scripts/python.exe'), '-B', '-c', code], check=True, timeout=120)
    result = {'extractedPayloadHashes':True, 'relocatedPythonImports':True,
              'publicCertificatePresent':True, 'personalDataChanged':False,
              'paidApi':False, 'petRestarted':False,
              'friendPhysicalComputerTested':False}
    (stage/'validation-result.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps(result), flush=True)

if __name__ == '__main__':
    main()
