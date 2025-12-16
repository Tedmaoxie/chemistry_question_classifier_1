import unittest
from backend.services.splitter import QuestionSplitter

class TestNestedSplitter(unittest.TestCase):
    def test_nested_sub_questions(self):
        text = """(1) Main question one.
① sub-point 1
② sub-point 2
(2) Main question two.
① sub-point 1
② sub-point 2"""
        
        # We expect 2 sub-questions: (1) and (2).
        # The circle numbers should be part of the content.
        
        questions = QuestionSplitter._process_big_question("1", text)
        
        # Check IDs
        ids = [q['id'] for q in questions]
        # Current logic likely splits at (1) and ② (val=2), so we might get 1_1 and 1_2 (where 1_2 is ②)
        # Or maybe even more if logic is loose.
        
        self.assertEqual(len(ids), 2, f"Expected 2 questions, got {len(ids)}: {ids}")
        self.assertEqual(ids, ["1_1", "1_2"])
        
        # Check content
        # (1) content should contain ① and ②
        q1 = next(q for q in questions if q['id'] == "1_1")
        self.assertIn("①", q1['content'])
        self.assertIn("②", q1['content'])
        
        q2 = next(q for q in questions if q['id'] == "1_2")
        self.assertIn("Main question two", q2['content'])

    def test_top_level_style_mismatch(self):
        text = """一、 第一大题
1. 小点1
2. 小点2
二、 第二大题"""
        
        # Should split into 一 and 二.
        # 1. and 2. should be content of 一.
        
        questions = QuestionSplitter.split_text(text, mode="whole")
        ids = [q['id'] for q in questions]
        
        # split_text uses integer values for IDs, so "一" -> 1, "二" -> 2.
        self.assertEqual(len(ids), 2, f"Expected 2 questions, got {len(ids)}: {ids}")
        
        q1 = next(q for q in questions if q['id'] == "1")
        self.assertIn("1. 小点1", q1['content'])
        self.assertIn("2. 小点2", q1['content'])
