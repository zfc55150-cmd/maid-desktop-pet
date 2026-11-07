"""Regression for detached props in the existing green-screen import route."""
from pathlib import Path
import importlib.util
import unittest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('gpt_prop_keyer',ROOT/'integrations/gpt-niang/animated/inspect-video-trial.py')
keyer=importlib.util.module_from_spec(spec)
spec.loader.exec_module(keyer)
np=keyer.np


class PropMatteTests(unittest.TestCase):
    def setUp(self):
        self.rgb=np.zeros((160,160,3),np.uint8)
        self.rgb[:,:,1]=255
        self.rgb[40:145,50:110]=[240,230,250]
        self.rgb[15:25,130:140]=[255,205,40]

    def test_default_keeps_existing_character_only_policy(self):
        rgba=keyer.key_frame(self.rgb)
        self.assertEqual(int(rgba[20,135,3]),0)
        self.assertGreater(int(rgba[80,80,3]),240)

    def test_detached_gold_prop_is_preserved(self):
        rgba=keyer.key_frame(self.rgb,preserve_detached=True)
        self.assertGreater(int(rgba[20,135,3]),240)
        self.assertGreater(int(rgba[80,80,3]),240)

    def test_green_background_is_transparent(self):
        rgba=keyer.key_frame(self.rgb,preserve_detached=True)
        self.assertEqual(int(rgba[0,0,3]),0)
        self.assertEqual(int(rgba[30,30,3]),0)

    def test_isolated_compression_speck_is_not_prop(self):
        self.rgb[2,2]=[255,255,255]
        rgba=keyer.key_frame(self.rgb,preserve_detached=True)
        self.assertEqual(int(rgba[2,2,3]),0)


if __name__=='__main__':
    unittest.main()
