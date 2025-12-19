import os

class Settings:
    PROJECT_NAME: str = "Chemistry Question Classifier"
    PROJECT_VERSION: str = "1.1"
    API_PREFIX: str = "/api"
    # Update ALLOWED_ORIGINS to allow all for development or ensure correct formatting
    ALLOWED_ORIGINS: list = ["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"]
    
    # File Upload Settings
    UPLOAD_DIR: str = os.path.join(os.getcwd(), "uploads")
    MAX_UPLOAD_SIZE: int = 100 * 1024 * 1024  # 100MB
    
    # Redis & Celery Settings
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://127.0.0.1:6379/0")
    CELERY_BROKER_URL: str = os.getenv("CELERY_BROKER_URL", "redis://127.0.0.1:6379/0")
    CELERY_RESULT_BACKEND: str = os.getenv("CELERY_RESULT_BACKEND", "redis://127.0.0.1:6379/0")

    # History Settings
    HISTORY_DIR: str = os.path.join(os.getcwd(), "data", "history")
    GIT_TARGET_BRANCH: str = os.getenv("GIT_TARGET_BRANCH", "main")

settings = Settings()

# Ensure directories exist
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
os.makedirs(settings.HISTORY_DIR, exist_ok=True)
