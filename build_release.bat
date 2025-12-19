@echo off
echo ========================================================
echo       Chemistry Question Classifier - Release Build
echo ========================================================

echo.
echo [1/3] Building Frontend (Vite)...
cd frontend
call npm run build
if %errorlevel% neq 0 (
    echo Error: Frontend build failed.
    pause
    exit /b %errorlevel%
)
cd ..

echo.
echo [2/3] Building Backend (PyInstaller)...
echo This may take a few minutes...
call .venv\Scripts\python -m PyInstaller --noconfirm --onedir --console --name "chemistry_backend" --clean --add-data "backend;backend" --hidden-import "celery.fixups.django" --hidden-import "celery.loaders.app" --hidden-import "multipart" --collect-all "celery" --collect-all "uvicorn" --collect-all "pandas" --collect-all "numpy" run_backend.py
if %errorlevel% neq 0 (
    echo Error: Backend build failed.
    pause
    exit /b %errorlevel%
)

echo.
echo [3/3] Integrating Frontend Assets...
call .venv\Scripts\python copy_frontend.py
if %errorlevel% neq 0 (
    echo Error: Failed to copy frontend assets.
    pause
    exit /b %errorlevel%
)

echo.
echo ========================================================
echo                  BUILD SUCCESSFUL!
echo ========================================================
echo.
echo The executable is located at:
echo   dist\chemistry_backend\chemistry_backend.exe
echo.
echo You can zip the 'dist\chemistry_backend' folder and share it.
echo.
pause
