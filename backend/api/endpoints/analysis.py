from fastapi import APIRouter, Body, HTTPException, BackgroundTasks
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from celery.result import AsyncResult
from backend.tasks.analysis import analyze_question_task, perform_analysis_sync
from backend.tasks.analysis import analyze_question_task, analyze_single_model_task, perform_analysis_sync, perform_single_model_analysis
from backend.celery_app import celery_app
import uuid
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

# In-memory task store for fallback (when Redis/Celery is unavailable)
MEMORY_TASKS = {}

class ModelConfig(BaseModel):
    provider: str
    api_key: str
    base_url: Optional[str] = None
    model_name: Optional[str] = None
    temperature: Optional[float] = 0.3
    name_label: Optional[str] = None

    model_config = {'protected_namespaces': ()}

class AnalysisRequest(BaseModel):
    questions: List[Dict[str, Any]]
    configs: List[ModelConfig]

class RetryRequest(BaseModel):
    question: Dict[str, Any]
    config: ModelConfig

async def run_analysis_background(task_id: str, question_data: Dict[str, Any], configs: List[Dict[str, Any]]):
    """Background task wrapper for synchronous analysis (Legacy)"""
    try:
        MEMORY_TASKS[task_id]["status"] = "PROCESSING"
        # Convert Pydantic models to dicts if needed, or perform_analysis_sync handles dicts
        result = perform_analysis_sync(question_data, configs)
        MEMORY_TASKS[task_id]["status"] = "SUCCESS"
        MEMORY_TASKS[task_id]["result"] = result
    except Exception as e:
        logger.error(f"Background task failed: {e}")
        MEMORY_TASKS[task_id]["status"] = "FAILURE"
        MEMORY_TASKS[task_id]["error"] = str(e)

async def run_single_model_background(task_id: str, question_data: Dict[str, Any], config: Dict[str, Any]):
    """Background task wrapper for synchronous single model analysis"""
    try:
        MEMORY_TASKS[task_id]["status"] = "PROCESSING"
        result = perform_single_model_analysis(question_data, config)
        MEMORY_TASKS[task_id]["status"] = "SUCCESS"
        MEMORY_TASKS[task_id]["result"] = result
    except Exception as e:
        logger.error(f"Background task failed: {e}")
        MEMORY_TASKS[task_id]["status"] = "FAILURE"
        MEMORY_TASKS[task_id]["error"] = str(e)

import os
import threading

def run_analysis_in_thread(task_id: str, question_data: Dict[str, Any], config: Dict[str, Any]):
    try:
        MEMORY_TASKS[task_id]["status"] = "PROCESSING"
        result = perform_single_model_analysis(question_data, config)
        MEMORY_TASKS[task_id]["status"] = "SUCCESS"
        MEMORY_TASKS[task_id]["result"] = result
    except Exception as e:
        logger.error(f"Thread task failed: {e}")
        MEMORY_TASKS[task_id]["status"] = "FAILURE"
        MEMORY_TASKS[task_id]["error"] = str(e)

@router.post("/analyze")
async def start_analysis(request: AnalysisRequest, background_tasks: BackgroundTasks):
    """
    Start analysis for a list of questions.
    Dispatches ONE task per model per question to allow real-time partial results.
    Tries Celery first, falls back to in-memory BackgroundTasks if Redis is down.
    """
    questions = request.questions
    configs = request.configs
    
    if not configs:
        raise HTTPException(status_code=400, detail="No model configurations provided")
    
    # Convert config objects to dicts for Celery/Task
    config_dicts = [c.model_dump() for c in configs]
    
    # Structure: [ { "question_id": "...", "model_tasks": { "Label1": "task_id_1", ... } }, ... ]
    tasks_response = []
    use_fallback = False
    
    # Check Redis connection once (simple check)
    # If running desktop, force skipping Redis check and rely on Eager mode handling
    if os.environ.get("RUNNING_DESKTOP") != "true":
        try:
            # Assuming we can just try dispatching the first task. 
            # But to be safe, we can try to ping or just rely on exception handling.
            pass
        except:
            pass

    for q in questions:
        q_id = q.get("id")
        model_tasks = {}
        
        for config in config_dicts:
            label = config.get("name_label") or config.get("provider")
            
            task_id = None
            
            # Desktop Mode: Use Threads for true parallelism (avoids blocking main thread)
            if os.environ.get("RUNNING_DESKTOP") == "true":
                task_id = str(uuid.uuid4())
                MEMORY_TASKS[task_id] = {"status": "PENDING"}
                
                thread = threading.Thread(
                    target=run_analysis_in_thread,
                    args=(task_id, q, config)
                )
                thread.daemon = True # Ensure threads don't block app exit
                thread.start()
                
                model_tasks[label] = task_id
                continue # Skip the rest of the loop for this config

            if not use_fallback:
                try:
                    # Attempt to dispatch to Celery
                    task = analyze_single_model_task.delay(q, config)
                    task_id = task.id
                    
                    # Handle Desktop/Eager mode:
                    # In eager mode, the task is already finished, but the result is not in Redis.
                    # We MUST manually store it in MEMORY_TASKS so the status endpoint can find it.
                    if os.environ.get("RUNNING_DESKTOP") == "true":
                         # task is an EagerResult
                         status = task.status # 'SUCCESS', 'FAILURE', etc.
                         # EagerResult.result is the return value (or exception instance)
                         result_val = task.result
                         
                         task_info = {
                             "status": status
                         }
                         
                         if status == "SUCCESS":
                             task_info["result"] = result_val
                         elif status == "FAILURE":
                             task_info["error"] = str(result_val)
                             
                         MEMORY_TASKS[task_id] = task_info
                         logger.info(f"Desktop mode: Cached eager task {task_id} result in memory.")

                except Exception as e:
                    logger.warning(f"Celery dispatch failed: {e}. Switching to in-memory fallback.")
                    use_fallback = True
            
            if use_fallback:
                task_id = str(uuid.uuid4())
                MEMORY_TASKS[task_id] = {"status": "PENDING"}
                background_tasks.add_task(run_single_model_background, task_id, q, config)
            
            model_tasks[label] = task_id
            
        tasks_response.append({
            "question_id": q_id,
            "model_tasks": model_tasks
        })
            
    return {"tasks": tasks_response, "message": f"Started analysis tasks for {len(questions)} questions x {len(configs)} models"}

@router.get("/tasks/{task_id}")
async def get_task_status(task_id: str):
    # Check memory tasks first
    if task_id in MEMORY_TASKS:
        task_info = MEMORY_TASKS[task_id]
        status = task_info.get("status")
        response = {
            "task_id": task_id,
            "status": status,
        }
        if status == "SUCCESS":
            response["result"] = task_info.get("result")
        elif status == "FAILURE":
             response["error"] = task_info.get("error")
        return response

    # Fallback to Celery check
    try:
        task_result = AsyncResult(task_id, app=celery_app)
        
        response = {
            "task_id": task_id,
            "status": task_result.status,
        }
        
        if task_result.ready():
            # Ensure result is JSON serializable or extract what we need
            response["result"] = task_result.result
            # If successful, status should be 'SUCCESS'
            if task_result.status == 'SUCCESS':
                 response["status"] = 'SUCCESS'
        elif task_result.failed():
            response["error"] = str(task_result.result)
            response["status"] = 'FAILURE'
            
        return response
    except Exception as e:
        logger.error(f"Error checking task {task_id}: {e}")
        # If likely invalid ID or other error
        return {"task_id": task_id, "status": "PENDING"}

@router.post("/tasks/status")
async def get_tasks_status(task_ids: List[str] = Body(...)):
    """
    Batch check status for multiple tasks.
    """
    results = {}
    
    # optimize by grouping checks if possible, but for now simple loop is better than N http requests
    for task_id in task_ids:
        # Check memory tasks first
        if task_id in MEMORY_TASKS:
            task_info = MEMORY_TASKS[task_id]
            status = task_info.get("status")
            res = {
                "task_id": task_id,
                "status": status,
            }
            if status == "SUCCESS":
                res["result"] = task_info.get("result")
            elif status == "FAILURE":
                 res["error"] = task_info.get("error")
            results[task_id] = res
            continue

        # Fallback to Celery check
        try:
            task_result = AsyncResult(task_id, app=celery_app)
            status = task_result.status
            
            res = {
                "task_id": task_id,
                "status": status,
            }
            
            if task_result.ready():
                res["result"] = task_result.result
                if status == 'SUCCESS':
                     res["status"] = 'SUCCESS'
            elif task_result.failed():
                res["error"] = str(task_result.result)
                res["status"] = 'FAILURE'
                
            results[task_id] = res
        except Exception as e:
            logger.error(f"Error checking task {task_id}: {e}")
            results[task_id] = {"task_id": task_id, "status": "PENDING"}
            
    return results

@router.post("/tasks/stop")
async def stop_tasks(task_ids: List[str] = Body(...)):
    """
    Revoke (stop) a list of tasks.
    Also clears any pending tasks in the Celery queue.
    """
    logger.info(f"Stopping tasks: received {len(task_ids)} IDs. Purging queue...")
    count = 0
    # 1. Revoke specific running/pending tasks
    for tid in task_ids:
        try:
            # terminate=True kills the worker process executing the task
            celery_app.control.revoke(tid, terminate=True)
            count += 1
            # Also update memory tasks if present
            if tid in MEMORY_TASKS:
                MEMORY_TASKS[tid]["status"] = "REVOKED"
        except Exception as e:
            logger.error(f"Failed to revoke task {tid}: {e}")
            
    # 2. Purge the entire queue to remove any queued but not-yet-started tasks
    # This prevents them from being picked up by workers after we "stopped"
    try:
        purged_count = celery_app.control.purge()
        logger.info(f"Purged {purged_count} tasks from Celery queue")
    except Exception as e:
        logger.error(f"Failed to purge Celery queue: {e}")
            
    return {"message": f"Stopped {count} tasks and purged queue"}

@router.post("/analyze/retry")
async def retry_analysis(request: RetryRequest, background_tasks: BackgroundTasks):
    """
    Retry analysis for a single question and model.
    """
    question = request.question
    config = request.config.model_dump()
    config["is_retry"] = True # Mark as retry
    
    label = config.get("name_label") or config.get("provider")
    task_id = None
    use_fallback = False
    
    try:
        # Attempt to dispatch to Celery
        task = analyze_single_model_task.delay(question, config)
        task_id = task.id
    except Exception as e:
        logger.warning(f"Celery dispatch failed: {e}. Switching to in-memory fallback.")
        use_fallback = True
    
    if use_fallback:
        task_id = str(uuid.uuid4())
        MEMORY_TASKS[task_id] = {"status": "PENDING"}
        background_tasks.add_task(run_single_model_background, task_id, question, config)
        
    return {
        "question_id": question.get("id"),
        "model_label": label,
        "task_id": task_id,
        "status": "processing"
    }
