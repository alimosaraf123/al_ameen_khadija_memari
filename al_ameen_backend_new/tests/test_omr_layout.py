import sys
import unittest
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from omr_engine import locate_identity_regions


class IdentityLayoutTests(unittest.TestCase):
    def test_named_form_has_separate_name_and_signature_fields(self):
        image = np.full((1024, 724, 3), 255, dtype=np.uint8)
        cv2.rectangle(image, (75, 431), (610, 459), (180, 100, 10), 2)
        cv2.rectangle(image, (75, 465), (335, 570), (180, 100, 10), 2)
        regions = locate_identity_regions(image)
        self.assertEqual({region['kind'] for region in regions}, {'name_field', 'signature'})

    def test_signature_only_form_excludes_its_printed_heading(self):
        image = np.full((1024, 724, 3), 255, dtype=np.uint8)
        cv2.rectangle(image, (58, 435), (338, 545), (0, 0, 0), 2)
        cv2.rectangle(image, (58, 626), (212, 881), (0, 0, 0), 2)
        regions = locate_identity_regions(image)
        self.assertEqual(len(regions), 1)
        self.assertEqual(regions[0]['kind'], 'signature')
        self.assertGreater(regions[0]['top'] * 1024, 455)
        self.assertLess((regions[0]['top'] + regions[0]['height']) * 1024, 545)


if __name__ == '__main__':
    unittest.main()
