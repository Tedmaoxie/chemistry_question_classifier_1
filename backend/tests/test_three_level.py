import unittest
from backend.services.splitter import QuestionSplitter

class TestThreeLevelSplitter(unittest.TestCase):
    def test_three_level_hierarchy(self):
        text = """1. (14分) 三级标题测试题。
(1) 第一小问（无三级）。
内容内容。
(2) 第二小问（有三级）。
① 步骤一。
② 步骤二。
(3) 第三小问（有三级）。
① 实验A。
② 实验B。
③ 实验C。"""
        
        # Expected behavior:
        # 1_1: (1) content
        # 1_2_1: (2) -> ①
        # 1_2_2: (2) -> ②
        # 1_3_1: (3) -> ①
        # 1_3_2: (3) -> ②
        # 1_3_3: (3) -> ③
        
        questions = QuestionSplitter.split_text(text)
        ids = [q['id'] for q in questions]
        
        print(f"Generated IDs: {ids}")
        
        # Check IDs
        self.assertIn('1_1', ids)
        self.assertIn('1_2_1', ids)
        self.assertIn('1_2_2', ids)
        self.assertIn('1_3_1', ids)
        
        # Check Content Context
        # 1_2_1 should contain:
        # - Main Stem: "1. (14分) 三级标题测试题。"
        # - Sub Stem: "(2) 第二小问（有三级）。"
        # - Sub-Sub Content: "① 步骤一。"
        
        q_2_1 = next(q for q in questions if q['id'] == '1_2_1')
        self.assertIn("三级标题测试题", q_2_1['content'])
        self.assertIn("第二小问", q_2_1['content'])
        self.assertIn("步骤一", q_2_1['content'])
        
        # Check 1_1 (Leaf node at Level 2)
        q_1 = next(q for q in questions if q['id'] == '1_1')
        self.assertIn("第一小问", q_1['content'])
        self.assertIn("内容内容", q_1['content'])

if __name__ == '__main__':
    unittest.main()
