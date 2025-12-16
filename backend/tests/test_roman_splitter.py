import unittest
from backend.services.splitter import QuestionSplitter

class TestRomanSplitter(unittest.TestCase):
    def test_roman_numerals_ignored(self):
        """
        Verify that Roman numerals (i, ii, iii...) are NOT treated as sub-question splitters,
        but are kept as part of the preceding text (stem or previous sub-question).
        """
        text = """1. (14分) 这是一个包含罗马数字的大题。
(i) 罗马数字一
(ii) 罗马数字二
(iii) 罗马数字三
(1) 第一小问
(2) 第二小问
IV. 罗马数字四
V. 罗马数字五"""
        
        # We expect this to be parsed as:
        # 1. Main Stem: includes "1. ... (i)... (ii)... (iii)..."
        # 2. Sub-question 1: "(1) 第一小问"
        # 3. Sub-question 2: "(2) 第二小问\nIV. ... V. ..." (attached to sub 2 because they follow it)
        # OR if they are before (1), they are in stem.
        
        # Current logic splits by "1." first.
        # Then _process_big_question splits the rest.
        
        # Let's verify _process_big_question behavior directly or via split_text
        questions = QuestionSplitter.split_text(text)
        
        # We expect 2 sub-questions (plus the main stem concept handled inside splitter)
        # Actually split_text returns a list of question dicts.
        # If it's a big question, it returns sub-questions.
        # The "Stem" is attached to the first sub-question or all of them? 
        # Looking at splitter.py: 
        # full_content = f"【大题题干】\n{main_stem}\n\n【小题题干】\n{marker} {sub_content}"
        
        print(f"\nFound {len(questions)} questions.")
        for q in questions:
            print(f"ID: {q['id']}, Content: {q['content'][:50]}...")
            
        # Verify IDs
        ids = [q['id'] for q in questions]
        self.assertIn('1_1', ids)
        self.assertIn('1_2', ids)
        self.assertNotIn('1_3', ids) # Should not split on IV or V
        
        # Verify content retention
        q1 = next(q for q in questions if q['id'] == '1_1')
        self.assertIn("(i) 罗马数字一", q1['content'])
        self.assertIn("(ii) 罗马数字二", q1['content'])
        
        q2 = next(q for q in questions if q['id'] == '1_2')
        self.assertIn("IV. 罗马数字四", q2['content'])

    def test_mixed_case_roman(self):
        text = """1. 混合大小写。
i. 小写i
II. 大写II
(1) 问题1"""
        questions = QuestionSplitter.split_text(text)
        q1 = questions[0]
        self.assertIn("i. 小写i", q1['content'])
        self.assertIn("II. 大写II", q1['content'])

if __name__ == '__main__':
    unittest.main()
