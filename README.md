---
title: Chemistry Question Classifier
emoji: 🧪
colorFrom: indigo
colorTo: blue
sdk: docker
pinned: false
app_port: 7860
---

# 高中化学试题深度标定与学情诊断系统
**AI 赋能高中化学教学系列 · 实验中学智能实验室**

[![Hugging Face Spaces](https://img.shields.io/badge/%F0%9F%A4%97%20Hugging%20Face-Spaces-blue)](https://huggingface.co/spaces/Tedmaoxie/chemistry_question_classifier_1)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 📖 项目简介

本项目是一款专为高中化学教师设计的智能辅助系统。通过集成多种前沿大语言模型（LLM），系统能够对化学试题进行深度标定，并结合学生得分情况进行多维度的学情诊断。

系统支持**网页云端版**与**桌面一键版**两种形态，既能部署在 Hugging Face 等服务器上供全校师生使用，也能在本地 Windows 环境下一键启动，无需复杂配置。

---

## ✨ 核心亮点

### 1. 深度试题标定
- **难度精准评估**：自动对题目进行 L1-L5 五级难度打分，并提供详细的评分理由。
- **知识点提取**：精准识别题目考察的化学知识模块及细分知识点。
- **核心素养标注**：结合高中化学新课标，自动标注题目所属的核心素养维度（如：宏观辨识与微观探析、变化观念与平衡思想等）。

### 2. 多维度学情诊断
- **班级/小组分析**：上传成绩表后，系统可自动按班级或自定义小组进行群体表现分析。
- **个人诊断报告**：为每位学生生成专属的优劣势分析报告。
- **流式实时反馈**：诊断结果逐条输出，无需长时间等待，交互体验流畅。

### 3. 全面模型支持
- 集成 **DeepSeek (V3/R1)**、**字节跳动·豆包**、**阿里·通义千问**、**月之暗面·Kimi**、**智谱·GLM** 等主流模型。
- 支持多模型并行分析，方便教师对比不同 AI 的评估视角。

### 4. 极致隐私与安全
- **无痕设计**：API Key 仅用于当前会话，后端不进行任何持久化存储。
- **数据安全**：所有成绩分析数据均在内存中处理，随用随走。

---

## 🚀 部署指南

### A. Hugging Face Spaces (云端版)
本项目已完美适配 Hugging Face Docker 环境：
1. **创建 Space**：在 Hugging Face 新建 Space，SDK 选择 **Docker**。
2. **同步代码**：将本项目所有文件推送到 Space 的 `main` 分支。
3. **自动构建**：系统将自动识别 `Dockerfile` 并开始构建，约需 3-5 分钟。
4. **访问使用**：构建完成后，直接通过 Space 提供的 URL 即可访问。

### B. Windows 桌面版 (一键运行)
针对无服务器环境设计的“零门槛”方案：
1. **一键打包**：运行根目录下的 `full_rebuild.bat` 脚本。
2. **自动生成**：脚本将自动编译前端、配置后端环境，并在 `dist` 目录下生成 `chemistry_backend.exe`。
3. **即点即用**：双击运行生成的 `.exe` 文件，系统将自动弹出浏览器并进入操作界面。

### C. 本地开发模式
1. **环境要求**：Python 3.11+, Node.js 18+, Redis。
2. **后端启动**：
   ```bash
   cd backend
   pip install -r requirements.txt
   uvicorn main:app --reload
   ```
3. **前端启动**：
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

---

## 🛠️ 技术架构
- **前端**：React 18 + TypeScript + Vite + Material UI (MUI)
- **后端**：FastAPI (Python) + Celery (异步处理)
- **存储**：Redis (任务队列) + IndexedDB (前端本地历史)
- **打包**：PyInstaller (后端打包) + Vite (前端构建)

---

## 📄 许可证
本项目遵循 **MIT License**。

---
**实验中学 · 智能教育探索团队** 
*让 AI 成为教师最得力的助手*
