# Project Vibe — AI 智能旅行协同规划系统

> 多人实时协同 × LangGraph 多 Agent × K-Means + TSP 智能排线

一个面向 2-5 人结伴出行的旅行规划工具。用户在共享房间中通过 AI 对话获取地点推荐，多人实时投票筛选，一键生成最优日程路线。

---

## ✨ 核心功能

| 功能 | 技术亮点 |
|------|---------|
| 🤖 **AI 地点推荐** | LangGraph 多 Agent 编排：Router 意图分类 → 高德 POI + 游记 RAG → Synthesizer 合成，SSE 节点级实时流式输出 |
| 👥 **多人实时协同** | Yjs CRDT 无锁同步，两个标签页 500ms 内所有操作（投票/备注/状态）同步到位 |
| 🗺️ **智能排线** | K-Means 按经纬度聚类分天 + 高德真实驾车距离矩阵 + 最近邻 TSP 最优排序，地图多色路线可视化 |
| 🔗 **双向地图联动** | 地图 Marker 点击 → 右侧面板滚动定位；面板卡片 hover → 地图 Marker 高亮放大 |
| 🌤️ **天气感知行程** | 出发日 3 天内自动填充和风天气预报，生成穿衣/防晒建议 |

---

## 🖼️ 界面预览

> 克隆运行后截图待补充

---

## 🏗️ 技术架构

```
浏览器
  ├── Next.js 15 (App Router) + Tailwind CSS + Framer Motion
  ├── Zustand (本地 UI 状态) + Yjs + y-websocket (多人协同 CRDT)
  └── 高德地图 JS SDK 2.0 (地图渲染 + AMap.Driving 路线)
       │
       ├── HTTP/SSE ──→ FastAPI 后端 (:8000)
       │                    ├── LangGraph StateGraph (Router→AmapSearch/RAG→Synthesizer)
       │                    ├── AsyncPostgresSaver (会话 checkpoint 持久化)
       │                    ├── scikit-learn KMeans + 最近邻 TSP (排线算法)
       │                    └── aiohttp → 高德 REST API / 和风天气 API
       │
       ├── WebSocket ──→ y-websocket (:1234)  Yjs 实时协同
       │
       └── ──→ PostgreSQL 16 + pgvector (:5432)  数据库 + 向量检索
                Redis 7 (:6379)  高德驾车距离缓存 TTL 24h
```

### LangGraph 工作流

```
用户消息
  └── Router（意图分类：rag / amap / both）
        ├── intent=amap  → AmapSearch → Synthesizer
        ├── intent=rag   → RAGRetrieval → Synthesizer
        └── intent=both  → AmapSearch → RAGRetrieval → Synthesizer
                                                  └── SSE 推送：thinking / place / text / done
```

---

## 🚀 快速开始（本地运行）

### 前置要求

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) 已启动
- Node.js 18+
- （可选）Python 3.11+（仅用于运行测试）

### 1. 克隆并配置环境变量

```bash
git clone https://github.com/your-username/agentTravel.git
cd agentTravel

# 后端环境变量
cp .env.example .env

# 前端环境变量
cp frontend/.env.local.example frontend/.env.local
```

**最小配置（无需任何 API Key 的完整演示）：**

`.env` 保持默认，`DEMO_MODE=false` + `AMAP_MOCK=true` 即可在不配置任何 Key 的情况下体验 AI 对话和排线（AI 回复需配置 LLM Key，地图需配置高德 JS Key）。

如需完整功能，在 `.env` 中填写：

```env
ANTHROPIC_API_KEY=sk-ant-...     # AI 对话（Router + Synthesizer）
AMAP_API_KEY=your-rest-key       # 高德后端 REST API（POI 搜索 / 距离矩阵）
```

在 `frontend/.env.local` 中填写：

```env
NEXT_PUBLIC_AMAP_JS_KEY=your-js-key        # 高德前端地图渲染
NEXT_PUBLIC_AMAP_SECURITY_CODE=your-code   # 高德安全密钥
```

> 高德 API Key 申请：[高德开放平台控制台](https://console.amap.com)  
> 后端需"Web服务"类型，前端需"Web端(JS API)"类型，两种类型不可互换。

### 2. 启动后端服务

```bash
docker-compose up -d --build
```

约 30 秒后 4 个服务启动完毕：

| 服务 | 端口 | 说明 |
|------|------|------|
| FastAPI 后端 | `8000` | 核心 API + LangGraph |
| PostgreSQL + pgvector | `5432` | 数据库 + 向量检索 |
| Redis | `6379` | 高德距离缓存 |
| y-websocket | `1234` | Yjs 实时协同 |

验证后端就绪：

```bash
curl http://localhost:8000/health
# {"status":"ok","service":"agentTravel-backend"}
```

### 3. 启动前端

```bash
cd frontend
npm install
npm run dev
```

打开 **http://localhost:3000** 即可使用。

---

## 🌐 生产部署

本项目支持通过 [Railway](https://railway.app) 一键部署全栈服务，前端通过 [Vercel](https://vercel.com) 部署。

### 方案一：Railway（推荐，支持 Docker Compose）

1. Fork 本仓库到你的 GitHub 账号
2. 在 Railway 创建项目，选择"Deploy from GitHub repo"
3. 添加环境变量（参考 `.env.example`），Railway 会自动识别 `docker-compose.yml`
4. 部署成功后获取后端 URL（如 `https://your-app.railway.app`）

### 方案二：前后端分离部署

**后端 + 基础设施（Railway / Render / fly.io）：**

```bash
# 设置以下环境变量
DATABASE_URL=postgresql+asyncpg://...
REDIS_URL=redis://...
ANTHROPIC_API_KEY=...
AMAP_API_KEY=...
CORS_ORIGIN_REGEX=^https://(your-frontend\.vercel\.app|localhost(:\d+)?)$
```

**前端（Vercel）：**

1. 导入 GitHub 仓库，设置 Root Directory 为 `frontend`
2. 配置环境变量：
   ```
   NEXT_PUBLIC_API_URL=https://your-backend.railway.app
   NEXT_PUBLIC_Y_WEBSOCKET_URL=wss://your-backend.railway.app
   NEXT_PUBLIC_AMAP_JS_KEY=...
   NEXT_PUBLIC_AMAP_SECURITY_CODE=...
   ```

---

## 📁 项目结构

```
agentTravel/
├── backend/
│   ├── app/
│   │   ├── agents/
│   │   │   ├── graph.py          # LangGraph 主图（StateGraph + PostgresSaver）
│   │   │   ├── state.py          # AgentState TypedDict（所有节点共享的数据总线）
│   │   │   └── nodes/
│   │   │       ├── router.py     # 意图分类（rag/amap/both），查询改写
│   │   │       ├── amap_search.py# 高德 POI 搜索（Mock + 真实双模式）
│   │   │       ├── rag_retrieval.py # pgvector 向量检索（余弦相似度，阈值 0.7）
│   │   │       ├── synthesizer.py   # LLM 合成 Place 列表 + 自然语言回复
│   │   │       └── optimizer.py     # K-Means + TSP 排线 + 天气（独立于主图）
│   │   ├── api/                  # FastAPI 路由（chat/optimize/room/recommend）
│   │   ├── db/                   # asyncpg 连接池 + init.sql（5 张表）
│   │   └── schemas/              # Pydantic 数据模型（Place/Itinerary/API）
│   ├── tests/
│   │   ├── fixtures/amap_mock_places.json  # 4 城市 Mock POI 数据
│   │   ├── test_api.py           # API 集成测试
│   │   ├── test_mock_data.py     # Fixture 完整性测试
│   │   └── test_optimizer.py     # 排线算法单元测试
│   └── scripts/ingest_notes.py   # RAG 游记入库脚本
├── frontend/
│   └── src/
│       ├── app/                  # Next.js App Router（首页/房间/行程详情）
│       ├── components/
│       │   ├── map/AMapContainer.tsx   # 地图（Marker 联动 + 多色路线）
│       │   ├── chat/                   # ChatPanel + ThinkingSteps 可视化
│       │   └── places/                 # PlaceList + PlaceCard（投票/备注）
│       ├── hooks/
│       │   ├── useYjsRoom.ts     # Yjs 协同核心（addPlace/toggleVote/Awareness）
│       │   ├── useAIChat.ts      # SSE 流式解析（Reader + TextDecoder）
│       │   └── useOptimize.ts    # 排线请求 + localStorage 持久化
│       └── stores/roomStore.ts   # Zustand 本地 UI 状态
├── y-websocket/Dockerfile        # y-websocket 服务（node:18-alpine）
├── docker-compose.yml            # 一键启动 4 个后端服务
├── .env.example                  # 后端环境变量模板
└── frontend/.env.local.example   # 前端环境变量模板
```

---

## 🧪 运行测试

无需 Docker / 外部 API，纯离线可运行：

```bash
cd backend
pip install -r requirements.txt

# 运行全量测试（52 个用例）
python -m pytest tests/ -v

# 分模块运行
python -m pytest tests/test_optimizer.py -v   # 排线算法（22 个）
python -m pytest tests/test_api.py -v         # API 集成（17 个）
python -m pytest tests/test_mock_data.py -v   # Fixture 完整性（13 个）
```

---

## 🔑 环境变量速查

### 后端（`.env`）

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `ANTHROPIC_API_KEY` | Claude API Key（推荐） | — |
| `OPENAI_API_KEY` | OpenAI 兼容 Key（备选）| — |
| `OPENAI_API_URL` | OpenAI 兼容 Base URL | `https://api.openai.com/v1` |
| `AMAP_API_KEY` | 高德后端 REST API Key | — |
| `AMAP_MOCK` | `true` 用本地 Mock 数据 | `true` |
| `QWEATHER_KEY` | 和风天气 Key | — |
| `DEMO_MODE` | `true` 跳过 LLM，返回预置数据 | `false` |
| `CORS_ORIGIN_REGEX` | 允许跨域的 Origin 正则 | `localhost` |

### 前端（`frontend/.env.local`）

| 变量 | 说明 |
|------|------|
| `NEXT_PUBLIC_API_URL` | 后端 API 地址 |
| `NEXT_PUBLIC_Y_WEBSOCKET_URL` | Yjs WebSocket 地址 |
| `NEXT_PUBLIC_AMAP_JS_KEY` | 高德地图 JS SDK Key |
| `NEXT_PUBLIC_AMAP_SECURITY_CODE` | 高德地图安全密钥 |

---

## ❓ 常见问题

**Q: 无需任何 API Key 能跑起来吗？**  
A: 可以。保持 `AMAP_MOCK=true` 默认开启，`DEMO_MODE=true` 跳过 LLM，地图渲染配置高德 JS Key（免费申请）即可完整体验所有功能。

**Q: AI 对话无响应**  
A: 检查 `.env` 中 `ANTHROPIC_API_KEY` 或 `OPENAI_API_KEY` 是否有效；或将 `DEMO_MODE=true` 切换到演示模式。

**Q: 地图空白不显示**  
A: 确认 `frontend/.env.local` 中 `NEXT_PUBLIC_AMAP_JS_KEY` 已填写有效 Key，并在高德控制台将当前域名加入白名单。

**Q: `docker-compose up` 拉取镜像失败**  
A: 配置 Docker 镜像加速，或在 `.env` 中取消注释 `*_IMAGE` 变量使用国内镜像源。

**Q: 多人协同如何测试**  
A: 在同一浏览器开两个标签页，或不同浏览器打开相同 URL，输入相同房间号即可实时协同。

**Q: RAG 游记数据为空**  
A: RAG 向量数据需手动入库（可选功能，不影响核心演示）：  
```bash
# 配置 OPENAI_API_KEY 后
cd backend && python -m scripts.ingest_notes
```

---

## 📄 License

MIT
