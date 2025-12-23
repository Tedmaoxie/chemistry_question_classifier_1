from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
import os
import sys

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
    allow_origins=["*"], # Allow all for now to avoid CORS issues in Space
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API Router
app.include_router(api_router, prefix=settings.API_PREFIX)

# Serve Frontend Static Files
# Mount /assets to frontend/dist/assets
# Ensure the path is correct relative to where uvicorn is run or executable location
if getattr(sys, 'frozen', False):
    # Running as PyInstaller bundle
    base_dir = os.path.dirname(sys.executable)
else:
    # Running as script
    base_dir = os.getcwd()

frontend_dist_path = os.path.join(base_dir, "frontend", "dist")

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
