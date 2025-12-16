import pytest
from backend.tasks.score import calculate_student_ability_stats, correct_result

def test_ability_coverage_partial():
    # 1. Setup Data
    score_data = {
        "student_id": "S1",
        "Q1": 10, # Full score
        "Q2": 0   # Zero score
    }
    
    # Q1 tests A1 (Study & Understand - Identify & Memorize)
    # Q2 tests B1 (Apply & Practice - Analyze & Explain)
    # Other abilities (A2, A3, B2, B3, C1, C2, C3) are missing
    q_map = {
        "Q1": {
            "full_score": 10,
            "ability_elements": ["A1 辨识记忆"]
        },
        "Q2": {
            "full_score": 10,
            "ability_elements": ["B1 分析解释"]
        }
    }
    
    # 2. Execute
    stats = calculate_student_ability_stats(score_data, q_map)
    
    # 3. Verify
    # Covered
    assert "A1辨识记忆" in stats["学习理解能力"]
    assert "100.0%" in stats["学习理解能力"]["A1辨识记忆"]["掌握程度"]
    
    assert "B1分析解释" in stats["应用实践能力"]
    # Q2 score is 0, so it should be "薄弱 (0.0%)" or similar, NOT "未涉及" because it WAS covered
    assert "0.0%" in stats["应用实践能力"]["B1分析解释"]["掌握程度"]
    assert "未涉及" not in stats["应用实践能力"]["B1分析解释"]["掌握程度"]
    
    # Not Covered
    assert "A2概括关联" in stats["学习理解能力"]
    assert "未涉及 (0%)" == stats["学习理解能力"]["A2概括关联"]["掌握程度"]
    
    assert "C3创新思维" in stats["迁移创新能力"]
    assert "未涉及 (0%)" == stats["迁移创新能力"]["C3创新思维"]["掌握程度"]

def test_report_text_injection():
    # Setup stats with missing abilities
    stats = {
        "学习理解能力": {
            "A1辨识记忆": {"掌握程度": "优秀 (100.0%)"},
            "A2概括关联": {"掌握程度": "未涉及 (0%)"} # Missing
        },
        "应用实践能力": {},
        "迁移创新能力": {}
    }
    
    result = {
        "markdown_report": "Original Report."
    }
    
    # Execute
    final_result = correct_result(result, {}, {}, "student", student_ability_stats=stats)
    
    # Verify
    assert "能力要素覆盖说明" in final_result["markdown_report"]
    assert "A2概括关联" in final_result["markdown_report"]
    assert "试题中未包含考查" in final_result["markdown_report"]
    assert "雷达图中显示为0" in final_result["markdown_report"]

def test_ability_coverage_full_missing():
    # No questions map to any ability
    score_data = {"S1": 10}
    q_map = {"Q1": {}}
    
    stats = calculate_student_ability_stats(score_data, q_map)
    
    # All should be unexamined
    for cat in stats.values():
        for item in cat.values():
            assert "未涉及" in item["掌握程度"]
