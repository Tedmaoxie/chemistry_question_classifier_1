@echo off
echo ========================================================
echo       Chemistry Question Classifier - Quick Rebuild
echo ========================================================
echo.
echo Closing any running instances...
taskkill /F /IM chemistry_backend.exe 2>nul

echo.
echo [1/2] Rebuilding Backend (PyInstaller)...
call .venv\Scripts\python -m PyInstaller chemistry_backend.spec --noconfirm --clean
if %errorlevel% neq 0 (
    echo Error: Backend build failed.
    pause
    exit /b %errorlevel%
)

echo.
echo [2/2] Restoring Frontend Assets...
call .venv\Scripts\python copy_frontend.py
if %errorlevel% neq 0 (
    echo Error: Failed to copy frontend assets.
    pause
    exit /b %errorlevel%
)

echo.
echo ========================================================
echo                  UPDATE SUCCESSFUL!
echo ========================================================
echo.
echo You can now run: dist\chemistry_backend\chemistry_backend.exe
pause
