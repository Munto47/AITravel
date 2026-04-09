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


# 无持久化的简单图（开发/测试用）
simple_graph = build_graph()


async def get_graph_with_persistence():
    """
    获取带 PostgreSQL 持久化的图（生产用）
    TODO: Sprint 1 - 配置 AsyncPostgresSaver

    from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
    from app.config import settings

    async with AsyncPostgresSaver.from_conn_string(
        settings.database_url.replace("+asyncpg", "")  # psycopg2 格式
    ) as saver:
        await saver.setup()
        return build_graph(saver)
    """
    # 当前返回无持久化图，Sprint 1 替换
    return simple_graph
