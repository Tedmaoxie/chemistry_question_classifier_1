@echo off
echo ========================================================
echo       Restarting All Local Development Services
echo ========================================================
echo.

echo [1/5] Stopping existing processes...
REM Kill Node (Frontend)
taskkill /F /IM node.exe /T 2>nul
REM Kill Python (Backend/Celery) - Warning: this kills ALL python processes
taskkill /F /IM python.exe /T 2>nul
REM Kill Redis
taskkill /F /IM redis-server.exe /T 2>nul

REM Wait a moment for ports to free up
timeout /t 2 /nobreak >nul

echo.
echo [2/5] Starting Redis...
REM Try to start redis-server. 
REM If it's not in PATH, this window will close or error.
start "Redis Server" redis-server

echo.
echo [3/5] Starting Celery Worker...
start "Celery Worker" cmd /k "call .venv\Scripts\activate && celery -A backend.celery_app worker --pool=solo --loglevel=info"

echo.
echo [4/5] Starting Backend API...
start "Backend API" cmd /k "call .venv\Scripts\activate && uvicorn backend.main:app --reload --port 8000"

echo.
echo [5/5] Starting Frontend...
cd frontend
start "Frontend (Vite)" cmd /k "npm run dev"

echo.
echo ========================================================
echo                  RESTART COMPLETE
echo ========================================================
echo.
echo Please check the opened windows for any errors.
echo Frontend: http://localhost:5173
echo Backend:  http://localhost:8000
echo.
pause
