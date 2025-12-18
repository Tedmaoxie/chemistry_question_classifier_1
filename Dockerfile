# 使用官方 Python 3.11 轻量级镜像
FROM python:3.11-slim

# 设置环境变量，防止 Python 生成字节码和缓存
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# 安装系统依赖：Redis (任务队列), Node.js (构建前端), Curl
RUN apt-get update && apt-get install -y \
    redis-server \
    curl \
    gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# 设置工作目录
WORKDIR /app

# --- 阶段一：前端构建 ---
# 复制前端依赖并安装
COPY frontend/package*.json ./frontend/
WORKDIR /app/frontend
RUN npm install

# 复制前端源码并构建生成 dist 目录
COPY frontend/ ./
# 构建结果会生成在 /app/frontend/dist
RUN npm run build

# --- 阶段二：后端设置 ---
WORKDIR /app
# 复制后端依赖并安装
COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

# 复制后端源码
COPY backend/ ./backend/

# 复制提示词 Markdown 文件
COPY ["for_API.md", "."]
COPY ["multiple_analysis_API.md", "."]
COPY ["single_analysis_API.md", "."]

# 复制启动脚本
COPY start.sh .
RUN chmod +x start.sh

# 暴露端口 (Hugging Face Spaces 默认使用 7860)
EXPOSE 7860

# 设置端口环境变量
ENV PORT=7860

# 容器启动时运行脚本
CMD ["./start.sh"]
