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
        
        # Copy .env file if it exists
        env_src = os.path.join(project_root, ".env")
        env_dest = os.path.join(project_root, "dist", "chemistry_backend", ".env")
        if os.path.exists(env_src):
            print(f"Copying .env file to {env_dest}...")
            shutil.copy2(env_src, env_dest)
            print(".env file copied successfully.")
        else:
            print("No .env file found in root, skipping.")

        # Copy API definition MD files
        md_files = ["for_API.md", "multiple_analysis_API.md", "single_analysis_API.md"]
        for md_file in md_files:
            md_src = os.path.join(project_root, md_file)
            md_dest = os.path.join(project_root, "dist", "chemistry_backend", md_file)
            if os.path.exists(md_src):
                print(f"Copying {md_file} to {md_dest}...")
                shutil.copy2(md_src, md_dest)
                print(f"{md_file} copied successfully.")
            else:
                print(f"Warning: {md_file} not found in root!")
            
    except Exception as e:
        print(f"Failed to copy files: {e}")

if __name__ == "__main__":
    copy_frontend()
