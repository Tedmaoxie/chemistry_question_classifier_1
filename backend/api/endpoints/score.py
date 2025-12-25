import pandas as pd
import io
import json
import logging
import re
import os
import sys
import uuid
import asyncio
from typing import Dict, Any, List
from fastapi import APIRouter, File, UploadFile, HTTPException, Form, BackgroundTasks
from pydantic import BaseModel
from backend.services.llm import LLMService
from backend.tasks.score import analyze_score_task, perform_score_analysis_sync
from backend.api.endpoints.analysis import ModelConfig, MEMORY_TASKS, executor

router = APIRouter()
logger = logging.getLogger(__name__)

# --- Helper for Desktop Mode ---
async def run_score_analysis_background(task_id: str, score_data: Any, question_data: Any, mode: str, config: Any, group_name: str = None):
    """在后台线程池中运行成绩分析任务"""
    try:
        if task_id not in MEMORY_TASKS:
            logger.warning(f"Task {task_id} no longer in MEMORY_TASKS, skipping update.")
            return
        MEMORY_TASKS[task_id]["status"] = "PROCESSING"
        
        # 核心：使用线程池运行同步分析逻辑
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(executor, perform_score_analysis_sync, score_data, question_data, mode, config)
        
        if task_id not in MEMORY_TASKS:
            logger.warning(f"Task {task_id} no longer in MEMORY_TASKS, skipping update.")
            return
            
        # 如果是班级模式的分组分析，提取对应的结果
        if mode == 'class' and group_name and isinstance(result, dict) and group_name in result:
            result = result[group_name]
            
        MEMORY_TASKS[task_id]["status"] = "SUCCESS"
        MEMORY_TASKS[task_id]["result"] = result
    except Exception as e:
        logger.error(f"Score analysis background task failed: {e}")
        if task_id in MEMORY_TASKS:
            MEMORY_TASKS[task_id]["status"] = "FAILURE"
            MEMORY_TASKS[task_id]["error"] = str(e)

class VariantRequest(BaseModel):
    question_content: str
    topic: str
    abilities: str
    config: Dict[str, Any]

@router.post("/score/variant/generate")
async def generate_variant(request: VariantRequest):
    """
    Generate a variant question.
    """
    try:
        llm = LLMService(
            provider=request.config.get("provider", "deepseek"),
            api_key=request.config.get("apiKey"),
            base_url=request.config.get("baseUrl"),
            model_name=request.config.get("modelName"),
            temperature=0.7 # Higher temperature for creativity in generation
        )
        
        result = llm.generate_variant_question(
            request.question_content,
            request.topic,
            request.abilities
        )
        
        if "error" in result:
             raise HTTPException(status_code=500, detail=result["error"])
             
        return result
        
    except Exception as e:
        logger.error(f"Variant generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# --- Pydantic Models ---
class ScoreAnalysisRequest(BaseModel):
    score_data: List[Dict[str, Any]]
    question_data: List[Dict[str, Any]]
    mode: str  # 'class' or 'student'
    config: ModelConfig

# --- Validation Logic ---
def validate_class_data(df: pd.DataFrame) -> List[Dict]:
    """
    校验并格式化班级成绩数据。
    支持两种格式：
    1. 聚合数据：包含“题号”和“得分率”列。
    2. 学生原始数据：包含“学生ID/姓名”和“题目得分”列（将自动计算平均分作为得分率）。
    """
    df.columns = df.columns.str.strip() # 去除列名空格
    
    # Helper for case-insensitive matching
    def find_col(keywords):
        return next((c for c in df.columns if any(k in str(c).lower() for k in keywords)), None)

    # 1. 检查是否为聚合格式（只有题目和得分率）
    q_col = find_col(['题号', '题目', 'id', 'question_id', 'question'])
    r_col = find_col(['得分率', '平均分', 'score_rate', 'rate', '得分'])
    
    # 新增：查找满分列
    f_col = find_col(['满分', 'full_score', 'total_score', 'max_score'])
    
    # 避免误判：如果r_col也是题目列（例如“得分”既包含在“题目得分”也包含在“得分率”），需要更严格
    # 如果找到学生列，优先当作学生数据处理
    s_col = find_col(['姓名', '学号', 'student_id', 'name', 'student'])

    # --- 智能修正：宽表聚合数据支持 ---
    # 场景：用户上传了 [题号, 满分, 年级, 班级1, 班级2...]
    # 此时 q_col, f_col 存在，但 r_col (得分率) 可能未识别（因为列名是 Grade 或 ClassA）
    # 且 s_col 不存在
    if q_col and not r_col and not s_col:
        # 排除已识别的列
        excluded = [q_col]
        if f_col: excluded.append(f_col)
        
        potential_cols = [c for c in df.columns if c not in excluded]
        
        if potential_cols:
            # 1. 优先寻找代表“整体/年级”的列
            priority_keywords = ['grade', '年级', 'total', '总体', 'average', '平均', 'all']
            target_col = next((c for c in potential_cols if any(k in str(c).lower() for k in priority_keywords)), None)
            
            # 2. 如果没找到，默认取第一列（通常紧跟在满分列后面的是年级数据）
            if not target_col:
                target_col = potential_cols[0]
            
            r_col = target_col
            # logger.info(f"Auto-detected score rate column: {r_col}")

    if q_col and r_col and not s_col:
        # 确实是聚合数据
        try:
            df[r_col] = pd.to_numeric(df[r_col]) # 确保得分率是数字
        except Exception:
            raise ValueError(f"'{r_col}' 列必须包含数值类型的数据")
        
        # 简单检查数值范围
        max_val = df[r_col].max()
        if max_val > 100:
            raise ValueError(f"'{r_col}' 列包含大于100的数值，请检查数据")
            
        # 处理满分列
        if f_col:
            try:
                df[f_col] = pd.to_numeric(df[f_col])
            except Exception:
                raise ValueError(f"'{f_col}' 列必须包含数值类型的数据")
        else:
            # 必须包含满分字段
            raise ValueError("数据中缺少满分列。请确保包含'满分'、'full_score'或'max_score'列。")

        # 重命名为统一的键名
        rename_map = {q_col: 'question_id'}
        if f_col != 'full_score':
            rename_map[f_col] = 'full_score'
            
        df = df.rename(columns=rename_map)
        
        # 处理得分率列 (保留原列名用于展示，同时创建标准 score_rate 列用于分析)
        # 如果原列名已经是 score_rate，则无需复制
        if r_col == 'score_rate':
            pass
        elif r_col in ['得分率', '平均分', 'rate']:
             # 常见中文名，直接重命名为 score_rate 以避免混淆
             df = df.rename(columns={r_col: 'score_rate'})
        else:
             # 特殊列名 (如 Grade, Year 1)，保留原列，并复制一份作为 score_rate
             # 确保原列也是数值型
             try:
                 df[r_col] = pd.to_numeric(df[r_col])
             except:
                 pass
             df['score_rate'] = df[r_col]
        
        # 确保 score_rate 是 0-1 之间的小数 (如果是百分数则转换)
        # 启发式判断：如果均值 > 1，则认为是百分制或原始分
        if df['score_rate'].mean() > 1:
             # 如果是原始分，且有满分数据，转换为得分率
             if df['full_score'].notna().all():
                 # 检查是否有关数值大于满分 (这就意味着它不可能是原始分，只能是百分制)
                 # 例如：满分10分，用户填了85(%)，85 > 10，所以是百分制
                 if (df['score_rate'] > df['full_score']).any():
                     df['score_rate'] = df['score_rate'] / 100.0
                 else:
                     # 所有数值都小于等于满分，认为是原始平均分
                     df['score_rate'] = df['score_rate'] / df['full_score']
             else:
                 # 假设是百分比 (0-100)
                 df['score_rate'] = df['score_rate'] / 100.0
        
        # 再次校验范围
        if df['score_rate'].max() > 1.05: # 允许少量误差
             raise ValueError("计算后的得分率超过 100%，请检查数据")

        # 同步回原列：如果 score_rate 是从 Grade/年级 等列派生来的，
        # 将归一化后的值 (0-1) 写回原列，以便前端数据预览能显示正确的得分率数值
        if r_col and r_col != 'score_rate' and r_col in df.columns:
            df[r_col] = df['score_rate']

        # 尝试将其他可能的班级列也转换为数值 (Auto-convert other columns to numeric)
        # 排除已知非数值列
        known_cols = ['question_id', 'full_score', 'score_rate', 'average_score', '题号', '题目', '满分']
        if r_col: known_cols.append(r_col)
        
        for col in df.columns:
            if col not in known_cols and col not in rename_map.values():
                # 尝试转换，如果大部分是数字
                try:
                    # 先尝试转 numeric
                    s_numeric = pd.to_numeric(df[col], errors='coerce')
                    if s_numeric.notna().sum() / len(s_numeric) > 0.5:
                        # 这是一个数值列（可能是其他班级）
                        # 检查是否需要归一化 (类似 score_rate)
                         if s_numeric.mean() > 1 and df['full_score'].notna().all():
                             # 假设规则相同：如果 > 1 且 <= 满分 -> / full_score; 如果 > full_score -> / 100
                             is_percent = (s_numeric > df['full_score']).any()
                             if is_percent:
                                 df[col] = s_numeric / 100.0
                             else:
                                 df[col] = s_numeric / df['full_score']
                         else:
                             df[col] = s_numeric
                except:
                    pass

        # 计算平均分 (均分 = 满分 * 得分率)
        if df['full_score'].notna().all():
            df['average_score'] = df['full_score'] * df['score_rate']
        else:
            df['average_score'] = None

        # Return all columns to support wide-table format (multiple classes)
        # Ensure we don't return NaN as JSON standard doesn't support it (replace with None or 0)
        return df.where(pd.notnull(df), None).to_dict(orient='records')
        
    # 2. 检查是否为学生原始数据（需要聚合计算）
    if s_col:
        # 识别班级列，避免将其误认为题目
        c_col = find_col(['class_id', 'class', '班级'])
        
        # 是学生数据，我们需要算出每道题的平均分
        # 排除学生列、满分列和班级列
        excluded_cols = [s_col]
        if f_col: excluded_cols.append(f_col)
        if c_col: excluded_cols.append(c_col)
        
        q_cols = [c for c in df.columns if c not in excluded_cols]
        
        if not q_cols:
            raise ValueError("未找到题目得分列。")
        
        aggregated = []
        
        # 尝试获取满分信息
        full_scores = {}
        full_score_row_idx = None
        
        # 1. 检查是否有"满分"列 (f_col) - 已在上面处理，但通常宽表没有f_col
        
        # 2. 检查特定行 (第一行或第二行) 是否为满分行
        # 类似 validate_student_data 的逻辑
        if not df.empty:
            # Check first row
            first_val = str(df.iloc[0][s_col]).strip()
            if "满分" in first_val or "full" in first_val.lower() or "max" in first_val.lower():
                full_score_row_idx = 0
            # Check second row
            elif len(df) > 1:
                second_val = str(df.iloc[1][s_col]).strip()
                if "满分" in second_val or "full" in second_val.lower() or "max" in second_val.lower():
                    full_score_row_idx = 1
        
        if full_score_row_idx is not None:
             # 提取满分行
            row = df.iloc[full_score_row_idx]
            for q in q_cols:
                try:
                    val = pd.to_numeric(row[q])
                    full_scores[q] = val
                except:
                    full_scores[q] = 10 # Default fallback
            
            # 移除满分行，以免影响平均分计算
            df = df.drop(df.index[full_score_row_idx]).reset_index(drop=True)
            
        else:
            # Fallback: 尝试全局搜索 "满分" 行 (兼容旧逻辑)
            full_score_rows = df[df[s_col].astype(str).str.contains('满分', na=False)]
            if not full_score_rows.empty:
                row = full_score_rows.iloc[0]
                for q in q_cols:
                    try:
                        val = pd.to_numeric(row[q])
                        full_scores[q] = val
                    except:
                        full_scores[q] = 10
                # 移除
                df = df[~df[s_col].astype(str).str.contains('满分', na=False)]
            else:
                # 尝试从列名提取 Q1(10分)
                for q in q_cols:
                    import re
                    match = re.search(r'[\(（](\d+)分?[\)）]', str(q))
                    if match:
                        full_scores[q] = float(match.group(1))
        
        # 检查是否所有题目都找到了满分
        if len(full_scores) < len(q_cols):
             missing = [q for q in q_cols if q not in full_scores]
             # 如果缺失的满分信息太多，且没有满分行，报错
             # 但如果只有部分缺失（可能列名解析失败），可以给默认值吗？
             # 为了严格性，还是报错提示用户
             raise ValueError(f"未找到以下题目的满分信息: {missing}。请在列名中标注，如 'Q1(10分)'，或提供满分行（在'{s_col}'列填'满分'）。")
        
        for q in q_cols:
            try:
                # 强制转换为数字，非数字转为NaN
                vals = pd.to_numeric(df[q], errors='coerce')
                # 计算平均值
                avg = vals.mean()
                if pd.notna(avg):
                    f_score = full_scores.get(q, 10)
                    aggregated.append({
                        "question_id": q,
                        "score_rate": f"{avg/f_score:.2f}" if f_score else "0.00",
                        "full_score": f_score,
                        "average_score": f"{avg:.2f}"
                    })
            except Exception:
                pass
        
        if not aggregated:
            raise ValueError("无法从学生数据计算平均分，请确保包含有效的数值型得分列")
            
        return aggregated

    raise ValueError(f"无法识别数据格式。当前列：{list(df.columns)}。请提供'题号'+'得分率'（聚合数据）或'姓名'+'题目得分'（学生数据）。")

def validate_student_data(df: pd.DataFrame) -> Dict[str, Any]:
    """
    Validate and format student score data.
    Expected: Student ID/Name, and Question Scores.
    Supports headers like "Q1(10分)" to extract full score and validate.
    Also supports a dedicated "Full Score" row (row with "满分" in student column).
    """
    df.columns = df.columns.str.strip()
    
    # Helper for case-insensitive matching
    def find_col(keywords):
        return next((c for c in df.columns if any(k in str(c).lower() for k in keywords)), None)

    # 1. Identify Student Identifier column
    s_col = find_col(['姓名', '学号', 'student_id', 'name', 'student'])
    
    if not s_col:
        raise ValueError(f"无法识别学生标识列。请确保包含'姓名'或'学号'列。当前列: {list(df.columns)}")
    
    # 1.5 Identify Class Identifier column (Optional)
    c_col = find_col(['class_id', 'class', '班级'])

    # 2. Identify Question Columns (all other columns)
    # Exclude student column AND class column
    excluded_cols = [s_col]
    if c_col:
        excluded_cols.append(c_col)

    q_cols = [c for c in df.columns if c not in excluded_cols]
    if not q_cols:
        raise ValueError("未找到题目得分列。")
        
    # Rename student column
    df = df.rename(columns={s_col: 'student_id'})
    
    # Rename class column if exists
    if c_col:
        df = df.rename(columns={c_col: 'class_id'})
    
    full_scores = {}
    
    # 2.5 Check for "Full Score" row (First row or labeled "满分")
    # We check if the first row's student_id contains "满分" or "Full Score"
    full_score_row_idx = None
    
    # Check first row and second row explicitly
    if not df.empty:
        # Check first row
        first_val = str(df.iloc[0]['student_id']).strip()
        if "满分" in first_val or "full" in first_val.lower() or "max" in first_val.lower():
            full_score_row_idx = 0
        # Check second row if first row is not it (User feedback: sometimes full score is on 2nd row)
        elif len(df) > 1:
            second_val = str(df.iloc[1]['student_id']).strip()
            if "满分" in second_val or "full" in second_val.lower() or "max" in second_val.lower():
                full_score_row_idx = 1
    
    if full_score_row_idx is not None:
        # Extract full scores from this row
        row = df.iloc[full_score_row_idx]
        for col in q_cols:
            try:
                val = row[col]
                if pd.notna(val) and str(val).strip() != '':
                    full_scores[col] = float(val)
            except Exception:
                pass # Ignore parse errors in full score row
        
        # Remove the full score row from data
        df = df.drop(df.index[full_score_row_idx]).reset_index(drop=True)
    
    # Extra safety: Ensure 'class_id' or similar columns are not treated as questions
    # (In case they were missed by find_col for some reason)
    q_cols = [c for c in q_cols if not any(k == str(c).lower() for k in ['class_id', 'class', '班级'])]
    
    # 3. Extract Full Scores from Headers (fallback or supplement)
    # (e.g., "Q1(10分)") - Only if not found in row, or to double check? 
    # Let's say Header extraction is secondary if Row exists, or complementary.
    import re
    for col in q_cols:
        if col not in full_scores:
            # Support both English () and Chinese （） parentheses
            match = re.search(r'[\(（](\d+)分?[\)）]', str(col))
            if match:
                try:
                    full_scores[col] = float(match.group(1))
                except:
                    pass

    # 4. Validate Data
    # Ensure scores are numeric and within range (if full score known)
    for idx, row in df.iterrows():
        for col in q_cols:
            val = row[col]
            # Skip empty/NaN
            if pd.isna(val) or str(val).strip() == '':
                continue
                
            try:
                num_val = float(val)
                
                # Check non-negative
                if num_val < 0:
                    raise ValueError(f"学生 '{row['student_id']}' 在 '{col}' 的得分不能为负数 ({num_val})")

                # Check max score if available
                if col in full_scores:
                    max_score = full_scores[col]
                    if num_val > max_score:
                        raise ValueError(f"学生 '{row['student_id']}' 在 '{col}' 的得分 ({num_val}) 超过了满分 ({max_score})")
                        
                # Update the value in dataframe to be float (clean up strings)
                df.at[idx, col] = num_val
                
            except ValueError as e:
                # Re-raise our specific errors
                if "得分" in str(e):
                    raise e
                # For parse errors
                raise ValueError(f"学生 '{row['student_id']}' 在 '{col}' 的得分必须为数值。当前值: {val}")

    return {
        "records": df.to_dict(orient='records'),
        "full_scores": full_scores
    }

def format_question_data(questions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Simplify question data to minimize token usage while keeping essential info.
    Returns list of dicts (not JSON string) to allow further processing.
    """
    simplified = []
    
    # Debug: Print first question keys to help identify structure
    if questions:
        msg = f"Formatting Question Data. First Item Full Content: {json.dumps(questions[0], ensure_ascii=False, default=str)}"
        logger.info(msg)
        print(msg)

    for q in questions:
        # --- Extract Topics ---
        topics = []
        
        # 0. Try 'meta' dict (Based on observed data structure)
        if "meta" in q:
            meta = q["meta"]
            # Handle case where meta is a JSON string
            if isinstance(meta, str):
                try:
                    meta = json.loads(meta)
                except Exception as e:
                    logger.warning(f"Failed to parse meta JSON for QID {q.get('id')}: {e}")
                    meta = {}
            
            if isinstance(meta, dict):
                # Extract knowledge_topic
                if "knowledge_topic" in meta and meta["knowledge_topic"]:
                    topics.append(str(meta["knowledge_topic"]))
                # Extract framework_topic
                if "framework_topic" in meta and meta["framework_topic"]:
                    topics.append(str(meta["framework_topic"]))
                
        # 1. Try framework_knowledge (list of dicts)
        if "framework_knowledge" in q and isinstance(q["framework_knowledge"], list):
             topics.extend([k.get("topic") for k in q["framework_knowledge"] if isinstance(k, dict) and "topic" in k])
        
        # 2. Try direct keys (list or string)
        for k in ["knowledge_topics", "knowledge_topic", "framework_topic", "topic", "知识主题", "框架主题"]:
             # ... (existing logic)
             if k in q and q[k]:
                val = q[k]
                if isinstance(val, list):
                    topics.extend([str(v) for v in val])
                elif isinstance(val, str):
                    topics.append(val)
        
        # Deduplicate and clean
        topics = list(set([t.strip() for t in topics if t and isinstance(t, str)]))

        # --- Extract Abilities ---
        abilities = []
        
        # 0. Try 'meta' dict (Based on observed data structure)
        if "meta" in q:
            meta = q["meta"]
            if isinstance(meta, str):
                try:
                    meta = json.loads(meta)
                except:
                    meta = {}

            if isinstance(meta, dict):
                if "ability_elements" in meta and isinstance(meta["ability_elements"], list):
                    abilities.extend([str(a) for a in meta["ability_elements"]])
                elif "ability_elements" in meta and isinstance(meta["ability_elements"], str):
                    abilities.append(meta["ability_elements"])

        # 1. Try ability_dimensions (list of dicts)
        if "ability_dimensions" in q and isinstance(q["ability_dimensions"], list):
             # Filter out items with value/score <= 0
             for a in q["ability_dimensions"]:
                 if isinstance(a, dict) and "name" in a:
                     val = a.get("value") or a.get("score") or a.get("weight")
                     if val is not None:
                         try:
                             if float(val) <= 0:
                                 continue
                         except:
                             pass
                     abilities.append(a.get("name"))
        
        # 2. Try direct keys
        for k in ["abilities", "ability_elements", "competency_elements", "ability_dimensions", "能力要素", "核心能力要素"]:
             # ... (existing logic)
             if k in q and q[k]:
                val = q[k]
                if isinstance(val, list):
                    # Check if list of strings or dicts
                    for v in val:
                        if isinstance(v, str):
                            abilities.append(v)
                        elif isinstance(v, dict) and "name" in v:
                            # Filter 0 values
                            v_val = v.get("value") or v.get("score") or v.get("weight")
                            if v_val is not None:
                                try:
                                    if float(v_val) <= 0:
                                        continue
                                except:
                                    pass
                            abilities.append(v["name"])
                        elif isinstance(v, str): # Handle mixed list
                             abilities.append(v)
                elif isinstance(val, str):
                    abilities.append(val)

        # Deduplicate and clean
        abilities = list(set([a.strip() for a in abilities if a and isinstance(a, str)]))

        # --- Extract Full Score ---
        full_score = None
        # 1. Try direct keys
        for k in ["full_score", "score", "满分", "分数"]:
            if k in q and q[k]:
                try:
                    full_score = float(q[k])
                    break
                except:
                    pass
        
        # 2. Try to extract from content if not found
        if full_score is None:
            content_str = q.get("content") or q.get("题目文本") or q.get("题目内容") or ""
            # Match (3分) or （3分） at start or end, or inside
            # Usually score is at the end of stem or in parentheses
            # Regex: Look for number before "分" in parentheses
            score_match = re.search(r'[\(（](\d+(\.\d+)?)分?[\)）]', str(content_str))
            if score_match:
                try:
                    full_score = float(score_match.group(1))
                except:
                    pass

        item = {
            "question_id": q.get("id") or q.get("question_id") or q.get("题号"),
            "content": q.get("content") or q.get("题目文本") or q.get("题目内容"),
            "difficulty": q.get("final_level") or q.get("difficulty") or q.get("难度等级"),
            "knowledge_topics": topics,
            "abilities": abilities,
            "full_score": full_score
        }
        # Debug: Check if extraction worked
        if not topics and not abilities:
            print(f"WARNING: Extraction failed for QID {item['question_id']}. Topics: {topics}, Abilities: {abilities}")
            
        simplified.append(item)
        
    return simplified


@router.post("/score/upload")
def upload_score_data(
    file: UploadFile = File(...),
    mode: str = Form(...) # class or student
):
    """
    Upload and validate score data (Excel or CSV).
    Returns parsed JSON data ready for analysis.
    """
    if not file.filename.endswith(('.xlsx', '.xls', '.csv')):
        raise HTTPException(status_code=400, detail="Only Excel (.xlsx, .xls) and CSV (.csv) files are supported")
    
    try:
        contents = file.file.read()
        if file.filename.endswith('.csv'):
            # Try different encodings for CSV
            encodings = ['utf-8', 'gbk', 'gb18030', 'utf-8-sig']
            df = None
            last_error = None
            
            for encoding in encodings:
                try:
                    df = pd.read_csv(io.BytesIO(contents), encoding=encoding)
                    break
                except UnicodeDecodeError as e:
                    last_error = e
                    continue
            
            if df is None:
                raise ValueError(f"Failed to decode CSV file. Please ensure it is encoded in UTF-8 or GBK. Error: {last_error}")
        else:
            df = pd.read_excel(io.BytesIO(contents))
            
        if df.empty:
            raise HTTPException(status_code=400, detail="The uploaded file is empty")

        # Validate based on mode
        full_scores = {}
        if mode == 'class':
            data = validate_class_data(df)
        elif mode == 'student':
            validation_result = validate_student_data(df)
            data = validation_result["records"]
            full_scores = validation_result["full_scores"]
        else:
            raise HTTPException(status_code=400, detail=f"Invalid mode: {mode}")
            
        return {
            "filename": file.filename,
            "data": data,
            "count": len(data),
            "columns": list(df.columns), # Return original columns for UI reference
            "full_scores": full_scores
        }
        
    except ValueError as ve:
        logger.warning(f"Validation error: {ve}")
        raise HTTPException(status_code=400, detail=str(ve))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"File processing error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to process file: {str(e)}")

@router.post("/score/analyze")
async def analyze_score(request: ScoreAnalysisRequest, background_tasks: BackgroundTasks):
    """
    Start analysis for score data.
    """
    score_data = request.score_data
    question_data = request.question_data
    mode = request.mode
    config = request.config.model_dump()
    
    if not score_data or not question_data:
        raise HTTPException(status_code=400, detail="Missing score or question data")

    # Format Question Data (Common Context) - Now returns List[Dict]
    q_context_list = format_question_data(question_data)
    
    tasks_response = []
    # Force fallback if running in Desktop mode or frozen executable
    use_fallback = os.environ.get("RUNNING_DESKTOP") == "true" or getattr(sys, 'frozen', False)
    
    if use_fallback:
        logger.info("Desktop mode detected in Score Analysis: Using in-memory BackgroundTasks.")
    
    try:
        if mode == 'class':
            # --- 优化：将班级分析按组拆分，实现实时结果显示 ---
            # 识别分组（年级/班级）
            first_row = score_data[0] if score_data else {}
            exclude_keys = ['question_id', 'full_score', 'average_score', 'id', 'score_rate', 'group_name']
            potential_groups = [k for k in first_row.keys() if k not in exclude_keys and not k.startswith('_')]
            
            # 如果没有明确分组，至少分析总得分率 (score_rate)
            if not potential_groups and 'score_rate' in first_row:
                potential_groups = ['score_rate']
            
            if not potential_groups:
                # 最后的保底：如果什么都没找到，就整体分析
                potential_groups = ['Overall']

            for g_name in potential_groups:
                # 准备该组的得分数据
                group_score_data = []
                for item in score_data:
                    # 这里的逻辑需要和 perform_score_analysis_sync 保持一致
                    group_score_data.append({
                        "question_id": item.get("question_id"),
                        "score_rate": item.get(g_name) if g_name in item else item.get("score_rate"),
                        "group_name": g_name
                    })
                
                if not group_score_data: continue

                if use_fallback:
                    task_id = f"score_class_{uuid.uuid4()}"
                    MEMORY_TASKS[task_id] = {"status": "PENDING"}
                    background_tasks.add_task(run_score_analysis_background, task_id, group_score_data, q_context_list, mode, config, g_name)
                    tasks_response.append({"id": g_name, "task_id": task_id})
                else:
                    # 服务器模式：使用 Celery
                    task = analyze_score_task.delay(group_score_data, q_context_list, mode, config)
                    tasks_response.append({"id": g_name, "task_id": task.id})
            
        elif mode == 'student':
            # 个人模式：每个学生是一个独立任务
            for idx, row in enumerate(score_data):
                student_id = row.get("student_id") or row.get("姓名") or f"Student_{idx+1}"
                
                if use_fallback:
                    task_id = f"score_student_{uuid.uuid4()}"
                    MEMORY_TASKS[task_id] = {"status": "PENDING"}
                    background_tasks.add_task(run_score_analysis_background, task_id, row, q_context_list, mode, config)
                    tasks_response.append({"id": str(student_id), "task_id": task_id})
                else:
                    task = analyze_score_task.delay(row, q_context_list, mode, config)
                    tasks_response.append({"id": str(student_id), "task_id": task.id})
                
        return {"tasks": tasks_response, "message": f"Started {len(tasks_response)} analysis tasks"}
        
    except Exception as e:
        logger.error(f"Failed to start analysis: {e}")
        raise HTTPException(status_code=500, detail=str(e))
