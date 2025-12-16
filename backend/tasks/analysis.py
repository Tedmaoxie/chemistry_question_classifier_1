import asyncio
from celery import shared_task
from typing import List, Dict, Any
import time
from backend.services.llm import LLMService

# API_KEYS are now passed in configs, but we can keep this as fallback or remove if not needed
# For now, we rely on configs passed from frontend

def perform_single_model_analysis(question_data: Dict[str, Any], config: Dict[str, Any]) -> Dict[str, Any]:
    """
    Synchronous function to perform analysis for a SINGLE model.
    """
    content = question_data.get("content")
    
    # Config structure: provider, api_key, base_url, model_name, temperature, name_label
    provider = config.get("provider")
    api_key = config.get("api_key")
    base_url = config.get("base_url")
    model_name = config.get("model_name")
    temperature = config.get("temperature", 0.3)
    label = config.get("name_label") or provider 
    is_retry = config.get("is_retry", False)

    result_data = {}

    if not api_key:
        result_data = {
            "error": "API Key not provided",
            "level": "Error",
            "final_level": "Error",
            "scores": [0, 0, 0],
            "markdown_report": "**分析失败**\n\n未提供 API Key，无法进行分析。"
        }
    else:
        try:
            start_time = time.time()
            llm_service = LLMService(
                provider=provider, 
                api_key=api_key,
                base_url=base_url,
                model_name=model_name,
                temperature=temperature
            )
            analysis_result = llm_service.analyze_question(content)
            end_time = time.time()
            
            # Add elapsed time
            analysis_result["elapsed_time"] = round(end_time - start_time, 2)
            result_data = analysis_result
        except Exception as e:
            result_data = {
                "error": str(e),
                "level": "Error",
                "final_level": "Error",
                "scores": [0, 0, 0],
                "markdown_report": f"**分析失败**\n\n发生错误：{str(e)}"
            }
    
    # Inject retry metadata if applicable
    if is_retry:
        result_data["meta"] = result_data.get("meta", {})
        if not isinstance(result_data["meta"], dict):
             result_data["meta"] = {}
        result_data["meta"]["retry_timestamp"] = time.time()
        result_data["meta"]["retry_type"] = "manual"
            
    return {
        "model_label": label,
        "result": result_data
    }

def perform_analysis_sync(question_data: Dict[str, Any], configs: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Legacy synchronous function to perform analysis logic for multiple configs.
    Kept for backward compatibility or bulk sync execution.
    """
    question_id = question_data.get("id")
    results = {}
    
    for config in configs:
        single_res = perform_single_model_analysis(question_data, config)
        results[single_res["model_label"]] = single_res["result"]
        
    return {
        "question_id": question_id,
        "status": "completed",
        "results": results
    }

@shared_task(name="backend.tasks.analysis.analyze_single_model_task", bind=True, acks_late=True, max_retries=3)
def analyze_single_model_task(self, question_data: Dict[str, Any], config: Dict[str, Any]):
    """
    Async task to analyze a chemistry question using a SINGLE LLM config.
    """
    try:
        return perform_single_model_analysis(question_data, config)
    except Exception as e:
        self.retry(exc=e, countdown=5)

@shared_task(name="backend.tasks.analysis.analyze_question_task", bind=True, acks_late=True, max_retries=3)
def analyze_question_task(self, question_data: Dict[str, Any], configs: List[Dict[str, Any]]):
    """
    Async task to analyze a chemistry question using specified LLMs (Multiple).
    """
    try:
        return perform_analysis_sync(question_data, configs)
    except Exception as e:
        # Retry on failure
        self.retry(exc=e, countdown=5)
