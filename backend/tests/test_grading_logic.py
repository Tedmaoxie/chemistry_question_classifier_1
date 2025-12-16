import unittest
import json
from unittest.mock import MagicMock

class TestGradingLogic(unittest.TestCase):
    def test_interval_logic(self):
        """Test strict interval mapping rules"""
        # Test cases: (average_score, expected_level)
        test_cases = [
            (1.0, "L1"),
            (1.5, "L1"),
            (1.51, "L2"),
            (1.67, "L2"),
            (2.5, "L2"),
            (2.51, "L3"),
            (3.5, "L3"),
            (3.51, "L4"),
            (4.5, "L4"),
            (4.51, "L5"),
            (5.0, "L5")
        ]
        
        for score, expected_level in test_cases:
            with self.subTest(score=score):
                level = self.calculate_level(score)
                self.assertEqual(level, expected_level, f"Score {score} should be {expected_level}")

    def calculate_level(self, score):
        """Helper to simulate the backend or prompt logic"""
        if score <= 1.5:
            return "L1"
        elif score <= 2.5:
            return "L2"
        elif score <= 3.5:
            return "L3"
        elif score <= 4.5:
            return "L4"
        else:
            return "L5"

    def test_downgrade_logic(self):
        """Test downgrade mechanism requirements"""
        # This simulates the validation we need to implement in backend
        
        # Case 1: Valid downgrade with reason
        data_valid = {
            "comprehensive_rating": {
                "average_score": 2.0, # Should be L2
                "final_level": "L1",  # Downgraded
                "downgrade_reason": "因为[具体原因]导致整体难度仍贴近L1基准"
            }
        }
        self.assertTrue(self.validate_downgrade(data_valid))
        
        # Case 2: Invalid downgrade without reason
        data_invalid = {
            "comprehensive_rating": {
                "average_score": 2.0,
                "final_level": "L1"
                # Missing reason
            }
        }
        self.assertFalse(self.validate_downgrade(data_invalid))
        
        # Case 3: No downgrade (consistent)
        data_consistent = {
            "comprehensive_rating": {
                "average_score": 2.0,
                "final_level": "L2"
            }
        }
        self.assertTrue(self.validate_downgrade(data_consistent))

    def validate_downgrade(self, data):
        """Helper to simulate backend validation logic"""
        rating = data.get("comprehensive_rating", {})
        score = rating.get("average_score")
        level = rating.get("final_level")
        reason = rating.get("downgrade_reason")
        
        calculated_level = self.calculate_level(score)
        
        if level != calculated_level:
            # Check if reason is present and valid
            if not reason or not reason.startswith("因为"):
                return False
        return True

if __name__ == '__main__':
    unittest.main()
