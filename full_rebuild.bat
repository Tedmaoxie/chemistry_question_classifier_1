@echo off
echo ========================================================
echo       Chemistry Question Classifier - Full Rebuild
echo ========================================================

:: Select Python Interpreter
set PYTHON_CMD=python
if exist .venv\Scripts\python.exe (
    echo Using .venv python environment...
    set PYTHON_CMD=.venv\Scripts\python.exe
) else (
    echo Using system python...
)

echo.
echo [1/3] Building Frontend (npm run build)...
cd frontend
call npm run build
if %errorlevel% neq 0 (
    echo Error: Frontend build failed.
    echo Please make sure you have run 'npm install' in frontend directory.
    pause
    exit /b %errorlevel%
)
cd ..

echo.
echo [1.5/3] Updating Backend Dependencies...
call %PYTHON_CMD% -m pip install -r backend/requirements.txt
if %errorlevel% neq 0 (
    echo Warning: Dependency update failed, trying to continue...
)

echo.
echo [2/3] Building Backend (PyInstaller)...
echo Closing any running instances...
taskkill /F /IM chemistry_backend.exe 2>nul

call %PYTHON_CMD% -m PyInstaller chemistry_backend.spec --noconfirm --clean
if %errorlevel% neq 0 (
    echo Error: Backend build failed.
    pause
    exit /b %errorlevel%
)

echo.
echo [3/3] Finalizing Distribution...
call %PYTHON_CMD% finalize_dist.py
if %errorlevel% neq 0 (
    echo Error: Finalization failed.
    pause
    exit /b %errorlevel%
)

echo.
echo ========================================================
echo                  FULL BUILD SUCCESSFUL!
echo ========================================================
echo.
echo The new desktop version is ready at:
echo dist\chemistry_backend\chemistry_backend.exe
echo.
pause