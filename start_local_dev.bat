@echo off
echo ========================================================
echo       Chemistry Question Classifier - Local Dev Start
echo ========================================================

REM 1. Start Celery Worker in a new window
start "Celery Worker" cmd /k "call .venv\Scripts\activate && celery -A backend.celery_app worker --pool=solo --loglevel=info"

REM 2. Start Backend in a new window
start "Backend API" cmd /k "call .venv\Scripts\activate && uvicorn backend.main:app --reload --port 8000"

REM 3. Start Frontend in a new window
cd frontend
start "Frontend (Vite)" cmd /k "npm run dev"

echo.
echo Services started in separate windows.
echo Frontend should be available at: http://localhost:5173
echo Backend API available at: http://localhost:8000
echo.
pause
