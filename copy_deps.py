import os
import shutil
import sys

def copy_dependencies():
    project_root = os.path.dirname(os.path.abspath(__file__))
    
    # Define source and destination
    # Using the path reported by 'pip show' earlier
    src_base = os.path.join(project_root, ".venv", "Lib", "site-packages")
    dest_base = os.path.join(project_root, "dist", "chemistry_backend", "_internal")
    
    print(f"Source: {src_base}")
    print(f"Destination: {dest_base}")
    
    if not os.path.exists(src_base):
        print(f"Error: Source directory {src_base} does not exist!")
        return
        
    if not os.path.exists(dest_base):
        print(f"Error: Destination directory {dest_base} does not exist! Did PyInstaller run?")
        # Create it if it doesn't exist (though it should)
        os.makedirs(dest_base, exist_ok=True)

    # List of directories to copy
    dirs_to_copy = [
        "pandas",
        "numpy",
        "multipart",
        "pytz",
        "dateutil",
        "openpyxl",
        "uvicorn",
        "fastapi",
        "starlette",
        "pydantic",
        "sqlalchemy",
        "jinja2",
        "click",
        "h11",
        "idna",
        "sniffio",
        "anyio",
        "greenlet",  # sqlalchemy dependency
        "markupsafe" # jinja2 dependency
    ]
    
    # List of files to copy
    files_to_copy = [
        "typing_extensions.py",
        "six.py"
    ]
    
    # Copy directories
    for dir_name in dirs_to_copy:
        src_dir = os.path.join(src_base, dir_name)
        dest_dir = os.path.join(dest_base, dir_name)
        
        if os.path.exists(src_dir):
            print(f"Copying {dir_name}...")
            try:
                # ignore __pycache__ to save space/time
                shutil.copytree(src_dir, dest_dir, dirs_exist_ok=True, ignore=shutil.ignore_patterns('__pycache__'))
                print(f"  Successfully copied {dir_name}")
            except Exception as e:
                print(f"  Failed to copy {dir_name}: {e}")
        else:
            print(f"Warning: Source directory {src_dir} not found. Skipping.")

    # Copy files
    for file_name in files_to_copy:
        src_file = os.path.join(src_base, file_name)
        dest_file = os.path.join(dest_base, file_name)
        
        if os.path.exists(src_file):
            print(f"Copying {file_name}...")
            try:
                shutil.copy2(src_file, dest_file)
                print(f"  Successfully copied {file_name}")
            except Exception as e:
                print(f"  Failed to copy {file_name}: {e}")
        else:
            print(f"Warning: Source file {src_file} not found. Skipping.")

    print("Dependency copy operation completed.")

if __name__ == "__main__":
    copy_dependencies()
