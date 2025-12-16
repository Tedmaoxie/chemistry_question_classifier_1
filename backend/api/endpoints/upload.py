from fastapi import APIRouter, UploadFile, File, HTTPException, Body, Form
from typing import List
from backend.services.parser import DocumentParser
from backend.config import settings

router = APIRouter()

@router.post("/upload", response_model=List[dict])
async def upload_file(
    file: UploadFile = File(...),
    mode: str = Form("sub_question")
):
    """
    上传试卷文件 (.docx, .pdf) 并解析题目
    """
    # 1. Validate file size (approximate check via spool/content-length)
    # Note: UploadFile might not have size if it's streamed, but we can check after read or use SpooledFile
    # Here we check after reading into memory in parser, or check content-length header
    
    # Check Content-Length header if present
    # file.size is available in newer FastAPI/Starlette versions if spooled to disk
    
    # We'll let the parser read it, but we should probably check extension first
    filename = file.filename.lower()
    if not (filename.endswith('.docx') or filename.endswith('.pdf')):
         raise HTTPException(status_code=400, detail="Only .docx and .pdf files are supported")

    try:
        # Read file content to check size
        content = await file.read()
        if len(content) > settings.MAX_UPLOAD_SIZE:
            raise HTTPException(status_code=413, detail=f"File too large. Max size is {settings.MAX_UPLOAD_SIZE/1024/1024}MB")
            
        # Reset file cursor for parser
        file.file.seek(0)
        
        questions = await DocumentParser.parse_file(file, mode)
        return questions
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
