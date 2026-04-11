"""
POST /api/chat - 对话接口（SSE 流式响应）

当前实现：同步版，返回 JSON（Sprint 6 升级为真实 SSE 流）
完整 SSE 事件格式见 B.5 规格文档。
"""

import json
import time
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage

from app.agents.graph import get_graph_with_persistence
from app.schemas.api import ChatRequest
from app.config import settings

router = APIRouter()


async def _event_stream(request: ChatRequest):
    """生成 SSE 事件流"""
    graph = await get_graph_with_persistence()
    config = {"configurable": {"thread_id": request.thread_id}}

    start_time = time.time()

    # 构建初始状态
    input_state = {
        "messages": [HumanMessage(content=request.message)],
        "thread_id": request.thread_id,
        "user_id": request.user_id,
        "trip_city": request.trip_city,   # 目的地城市，传递给 AmapSearch 节点
        "amap_places": [],
        "rag_chunks": [],
        "synthesized_places": [],
        "selected_place_ids": request.selected_place_ids,
        "intent": None,
        "query_rewrite": None,
        "itinerary": None,
        "final_response": None,
    }

    # 推送 thinking 事件（Router 开始）
    yield f"data: {json.dumps({'event': 'thinking', 'data': {'node': 'router', 'summary': '正在分析您的需求...', 'ms': 0}}, ensure_ascii=False)}\n\n"

    try:
        # TODO: Sprint 6 - 改为 graph.astream() 获取流式更新
        # 当前为同步调用，获取最终结果
        final_state = await graph.ainvoke(input_state, config=config)

        # 推送检索节点 thinking 事件
        intent = final_state.get("intent", "amap")
        if intent in ("amap", "both"):
            amap_count = len(final_state.get("amap_places", []))
            yield f"data: {json.dumps({'event': 'thinking', 'data': {'node': 'amap_search', 'summary': f'高德搜索到 {amap_count} 个地点', 'ms': int((time.time() - start_time) * 1000)}}, ensure_ascii=False)}\n\n"
        if intent in ("rag", "both"):
            rag_count = len(final_state.get("rag_chunks", []))
            yield f"data: {json.dumps({'event': 'thinking', 'data': {'node': 'rag_retrieval', 'summary': f'检索到 {rag_count} 条游记片段', 'ms': int((time.time() - start_time) * 1000)}}, ensure_ascii=False)}\n\n"

        yield f"data: {json.dumps({'event': 'thinking', 'data': {'node': 'synthesizer', 'summary': '正在整合数据，生成推荐...', 'ms': int((time.time() - start_time) * 1000)}}, ensure_ascii=False)}\n\n"

        # 推送地点事件
        places = final_state.get("synthesized_places", [])
        for place in places:
            yield f"data: {json.dumps({'event': 'place', 'data': {'place': place.model_dump()}}, ensure_ascii=False)}\n\n"

        # 推送文字回复
        response_text = final_state.get("final_response", "")
        if response_text:
            # 简单分词模拟流式（Sprint 6 替换为真实 LLM 流）
            for char in response_text:
                yield f"data: {json.dumps({'event': 'text', 'data': {'delta': char}}, ensure_ascii=False)}\n\n"

        # 推送完成事件
        total_ms = int((time.time() - start_time) * 1000)
        yield f"data: {json.dumps({'event': 'done', 'data': {'total_places': len(places), 'total_ms': total_ms}}, ensure_ascii=False)}\n\n"

    except Exception as e:
        yield f"data: {json.dumps({'event': 'error', 'data': {'message': str(e)}}, ensure_ascii=False)}\n\n"


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
