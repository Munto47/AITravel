🗺️ AI 智能旅行协同规划系统 (Project Vibe)

版本: 1.0 - 面试亮点击破版
核心定位: 解决旅行前信息过载、排雷耗时以及多人出行意见难统一的痛点，提供"开箱即用、多人协同"的智能行程生成工具。

1. 技术栈选型 (Tech Stack)

前端: Next.js 14 (App Router) + Tailwind CSS + shadcn/ui + Zustand + Yjs (WebSocket 多人协同状态同步)。

后端: Python 3.11+ + FastAPI (异步非阻塞) + Redis (API 缓存 + WebSocket 会话)。

AI 编排: LangGraph (构建多 Agent 状态机与持久化)。

数据库: PostgreSQL + pgvector (存储 RAG 游记和 LangGraph 会话状态)。

外部 API:
- 高德地图开放平台 (POI 搜索、距离矩阵) —— 唯一的客观事实标准 (Source of Truth)。
  注意：后端 REST Key 与前端 JS SDK Key 是两个不同的 Key，分别配置。
- 和风天气 API (目的地天气预报)。

基础设施: Docker Compose (一键启动 postgres + redis + y-websocket + backend 四个服务)。

开发工具链: Claude Code + MCP (Model Context Protocol) + 本地 Agent Skills (.claude/skills)。

2. 核心架构与决议 (Core Architecture)

2.1 状态管理与多人协同 (Multiplayer Co-planning)

前端主导策略: 引入类似"共享购物车"的概念。用户在前端房间内的勾选、删除操作通过 Yjs + WebSocket 实时同步，形成一个统一的 JSON 树。

Yjs 服务端: 使用 y-websocket 官方 Docker 镜像（端口 1234），MVP 阶段足够，生产可升级至 Hocuspocus。

按需计算: 只有当房间内用户达成共识，点击"智能排线"或向 AI 发起对话时，前端才会将当前的状态快照 (State Snapshot) 提交给后端 LangGraph，避免频繁的高并发后端调用。

Yjs YDoc 结构:
- doc.getMap('room')      → 房间元数据 {roomId, threadId, phase, tripCity, tripDays}
- doc.getMap('places')    → Map<placeId, YjsPlace>（含 votedBy, note, isPinned）
- doc.getArray('chat')    → ChatMessage[]（只追加）

2.2 LangGraph 多智能体工作流 (Multi-Agent Workflow)

系统后端由 LangGraph 驱动，包含以下核心节点：

Router 节点 (意图分发): 接收用户 Query，调用 Claude Haiku 分类（轻量快速）。
- 主观/体验类需求 (如"带老人避坑") -> 路由至 RAG 检索节点 (intent="rag")
- 客观/属性类需求 (如"找个附近的火锅") -> 路由至高德 API 检索节点 (intent="amap")
- 两者都需要 -> intent="both"，先走 amap 再走 rag

Synthesizer 节点 (信息合成): 整合 RAG 与高德 API 的数据，统一转化为标准化的 Place 对象返回给前端。

Optimizer 节点 (路线优化): 接收前端传来的已选地点列表，执行"先聚类、后排线"算法。
此节点不在主 chat 图中，通过 POST /api/optimize 独立触发。

流式响应: /api/chat 使用 SSE (Server-Sent Events) 推送节点执行事件：
  thinking（节点状态）→ place（逐个推送地点）→ text（逐 token 文字）→ done

2.3 路线规划算法 (Routing Strategy: Cluster-then-Route)

为解决高德距离矩阵 API 的调用成本和算力瓶颈，采用混合算法：

宏观聚类: 使用 sklearn.cluster.KMeans 基于经纬度将地点划分为"每日游玩簇"，避免同一天跨区奔波。

微观排线: 针对每日簇内部的地点，执行最近邻启发式 TSP（Nearest Neighbor Heuristic）。
Sprint 4 中接入高德距离矩阵 API 获取真实驾车时间（结果 Redis 缓存 24h）。

演示效果可量化: "优化后总通勤时间减少约 50%（142 分钟 vs 287 分钟）"

2.4 会话持久化 (Memory & Checkpointing)

机制: 引入 LangGraph 原生的 AsyncPostgresSaver。

标识: 每个协同房间生成一个唯一的 thread_id (UUID)。所有 AI 对话和排线请求均携带此 ID，确保即便用户关闭浏览器，AI 依然保有完整的历史上下文（包括 Agent 内部状态，不只是消息记录）。

3. 核心数据契约 (Data Contracts)

3.1 Place 对象（系统全局货币）

贯穿 LangGraph 三个节点和前端状态树：

```
Place {
  place_id:           str          # 高德 POI ID（全局唯一）
  name:               str
  category:           "attraction"|"food"|"hotel"|"transport"
  address:            str
  coords:             {lng, lat}
  city:               str
  source:             "amap_poi"|"rag"|"synthesized"

  # 高德客观数据
  amap_rating:        float?       # 0-5
  amap_price:         float?       # 人均（元）
  opening_hours:      str?
  amap_photos:        list[str]    # 图片 URL

  # RAG 主观数据（无游记命中则为 null）
  rag_meta: {
    tip_snippets:     list[str]    # 避坑/推荐语，最多3条
    sentiment_score:  float        # -1 ~ 1
    source_note_ids:  list[str]    # 可溯源游记文档 ID
  }?

  # Optimizer 填入
  cluster_id:         int?         # K-Means 日期簇
  visit_order:        int?         # 簇内 TSP 排序序号
  estimated_duration: int?         # 建议游览时长（分钟）
}
```

3.2 Yjs 共享状态（YjsPlace）

在 Place 基础上增加协同字段：
- votedBy: list[userId]   # 勾选该地点的成员列表
- addedBy: userId          # 首次添加者
- note: str                # 成员备注（实时协同编辑）

3.3 API 接口

- POST /api/chat        → SSE 流式响应（events: thinking|place|text|done）
- POST /api/optimize    → JSON（返回完整 Itinerary）
- POST /api/room        → 创建房间（存储 room_id + thread_id 映射）
- GET  /api/room/{id}/state → 获取房间元数据

3.4 Itinerary 结构

Itinerary → days: DayPlan[]
DayPlan   → {dayIndex, clusterId, slots: TimeSlot[], weatherSummary?}
TimeSlot  → {place, startTime, endTime, transport: {mode, durationMins, distanceKm}}

4. Vibecoding 实施路径 (Execution Plan)

Sprint 0: 基础设施（Day 1，3h）
  目标: docker-compose up 一键启动所有服务
  任务: 创建 monorepo 目录结构、docker-compose.yml（postgres+redis+y-websocket+backend）
       后端 FastAPI 骨架、前端 Next.js 骨架、.env.example

Sprint 1: LangGraph 骨架 + Router 节点（Day 1-2，5h）
  目标: LangGraph 图跑通，意图分类准确（rag/amap/both）
  任务: AgentState、graph.py、Router 节点（真实 LLM 调用）、PostgresSaver、/api/chat 同步版

Sprint 2: 高德 API + Synthesizer（Day 2-3，4h）
  目标: 客观搜索闭环，返回标准化 Place 对象
  任务: AmapSearch 节点、AMAP_MOCK 模式、Synthesizer 节点（初版）

Sprint 3: RAG 管道（Day 3-4，6h）
  目标: 游记入库，RAG 检索可用，Place 携带主观避坑信息
  任务: LLM 生成80篇游记（北京/上海/成都/厦门各20篇）、pgvector 入库
       Entity Linking（地名→POI ID）、RAGRetrieval 节点、升级 Synthesizer

Sprint 4: Optimizer + 排线 API（Day 4-5，5h）
  目标: K-Means + 高德距离矩阵 + TSP 完整跑通
  任务: K-Means 聚类、高德距离矩阵 API + Redis 缓存、TSP 最近邻算法
       /api/optimize 端点、和风天气集成

Sprint 5: 前端核心页面 + Yjs 协同（Day 5-7，8h）
  目标: 协同工作台可用，两窗口 500ms 内实时同步
  任务: useYjsRoom Hook、PlaceCard（votedBy 徽章）、ChatPanel、在线成员头像

Sprint 6: 流式响应 + 高德地图（Day 7-8，6h）
  目标: AI 流式输出，地图可视化行程路线
  任务: SSE 流式响应（后端）、useAIChat SSE 消费、ThinkingSteps 组件
       AMapContainer（@amap/amap-jsapi-loader）、Marker + Polyline + InfoWindow

Sprint 7: 打磨 + Demo 准备（Day 9-10，4h）
  目标: Demo 场景完整可跑，文档就绪
  任务: 错误处理、Skeleton 骨架屏、预置 Demo 数据（成都3天10个地点）
       DEMO_MODE 开关、README、docker-compose --build 全流程验收

5. 面试演示场景 (Demo Scenarios)

Scene 1: 意图路由可视化（3分钟）
  输入: "成都有哪些适合带老人去的景点，听说春熙路很乱要注意？"
  展示: ThinkingSteps 侧栏逐步亮起 Router→RAG→高德→Synthesizer，地点卡片先于文字出现
  话术: "LangGraph 状态机精确控制信息流向，主观经验来自 RAG（可溯源），客观数据来自高德 API"

Scene 2: 实时多人协同选点（2分钟）
  操作: 两浏览器窗口打开同一房间，互相勾选/取消地点
  展示: 成员徽章实时出现，CRDT 无冲突
  话术: "Yjs CRDT 在前端解决一致性，后端只接收一次状态快照——成本和体验双重优化"

Scene 3: K-Means + TSP 路线优化对比（2分钟）
  操作: 9个散布全成都的地点，点击"智能排线（3天）"
  展示: 优化前 vs 优化后（3色簇+不跨区），"通勤时间减少 51%"
  话术: "K-Means 解决宏观不跨区问题，TSP + 高德真实驾车时间解决微观最短路径"

Scene 4: 会话持久化跨设备续航（1分钟）
  操作: 对话选地点后关闭浏览器，重新打开，继续追问
  展示: 历史完整，AI 引用前一轮上下文
  话术: "LangGraph PostgresSaver 保存完整 Agent 状态快照，不只是聊天记录"
