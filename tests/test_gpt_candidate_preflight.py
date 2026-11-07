import importlib.util
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load(filename):
    spec = importlib.util.spec_from_file_location('candidate', ROOT / 'integrations/gpt-niang/electron' / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class CandidateSafety(unittest.TestCase):
    def test_candidate_config_rejects_events_returns_and_content_duplicates(self):
        m = load('prepare-candidate.py')
        registry = {'clips': [
            {'aliases': ['safe', 'alias'], 'clipId': 'a', 'autoEligible': True},
            {'aliases': ['return'], 'clipId': 'b', 'autoEligible': False}]}
        config = {'animations': {'categories': [{'actions': ['safe', 'alias', 'return']}],
                                 'events': {'balance': ['return']}, 'moves': {'actions': ['bad-string']}}}
        errors = m.preflight(config, registry)
        self.assertEqual(len(errors), 3)

    def test_candidate_builder_rejects_production_output_and_delivery_inputs(self):
        m = load('build-explicit-candidate.py')
        with self.assertRaisesRegex(ValueError, 'workspace/work'):
            m.preflight({}, Path.home() / 'AppData/Local/DeepSeekActionPet')
        with self.assertRaisesRegex(ValueError, 'WebM'):
            m.preflight({'masterPath': 'existing.webm'}, ROOT / 'work/test-no-write')

    def test_candidate_builder_refuses_unmatched_master_hash(self):
        m = load('build-explicit-candidate.py')
        with tempfile.TemporaryDirectory() as temp:
            master = Path(temp) / 'master.mkv'
            master.write_bytes(b'fake-master')
            with self.assertRaisesRegex(ValueError, 'Master hash mismatch'):
                m.preflight({'masterPath': str(master), 'masterSha256': 'wrong'}, ROOT / 'work/test-no-write')


if __name__ == '__main__':
    unittest.main()
