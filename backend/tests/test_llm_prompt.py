import unittest
from unittest.mock import MagicMock, patch
import json
from backend.services.llm import LLMService

class TestLLMService(unittest.TestCase):
    def setUp(self):
        self.api_key = "test_key"
        self.provider = "deepseek"
        self.service = LLMService(self.provider, self.api_key)

    @patch('backend.services.llm.OpenAI')
    def test_analyze_question_normal(self, mock_openai):
        # Mock successful response
        mock_client = MagicMock()
        mock_openai.return_value = mock_client
        self.service.client = mock_client # manually set client because __init__ called OpenAI already

        mock_response = MagicMock()
        mock_choice = MagicMock()
        mock_message = MagicMock()
        
        expected_json = {
            "meta": { "knowledge_topic": "Test" },
            "comprehensive_rating": { "final_level": "L3", "average_score": 3.0 },
            "markdown_report": "**Test Report**",
            "dimensions": {}
        }
        
        mock_message.content = json.dumps(expected_json)
        mock_choice.message = mock_message
        mock_response.choices = [mock_choice]
        mock_client.chat.completions.create.return_value = mock_response

        result = self.service.analyze_question("Test Question")
        
        self.assertEqual(result["final_level"], "L3") # Check compatibility field
        self.assertEqual(result["markdown_report"], "**Test Report**")
        self.assertIn("comprehensive_rating", result)

    @patch('backend.services.llm.OpenAI')
    def test_analyze_question_missing_field(self, mock_openai):
        # Mock response missing 'markdown_report'
        mock_client = MagicMock()
        mock_openai.return_value = mock_client
        self.service.client = mock_client

        mock_response = MagicMock()
        mock_choice = MagicMock()
        mock_message = MagicMock()
        
        invalid_json = {
            "comprehensive_rating": { "final_level": "L3" }
            # Missing markdown_report
        }
        
        mock_message.content = json.dumps(invalid_json)
        mock_choice.message = mock_message
        mock_response.choices = [mock_choice]
        mock_client.chat.completions.create.return_value = mock_response

        result = self.service.analyze_question("Test Question")
        
        # Should return error structure because validation failed
        self.assertIn("error", result)
        self.assertEqual(result["level"], "Error")

    @patch('backend.services.llm.OpenAI')
    def test_analyze_question_different_levels(self, mock_openai):
        # Test consistency for L1 and L5
        mock_client = MagicMock()
        mock_openai.return_value = mock_client
        self.service.client = mock_client
        
        scenarios = [
            ("L1", 1.0),
            ("L5", 5.0)
        ]

        for level, score in scenarios:
            mock_response = MagicMock()
            mock_choice = MagicMock()
            mock_message = MagicMock()
            
            response_json = {
                "comprehensive_rating": { "final_level": level, "average_score": score },
                "markdown_report": f"**Report for {level}**",
                "dimensions": {}
            }
            
            mock_message.content = json.dumps(response_json)
            mock_choice.message = mock_message
            mock_response.choices = [mock_choice]
            mock_client.chat.completions.create.return_value = mock_response

            result = self.service.analyze_question(f"Question for {level}")
            
            self.assertEqual(result["final_level"], level)
            self.assertEqual(result["markdown_report"], f"**Report for {level}**")

if __name__ == '__main__':
    unittest.main()
