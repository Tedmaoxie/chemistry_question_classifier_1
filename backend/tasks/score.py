from typing import Dict, Any, List, Union
from celery import shared_task
from backend.services.llm import LLMService
import logging
import json

import re

logger = logging.getLogger(__name__)

def normalize_id(qid: Union[str, int]) -> str:
    """
    Normalize question ID for comparison.
    Example: "Q1" -> "1", "1" -> "1", "q1" -> "1"
    "Q3_1" -> "3_1", "3-1" -> "3_1"
    """
    s = str(qid).strip().lower()
    
    # Remove common prefixes (start of string)
    s = re.sub(r'^(q|question|题)\s*', '', s)
    
    # Remove score info like (10分) or （10分）
    s = re.sub(r'[\(（].*?[\)）]', '', s)
    
    # Normalize separators to underscore
    s = s.replace('-', '_').replace('.', '_')
    
    # Remove any remaining whitespace
    s = s.strip()
    
    return s

def find_question_info(qid: str, q_map: Dict[str, Any]) -> Dict[str, Any]:
    """
    Find question info with fallback strategies.
    q_map must be pre-normalized.
    """
    norm_qid = normalize_id(qid)
    
    # 1. Exact Match
    if norm_qid in q_map:
        return q_map[norm_qid]
    
    # 2. Try adding _1 (common sub-question convention)
    # If the score is for Q3, but we only have 3_1, 3_2, etc.
    # We map to 3_1 as a representative.
    if f"{norm_qid}_1" in q_map:
        return q_map[f"{norm_qid}_1"]
        
    # 3. Try finding any sub-question (prefix match)
    # Check for keys like "3_*"
    prefix = f"{norm_qid}_"
    for k in q_map:
        if k.startswith(prefix):
            return q_map[k]
            
    return None

def calculate_class_stats(score_data: List[Dict[str, Any]], q_map: Dict[str, Any]) -> Dict[str, Any]:
    """
    Calculate difficulty level statistics for class mode.
    """
    stats = {
        "L1": {"count": 0, "sum_rate": 0.0, "avg_rate": 0.0},
        "L2": {"count": 0, "sum_rate": 0.0, "avg_rate": 0.0},
        "L3": {"count": 0, "sum_rate": 0.0, "avg_rate": 0.0},
        "L4": {"count": 0, "sum_rate": 0.0, "avg_rate": 0.0},
        "L5": {"count": 0, "sum_rate": 0.0, "avg_rate": 0.0},
    }
    
    # Pre-normalize q_map keys
    normalized_q_map = {normalize_id(k): v for k, v in q_map.items()}
    
    for item in score_data:
        qid = str(item.get("question_id"))
        
        try:
            val = item.get("score_rate", 0)
            if isinstance(val, str):
                val = val.replace('%', '')
            rate = float(val)
            # If rate is > 1 (e.g. 85), assume percentage and divide by 100
            if rate > 1:
                rate = rate / 100.0
        except:
            rate = 0.0
            
        q_info = find_question_info(qid, normalized_q_map)
        
        if q_info:
            level = q_info.get("difficulty", "L3") # Default L3 if missing
            if level not in stats:
                level = "L3" # Fallback
            
            stats[level]["count"] += 1
            stats[level]["sum_rate"] += rate
        else:
            norm_qid = normalize_id(qid)
            logger.warning(f"Could not map score question '{qid}' (norm: '{norm_qid}') to metadata. Available: {list(normalized_q_map.keys())}")
            
    # Compute averages
    for level in stats:
        if stats[level]["count"] > 0:
            stats[level]["avg_rate"] = float(f"{stats[level]['sum_rate'] / stats[level]['count'] * 100:.1f}")
        else:
            stats[level]["avg_rate"] = 0.0
            
    return stats

def calculate_student_topic_stats(score_data: Dict[str, Any], q_map: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Calculate knowledge topic mastery for student mode.
    """
    # 根据需求固定的框架主题列表 (仅含9大主题)
    valid_topics = [
        '有机化学', '热化学', '速率平衡', '电化学', '水溶液', 
        '原理综合', '物质结构', '无机综合', '实验探究'
    ]
    
    # Mapping aliases to standard topics
    topic_aliases = {
        "物质结构与性质": "物质结构",
        "化学反应速率与化学平衡": "速率平衡",
        "水溶液中的离子反应": "水溶液",
        "化学反应的热效应": "热化学",
        "有机化学基础": "有机化学",
        "实验": "实验探究",
        "化学实验": "实验探究"
    }
    
    topic_stats = {t: {"count": 0, "sum_score": 0.0, "sum_full_score": 0.0} for t in valid_topics}
    
    # Pre-normalize q_map keys
    normalized_q_map = {normalize_id(k): v for k, v in q_map.items()}
    
    # Debug logging
    logger.info(f"Calculating Topic Stats for Student: Processing {len(score_data)} scores")
    
    for key, val in score_data.items():
        if key in ["student_id", "姓名", "学号", "name"]:
            continue
            
        norm_qid = normalize_id(key)
        q_info = find_question_info(key, normalized_q_map)
        
        if q_info:
            # Robust topic extraction
            topics = []
            raw_topics = []
            if "knowledge_topics" in q_info and isinstance(q_info["knowledge_topics"], list):
                raw_topics.extend(q_info["knowledge_topics"])
            elif "knowledge_topic" in q_info:
                 raw_topics.append(q_info["knowledge_topic"])
            
            # Check for framework_topic if others missing
            if "framework_topic" in q_info:
                raw_topics.append(q_info["framework_topic"])

            # Normalize topics
            for t in raw_topics:
                t_clean = t.strip()
                if t_clean in valid_topics:
                    topics.append(t_clean)
                elif t_clean in topic_aliases:
                    topics.append(topic_aliases[t_clean])
                else:
                    # Try partial match
                    for vt in valid_topics:
                        if vt in t_clean or t_clean in vt:
                            topics.append(vt)
                            break
            
            # Deduplicate
            topics = list(set(topics))
            
            if not topics:
                logger.warning(f"No valid topics mapped for QID: {norm_qid}. Raw: {raw_topics}")

            # Extract full score
            # Priority: 1. q_info['full_score'] 2. Regex from ID 3. Default 10.0
            full_score = 10.0
            
            if "full_score" in q_info and q_info["full_score"] is not None:
                try:
                    full_score = float(q_info["full_score"])
                except:
                    pass
            else:
                match = re.search(r'[\(（](\d+)分?[\)）]', key)
                if match:
                    full_score = float(match.group(1))
            
            try:
                # Handle percentage or direct score
                val_str = str(val).replace('%', '')
                score = float(val_str)
                # If it looks like a rate (>1 means score, <=1 usually means rate but here we assume score input)
                # The input data is usually raw scores (e.g. 8, 9, 10).
                # But if the user uploaded rate data, we need to handle it.
                # Assuming standard score input as per "Score Analysis" context.
            except:
                score = 0.0
            
            # If input is clearly a rate (<=1) and full score is > 1, convert to score?
            # Or just assume input is score.
            # Safety check: if score > full_score, it might be an error or bonus? Cap it?
            if score > full_score:
                score = full_score
            
            for topic in topics:
                # Only count valid framework topics
                if topic in topic_stats:
                    topic_stats[topic]["count"] += 1
                    topic_stats[topic]["sum_score"] += score
                    topic_stats[topic]["sum_full_score"] += full_score

    result_list = []
    for topic in valid_topics:
        data = topic_stats[topic]
        
        # Weighted Calculation: Total Score / Total Full Score
        if data["sum_full_score"] > 0:
            avg = data["sum_score"] / data["sum_full_score"]
        else:
            avg = 0.0
        
        # Evaluation
        if data["count"] == 0:
            eval_str = "未涉及"
            avg_str = "0%" # Keep consistent with 0% for chart parsing
        else:
            if avg >= 0.85: eval_str = "优秀"
            elif avg >= 0.70: eval_str = "良好"
            elif avg >= 0.60: eval_str = "一般"
            else: eval_str = "薄弱"
            avg_str = f"{avg*100:.1f}%"
        
        result_list.append({
            "知识主题": topic,
            "掌握程度": avg_str,
            "掌握评价": eval_str,
            "主要问题": "" 
        })
        
    return result_list

def calculate_student_ability_stats(score_data: Dict[str, Any], q_map: Dict[str, Any]) -> Dict[str, Any]:
    """
    Calculate ability literacy radar for student mode.
    """
    # Structure: Category -> Ability -> Stats
    # Categories: 学习理解能力, 应用实践能力, 迁移创新能力
    # Abilities: A1, A2, A3, B1, B2, B3, C1, C2, C3
    
    # Map ability code to name and category
    ability_map = {
        "A1": {"name": "A1辨识记忆", "cat": "学习理解能力"},
        "A2": {"name": "A2概括关联", "cat": "学习理解能力"},
        "A3": {"name": "A3说明论证", "cat": "学习理解能力"},
        "B1": {"name": "B1分析解释", "cat": "应用实践能力"},
        "B2": {"name": "B2推论预测", "cat": "应用实践能力"},
        "B3": {"name": "B3简单设计", "cat": "应用实践能力"},
        "C1": {"name": "C1复杂推理", "cat": "迁移创新能力"},
        "C2": {"name": "C2系统探究", "cat": "迁移创新能力"},
        "C3": {"name": "C3创新思维", "cat": "迁移创新能力"}
    }
    
    # Initialize stats
    # Using nested dict to match result structure
    # result["能力要素分析"][cat][name] = {"掌握程度": "优秀", "val": 90}
    
    raw_stats = {code: {"count": 0, "sum_score": 0.0, "sum_full_score": 0.0} for code in ability_map}
    
    # Pre-normalize q_map keys
    normalized_q_map = {normalize_id(k): v for k, v in q_map.items()}
    
    # DEBUG: Log metadata availability
    # logger.info(f"Student Ability Stats: Processing {len(score_data)} scores against {len(normalized_q_map)} questions")
    
    for key, val in score_data.items():
        if key in ["student_id", "姓名", "学号", "name"]:
            continue
            
        norm_qid = normalize_id(key)
        q_info = find_question_info(key, normalized_q_map)
        
        if q_info:
            # Robust ability extraction
            q_abilities = []
            
            # Helper to extract from potential lists
            def extract_from_list(lst):
                res = []
                for item in lst:
                    if isinstance(item, str):
                        res.append(item)
                    elif isinstance(item, dict) and "name" in item:
                        # Check if it has a value/score indicating 0/False
                        val = item.get("value") or item.get("score") or item.get("weight")
                        if val is not None:
                            try:
                                if float(val) <= 0:
                                    continue
                            except:
                                pass
                        res.append(item["name"])
                return res

            # Check various keys
            for field_key in ["abilities", "ability_elements", "competency_elements", "ability_dimensions"]:
                if field_key in q_info and isinstance(q_info[field_key], list):
                    q_abilities.extend(extract_from_list(q_info[field_key]))
            
            # Extract full score
            # Priority: 1. q_info['full_score'] 2. Regex from ID 3. Default 10.0
            full_score = 10.0
            
            if "full_score" in q_info and q_info["full_score"] is not None:
                try:
                    full_score = float(q_info["full_score"])
                except:
                    pass
            else:
                match = re.search(r'[\(（](\d+)分?[\)）]', key)
                if match:
                    full_score = float(match.group(1))
            
            try:
                val_str = str(val).replace('%', '')
                score = float(val_str)
            except:
                score = 0.0

            # DEBUG: Log abilities found
            if not q_abilities:
                logger.warning(f"No abilities found for QID: {norm_qid} in keys {list(q_info.keys())}")
            else:
                 logger.info(f"QID: {norm_qid}, Abilities: {q_abilities}, Score: {score}/{full_score}")
            
            if score > full_score:
                score = full_score
            
            for ability_name in q_abilities:
                # Extract code A1/B2...
                # Handle "A1 辨识记忆" or just "A1" or "辨识记忆(A1)"
                code_match = re.search(r'([A-C][1-3])', str(ability_name))
                if code_match:
                    code = code_match.group(1)
                    if code in raw_stats:
                        raw_stats[code]["count"] += 1
                        # For multi-label, we attribute the FULL score and FULL potential score to EACH dimension
                        # This is standard "Tag-based Analysis" where score contributes to all tags
                        raw_stats[code]["sum_score"] += score
                        raw_stats[code]["sum_full_score"] += full_score
                        logger.info(f"  -> Matched Code: {code} from '{ability_name}' in QID {norm_qid}. Added score {score}/{full_score}")
                    else:
                         logger.warning(f"  -> Code {code} from '{ability_name}' not in raw_stats keys")
                else:
                     logger.warning(f"  -> No code matched in ability name: {ability_name} for QID {norm_qid}")

    # Build Result Structure
    result_structure = {
        "学习理解能力": {},
        "应用实践能力": {},
        "迁移创新能力": {}
    }
    
    for code, meta in ability_map.items():
        data = raw_stats[code]
        
        # Weighted Calculation
        if data["sum_full_score"] > 0:
            avg = data["sum_score"] / data["sum_full_score"]
        else:
            avg = 0.0
        
        # Determine qualitative tag
        if avg >= 0.85: tag = "优秀"
        elif avg >= 0.70: tag = "良好"
        elif avg >= 0.60: tag = "一般"
        else: tag = "薄弱"
        
        # Add numeric percentage for frontend parsing (e.g. "优秀 (85.0%)")
        final_val_str = f"{tag} ({avg*100:.1f}%)"
        
        # If count is 0, it should be 0.
        if data["count"] == 0:
            final_val_str = "未涉及 (0%)"
            
        result_structure[meta["cat"]][meta["name"]] = {
            "掌握程度": final_val_str,
            "典型表现": "系统自动统计"
        }
        
    return result_structure

def correct_result(result: Dict[str, Any], stats: Dict[str, Any], q_map: Dict[str, Any], mode: str, student_topic_stats: List[Dict[str, Any]] = None, student_ability_stats: Dict[str, Any] = None) -> Dict[str, Any]:
    """
    Correct the LLM result with calculated statistics and question metadata.
    """
    # Pre-normalize q_map keys for faster lookup
    normalized_q_map = {normalize_id(k): v for k, v in q_map.items()}

    if mode == 'class':
        # ... (Existing class logic) ...
        # 1. Correct Difficulty Distribution
        # Ensure structure exists even if LLM missed it
        if "总体分析" not in result:
            result["总体分析"] = {}
        if "各等级得分率分析" not in result["总体分析"]:
            result["总体分析"]["各等级得分率分析"] = {}
            
        dist = result["总体分析"]["各等级得分率分析"]
        for level in ["L1", "L2", "L3", "L4", "L5"]:
            if level in stats:
                real_rate = stats[level]["avg_rate"]
                if level in dist:
                     dist[level]["平均得分率"] = f"{real_rate}%"
                else:
                    dist[level] = {"平均得分率": f"{real_rate}%", "表现评价": "该难度等级无题目" if stats[level]["count"] == 0 else "系统自动统计"}
        
        # 2. Correct Weakness Diagnosis
        if "能力短板诊断" in result and isinstance(result["能力短板诊断"], list):
            for item in result["能力短板诊断"]:
                qid_raw = str(item.get("题号", ""))
                matched_q = find_question_info(qid_raw, normalized_q_map)
                if matched_q:
                    real_level = matched_q.get("difficulty")
                    if real_level:
                        item["难度等级"] = real_level

    elif mode == 'student':
        # 1. Correct Knowledge Topic Mastery
        if student_topic_stats:
            # Force overwrite
            result["知识主题掌握情况"] = student_topic_stats
            
        # 2. Correct Ability Radar
        if student_ability_stats:
            # Force overwrite
            result["能力要素分析"] = student_ability_stats
            
        # 3. Correct Wrong Question Analysis (Difficulty & Topic consistency)
        if "错题分析" in result and isinstance(result["错题分析"], list):
            for item in result["错题分析"]:
                qid_raw = str(item.get("题号", ""))
                matched_q = find_question_info(qid_raw, normalized_q_map)
                
                if matched_q:
                    # Enforce difficulty level
                    if matched_q.get("difficulty"):
                        item["难度等级"] = matched_q.get("difficulty")
                    
                    # Enforce knowledge topic (if single)
                    if matched_q.get("knowledge_topic"):
                        item["知识主题"] = matched_q.get("knowledge_topic")
                    elif matched_q.get("framework_topic"):
                        item["知识主题"] = matched_q.get("framework_topic")
                        
                    # Enforce ability elements (if needed, though user didn't explicitly ask for this in wrong questions, but implied consistency)
                    if matched_q.get("ability_elements"):
                         # Join if list
                         elements = matched_q.get("ability_elements")
                         if isinstance(elements, list):
                             item["核心能力要素"] = elements


        # 4. Append Coverage Warning to Report
        if "markdown_report" in result and student_ability_stats:
            missing_abilities = []
            for cat, subs in student_ability_stats.items():
                for name, details in subs.items():
                    if "未涉及" in str(details.get("掌握程度", "")):
                        missing_abilities.append(name)
            
            if missing_abilities:
                note = f"\n\n### 能力要素覆盖说明\n\n试题中未包含考查**{'、'.join(missing_abilities)}**的题目。相关项在雷达图中显示为0，不代表该项能力薄弱。"
                result["markdown_report"] += note

    return result

def perform_score_analysis_sync(score_data: Union[List, Dict], question_data: List[Dict], mode: str, config: Dict[str, Any]) -> Dict[str, Any]:
    """
    Synchronous score analysis using LLMService.
    """
    # 1. Prepare Data & Stats (Calculate independently of LLM)
    q_map = {str(q['question_id']): q for q in question_data}
    logger.info(f"QMap Keys: {list(q_map.keys())}")
    
    stats = {}
    student_topic_stats = None
    student_ability_stats = None
    
    # Context variables for Class Mode
    groups = {}
    has_groups = False
    main_group_name = 'Default'
    comparative_context = ""

    try:
        if mode == 'class':
            # Check for groups (Multi-Class Analysis)
            # score_data is a list of records
            if isinstance(score_data, list):
                for item in score_data:
                    g_name = str(item.get('group_name', '')).strip()
                    if g_name and g_name.lower() != 'nan' and g_name.lower() != 'none':
                        has_groups = True
                        if g_name not in groups: groups[g_name] = []
                        groups[g_name].append(item)
                    else:
                        if 'Default' not in groups: groups['Default'] = []
                        groups['Default'].append(item)
            else:
                 # Should not happen for class mode based on validation, but safe fallback
                 groups['Default'] = [score_data] if isinstance(score_data, dict) else []

            # Determine Main Group for Standard Stats (Charts)
            # Priority: "Grade" > "Total" > "All" > First Group
            if has_groups:
                keys = list(groups.keys())
                main_group_name = keys[0]
                for k in keys:
                    if any(x in k for x in ['年级', 'Grade', 'Total', '全体', '汇总']):
                        main_group_name = k
                        break
            
            # Calculate stats for the main group (to be used in charts/standard fields)
            stats = calculate_class_stats(groups.get(main_group_name, []), q_map)
            
            # Prepare Comparative Context if multiple groups exist
            if has_groups and len(groups) > 1:
                comparative_context = "\n\n【多维度对比数据】\n"
                # Sort group names naturally (A1, A2, A10... instead of A1, A10, A2)
                for g_name in sorted(groups.keys(), key=natural_sort_key):
                    g_data = groups[g_name]
                    g_stats = calculate_class_stats(g_data, q_map)
                    # Summary string: L1: 80%, L2: 70%...
                    summary = ", ".join([f"{l}: {s['avg_rate']}%" for l, s in g_stats.items() if s['count']>0])
                    comparative_context += f"\n>>> 分组：{g_name}\n总体表现：{summary}\n"
                    
                    # Add detailed question scores
                    g_scores = []
                    # Sort by question ID for consistency
                    g_data_sorted = sorted(g_data, key=lambda x: str(x.get('question_id')))
                    for item in g_data_sorted:
                        qid = item.get('question_id')
                        rate = item.get('score_rate')
                        g_scores.append(f"{qid}:{rate}")
                    comparative_context += f"题目得分率：{', '.join(g_scores)}\n"

        else:
            # Student Mode
            student_topic_stats = calculate_student_topic_stats(score_data, q_map)
            student_ability_stats = calculate_student_ability_stats(score_data, q_map)
    except Exception as e:
        logger.error(f"Stats calculation failed: {e}")
        # If stats calc fails, we can't do much correction, but proceed to try LLM? 
        # Or just fail? Usually this shouldn't fail if data is valid.
    
    result = {}
    
    try:
        # Initialize LLM Service
        llm = LLMService(
            provider=config.get("provider", "deepseek"),
            api_key=config.get("api_key"),
            base_url=config.get("base_url"),
            model_name=config.get("model_name"),
            temperature=config.get("temperature", 0.3)
        )
        
        # Construct Input String
        q_context = json.dumps(question_data, ensure_ascii=False)
        
        if mode == 'class':
            # Multi-Group Analysis (Grade + Classes)
            # We will generate a separate report for EACH group
            final_results = {}
            
            # 1. Identify Groups
            # Ensure 'Grade' or main group is first
            group_names = sorted(groups.keys(), key=natural_sort_key)
            if main_group_name in group_names:
                group_names.remove(main_group_name)
                group_names.insert(0, main_group_name)
            
            for g_name in group_names:
                g_data = groups[g_name]
                g_stats = calculate_class_stats(g_data, q_map)
                stats_summary = json.dumps(g_stats, ensure_ascii=False)
                score_context = json.dumps(g_data, ensure_ascii=False)
                
                # Construct Prompt for Single Group Analysis (using Collective Prompt structure)
                # We treat each group as a "Collective Unit"
                input_data = f"题目难度数据：\n{q_context}\n\n当前分析对象（{g_name}）得分率数据：\n{score_context}\n\n(参考统计 - {g_name}：{stats_summary})\n\n请对该对象进行【集体学情分析】。请忽略提示词中关于'全年级'和'各班'对比的要求，专注于分析当前提供的这份数据。"
                
                try:
                    # Use 'multiple_analysis' mode but guide it to focus on single group
                    res = llm.analyze_question(input_data, mode="multiple_analysis")
                    
                    # Post-correction for this group
                    res = correct_result(res, g_stats, q_map, mode, None, None)
                    
                    final_results[g_name] = res
                except Exception as e:
                    logger.error(f"Analysis failed for group {g_name}: {e}")
                    final_results[g_name] = {
                        "总体分析": {"各等级得分率分析": {}, "综合评价": f"分析失败: {str(e)}"},
                        "能力短板诊断": [],
                        "markdown_report": f"# {g_name} 分析失败\n\n{str(e)}"
                    }
            
            # Return the map of results
            return final_results

        else:
            # Student Mode (Single Analysis)
            score_context = json.dumps(score_data, ensure_ascii=False)
            input_data = f"题目难度数据：\n{q_context}\n\n学生个人数据：\n{score_context}"
            
            # Map mode to LLMService mode
            llm_mode = "single_analysis"
            
            # Call LLM
            result = llm.analyze_question(input_data, mode=llm_mode)
            
            # Post-correction
            result = correct_result(
                result, 
                stats, 
                q_map, 
                mode, 
                student_topic_stats,
                student_ability_stats
            )
            return result
        
    except Exception as e:
        logger.error(f"Score analysis LLM failed: {e}")
        # Construct Fallback Result
        if mode == 'class':
            result = {
                "总体分析": {"各等级得分率分析": {}, "综合评价": f"AI分析服务暂时不可用 ({str(e)})，仅显示统计数据。"},
                "薄弱点智能诊断与训练建议": []
            }
        else:
            result = {
                "知识主题掌握情况": [],
                "能力要素分析": {},
                "错题分析": [],
                "个性化提升建议": f"AI分析服务暂时不可用 ({str(e)})，仅显示统计数据。"
            }

    # 3. Post-correction (Always run this to ensure stats are applied)
    try:
        result = correct_result(
            result, 
            stats, 
            q_map, 
            mode, 
            student_topic_stats if mode == 'student' else None,
            student_ability_stats if mode == 'student' else None
        )
    except Exception as e:
        logger.error(f"Result correction failed: {e}")
        
    return result

def natural_sort_key(s):
    """
    Natural sort key for strings containing numbers (e.g., "A1", "A2", "A10").
    """
    return [int(text) if text.isdigit() else text.lower()
            for text in re.split('([0-9]+)', str(s))]

@shared_task(bind=True)
def analyze_score_task(self, score_data: Union[List, Dict], question_data: List[Dict], mode: str, config: Dict[str, Any]):
    """
    Celery task for score analysis.
    """
    return perform_score_analysis_sync(score_data, question_data, mode, config)
