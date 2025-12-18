from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import os
import json
import time
import subprocess
from backend.config import settings

router = APIRouter()

class HistoryItem(BaseModel):
    id: str
    examName: str
    createdAt: str
    questionCount: int
    data: Dict[str, Any]

class HistorySummary(BaseModel):
    id: str
    examName: str
    createdAt: str
    questionCount: int

def _git_sync(commit_msg: str):
    """
    Sync history directory to Git repository.
    This is a background task.
    """
    try:
        # Check if git is initialized
        if not os.path.exists(os.path.join(os.getcwd(), ".git")):
            print("Git not initialized, skipping sync.")
            return

        # Add all files in history directory
        subprocess.run(["git", "add", settings.HISTORY_DIR], cwd=os.getcwd(), check=True, capture_output=True)
        
        # Commit
        subprocess.run(["git", "commit", "-m", commit_msg], cwd=os.getcwd(), check=False, capture_output=True)
        
        # Push (This might fail if no remote is configured or no auth, which is expected in some local envs)
        # We only try to push if we are not in a detached HEAD state or if we are on the target branch
        # For now, we attempt push and log error if it fails
        subprocess.run(["git", "push", "origin", settings.GIT_TARGET_BRANCH], cwd=os.getcwd(), check=True, capture_output=True)
        print(f"Successfully synced history to {settings.GIT_TARGET_BRANCH}")
    except subprocess.CalledProcessError as e:
        print(f"Git sync failed: {e}")
        # print(f"Stderr: {e.stderr.decode()}")
    except Exception as e:
        print(f"Git sync error: {e}")

@router.post("/save")
async def save_history(item: HistoryItem, background_tasks: BackgroundTasks):
    try:
        file_path = os.path.join(settings.HISTORY_DIR, f"{item.id}.json")
        
        # Save to JSON file
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(item.dict(), f, ensure_ascii=False, indent=2)
            
        # Trigger Git sync in background
        commit_msg = f"Add history record: {item.examName} ({item.id})"
        background_tasks.add_task(_git_sync, commit_msg)
        
        return {"status": "success", "id": item.id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/list", response_model=List[HistorySummary])
async def get_history_list():
    try:
        files = [f for f in os.listdir(settings.HISTORY_DIR) if f.endswith(".json")]
        results = []
        
        for file in files:
            try:
                with open(os.path.join(settings.HISTORY_DIR, file), "r", encoding="utf-8") as f:
                    data = json.load(f)
                    # Extract summary info
                    results.append(HistorySummary(
                        id=data.get("id", file.replace(".json", "")),
                        examName=data.get("examName", "Unknown Exam"),
                        createdAt=data.get("createdAt", ""),
                        questionCount=data.get("questionCount", 0)
                    ))
            except Exception as e:
                print(f"Error reading {file}: {e}")
                continue
                
        # Sort by createdAt desc
        results.sort(key=lambda x: x.createdAt, reverse=True)
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{history_id}", response_model=HistoryItem)
async def get_history_detail(history_id: str):
    try:
        file_path = os.path.join(settings.HISTORY_DIR, f"{history_id}.json")
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="History not found")
            
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
