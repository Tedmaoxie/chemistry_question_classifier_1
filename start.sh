#!/bin/bash

# 1. 后台启动 Redis 服务
redis-server --daemonize yes

# 2. 后台启动 Celery Worker (任务队列处理)
# 使用 solo 模式以节省资源，适合云端小实例
celery -A backend.celery_app worker --pool=solo --loglevel=info --concurrency=1 &

# 3. 启动 FastAPI 后端服务 (同时托管前端)
# 监听所有 IP (0.0.0.0) 并使用指定端口
uvicorn backend.main:app --host 0.0.0.0 --port $PORT
