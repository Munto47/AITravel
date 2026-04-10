"""
LangGraph 主图定义

结构：
  Router → (conditional) → AmapSearch / RAGRetrieval → Synthesizer → END

节点说明：
- router:        意图分类（rag / amap / both）
- amap_search:   高德 POI 搜索
- rag_retrieval: pgvector 游记检索
- synthesizer:   数据合并 + 回复生成

Optimizer 不在此图中，通过 POST /api/optimize 独立触发。
"""

from langgraph.graph import StateGraph, END

from app.agents.state import AgentState
from app.agents.nodes import router, amap_search, rag_retrieval, synthesizer
from app.config import settings


def _route_intent(state: AgentState) -> str:
    """条件路由：根据 Router 节点写入的 intent 决定下一步"""
    intent = state.get("intent", "amap")
    if intent == "rag":
        return "rag_retrieval"
    elif intent == "both":
        # 简化策略：both 时先走 amap，后续 Sprint 可改为并行分支
        return "amap_search"
    return "amap_search"


def build_graph(checkpointer=None):
    """构建并编译 LangGraph 图"""
    g = StateGraph(AgentState)

    # 注册节点
    g.add_node("router", router.run)
    g.add_node("amap_search", amap_search.run)
    g.add_node("rag_retrieval", rag_retrieval.run)
    g.add_node("synthesizer", synthesizer.run)

    # 入口
    g.set_entry_point("router")

    # 条件路由
    g.add_conditional_edges(
        "router",
        _route_intent,
        {
            "amap_search": "amap_search",
            "rag_retrieval": "rag_retrieval",
        },
    )

    # 两条路径都汇入 Synthesizer
    g.add_edge("amap_search", "synthesizer")
    g.add_edge("rag_retrieval", "synthesizer")

    # 结束
    g.add_edge("synthesizer", END)

    return g.compile(checkpointer=checkpointer)


# 无持久化的简单图（测试/fallback 用）
simple_graph = build_graph()

# ===== 持久化图单例 =====
# from_conn_string() 返回 async context manager，__aenter__ 才给真正的 saver
_cm = None           # 持有 context manager（for cleanup）
_checkpointer = None # 真正的 AsyncPostgresSaver 实例
_persistent_graph = None


async def init_persistent_graph():
    """
    在 FastAPI lifespan startup 中调用，初始化带 PostgreSQL Checkpointer 的图。
    setup() 会自动建 langgraph_checkpoints / langgraph_writes 等表（幂等）。
    """
    global _cm, _checkpointer, _persistent_graph

    try:
        from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

        # AsyncPostgresSaver 需要纯 postgresql:// 格式（移除 SQLAlchemy driver 前缀）
        dsn = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")
        _cm = AsyncPostgresSaver.from_conn_string(dsn)
        _checkpointer = await _cm.__aenter__()  # 拿到真正的 saver 实例
        await _checkpointer.setup()             # 建 langgraph_checkpoints 等表（幂等）
        _persistent_graph = build_graph(_checkpointer)
        print("[Graph] PostgreSQL Checkpointer 初始化成功，会话历史将持久化")
    except Exception as e:
        print(f"[Graph] Checkpointer 初始化失败，回退到无持久化模式：{e}")
        _persistent_graph = simple_graph


async def close_checkpointer():
    """在 FastAPI lifespan shutdown 中调用"""
    global _cm, _checkpointer
    if _cm:
        try:
            await _cm.__aexit__(None, None, None)
        except Exception:
            pass
        _cm = None
        _checkpointer = None


async def get_graph_with_persistence():
    """获取持久化图（startup 后可用）"""
    return _persistent_graph if _persistent_graph is not None else simple_graph
