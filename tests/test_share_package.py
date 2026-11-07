"""Checks for share boundaries and installer's fail-closed verification."""
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('build_share', ROOT/'scripts/build-share.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)

class SharePackageTests(unittest.TestCase):
    def setUp(self):
        (ROOT/'work').mkdir(exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=ROOT/'work', prefix='share-test-')
        self.root = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def test_personal_files_and_unknown_roots_are_excluded(self):
        for rel in ['node.exe', 'voice-runtime/reference.wav', 'voice-runtime/cache/audio.wav',
                    'voice-runtime/chat.json.bak', 'voice-runtime/.env', 'voice-runtime/control-session.json',
                    'personal/messages.json', 'runtime.log',
                    'voice-runtime/venv/Lib/site-packages/certifi/cacert.pem']:
            file = self.root/rel
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_bytes(b'fake')
        actual = {f.relative_to(self.root).as_posix() for f in builder.payload(self.root)}
        self.assertEqual(actual, {'node.exe', 'voice-runtime/reference.wav',
                                 'voice-runtime/venv/Lib/site-packages/certifi/cacert.pem'})

    def invoke(self, *args):
        return subprocess.run(['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass',
                               '-File', str(self.root/'install-share.ps1'), *args],
                              capture_output=True, timeout=30)

    def fixture(self):
        (self.root/'install-share.ps1').write_bytes(b'\xef\xbb\xbf'+(ROOT/'scripts/install-share.ps1').read_bytes())
        program = self.root/'program'
        program.mkdir()
        (program/'node.exe').write_bytes(b'fake runtime')
        manifest = {'files':[{'path':'node.exe','sha256':hashlib.sha256(b'fake runtime').hexdigest()}]}
        (program/'recovery-manifest.json').write_text(json.dumps(manifest), encoding='utf-8')
        return program

    def test_verify_only_and_tampered_payload(self):
        program = self.fixture()
        checked = self.invoke('-VerifyOnly')
        self.assertEqual(checked.returncode, 0, checked.stderr.decode(errors='replace'))
        (program/'node.exe').write_bytes(b'corruption')
        self.assertNotEqual(self.invoke('-VerifyOnly').returncode, 0)

    def test_existing_destination_is_not_overwritten(self):
        self.fixture()
        destination = self.root/'DeepSeekActionPet'
        destination.mkdir()
        keeper = destination/'keeper.txt'
        keeper.write_bytes(b'preserve')
        self.assertNotEqual(self.invoke('-Destination', str(destination)).returncode, 0)
        self.assertEqual(keeper.read_bytes(), b'preserve')
        self.assertFalse((destination/'node.exe').exists())

if __name__ == '__main__':
    unittest.main()
