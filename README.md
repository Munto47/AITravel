# BreezeTravel — AI 智能旅行协同规划系统

> 多人实时协同 × LangGraph 多 Agent × K-Means + TSP 智能排线

一个面向 2-5 人结伴出行的旅行规划工具。用户在共享房间中通过 AI 对话获取地点推荐，多人实时投票筛选，一键生成最优日程路线。

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/template/deploy?repo=https://github.com/Munto47/AITravel)

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

## 🚀 快速开始（3 分钟跑起来）

### 方式一：Docker 一键启动（推荐）

```bash
git clone https://github.com/Munto47/AITravel.git
cd AITravel

# 复制环境变量模板
cp .env.example .env
cp frontend/.env.local.example frontend/.env.local

# 启动所有后端服务（postgres + redis + y-websocket + backend）
docker-compose up -d --build

# 启动前端
cd frontend && npm install && npm run dev
```

打开 **http://localhost:3000** 即可使用。

> **零 API Key 体验**：保持 `.env` 中 `AMAP_MOCK=true`（默认）+ `DEMO_MODE=true`，无需任何 Key 即可完整体验地点推荐、多人协同与智能排线。

---

### 方式二：配置真实 API Key（完整功能）

**后端 `.env`：**

```env
# LLM（支持 OpenAI / SiliconFlow / DeepSeek 等兼容接口）
OPENAI_API_KEY=sk-...
OPENAI_API_URL=https://api.openai.com/v1

# 高德地图后端 REST API Key（Web 服务类型）
AMAP_API_KEY=your-rest-key
AMAP_MOCK=false

# 和风天气（可选，不填则不显示天气条）
QWEATHER_KEY=your-qweather-key

DEMO_MODE=false
```

**前端 `frontend/.env.local`：**

```env
NEXT_PUBLIC_AMAP_JS_KEY=your-js-key          # 高德地图 Web端(JS API) 类型
NEXT_PUBLIC_AMAP_SECURITY_CODE=your-code
```

> 高德两种 Key 类型不同、不可互换：后端用「Web 服务」，前端用「Web 端 (JS API)」。申请地址：[高德开放平台控制台](https://console.amap.com)

---

## 🌐 云端部署

### Railway（全栈一键部署）

1. Fork 本仓库
2. 点击下方按钮，Railway 会自动识别 `docker-compose.yml` 并部署全部服务：

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/template/deploy?repo=https://github.com/Munto47/AITravel)

3. 在 Railway 环境变量中填写 `OPENAI_API_KEY`、`AMAP_API_KEY` 等（参考 `.env.example`）
4. 部署完成后获取后端 URL，在 Vercel 中部署前端

### Vercel（前端）+ Railway（后端）分离部署

**前端 Vercel：**

1. 在 [Vercel](https://vercel.com) 导入 GitHub 仓库，Root Directory 设为 `frontend`
2. 配置环境变量：

```
NEXT_PUBLIC_API_URL=https://your-backend.railway.app
NEXT_PUBLIC_Y_WEBSOCKET_URL=wss://your-ws.railway.app
NEXT_PUBLIC_AMAP_JS_KEY=...
NEXT_PUBLIC_AMAP_SECURITY_CODE=...
```

**后端 Railway / Render / fly.io：**

```
DATABASE_URL=postgresql+asyncpg://...
REDIS_URL=redis://...
OPENAI_API_KEY=...
AMAP_API_KEY=...
CORS_ORIGIN_REGEX=^https://(your-app\.vercel\.app|localhost(:\d+)?)$
```

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

## 📁 项目结构

```
AITravel/
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
│   │   │       └── optimizer.py     # K-Means + TSP 排线（独立于主图）
│   │   ├── api/                  # FastAPI 路由（chat/optimize/room/recommend/weather）
│   │   ├── db/                   # asyncpg 连接池 + init.sql（5 张表）
│   │   └── schemas/              # Pydantic 数据模型（Place/Itinerary/API）
│   ├── tests/
│   │   ├── fixtures/amap_mock_places.json  # 4 城市 Mock POI 数据（含美食/住宿/景点）
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

# 运行全量测试
python -m pytest tests/ -v

# 分模块运行
python -m pytest tests/test_optimizer.py -v   # 排线算法
python -m pytest tests/test_api.py -v         # API 集成
python -m pytest tests/test_mock_data.py -v   # Fixture 完整性
```

---

## 🔑 环境变量速查

### 后端（`.env`）

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `OPENAI_API_KEY` | OpenAI 兼容 Key（必填，支持 SiliconFlow / DeepSeek） | — |
| `OPENAI_API_URL` | OpenAI 兼容 Base URL | `https://api.openai.com/v1` |
| `AMAP_API_KEY` | 高德后端 REST API Key（Web 服务类型） | — |
| `AMAP_MOCK` | `true` 用本地 Mock 数据 | `true` |
| `QWEATHER_KEY` | 和风天气 Key（可选） | — |
| `DEMO_MODE` | `true` 跳过 LLM，返回预置数据 | `false` |
| `CORS_ORIGIN_REGEX` | 允许跨域的 Origin 正则 | `localhost` |

### 前端（`frontend/.env.local`）

| 变量 | 说明 |
|------|------|
| `NEXT_PUBLIC_API_URL` | 后端 API 地址（默认 `http://localhost:8000`） |
| `NEXT_PUBLIC_Y_WEBSOCKET_URL` | Yjs WebSocket 地址（默认 `ws://localhost:1234`） |
| `NEXT_PUBLIC_AMAP_JS_KEY` | 高德地图 JS SDK Key（Web 端类型） |
| `NEXT_PUBLIC_AMAP_SECURITY_CODE` | 高德地图安全密钥 |

---

## ❓ 常见问题

**Q: 无需任何 API Key 能跑起来吗？**  
A: 可以。保持 `AMAP_MOCK=true` 默认开启，将 `DEMO_MODE=true`，地图渲染配置高德 JS Key（免费申请）即可完整体验所有功能。

**Q: AI 对话无响应**  
A: 检查 `.env` 中 `OPENAI_API_KEY` 是否有效；或将 `DEMO_MODE=true` 切换到演示模式。

**Q: 地图空白不显示**  
A: 确认 `frontend/.env.local` 中 `NEXT_PUBLIC_AMAP_JS_KEY` 已填写有效 Key，并在高德控制台将当前域名加入白名单。

**Q: `docker-compose up` 拉取镜像失败**  
A: 配置 Docker 镜像加速，或在 `.env` 中取消注释 `*_IMAGE` 变量使用国内镜像源。

**Q: 多人协同如何测试**  
A: 在同一浏览器开两个标签页，或不同浏览器打开相同 URL，输入相同房间号即可实时协同。

**Q: RAG 游记数据为空**  
A: RAG 向量数据需手动入库（可选功能，不影响核心演示）：  
```bash
cd backend && python -m scripts.ingest_notes
```

---

## 📄 License

MIT
