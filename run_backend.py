import os
import sys
import traceback
import multiprocessing

# Immediate logging function
def log_early(msg):
    try:
        # Also write to a file in the same directory as the exe
        log_path = "startup_debug.log"
        if getattr(sys, 'frozen', False):
            log_path = os.path.join(os.path.dirname(sys.executable), "startup_debug.log")
        
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(f"[{os.getpid()}] {msg}\n")
        print(msg)
        sys.stdout.flush()
    except:
        pass

log_early("--- 脚本加载 / Script Loading ---")

if __name__ == "__main__":
    # Support for multiprocessing in frozen apps
    multiprocessing.freeze_support()
    
    log_early("--- 程序启动 / Program Starting ---")
    
    try:
        # Determine the base directory
        if getattr(sys, 'frozen', False):
            base_dir = os.path.dirname(sys.executable)
            internal_dir = os.path.join(base_dir, "_internal")
            if os.path.exists(internal_dir):
                sys.path.append(internal_dir)
            sys.path.append(base_dir)
        else:
            base_dir = os.path.dirname(os.path.abspath(__file__))
            sys.path.append(base_dir)
            
        log_early(f"Base Directory: {base_dir}")
        log_early(f"Python Path: {sys.path}")

        log_early("正在加载依赖 / Loading dependencies...")
        from dotenv import load_dotenv
        import uvicorn
        load_dotenv()
        # Set desktop mode flag
        os.environ["RUNNING_DESKTOP"] = "true"
        log_early("依赖加载完成 / Dependencies loaded.")

        log_early("正在初始化应用 / Initializing app...")
        # We import inside try to catch initialization errors
        from backend.main import app
        log_early("应用初始化完成 / App initialized.")

        log_early(f"正在启动服务 (127.0.0.1:8000) / Starting server...")
        uvicorn.run(app, host="127.0.0.1", port=8000, reload=False, workers=1)
        
    except Exception as e:
        log_early("!!! 启动发生错误 / Startup Error !!!")
        error_msg = traceback.format_exc()
        log_early(error_msg)
        
        print("\n" + "="*50)
        print("程序启动失败 / Program Startup Failed")
        print("="*50)
        print(error_msg)
        print("="*50)
        input("\n按回车键退出... / Press Enter to exit...")
