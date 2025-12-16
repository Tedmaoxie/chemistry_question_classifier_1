import unittest
from unittest.mock import MagicMock, patch
import sys
import os
import json

# Add backend to path
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from services.llm import LLMService

class TestNewDowngradeLogic(unittest.TestCase):
    def setUp(self):
        with patch('services.llm.LLMService._get_client') as mock_client:
            self.service = LLMService("deepseek", "dummy_key")
            self.service.client = MagicMock()

    def test_standard_downgrade(self):
        """Test standard downgrade (starts with '因为') - Old Logic"""
        data = {
            "comprehensive_rating": {
                "average_score": 2.0, # Expected L2
                "final_level": "L1",
                "downgrade_reason": "因为核心能力缺失"
            },
            "markdown_report": "Original Report."
        }
        result = self.service._validate_and_correct_grading(data)
        
        # Should be accepted as L1
        self.assertEqual(result["comprehensive_rating"]["final_level"], "L1")
        # Should NOT have meta downgrade_event (this is for non-standard)
        self.assertNotIn("downgrade_event", result.get("meta", {}))
        # Should NOT have is_downgraded flag (or maybe we should add it to both? 
        # But requirement said 'special icon for downgrade processing items' in context of new rule.
        # Let's assume standard ones don't need the special handling or we didn't implement it for them yet.)
        self.assertNotIn("is_downgraded", result)
        # Should contain "降级说明" in report
        self.assertIn("**降级说明**", result["markdown_report"])

    def test_non_standard_downgrade(self):
        """Test non-standard downgrade (NO '因为') - New Logic"""
        data = {
            "comprehensive_rating": {
                "average_score": 2.0, # Expected L2
                "final_level": "L1",
                "downgrade_reason": "Based on student feedback"
            },
            "markdown_report": "Original Report."
        }
        result = self.service._validate_and_correct_grading(data)
        
        # Should be accepted as L1 (Previously would be corrected to L2)
        self.assertEqual(result["comprehensive_rating"]["final_level"], "L1")
        
        # Check Metadata
        self.assertIn("meta", result)
        self.assertIn("downgrade_event", result["meta"])
        event = result["meta"]["downgrade_event"]
        self.assertEqual(event["original_level"], "L2")
        self.assertEqual(event["final_level"], "L1")
        self.assertEqual(event["type"], "non_standard")
        self.assertTrue(event["timestamp"])
        
        # Check Flag
        self.assertTrue(result.get("is_downgraded"))
        
        # Check Report
        self.assertIn("**难度等级调整说明**", result["markdown_report"])
        self.assertIn("⚠️ **特殊降级处理**", result["markdown_report"])
        self.assertIn("原始测算等级**：L2", result["markdown_report"])
        self.assertIn("最终输出等级**：L1 ▼", result["markdown_report"])

    def test_non_standard_downgrade_empty_reason(self):
        """Test non-standard downgrade with empty reason"""
        data = {
            "comprehensive_rating": {
                "average_score": 2.0, # Expected L2
                "final_level": "L1",
                "downgrade_reason": ""
            },
            "markdown_report": "Original Report."
        }
        result = self.service._validate_and_correct_grading(data)
        
        # Should be accepted as L1
        self.assertEqual(result["comprehensive_rating"]["final_level"], "L1")
        
        # Check Metadata
        self.assertIn("downgrade_event", result["meta"])
        
        # Check Report content for default reason text
        self.assertIn("大模型依据上下文判定（无特定标准理由）", result["markdown_report"])

if __name__ == '__main__':
    unittest.main()
