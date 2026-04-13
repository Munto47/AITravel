# MASTER_PRD.md — AI 智能旅行协同规划系统

> 本文档是项目唯一事实来源 (Single Source of Truth)。所有开发决策以此为准。

---

## 1. 核心定位 (Project Vision & Value)

**一句话定义：** 多人实时协同的 AI 旅行行程规划工具——用户在共享房间中通过 AI 对话获取地点推荐，协同筛选后一键生成最优日程路线。

**目标用户：** 2-5 人结伴出行的旅行规划者（家庭游、朋友游）。

**解决的痛点：**
1. 旅行前信息过载：客观数据（评分、地址、营业时间）分散在多个平台，主观经验（避坑、实际体验）埋在游记中，用户需要反复比对。
2. 多人意见难统一：群聊讨论效率低，无法实时可视化每个人的偏好和选择。
3. 路线规划低效：手动排线无法避免跨区奔波，缺乏交通时间估算。

**核心价值闭环：** AI 推荐地点（客观+主观融合）→ 多人实时投票筛选 → 算法自动排线 → 地图可视化行程。

---

## 2. 核心领域模型 (Domain Models)

### 2.1 Place — 全局核心货币

贯穿 LangGraph 所有节点、前端状态树、优化算法。系统中一切地点信息的标准载体。

```typescript
interface Place {
  place_id: string;           // 高德 POI ID，全局唯一标识
  name: string;
  category: "attraction" | "food" | "hotel" | "transport";
  address: string;
  coords: { lng: number; lat: number };
  city: string;
  district?: string;          // 行政区名（如"武侯区"），来自高德 adname 字段
  source: "amap_poi" | "rag" | "synthesized";

  // 高德客观数据
  amap_rating?: number;       // 0-5
  amap_price?: number;        // 人均消费（元）
  opening_hours?: string;
  phone?: string;             // 联系电话，来自高德 tel 字段
  amap_photos: string[];      // 图片 URL 列表

  // RAG 主观数据（无游记命中时为 null）
  rag_meta?: {
    tip_snippets: string[];     // 避坑/推荐语，最多 3 条
    sentiment_score: number;    // -1 ~ 1
    source_note_ids: string[];  // 可溯源游记文档 ID
  };

  // AI 生成
  description?: string;       // 一句话特点描述，20-40 字
  tags: string[];             // 适合人群/场景标签，如 ["情侣", "拍照", "亲子"]

  // Optimizer 填入（排线后才有值）
  cluster_id?: number;          // K-Means 日期簇编号
  visit_order?: number;         // 簇内 TSP 排序序号
  estimated_duration?: number;  // 建议游览时长（分钟）
}
```

### 2.2 YjsPlace — 协同扩展

前端 Yjs 共享状态中的地点对象，在 Place 基础上增加协同字段。

```typescript
interface YjsPlace extends Place {
  votedBy: string[];   // 已投票（标记"想去"）的 userId 列表
  addedBy: string;     // 首次添加该地点的 userId
  addedAt: string;     // ISO 8601，添加时间
  note: string;        // 成员备注（实时协同编辑）
  isPinned: boolean;   // 钉住，不参与 AI 过滤
}
```

### 2.3 Itinerary / DayPlan / TimeSlot — 排线输出

Optimizer 节点的最终产物，驱动前端行程详情页和地图路线绘制。

```typescript
interface Itinerary {
  itinerary_id: string;     // UUID
  thread_id: string;        // 关联的 LangGraph 会话
  city: string;             // 目的地城市
  days: DayPlan[];
  generated_at: string;     // ISO 8601
  version: number;          // 每次重新排线递增
}

interface DayPlan {
  day_index: number;              // 0-based
  date?: string;                  // ISO 8601，可选
  cluster_id: number;
  slots: TimeSlot[];
  weather_summary?: WeatherInfo;  // 和风天气填充（出发日 3 天内有效）
}

interface TimeSlot {
  place_id: string;               // 高德 POI ID
  place: Place;
  start_time: string;             // "09:00" 格式
  end_time: string;
  transport?: TransportLeg;       // 与下一地点的交通（最后一个为 null）
}

interface TransportLeg {
  mode: "driving" | "walking" | "transit";
  duration_mins: number;
  distance_km: number;
}

interface WeatherInfo {
  condition: string;     // "晴" / "多云" / "小雨"
  temp_high: number;
  temp_low: number;
  suggestion: string;    // "适合户外，建议带防晒"
}
```

### 2.4 Room — 协同房间

```typescript
interface Room {
  room_id: string;        // 6 位短码，用户可分享
  thread_id: string;      // UUID，绑定 LangGraph 会话（PostgresSaver checkpoint）
  trip_city: string;      // 目的地城市
  trip_days: number;      // 旅行天数
  phase: "exploring" | "selecting" | "optimizing" | "planned";
  created_at: string;
  updated_at: string;
}
```

### 2.5 User / RoomMember

```typescript
interface User {
  user_id: string;    // UUID
  nickname: string;
}

interface RoomMember {
  user_id: string;
  room_id: string;
  joined_at: string;
}
```

### 2.6 ChatMessage — 对话消息

```typescript
interface ChatMessage {
  messageId: string;
  threadId: string;
  role: "user" | "assistant" | "system";
  content: string;                        // 完整文本（流式时逐字追加）
  createdAt: string;                      // ISO 8601
  status: "sending" | "streaming" | "done" | "error";

  // AI 回复附加字段
  agentNode?: string;                     // 触发回复的最终节点
  placesGenerated?: Place[];              // 本轮 AI 推荐的地点列表
  thinkingSteps?: ThinkingStep[];         // Agent 思考链（面试核心亮点）
}

interface ThinkingStep {
  node: "router" | "amap_search" | "rag_retrieval" | "synthesizer" | "optimizer";
  summary: string;       // 简短说明，如 "高德搜索到 5 个地点"
  durationMs: number;    // 节点耗时（毫秒）
}
```

### 2.7 AgentState — LangGraph 内部状态

后端 LangGraph 图中所有节点共享读写的 TypedDict。

```typescript
interface AgentState {
  messages: BaseMessage[];             // LangGraph 消息序列（自动追加）
  thread_id: string;                   // 会话标识
  user_id: string;
  trip_city?: string;                  // 房间目的地城市（从 ChatRequest 传入）

  // Router 节点输出
  intent?: "rag" | "amap" | "both";
  query_rewrite?: string;              // 改写后的查询，更适合检索

  // 各检索节点输出
  amap_places: Place[];                // AmapSearch 节点输出
  rag_chunks: dict[];                  // RAGRetrieval 节点输出（{content, place_ids, note_id, similarity}）

  // Synthesizer 输出
  synthesized_places: Place[];         // 最终推荐地点列表
  final_response?: string;             // 自然语言回复文本

  // 前端传入
  selected_place_ids: string[];        // 已选地点 ID（影响推荐质量）

  // Optimizer 输出（通过 /api/optimize 独立触发）
  itinerary?: Itinerary;
}
```

---

## 3. 关键业务链路 (Critical User Journeys)

### 链路 A：AI 对话 → 协同筛选 → 智能排线 → 地图展示（主链路）

| 步骤 | 操作 | 主导端 | 数据流 |
|------|------|--------|--------|
| 1 | 用户在首页输入昵称、选择城市、设置天数，点击「创建协同房间」 | 前端 | `POST /api/room` → 创建 Room + User + RoomMember，返回 room_id |
| 2 | 前端初始化 Yjs WebSocket 连接，建立共享 YDoc | 前端 | 连接 `ws://y-websocket:1234`，初始化 room/places/chat 三个共享结构 |
| 3 | 用户在 ChatPanel 输入问题（如"成都适合带老人的景点"） | 前端 | 构造 `{message, thread_id, user_id, trip_city, selected_place_ids}` |
| 4 | `POST /api/chat` 触发 LangGraph 主图执行 | 后端 | Router 分类 intent → AmapSearch/RAGRetrieval 检索 → Synthesizer 合成 |
| 5 | 后端通过 SSE 流式推送事件：`thinking` → `place`（逐个）→ `text`（逐字符）→ `done` | 后端 | 前端 useAIChat hook 解析 SSE 事件流 |
| 6 | 前端收到 place 事件后，调用 `useYjsRoom.addPlace()` 写入 Yjs 共享 Map | 前端 | Place → YjsPlace（votedBy: [], addedBy: userId） |
| 7 | 所有房间成员通过 Yjs CRDT 实时看到新增地点，出现在右侧候选面板 | 前端 | Yjs WebSocket 广播，500ms 内同步 |
| 8 | 成员点击地点卡片心形按钮投票（toggleVote） | 前端 | YjsPlace.votedBy 数组增减 userId，实时同步 |
| 9 | 达成共识后，点击 TopNav「智能排线」按钮 | 前端 | 收集所有 votedBy.length > 0 的地点 |
| 10 | `POST /api/optimize` 发送已选地点列表和天数 | 后端 | K-Means 按经纬度聚类 → 高德距离矩阵构建时间矩阵 → 最近邻 TSP 排序 → 时间表生成 → 和风天气填充 |
| 11 | 返回 Itinerary JSON，系统直接渲染出各天不同颜色的静态重叠轨迹，并自动缩放视野 | 前端 | AMap.Driving 静默预加载所有天路径（Promise.all + 600ms 错开），一次性绘制多色 Polyline（showDir 方向箭头），setFitView 自适应全局视野；PlaceList 切换到路线 Tab |
| 12 | 用户可点击「行程详情」进入 `/room/[roomId]/itinerary` 页查看完整时间轴 | 前端 | 读取 localStorage 中缓存的 Itinerary 数据 |

### 链路 B：多人加入协同（辅助链路）

| 步骤 | 操作 | 主导端 | 数据流 |
|------|------|--------|--------|
| 1 | 房主复制房间链接/房间号分享给同伴 | 前端 | 房间号展示在 TopNav |
| 2 | 同伴在首页输入房间号和昵称，点击「加入房间」 | 前端 | `POST /api/room/{id}/join` → 创建 User + RoomMember |
| 3 | 前端连接同一 Yjs 房间，自动同步全部已有地点和投票状态 | 前端 | Yjs CRDT 合并，Awareness 协议同步在线成员列表 |
| 4 | 多人可同时操作：投票、添加备注、与 AI 对话，所有变更实时同步 | 前端 | Yjs 无锁 CRDT 保证最终一致性 |

---

## 4. 系统架构与技术栈 (Tech Stack & Architecture)

### 4.1 服务拓扑

```
浏览器 ──HTTP/SSE──→ FastAPI 后端 (:8000)
  │                      │
  │──WebSocket──→ y-websocket (:1234)    ←── Yjs CRDT 同步
  │                      │
  │                      ├──→ PostgreSQL 16 + pgvector (:5432)
  │                      │      - rooms/users/room_members 表
  │                      │      - travel_notes_chunks（RAG 向量）
  │                      │      - LangGraph checkpoints（会话持久化）
  │                      │
  │                      └──→ Redis 7 (:6379)
  │                             - 高德驾车距离缓存（TTL 24h）
  │
  └──JS SDK──→ 高德地图 AMap 2.0（地图渲染 + Driving 路线绘制）
```

### 4.2 前端

| 技术 | 用途 |
|------|------|
| Next.js 15 (App Router) | 页面路由、SSR 骨架 |
| Tailwind CSS | 样式系统（coral 色板 + 玻璃拟物态） |
| framer-motion | 入场/退场动画 |
| Zustand | 本地 UI 状态（面板开关、hover/select） |
| Yjs + y-websocket | 多人实时协同（CRDT 无锁同步） |
| @amap/amap-jsapi-loader | 高德地图 JS SDK 2.0 加载 |
| AMap.Driving 插件 | 真实驾车路线绘制 |

### 4.3 后端

| 技术 | 用途 |
|------|------|
| Python 3.11+ / FastAPI | 异步 HTTP + SSE 流式推送 |
| LangGraph | 多 Agent 状态机编排（StateGraph + 条件路由） |
| AsyncPostgresSaver | LangGraph 会话 checkpoint 持久化 |
| asyncpg | PostgreSQL 异步连接池 |
| pgvector | 游记向量检索（1536 维 embedding） |
| scikit-learn KMeans | 地点经纬度宏观聚类（分天） |
| 最近邻启发式 TSP | 簇内地点微观排序（最短路径） |
| Redis (aioredis) | 高德驾车距离缓存 |

### 4.4 外部 API

| API | 用途 | Key 类型 |
|-----|------|----------|
| 高德地图 REST API | POI 搜索、驾车距离矩阵 | 后端 Web 服务 Key (`AMAP_API_KEY`) |
| 高德地图 JS SDK | 前端地图渲染、Driving 路线 | 前端 JS API Key (`NEXT_PUBLIC_AMAP_JS_KEY`)，两个 Key 不同 |
| 和风天气 API | 目的地 3 天天气预报 | `QWEATHER_KEY` |
| Anthropic Claude API | Router 意图分类、Synthesizer 数据合成 | `ANTHROPIC_API_KEY`（优先） |
| OpenAI 兼容接口 | LLM 降级备选 + RAG Embedding | `OPENAI_API_KEY` + `OPENAI_API_URL` |

### 4.5 LLM 降级策略

每个 LLM 节点（Router / Synthesizer）按优先级尝试：
1. Anthropic Claude（`ANTHROPIC_API_KEY` 有效时）
2. OpenAI 兼容接口（SiliconFlow / OpenAI）
3. Demo 模式（`DEMO_MODE=true`，跳过所有 LLM，返回预设数据）

### 4.6 数据持久化

| 存储 | 内容 | 生命周期 |
|------|------|----------|
| PostgreSQL rooms/users/room_members | 房间和用户元数据 | 持久 |
| PostgreSQL checkpoints | LangGraph 会话状态快照（按 thread_id） | 持久，支持跨设备续航 |
| PostgreSQL travel_notes_chunks | RAG 游记分块 + pgvector embedding | 持久 |
| Redis | 高德驾车距离缓存 | TTL 24h |
| Yjs y-websocket | 房间实时协同状态（YDoc 持久化到磁盘） | 服务运行期间 |
| 前端 localStorage | Itinerary 排线结果缓存 | 浏览器本地 |

### 4.7 API 接口清单

| 方法 | 路径 | 响应方式 | 说明 |
|------|------|----------|------|
| POST | `/api/chat` | SSE 流式（thinking/place/text/done/error） | AI 对话，触发 LangGraph 主图 |
| POST | `/api/optimize` | 同步 JSON | 智能排线，返回 Itinerary |
| POST | `/api/recommend` | 同步 JSON | 城市初始推荐（按品类） |
| POST | `/api/room` | 同步 JSON | 创建房间（幂等） |
| GET | `/api/room/{id}/state` | 同步 JSON | 查询房间元数据 |
| POST | `/api/room/{id}/join` | 同步 JSON | 加入房间 |
| POST | `/api/user` | 同步 JSON | 注册/更新用户 |
| GET | `/api/user/{id}` | 同步 JSON | 查询用户 |
| GET | `/health` | 同步 JSON | 健康检查 |

### 4.8 SSE 事件协议（`/api/chat`）

所有事件统一使用 `data:` 行推送，内部 JSON 包含 `event` 和 `data` 两个字段：

```
data: {"event":"thinking","data":{"node":"router","summary":"正在分析您的需求...","ms":0}}

data: {"event":"thinking","data":{"node":"amap_search","summary":"高德搜索到 5 个地点","ms":320}}

data: {"event":"place","data":{"place":{...完整 Place JSON...}}}

data: {"event":"text","data":{"delta":"成"}}

data: {"event":"done","data":{"total_places":5,"total_ms":1840}}

data: {"event":"error","data":{"message":"..."}}
```

---

## 5. 绝对边界与非目标 (Out of Scope / Non-Goals)

以下功能在 MVP 阶段**明确不做**，任何开发决策不得引入：

| 非目标 | 理由 |
|--------|------|
| 支付系统 / 酒店预订 / 机票购买 | 本项目是规划工具，不是交易平台 |
| UGC 游记发布 / 用户评论系统 | 游记数据由离线脚本批量入库，不开放用户写入 |
| 用户注册/登录/OAuth 认证 | 仅通过昵称 + UUID 标识用户，无账号体系 |
| 房间权限控制 / 密码保护 | 知道房间号即可加入，MVP 不做访问控制 |
| 移动端原生应用 | 仅支持 Web 桌面端浏览器 |
| 移动端响应式适配 | 面试演示场景固定为桌面浏览器 |
| 国际化 (i18n) | 仅支持中文 |
| 离线模式 / PWA | 必须联网使用 |
| 多城市跨城行程 | 单次规划限定一个城市 |
| 公交/地铁精细导航 | 排线仅计算驾车模式时间，地图路线仅绘制驾车路线 |
| 小车跟随移动动画 | 当前阶段坚决不做路线动画，只渲染静态多色轨迹叠加 |
| 高并发生产部署 | 面试演示级别，不做负载均衡/水平扩展 |
| 数据分析 / 用户行为埋点 | 不做任何统计分析 |
| AI 自动生成完整行程（无人工干预） | 必须经过用户协同筛选步骤，AI 只负责推荐 |

---

*文档版本：1.1（定稿）| 最后更新：2026-04-13 | 基于 commit `4ebe51d` 全量代码审计校准*
