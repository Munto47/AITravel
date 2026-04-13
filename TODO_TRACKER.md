# TODO_TRACKER.md — 项目进度追踪看板

> 基于 2026-04-12 全量代码审计生成，反映代码库真实状态。

---

## 1. 当前里程碑 (Current Milestone)

**核心链路已全部跑通，进入体验打磨与演示准备期。**

后端完成度 ~98%，前端完成度 ~99%，基础设施完成度 ~95%。LangGraph 多 Agent 编排、Yjs CRDT 协同、K-Means + TSP 排线三大核心亮点均已完整实现。唯一的功能性缺口是 SSE 流式推送使用 `ainvoke` 同步调用后模拟逐字输出，尚未升级为 `graph.astream()` 真正流式。

---

## 2. 任务看板 (Task Board)

### 2.1 Backend (后端/算法)

- [x] LangGraph StateGraph 主图构建（4 节点 + 条件路由 + PostgresSaver 持久化）
- [x] Router 节点 — 真实 LLM 意图分类（Anthropic → OpenAI 兼容 → Demo 三级降级）
- [x] AmapSearch 节点 — Mock + 真实高德 POI API 双模式 + 三层降级防护
- [x] RAGRetrieval 节点 — pgvector 向量检索（text-embedding-3-small，余弦相似度，阈值 0.7）
- [x] Synthesizer 节点 — LLM 合成 Place 列表 + 自然语言回复（含 JSON 容错解析）
- [x] Optimizer 节点 — K-Means 聚类 + 高德驾车距离矩阵 + 最近邻 TSP + 时间表生成 + 酒店挂载
- [x] 和风天气 API 集成（3 天内预报填充 weather_summary）
- [x] Redis 缓存高德驾车距离（TTL 24h，Semaphore=1 并发控制）
- [x] `/api/chat` SSE 流式端点（thinking / place / text / done / error 五种事件）
- [x] `/api/optimize` 排线端点（同步 JSON 响应）
- [x] `/api/recommend` 城市初始推荐端点（按品类分组）
- [x] `/api/room` 房间 CRUD + `/api/user` 用户注册查询
- [x] asyncpg 连接池 + pgvector 自动注册
- [x] PostgreSQL Checkpointer 会话持久化（跨设备续航）
- [x] `ingest_notes.py` RAG 入库脚本（LLM 生成 80 篇游记 → Entity Linking → 分块 → Embedding → pgvector）
- [x] 测试套件 — 52+ 测试用例（test_api / test_optimizer / test_mock_data），可离线运行
- [ ] **SSE 真流式升级** — 将 `chat.py` 中 `graph.ainvoke()` 替换为 `graph.astream()`，实现 LangGraph 节点级实时推送

### 2.2 Frontend (前端/UI)

- [x] 首页 — 创建/加入房间（昵称 + 城市 + 天数，Framer Motion 动画）
- [x] 房间主页三层架构 — Layer 0 全屏地图 + Layer 1 浮面板 Overlay（TopNav / ChatPanel / PlaceList）
- [x] 行程详情页 — 时间轴 + 交通段 + 天气卡片 + 概览 Banner
- [x] ChatPanel — 消息列表 + 快捷提问 + 输入框（Enter 发送 / Shift+Enter 换行）+ 流式状态
- [x] MessageItem — 用户/AI 气泡 + AI 推荐地点卡片（渐入动画）+ 错误提示 + 加载动画
- [x] ThinkingSteps — Agent 思考链可视化（router/rag/amap/synthesizer，可展开/折叠，耗时展示）
- [x] PlaceList — 候选/路线双 Tab + 三大板块分类（美景/美食/美梦）+ 投票排序
- [x] PlaceCard — 图片 + 评分 + 心形投票 + 成员头像组 + 标签 + RAG 避坑提示 + 删除
- [x] TopNav — Logo + AI 顾问开关 + 房间号复制 + 在线成员头像 + 智能排线按钮（禁用条件完整）
- [x] GlassPanel — 可复用玻璃拟物态容器
- [x] useYjsRoom — 完整 Yjs 协同（addPlace / removePlace / toggleVote / updateNote / setPhase / Awareness）
- [x] useAIChat — SSE 流式解析（Reader + TextDecoder + 帧分割 + AbortController）
- [x] useOptimize — 排线请求 + Itinerary localStorage 持久化
- [x] Zustand roomStore — 本地 UI 状态（isChatOpen / rightTab / hoveredPlaceId / selectedPlaceId）
- [x] TypeScript 类型系统 — place.ts / itinerary.ts / room.ts / chat.ts + 蛇形↔驼峰转换函数
- [x] 设计系统 — 珊瑚红 coral 色阶 + 玻璃拟物态 + Framer Motion 动画 + 自定义阴影/模糊/圆角
- [ ] **地图 Marker ↔ 面板联动** — Marker 点击后右侧面板高亮 + 滚动到对应卡片
- [ ] **移动端响应式适配** — ChatPanel(380px) / PlaceList(360px) 固定宽度在小屏幕溢出
- [ ] **图片 lazy loading** — PlaceCard 中 img 无 `loading="lazy"` 和 blur placeholder

### 2.3 Map & Data (地图与可视化)

- [x] AMap JS SDK 2.0 初始化（@amap/amap-jsapi-loader + 安全码配置）
- [x] 自定义 HTML Marker（泪滴形 + emoji icon + 颜色映射 clusterId / votedBy 状态）
- [x] Marker 点击 → InfoWindow（图片 + 评分 + 价格 + RAG 提示）
- [x] AMap.Driving 多天路线绘制（Promise.all 并行 + 600ms 错开避 QPS 限制）
- [x] 动态 Polyline 多色渲染（ROUTE_COLORS 数组，每天一色 + 方向箭头 + 平滑圆角）
- [x] 视野自适应 setFitView（Marker 渲染 + 路线绘制完成后各自适应）
- [x] 城市中心坐标预设（成都/北京/上海/厦门等）
- [x] 内存安全 — destroyed flag 防泄漏 + marker/polyline 清理
- [x] Mock 数据 — 4 城市 x 8 地点 fixture（`amap_mock_places.json`，含坐标/评分/图片）
- [ ] **Marker 悬浮联动** — 鼠标悬浮 Marker 时右侧面板对应卡片高亮

### 2.4 Infrastructure (基础设施)

- [x] docker-compose.yml — 4 服务编排（postgres + redis + y-websocket + backend），healthcheck + depends_on
- [x] backend/Dockerfile — Alpine 基础镜像 + 完整编译工具链（gcc/openblas/lapack）
- [x] y-websocket/Dockerfile — node:18-alpine + npm y-websocket@^2 + 内嵌 server.js
- [x] frontend/Dockerfile — node:20-alpine 基础构建（开发模式）
- [x] .env.example — 完整环境变量模板（LLM / 高德 / 天气 / Docker 镜像加速 / 数据库）
- [x] frontend/.env.local — 前端三个环境变量（API_URL / Y_WEBSOCKET_URL / AMAP_JS_KEY + 安全码）
- [x] init.sql — 5 张表 + 2 个扩展（uuid-ossp / pgvector）+ 2 个索引（city / IVFFlat 向量）
- [x] requirements.txt — 36 个 Python 包，覆盖全栈依赖
- [x] config.py — pydantic BaseSettings + @lru_cache 单例 + env_file 加载
- [x] main.py — FastAPI lifespan（asyncpg 连接池 + PostgresSaver 初始化 + 异常回退 + 清理）
- [x] CORS 中间件 — localhost:* 跨域支持
- [ ] **frontend Dockerfile 优化** — 当前无多阶段构建，生产镜像包含 devDependencies
- [ ] **冗余 Dockerfile 清理** — `docker/y-websocket/Dockerfile` 与 `y-websocket/Dockerfile` 重复
- [ ] **数据库索引补充** — travel_notes 缺 city 索引，rooms 缺 updated_at 索引

---

## 3. 待解决的 Bug 与技术债务 (Issues & Tech Debt)

### 代码层面

| # | 类型 | 位置 | 描述 |
|---|------|------|------|
| 1 | 陈旧注释 | `backend/app/db/connection.py:4` | `TODO (Sprint 1): 配置 asyncpg 连接池` — 已实现，注释过期 |
| 2 | 陈旧注释 | `backend/app/api/optimize.py:23` | `TODO (Sprint 4): 接入高德距离矩阵 API` — 已在 optimizer.py 完成 |
| 3 | 真实 TODO | `backend/app/api/chat.py:51` | `TODO: Sprint 6 - 改为 graph.astream()` — 唯一未完成的功能性 TODO |
| 4 | 重复配置 | `.env.example:3,8` | `OPENAI_API_KEY` 定义了两次，疑似笔误 |
| 5 | 冗余文件 | `docker/y-websocket/Dockerfile` | 与 `y-websocket/Dockerfile` 功能重复，docker-compose 未引用此文件 |

### 架构层面

| # | 类型 | 描述 |
|---|------|------|
| 6 | 性能瓶颈 | Optimizer 距离矩阵在地点 >15 个时为顺序请求高德 API（Semaphore=1），耗时线性增长 |
| 7 | 硬编码 | 数据库连接池大小（min=2, max=10）硬编码在 connection.py，非可配置 |
| 8 | 硬编码 | CORS allow_origin_regex 硬编码在 main.py，无法通过环境变量调整 |
| 9 | 文档过期 | BASIC_FINISHED.md 第九节"待完成项"中多项已完成（如距离矩阵、天气集成），但文档未更新 |
| 10 | 文档过期 | CLAUDE.md"当前实现状态"部分仍描述为"骨架已完成"，与实际完成度不符 |

### 前端体验层面

| # | 类型 | 描述 |
|---|------|------|
| 11 | UX 缺陷 | ChatPanel(380px) / PlaceList(360px) 固定宽度，移动端/小屏幕可能溢出 |
| 12 | 性能 | PlaceCard 图片无 `loading="lazy"`，大量地点时影响首屏加载 |
| 13 | 缺失功能 | PlaceList 无搜索框，仅有分类 Tab 筛选，地点多时查找不便 |
| 14 | 缺失联动 | 地图 Marker 点击/悬浮与右侧面板卡片无联动（高亮 + 滚动） |

---

## 4. 优先级排列的后续清单 (Priority Backlog)

### P0 — 演示阻塞级（直接影响面试演示效果）

| # | 任务 | 模块 | 预估工作量 | 说明 |
|---|------|------|-----------|------|
| 1 | **清理陈旧 TODO 注释 + 更新过期文档** | Backend / Docs | 30 min | 删除 connection.py 和 optimize.py 的过期 TODO；更新 BASIC_FINISHED.md 和 CLAUDE.md 使其与代码实况一致。面试官可能翻阅代码/文档，过期注释暴露项目管理混乱。 |
| 2 | **地图 Marker ↔ 右侧面板双向联动** | Frontend | 2-3h | Marker 点击 → 右侧面板滚动到对应 PlaceCard 并高亮；PlaceCard hover → 地图 Marker 弹起/变色。这是面试场景 2（协同选点）的关键交互闭环。 |

### P1 — 体验提升级（显著提升演示流畅度）

| # | 任务 | 模块 | 预估工作量 | 说明 |
|---|------|------|-----------|------|
| 3 | **SSE 真流式升级（ainvoke → astream）** | Backend | 3-4h | 将 `chat.py` 中 `graph.ainvoke()` 替换为 `graph.astream()`，实现 LangGraph 节点执行过程中实时推送 thinking 事件。当前用户需等待所有节点执行完毕才看到结果，升级后 ThinkingSteps 可逐步亮起，大幅提升"AI 在思考"的感知。 |
| 4 | **Optimizer 距离矩阵并发优化** | Backend | 2h | 地点 >6 个时，将 Semaphore 从 1 提升为 3-5，并行请求高德驾车 API。当前 15 个地点排线约需 30s+，优化后可降至 10s 以内。 |

### P2 — 锦上添花级（非演示阻塞，但提升专业度）

| # | 任务 | 模块 | 预估工作量 | 说明 |
|---|------|------|-----------|------|
| 5 | **前端 Dockerfile 多阶段构建 + 冗余文件清理** | Infra | 1h | 升级 frontend/Dockerfile 为多阶段构建（builder → runner），减小生产镜像体积；删除 `docker/y-websocket/Dockerfile` 冗余文件；修复 .env.example 重复定义。 |

---

*文档版本：1.0 | 审计日期：2026-04-12 | 基于 commit `4ebe51d`*
