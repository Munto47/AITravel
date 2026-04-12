# Project Vibe - AI 智能旅行协同规划系统

> 当前状态：**基础骨架完成**，核心链路（AI 对话 → 地点推荐 → 协同筛选 → 智能排线 → 地图导航路线）全部跑通。

---

## 一、项目定位

面向求职面试的技术演示 MVP。核心展示三大技术亮点：
1. **LangGraph 多 Agent 编排** — 意图路由 + 高德 POI + 游记 RAG + LLM 合成
2. **Yjs CRDT 实时协同** — 多人同时筛选地点、投票，500ms 内同步
3. **K-Means + TSP 智能排线** — 宏观聚类分天 + 微观 TSP 排序 + 高德真实驾车路线

---

## 二、技术栈与服务架构

```
┌─────────────────────────────────────────────────────────┐
│  前端 (localhost:3000)                                    │
│  Next.js 15 App Router + Tailwind CSS + framer-motion    │
│  Yjs + y-websocket 协同 / Zustand 本地状态               │
│  AMap JS SDK 2.0（地图 + Driving 导航路线）               │
├─────────────────────────────────────────────────────────┤
│  y-websocket (localhost:1234)                            │
│  Yjs WebSocket 同步服务，CRDT 持久化到磁盘               │
├─────────────────────────────────────────────────────────┤
│  后端 (localhost:8000)                                    │
│  FastAPI + LangGraph + asyncpg                           │
│  SSE 流式推送 / PostgreSQL Checkpointer 会话持久化       │
├─────────────────────────────────────────────────────────┤
│  PostgreSQL 16 + pgvector (localhost:5432)                │
│  Redis 7 (localhost:6379) — 驾车距离缓存                 │
└─────────────────────────────────────────────────────────┘
```

**一键启动：** `docker-compose up -d` 拉起全部 4 个服务（postgres / redis / y-websocket / backend），前端 `cd frontend && npm run dev`。

---

## 三、后端核心：LangGraph 工作流

### 3.1 主对话图（`POST /api/chat`，SSE 流式响应）

```
用户消息
   ↓
Router (gpt-4o-mini / Claude Haiku)
   │  输出: intent = rag | amap | both
   │        query_rewrite = "宽窄巷子 火锅"
   ↓
┌──────────────────────────────────┐
│ intent=amap → AmapSearch         │
│ intent=rag  → RAGRetrieval       │
│ intent=both → AmapSearch → RAG   │
└──────────────────────────────────┘
   ↓
Synthesizer (gpt-4o / Claude Sonnet)
   │  合并 POI 数据 + 游记 RAG 片段
   │  输出: Place[] + 自然语言回复文本
   ↓
SSE 事件流: thinking → place → text → done
```

**关键文件：**
- `backend/app/agents/graph.py` — StateGraph 构建、条件路由、PostgreSQL Checkpointer 初始化
- `backend/app/agents/state.py` — `AgentState` TypedDict，所有节点共享读写
- `backend/app/agents/nodes/router.py` — 意图分类 + 查询改写（JSON 输出）
- `backend/app/agents/nodes/amap_search.py` — 高德 POI 搜索（Mock / 真实 API 双模式）
- `backend/app/agents/nodes/rag_retrieval.py` — pgvector 向量检索游记片段
- `backend/app/agents/nodes/synthesizer.py` — LLM 合成描述、标签、避坑语
- `backend/app/api/chat.py` — SSE 流式端点，事件类型：`thinking / place / text / done / error`

### 3.2 排线引擎（`POST /api/optimize`，同步 JSON）

```
已选地点 Place[]
   ↓
K-Means 聚类（经纬度 → trip_days 个簇）
   ↓
每簇内：高德驾车 API 构建时间矩阵 → 最近邻 TSP 排序
   ↓
时间表生成（09:00 起，累加游览时长 + 交通时间）
   ↓
和风天气 API（出发日 3 天内填充天气建议）
   ↓
Itinerary { days: [ { slots: [ TimeSlot ] } ] }
```

**关键文件：**
- `backend/app/agents/nodes/optimizer.py` — 聚类 + TSP + 时间表 + 天气，Redis 缓存驾车距离
- `backend/app/api/optimize.py` — 接口端点

### 3.3 全局数据模型（"货币"）

`backend/app/schemas/place.py` 的 `Place` 对象贯穿所有节点和前端，`place_id` = 高德 POI ID。

```python
class Place(BaseModel):
    place_id: str          # 高德 POI ID，全局唯一
    name, category, address, coords, city
    amap_rating, amap_price, amap_photos   # 高德客观数据
    rag_meta: PlaceRAGMeta                  # 游记主观数据（tip_snippets, sentiment_score）
    description, tags                       # AI 生成
    cluster_id, visit_order, estimated_duration  # Optimizer 填入
```

### 3.4 LLM 降级策略

每个 LLM 节点（Router / Synthesizer）遵循相同优先级：
1. Anthropic Claude（若 `ANTHROPIC_API_KEY` 有效）
2. OpenAI 兼容接口（SiliconFlow / OpenAI）
3. Demo 模式（`DEMO_MODE=true`，跳过所有 LLM 调用，返回预设数据）

### 3.5 数据库结构

`backend/app/db/init.sql` 定义 5 张表：
- `travel_notes` — 原始游记元数据
- `travel_notes_chunks` — 游记分块 + pgvector embedding（1536 维）
- `rooms` — 房间元数据（room_id, thread_id, trip_city, trip_days, phase）
- `users` — 用户 ID + 昵称
- `room_members` — 房间成员关系

### 3.6 API 接口清单

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/chat` | AI 对话（SSE 流式） |
| POST | `/api/optimize` | 智能排线（同步 JSON） |
| POST | `/api/recommend` | 城市初始推荐（按品类） |
| POST | `/api/room` | 创建房间（幂等） |
| GET  | `/api/room/{id}/state` | 房间状态查询 |
| POST | `/api/room/{id}/join` | 加入房间 |
| POST | `/api/user` | 注册/更新用户 |
| GET  | `/api/user/{id}` | 查询用户 |
| GET  | `/health` | 健康检查 |

---

## 四、前端核心

### 4.1 页面结构

```
src/app/
├── page.tsx                          # 首页：创建/加入房间
├── room/[roomId]/
│   ├── page.tsx                      # 房间主页：地图 + Chat + 候选地点
│   └── itinerary/page.tsx            # 行程详情页：时间线展示
├── globals.css                       # Design System（珊瑚红 + 玻璃拟物态）
└── layout.tsx                        # 根布局（Inter 字体）
```

### 4.2 房间页三层架构（`room/[roomId]/page.tsx`）

```
Layer 0: AMapContainer          ← position:fixed, z:0, 全屏地图底层
Layer 1: overlay-layer          ← position:fixed, z:10, pointer-events:none
   ├── TopNav                   ← 顶部导航栏（房间号、在线成员、智能排线按钮）
   ├── ChatPanel (左侧)         ← AI 对话面板（380px，可折叠）
   ├── 中间留白                  ← 透视到底层地图
   └── PlaceList (右侧)         ← 候选地点/已排路线面板（360px）
```

### 4.3 核心组件

| 组件 | 文件 | 职责 |
|------|------|------|
| `AMapContainer` | `components/map/AMapContainer.tsx` | AMap JS SDK 初始化、Marker 渲染、AMap.Driving 真实路线绘制 |
| `TopNav` | `components/layout/TopNav.tsx` | Logo、AI 顾问开关、房间号复制、在线成员、智能排线按钮 |
| `ChatPanel` | `components/chat/ChatPanel.tsx` | 消息列表 + 输入框 + 快捷提问 |
| `MessageItem` | `components/chat/MessageItem.tsx` | 用户/AI 气泡、地点卡片、流式打字动效 |
| `ThinkingSteps` | `components/chat/ThinkingSteps.tsx` | Agent 思考链展示（Router → Search → Synthesizer） |
| `PlaceList` | `components/places/PlaceList.tsx` | 外层 Tab（候选/路线）+ 三大板块（美景/美食/美梦） |
| `PlaceCard` | `components/places/PlaceCard.tsx` | 地点卡片（图片、评分、心形投票、成员头像） |
| `GlassPanel` | `components/ui/GlassPanel.tsx` | 玻璃拟物态 motion.div 容器 |

### 4.4 状态管理

**Yjs（多人协同状态）** — `hooks/useYjsRoom.ts`
```
doc.getMap('room')    → { roomId, threadId, tripCity, tripDays, phase }
doc.getMap('places')  → { [placeId]: YjsPlace }  // 含 votedBy[], note, addedBy
Awareness             → 在线成员列表 + 颜色
```
操作：`addPlace` / `removePlace` / `toggleVote` / `updateNote` / `setPhase` / `initRoom`

**Zustand（本地 UI 状态）** — `stores/roomStore.ts`
```
isChatOpen, rightTab('candidates'|'itinerary'), hoveredPlaceId, selectedPlaceId, tripDays
```

**自定义 Hooks：**
- `useAIChat` — SSE 流式解析（thinking / place / text / done 事件）
- `useOptimize` — 排线请求 + 结果持久化到 localStorage

### 4.5 设计系统

- **主色调：** 珊瑚红 `#FF5A5F`（coral-500），贯穿按钮、高亮、品牌标识
- **玻璃拟物态：** `backdrop-filter: blur(16px)` + `rgba(255,255,255,0.95)` + 白色边框
- **动效：** framer-motion 入场动画（slide-up, fade-in），AnimatePresence 退场
- **CSS 类：** `.glass-panel` / `.glass-panel-solid` / `.btn-coral` / `.btn-glass` / `.input-glass` / `.avatar-ring` / `.map-fullscreen` / `.overlay-layer` / `.overlay-interactive`

### 4.6 前端类型定义

```
src/types/
├── place.ts       # Place 接口 + parsePlaceFromAPI()
├── itinerary.ts   # Itinerary/DayPlan/TimeSlot + parseItineraryFromAPI()
├── room.ts        # YjsPlace(extends Place), YjsRoomMeta, RoomMember, RoomPhase
└── chat.ts        # ChatMessage, ThinkingStep, MessageRole, MessageStatus
```

前端使用驼峰命名（`placeId`），后端使用蛇形命名（`place_id`），类型文件中各有 `parseXxxFromAPI()` 转换函数。

---

## 五、数据流总览

```
[用户输入问题]
     ↓ POST /api/chat (SSE)
[Router] → intent分类 → [AmapSearch] → [RAGRetrieval] → [Synthesizer]
     ↓ SSE: thinking → place → text → done
[前端 useAIChat] → 解析 SSE 事件
     ↓ place 事件
[useYjsRoom.addPlace] → Yjs Map → 所有客户端同步 (votedBy: [])
     ↓ 用户点击心形
[toggleVote] → votedBy 中添加/移除 userId → 所有客户端同步
     ↓ 用户点击"智能排线"
[useOptimize] → POST /api/optimize → K-Means + TSP
     ↓ 返回 Itinerary
[AMapContainer.renderRoutes] → AMap.Driving 逐天绘制真实道路路线
[PlaceList ItineraryPanel] → 时间线 UI 展示
```

---

## 六、环境变量

复制 `.env.example` 为 `.env`，关键配置：

| 变量 | 用途 | 默认值 |
|------|------|--------|
| `ANTHROPIC_API_KEY` | Claude LLM（Router + Synthesizer，优先） | 空（回退到 OpenAI） |
| `OPENAI_API_KEY` | OpenAI 兼容接口 + RAG Embedding | 必填（非 Demo 模式） |
| `OPENAI_API_URL` | 自定义 Base URL（支持 SiliconFlow 等） | `https://api.openai.com/v1` |
| `AMAP_API_KEY` | 后端高德 REST API（POI + 驾车路线） | Mock 模式可不填 |
| `AMAP_MOCK` | `true` 使用本地 fixture，`false` 真实调高德 | `true` |
| `DEMO_MODE` | `true` 跳过所有 LLM，返回预设数据 | `false` |
| `QWEATHER_KEY` | 和风天气（可选，填充天气建议） | 空 |
| `DATABASE_URL` | PostgreSQL 连接串 | docker-compose 自动覆盖 |
| `REDIS_URL` | Redis 连接串 | `redis://localhost:6379` |

前端环境变量在 `frontend/.env.local`：
| 变量 | 用途 |
|------|------|
| `NEXT_PUBLIC_API_URL` | 后端地址（默认 `http://localhost:8000`） |
| `NEXT_PUBLIC_AMAP_JS_KEY` | 高德 JS SDK Key（Web 端类型，需白名单 localhost） |
| `NEXT_PUBLIC_Y_WEBSOCKET_URL` | Yjs WebSocket 地址（默认 `ws://localhost:1234`） |

---

## 七、Mock 与 Demo 机制

项目设计了三级降级保证面试时绝对可演示：

1. **Mock 模式**（`AMAP_MOCK=true`，默认）：高德 POI 从 `backend/tests/fixtures/amap_mock_places.json` 读取，不消耗 API 配额。真实 API 返回空结果时也自动降级到 Mock。

2. **Demo 模式**（`DEMO_MODE=true`）：跳过所有 LLM 调用（Router 直接返回 `intent=amap`，Synthesizer 直接返回 POI 数据，RAG 返回空），保底方案。

3. **LLM 降级链**：Anthropic Claude → OpenAI 兼容接口 → 直接返回原始数据。

---

## 八、已完成的功能

- [x] LangGraph 多 Agent 主图（Router → AmapSearch / RAG → Synthesizer）
- [x] PostgreSQL Checkpointer 会话持久化
- [x] SSE 流式 AI 对话（thinking / place / text / done 事件）
- [x] 高德 POI 搜索（Mock + 真实 API 双模式，自动降级）
- [x] pgvector RAG 向量检索游记
- [x] K-Means 聚类 + 最近邻 TSP 排线
- [x] 高德驾车 API 真实距离矩阵（Redis 缓存 24h）
- [x] 和风天气 API 集成（3 天内预报）
- [x] Yjs CRDT 多人实时协同（地点列表 + 投票 + 在线状态）
- [x] 全屏 AMap 地图 + 彩色 Marker + AMap.Driving 真实路线
- [x] 珊瑚红玻璃拟物态 UI（Tailwind + framer-motion）
- [x] 候选地点三大板块（美景 / 美食 / 美梦）
- [x] 心形投票筛选（AI 推荐进入候选池，不自动标记想去）
- [x] 房间创建 / 加入 / 复制房间号
- [x] 行程详情页（时间线 + 交通信息）
- [x] 用户 / 房间 / 成员 PostgreSQL 持久化
- [x] Docker Compose 一键部署（4 个服务）

---

## 九、待完成 / 可优化项

| 优先级 | 模块 | 内容 |
|--------|------|------|
| P1 | RAG | 游记入库脚本（`backend/scripts/ingest_notes.py`）需要真实游记数据 + Entity Linking |
| P1 | Chat | 升级为 `graph.astream()` 真实流式（当前 `ainvoke` 同步后模拟逐字推送） |
| P2 | Optimizer | 距离矩阵在地点 > 15 个时的性能优化（当前顺序请求高德 API） |
| P2 | 前端 | 地图 Marker 点击后与右侧面板联动（高亮 + 滚动到对应卡片） |
| P2 | 前端 | 移动端响应式适配 |
| P3 | 天气 | 和风天气需要有效 API Key 才能填充 `weather_summary` |
| P3 | 协同 | Yjs Chat Array 同步聊天记录（当前只在本地 state 中） |
| P3 | 安全 | 房间权限控制（当前任何人知道房间号都可加入） |

---

## 十、目录结构速查

```
agentTravel/
├── docker-compose.yml              # 4 服务编排
├── .env.example                    # 环境变量模板
├── CLAUDE.md                       # AI 开发助手指引
│
├── backend/
│   ├── Dockerfile
│   ├── app/
│   │   ├── main.py                 # FastAPI 入口（lifespan 初始化连接池 + 持久化图）
│   │   ├── config.py               # Settings（pydantic-settings，读取 .env）
│   │   ├── agents/
│   │   │   ├── graph.py            # LangGraph StateGraph 构建 + Checkpointer
│   │   │   ├── state.py            # AgentState TypedDict
│   │   │   └── nodes/
│   │   │       ├── router.py       # 意图分类 + 查询改写
│   │   │       ├── amap_search.py  # 高德 POI 搜索
│   │   │       ├── rag_retrieval.py# pgvector 游记检索
│   │   │       ├── synthesizer.py  # LLM 数据合成
│   │   │       └── optimizer.py    # K-Means + TSP + 天气
│   │   ├── api/
│   │   │   ├── chat.py             # POST /api/chat (SSE)
│   │   │   ├── optimize.py         # POST /api/optimize
│   │   │   ├── recommend.py        # POST /api/recommend
│   │   │   └── room.py             # 房间 + 用户 CRUD
│   │   ├── schemas/
│   │   │   ├── place.py            # Place 全局数据模型
│   │   │   ├── itinerary.py        # Itinerary / DayPlan / TimeSlot
│   │   │   └── api.py              # 请求/响应 schema
│   │   └── db/
│   │       ├── connection.py       # asyncpg 连接池（含 pgvector 注册）
│   │       └── init.sql            # 建表脚本（5 张表）
│   ├── scripts/
│   │   └── ingest_notes.py         # 游记入库脚本
│   └── tests/
│       ├── fixtures/
│       │   └── amap_mock_places.json  # Mock POI 数据
│       ├── test_api.py
│       ├── test_mock_data.py
│       └── test_optimizer.py
│
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── tailwind.config.ts          # coral 色板 + 自定义动画
│   ├── next.config.ts              # 图片域名白名单 + webpack cache 配置
│   ├── src/
│   │   ├── app/
│   │   │   ├── globals.css         # Design System（玻璃拟物态 + 珊瑚红）
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx            # 首页
│   │   │   └── room/[roomId]/
│   │   │       ├── page.tsx        # 房间主页
│   │   │       └── itinerary/page.tsx  # 行程详情
│   │   ├── components/
│   │   │   ├── map/AMapContainer.tsx
│   │   │   ├── layout/TopNav.tsx
│   │   │   ├── chat/{ChatPanel,MessageItem,ThinkingSteps}.tsx
│   │   │   ├── places/{PlaceList,PlaceCard}.tsx
│   │   │   └── ui/GlassPanel.tsx
│   │   ├── hooks/
│   │   │   ├── useYjsRoom.ts       # Yjs 协同核心
│   │   │   ├── useAIChat.ts        # SSE 流式解析
│   │   │   └── useOptimize.ts      # 排线请求
│   │   ├── stores/
│   │   │   └── roomStore.ts        # Zustand 本地 UI 状态
│   │   └── types/
│   │       ├── place.ts, itinerary.ts, room.ts, chat.ts
│   │       └── (前后端命名转换函数)
│   └── .env.local                  # 前端环境变量
│
└── y-websocket/
    └── Dockerfile                  # Yjs WebSocket 中继服务
```

---

## 十一、快速接手指南

### 启动开发环境

```bash
# 1. 启动基础设施
docker-compose up -d

# 2. 启动后端（热重载）
cd backend && pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000

# 3. 启动前端
cd frontend && npm install && npm run dev

# 4. 打开浏览器
# 首页: http://localhost:3000
# 后端 Swagger: http://localhost:8000/docs
```

### 理解代码的推荐路径

1. `backend/app/schemas/place.py` — 先理解 Place 模型，它是全系统的"货币"
2. `backend/app/agents/graph.py` — 看 LangGraph 图的构建和路由逻辑
3. `backend/app/agents/nodes/` — 按 router → amap_search → synthesizer 顺序读
4. `backend/app/api/chat.py` — SSE 事件流的格式和推送逻辑
5. `frontend/src/hooks/useAIChat.ts` — 前端如何解析 SSE 事件
6. `frontend/src/hooks/useYjsRoom.ts` — Yjs 协同状态管理
7. `frontend/src/app/room/[roomId]/page.tsx` — 房间页组装逻辑
