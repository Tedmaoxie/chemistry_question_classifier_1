import uvicorn
import os
import sys
from dotenv import load_dotenv

if __name__ == "__main__":
    # Load environment variables
    load_dotenv()
    
    # Set desktop mode flag
    os.environ["RUNNING_DESKTOP"] = "true"
    
    # Ensure backend can be imported
    sys.path.append(os.path.dirname(os.path.abspath(__file__)))
    
    # Run uvicorn
    # Use factory or string import. Since we are in the same process, string import works if path is correct.
    # But for PyInstaller, it's safer to import the app object directly if possible, 
    # OR use the string import but ensure uvicorn can find it.
    # PyInstaller with uvicorn can be tricky. 
    # Usually better to import the app and pass it to uvicorn.run, but uvicorn.run(app) doesn't support reload (which we don't need).
    
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8000, reload=False, workers=1)
