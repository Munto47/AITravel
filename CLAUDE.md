# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

AI 智能旅行协同规划系统 MVP，用于求职面试演示。核心亮点：
- **LangGraph 多 Agent 编排**：Router → RAG/AmapSearch → Synthesizer
- **Yjs CRDT 实时协同**：两标签页 500ms 内同步
- **K-Means + TSP 混合排线**：K-Means 宏观聚类 + 最近邻 TSP 微观排线

## 常用命令

### 一键启动（推荐）
```bash
docker-compose up -d          # 启动所有服务（postgres + redis + y-websocket + backend）
docker-compose down           # 停止
docker-compose logs -f backend  # 查看后端日志
```

### 后端独立开发（热重载）
```bash
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
```

### 前端独立开发
```bash
cd frontend
npm install
npm run dev      # http://localhost:3000
npm run build
npm run lint
```

### 数据库操作
```bash
docker-compose exec postgres psql -U postgres -d travel_agent
```

## 环境变量配置

复制 `.env.example` 为 `.env`，关键字段：
- `OPENAI_API_KEY` / `OPENAI_API_URL` — LLM 调用（Router 和 Synthesizer 节点）
- `AMAP_API_KEY` — 后端高德 REST API Key（Web 服务类型）
- `AMAP_JS_KEY` — 前端高德 JS SDK Key（Web 端(JS API) 类型，两个 key 不同）
- `AMAP_MOCK=true` — 默认开启，使用本地 fixture 数据保护 API 配额
- `DEMO_MODE=true` — 跳过所有 LLM 调用，返回预设数据（面试演示用）

## 架构说明

### 服务端口
- `3000` — Next.js 前端
- `8000` — FastAPI 后端（`/docs` 查看 Swagger）
- `1234` — y-websocket 实时协同服务
- `5432` — PostgreSQL + pgvector
- `6379` — Redis（API 缓存）

### LangGraph 工作流（后端核心）

`backend/app/agents/` 下的主图流向：

```
Router → (intent=rag) → RAGRetrieval → Synthesizer
       → (intent=amap) → AmapSearch → Synthesizer
       → (intent=both) → AmapSearch → RAGRetrieval → Synthesizer
```

- **Router** (`nodes/router.py`): 调用 `gpt-4o-mini` 分类意图（rag/amap/both），改写查询
- **AmapSearch** (`nodes/amap_search.py`): 高德 POI 搜索；`AMAP_MOCK=true` 时从 `tests/fixtures/amap_mock_places.json` 读取
- **RAGRetrieval** (`nodes/rag_retrieval.py`): pgvector 向量检索游记
- **Synthesizer** (`nodes/synthesizer.py`): 调用 `gpt-4o` 合并数据，生成 Place 列表和回复文本
- **Optimizer** (`nodes/optimizer.py`): **独立节点**，不在主 chat 图中，通过 `POST /api/optimize` 触发；执行 K-Means + TSP 生成 Itinerary

`/api/chat` 通过 SSE 流式推送 `thinking → place → text → done` 事件。

### 全局数据模型（"货币"）

`backend/app/schemas/place.py` 的 `Place` 对象贯穿所有节点和前端状态树，`place_id` 使用高德 POI ID 作为全局唯一标识。

### 前端状态管理

Yjs YDoc 三个共享结构（`frontend/src/hooks/useYjsRoom.ts`）：
- `doc.getMap('room')` — 房间元数据（roomId, threadId, tripCity, tripDays）
- `doc.getMap('places')` — 共享地点列表（含 votedBy, note）
- `doc.getArray('chat')` — 只追加的消息记录

Zustand store (`frontend/src/stores/`) 管理本地 UI 状态，Yjs 负责多人同步状态。

### API 接口

- `POST /api/chat` — SSE 流式响应，payload: `{messages, room_id, thread_id}`
- `POST /api/optimize` — 同步 JSON 响应，payload: `{places, trip_days, thread_id}`
- `POST /api/room` — 创建房间
- `GET /api/room/{id}/state` — 获取房间元数据

## 当前实现状态

骨架已完成，部分节点有 TODO 待 Sprint 填充：
- RAGRetrieval: 向量入库脚本在 `backend/scripts/`，Sprint 3 完善
- Optimizer: 高德距离矩阵真实调用在 Sprint 4，当前用经纬度直线距离代理
- 和风天气: Sprint 4 集成，DayPlan.weather_summary 当前为空
