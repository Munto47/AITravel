# AI 智能旅行协同规划系统

> 基于 LangGraph 多 Agent + Yjs CRDT 实时协同的旅行规划 MVP，用于求职面试演示。

---

## 项目简介

一个"多人协同的 AI 旅行规划助手"——用户在虚拟房间中一起选点，AI 整合**高德地图客观数据**与**游记主观经验**，自动生成最优化行程路线。

**核心亮点**（面试展示）：

1. **LangGraph 多 Agent 编排** — Router 意图分发 + RAG/Synthesizer 分层处理，可溯源的思考链
2. **Yjs CRDT 实时协同** — 前端无锁解决一致性问题，两标签 500ms 内同步
3. **K-Means + TSP 混合排线** — 按经纬度聚类每日行程 + TSP 最短路径，高德驾车时间估算

---

## 技术栈

| 层次 | 技术选型 |
|------|----------|
| 前端 | Next.js 15 + Tailwind CSS + Zustand + Yjs (WebSocket 协同) |
| 后端 | Python 3.11 + FastAPI + Redis（API 缓存）|
| AI 编排 | LangGraph + Anthropic Claude API |
| 数据库 | PostgreSQL 16 + pgvector（向量检索）|
| 外部 API | 高德地图（POI 搜索 / 距离矩阵）+ 和风天气 |
| 基础设施 | Docker Compose（postgres + redis + y-websocket + backend）|

---

## 快速启动

### 前置要求

- Docker & Docker Compose（运行后端服务）
- Node.js 18+（运行前端）
- Python 3.11+（可选，本地运行测试）

### 第一步：克隆并配置环境变量

```bash
git clone <your-repo-url>
cd agentTravel

# 复制示例配置
cp .env.example .env
```

> **DEMO_MODE 说明：** `.env` 中 `DEMO_MODE=true` + `AMAP_MOCK=true` 可在不配置任何 API Key 的情况下完整演示所有功能，使用本地 fixture 数据。

如需真实 API 调用，在 `.env` 中填写：

```env
ANTHROPIC_API_KEY=sk-ant-...     # Router / Synthesizer 节点
OPENAI_API_KEY=sk-...            # RAG Embedding（可选）
AMAP_API_KEY=your-rest-key       # 高德后端 REST API（Web服务类型）
```

前端高德地图 Key 已预置于 `frontend/.env.local`，无需额外配置。

### 第二步：启动后端服务（Docker）

```bash
# 首次启动（自动构建镜像）
docker-compose up -d --build

# 后续启动
docker-compose up -d
```

等待约 20-30 秒，4 个服务启动完成：

| 服务 | 地址 | 说明 |
|------|------|------|
| PostgreSQL + pgvector | `localhost:5432` | 数据库 + 向量检索 |
| Redis | `localhost:6379` | API 结果缓存 |
| y-websocket | `localhost:1234` | Yjs 实时协同 |
| FastAPI 后端 | `localhost:8000` | 核心业务 API |

验证后端是否就绪：

```bash
curl http://localhost:8000/health
# 返回：{"status":"ok","service":"agentTravel-backend"}
```

### 第三步：启动前端

```bash
cd frontend
npm install
npm run dev
```

访问 **http://localhost:3000**

---

## 功能演示

### 1. 创建协同房间

首页输入昵称 → 选择城市（成都 / 北京 / 上海 / 厦门）→ 设置天数 → 点击「创建协同房间」

复制 URL，在另一浏览器窗口打开，即可双人协同。

### 2. AI 对话获取地点推荐

在左侧聊天面板输入：

- "成都有哪些适合带老人去的景点？"
- "推荐几家特色火锅"
- "帮我规划 3 天亲子行程"

**面试亮点**：展开右侧「Agent 思考链」，实时观察 LangGraph 节点执行链：
`Router → AmapSearch → Synthesizer`

### 3. 实时多人协同选点

AI 返回地点自动进入工作台，勾选/取消地点，另一标签页 **500ms 内**同步（Yjs CRDT 无锁实现）。

### 4. 智能排线

选中 2 个以上地点 → 点击「智能排线」：
- K-Means 按经纬度聚类为每日簇
- TSP 最近邻启发式排序簇内地点
- 地图展示彩色路线连线（每天一种颜色）

点击「行程详情」查看完整时间轴（含出行时间 + 交通时长）。

---

## 项目结构

```
agentTravel/
├── backend/
│   ├── app/
│   │   ├── agents/           # LangGraph 图 + 各节点
│   │   │   ├── graph.py      # 主图定义 + PostgresSaver 持久化
│   │   │   ├── state.py      # AgentState TypedDict
│   │   │   └── nodes/        # router / amap_search / rag_retrieval / synthesizer / optimizer
│   │   ├── api/              # FastAPI 路由（chat / optimize / room）
│   │   ├── db/               # asyncpg 连接池 + init.sql（pgvector 建表）
│   │   └── schemas/          # Pydantic 数据模型（Place / Itinerary / API）
│   ├── tests/
│   │   ├── fixtures/
│   │   │   └── amap_mock_places.json  # 4 城市 × 8 地点 Mock 数据
│   │   ├── test_api.py        # API 集成测试（17 个）
│   │   ├── test_mock_data.py  # Fixture 完整性测试（13 个）
│   │   └── test_optimizer.py  # 算法单元测试（22 个）
│   └── scripts/
│       └── ingest_notes.py   # RAG 游记入库脚本
├── frontend/
│   ├── src/
│   │   ├── app/              # Next.js App Router（首页 / 房间 / 行程详情）
│   │   ├── components/       # React 组件（ChatPanel / PlaceCard / AMapContainer）
│   │   ├── hooks/            # useYjsRoom / useAIChat / useOptimize
│   │   ├── stores/           # Zustand UI 状态
│   │   └── types/            # TypeScript 类型 + API 数据转换
│   └── .env.local            # 前端环境变量（AMAP_JS_KEY 等）
├── y-websocket/
│   └── Dockerfile            # 基于 node:18-alpine 构建 y-websocket 服务
├── docker-compose.yml        # 一键启动 4 个后端服务
└── .env.example              # 环境变量模板
```

---

## 开发模式

### 后端热重载（代码改动实时生效）

```bash
# docker-compose 已挂载 ./backend:/app，后端服务自动热重载
docker-compose logs -f backend   # 查看实时日志
```

### 前端热重载

```bash
cd frontend && npm run dev   # http://localhost:3000
```

### 数据库管理

```bash
# 进入 PostgreSQL 控制台
docker-compose exec postgres psql -U postgres -d travel_agent

# 查看 LangGraph 会话检查点
SELECT thread_id, created_at FROM checkpoints ORDER BY created_at DESC LIMIT 10;

# 查看已入库的游记分块
SELECT city, count(*) FROM travel_notes_chunks GROUP BY city;
```

---

## 运行测试

无需 Docker / 外部 API，纯离线运行：

```bash
# 安装 Python 依赖
cd backend && pip install -r requirements.txt

# 运行全量测试（52 个）
python -m pytest backend/tests/ -v

# 分模块运行
python -m pytest backend/tests/test_optimizer.py -v   # 算法单元测试
python -m pytest backend/tests/test_api.py -v         # API 集成测试
python -m pytest backend/tests/test_mock_data.py -v   # Fixture 完整性测试
```

---

## 常见问题

**Q: `docker-compose up` 报 `y-websocket` 镜像拉取失败**
A: 已修复，`y-websocket/Dockerfile` 基于 `node:18-alpine` 本地构建，使用 `--build` 参数：
```bash
docker-compose up -d --build
```

**Q: 地图不显示**
A: 检查 `frontend/.env.local` 中 `NEXT_PUBLIC_AMAP_JS_KEY` 是否有效；控制台会提示 `[AMap] NEXT_PUBLIC_AMAP_JS_KEY 未配置`。

**Q: AI 回复为空**
A: 确认 `.env` 中 `DEMO_MODE=true` 和 `AMAP_MOCK=true`（默认开启），无需任何 API Key 即可完整演示。

**Q: RAG 游记数据为空**
A: RAG 数据需手动入库（可选，非演示必须）：
```bash
# 配置 OPENAI_API_KEY 后运行
cd backend && python -m scripts.ingest_notes
```

---

## 环境变量说明

| 变量 | 说明 | 必填 |
|------|------|------|
| `DEMO_MODE` | `true` 跳过 LLM 调用，返回预设数据 | 否（默认 false）|
| `AMAP_MOCK` | `true` 使用本地 fixture，不调用高德 API | 否（默认 true）|
| `ANTHROPIC_API_KEY` | Claude API Key（DEMO_MODE=false 时需要）| 否 |
| `OPENAI_API_KEY` | OpenAI Key（RAG Embedding / ingest_notes）| 否 |
| `AMAP_API_KEY` | 高德后端 REST API Key（Web服务类型）| 否 |
| `AMAP_JS_KEY` | 高德前端 JS SDK Key（已预置于 frontend/.env.local）| 否 |
| `QWEATHER_KEY` | 和风天气 Key（天气预报功能）| 否 |

---

## License

MIT
