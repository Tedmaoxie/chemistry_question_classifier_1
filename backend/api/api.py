from fastapi import APIRouter
from .endpoints import upload, analysis, score, history

api_router = APIRouter()
api_router.include_router(upload.router, tags=["files"])
api_router.include_router(analysis.router, tags=["analysis"])
api_router.include_router(score.router, tags=["score"])
api_router.include_router(history.router, prefix="/history", tags=["history"])
