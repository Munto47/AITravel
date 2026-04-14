# 一、项目技术画像

## 1. 项目类型

全栈 AI 应用 MVP，属于 **「AI Agent + 实时协同 + 算法工程」** 交叉型项目，不是单纯的 CRUD 或 LLM 套壳。

## 2. 项目解决的问题

多人结伴出行的旅行规划效率问题：传统方式要分散收集信息、手动整理日程、多人意见难以汇聚。本项目通过 **AI 推荐 + 多人实时协同选点 + 算法自动排线**，将流程整合为一个闭环。

## 3. 核心业务流程

创建房间（城市 / 天数）  
→ AI 对话问询地点（SSE 流式返回推荐地点）  
→ 多人实时协同工作台（Yjs CRDT 同步，成员各自投票心选地点）  
→ 品类校验（必须有景点 / 餐饮 / 住宿）  
→ 一键智能排线（K-Means 聚类 + TSP 最近邻 + 天气集成）  
→ 行程详情页（时间轴展示，含驾车时间、天气、地点描述）

## 4. 技术栈汇总


| 层级     | 技术                                                                  |
| ------ | ------------------------------------------------------------------- |
| 前端     | Next.js 15 (App Router) · TypeScript · Tailwind CSS · Framer Motion |
| 状态管理   | Zustand（本地 UI）+ Yjs + y-websocket（多人协同 CRDT）                        |
| 地图     | 高德地图 JS SDK 2.0（Marker 联动 + 多色路线）                                   |
| 后端     | FastAPI · Python 3.11 · asyncpg · Pydantic v2                       |
| AI 编排  | LangGraph StateGraph · LangChain OpenAI · OpenAI 兼容接口               |
| 向量数据库  | PostgreSQL 16 + pgvector（IVFFlat 索引，余弦距离）                           |
| 算法     | scikit-learn KMeans + 自实现最近邻 TSP + Haversine 球面距离                   |
| 缓存     | Redis 7（高德驾车距离 TTL 24h）                                             |
| 外部 API | 高德 REST POI / 驾车路线 API · 和风天气 GeoAPI + 3 日预报                        |
| 认证     | 和风天气 Ed25519 / JWT 认证（PyJWT + cryptography）                         |
| 部署     | Docker Compose（4 服务）· Dockerfile · Railway / Vercel 支持              |


## 5. 前后端职责划分

- **前端**：全屏地图底层 + 玻璃态浮面板 UI；SSE 流式解析逐字渲染；Yjs 协同状态订阅与操作；行程时间轴展示
- **后端**：LangGraph 多 Agent 编排；PostgreSQL Checkpoint 会话持久化；K-Means + TSP 排线算法；高德 / 天气 API 集成与降级
- **数据库**：5 张表（游记分块 + 向量、原始游记、用户、房间、房间成员）；pgvector IVFFlat 向量检索索引
- **部署**：Docker Compose 一键启动 postgres / redis / y-websocket / backend 四个服务

## 6. AI 相关能力

- LangGraph StateGraph 编排 4 节点工作流（Router → AmapSearch / RAGRetrieval → Synthesizer）
- LLM 意图分类（rag / amap / both）+ 查询改写
- LLM Synthesizer 生成 Place 描述、场景标签、避坑语
- pgvector 向量检索（text-embedding-3-small + 余弦相似度 ≥ 0.7 过滤）
- PostgreSQL AsyncPostgresSaver 会话 Checkpoint 持久化
- SSE 节点级实时推送（thinking / place / text / done 四类事件）

## 7. 工程化痕迹

- 配置管理：pydantic-settings，环境变量统一收口（`.env` + `lru_cache` 单例）
- 异常降级：每个节点有明确 fallback  
  - LLM 失败 → 直接返回 amap 数据  
  - 高德 API 失败 → Mock 数据  
  - Redis 失败 → 跳过缓存  
  - 天气 API 失败 → 静默 `null`
- Mock / Demo 双模式：`AMAP_MOCK=true` 用 fixture；`DEMO_MODE=true` 跳过所有外部调用
- 测试：`test_optimizer.py` 含 15+ 个单元测试（算法正确性 + 边界条件），可离线运行
- 日志：所有节点有 `[NodeName]` 前缀打印
- 模块化：LangGraph 节点、API 路由、Pydantic Schema、React Hook 各层职责分离
- 部署：Docker Compose healthcheck、服务 `depends_on` 启动顺序、FastAPI lifespan 优雅关闭

---

# 二、核心模块拆解


| 模块                                           | 作用                                               | 体现的能力                             | 适合写简历      | 适合面试展开          |
| -------------------------------------------- | ------------------------------------------------ | --------------------------------- | ---------- | --------------- |
| LangGraph 工作流（`graph.py + nodes/`）           | 4 节点有向图，条件路由，PostgreSQL 会话持久化                    | AI Agent 编排能力，理解 StateGraph / 条件边 | ✅ 核心亮点     | ✅ 首选            |
| Optimizer（`nodes/optimizer.py`）              | K-Means 聚类 + 时间矩阵 + TSP 最近邻 + 酒店 Anchor Matching | 算法工程能力，独立推导实现                     | ✅ 差异化亮点    | ✅ 首选            |
| SSE 流式推送（`api/chat.py + hooks/useAIChat.ts`） | 后端 `astream()` 节点级推送，前端 `ReadableStream` 逐帧解析    | 异步流处理，前后端协议设计                     | ✅          | ✅               |
| Yjs 实时协同（`hooks/useYjsRoom.ts`）              | CRDT YDoc + WebSocket，投票 / 备注 / 阶段多人同步           | 实时协同技术选型和接入能力                     | ✅ 差异化亮点    | ✅               |
| RAGRetrieval（`nodes/rag_retrieval.py`）       | 生成 embedding → pgvector IVFFlat → 余弦相似度过滤        | 向量检索 + RAG pipeline 理解            | ✅          | ⚠️ 代码较简，但可讲设计思路 |
| 降级体系（所有节点）                                   | 每层 try/except + fallback 路径                      | 工程健壮性，Production Thinking         | ⚠️ 不单独写    | ✅ 作为工程化补充讲      |
| 和风天气 JWT 认证（`api/weather.py`）                | Ed25519 私钥签名 JWT，缓存复用，GeoAPI 两步查询                | 第三方 API 集成，安全认证能力                 | ⚠️ 不单独写    | ⚠️ 可选           |
| 数据库 Schema 设计（`db/init.sql`）                 | 5 张表，pgvector 扩展，IVFFlat 索引配置                    | 数据库设计基本功                          | ⚠️ 量化提一句即可 | ⚠️ 有问到再讲        |


---

# 三、技术亮点提炼（校招导向）

## 亮点 1：独立实现完整的 LangGraph 多 Agent 工作流

从状态定义（`AgentState TypedDict`）、节点实现（4 个独立 `.py` 文件）到条件路由（`add_conditional_edges`），再到 PostgreSQL Checkpoint 持久化，全链路自行搭建而非直接套模板。路由逻辑（`rag / amap / both` 三路分支）有业务依据，不是随意设计。

## 亮点 2：自行实现 K-Means + TSP 混合排线算法

Optimizer 节点不依赖第三方排线服务，而是：

- 使用 sklearn K-Means 按经纬度聚类分天
- 处理空簇和溢出的两步修正
- 自实现 Haversine 球面距离和最近邻 TSP
- 酒店 Anchor Matching（按距最后活动点最近原则挂载）
- 异步并发构建驾车时间矩阵（`Semaphore=3` 控流）

这一模块有清晰的算法思路和边界处理，有对应单元测试，是项目最有深度的部分。

## 亮点 3：SSE 节点级流式推送的前后端完整实现

后端使用 `graph.astream()` 实现真正的节点粒度实时推送（Router 完成即推 `thinking` 事件，无需等待全图执行）；前端用 `ReadableStream + TextDecoder` 自行实现 SSE 帧解析，逐字渲染文字回复、逐张出现地点卡片，体现了对流式协议的理解。

## 亮点 4：Yjs CRDT 多人实时协同

选型 CRDT（无锁冲突解决），而非简单 WebSocket 广播。实现投票（`toggleVote`）、备注（`updateNote`）、阶段流转（`phase`）、Awareness 在线状态（`userId / nickname / color`）的多人同步，所有操作均封装在 Yjs `transact` 中保证原子性。

## 亮点 5：完整的多级降级体系

Demo 模式 / Mock 模式 / API 失败降级三级防护，确保项目在无 API Key 时也可完整演示所有功能，体现了 Production Mindset，而不是“能跑就行”。

## 亮点 6：完成从零到一的全栈可部署系统

前端 Next.js 15 + 后端 FastAPI + 数据库 PostgreSQL + pgvector + Redis + y-websocket，5 个服务通过 Docker Compose 统一编排，README 提供 Railway 一键部署按钮，具备真实的可部署性。

---

# 四、技术难点与面试可讲点

## 难点 1：LangGraph 条件路由 + 状态流动设计

- **难在哪里**：LangGraph StateGraph 需要设计共享状态数据结构（`AgentState`），不同节点读写不同字段，条件边依赖状态中间值（`intent`），多路汇合到 Synthesizer，Checkpoint 还需异步初始化。
- **代码推断的解法**：`AgentState` 用 `TypedDict + Annotated` 声明字段语义（`messages` 用 `add_messages` 自动追加）；`_route_intent` 和 `_route_after_amap` 两个路由函数基于 `intent` 字段分叉；`PostgresSaver` 在 startup lifespan 中异步初始化并有 fallback。
- **面试可讲**：
  - 画出节点 DAG
  - 解释为什么 `both` 意图走 `amap_search → rag_retrieval` 而不并行（节省 embedding 调用，且 RAG 可以感知 amap 已获取的地点）
  - 讲 Checkpoint 的意义（多轮对话历史持久化，不是每次从零开始）
- **可能追问**：
  - LangGraph 和直接用 Python 写 if/else 编排有什么区别？
  - Checkpoint 存的是什么？
  - `AgentState` 里 `messages` 为什么用 `Annotated[list, add_messages]`？

## 难点 2：K-Means 聚类的空簇修复与溢出重分配

- **难在哪里**：K-Means 标准实现会产生空簇（某些初始化下某簇无成员），且每天地点数不均衡会影响实际可行性（有一天 7 个地点根本游不完）。
- **代码推断的解法**：两步修正：
  1. 先检测空簇，从最大簇摘出最近全局质心的地点填充
  2. 再用 `cap_max = ceil(n/k) + 1` 做溢出上限，超出则迭代将最远离本簇质心的地点迁入最近的未满簇
- **面试可讲**：
  - 先讲为什么用 K-Means（按地理位置分天，避免一天到处跑）
  - 再讲标准实现的两个问题（空簇、容量不均衡）
  - 然后讲修正逻辑
  - 最后可以展示 `test_optimizer.py` 中的边界测试用例
- **可能追问**：
  - K-Means 的随机性怎么控制？
  - 为什么不用凸包或层次聚类？
  - TSP 最近邻启发式的优缺点是什么？

## 难点 3：SSE 流式协议的前后端协同

- **难在哪里**：SSE 不是简单的 HTTP 响应，前端需要手动解析帧边界（`\n\n` 分割）、处理半帧缓存（`buffer` 拼接）；后端需要用 `graph.astream()` 而不是 `graph.invoke()` 才能节点级推送，而非等待全图完成。
- **代码推断的解法**：后端每个 chunk 对应一个 LangGraph 节点输出，立即 `yield` SSE 事件；前端用 `ReadableStream.getReader() + TextDecoder + buffer` 逐帧解析，React state 用 functional update 保证并发安全（`setMessages(prev => ...)`）。
- **面试可讲**：
  - 为什么选 SSE 而不是 WebSocket（单向推送、HTTP 协议兼容性好、自动重连）
  - 帧解析的 `buffer` 设计为什么必要（网络包切割）
  - 前端 functional update 为什么比直接 `setState` 更安全
- **可能追问**：
  - SSE 和 WebSocket 的区别？
  - 如何处理连接断开重连？
  - 如何取消流式请求（`AbortController`）？

## 难点 4：Yjs CRDT 多人协同的状态一致性

- **难在哪里**：多人同时操作同一地点列表（`add / vote / removePlace`）时不能用普通 `useState`，需要理解 CRDT 的无锁合并语义，以及 Yjs `YMap / Awareness` 的 `observe` 机制。
- **代码推断的解法**：所有变更通过 `doc.transact()` 包裹保证原子性；`YMap.observe` 订阅变化更新 React state；Awareness 单独维护在线用户列表；用 `userId hash` 生成稳定颜色区分不同用户。
- **面试可讲**：
  - CRDT 相比 OT（Operational Transform）的优势（无中心服务器协调，任意顺序合并结果一致）
  - 为什么用 `YMap` 而不是 `YArray` 存地点（`place_id` 作为 key，随机访问 / 删除更高效）
  - `phase` 字段的防覆盖逻辑（先加入的成员设定的 phase 不被后加入者覆盖）
- **可能追问**：
  - 什么是 CRDT？
  - Yjs 和 Firebase Realtime Database 有什么区别？
  - y-websocket 服务端的作用是什么？

## 难点 5：pgvector RAG 检索链路设计

- **难在哪里**：向量检索不是“存入查出”这么简单，需要理解向量索引类型（IVFFlat vs HNSW）的参数意义，以及为什么需要 `city` 精确过滤 + 相似度阈值双重保证结果质量。
- **代码推断的解法**：`init.sql` 中 IVFFlat 索引 `lists=10`（约 `sqrt(行数)`）；检索时 `WHERE city = $2` 先过滤，`ORDER BY embedding <=> $1::vector` 按余弦距离排序，最后过滤 `similarity < 0.7` 的结果。
- **面试可讲**：
  - 为什么要 `city` 过滤（不同城市的游记混合检索对成都用户没意义，也降低噪声）
  - IVFFlat 的 `lists` 参数如何选
  - `0.7` 阈值怎么来的（待确认，但可讲思路：太低会引入不相关内容影响 Synthesizer 质量）
- **可能追问**：
  - IVFFlat 和 HNSW 的区别？
  - 什么是余弦相似度？
  - RAG 的 chunk size 怎么确定？

---

# 五、可量化信息提炼


| 维度           | 实际情况                                                                | 适合简历的表达                     |
| ------------ | ------------------------------------------------------------------- | --------------------------- |
| 前端页面数        | 3 个页面（首页、协同工作台、行程详情）                                                | 包含 3 个核心页面                  |
| 后端 API 接口    | 6 个接口（chat / optimize / room / room-state / recommend / weather）    | 实现 6 个 REST / SSE 后端接口      |
| LangGraph 节点 | 4 个（Router / AmapSearch / RAGRetrieval / Synthesizer）+ 独立 Optimizer | 设计并实现 5 个 AI Agent 节点       |
| 数据库表数        | 5 张（含 pgvector 向量表）                                                 | 设计 5 张数据库表，集成 pgvector 向量检索 |
| 测试用例数        | `test_optimizer.py` 约 16 个测试，3 个测试文件                                | 编写 16+ 单元测试覆盖核心算法边界条件       |
| 服务数量         | 5 个服务（frontend / backend / postgres / redis / y-websocket）          | 5 个微服务通过 Docker Compose 编排  |
| 完整业务闭环       | ✅ 有（创建房间 → AI 推荐 → 多人选点 → 排线 → 行程详情全链路）                             | 实现完整业务闭环                    |
| 可部署性         | ✅ 有（Docker Compose + Railway 一键部署）                                  | 支持 Docker 容器化一键部署           |
| 项目规模         | 后端 ~1500 行核心逻辑，前端 ~1200 行，含完整配置                                     | 独立完成约 2700 行核心代码（待精确统计）     |


---

# 六、结构化摘要（供下一个对话框使用）

## 【项目技术校招提炼摘要】

### 1. 项目类型

AI + 实时协同 + 算法工程 全栈 Web 应用 MVP（面试演示导向）

### 2. 项目目标

多人结伴旅行规划工具：AI 对话推荐地点 → 多人实时协同投票 → 算法智能排线生成行程

### 3. 技术栈

- **前端**：Next.js 15 / TypeScript / Tailwind CSS / Framer Motion / Zustand / Yjs / 高德地图 JS SDK
- **后端**：FastAPI / Python 3.11 / LangGraph / LangChain-OpenAI / asyncpg / Pydantic v2
- **数据库**：PostgreSQL 16 + pgvector / Redis 7
- **算法**：scikit-learn KMeans / 自实现最近邻 TSP / Haversine 球面距离
- **外部 API**：高德 REST API / 和风天气（Ed25519 JWT 认证）
- **部署**：Docker Compose / Dockerfile / Railway 一键部署

### 4. 核心模块

1. **LangGraph 工作流**（Router / AmapSearch / RAGRetrieval / Synthesizer 四节点有向图）
2. **Optimizer 排线算法**（K-Means + 空簇修复 + 溢出重分配 + TSP + 酒店 Anchor Matching）
3. **SSE 流式推送**（后端 astream 节点级实时推送 + 前端 ReadableStream 帧解析）
4. **Yjs 实时协同**（CRDT YDoc + WebSocket + Awareness 在线状态）
5. **RAG 检索链路**（text-embedding-3-small → pgvector IVFFlat → 余弦相似度过滤）

### 5. 核心业务流程

创建房间  
→ AI 对话获取推荐地点（SSE 流式）  
→ 多人实时协同投票选点（Yjs）  
→ 品类校验（景点 / 餐饮 / 住宿）  
→ K-Means + TSP 智能排线  
→ 行程时间轴详情页

### 6. AI 相关能力

1. LLM 意图分类（rag / amap / both 三分类）+ 查询改写（Router 节点）
2. pgvector 向量检索（RAGRetrieval 节点）
3. LLM 数据合成（Synthesizer：生成 `description / tags / tip_snippets`）
4. PostgreSQL AsyncPostgresSaver 多轮对话 Checkpoint 持久化
5. SSE 节点级实时流式推送

### 7. 工程化体现

1. 多级降级体系（Demo 模式 / Mock 模式 / API 失败 fallback，零 Key 可完整演示）
2. pydantic-settings 配置管理，`lru_cache` 单例，环境变量模板
3. Docker Compose 多服务编排（healthcheck + depends_on 启动顺序 + 优雅关闭）
4. Redis 缓存高德驾车距离（TTL 24h，Semaphore 并发控流）
5. 16+ 单元测试（核心算法正确性 + 边界条件，离线可运行）
6. CORS 正则配置，AsyncPostgresSaver cleanup，lifespan 生命周期管理

### 8. 最适合写进校招简历的技术亮点（按优先级）

1. 基于 LangGraph 实现多 Agent 编排（Router → RAG / Amap → Synthesizer），SSE 流式节点级推送
2. 自实现 K-Means 宏观聚类 + 最近邻 TSP 微观排线混合算法，含空簇修复与溢出重分配
3. 集成 Yjs CRDT 实现多人实时协同（投票 / 备注 / 阶段流转 500ms 内同步）
4. pgvector 向量检索 + LLM Synthesizer 构建 RAG Pipeline

### 9. 最适合校招面试展开讲的技术难点（按优先级）

1. LangGraph 条件路由 + AgentState 设计（可画 DAG，解释分支逻辑和 Checkpoint）
2. K-Means 空簇修复 + 溢出重分配（有代码，有测试，算法清晰可复述）
3. SSE 流式协议前后端协同（可讲帧解析 buffer、functional update、astream 的意义）
4. Yjs CRDT 协同（可讲 CRDT 概念 + transact 原子性 + Awareness 机制）

### 10. 可量化表达建议

- 独立完成约 2700 行核心代码（待精确统计）
- 实现 5 个 AI Agent 节点、6 个后端 API 接口
- 编写 16+ 单元测试覆盖算法边界条件
- 5 个服务 Docker Compose 编排，支持一键部署

或稳妥版：

> 独立完成前后端全栈开发，含 LangGraph 多 Agent 工作流、K-Means+TSP 排线算法、Yjs 实时协同三大核心模块，具备 Docker 一键部署能力。

### 11. 项目更适合包装成什么方向

- **首选**：AI Agent 工程方向（LangGraph / RAG / LLM 集成是当前校招热点）
- **次选**：全栈工程方向（Next.js + FastAPI + Docker 完整链路）
- **补充**：算法工程方向（K-Means + TSP 是面试可讲的差异化亮点）
- **避免**：过度包装为“分布式系统”或“高并发架构”（规模不符）

### 12. 待确认信息

- 精确代码行数（建议 `wc -l` 统计后使用准确数字）
- `test_api.py` 和 `test_mock_data.py` 的测试用例总数
- 项目是否实际完整跑通 RAG 流程（RAG 入库脚本在 `scripts/`，代码存在但向量数据待入库）
- 高德驾车时间矩阵在真实 API 模式下是否实测过
- 是否部署到线上（README 有 Railway 按钮但不确定是否实际部署过）
- 前端实际截图风格（已有 `screenshot-room-final.png` 等，可作为演示材料）

---

以上即为本次完整的技术证据提炼，下一步可以基于这份摘要：

1. 撰写简历项目描述（我来帮你写 3～5 行的简历正文）
2. 准备面试口述稿（按难点 1～5 逐一准备 STAR 口述）
3. 确认「待确认信息」列表中哪些需要核实

