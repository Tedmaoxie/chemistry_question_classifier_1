from celery import Celery
try:
    from backend.config import settings
except ImportError:
    from config import settings

celery_app = Celery(
    "worker",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["backend.tasks.analysis", "backend.tasks.score"]
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Shanghai",
    enable_utc=True,
    # Task routing can be added here if needed
)

# Auto-discover tasks in packages
celery_app.autodiscover_tasks(["backend.tasks"])
