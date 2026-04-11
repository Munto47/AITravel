from typing import TypedDict, Annotated, Optional
from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages

from app.schemas.place import Place
from app.schemas.itinerary import Itinerary


class AgentState(TypedDict):
    """LangGraph 状态机的核心数据主干，所有节点共享读写此 State"""

    # 对话历史（LangGraph 原生消息追加，不需要手动管理列表）
    messages: Annotated[list[BaseMessage], add_messages]

    # 会话标识
    thread_id: str
    user_id: str

    # 房间目的地城市（从 ChatRequest 传入，确保正确的城市上下文）
    trip_city: Optional[str]        # 如 "成都"、"北京"

    # Router 节点输出
    intent: Optional[str]           # "rag" | "amap" | "both"
    query_rewrite: Optional[str]    # 改写后的查询，更适合检索

    # 各检索节点输出
    amap_places: list[Place]        # 高德 API 返回的候选地点
    rag_chunks: list[dict]          # RAG 检索返回的原始 chunk 列表
    #   chunk 结构: {content, place_ids, note_id, similarity}

    # Synthesizer 输出
    synthesized_places: list[Place]

    # Optimizer 输出（通过 /api/optimize 独立触发，不在主 chat 图中）
    itinerary: Optional[Itinerary]

    # 最终回复文本（Synthesizer 写入）
    final_response: Optional[str]

    # 前端传入的已选地点 ID（影响 Synthesizer 优化推荐质量）
    selected_place_ids: list[str]
