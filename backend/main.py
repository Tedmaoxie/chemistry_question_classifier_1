from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
import os

try:
    from backend.config import settings
    from backend.api.api import api_router
    from backend.celery_app import celery_app
except ImportError:
    from config import settings
    from api.api import api_router
    from celery_app import celery_app

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.PROJECT_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url=f"{settings.API_PREFIX}/openapi.json"
)

# Define allowed origins
origins = [
    "http://localhost",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "*" # Keep wildcard as fallback if possible, but specific ones are better for credentials
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.API_PREFIX)

@app.get(f"{settings.API_PREFIX}/health")
async def health_check():
    return {"status": "healthy"}

# Serve frontend static files in production
# Check if frontend/dist exists (relative to this file)
frontend_dist = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", "dist")

if os.path.exists(frontend_dist):
    # Mount assets
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dist, "assets")), name="assets")
    
    # Serve index.html for root
    @app.get("/")
    async def serve_spa_root():
        return FileResponse(os.path.join(frontend_dist, "index.html"))

    # Catch-all for React Router
    @app.exception_handler(404)
    async def custom_404_handler(request: Request, _):
        if request.url.path.startswith(settings.API_PREFIX):
            return JSONResponse({"detail": "Not Found"}, status_code=404)
        return FileResponse(os.path.join(frontend_dist, "index.html"))
else:
    @app.get("/")
    async def root():
        return {"message": "Chemistry Question Classifier API is running (Frontend not found)"}
