import unittest
from unittest.mock import MagicMock, patch
import sys
import os

# Add backend to path
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from services.llm import LLMService

class TestLLMGrading(unittest.TestCase):
    def setUp(self):
        # Mock the client creation to avoid needing an API key
        with patch('services.llm.LLMService._get_client') as mock_client:
            self.service = LLMService("deepseek", "dummy_key")
            # We don't need the client for these tests
            self.service.client = MagicMock()

    def test_calculate_expected_level(self):
        # Test boundary conditions
        self.assertEqual(self.service._calculate_expected_level(1.0), "L1")
        self.assertEqual(self.service._calculate_expected_level(1.5), "L1")
        self.assertEqual(self.service._calculate_expected_level(1.51), "L2")
        self.assertEqual(self.service._calculate_expected_level(2.5), "L2")
        self.assertEqual(self.service._calculate_expected_level(2.51), "L3")
        self.assertEqual(self.service._calculate_expected_level(3.5), "L3")
        self.assertEqual(self.service._calculate_expected_level(3.51), "L4")
        self.assertEqual(self.service._calculate_expected_level(4.5), "L4")
        self.assertEqual(self.service._calculate_expected_level(4.51), "L5")

    def test_validate_grading_normal(self):
        # Normal case: consistent
        data = {
            "comprehensive_rating": {
                "average_score": 2.0,
                "final_level": "L2"
            }
        }
        result = self.service._validate_and_correct_grading(data)
        self.assertEqual(result["comprehensive_rating"]["final_level"], "L2")

    def test_validate_grading_correction(self):
        # Correction case: mismatch (e.g. 1.67 -> L1 without reason)
        data = {
            "comprehensive_rating": {
                "average_score": 1.67,
                "final_level": "L1" # Wrong, should be L2
            }
        }
        result = self.service._validate_and_correct_grading(data)
        self.assertEqual(result["comprehensive_rating"]["final_level"], "L2")
        self.assertEqual(result["comprehensive_rating"]["downgrade_reason"], "")

    def test_validate_grading_downgrade_valid(self):
        # Downgrade case: valid reason
        data = {
            "comprehensive_rating": {
                "average_score": 2.0, # Expected L2
                "final_level": "L1",
                "downgrade_reason": "因为核心能力缺失"
            }
        }
        result = self.service._validate_and_correct_grading(data)
        self.assertEqual(result["comprehensive_rating"]["final_level"], "L1")
        self.assertTrue(result["comprehensive_rating"]["downgrade_reason"].startswith("注："))

    def test_validate_grading_downgrade_invalid(self):
        # Downgrade case: invalid reason (no "因为")
        data = {
            "comprehensive_rating": {
                "average_score": 2.0, # Expected L2
                "final_level": "L1",
                "downgrade_reason": "Just because"
            }
        }
        result = self.service._validate_and_correct_grading(data)
        self.assertEqual(result["comprehensive_rating"]["final_level"], "L2") # Forced back to L2
        self.assertEqual(result["comprehensive_rating"]["downgrade_reason"], "")

    def test_validate_grading_correction_with_note(self):
        # Correction case: mismatch with markdown note
        data = {
            "comprehensive_rating": {
                "average_score": 1.67,
                "final_level": "L1"
            },
            "markdown_report": "Some report."
        }
        result = self.service._validate_and_correct_grading(data)
        self.assertEqual(result["comprehensive_rating"]["final_level"], "L2")
        self.assertIn("**系统修正注：**", result["markdown_report"])
        # Expected L2, Actual L1
        self.assertIn("L1", result["markdown_report"])
        self.assertIn("L2", result["markdown_report"])

    def test_validate_grading_downgrade_valid_with_note(self):
        # Downgrade case: valid reason added to markdown
        data = {
            "comprehensive_rating": {
                "average_score": 2.0,
                "final_level": "L1",
                "downgrade_reason": "因为核心能力缺失"
            },
            "markdown_report": "Some report."
        }
        result = self.service._validate_and_correct_grading(data)
        self.assertEqual(result["comprehensive_rating"]["final_level"], "L1")
        self.assertIn("**降级说明**", result["markdown_report"])
        self.assertIn("注：因为核心能力缺失", result["markdown_report"])

if __name__ == '__main__':
    unittest.main()
