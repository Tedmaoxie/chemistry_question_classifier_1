@echo off
echo =======================================================
echo     Chemistry Question Classifier - Local Start Script
echo =======================================================
echo.

:: 1. Check Redis
echo [1/4] Starting Redis Server...
start "Redis Server" cmd /k "redis-server || echo Redis not found! Please install Redis or add it to PATH."

:: 2. Start Backend
echo [2/4] Starting Backend API...
if exist ".venv\Scripts\activate.bat" (
    start "Backend API" cmd /k "call .venv\Scripts\activate.bat && uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000"
) else (
    echo Warning: .venv not found. Trying global python...
    start "Backend API" cmd /k "uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000"
)

:: 3. Start Celery
echo [3/4] Starting Celery Worker...
if exist ".venv\Scripts\activate.bat" (
    start "Celery Worker" cmd /k "call .venv\Scripts\activate.bat && python -m celery -A backend.celery_app worker --loglevel=info --pool=solo"
) else (
    start "Celery Worker" cmd /k "python -m celery -A backend.celery_app worker --loglevel=info --pool=solo"
)

:: 4. Start Frontend
echo [4/4] Starting Frontend...
start "Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo =======================================================
echo     Startup sequence completed.
echo     Please check the 4 new windows for any errors.
echo     Frontend URL: http://localhost:5173/
echo =======================================================
echo.
pause
