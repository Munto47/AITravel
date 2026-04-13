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
      ↓ SSE 事件流（真流式）：thinking → place（逐个推送） → text（逐字符） → done
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
| 天气 | 和风天气 v7 + GeoAPI v2 | JWT 认证（Ed25519），GeoAPI 动态城市名→LocationID，支持全国 |

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
│   │       └── optimizer.py  ← 排线引擎（K-Means+TSP），独立于主图
│   ├── api/
│   │   ├── chat.py           ← SSE 端点，graph.astream() 真流式推送
│   │   ├── optimize.py       ← 排线端点
│   │   ├── recommend.py      ← 城市初始推荐（Mock/真实双模式）
│   │   ├── weather.py        ← 天气端点（JWT + GeoAPI，全国任意城市）
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
│   │   ├── page.tsx          ← 首页（创建/加入房间，城市选择器待改为自由输入）
│   │   ├── room/[roomId]/page.tsx       ← 房间主页（三层架构）
│   │   └── room/[roomId]/itinerary/page.tsx ← 行程详情
│   ├── components/
│   │   ├── map/AMapContainer.tsx        ← 地图组件（Geocoder动态定位，Marker双向联动）
│   │   ├── chat/{ChatPanel,MessageItem,ThinkingSteps}.tsx
│   │   ├── places/{PlaceList,PlaceCard}.tsx
│   │   └── layout/TopNav.tsx
│   ├── hooks/
│   │   ├── useYjsRoom.ts     ← Yjs协同核心（217行），理解这个=理解协同层
│   │   ├── useAIChat.ts      ← SSE流式解析（Reader+TextDecoder+帧分割）
│   │   └── useOptimize.ts    ← 排线请求 + localStorage持久化
│   ├── stores/roomStore.ts   ← Zustand UI状态（isChatOpen/rightTab/hoveredId/selectedId）
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

【后端 LangGraph 处理 — 真流式 astream()】
  AgentState（数据总线）在节点间传递：
  Router写入 intent + query_rewrite
    → AmapSearch读取query_rewrite，写入amap_places（Place[]）
    → RAGRetrieval读取query_rewrite，写入rag_chunks（dict[]）
    → Synthesizer读取amap_places+rag_chunks，写入synthesized_places+final_response
  每个节点完成时立即 yield SSE 事件（不等待整图执行完毕）

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
    → 排线完成自动切换右侧面板到"已排路线" Tab
```

---

## 模块三：当前"国情"与核心资产 (State of the Union)

### 已跑通的闭环（100% 可用）

- **完整 AI 对话链路**：Router 意图分类 → 高德 POI 搜索（AMAP_MOCK=false 时真实调用）→ pgvector RAG 检索 → LLM 合成 → SSE **真流式**推送（`graph.astream()`，节点级实时输出）
- **Yjs 多人实时协同**：addPlace / toggleVote / updateNote / setPhase，Awareness 在线成员，500ms 内跨标签页同步
- **K-Means + TSP 排线**：含真实高德驾车距离矩阵（API + Redis缓存 24h）+ 最近邻 TSP + 时间表，Semaphore(3) 并发控制
- **地图路线可视化**：AMap.Driving 真实道路轨迹，每天一色，静态叠加，setFitView 自适应；Geocoder 动态城市定位（无硬编码坐标表）
- **地图 ↔ 面板双向联动**：Marker 点击 → 右侧面板滚动高亮；面板卡片 hover → 地图 Marker 放大加深
- **LangGraph 会话持久化**：AsyncPostgresSaver 检查点，关闭浏览器重开后 AI 保有完整上下文
- **天气感知**：和风天气 JWT 认证（Ed25519，无 Host 白名单限制）+ GeoAPI 动态城市名→LocationID，天气条显示在 AI 聊天面板顶部
- **三级降级保障**：`DEMO_MODE=true`（跳过LLM）+ `AMAP_MOCK=true`（本地fixture）+ LLM 降级链

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

### ⚠️ 坑1：高德地图需要两个不同的 Key，类型不同

| Key | 用途 | 配置位置 |
|-----|------|----------|
| `AMAP_API_KEY` | 后端 REST API（POI 搜索/驾车距离矩阵） | `.env`，Web服务类型 |
| `NEXT_PUBLIC_AMAP_JS_KEY` | 前端 JS SDK（地图渲染/Driving路线）| `frontend/.env.local`，Web端(JS API)类型 |

两个 Key 在高德开放平台是**不同的应用类型**，互相不可替代。此外还需要安全密钥 `NEXT_PUBLIC_AMAP_SECURITY_CODE`（`_AMapSecurityConfig`）。

---

### ⚠️ 坑2：AMap.Driving 路线绘制有 QPS 限制，必须错开请求

`AMapContainer.tsx` 用 `setTimeout(dayIdx * 600)` 故意错开每天的驾车路线请求。如果你改成并发（Promise.all 直接搜索），高德会因为 QPS 超限返回失败，路线不显示。**不要去掉这个 delay。**

---

### ⚠️ 坑3：LangGraph AgentState 的字段名和直觉不符

新人最容易写错的字段：

| 直觉写法（错的） | 实际字段名（正确） |
|-----------------|-------------------|
| `state.city` | `state.trip_city` |
| `state.final_places` | `state.synthesized_places` |
| `state.rag_snippets` | `state.rag_chunks` |
| `state.response_text` | `state.final_response` |

全局唯一真相：`backend/app/agents/state.py`。

---

### ⚠️ 坑4：Yjs 的三个共享结构职责严格分离，不要混写

```
doc.getMap('room')    → 房间元数据（roomId/threadId/phase/tripCity/tripDays）
doc.getMap('places')  → Place 列表（key=placeId, value=YjsPlace）
doc.getArray('chat')  → 聊天消息（只追加，不改不删）
```

Zustand `roomStore` 只管纯 UI 状态（面板开关、高亮 ID 等），**绝不**放入需要多人同步的数据。如果你不确定某个状态放 Yjs 还是 Zustand，规则是：**跨用户共享的放 Yjs，只影响当前用户 UI 的放 Zustand。**

---

### ⚠️ 坑5：Optimizer 的 K-Means 簇数不能超过地点数

`optimizer.py` 做了保护处理，但上层调用时需注意：如果 `trip_days=3` 但只有 2 个地点，K-Means 会退化。TopNav 排线按钮设了最低 2 个地点的校验，同时有品类完整性检查（需有景点/美食/住宿各至少 1 个）。

---

### ⚠️ 坑6：前端命名驼峰，后端蛇形，转换有专属函数

前后端命名风格不同，数据跨越 API 边界时**必须经过转换函数**：

- `frontend/src/types/place.ts` → `parsePlaceFromAPI(raw)`
- `frontend/src/types/itinerary.ts` → `parseItineraryFromAPI(raw)`

如果你直接用后端返回的 JSON 赋给前端类型，TS 不会报错（因为是 `Record<string, unknown>` 输入），但字段会全是 `undefined`。

---

### ⚠️ 坑7：`docker-compose restart` 不重新读取 `.env`

修改 `.env` 后，必须用 `docker-compose up -d --force-recreate backend` 才能让新环境变量生效。`restart` 只重启进程，不重新加载宿主机的 `.env`。

---

### ⚠️ 坑8：和风天气 JWT 需要项目专属 API Host

和风天气 JWT 认证不使用 `devapi.qweather.com`（旧版共享域名），而是在控制台「项目管理」页面分配的专属 API Host（格式 `xxxxxxxx.re.qweatherapi.com`）。配置在 `.env` 的 `QWEATHER_API_HOST`。JWT Token 在 `weather.py` 中自动生成并缓存 15 分钟（提前 60s 刷新），私钥存在 `.env` 的 `QWEATHER_PRIVATE_KEY`（仅 base64 正文，不含 PEM 头尾）。

---

### ⚠️ 坑9：AMAP_MOCK=true 时未知城市回落成都数据

`recommend.py` 的 `_load_mock_places(city)` 在找不到城市时会回落到成都 fixture 数据（`mock_data.get(city, mock_data.get("成都", []))`）。这在 Mock 模式下对非 fixture 城市表现为"显示成都地点"——下一步要修复此行为，改为 Mock 失败时调用真实高德 API，详见模块五。

---

## 模块五：下一步开发计划 — 全国任意城市 (Next Sprint)

**目标**：用户在首页可输入任意中国城市（如"大理"、"敦煌"、"景德镇"），系统全链路正确处理该城市的 AI 推荐、地图定位、天气预报、智能排线。

### 残留硬编码清单（需逐一消除）

| 位置 | 硬编码内容 | 影响 | 优先级 |
|------|-----------|------|--------|
| `frontend/src/app/page.tsx:240-243` | 城市选择器仅 4 个 `<option>` | 用户无法输入新城市 | **P0** |
| `backend/app/agents/nodes/amap_search.py:110` | `known_cities` 列表（9城市关键词匹配兜底） | 聊天中提及其他城市会被忽略 | P1 |
| `backend/app/api/recommend.py:124` | Mock 未知城市回落成都数据 | AMAP_MOCK=true 时其他城市显示成都地点 | P1 |

天气（`weather.py`）和地图定位（`AMapContainer.tsx` Geocoder）已完全解除硬编码，全国可用。

---

### 各模块改造方案

#### P0 — 前端城市选择器（`frontend/src/app/page.tsx`）

将 4 选项的 `<select>` 改为带热门推荐的**自由文本输入框**：

```tsx
// 改造目标：文本输入 + 热门城市快捷标签
<input
  type="text"
  value={city}
  onChange={(e) => setCity(e.target.value)}
  placeholder="输入目的地城市，如成都、大理、敦煌..."
  className="input-glass text-sm w-full"
/>
{/* 热门城市快捷标签 */}
<div className="flex gap-1.5 flex-wrap mt-1.5">
  {['成都', '北京', '大理', '厦门', '三亚', '西藏'].map(c => (
    <button key={c} onClick={() => setCity(c)}
      className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 hover:bg-coral-50 text-gray-500 hover:text-coral-600">
      {c}
    </button>
  ))}
</div>
```

#### P1 — AI 城市识别兜底（`amap_search.py:110`）

删除 `known_cities` 列表，改为仅依赖 `trip_city`（已从房间元数据传入，最可靠）：

```python
def _extract_city(state: AgentState) -> str:
    return state.get("trip_city") or "成都"
```

#### P1 — Mock 模式未知城市降级（`recommend.py`）

当 Mock 数据中找不到城市时，自动尝试调用真实高德 API（而非回落成都数据）：

```python
def _load_mock_places(city: str) -> list[Place]:
    ...
    city_places = mock_data.get(city)
    if city_places is None:
        return []   # 返回空，让上层逻辑走真实 API

# recommend 端点逻辑调整：
if settings.amap_mock and places:   # Mock 有数据才用 Mock
    return RecommendResponse(city=city, places=places)
# Mock 无数据 → 走真实高德 API
```

---

### 开发顺序建议

```
1. page.tsx        城市输入框（30分钟，纯前端）
2. amap_search.py  删除 known_cities 列表（5分钟）
3. recommend.py    Mock 降级修复（1小时，需测试真实 API 路径）
4. 全链路测试      用"大理"/"敦煌"/"景德镇"跑完整流程
```

---

### 完成标准（Definition of Done）

- [ ] 首页城市输入框接受任意文本，有热门城市快捷标签
- [ ] 输入"大理"创建房间，地图中心自动定位大理（Geocoder）
- [ ] 天气条显示大理真实天气（和风 GeoAPI + JWT）
- [ ] AI 推荐返回大理相关地点（`AMAP_MOCK=false` + 真实高德 API）
- [ ] 排线生成正确的大理行程（坐标来自高德 POI，Optimizer 算法城市无关）

---

## 模块六：环境启动与验证

### 三步启动

```bash
# 1. 启动基础设施（postgres + redis + y-websocket + backend）
docker-compose up -d --build

# 2. 启动前端（另开终端）
cd frontend && npm install && npm run dev

# 3. 验证后端
curl http://localhost:8000/health
# 期望：{"status":"ok","service":"agentTravel-backend"}

# 4. 打开浏览器
# 前端：http://localhost:3000
# 后端 Swagger：http://localhost:8000/docs
```

> **注意**：修改 `.env` 后必须用 `docker-compose up -d --force-recreate backend`，不能用 `restart`。

### 理解代码的最快路径（建议阅读顺序）

```
1. backend/app/schemas/place.py          ← 理解全局货币
2. backend/app/agents/state.py           ← 理解数据总线字段名
3. backend/app/agents/graph.py           ← 理解图的拓扑和路由
4. backend/app/agents/nodes/router.py   ← 理解意图分类逻辑
5. backend/app/api/chat.py               ← 理解 SSE 真流式实现（astream）
6. frontend/src/hooks/useAIChat.ts       ← 理解前端如何消费 SSE
7. frontend/src/hooks/useYjsRoom.ts      ← 理解协同层操作接口
8. frontend/src/app/room/[roomId]/page.tsx ← 理解三层架构组装方式
```

---

*文档版本：2.0 | 更新日期：2026-04-13 | 基于最新 commit `4cd5ed8` 全量同步*
*主要变更：SSE 改为真流式 / Marker 双向联动完成 / 天气 JWT 认证 / 全国城市计划纳入*
