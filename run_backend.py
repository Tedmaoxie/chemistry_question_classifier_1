import sys
import os
import multiprocessing
import traceback

# 1. Freeze support for multiprocessing (critical for Windows)
# Must be outside the main block or at the very top if using spawn
if __name__ == "__main__":
    multiprocessing.freeze_support()

def run():
    try:
        print("Initializing Chemistry Question Classifier Backend...")
        
        # 2. Setup Environment
        os.environ["RUNNING_DESKTOP"] = "true"
        
        # Ensure backend module can be found
        base_dir = os.path.abspath(".")
        if getattr(sys, 'frozen', False):
            base_dir = os.path.dirname(sys.executable)
        
        # We already added to sys.path above, but let's double check for runtime safety
        if base_dir not in sys.path:
            sys.path.insert(0, base_dir)
            
        print(f"Working directory: {base_dir}")
        print("Loading dependencies...")

        # 3. Delayed Imports to prevent crash on startup if missing
        # Explicit imports to ensure PyInstaller finds them
        global uvicorn, pd, np, fastapi, starlette, pydantic
        global docx, pdfplumber, openpyxl, multipart, celery, redis
        global app

        import uvicorn
        import pandas as pd
        import numpy as np
        import fastapi
        import starlette
        import pydantic
        import docx
        import pdfplumber
        import openpyxl
        import multipart
        import celery
        import redis
        
        # Add current directory to sys.path to ensure 'backend' module can be found
        sys.path.insert(0, os.path.abspath("."))
        
        from backend.main import app

        print("Dependencies loaded successfully.")
             
        # 4. Run Server
        print("Starting server on http://127.0.0.1:8000...")
        # reload=False is important for frozen app
        uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info", reload=False)
        
    except Exception as e:
        print("\n" + "="*50)
        print("CRITICAL ERROR: Failed to start application")
        print("="*50)
        traceback.print_exc()
        print("="*50)
        print(f"Error details: {e}")
        input("Press Enter to exit...")

if __name__ == "__main__":
    run()
