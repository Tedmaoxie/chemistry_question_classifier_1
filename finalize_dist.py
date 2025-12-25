import os
import shutil
import sys

def finalize_dist():
    project_root = os.path.dirname(os.path.abspath(__file__))
    dist_root = os.path.join(project_root, "dist", "chemistry_backend")
    internal_dir = os.path.join(dist_root, "_internal")
    
    print(f"Finalizing distribution in {dist_root}...")
    
    # 1. Copy frontend/dist to dist/chemistry_backend/frontend/dist
    src_frontend = os.path.join(project_root, "frontend", "dist")
    dest_frontend = os.path.join(dist_root, "frontend", "dist")
    
    if os.path.exists(src_frontend):
        if os.path.exists(dest_frontend):
            shutil.rmtree(dest_frontend)
        shutil.copytree(src_frontend, dest_frontend)
        print(f"Copied frontend/dist to {dest_frontend}")
    else:
        print(f"Error: Source frontend/dist not found at {src_frontend}")

    # 2. Copy documentation files from _internal to root if they exist there, 
    #    or from source if not found in _internal (backup plan)
    doc_files = ["README_INSTALL.txt", "for_API.md", "multiple_analysis_API.md", "single_analysis_API.md"]
    
    for doc in doc_files:
        # Try finding in _internal first (where PyInstaller might have put them)
        src_in_internal = os.path.join(internal_dir, doc)
        src_in_root = os.path.join(project_root, doc)
        dest = os.path.join(dist_root, doc)
        
        if os.path.exists(src_in_internal):
            shutil.copy2(src_in_internal, dest)
            print(f"Copied {doc} from _internal to dist root")
        elif os.path.exists(src_in_root):
            shutil.copy2(src_in_root, dest)
            print(f"Copied {doc} from source root to dist root")
        else:
            print(f"Warning: {doc} not found anywhere!")

    # 3. Copy .env if exists
    env_src = os.path.join(project_root, ".env")
    env_dest = os.path.join(dist_root, ".env")
    if os.path.exists(env_src):
        shutil.copy2(env_src, env_dest)
        print("Copied .env to dist root")

    print("Finalization complete.")

if __name__ == "__main__":
    finalize_dist()
