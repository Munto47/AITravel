"""
LangGraph 主图定义

结构：
  Router → (conditional) → AmapSearch → (conditional) → RAGRetrieval → Synthesizer
                        → RAGRetrieval → Synthesizer

路由逻辑：
- intent=amap  → router → amap_search → synthesizer
- intent=rag   → router → rag_retrieval → synthesizer
- intent=both  → router → amap_search → rag_retrieval → synthesizer

Optimizer 不在此图中，通过 POST /api/optimize 独立触发。
"""

from langgraph.graph import StateGraph, END

from app.agents.state import AgentState
from app.agents.nodes import router, amap_search, rag_retrieval, synthesizer
from app.config import settings
from app.db.dsn import langgraph_postgres_dsn


def _route_intent(state: AgentState) -> str:
    """Router 节点后的条件路由：根据 intent 决定进入哪个检索节点"""
    intent = state.get("intent", "amap")
    if intent == "rag":
        return "rag_retrieval"
    # amap 和 both 都先走 amap_search
    return "amap_search"


def _route_after_amap(state: AgentState) -> str:
    """AmapSearch 节点后的条件路由：both 意图继续走 RAG，否则直接到 Synthesizer"""
    intent = state.get("intent", "amap")
    if intent == "both":
        return "rag_retrieval"
    return "synthesizer"


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

    # Router → AmapSearch / RAGRetrieval（amap/both 走 amap，rag 走 rag）
    g.add_conditional_edges(
        "router",
        _route_intent,
        {
            "amap_search": "amap_search",
            "rag_retrieval": "rag_retrieval",
        },
    )

    # AmapSearch → RAGRetrieval（both 意图）/ Synthesizer（amap 意图）
    g.add_conditional_edges(
        "amap_search",
        _route_after_amap,
        {
            "rag_retrieval": "rag_retrieval",
            "synthesizer": "synthesizer",
        },
    )

    # RAGRetrieval → Synthesizer（rag 和 both 意图都从这里汇入）
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

        # AsyncPostgresSaver 需要 postgresql:// 格式（保留 sslmode 等参数供 psycopg 使用）
        dsn = langgraph_postgres_dsn(settings.database_url)
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
