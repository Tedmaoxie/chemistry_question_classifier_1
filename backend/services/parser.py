import io
import re
from typing import List, Dict, Any
import docx
import pdfplumber
from fastapi import UploadFile, HTTPException
from .splitter import QuestionSplitter
import logging

logger = logging.getLogger(__name__)

class DocumentParser:
    @staticmethod
    async def parse_file(file: UploadFile, mode: str = "sub_question") -> List[Dict[str, Any]]:
        filename = file.filename
        content = await file.read()
        file_obj = io.BytesIO(content)
        
        filename_lower = filename.lower()
        if filename_lower.endswith('.docx'):
            return DocumentParser._parse_docx(file_obj, mode)
        elif filename_lower.endswith('.pdf'):
            return DocumentParser._parse_pdf(file_obj, mode)
        else:
            raise HTTPException(status_code=400, detail="Only .docx and .pdf files are supported")

    @staticmethod
    def _parse_docx(file_obj, mode: str) -> List[Dict[str, Any]]:
        doc = docx.Document(file_obj)
        full_text = []
        for para in doc.paragraphs:
            if para.text.strip():
                full_text.append(para.text.strip())
        
        text_content = "\n".join(full_text)
        logger.info(f"Parsed DOCX content length: {len(text_content)}") # Debug log
        return DocumentParser._split_questions(text_content, mode)

    @staticmethod
    def _parse_pdf(file_obj, mode: str) -> List[Dict[str, Any]]:
        text_content = ""
        with pdfplumber.open(file_obj) as pdf:
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    text_content += text + "\n"
        
        print(f"Parsed PDF content length: {len(text_content)}") # Debug log
        return DocumentParser._split_questions(text_content, mode)

    @staticmethod
    def _split_questions(content: str, mode: str) -> List[Dict[str, Any]]:
        # Use the specialized QuestionSplitter service
        logger.info(f"DEBUG: Content passed to splitter:\n{content[:200]}...")
        result = QuestionSplitter.split_text(content, mode)
        logger.info(f"DEBUG: Splitter result count: {len(result)}")
        for r in result:
             logger.info(f"DEBUG: ID {r['id']}")
        return result
        return result
