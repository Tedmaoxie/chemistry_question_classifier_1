import unittest
from backend.services.parser import DocumentParser
from backend.services.splitter import QuestionSplitter

class TestQuestionSplitter(unittest.TestCase):
    def setUp(self):
        self.sample_text = """
1. 下列说法正确的是( )
A. 选项A
B. 选项B
C. 选项C
D. 选项D

2. 另一个选择题。
A. 1
B. 2
C. 3
D. 4

26. (14分)这是一个大题的题干，包含很多背景信息。
(1) 第一小问的内容。
(2) 第二小问的内容。
(3) 第三小问的内容。

27. 另一个大题。
① 小问1
② 小问2
"""
        
    def test_current_parser_behavior(self):
        # Old parser
        questions = DocumentParser._split_questions(self.sample_text, mode="sub_question")
        # Just ensuring it doesn't crash, we know it doesn't split well
        self.assertTrue(len(questions) > 0)

    def test_complex_upload_repro(self):
        text = """1. 下列关于化学反应的说法正确的是( )
A. 反应A
B. 反应B
2. (14分) 这是一个综合实验题。
已知物质X具有性质Y。
(1) 写出X的化学式______。
(2) 解释性质Y的原因______。"""
        questions = QuestionSplitter.split_text(text)
        ids = [q['id'] for q in questions]
        print(f"\nRepro IDs: {ids}")
        self.assertIn('2_1', ids)

if __name__ == '__main__':
    unittest.main()
