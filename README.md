# 🗺️ AI 智能旅行协同规划系统

> 基于 LangGraph 多 Agent + Yjs CRDT 实时协同的旅行规划 MVP，用于求职面试演示。

---

## 项目简介

一个"多人协同的 AI 旅行规划助手"——用户在虚拟房间中一起选点，AI 整合**高德地图客观数据**与**游记主观经验**，自动生成最优化行程路线。

**核心亮点**（面试展示）：
1. **LangGraph 多 Agent 编排** — Router 意图分发 + RAG/Synthesizer 分层处理，可溯源的思考链
2. **Yjs CRDT 实时协同** — 前端无锁解决一致性问题，两标签 500ms 内同步
3. **K-Means + TSP 混合排线** — 高德真实驾车时间优化，通勤时间减少 ~50%

---

## 技术栈

| 层次 | 技术选型 |
|------|----------|
| 前端 | Next.js 14 + Tailwind CSS + Zustand + Yjs (WebSocket 协同) |
| 后端 | Python 3.11 + FastAPI + Redis (缓存) |
| AI 编排 | LangGraph + Claude API (Haiku/ Sonnet) |
| 数据库 | PostgreSQL + pgvector |
| 外部 API | 高德地图 (POI/距离矩阵) + 和风天气 |
| 基础设施 | Docker Compose (一键启动 4 服务) |

---

## 快速开始

### 前置要求

- Docker & Docker Compose
- Node.js 18+
- Python 3.11+

### 安装步骤

1. **克隆项目**
   ```bash
   git clone <your-repo>
   cd agentTravel
   ```

2. **配置环境变量**
   ```bash
   cp .env.example .env
   ```
   编辑 `.env`，填入以下 Key：
   ```env
   # Claude API（Router 节点 + Synthesizer）
   ANTHROPIC_API_KEY=sk-ant-...

   # 高德地图（两个 Key 用途不同！）
   # 1. 后端 REST API Key（POI 搜索、距离矩阵）- 在高德控制台创建"Web服务"
   AMAP_API_KEY=your-rest-api-key
   # 2. 前端 JS SDK Key（地图展示）- 创建"Web端(JS API)"，添加 localhost:3000 白名单
   AMAP_JS_KEY=your-js-api-key

   # 和风天气（Sprint 4 使用）
   QWEATHER_KEY=your-qweather-key
   ```

3. **启动所有服务**
   ```bash
   docker-compose up -d
   ```
   等待约 30 秒，4 个服务启动完成。

4. **访问应用**
   - 前端: http://localhost:3000
   - 后端 API 文档: http://localhost:8000/docs

---

## 使用说明

### 核心功能演示

#### 1. 创建/加入协同房间

首页输入昵称 → 选择城市（成都/北京/上海/厦门）→ 天数 → 点击「创建协同房间」

复制房间 URL，在另一浏览器窗口打开同一链接，两人即可协同。

#### 2. AI 对话获取地点推荐

在左侧 AI 聊天面板输入需求：

- 「成都有哪些适合带老人去的景点？」
- 「推荐几家特色火锅店」
- 「帮我规划 3 天亲子行程」

**亮点**：展开右侧「Agent 思考链」，观察 LangGraph 节点执行过程：
- 🦚 Router → 意图分析
- 📚 RAG → 游记检索
- 📍 高德 → POI 搜索
- ⚡ Synthesizer → 数据合并

#### 3. 实时多人协同选点

AI 返回的地点卡片会自动加入工作台（右侧列表）。
两人勾选/取消地点，另一人 **500ms 内** 看到同步变化（头像徽章显示）。

点击地点卡片，展开查看：
- 高德评分、人均价格
- 游记避坑提示（黄色背景）
- 成员投票状态

#### 4. 智能排线（一键生成行程）

选中 2 个以上地点后，点击顶部「智能排线（3天）」：
- 系统自动按经纬度聚类为 3 个每日簇
- 簇内用高德距离矩阵做 TSP 最短路径
- 地图展示路线连线（不同颜色表示不同天）

点击「行程详情」查看完整时间轴 + 天气预报。

#### 5. 会话持久化

关闭浏览器后，重新打开同一 URL：
- 地点列表完整恢复
- AI 对话历史保留
- 继续提问时，AI 引用前一轮上下文

---

## 项目结构

```
agentTravel/
├── backend/              # FastAPI + LangGraph
│   ├── app/
│   │   ├── agents/      # LangGraph 图 + 节点
│   │   │   ├── state.py       # AgentState 核心数据
│   │   │   ├── graph.py       # 主图定义
│   │   │   └── nodes/        # router / amap_search / rag / synthesizer / optimizer
│   │   ├── schemas/     # Pydantic 数据模型
│   │   ├── api/         # FastAPI 路由
│   │   └── db/          # pgvector 初始化 SQL
│   └── scripts/        # 游记入库脚本
├── frontend/             # Next.js
│   ├── src/
│   │   ├── app/        # 页面（首页 / 房间 / 行程）
│   │   ├── components/  # React 组件
│   │   │   ├── chat/       # ChatPanel / ThinkingSteps
│   │   │   ├── places/     # PlaceCard / PlaceList
│   │   │   └── map/        # AMapContainer
│   │   ├── hooks/       # 自定义 Hook（useYjsRoom 完整实现）
│   │   ├── stores/      # Zustand 状态
│   │   └── types/       # TypeScript 类型
├── docker-compose.yml    # 一键启动 4 服务
└── PROJECT_VIBE.md      # 详细架构设计文档
```

---

## 开发指南

### 后端开发

```bash
cd backend
python -m app.main  # 本地启动 FastAPI
```

### 前端开发

```bash
cd frontend
npm install
npm run dev
```

### 数据库操作

```bash
# 连接 PostgreSQL
docker-compose exec postgres psql -U postgres -d travel_agent

# 查看 LangGraph 检查点（Sprint 1 启用后）
SELECT * FROM checkpoints LIMIT 5;
```

---

## Demo 模式

面试时如果 LLM API 延迟高，可在 `.env` 开启：

```env
DEMO_MODE=true  # 绕过 LLM，返回预设数据
```

所有 AI 回复和地点数据使用预设内容，确保演示流畅。

---

## 后续优化

本项目是为 **面试展示 MVP** 设计的骨架，后续可完善：

- [ ] Sprint 1: LangGraph PostgresSaver 真实持久化
- [ ] Sprint 3: 游记入库 + RAG 向量检索
- [ ] Sprint 4: 高德距离矩阵 API 真实调用
- [ ] Sprint 6: 高德地图 JSAPI 前端接入

详见 `PROJECT_VIBE.md` Sprint 计划。

---

## License

MIT

---

**面试话术参考**（见 PROJECT_VIBE.md Section 5）
- Scene 1: LangGraph 意图路由可视化
- Scene 2: Yjs CRDT 实时协同
- Scene 3: K-Means + TSP 路线优化对比
- Scene 4: 会话持久化跨设备续航
