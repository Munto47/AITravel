# BreezeTravel 深度熟悉手册（对齐简历 · 代码锚点）

本文档按学习计划 **阶段 0→6** 组织。在 IDE 中用全局搜索符号名或 Ctrl+点击路径即可跳转。路径相对于仓库根目录 `agentTravel/`。

---

## 阶段 0：启动与配置

**对应简历**：技术栈与环境（Docker、环境变量、Demo/Mock）。

### 文件清单

| 文件 | 作用 |
|------|------|
| [CLAUDE.md](../CLAUDE.md) | 端口、命令、架构速览 |
| [backend/app/config.py](../backend/app/config.py) | `Settings`：LLM、高德、`demo_mode`、`amap_mock`、DB/Redis |
| [docker-compose.yml](../docker-compose.yml) | `postgres`（pgvector）、`redis`、`y-websocket`、`backend` |
| [backend/app/main.py](../backend/app/main.py) | `lifespan`：连接池、`init_persistent_graph` |

### 函数 / 配置阅读顺序

1. `get_settings` / `settings` — `config.py`
2. `lifespan` — `main.py`（启动 DB 池 + LangGraph checkpoint）
3. `services:` — `docker-compose.yml`（端口 5432 / 6379 / 1234 / 8000）

### 5 个常见追问

1. **Demo 模式在哪跳过 LLM？**  
   `settings.demo_mode` 为真时：`router.run`、`amap_search.run`、`rag_retrieval.run`、`synthesizer.run` 均走早退分支（例如 [router.py](../backend/app/agents/nodes/router.py) 约 61–63 行）。

2. **高德 Mock 数据从哪来？**  
   `AMAP_MOCK=true`（默认）时 [amap_search.py](../backend/app/agents/nodes/amap_search.py) `_load_mock_places` 读 `tests/fixtures/amap_mock_places.json`（`MOCK_DATA_PATH`）。

3. **后端如何连数据库？**  
   `Settings.database_url` + [db/connection.py](../backend/app/db/connection.py) `get_pool`（`main.py` lifespan 预热）。

4. **CORS 从哪读？**  
   [main.py](../backend/app/main.py) `CORSMiddleware` 使用 `settings.cors_origin_regex`。

5. **LangGraph 会话持久化何时初始化？**  
   [graph.py](../backend/app/agents/graph.py) `init_persistent_graph`（`AsyncPostgresSaver`），在 `main.py` lifespan 中调用。

---

## 阶段 1：业务闭环 — 房间、线程、Place、房间页

**对应简历**：「创建房间 → AI 推荐 → 多人选点 → 智能排线 → 行程展示」的数据主轴。

### 文件清单

| 文件 | 作用 |
|------|------|
| [backend/app/schemas/place.py](../backend/app/schemas/place.py) | `Place` 全局模型，`place_id` = 高德 POI ID |
| [backend/app/api/room.py](../backend/app/api/room.py) | 创建房间、查询 state、join |
| [frontend/src/app/room/[roomId]/page.tsx](../frontend/src/app/room/[roomId]/page.tsx) | 聚合 `useYjsRoom`、`useAIChat`、`useOptimize` |
| [frontend/src/hooks/useOptimize.ts](../frontend/src/hooks/useOptimize.ts) | `POST /api/optimize` |
| [frontend/src/app/room/[roomId]/itinerary/page.tsx](../frontend/src/app/room/[roomId]/itinerary/page.tsx) | 行程时间轴 UI |

### 函数阅读顺序（房间页）

1. `RoomPage` — 读取 `GET /api/room/{roomId}/state` 得到 `thread_id`、`trip_city`、`trip_days`（约 90–113 行）。
2. `useYjsRoom(roomId, userId, nickname)` — 协同地点与阶段。
3. `useAIChat(threadId, userId)` — SSE 聊天；`threadId` 与 Postgres checkpoint 对齐。
4. `useOptimize(threadId, roomId)` — 排线；结果可写入 `localStorage` key `itinerary_${roomId}`。
5. `initRoom({ roomId, threadId, tripCity, tripDays })` — 写入 Yjs `room` Map（见阶段 4）。
6. 推荐候选：`useEffect` 调 `POST /api/recommend` 后 `addPlace` 填充地图（约 164–199 行）。

### 5 个常见追问

1. **`thread_id` 为什么重要？**  
   LangGraph 在 [chat.py](../backend/app/api/chat.py) 里 `config = {"configurable": {"thread_id": request.thread_id}}`，与 [graph.py](../backend/app/agents/graph.py) 持久化 checkpoint 绑定同一会话。

2. **`place_id` 用谁做主键？**  
   [place.py](../backend/app/schemas/place.py) `Place.place_id` 注释：高德 POI ID，前后端与 Yjs Map 的 key 一致。

3. **创建房间写库哪些字段？**  
   [room.py](../backend/app/api/room.py) `create_room`：`rooms` 表插入 `room_id, thread_id, trip_city, trip_days, phase='exploring'`，幂等 `ON CONFLICT DO NOTHING`。

4. **`place_count` 为何后端固定 0？**  
   [room.py](../backend/app/api/room.py) `get_room_state`：`RoomStateResponse(..., place_count=0)` — 注释说明地点数量由 Yjs 维护。

5. **行程页数据从哪来？**  
   [useOptimize.ts](../frontend/src/hooks/useOptimize.ts) 成功后将 itinerary 存 `localStorage`；itinerary 页可读取展示（见该页 `useEffect` 逻辑）。

---

## 阶段 2：LangGraph 四节点与意图路由

**对应简历**：「LangGraph 4 节点」「rag / amap / both 意图路由」。

### 文件清单

| 文件 | 作用 |
|------|------|
| [backend/app/agents/graph.py](../backend/app/agents/graph.py) | `build_graph`、`_route_intent`、`_route_after_amap` |
| [backend/app/agents/state.py](../backend/app/agents/state.py) | `AgentState` TypedDict |
| [backend/app/agents/nodes/router.py](../backend/app/agents/nodes/router.py) | `run` → `intent`, `query_rewrite` |
| [backend/app/agents/nodes/amap_search.py](../backend/app/agents/nodes/amap_search.py) | `run` → `amap_places` |
| [backend/app/agents/nodes/rag_retrieval.py](../backend/app/agents/nodes/rag_retrieval.py) | `run` → `rag_chunks`（pgvector） |
| [backend/app/agents/nodes/synthesizer.py](../backend/app/agents/nodes/synthesizer.py) | `run` → `synthesized_places`, `final_response` |

### 条件边（与代码一致）

- `intent == "rag"`：`router` → `rag_retrieval` → `synthesizer`  
- `intent == "amap"`：`router` → `amap_search` → `synthesizer`  
- `intent == "both"`：`router` → `amap_search` → `rag_retrieval` → `synthesizer`  

实现：`_route_intent`（rag 走 RAG；否则先高德）、`_route_after_amap`（both 再进 RAG）。

### 5 个常见追问

1. **为何 `both` 先高德再游记？**  
   先锁定客观 POI 列表，再用 RAG 补充体验/避坑；图结构见 [graph.py](../backend/app/agents/graph.py) 文件头注释与 `_route_after_amap`。

2. **RAG 检索如何过滤城市？**  
   [rag_retrieval.py](../backend/app/agents/nodes/rag_retrieval.py) SQL `WHERE city = $2`，向量序 `embedding <=> $1`。

3. **Synthesizer 输入输出？**  
   读 `amap_places` + `rag_chunks`，产出 JSON 解析后的 `place_updates` 合并进 `Place`（`rag_meta` 等），见 `synthesizer.run`。

4. **节点失败如何降级？**  
   例如 `synthesizer` LLM 失败时返回原始 `amap_places`（约 123–129 行）；`amap_search` 真实 API 空结果则 `_load_mock_places`。

5. **Optimizer 在图里吗？**  
   不在。主图在 `synthesizer` 后 `END`；优化由 [optimize.py](../backend/app/api/optimize.py) 直接调 `optimizer.run`。

---

## 阶段 3：SSE 节点级流式

**对应简历**：「SSE 节点级流式返回」。

### 文件清单

| 文件 | 作用 |
|------|------|
| [backend/app/api/chat.py](../backend/app/api/chat.py) | `_event_stream`、`chat`；`graph.astream` |
| [frontend/src/hooks/useAIChat.ts](../frontend/src/hooks/useAIChat.ts) | `fetch` + `ReadableStream` 解析 `data:` 帧 |
| [frontend/src/components/chat/ChatPanel.tsx](../frontend/src/components/chat/ChatPanel.tsx) | 消息列表与发送 |
| [frontend/src/components/chat/ThinkingSteps.tsx](../frontend/src/components/chat/ThinkingSteps.tsx) | `NODE_CONFIG` 映射 LangGraph 节点名到 UI 标签 |

### 事件流（服务端）

`_event_stream`：对每个 `chunk` 键 `router` / `amap_search` / `rag_retrieval` / `synthesizer` 发送 `thinking`；`synthesizer` 完成后逐条 `place`，再逐字符 `text`，最后 `done`。

### 5 个常见追问

1. **“节点级”和 token 级区别？**  
   Thinking 事件在每个 LangGraph 节点完成时发出；正文是合成后对 `final_response` 按字符循环 yield（[chat.py](../backend/app/api/chat.py) 约 84–90 行），不是 LLM token 流。

2. **前端如何更新思考链？**  
   [useAIChat.ts](../frontend/src/hooks/useAIChat.ts) `event === 'thinking'` 时往 `thinkingSteps` 追加 `ThinkingStep`。

3. **SSE 帧格式？**  
   `data: {json}\n\n`，JSON 内含 `event` / `data`。

4. **Router 前就 yield 了什么？**  
   `_thinking("router", "正在分析您的需求...", 0)` 在 `astream` 之前（约 46–47 行），提升首屏反馈。

5. **`ThinkingSteps` 里 `optimizer` 配置有用吗？**  
   主聊天流不跑 optimizer 节点；配置预留展示一致性（[ThinkingSteps.tsx](../frontend/src/components/chat/ThinkingSteps.tsx) `NODE_CONFIG`）。

---

## 阶段 4：Yjs 多人协同

**对应简历**：「Yjs + y-websocket」「投票、备注、阶段、在线状态」。

### 文件清单

| 文件 | 作用 |
|------|------|
| [frontend/src/hooks/useYjsRoom.ts](../frontend/src/hooks/useYjsRoom.ts) | `WebsocketProvider`、`getMap('places'|'room')`、`awareness` |
| [frontend/src/types/room.ts](../frontend/src/types/room.ts) | `YjsPlace`、`YjsRoomMeta`、`RoomPhase`、结构说明注释 |

### 函数阅读顺序

1. `useYjsRoom` 内 `useEffect`：创建 `Y.Doc`，`getMap('places')` / `getMap('room')`，`new WebsocketProvider(Y_WEBSOCKET_URL, roomId, doc)`。
2. `provider.awareness.setLocalStateField('user', {...})` + `getStates` → `members`。
3. `addPlace` / `toggleVote` / `updateNote` / `setPhase` / `initRoom` — 均在 `doc.transact` 中更新共享 Map。
4. `placesMap.observe` / `roomMeta.observe` → React `setState`。

### 面试诚实项

- [room.ts](../frontend/src/types/room.ts) 注释提到 `doc.getArray('chat')`；当前实现未在 `useYjsRoom` 挂载 Yjs 聊天数组。对话由 [useAIChat.ts](../frontend/src/hooks/useAIChat.ts) 走 HTTP SSE，状态在 React。可答：协同编辑用 CRDT；聊天若要做跨标签页一致可再接 `Y.Array`。

### 5 个常见追问

1. **房间 ID 与 Yjs room name？**  
   `WebsocketProvider(..., roomId, doc)` — 同一 `roomId` 即同一协同文档。

2. **投票数据结构？**  
   `YjsPlace.votedBy: string[]`，`toggleVote` 按 `userId` 增删。

3. **阶段冲突如何避免覆盖？**  
   `initRoom` 若已有 `phase` 则跳过写入（[useYjsRoom.ts](../frontend/src/hooks/useYjsRoom.ts) 约 128–131 行）。

4. **在线成员从哪来？**  
   y-websocket 的 **Awareness** 协议，非 Postgres `room_members`（后者为持久化补充，见 [room.py](../backend/app/api/room.py) `get_room_members`）。

5. **Docker 里协同服务？**  
   [docker-compose.yml](../docker-compose.yml) `y-websocket` 服务，端口 **1234**，持久化卷 `YPERSISTENCE=/data`。

---

## 阶段 5：路线优化 K-Means + TSP

**对应简历**：「K-Means + 空簇修复 + 溢出重分配 + 最近邻 TSP」。

### 文件清单

| 文件 | 作用 |
|------|------|
| [backend/app/api/optimize.py](../backend/app/api/optimize.py) | `POST /optimize` → `optimizer_run` |
| [backend/app/agents/nodes/optimizer.py](../backend/app/agents/nodes/optimizer.py) | `_kmeans_cluster`、`_nearest_neighbor_tsp`、`_build_time_matrix`、`run` |

### 函数阅读顺序

1. `optimize`（API）— 校验 `places` 非空，聚合 `total_distance_km`。
2. `run` — 分离酒店与游玩点；对 activities `_kmeans_cluster`；按簇 `_build_time_matrix` → `_nearest_neighbor_tsp` → `_generate_time_slots`；可选酒店挂载 `_match_hotel`。
3. `_kmeans_cluster` — sklearn `KMeans`；**空簇**从最大簇捐点；**溢出**按 `cap_max` 迭代迁出最远点。
4. `_nearest_neighbor_tsp` — 基于 `time_matrix` 最近邻贪心；写 `visit_order`。
5. `_generate_time_slots` — 从 09:00 起累加停留与 `transport`。

### 5 个常见追问

1. **为何聚类用平面距离？**  
   `_dist2d` 注释：簇内比较用欧氏近似即可（[optimizer.py](../backend/app/agents/nodes/optimizer.py)）。

2. **真实路网何时用？**  
   `_fetch_amap_driving` / `_get_driving_cached`；小规模或失败时 `_estimate_driving` 直线 × 系数。

3. **Redis 作用？**  
   `_get_driving_cached` 对驾车时间做缓存（见文件前部 `_get_redis`）。

4. **酒店怎么进日程？**  
   `run` 里 `_match_hotel`：每天游玩结束后锚定最近酒店，并追加 `TimeSlot`。

5. **优化器与 LangGraph 状态？**  
   独立异步函数 `run`，不写入 `AgentState` 的主图路径；返回 `Itinerary` Pydantic 模型。

---

## 阶段 6：测试与 Docker 口径

**对应简历**：「16+ 单元测试」「Docker Compose 编排」。

### 测试文件与规模

| 文件 | 大致用例数（`def test_`） | 侧重点 |
|------|---------------------------|--------|
| [backend/tests/test_optimizer.py](../backend/tests/test_optimizer.py) | 22 | Haversine、聚类、TSP、时段、API 层 |
| [backend/tests/test_api.py](../backend/tests/test_api.py) | 17 | health、room、chat SSE、optimize |
| [backend/tests/test_mock_data.py](../backend/tests/test_mock_data.py) | 13 | fixture JSON 契约、城市覆盖 |

合计 **52** 个用例函数（简历写「16+」仍成立；面试可说分层覆盖、核心算法单测 + API 集成）。

### 5 个常见追问

1. **如何断言 SSE？**  
   [test_api.py](../backend/tests/test_api.py) 读取流式 body，断言含 `thinking` / `place` / `done` 等子串或事件。

2. **Mock 数据测试保证什么？**  
   [test_mock_data.py](../backend/tests/test_mock_data.py) 保证 `amap_mock_places.json` 字段、城市、POI ID 唯一性等。

3. **Optimizer 边界样例？**  
   单点、地点少于天数、空 places 返回 400 等见 `test_optimizer` / `test_api`。

4. **CI 怎么跑？**  
   在项目根执行 `pytest backend/tests`（需在 `backend` 环境安装依赖）；Compose 用于本地/演示全栈。

5. **为何单测不默认起 Docker？**  
   API 测试多用 `TestClient` 与 mock（见 `test_api.py` 顶部 fixture）；集成测试可按需扩展。

---

## 附录：主路径速查符号表

| 符号 | 文件 |
|------|------|
| `build_graph`, `_route_intent`, `_route_after_amap` | `backend/app/agents/graph.py` |
| `AgentState` | `backend/app/agents/state.py` |
| `router.run`, `amap_search.run`, `rag_retrieval.run`, `synthesizer.run` | `backend/app/agents/nodes/*.py` |
| `_event_stream`, `chat` | `backend/app/api/chat.py` |
| `useYjsRoom`, `initRoom`, `toggleVote` | `frontend/src/hooks/useYjsRoom.ts` |
| `sendMessage`（SSE 解析） | `frontend/src/hooks/useAIChat.ts` |
| `optimize`（hook） | `frontend/src/hooks/useOptimize.ts` |
| `optimizer.run`, `_kmeans_cluster`, `_nearest_neighbor_tsp` | `backend/app/agents/nodes/optimizer.py` |

---

*文档生成自仓库当前实现；阅读代码时以各文件为准。*
