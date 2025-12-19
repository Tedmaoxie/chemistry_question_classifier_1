import os
import shutil
import sys

def copy_frontend():
    project_root = os.path.dirname(os.path.abspath(__file__))
    
    src_dir = os.path.join(project_root, "frontend", "dist")
    dest_dir = os.path.join(project_root, "dist", "chemistry_backend", "frontend", "dist")
    
    print(f"Source: {src_dir}")
    print(f"Destination: {dest_dir}")
    
    if not os.path.exists(src_dir):
        print(f"Error: Frontend build directory {src_dir} does not exist! Run 'npm run build' first.")
        return
        
    if os.path.exists(dest_dir):
        print(f"Cleaning existing destination: {dest_dir}")
        shutil.rmtree(dest_dir)
        
    print("Copying frontend build...")
    try:
        shutil.copytree(src_dir, dest_dir)
        print("Frontend copy completed successfully.")
    except Exception as e:
        print(f"Failed to copy frontend: {e}")

if __name__ == "__main__":
    copy_frontend()
