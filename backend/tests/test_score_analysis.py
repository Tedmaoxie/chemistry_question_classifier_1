import pytest
from unittest.mock import MagicMock, patch
from backend.tasks.score import perform_score_analysis_sync
from fastapi.testclient import TestClient
from backend.main import app
import json
import pandas as pd
import io

client = TestClient(app)

# Mock data
MOCK_STUDENT_SCORE_DATA = [
    {"student_id": "S1", "Q1": 5, "Q2": 3},
    {"student_id": "S2", "Q1": 4, "Q2": 4}
]

MOCK_CLASS_SCORE_DATA = [
    {"question_id": "Q1", "score_rate": 0.85, "full_score": 10},
    {"question_id": "Q2", "score_rate": 0.76, "full_score": 10}
]

MOCK_QUESTION_DATA = [
    {"id": "Q1", "content": "Question 1", "comprehensive_rating": {"final_level": "L3"}},
    {"id": "Q2", "content": "Question 2", "comprehensive_rating": {"final_level": "L4"}}
]

def test_score_analysis_sync():
    # Test the sync analysis function directly
    # Patch LLMService where it is imported in the tasks module
    with patch("backend.tasks.score.LLMService") as MockLLM:
        mock_instance = MockLLM.return_value
        mock_instance.analyze_question.return_value = {
            "markdown_report": "# Analysis",
            "comprehensive_rating": {"final_level": "L3"}
        }
        
        config = {"provider": "deepseek", "api_key": "test"}
        # "input" is the prompt string, "class" is the mode
        result = perform_score_analysis_sync("input prompt", "class", config)
        
        assert "markdown_report" in result
        mock_instance.analyze_question.assert_called_once()
        # Verify mode mapping
        # "class" -> "multiple_analysis"
        args, kwargs = mock_instance.analyze_question.call_args
        assert kwargs["mode"] == "multiple_analysis"

def test_score_upload_endpoint_student():
    # Test upload with student data
    df = pd.DataFrame(MOCK_STUDENT_SCORE_DATA)
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False)
    output.seek(0)
    
    response = client.post(
        "/api/score/upload",
        files={"file": ("test_student.xlsx", output, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        data={"mode": "student"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["count"] == 2
    # Verify validation transformed keys if needed or kept them
    # validate_student_data ensures 'student_id' exists
    assert "student_id" in data["data"][0]

def test_score_upload_endpoint_class():
    # Test upload with class data
    df = pd.DataFrame(MOCK_CLASS_SCORE_DATA)
    # Ensure columns match validation expectations (question_id, score_rate)
    # validate_class_data looks for ['题号', '题目', 'ID', 'question_id'] and ['得分率', ... 'score_rate']
    # Our mock has 'question_id' and 'score_rate', which should match.
    
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False)
    output.seek(0)
    
    response = client.post(
        "/api/score/upload",
        files={"file": ("test_class.xlsx", output, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        data={"mode": "class"}
    )
    
    if response.status_code != 200:
        print(response.json())

    assert response.status_code == 200
    data = response.json()
    assert data["count"] == 2
    assert "question_id" in data["data"][0]
    assert "score_rate" in data["data"][0]

def test_score_upload_endpoint_class_auto_aggregate():
    # Test upload with student data but in CLASS mode -> should auto aggregate
    # Use headers with full score info to satisfy validation
    data_with_headers = [
        {"student_id": "S1", "Q1(10分)": 5, "Q2(10分)": 3},
        {"student_id": "S2", "Q1(10分)": 4, "Q2(10分)": 4}
    ]
    df = pd.DataFrame(data_with_headers) 
    # Expected averages: Q1=(5+4)/2=4.5, Q2=(3+4)/2=3.5
    
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False)
    output.seek(0)
    
    response = client.post(
        "/api/score/upload",
        files={"file": ("test_student_for_class.xlsx", output, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        data={"mode": "class"} # <--- Class Mode with Student Data
    )
    
    if response.status_code != 200:
        print(response.json())

    assert response.status_code == 200
    data = response.json()
    
    # Should return aggregated list of questions
    # [{question_id: Q1(10分), score_rate: 0.45}, {question_id: Q2(10分), score_rate: 0.35}]
    # Note: validation converts raw scores to score rate (0-1) if full score is present and mean <= 1? 
    # Wait, score.py logic: if student data, it calculates average score.
    # aggregated.append({ "score_rate": avg/f_score }) -> so it will be 0.45
    
    assert data["count"] == 2 # 2 questions
    assert "question_id" in data["data"][0]
    assert "score_rate" in data["data"][0]
    
    # Check values
    # The keys in data will be "Q1(10分)"
    q1 = next(d for d in data["data"] if "Q1" in d["question_id"])
    q2 = next(d for d in data["data"] if "Q2" in d["question_id"])
    
    # score.py returns formatted string "%.2f" for score_rate
    assert float(q1["score_rate"]) == 0.45
    assert float(q2["score_rate"]) == 0.35

def test_score_analyze_endpoint_class():
    # Test /api/score/analyze for class mode
    # Patch the entire task object to avoid Celery connection attempts
    with patch("backend.api.endpoints.score.analyze_score_task") as mock_task_func:
        mock_task = MagicMock()
        mock_task.id = "task_class_123"
        mock_task_func.delay.return_value = mock_task
        
        # Use model_dump for Pydantic v2
        payload = {
            "score_data": MOCK_CLASS_SCORE_DATA,
            "question_data": MOCK_QUESTION_DATA,
            "mode": "class",
            "config": {"provider": "deepseek", "api_key": "test"}
        }
        
        response = client.post("/api/score/analyze", json=payload)
        
        assert response.status_code == 200
        data = response.json()
        assert len(data["tasks"]) == 1
        assert data["tasks"][0]["task_id"] == "task_class_123"
        
        # Verify call args
        mock_task_func.delay.assert_called_once()
        args, _ = mock_task_func.delay.call_args
        # input_data string should contain our data
        assert "题目难度数据" in args[0]
        assert "全年级得分率数据" in args[0]
        assert args[1] == "class" # mode

def test_score_analyze_endpoint_student():
    # Test /api/score/analyze for student mode
    with patch("backend.api.endpoints.score.analyze_score_task") as mock_task_func:
        mock_task = MagicMock()
        mock_task.id = "task_student_123"
        mock_task_func.delay.return_value = mock_task
        
        payload = {
            "score_data": MOCK_STUDENT_SCORE_DATA,
            "question_data": MOCK_QUESTION_DATA,
            "mode": "student",
            "config": {"provider": "deepseek", "api_key": "test"}
        }
        
        response = client.post("/api/score/analyze", json=payload)
        
        assert response.status_code == 200
        data = response.json()
        assert len(data["tasks"]) == 2 # One per student
        
        # Verify called twice
        assert mock_task_func.delay.call_count == 2

def test_upload_empty_file():
    # Test uploading an empty file should return 400, not 500
    df = pd.DataFrame()
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False)
    output.seek(0)
    
    response = client.post(
        "/api/score/upload",
        files={"file": ("empty.xlsx", output, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        data={"mode": "class"}
    )
    
    assert response.status_code == 400
    assert "empty" in response.json()["detail"]

def test_upload_csv_gbk_encoding():
    # Test uploading a CSV file encoded in GBK
    df = pd.DataFrame(MOCK_CLASS_SCORE_DATA)
    # Rename to Chinese headers to ensure GBK encoding is actually tested
    df = df.rename(columns={"question_id": "题号", "score_rate": "得分率"})
    # Convert to CSV string, then encode to GBK bytes
    csv_str = df.to_csv(index=False)
    gbk_bytes = csv_str.encode('gbk')
    
    output = io.BytesIO(gbk_bytes)
    
    response = client.post(
        "/api/score/upload",
        files={"file": ("test_gbk.csv", output, "text/csv")},
        data={"mode": "class"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["count"] == 2
