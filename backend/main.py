from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
import os
import sys
import traceback

# Debug: Print sys.path to understand import environment
print(f"DEBUG: sys.path: {sys.path}")

# Use absolute imports for backend package structure
# This assumes running with `uvicorn backend.main:app` from the parent directory
from backend.config import settings
from backend.api.api import api_router
from backend.celery_app import celery_app

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.PROJECT_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json"
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://localhost",
    ], # Allow specific origins for CORS with credentials
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError):
    return JSONResponse(
        status_code=400,
        content={"detail": str(exc)},
    )

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    error_msg = f"Global Exception: {str(exc)}\n{traceback.format_exc()}"
    print(error_msg)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal Server Error", "message": str(exc)},
    )

# Include API Router
app.include_router(api_router, prefix=settings.API_PREFIX)

# Serve Frontend Static Files
# Use BASE_DIR from settings which is aware of frozen state
frontend_dist_path = os.path.join(settings.BASE_DIR, "frontend", "dist")

if os.path.exists(frontend_dist_path):
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dist_path, "assets")), name="assets")
else:
    print(f"WARNING: Frontend dist path not found: {frontend_dist_path}")

# SPA Fallback for React Router
@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    # API requests are already handled by api_router above
    if full_path.startswith("api/"):
        return JSONResponse(status_code=404, content={"detail": "API endpoint not found"})
        
    # Check if file exists in dist (e.g. favicon.ico, etc.)
    file_path = os.path.join(frontend_dist_path, full_path)
    if os.path.exists(file_path) and os.path.isfile(file_path):
        return FileResponse(file_path)
        
    # Otherwise return index.html
    index_path = os.path.join(frontend_dist_path, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    
    return JSONResponse(status_code=404, content={"detail": "Frontend not built"})

@app.on_event("startup")
async def startup_event():
    import logging
    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger(__name__)
    logger.info(f"Starting up {settings.PROJECT_NAME}...")
