import re
from typing import List, Dict, Any

class QuestionSplitter:
    @staticmethod
    def split_text(text: str, mode: str = "sub_question") -> List[Dict[str, Any]]:
        """
        Splits text into question units.
        Handles both Selection questions (kept whole) and Big questions.
        Enforces sequential numbering (1->2->3) to avoid false splits.
        Enforces consistent numbering style (e.g., if starts with "1.", ignore "一、"; if starts with "一、", ignore "1.").
        """
        # 1. Split into top-level questions
        # Pattern: Newline (or start), optional whitespace, Number (Arabic or Chinese), Separator
        # We capture the number group.
        # \d+ for Arabic, [一二...] for Chinese
        # Added capture group for separator: ([\.|、|．])
        pattern_main = re.compile(r'(?:^|\n)\s*((\d+)|([一二三四五六七八九十]+))\s*([\.|、|．])\s*')
        
        # re.split returns: [prefix, num_group, num_subgroup1, num_subgroup2, separator, content, ...]
        # We use finditer manually.
        
        matches = list(pattern_main.finditer(text))
        
        if not matches:
             return [{
                "id": "1",
                "content": text.strip(),
                "preview": text.strip()[:50] + "...",
                "type": "unknown"
            }]

        questions = []
        expected_id = 1
        
        # We need to construct segments based on valid matches
        
        # 1. Parse all matches to extract number and style
        parsed_items = []
        for m in matches:
            num_str = m.group(1)
            is_chinese = bool(m.group(3)) # If group 3 is present, it's Chinese
            separator = m.group(4)
            val = QuestionSplitter._parse_number_str(num_str)
            
            # Style definition: (is_chinese, separator)
            # Note: We group '.' and '．' as compatible styles if needed, but for grouping let's keep strict first
            # Actually, to avoid splitting '1.' and '2．' into different groups, let's normalize separator
            norm_sep = separator
            if separator in ['.', '．']:
                norm_sep = '.'
            
            style = (is_chinese, norm_sep)
            parsed_items.append({
                'val': val,
                'style': style,
                'match': m,
                'raw_sep': separator
            })
            
        if not parsed_items:
             return [{
                "id": "1",
                "content": text.strip(),
                "preview": text.strip()[:50] + "...",
                "type": "unknown"
            }]

        # 2. Group by style and find the dominant style
        from collections import defaultdict
        style_groups = defaultdict(list)
        for item in parsed_items:
            style_groups[item['style']].append(item)
            
        # Pick the style with the most matches
        # Tie-breaker: prefer Arabic (is_chinese=False)
        best_style = max(style_groups.keys(), key=lambda s: (len(style_groups[s]), not s[0]))
        candidates = style_groups[best_style]
        
        # 3. Find Longest Increasing Subsequence (LIS) of question numbers
        # This handles gaps (1, 3, 5) and random noise (2023, 1, 2)
        # We want strictly increasing sequence
        
        n = len(candidates)
        # dp[i] stores the length of LIS ending at index i
        dp = [1] * n
        # parent[i] stores the index of the previous element in LIS
        parent = [-1] * n
        
        for i in range(n):
            for j in range(i):
                if candidates[i]['val'] > candidates[j]['val']:
                    if dp[j] + 1 > dp[i]:
                        dp[i] = dp[j] + 1
                        parent[i] = j
                        
        # Find the end index of the LIS
        max_len = 0
        end_index = -1
        for i in range(n):
            if dp[i] > max_len:
                max_len = dp[i]
                end_index = i
            elif dp[i] == max_len:
                # If equal length, prefer the one with smaller start value? 
                # Or simply the one that appears earlier?
                # Current logic keeps the first one found (since strict >)
                # But wait, i goes 0..n. So we encounter later ones later.
                # If we want to prioritize earlier sequence, keep existing.
                pass
                
        # Reconstruct the path
        lis_indices = []
        curr = end_index
        while curr != -1:
            lis_indices.append(curr)
            curr = parent[curr]
        lis_indices.reverse()
        
        valid_candidates = [candidates[i] for i in lis_indices]
        
        # 4. Construct segments
        valid_segments = []
        
        for i, item in enumerate(valid_candidates):
            current_match = item['match']
            current_id = item['val']
            
            # Content starts after this match
            content_start = current_match.end()
            
            # Content ends at the start of the next valid match
            if i < len(valid_candidates) - 1:
                next_match = valid_candidates[i+1]['match']
                content_end = next_match.start()
            else:
                # Last question goes to end of text
                content_end = len(text)
                
            q_content = text[content_start:content_end].strip()
            
            # If this is the first question, we might have preamble text before it
            # But the requirement is to split questions. Preamble is usually ignored or attached to Q1?
            # Existing logic attached previous content to previous question.
            # Here, content is strictly AFTER the match.
            # What about text BEFORE the first match?
            # If i == 0, text[:current_match.start()] is preamble.
            # We can prepend it to Q1 if we want, or discard.
            # Usually preamble is instructions "Answer the following...". Better discard or keep separate?
            # To be safe (avoid data loss), let's prepend preamble to Q1
            if i == 0:
                preamble = text[:current_match.start()].strip()
                if preamble:
                    q_content = preamble + "\n\n" + q_content
            
            valid_segments.append({
                "id": str(current_id),
                "content": q_content
            })

        if not valid_segments:
             # Fallback
             return [{
                "id": "1",
                "content": text.strip(),
                "preview": text.strip()[:50] + "...",
                "type": "unknown"
            }]

        # Process segments
        questions = []
        for seg in valid_segments:
            q_id = seg['id']
            q_content = seg['content']
            
            # 2. Determine type and process
            if QuestionSplitter._is_selection_question(q_content):
                questions.append({
                    "id": q_id,
                    "content": f"{q_id}. {q_content}",
                    "preview": f"{q_id}. {q_content}"[:50].replace('\n', ' ') + "...",
                    "type": "selection"
                })
            else:
                # Big question processing
                if mode == "whole":
                    questions.append({
                        "id": q_id,
                        "content": f"{q_id}. {q_content}",
                        "preview": f"{q_id}. {q_content}"[:50].replace('\n', ' ') + "...",
                        "type": "big_question_whole"
                    })
                else:
                    # Default: sub-question splitting
                    sub_questions = QuestionSplitter._process_big_question(q_id, q_content)
                    questions.extend(sub_questions)
            
        return questions

    @staticmethod
    def _parse_number_str(s: str) -> int:
        if s.isdigit():
            return int(s)
        
        chinese_map = {
            '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
            '六': 6, '七': 7, '八': 8, '九': 9, '十': 10
        }
        return chinese_map.get(s, -1) # Return -1 if unknown

    @staticmethod
    def _is_selection_question(content: str) -> bool:
        # Check for A. B. C. D. or A、B、C、D pattern
        # Simple heuristic: matches A. and B. 
        # But be careful of false positives in text.
        # Usually options are on new lines or spaced out.
        
        # Look for "A." or "A、" followed by content
        # STRICTER: Must be A. to avoid matching I. V. (Roman numerals)
        has_A = re.search(r'(?:^|\s)A[\.|、]', content)
        return bool(has_A)

    @staticmethod
    def _process_big_question(q_id: str, content: str) -> List[Dict[str, Any]]:
        # Pattern for sub-questions: (1), (2), ①, ②, 1), 2)
        
        # 1. Mask Roman numerals to prevent them from being treated as splitters
        # (Although current regex is \d+, this is a safeguard and per-requirements)
        masked_content, placeholders = QuestionSplitter._mask_roman_numerals(content)
        
        # Regex for sub-headers (Level 2):
        # (1) or （1）:  [\(（]\d+[\)）]
        # 1): \d+\)
        # We explicitly exclude Circle numbers ① here because they are Level 3.
        
        sub_pattern = re.compile(r'(?:^|\s|\n)(?:(\((\d+)\))|（(\d+)）|(\d+)\))')
        
        matches = list(sub_pattern.finditer(masked_content))
        
        if not matches:
             # If no sub-questions found, return as single question
            final_content = QuestionSplitter._restore_roman_numerals(content, placeholders)
            return [{
                "id": q_id,
                "content": f"{q_id}. {final_content}",
                "preview": f"{q_id}. {final_content}"[:50].replace('\n', ' ') + "...",
                "type": "big_question_whole"
            }]
            
        valid_segments = []
        current_valid_match = None
        current_valid_id = None
        expected_id = 1
        
        # Style tracking
        # Styles: 'parens' ((1),（1）), 'half_paren' (1))
        current_style = None
        
        # Also need to restore main stem
        main_stem_end = 0
        
        for m in matches:
            # Parse value
            # Groups: 1=(n), 2=n, 3=n (fullwidth), 4=n (halfbracket)
            val = -1
            match_style = None
            
            if m.group(2): 
                val = int(m.group(2))
                match_style = 'parens'
            elif m.group(3): 
                val = int(m.group(3))
                match_style = 'parens'
            elif m.group(4): 
                val = int(m.group(4))
                match_style = 'half_paren'
            
            if val == expected_id:
                # Check style consistency
                if expected_id == 1:
                    current_style = match_style
                else:
                    if match_style != current_style:
                        # Style mismatch (e.g. started with (1), now found 1))
                        # Treat as content
                        continue
            
                # Found expected sub-question
                if current_valid_match:
                    content_start = current_valid_match.end()
                    content_end = m.start()
                    sub_c = masked_content[content_start:content_end].strip()
                    sub_c = QuestionSplitter._restore_roman_numerals(sub_c, placeholders)
                    
                    valid_segments.append({
                        "sub_idx": current_valid_id,
                        "marker": current_valid_match.group(0).strip(),
                        "content": sub_c
                    })
                else:
                    # This is the FIRST match (val=1)
                    main_stem_end = m.start()
                
                current_valid_match = m
                current_valid_id = val
                expected_id += 1
            else:
                # Not expected sequence, ignore (treat as content)
                continue
                
        # Close last one
        if current_valid_match:
            content_start = current_valid_match.end()
            sub_c = masked_content[content_start:].strip()
            sub_c = QuestionSplitter._restore_roman_numerals(sub_c, placeholders)
            
            valid_segments.append({
                "sub_idx": current_valid_id,
                "marker": current_valid_match.group(0).strip(),
                "content": sub_c
            })
            
        if not valid_segments:
             # Fallback
            final_content = QuestionSplitter._restore_roman_numerals(content, placeholders)
            return [{
                "id": q_id,
                "content": f"{q_id}. {final_content}",
                "preview": f"{q_id}. {final_content}"[:50].replace('\n', ' ') + "...",
                "type": "big_question_whole"
            }]

        # Main Stem
        main_stem = masked_content[:main_stem_end].strip()
        main_stem = QuestionSplitter._restore_roman_numerals(main_stem, placeholders)
        
        sub_qs = []
        for seg in valid_segments:
            sub_idx = seg['sub_idx']
            marker = seg['marker']
            sub_content = seg['content']
            
            # Check for Level 3 (circle numbers)
            # Level 3 Pattern: ①, ②...
            
            level3_qs = QuestionSplitter._process_level3_question(f"{q_id}_{sub_idx}", sub_content, main_stem, marker)
            
            if level3_qs:
                sub_qs.extend(level3_qs)
            else:
                # No Level 3, keep as Level 2
                full_content = f"【大题题干】\n{main_stem}\n\n【小题题干】\n{marker} {sub_content}"
                sub_id = f"{q_id}_{sub_idx}"
                
                sub_qs.append({
                    "id": sub_id,
                    "content": full_content,
                    "preview": full_content.replace('\n', ' ')[:60] + "...",
                    "type": "big_question_sub"
                })
            
        return sub_qs

    @staticmethod
    def _process_level3_question(parent_id: str, content: str, main_stem: str, level2_marker: str) -> List[Dict[str, Any]]:
        """
        Splits content into Level 3 questions (①, ②...)
        Returns a list of question dicts if split, or empty list if no split found.
        """
        # Pattern for Level 3: Circle numbers ①-⑩
        # We only look for circle numbers here as per requirement.
        l3_pattern = re.compile(r'(?:^|\s|\n)([①-⑩])')
        
        matches = list(l3_pattern.finditer(content))
        
        if not matches:
            return []
            
        expected_id = 1
        valid_segments = []
        current_valid_match = None
        current_valid_id = None
        
        # Circle map
        circle_map = {'①':1, '②':2, '③':3, '④':4, '⑤':5, '⑥':6, '⑦':7, '⑧':8, '⑨':9, '⑩':10}
        
        # Level 2 Stem (content before first Level 3 match)
        l2_stem_end = 0
        
        for m in matches:
            val = circle_map.get(m.group(1), -1)
            
            if val == expected_id:
                if current_valid_match:
                    c_start = current_valid_match.end()
                    c_end = m.start()
                    c_text = content[c_start:c_end].strip()
                    
                    valid_segments.append({
                        "id": current_valid_id,
                        "marker": current_valid_match.group(1),
                        "content": c_text
                    })
                else:
                    l2_stem_end = m.start()
                    
                current_valid_match = m
                current_valid_id = val
                expected_id += 1
                
        # Close last
        if current_valid_match:
            c_start = current_valid_match.end()
            c_text = content[c_start:].strip()
            valid_segments.append({
                "id": current_valid_id,
                "marker": current_valid_match.group(1),
                "content": c_text
            })
            
        if not valid_segments:
            return []
            
        # Construct questions
        l2_stem = content[:l2_stem_end].strip()
        
        results = []
        for seg in valid_segments:
            l3_id = seg['id']
            l3_marker = seg['marker']
            l3_content = seg['content']
            
            # Context construction:
            # Main Stem + Level 2 Stem (Marker + Stem) + Level 3 Content
            
            full_content = (
                f"【大题题干】\n{main_stem}\n\n"
                f"【小题题干】\n{level2_marker} {l2_stem}\n\n"
                f"【小小题题干】\n{l3_marker} {l3_content}"
            )
            
            final_id = f"{parent_id}_{l3_id}"
            
            results.append({
                "id": final_id,
                "content": full_content,
                "preview": full_content.replace('\n', ' ')[:60] + "...",
                "type": "big_question_sub_sub"
            })
            
        return results

    @staticmethod
    def _mask_roman_numerals(content: str) -> tuple[str, dict]:
        """
        Identifies Roman numerals (i, ii, iii... x) in various formats
        and replaces them with placeholders to prevent splitting or confusion.
        Supported formats: (i), i., i), （i）, I., etc.
        """
        numerals = r"i|ii|iii|iv|v|vi|vii|viii|ix|x"
        # Regex explanation:
        # Group 1: Prefix (start of line or whitespace) - preserved in replacement
        # Group 2: The Roman numeral marker
        #   Option A: (i) or （i）
        #   Option B: i. or i．
        #   Option C: i)
        # Lookahead: Space or end of string
        pattern_str = (
            r"(^|\s)"
            r"(" 
            r"(?:[\(（](?:" + numerals + r")[\)）])|"  
            r"(?:(?:" + numerals + r")[\.．])|"       
            r"(?:(?:" + numerals + r")\))"            
            r")"
            r"(?=\s|$)"
        )
        
        roman_pattern = re.compile(pattern_str, re.IGNORECASE)
        
        placeholders = {}
        
        def replace_func(match):
            prefix = match.group(1)
            marker = match.group(2)
            key = f"__ROMAN_MARKER_{len(placeholders)}__"
            placeholders[key] = marker
            return f"{prefix}{key}"
            
        masked_content = roman_pattern.sub(replace_func, content)
        return masked_content, placeholders

    @staticmethod
    def _restore_roman_numerals(content: str, placeholders: dict) -> str:
        # Sort keys by length desc to avoid partial replacement if any (though keys are unique)
        for key, value in placeholders.items():
            content = content.replace(key, value)
        return content
