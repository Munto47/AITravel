# 核心开发者 Onboarding Blueprint

> 目标读者：具备 Python + React 基础，但从未接触本项目的工程师。
> 读完本文，你应当能立即接手代码，知道该改哪个文件的哪一行。

---

## 模块一：一分钟电梯演讲 (The 10,000-Foot View)

### 一句话定义

**"多人实时协同的 AI 旅行规划工具"**——用户在一个共享房间里，通过 AI 对话获取地点推荐（高德 POI + 游记 RAG 融合），多人投票筛选后，一键生成 K-Means 分天 + TSP 排序的可视化行程路线。核心解决：信息过载 + 多人意见难统一 + 手动排线低效。

### 核心业务链路（骨架）

```
① 创建房间（首页）
      ↓ POST /api/room，生成 room_id（6位短码）+ thread_id（UUID）
② 输入问题（ChatPanel）
      ↓ POST /api/chat，触发 LangGraph 主图
③ LangGraph 后端处理
      Router（意图分类）→ AmapSearch（高德POI） / RAGRetrieval（游记向量）→ Synthesizer（LLM合成）
      ↓ SSE 事件流：thinking → place（逐个推送） → text（逐字符） → done
④ 地点进入协同面板
      前端收到 place 事件 → useYjsRoom.addPlace() → Yjs CRDT 广播 → 所有标签页同步
⑤ 多人投票心形 → toggleVote → Yjs 同步
⑥ 点击"智能排线"
      ↓ POST /api/optimize
      K-Means 分天聚类 → 高德距离矩阵（Redis缓存24h）→ 最近邻TSP → 时间表生成
⑦ 地图渲染
      AMap.Driving 静默预加载 → 一次性绘制多色静态 Polyline → setFitView 自适应
```

---

## 模块二：技术栈与架构骨架 (Architecture & Tech Stack)

### 技术基底

| 层级 | 技术选型 | 重要说明 |
|------|----------|----------|
| 前端框架 | Next.js 15 (App Router) | SSR 仅用于骨架，核心逻辑全是客户端 |
| 前端样式 | Tailwind CSS + framer-motion | 自定义 coral 色板，大量 CSS 变量，见 `globals.css` |
| **协同核心** | **Yjs + y-websocket** | 项目最重要的非标依赖。doc 分三个共享结构，Awareness 管在线成员 |
| 本地状态 | Zustand | 仅管 UI 状态（面板开关/hover），不参与 Yjs 同步 |
| 地图 | `@amap/amap-jsapi-loader` + AMap.Driving | 需要两个 Key（REST Key ≠ JS SDK Key），配置见 `.env.local` |
| 后端框架 | FastAPI (Python 3.11) | 全异步，SSE 通过 `StreamingResponse` 推送 |
| **AI 编排** | **LangGraph** | 项目核心。StateGraph + 条件路由 + AsyncPostgresSaver 持久化 |
| 数据库 | PostgreSQL 16 + pgvector | pgvector 用于 RAG 游记的向量检索（1536维，IVFFlat索引） |
| 缓存 | Redis 7 | 仅用于缓存高德驾车距离矩阵（TTL 24h） |
| 配置管理 | pydantic-settings | `backend/app/config.py`，`@lru_cache` 单例 |

### 模块划分

```
agentTravel/
├── backend/app/
│   ├── agents/
│   │   ├── graph.py          ← LangGraph 主图入口，StateGraph 构建 + PostgresSaver
│   │   ├── state.py          ← AgentState TypedDict（所有节点共享读写的"数据总线"）
│   │   └── nodes/
│   │       ├── router.py     ← 意图分类（rag/amap/both），改写查询
│   │       ├── amap_search.py← 高德POI搜索，三层降级（Mock→无Key→API失败→Mock）
│   │       ├── rag_retrieval.py← pgvector 向量检索，相似度阈值 0.7
│   │       ├── synthesizer.py← LLM 合成 Place列表 + 自然语言回复
│   │       └── optimizer.py  ← 排线引擎（K-Means+TSP+天气），539行，独立于主图
│   ├── api/
│   │   ├── chat.py           ← SSE 端点，ainvoke调用（非真流式，见避坑）
│   │   ├── optimize.py       ← 排线端点
│   │   ├── recommend.py      ← 城市初始推荐
│   │   └── room.py           ← 房间/用户 CRUD
│   ├── schemas/
│   │   ├── place.py          ← Place 全局货币模型（最重要的文件之一）
│   │   ├── itinerary.py      ← Itinerary/DayPlan/TimeSlot
│   │   └── api.py            ← ChatRequest/OptimizeRequest/Response
│   └── db/
│       ├── connection.py     ← asyncpg 连接池，含 pgvector 注册
│       └── init.sql          ← 5张表建表脚本
│
├── frontend/src/
│   ├── app/
│   │   ├── page.tsx          ← 首页（创建/加入房间）
│   │   ├── room/[roomId]/page.tsx       ← 房间主页（三层架构）
│   │   └── room/[roomId]/itinerary/page.tsx ← 行程详情
│   ├── components/
│   │   ├── map/AMapContainer.tsx        ← 地图组件（最复杂，275行）
│   │   ├── chat/{ChatPanel,MessageItem,ThinkingSteps}.tsx
│   │   ├── places/{PlaceList,PlaceCard}.tsx
│   │   └── layout/TopNav.tsx
│   ├── hooks/
│   │   ├── useYjsRoom.ts     ← Yjs协同核心（217行），理解这个=理解协同层
│   │   ├── useAIChat.ts      ← SSE流式解析（Reader+TextDecoder+帧分割）
│   │   └── useOptimize.ts    ← 排线请求 + localStorage持久化
│   ├── stores/roomStore.ts   ← Zustand UI状态（isChatOpen/rightTab/hoveredId）
│   └── types/                ← place.ts/itinerary.ts/room.ts/chat.ts + API转换函数
│
├── docker-compose.yml        ← 一键启动4个服务
└── .env / .env.example       ← 后端配置（DEMO_MODE/AMAP_MOCK开关最重要）
```

### 核心数据流转

```
【前端发起对话】
  useAIChat.sendMessage()
    → POST /api/chat {message, thread_id, user_id, trip_city, selected_place_ids}

【后端 LangGraph 处理】
  AgentState（数据总线）在节点间传递：
  Router写入 intent + query_rewrite
    → AmapSearch读取query_rewrite，写入amap_places（Place[]）
    → RAGRetrieval读取query_rewrite，写入rag_chunks（dict[]）
    → Synthesizer读取amap_places+rag_chunks，写入synthesized_places+final_response

【SSE 推送回前端】
  data: {"event":"thinking","data":{node,summary,ms}}  ← ThinkingSteps 可视化
  data: {"event":"place","data":{"place":{...}}}       ← 逐个推送Place对象
  data: {"event":"text","data":{"delta":"..."}}         ← 逐字符文字回复
  data: {"event":"done","data":{total_places,total_ms}}

【前端消费 SSE】
  place事件 → useYjsRoom.addPlace(place)
    → doc.getMap('places').set(placeId, YjsPlace)
    → WebSocketProvider广播
    → 所有标签页 placesMap.observe() 触发 → React re-render

【触发排线】
  useOptimize.optimize(votedPlaces, tripDays)
    → POST /api/optimize {places, trip_days, thread_id}
    → optimizer.py: KMeans(n_clusters=trip_days) → 高德距离矩阵（Redis缓存） → TSP → TimeSlot[]
    → 返回 Itinerary → localStorage缓存 → AMapContainer.renderRoutes()
```

---

## 模块三：当前"国情"与核心资产 (State of the Union)

### 已跑通的闭环（100% 可用）

- **完整 AI 对话链路**：Router 意图分类 → 高德 POI 搜索（Mock 默认开启）→ pgvector RAG 检索 → LLM 合成 → SSE 推送
- **Yjs 多人实时协同**：addPlace / toggleVote / updateNote / setPhase，Awareness 在线成员，500ms 内跨标签页同步
- **K-Means + TSP 排线**：含真实高德驾车距离矩阵（API + Redis缓存 24h）+ 最近邻 TSP + 时间表 + 和风天气填充
- **地图路线可视化**：AMap.Driving 真实道路轨迹，每天一色，静态叠加，setFitView 自适应
- **LangGraph 会话持久化**：AsyncPostgresSaver 检查点，关闭浏览器重开后 AI 保有完整上下文
- **三级降级保障**：`DEMO_MODE=true`（跳过LLM）+ `AMAP_MOCK=true`（本地fixture）+ LLM降级链（Anthropic→OpenAI兼容）

### 核心货币：Place 对象

**理解 Place 就理解了整个系统的数据层。** 它贯穿 LangGraph 三个节点、Yjs 共享 Map、Optimizer 算法、地图渲染、行程时间表，是所有模块之间传递数据的唯一货币。

```python
# backend/app/schemas/place.py
class Place(BaseModel):
    place_id: str          # 高德 POI ID，全局唯一键
    name: str
    category: PlaceCategory  # attraction/food/hotel/transport
    address: str
    coords: Coordinates    # {lng, lat}
    city: str
    district: Optional[str]      # 行政区（高德 adname）
    source: PlaceSource          # amap_poi / rag / synthesized
    amap_rating: Optional[float]
    amap_price: Optional[float]
    opening_hours: Optional[str]
    phone: Optional[str]
    amap_photos: list[str]
    rag_meta: Optional[PlaceRAGMeta]   # 游记主观数据（避坑tips）
    description: Optional[str]
    tags: list[str]
    # Optimizer 填入后才有值
    cluster_id: Optional[int]     # 第几天
    visit_order: Optional[int]    # 当天第几站
    estimated_duration: Optional[int]  # 建议游览时长（分钟）
```

前端使用驼峰命名（`placeId`、`amapRating`），**后端使用蛇形命名**（`place_id`、`amap_rating`）。转换函数在 `frontend/src/types/place.ts` 的 `parsePlaceFromAPI()`。

---

## 模块四：避坑指南与隐性逻辑 (The "Gotchas" & Known Issues)

### ⚠️ 坑1：SSE 是"伪流式"，不是真正的 LangGraph astream

`backend/app/api/chat.py` 第 53 行用的是 `await graph.ainvoke()`——这是**同步等待 LangGraph 执行完毕**，然后再把结果一次性模拟成 SSE 流。

```python
# chat.py line 51-53 — 当前实现
# TODO: Sprint 6 - 改为 graph.astream() 获取流式更新
final_state = await graph.ainvoke(input_state, config=config)
```

**影响**：用户会看到一段"卡住"时间，然后 ThinkingSteps + 地点 + 文字一口气出来，不是真正逐步出现。如果你要改这个，需要重构 `_event_stream` 函数，改用 `graph.astream()` 在节点执行时实时 yield 事件。

---

### ⚠️ 坑2：高德地图需要两个不同的 Key，类型不同

| Key | 用途 | 配置位置 |
|-----|------|----------|
| `AMAP_API_KEY` | 后端 REST API（POI 搜索/驾车距离矩阵） | `.env`，Web服务类型 |
| `NEXT_PUBLIC_AMAP_JS_KEY` | 前端 JS SDK（地图渲染/Driving路线）| `frontend/.env.local`，Web端(JS API)类型 |

两个 Key 在高德开放平台是**不同的应用类型**，互相不可替代。此外还需要安全密钥 `NEXT_PUBLIC_AMAP_SECURITY_CODE`（`_AMapSecurityConfig`）。

---

### ⚠️ 坑3：AMap.Driving 路线绘制有 QPS 限制，必须错开请求

`AMapContainer.tsx` 第 203 行用 `setTimeout(dayIdx * 600)` 故意错开每天的驾车路线请求。如果你改成并发（Promise.all 直接搜索），高德会因为 QPS 超限返回失败，路线不显示。**不要去掉这个 delay。**

---

### ⚠️ 坑4：LangGraph AgentState 的字段名和直觉不符

新人最容易写错的字段：

| 直觉写法（错的） | 实际字段名（正确） |
|-----------------|-------------------|
| `state.city` | `state.trip_city` |
| `state.final_places` | `state.synthesized_places` |
| `state.rag_snippets` | `state.rag_chunks` |
| `state.response_text` | `state.final_response` |

全局唯一真相：`backend/app/agents/state.py`。

---

### ⚠️ 坑5：Yjs 的三个共享结构职责严格分离，不要混写

```
doc.getMap('room')    → 房间元数据（roomId/threadId/phase/tripCity/tripDays）
doc.getMap('places')  → Place 列表（key=placeId, value=YjsPlace）
doc.getArray('chat')  → 聊天消息（只追加，不改不删）
```

Zustand `roomStore` 只管纯 UI 状态（面板开关、高亮 ID 等），**绝不**放入需要多人同步的数据。如果你不确定某个状态放 Yjs 还是 Zustand，规则是：**跨用户共享的放 Yjs，只影响当前用户 UI 的放 Zustand。**

---

### ⚠️ 坑6：Optimizer 的 K-Means 簇数不能超过地点数

`optimizer.py` 做了保护处理，但上层调用时需注意：如果 `trip_days=3` 但只有 2 个地点，K-Means 会退化。TopNav 排线按钮设了最低 2 个地点的校验，但没有品类完整性的硬校验（前端有软提示）。

---

### ⚠️ 坑7：两个陈旧 TODO 注释不代表功能未完成

- `backend/app/db/connection.py:4` — `TODO (Sprint 1): 配置 asyncpg 连接池` → **已完成，注释过期**
- `backend/app/api/optimize.py:23` — `TODO (Sprint 4): 接入高德距离矩阵 API` → **已完成，注释过期**

只有 `chat.py:51` 的 `TODO: Sprint 6 - 改为 graph.astream()` 是真实的待办项。

---

### ⚠️ 坑8：前端命名驼峰，后端蛇形，转换有专属函数

前后端命名风格不同，数据跨越 API 边界时**必须经过转换函数**：

- `frontend/src/types/place.ts` → `parsePlaceFromAPI(raw)`
- `frontend/src/types/itinerary.ts` → `parseItineraryFromAPI(raw)`

如果你直接用后端返回的 JSON 赋给前端类型，TS 不会报错（因为是 `Record<string, unknown>` 输入），但字段会全是 `undefined`。

---

## 模块五：Day 1 行动指南 (Next Steps)

### 未完成的半成品

| 优先级 | 任务 | 状态 | 文件位置 |
|--------|------|------|----------|
| P0 | 地图 Marker ↔ 右侧面板双向联动 | 未开始 | `AMapContainer.tsx` + `PlaceList.tsx` |
| P1 | SSE 真流式：`ainvoke` → `astream` | 有 TODO 注释 | `backend/app/api/chat.py:51` |
| P1 | Optimizer 距离矩阵并发优化（>6地点变慢）| 未开始 | `backend/app/agents/nodes/optimizer.py` |
| P2 | 清理两个陈旧 TODO 注释 | 5分钟小事 | `connection.py:4`, `optimize.py:23` |

### 接手后的第一件事

**推荐从最高价值的 P0 任务开始：Marker ↔ 面板联动。**

**具体要做什么：**

1. **地图 Marker 点击 → 面板卡片高亮**

   `AMapContainer.tsx` 中 marker 的 `click` 监听器（约第 137 行）目前只打开 InfoWindow。需要额外调用 Zustand 的 `setSelectedPlaceId(place.placeId)`：

   ```typescript
   // AMapContainer.tsx，在 marker.on('click', ...) 回调中追加：
   import { useRoomStore } from '@/stores/roomStore'
   // 注意：AMapContainer 是纯 useRef 驱动，不能直接用 hook
   // 解法：props 传入 onMarkerClick 回调，或直接读 store 实例
   const store = useRoomStore.getState()
   store.setSelectedPlaceId(place.placeId)
   ```

   然后在 `PlaceList.tsx` 的 PlaceCard 渲染处，监听 `selectedPlaceId` 变化并 `scrollIntoView`。

2. **面板卡片 hover → Marker 变色**

   `PlaceCard.tsx` 的 `onMouseEnter` 触发 `setHoveredPlaceId(placeId)` 已经存在于 Zustand（`roomStore.ts`）。缺的是 `AMapContainer.tsx` 监听这个值并更新对应 Marker 样式。由于 Marker 是命令式 API，需用 `useEffect` + `markersRef` 遍历找到目标 Marker 改其 `content`。

**环境启动三步走：**

```bash
# 1. 启动基础设施（postgres + redis + y-websocket + backend）
docker-compose up -d

# 2. 启动前端（另开终端）
cd frontend && npm install && npm run dev

# 3. 验证后端
curl http://localhost:8000/health
# 期望返回：{"status":"ok","service":"agentTravel-backend"}

# 4. 打开浏览器
# 前端：http://localhost:3000
# 后端 Swagger：http://localhost:8000/docs
```

**默认配置已开启 Mock 模式**（`AMAP_MOCK=true`，`DEMO_MODE`默认关闭），不需要任何真实 API Key 即可完整演示地点推荐和排线功能。AI 对话需要配置 `.env` 中的 `ANTHROPIC_API_KEY` 或 `OPENAI_API_KEY`。

---

### 理解代码的最快路径（建议阅读顺序）

```
1. backend/app/schemas/place.py          ← 理解全局货币
2. backend/app/agents/state.py           ← 理解数据总线字段名
3. backend/app/agents/graph.py           ← 理解图的拓扑和路由
4. backend/app/agents/nodes/router.py   ← 理解意图分类逻辑
5. backend/app/api/chat.py               ← 理解 SSE 事件格式
6. frontend/src/hooks/useAIChat.ts       ← 理解前端如何消费 SSE
7. frontend/src/hooks/useYjsRoom.ts      ← 理解协同层操作接口
8. frontend/src/app/room/[roomId]/page.tsx ← 理解三层架构组装方式
```

---

*文档版本：1.0 | 生成日期：2026-04-13 | 基于 commit `4ebe51d` 全量代码审计*
