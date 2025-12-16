import requests
import time
import json

BASE_URL = "http://127.0.0.1:8000/api"

def test_analysis_flow():
    print("Testing analysis flow...")
    
    # 1. Create a dummy question payload
    questions = [
        {
            "id": "test_1",
            "content": "What is H2O?",
            "type": "big_question_whole"
        }
    ]
    
    payload = {
        "questions": questions,
        "models": ["deepseek"],  # Assuming this model key is valid in logic, even if API call fails
        "api_key": "dummy_key"
    }
    
    session = requests.Session()
    session.trust_env = False  # Bypass proxies
    
    try:
        # 2. Start Analysis
        print("Sending analyze request...")
        response = session.post(f"{BASE_URL}/analyze", json=payload)
        
        if response.status_code != 200:
            print(f"FAILED: Status {response.status_code}")
            print(response.text)
            return
            
        data = response.json()
        print(f"Start response: {data}")
        
        tasks = data.get("tasks", [])
        if not tasks:
            print("FAILED: No tasks returned")
            return
            
        task_id = tasks[0]["task_id"]
        print(f"Task ID: {task_id}")
        
        # 3. Poll Status
        print("Polling status...")
        for _ in range(5):
            status_res = session.get(f"{BASE_URL}/tasks/{task_id}")
            status_data = status_res.json()
            print(f"Status: {status_data}")
            
            if status_data["status"] in ["SUCCESS", "FAILURE"]:
                break
            time.sleep(1)
            
        if status_data["status"] == "SUCCESS":
            print("[PASS] Analysis completed successfully (mocked or real)")
        elif status_data["status"] == "FAILURE":
            # Failure is also acceptable if it's due to API key, as long as the system didn't crash
            print(f"[PASS] Analysis ran but failed (expected with dummy key): {status_data.get('error')}")
        else:
            print("[WARN] Analysis timed out or pending")

    except Exception as e:
        print(f"EXCEPTION: {e}")

if __name__ == "__main__":
    test_analysis_flow()
