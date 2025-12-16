from typing import Dict, Any
import json
import logging
import datetime
import re
from openai import OpenAI

logger = logging.getLogger(__name__)

import os

class LLMService:
    def __init__(self, provider: str, api_key: str, base_url: str = None, model_name: str = None, temperature: float = 0.3, timeout: float = 600.0):
        self.provider = provider
        self.api_key = api_key
        self.base_url = base_url
        self.model_name = model_name
        self.temperature = temperature
        self.timeout = timeout
        self.client = self._get_client()

    def _get_client(self) -> OpenAI:
        # Default Base URLs
        base_urls = {
            "deepseek": "https://api.deepseek.com/v1",
            "doubao": "https://ark.cn-beijing.volces.com/api/v3",
            "qwen": "https://dashscope.aliyuncs.com/compatible-mode/v1",
            "kimi": "https://api.moonshot.cn/v1",
            "zhipu": "https://open.bigmodel.cn/api/paas/v4",
        }
        
        # Use provided base_url if available, otherwise fallback to map
        final_base_url = self.base_url if self.base_url else base_urls.get(self.provider)
        
        if not final_base_url:
             # Default or fallback
             final_base_url = "https://api.deepseek.com/v1"

        # Sanitize Base URL: Remove /chat/completions if present
        # This allows users to paste the full endpoint URL without breaking the OpenAI client
        if final_base_url.endswith("/chat/completions"):
            final_base_url = final_base_url.replace("/chat/completions", "")
        
        # Configure retries
        # User requirement: 3 retries for Doubao (and likely others)
        max_retries = 3

        return OpenAI(
            api_key=self.api_key, 
            base_url=final_base_url, 
            timeout=self.timeout,
            max_retries=max_retries
        )

    def _get_model_name(self) -> str:
        # Use provided model_name if available
        if self.model_name:
            return self.model_name

        # Map provider to specific default model names
        models = {
            "deepseek": "deepseek-chat",
            "doubao": "ep-20251214202700-4jpcm", # Doubao-Seed-1.6-lite
            "qwen": "qwen-plus", # Qwen Plus Latest
            "kimi": "kimi-k2-0905-preview",
            "zhipu": "GLM-4.5-X",
        }
        return models.get(self.provider, "deepseek-chat")

    def _clean_json_response(self, text: str) -> str:
        """
        Clean the response text to extract valid JSON.
        Handles Markdown code blocks, common formatting issues, and control characters.
        """
        text = text.strip()
        
        # 1. Try to extract from Markdown code blocks
        code_block_pattern = r"```(?:json)?\s*(\{.*?\})\s*```"
        match = re.search(code_block_pattern, text, re.DOTALL)
        if match:
            text = match.group(1)
        else:
            # 2. If no code block, try to find the outermost braces
            start = text.find('{')
            end = text.rfind('}')
            if start != -1 and end != -1:
                text = text[start:end+1]
        
        # 3. Handle Invalid Control Characters (e.g. newlines in strings)
        # Replace actual newlines within JSON string values with \n
        # This is a simple heuristic; for complex cases, a proper parser is needed.
        # But here we just want to fix common LLM formatting errors.
        
        # Remove control characters that are invalid in JSON (0x00-0x1F), except for common whitespace
        # But strict JSON requires newlines to be escaped as \n. 
        # LLMs often output literal newlines inside strings.
        
        # Use repr() to escape control characters if needed, or regex replacement
        # A safer bet for now is to let strict=False in json.loads handle some, but standard json lib is strict.
        
        # Advanced cleaning: Escape unescaped newlines inside string values?
        # That is hard to do with regex reliably. 
        
        # Simple fix for "Invalid control character":
        # Often it's a literal newline inside a string.
        # We can try to sanitize using json5 or similar if available, but here we only have stdlib.
        
        # Strategy: Replace literal newlines with \n if they seem to be inside a JSON string value?
        # Too risky.
        
        # Alternative: Remove 0x00-0x1F characters except \n, \r, \t
        # And ensure newlines are properly escaped?
        
        # Let's try to just return the text and handle strictness in json.loads if possible (Python's json doesn't allow strict=False for control chars easily).
        # Actually, Python's json.loads defaults to strict=True.
        
        # Let's try to remove invalid control characters.
        # "Invalid control character at: line 34 column 86" usually means a literal tab or newline in a string.
        
        def escape_control_chars(match):
            return json.dumps(match.group(0))[1:-1]
            
        # This is complex to regex replace ONLY inside strings.
        
        # For now, let's try a simpler approach: allow control characters by using a custom decoder or pre-processing?
        # Actually, standard JSON spec forbids unescaped control characters.
        # We can try to "repair" common ones.
        
        # Fix 1: Escape newlines that are NOT followed by a plausible JSON structure key/end?
        # No, that's brittle.
        
        # Fix 2: Just use `strict=False` in json.loads inside the calling function?
        # Python's json.loads(..., strict=False) allows control characters in strings!
        
        return text

    def _construct_markdown_from_data(self, data: Dict[str, Any]) -> str:
        """
        Construct a friendly Markdown report from the JSON data structure.
        Used when the LLM fails to return the 'markdown_report' field.
        """
        md = "# 智能分析报告 (自动生成)\n\n"
        
        # 1. Basic Info / Overview
        if "学生基本信息" in data:
            info = data["学生基本信息"]
            md += "## 总体评估\n\n"
            if isinstance(info, dict):
                for k, v in info.items():
                    md += f"- **{k}**: {v}\n"
            md += "\n"
        elif "班级整体概况" in data:
             info = data["班级整体概况"]
             md += "## 班级整体概况\n\n"
             if isinstance(info, dict):
                for k, v in info.items():
                    md += f"- **{k}**: {v}\n"
             md += "\n"
        elif "总体分析" in data:
             info = data["总体分析"]
             md += "## 总体分析\n\n"
             if isinstance(info, dict):
                for k, v in info.items():
                    if k == "各等级得分率分析" and isinstance(v, dict):
                         md += f"- **{k}**:\n"
                         for lvl, det in v.items():
                             if isinstance(det, dict):
                                 md += f"  - {lvl}: {det.get('平均得分率', '')} ({det.get('表现评价', '')})\n"
                             else:
                                 md += f"  - {lvl}: {det}\n"
                    else:
                        md += f"- **{k}**: {v}\n"
             md += "\n"

        # 2. Comprehensive Rating (Common)
        if "comprehensive_rating" in data:
            cr = data["comprehensive_rating"]
            md += "## 综合评级\n\n"
            if "final_level" in cr:
                md += f"- **最终评级**: {cr['final_level']}\n"
            if "explanation" in cr:
                md += f"- **评级说明**: {cr['explanation']}\n"
            md += "\n"

        # 3. Ability Analysis
        if "能力要素分析" in data:
            md += "## 能力画像\n\n"
            abilities = data["能力要素分析"]
            if isinstance(abilities, dict):
                # Try to render as table if nested
                md += "| 能力维度 | 二级指标 | 掌握程度 | 典型表现 |\n"
                md += "| --- | --- | --- | --- |\n"
                for dim, sub_items in abilities.items():
                    if isinstance(sub_items, dict):
                        for sub_k, sub_v in sub_items.items():
                             # Strict requirement: Use "未涉及" for unassessed items, avoid vague terms like "-"
                             level = sub_v.get("掌握程度", "未涉及") if isinstance(sub_v, dict) else "未涉及"
                             desc = sub_v.get("典型表现", "未涉及") if isinstance(sub_v, dict) else str(sub_v)
                             if not level or level == "-": level = "未涉及"
                             if not desc or desc == "-": desc = "未涉及"
                             md += f"| {dim} | {sub_k} | {level} | {desc} |\n"
                    else:
                         md += f"| {dim} | - | - | {sub_items} |\n"
            md += "\n"
        
        if "能力短板诊断" in data:
            md += "## 能力短板诊断\n\n"
            shortcomings = data["能力短板诊断"]
            if isinstance(shortcomings, list):
                md += "| 题号 | 核心能力 | 得分率 | 问题诊断 | 教学建议 |\n"
                md += "| --- | --- | --- | --- | --- |\n"
                for item in shortcomings:
                    if isinstance(item, dict):
                         md += f"| {item.get('题号', '-')} | {', '.join(item.get('核心能力要素', [])) if isinstance(item.get('核心能力要素'), list) else item.get('核心能力要素', '-')} | {item.get('得分率', '-')} | {item.get('问题诊断', '-')} | {item.get('教学建议', '-')} |\n"
            md += "\n"

        # 4. Knowledge Mastery
        if "知识主题掌握情况" in data:
            md += "## 知识掌握情况\n\n"
            topics = data["知识主题掌握情况"]
            if isinstance(topics, list):
                md += "| 知识主题 | 掌握程度 | 评价 | 主要问题 |\n"
                md += "| --- | --- | --- | --- |\n"
                for t in topics:
                    if isinstance(t, dict):
                        level = t.get('掌握程度', '未涉及')
                        if not level or level == "-": level = "未涉及"
                        md += f"| {t.get('知识主题', '未涉及')} | {level} | {t.get('掌握评价', '未涉及')} | {t.get('主要问题', '未涉及')} |\n"
            md += "\n"
        elif "知识主题分析" in data:
             md += "## 知识主题分析\n\n"
             topics = data["知识主题分析"]
             if isinstance(topics, list):
                 md += "| 框架主题 | 考查内容 | 平均得分率 | 掌握评价 | 教学重点 |\n"
                 md += "| --- | --- | --- | --- | --- |\n"
                 for t in topics:
                     if isinstance(t, dict):
                         md += f"| {t.get('框架知识主题', '-')} | {t.get('考查内容', '-')} | {t.get('平均得分率', '-')} | {t.get('掌握程度评价', '-')} | {t.get('教学重点', '-')} |\n"
             md += "\n"
        elif "薄弱知识点分析" in data: # Class mode often uses this
             md += "## 薄弱知识点分析\n\n"
             weaknesses = data["薄弱知识点分析"]
             if isinstance(weaknesses, list):
                 for w in weaknesses:
                     if isinstance(w, dict):
                         md += f"### {w.get('知识点', '知识点')}\n"
                         md += f"- **错误率**: {w.get('错误率', 'N/A')}\n"
                         md += f"- **主要问题**: {w.get('主要问题', 'N/A')}\n"
                         md += f"- **教学建议**: {w.get('教学建议', 'N/A')}\n\n"

        # 5. Error Analysis
        if "错题分析" in data:
            md += "## 错题深度分析\n\n"
            errors = data["错题分析"]
            if isinstance(errors, list):
                for err in errors:
                    if isinstance(err, dict):
                        md += f"### {err.get('题号', '题目')}\n"
                        md += f"- **错误类型**: {err.get('错误类型', 'N/A')}\n"
                        md += f"- **根本原因**: {err.get('根本原因', 'N/A')}\n"
                        md += f"- **纠正建议**: {err.get('纠正建议', 'N/A')}\n\n"
        elif "典型题目深度分析" in data:
            md += "## 典型题目深度分析\n\n"
            typical_errors = data["典型题目深度分析"]
            if isinstance(typical_errors, list):
                for err in typical_errors:
                    if isinstance(err, dict):
                         md += f"### {err.get('题号', '题目')}\n"
                         md += f"- **典型错误分析**: {err.get('典型错误分析', 'N/A')}\n"
                         md += f"- **思维障碍点**: {err.get('思维障碍点', 'N/A')}\n"
                         md += f"- **教学突破策略**: {err.get('教学突破策略', 'N/A')}\n\n"

        # 6. Suggestions
        if "个性化学习计划" in data:
            md += "## 个性化学习建议\n\n"
            plan = data["个性化学习计划"]
            if isinstance(plan, dict):
                for k, v in plan.items():
                    if isinstance(v, list):
                         md += f"### {k}\n"
                         for item in v:
                             if isinstance(item, dict):
                                 md += f"- **{item.get('能力点', '')}**: {item.get('提升策略', '')}\n"
                             else:
                                 md += f"- {item}\n"
                    else:
                        md += f"### {k}\n{v}\n\n"
        
        if "教学策略建议" in data: # Class mode
             md += "## 教学策略建议\n\n"
             teaching = data["教学策略建议"]
             if isinstance(teaching, dict):
                 for k, v in teaching.items():
                     md += f"### {k}\n{v}\n\n"
        elif "综合教学建议" in data:
             md += "## 综合教学建议\n\n"
             teaching = data["综合教学建议"]
             if isinstance(teaching, dict):
                 for k, v in teaching.items():
                     md += f"### {k}\n{v}\n\n"

        # Fallback if almost empty
        if len(md) < 50:
             md += "\n(自动转换失败，显示原始数据)\n\n```json\n" + json.dumps(data, ensure_ascii=False, indent=2) + "\n```"
             
        return md

    def analyze_question(self, question_content: str, mode: str = "question_analysis") -> Dict[str, Any]:
        prompt = self._build_prompt(question_content, mode)
        
        try:
            # Prepare request arguments
            create_kwargs = {
                "model": self._get_model_name(),
                "messages": [
                    {"role": "system", "content": "你是一位精通高中化学的教研专家。"},
                    {"role": "user", "content": prompt}
                ],
                "temperature": self.temperature,
                "max_tokens": 4000, 
                "timeout": self.timeout
            }
            
            # Conditionally add response_format
            # Doubao (Volcengine) and Kimi may not support 'json_object' mode in current compatible API versions
            if self.provider not in ["doubao", "kimi"]:
                create_kwargs["response_format"] = { "type": "json_object" }

            # Explicitly set max_tokens to prevent truncation
            # Some models default to a low number if not specified
            response = self.client.chat.completions.create(**create_kwargs)
            
            result_text = response.choices[0].message.content
            
            if not result_text:
                raise ValueError("LLM returned empty response")

            # Log raw response for debugging if needed
            # logger.debug(f"Raw LLM Response: {result_text}")
            
            cleaned_text = self._clean_json_response(result_text)
            
            try:
                # Use strict=False to allow control characters (like newlines) inside strings
                data = json.loads(cleaned_text, strict=False)
            except json.JSONDecodeError as e:
                logger.error(f"JSON Parse Error: {e}. Raw text: {result_text[:500]}...")
                # If "Unterminated string", it's likely truncation despite max_tokens
                snippet = result_text[:100] if result_text else "EMPTY"
                raise ValueError(f"Failed to parse JSON response: {str(e)}. Raw snippet: {snippet}...")
            
            # Validation
            if mode == "question_analysis":
                required_fields = ["markdown_report", "comprehensive_rating"]
                for field in required_fields:
                    if field not in data:
                        raise ValueError(f"Missing required field: {field}")
                
                # Deep validation
                if not isinstance(data["markdown_report"], str) or not data["markdown_report"].strip():
                    # Try to construct report from other fields if available
                    if "analysis" in data and isinstance(data["analysis"], str):
                        data["markdown_report"] = data["analysis"]
                    elif "teaching_guide" in data:
                        # Fallback: create a simple report
                        data["markdown_report"] = f"**分析结果**\n\n(大模型未返回标准报告格式，以下是原始数据)\n\n```json\n{json.dumps(data, ensure_ascii=False, indent=2)}\n```"
                    else:
                        # Advanced Fallback: Construct Markdown from Data
                        data["markdown_report"] = self._construct_markdown_from_data(data)
                
                # Check if markdown_report is lazily just a JSON code block (common with Zhipu/GLM)
                # If the report is > 50% similar to the JSON dump or looks like a code block, regenerate it.
                report_strip = data["markdown_report"].strip()
                
                is_json_code_block = (report_strip.startswith("```json") or report_strip.startswith("```")) and report_strip.endswith("```")
                is_raw_json = report_strip.startswith("{") and report_strip.endswith("}")
                
                if is_json_code_block or is_raw_json:
                     # It's likely just a code block or raw JSON. Check if it contains mostly JSON.
                     # We'll just assume if it's a code block/raw JSON, we prefer our friendly format.
                     logger.info("Detected JSON content in markdown_report. Replacing with friendly format.")
                     # If it's a code block, strip the fences to get the JSON content (optional verification)
                     # But we already have the 'data' dict, so we can just reconstruct from 'data'.
                     # However, 'data' might be the *entire* response. 
                     # The 'markdown_report' field *itself* might be a JSON string of the report or the whole data.
                     # We will just ignore what's in 'markdown_report' and rebuild from the structured data we parsed from the main response.
                     data["markdown_report"] = self._construct_markdown_from_data(data)

                if not isinstance(data.get("comprehensive_rating"), dict):
                    raise ValueError("Field 'comprehensive_rating' must be an object")

                # Apply strict grading logic validation
                data = self._validate_and_correct_grading(data)

                # Backwards compatibility for frontend
                if "final_level" not in data and "comprehensive_rating" in data:
                    data["final_level"] = data["comprehensive_rating"].get("final_level")
            elif mode == "variant_generation":
                # Validation for variant generation
                required_fields = ["question", "options", "answer", "explanation"]
                for field in required_fields:
                    if field not in data:
                        raise ValueError(f"Missing required field for variant: {field}")
            else:
                 # Basic validation for analysis modes
                 if not isinstance(data, dict):
                     raise ValueError("Response must be a JSON object")
            
            return data
        except Exception as e:
            logger.error(f"LLM Call Error ({self.provider}): {e}")
            
            error_msg = str(e)
            # Add specific hints for common errors
            if self.provider == "doubao" and "InternalServiceError" in error_msg:
                error_msg += "\n\n(提示：对于豆包/火山引擎，'Model Name' 必须填写您在控制台创建的 Endpoint ID，通常以 'ep-' 开头，且必须与您的 API Key 对应。请检查 Endpoint ID 是否正确且状态为'运行中'。)"
            
            # Return a mock error structure or re-raise
            return {
                "error": error_msg,
                "level": "Error",
                "final_level": "Error",
                "scores": [0, 0, 0],
                "markdown_report": f"**分析失败**\n\n发生错误：{error_msg}\n\n请检查 API Key 和配置是否正确，或稍后重试。"
            }

    def generate_variant_question(self, original_question: str, topic: str, abilities: str) -> Dict[str, Any]:
        """
        Generate a variant question based on the original one.
        """
        prompt = f"""
你是一位高中化学命题专家。请根据以下题目，生成一道“变式训练题”。

**原题内容**：
{original_question}

**考查知识点**：{topic}
**能力要求**：{abilities}

**命题要求**：
1. **同质性**：新题目必须考查相同的知识点和能力要素，难度与原题相当。
2. **差异性**：请更换具体的化学物质、反应场景或数据，不要照抄原题。
3. **规范性**：题目表述需符合高中化学学术规范，为单选题。
4. **完整性**：必须包含题干、四个选项、正确答案和解析。

**返回格式**：
请仅返回一个标准的 JSON 对象，格式如下：
{{
    "question": "题干内容...",
    "options": ["A. 选项内容", "B. 选项内容", "C. 选项内容", "D. 选项内容"],
    "answer": "A",
    "explanation": "解析内容..."
}}
"""
        return self.analyze_question(prompt, mode="variant_generation")


    def _calculate_expected_level(self, score: float) -> str:
        """
        Calculate expected level based on strict interval rules:
        L1: <= 1.5
        L2: 1.5 < score <= 2.5
        L3: 2.5 < score <= 3.5
        L4: 3.5 < score <= 4.5
        L5: > 4.5
        """
        if score <= 1.5:
            return "L1"
        elif score <= 2.5:
            return "L2"
        elif score <= 3.5:
            return "L3"
        elif score <= 4.5:
            return "L4"
        else:
            return "L5"

    def _validate_and_correct_grading(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validate grading logic and apply corrections or logging based on rules.
        """
        rating = data.get("comprehensive_rating", {})
        if not rating:
            return data

        try:
            average_score = float(rating.get("average_score", 0))
            final_level = rating.get("final_level", "").upper()
            downgrade_reason = rating.get("downgrade_reason", "")
            
            expected_level = self._calculate_expected_level(average_score)
            
            # Check for consistency
            if final_level != expected_level:
                # Check if it is a downgrade (e.g. expected L2, got L1)
                try:
                    # Extract number from Lx
                    current_level_num = int(final_level.replace("L", "")) if final_level.startswith("L") and final_level[1:].isdigit() else 0
                    expected_level_num = int(expected_level.replace("L", ""))
                    
                    if current_level_num > 0 and current_level_num < expected_level_num:
                        # It is a downgrade
                        
                        # CASE A: Standard Downgrade (Reason starts with "因为")
                        if downgrade_reason and downgrade_reason.strip().startswith("因为"):
                            logger.info(f"AUDIT: Standard Downgrade accepted. Score: {average_score}, Expected: {expected_level}, Actual: {final_level}. Reason: {downgrade_reason}")
                            # Ensure '注：' prefix is present if not already
                            if not downgrade_reason.strip().startswith("注："):
                                rating["downgrade_reason"] = f"注：{downgrade_reason}"
                            
                            # Ensure reason is in markdown report
                            if "markdown_report" in data and rating["downgrade_reason"] not in data["markdown_report"]:
                                data["markdown_report"] += f"\n\n**降级说明**\n\n{rating['downgrade_reason']}"

                        # CASE B: Non-Standard/Special Downgrade (Reason does NOT start with "因为")
                        else:
                            # Accept the downgrade (Interrupt Standard Mapping)
                            logger.info(f"AUDIT: Non-Standard Downgrade accepted. Score: {average_score}, Expected: {expected_level}, Actual: {final_level}. Reason: {downgrade_reason}")
                            
                            # 1. Update Metadata with Timestamp and Context
                            if "meta" not in data:
                                data["meta"] = {}
                            
                            data["meta"]["downgrade_event"] = {
                                "original_level": expected_level,
                                "final_level": final_level,
                                "type": "non_standard",
                                "timestamp": datetime.datetime.now().isoformat(),
                                "reason": downgrade_reason
                            }
                            
                            # 2. Add Visual Comparison to Report
                            comparison_text = f"\n\n**难度等级调整说明**\n\n> ⚠️ **特殊降级处理**\n> \n> **原始测算等级**：{expected_level}\n> **最终输出等级**：{final_level} ▼\n> **调整依据**：{downgrade_reason if downgrade_reason else '大模型依据上下文判定（无特定标准理由）'}"
                            
                            if "markdown_report" in data:
                                data["markdown_report"] += comparison_text
                                
                            # 3. Mark for Frontend Icon
                            data["is_downgraded"] = True

                    else:
                        # Upgrade or mismatch (e.g. expected L2, got L3) - Not allowed by strict rules
                        logger.warning(f"AUDIT: Level mismatch corrected. Score: {average_score}, Expected: {expected_level}, Actual: {final_level}.")
                        rating["final_level"] = expected_level
                        rating["downgrade_reason"] = ""
                        
                        # Append correction note to markdown
                        if "markdown_report" in data:
                            data["markdown_report"] += f"\n\n**系统修正注：** 原定级 {final_level} 不符合严格区间规则，已根据平均分 {average_score} 修正为 {expected_level}。"
                except ValueError:
                     # Level format error, force expected
                     rating["final_level"] = expected_level
            
            # Ensure final_level format "Lx"
            if not rating["final_level"].startswith("L") or len(rating["final_level"]) != 2:
                 rating["final_level"] = expected_level

            data["comprehensive_rating"] = rating
            return data
            
        except Exception as e:
            logger.error(f"Error in grading validation: {e}")
            return data

    def _build_prompt(self, question: str, mode: str = "question_analysis") -> str:
        # In a real app, we might cache this content
        try:
            # Use absolute path to ensure file is found regardless of CWD
            project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            
            if mode == "multiple_analysis":
                file_name = "mutiple analysis API.md"
            elif mode == "single_analysis":
                file_name = "single analysis API.md"
            else:
                file_name = "for API.md"
                
            file_path = os.path.join(project_root, file_name)
            
            with open(file_path, "r", encoding="utf-8") as f:
                standards = f.read()
        except FileNotFoundError:
            logger.error(f"Standard file not found at: {file_path}")
            standards = "Standard file not found."

        if mode == "question_analysis":
            return f"""
            {standards}

            请根据上述标准（特别是第四步的输出格式），对以下化学题目进行分析：
            
            **题目内容：**
            {question}

            **注意：** 
            1. 必须返回合法的JSON格式。
            2. 确保包含 "markdown_report" 字段，其中包含完整的Markdown分析报告。
            3. 确保 "comprehensive_rating" 中包含 "final_level"。
            """
        elif mode == "variant_generation":
            # For variant generation, the input 'question' is already the full prompt constructed by the caller
            return question
        else:
            # For other analysis modes, 'question' parameter actually contains the data JSON string
            return f"""
            {standards}
            
            **输入数据：**
            {question}
            
            **注意：**
            1. 必须严格按照上述【输出要求】返回JSON格式。
            2. 确保包含所有必需字段。
            """
