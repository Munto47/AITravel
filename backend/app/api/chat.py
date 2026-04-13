"""
POST /api/chat - 对话接口（SSE 流式响应）

使用 graph.astream() 实现真正的节点级流式推送：
每个 LangGraph 节点执行完毕后立即 yield thinking/place/text 事件，
用户可逐步看到 ThinkingSteps 亮起，而不是等待所有节点执行完毕。

SSE 事件格式见 MASTER_PRD.md § 4.8。
"""

import json
import time

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage

from app.agents.graph import get_graph_with_persistence
from app.schemas.api import ChatRequest

router = APIRouter()


async def _event_stream(request: ChatRequest):
    """生成 SSE 事件流（graph.astream 节点级实时推送）"""
    graph = await get_graph_with_persistence()
    config = {"configurable": {"thread_id": request.thread_id}}

    start_time = time.time()

    input_state = {
        "messages": [HumanMessage(content=request.message)],
        "thread_id": request.thread_id,
        "user_id": request.user_id,
        "trip_city": request.trip_city,
        "amap_places": [],
        "rag_chunks": [],
        "synthesized_places": [],
        "selected_place_ids": request.selected_place_ids,
        "intent": None,
        "query_rewrite": None,
        "itinerary": None,
        "final_response": None,
    }

    # Router 节点开始前立即推送，让前端感知到 AI 已开始工作
    yield _thinking("router", "正在分析您的需求...", 0)

    places: list = []
    response_text: str = ""

    try:
        async for chunk in graph.astream(input_state, config=config):
            elapsed = int((time.time() - start_time) * 1000)

            # chunk 格式：{ "node_name": state_patch_dict }
            if "router" in chunk:
                router_state = chunk["router"]
                intent = router_state.get("intent", "amap")
                # Router 完成，预告下一步
                if intent == "rag":
                    yield _thinking("router", "意图：检索游记经验", elapsed)
                elif intent == "both":
                    yield _thinking("router", "意图：综合检索（高德 + 游记）", elapsed)
                else:
                    yield _thinking("router", "意图：搜索高德地点", elapsed)

            elif "amap_search" in chunk:
                amap_state = chunk["amap_search"]
                count = len(amap_state.get("amap_places", []))
                yield _thinking("amap_search", f"高德搜索到 {count} 个地点", elapsed)

            elif "rag_retrieval" in chunk:
                rag_state = chunk["rag_retrieval"]
                count = len(rag_state.get("rag_chunks", []))
                yield _thinking("rag_retrieval", f"检索到 {count} 条游记片段", elapsed)

            elif "synthesizer" in chunk:
                synth_state = chunk["synthesizer"]
                places = synth_state.get("synthesized_places", [])
                response_text = synth_state.get("final_response", "")
                yield _thinking("synthesizer", f"整合完成，推荐 {len(places)} 个地点", elapsed)

                # 逐个推送地点（让前端卡片逐张出现）
                for place in places:
                    yield f"data: {json.dumps({'event': 'place', 'data': {'place': place.model_dump()}}, ensure_ascii=False)}\n\n"

                # 逐字推送文字回复
                for char in response_text:
                    yield f"data: {json.dumps({'event': 'text', 'data': {'delta': char}}, ensure_ascii=False)}\n\n"

        total_ms = int((time.time() - start_time) * 1000)
        yield f"data: {json.dumps({'event': 'done', 'data': {'total_places': len(places), 'total_ms': total_ms}}, ensure_ascii=False)}\n\n"

    except Exception as e:
        yield f"data: {json.dumps({'event': 'error', 'data': {'message': str(e)}}, ensure_ascii=False)}\n\n"


def _thinking(node: str, summary: str, ms: int) -> str:
    return f"data: {json.dumps({'event': 'thinking', 'data': {'node': node, 'summary': summary, 'ms': ms}}, ensure_ascii=False)}\n\n"


@router.post("/chat")
async def chat(request: ChatRequest):
    """
    AI 对话接口，返回 SSE 流式响应。

    事件类型：
    - thinking: {node: str, summary: str, ms: int}
    - place:    {place: Place}
    - text:     {delta: str}
    - done:     {total_places: int, total_ms: int}
    - error:    {message: str}
    """
    return StreamingResponse(
        _event_stream(request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
